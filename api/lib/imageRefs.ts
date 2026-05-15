import { eq, inArray, like, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../queries/connection";
import { images, posts } from "@db/schema";
import {
  findImageByHash as _findImageByHash,
  type ImageRef,
  type StoredImage,
} from "./images";

// Reuses StoredImage from images.ts so callers get the same parsed shape.

// ── Regexes ──────────────────────────────────────────────────────────

// Embedded markdown ref: ![alt](hash:<16hex>)
const HASH_RE = /!\[[^\]]*\]\(hash:([0-9a-f]{16})\)/g;

// Cover-image field uses the whole string as the ref: "hash:<16hex>"
const COVER_HASH_RE = /^hash:([0-9a-f]{16})$/;

// ── Helpers ──────────────────────────────────────────────────────────

export function scanRefs(content: string[]): string[] {
  const set = new Set<string>();
  for (const para of content) {
    for (const m of para.matchAll(HASH_RE)) set.add(m[1]!);
  }
  return [...set];
}

export function extractCoverHash(coverImage: string | null | undefined): string | null {
  if (!coverImage) return null;
  const m = coverImage.match(COVER_HASH_RE);
  return m ? m[1]! : null;
}

// ── DB queries ────────────────────────────────────────────────────────

function parseVariants(json: string): ImageRef["variants"] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadImageMap(
  hashes: string[],
): Promise<Record<string, ImageRef>> {
  if (hashes.length === 0) return {};
  const db = getDb();
  const rows = await db
    .select({
      hash: images.hash,
      width: images.width,
      height: images.height,
      variants: images.variants,
    })
    .from(images)
    .where(inArray(images.hash, hashes));

  const map: Record<string, ImageRef> = {};
  for (const row of rows) {
    map[row.hash] = {
      hash: row.hash,
      width: row.width,
      height: row.height,
      variants: parseVariants(row.variants),
    };
  }
  return map;
}

// Re-export for callers that only need a single ref. Avoids a circular re-import.
export const findImageByHash: (hash: string) => Promise<StoredImage | null> =
  _findImageByHash;

// ── Reference assertion (delete guard) ────────────────────────────────

interface RefHit {
  slug: string;
  source: "content" | "cover";
}

export async function findRefs(hash: string): Promise<RefHit[]> {
  const db = getDb();
  const target = `hash:${hash}`;
  // posts.content is a JSON-stringified paragraph array, so LIKE %target%
  // catches embedded refs. posts.cover_image is the whole field; use exact match.
  const rows = await db
    .select({
      slug: posts.slug,
      content: posts.content,
      coverImage: posts.coverImage,
    })
    .from(posts)
    .where(
      or(
        like(posts.content, `%${target}%`),
        eq(posts.coverImage, target),
      ),
    );
  const hits: RefHit[] = [];
  for (const r of rows) {
    if (r.coverImage === target) hits.push({ slug: r.slug, source: "cover" });
    if (r.content.includes(target)) hits.push({ slug: r.slug, source: "content" });
  }
  return hits;
}

export async function assertNoRefs(hash: string): Promise<void> {
  const hits = await findRefs(hash);
  if (hits.length === 0) return;
  const slugs = [...new Set(hits.map((h) => h.slug))].join(", ");
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `Image is referenced by post(s): ${slugs}`,
  });
}
