import { eq } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { TRPCError } from "@trpc/server";
import { getDb } from "../queries/connection";
import { images } from "@db/schema";
import { assertNoRefs } from "./imageRefs";
import { getUploadDir, type ImageVariant } from "./images";

function parseVariants(json: string): ImageVariant[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as ImageVariant[]) : [];
  } catch {
    return [];
  }
}

export interface DeleteResult {
  hash: string;
  removedFiles: number;
  orphans: number; // files we tried but failed to unlink — left on disk
}

// Order:
//   1. assertNoRefs (cheap, catches in-use images before we touch anything).
//   2. Load + DB delete in the same logical step. DB is source of truth.
//   3. unlink files via Promise.allSettled — any failure leaves an orphan
//      file but the DB row is already gone, so it can't reappear. A future
//      cron sweep can reconcile.
export async function deleteImage(hash: string): Promise<DeleteResult> {
  await assertNoRefs(hash);

  const db = getDb();
  const row = await db
    .select()
    .from(images)
    .where(eq(images.hash, hash))
    .limit(1);
  if (row.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Image not found" });
  }
  await db.delete(images).where(eq(images.hash, hash));

  const variants = parseVariants(row[0]!.variants);
  const dir = getUploadDir();
  const results = await Promise.allSettled(
    variants.map((v) => unlink(path.join(dir, v.storageKey))),
  );

  let removed = 0;
  let orphans = 0;
  for (const r of results) {
    if (r.status === "fulfilled") removed++;
    else orphans++;
  }
  return { hash, removedFiles: removed, orphans };
}
