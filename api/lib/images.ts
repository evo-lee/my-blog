import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { createHash } from "node:crypto";
import { mkdir, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../queries/connection";
import { images } from "@db/schema";

// ── Config ──────────────────────────────────────────────────────────────

export const SIZES = [480, 960, 1920] as const;
export const FORMATS = ["avif", "webp", "jpeg"] as const;
export type ImageFormat = (typeof FORMATS)[number];

export const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
// SVG: XSS via inline scripts. GIF: animation semantics are out of scope for v1
// (sharp would silently flatten to a static first frame). HEIC/TIFF: licensing +
// decode reliability. Users can still embed external <img src="http://..."> via
// the fallback markdown renderer.

const HASH_LEN = 16;

function getMaxBytes(): number {
  return Number(process.env.UPLOAD_MAX_BYTES ?? 10 * 1024 * 1024);
}
function getMaxPixels(): number {
  return Number(process.env.IMG_MAX_PIXELS ?? 40_000_000);
}
export function getUploadDir(): string {
  return path.resolve(process.env.UPLOAD_DIR ?? "./uploads/img");
}

// ── Types ────────────────────────────────────────────────────────────────

export interface ImageVariant {
  width: number;
  format: ImageFormat;
  storageKey: string;
  bytes: number;
}

export interface ImageRef {
  hash: string;
  width: number;
  height: number;
  variants: ImageVariant[];
}

export interface StoredImage extends ImageRef {
  id: number;
  origName: string;
  origMime: string;
  origBytes: number;
  uploadedBy: number | null;
  createdAt: Date | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function parseVariants(json: string): ImageVariant[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as ImageVariant[]) : [];
  } catch {
    return [];
  }
}

function toStored(row: typeof images.$inferSelect): StoredImage {
  return {
    id: row.id,
    hash: row.hash,
    origName: row.origName,
    origMime: row.origMime,
    origBytes: row.origBytes,
    width: row.width,
    height: row.height,
    variants: parseVariants(row.variants),
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt instanceof Date ? row.createdAt : null,
  };
}

// Pick which widths to render for an image of native width `srcW`.
// Always include every preset that fits inside the source, plus the source
// width itself when it's smaller than the largest preset. We never upscale.
function pickTargetWidths(srcW: number): number[] {
  const max = SIZES[SIZES.length - 1];
  const picks = new Set<number>();
  for (const s of SIZES) if (s <= srcW) picks.add(s);
  if (srcW < max) picks.add(srcW);
  return [...picks].sort((a, b) => a - b);
}

async function encode(
  base: sharp.Sharp,
  width: number,
  format: ImageFormat,
): Promise<Buffer> {
  const pipeline = base
    .clone()
    .resize({ width, withoutEnlargement: true });
  if (format === "avif") return pipeline.avif({ quality: 60 }).toBuffer();
  if (format === "webp") return pipeline.webp({ quality: 80 }).toBuffer();
  return pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}

async function writeVariant(
  dir: string,
  storageKey: string,
  buf: Buffer,
): Promise<void> {
  const finalPath = path.join(dir, storageKey);
  const tmpPath = `${finalPath}.tmp`;
  await writeFile(tmpPath, buf);
  await rename(tmpPath, finalPath);
}

async function cleanupVariants(
  dir: string,
  storageKeys: string[],
): Promise<void> {
  await Promise.allSettled(
    storageKeys.flatMap((k) => [
      unlink(path.join(dir, k)),
      unlink(path.join(dir, `${k}.tmp`)),
    ]),
  );
}

// ── DB ────────────────────────────────────────────────────────────────

export async function findImageByHash(hash: string): Promise<StoredImage | null> {
  const db = getDb();
  const rows = await db.select().from(images).where(eq(images.hash, hash)).limit(1);
  return rows.length > 0 ? toStored(rows[0]!) : null;
}

export async function listImages(): Promise<StoredImage[]> {
  const db = getDb();
  // Break ties with id desc — created_at has 1-second resolution in SQLite, so
  // two uploads in the same second would order arbitrarily without this.
  const rows = await db
    .select()
    .from(images)
    .orderBy(desc(images.createdAt), desc(images.id));
  return rows.map(toStored);
}

// ── Main pipeline ────────────────────────────────────────────────────────

export interface ProcessUploadOpts {
  origName: string;
  userId: number | null;
}

export async function processUpload(
  input: Buffer,
  opts: ProcessUploadOpts,
): Promise<StoredImage> {
  // 1. Size check
  if (input.byteLength === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Empty upload" });
  }
  if (input.byteLength > getMaxBytes()) {
    throw new TRPCError({ code: "PAYLOAD_TOO_LARGE" });
  }

  // 2. Magic-byte sniff
  const sniffed = await fileTypeFromBuffer(input);
  if (!sniffed || !ALLOWED_MIMES.has(sniffed.mime)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unsupported image type: ${sniffed?.mime ?? "unknown"}`,
    });
  }

  // 3. Hash + idempotency
  const hash = createHash("sha256")
    .update(input)
    .digest("hex")
    .slice(0, HASH_LEN);

  const existing = await findImageByHash(hash);
  if (existing) return existing;

  // 4. Decode with pixel-limit guard (covers metadata + every transform)
  const base = sharp(input, { limitInputPixels: getMaxPixels() }).rotate();
  let meta: sharp.Metadata;
  try {
    meta = await base.metadata();
  } catch (err) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Image decode failed: ${(err as Error).message}`,
    });
  }
  if (!meta.width || !meta.height) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Unreadable image" });
  }

  // 5. Cartesian product of target widths × formats
  const dir = getUploadDir();
  await mkdir(dir, { recursive: true });
  const widths = pickTargetWidths(meta.width);
  const variants: ImageVariant[] = [];
  const writtenKeys: string[] = [];

  try {
    for (const width of widths) {
      for (const format of FORMATS) {
        const buf = await encode(base, width, format);
        const storageKey = `${hash}-${width}.${format}`;
        await writeVariant(dir, storageKey, buf);
        writtenKeys.push(storageKey);
        variants.push({ width, format, storageKey, bytes: buf.length });
      }
    }
  } catch (err) {
    await cleanupVariants(dir, writtenKeys);
    throw err;
  }

  // 6. Persist
  const db = getDb();
  try {
    await db.insert(images).values({
      hash,
      origName: opts.origName,
      origMime: sniffed.mime,
      origBytes: input.byteLength,
      width: meta.width,
      height: meta.height,
      variants: JSON.stringify(variants),
      uploadedBy: opts.userId,
    });
  } catch (err) {
    await cleanupVariants(dir, writtenKeys);
    throw err;
  }

  const row = await findImageByHash(hash);
  if (!row) {
    // Should be impossible (we just inserted)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Image disappeared after insert",
    });
  }
  return row;
}

// ── Cleanup utilities ────────────────────────────────────────────────────

// Called at server boot. Removes orphan `.tmp` files left over from a crash
// mid-upload. Safe to call repeatedly; idempotent.
export async function cleanupTmpFiles(): Promise<void> {
  const dir = getUploadDir();
  await mkdir(dir, { recursive: true });
  const entries = await readdir(dir).catch(() => [] as string[]);
  await Promise.allSettled(
    entries
      .filter((n) => n.endsWith(".tmp"))
      .map((n) => unlink(path.join(dir, n))),
  );
}
