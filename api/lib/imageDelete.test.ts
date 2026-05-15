import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "my-blog-imagedelete-"));
const dbPath = path.join(tmpRoot, "blog.db");
const uploadDir = path.join(tmpRoot, "uploads");
process.env.DATABASE_URL = dbPath;
process.env.UPLOAD_DIR = uploadDir;

import { deleteImage } from "./imageDelete";

let rawDb: Database.Database;

function setupSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE images (
      id integer PRIMARY KEY AUTOINCREMENT,
      hash text(16) NOT NULL UNIQUE,
      orig_name text(255) NOT NULL,
      orig_mime text(50) NOT NULL,
      orig_bytes integer NOT NULL,
      width integer NOT NULL,
      height integer NOT NULL,
      variants text NOT NULL,
      uploaded_by integer,
      created_at integer DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE TABLE posts (
      id integer PRIMARY KEY AUTOINCREMENT,
      slug text NOT NULL UNIQUE,
      title text NOT NULL,
      title_zh text,
      excerpt text,
      excerpt_zh text,
      content text NOT NULL,
      category text NOT NULL,
      cover_image text,
      published_date text,
      word_count integer DEFAULT 0,
      published integer DEFAULT false,
      created_at integer DEFAULT (CURRENT_TIMESTAMP),
      updated_at integer DEFAULT (CURRENT_TIMESTAMP)
    );
  `);
}

beforeAll(() => {
  rawDb = new Database(dbPath);
  setupSchema(rawDb);
  fs.mkdirSync(uploadDir, { recursive: true });
});

afterAll(() => {
  rawDb.close();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  rawDb.exec("DELETE FROM images; DELETE FROM posts;");
  for (const f of fs.readdirSync(uploadDir)) fs.unlinkSync(path.join(uploadDir, f));
});

const H = "abc1234567890def";

function seedImage(hash: string, storageKeys: string[], { writeFiles = true } = {}) {
  rawDb
    .prepare(
      `INSERT INTO images (hash, orig_name, orig_mime, orig_bytes, width, height, variants)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      hash,
      "x.jpg",
      "image/jpeg",
      1000,
      800,
      600,
      JSON.stringify(
        storageKeys.map((k) => ({
          width: 480,
          format: "webp" as const,
          storageKey: k,
          bytes: 100,
        })),
      ),
    );
  if (writeFiles) {
    for (const k of storageKeys) fs.writeFileSync(path.join(uploadDir, k), "data");
  }
}

function seedPost(slug: string, content: string[], cover: string | null = null) {
  rawDb
    .prepare(
      `INSERT INTO posts (slug, title, content, category, cover_image, published)
       VALUES (?, ?, ?, ?, ?, 1)`,
    )
    .run(slug, slug, JSON.stringify(content), "Notes", cover);
}

// ── Happy path ─────────────────────────────────────────────────────

describe("deleteImage — happy path", () => {
  it("removes DB row and all variant files for an unreferenced image", async () => {
    const keys = [`${H}-480.webp`, `${H}-960.webp`];
    seedImage(H, keys);

    const result = await deleteImage(H);

    expect(result.removedFiles).toBe(2);
    expect(result.orphans).toBe(0);
    expect(rawDb.prepare("SELECT * FROM images WHERE hash=?").get(H)).toBeUndefined();
    for (const k of keys) {
      expect(fs.existsSync(path.join(uploadDir, k))).toBe(false);
    }
  });
});

// ── Reference guard ────────────────────────────────────────────────

describe("deleteImage — reference guard", () => {
  it("refuses to delete when content references the hash", async () => {
    seedImage(H, [`${H}-480.webp`]);
    seedPost("post-with-img", [`![x](hash:${H})`]);

    await expect(deleteImage(H)).rejects.toThrow(/post-with-img/);
    // DB row still present
    expect(rawDb.prepare("SELECT id FROM images WHERE hash=?").get(H)).toBeDefined();
    // File still on disk
    expect(fs.existsSync(path.join(uploadDir, `${H}-480.webp`))).toBe(true);
  });

  it("refuses to delete when cover_image references the hash", async () => {
    seedImage(H, [`${H}-480.webp`]);
    seedPost("post-with-cover", ["body"], `hash:${H}`);

    await expect(deleteImage(H)).rejects.toThrow(/post-with-cover/);
  });
});

// ── Not found ──────────────────────────────────────────────────────

describe("deleteImage — not found", () => {
  it("throws NOT_FOUND for a hash that doesn't exist", async () => {
    await expect(deleteImage("0".repeat(16))).rejects.toThrow(/not found/i);
  });
});

// ── Orphan handling ────────────────────────────────────────────────

describe("deleteImage — orphan handling", () => {
  it("removes DB row even when files don't exist (records orphans count)", async () => {
    // DB row points at storage keys that were never written.
    seedImage(H, [`${H}-480.webp`, `${H}-960.webp`], { writeFiles: false });

    const result = await deleteImage(H);

    expect(result.removedFiles).toBe(0);
    expect(result.orphans).toBe(2);
    // DB row removed regardless of unlink failure — DB is source of truth.
    expect(rawDb.prepare("SELECT * FROM images WHERE hash=?").get(H)).toBeUndefined();
  });
});
