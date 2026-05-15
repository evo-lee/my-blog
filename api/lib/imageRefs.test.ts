import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "my-blog-imagerefs-"));
const dbPath = path.join(tmpRoot, "blog.db");
process.env.DATABASE_URL = dbPath;
process.env.UPLOAD_DIR = path.join(tmpRoot, "uploads");

import { assertNoRefs, extractCoverHash, findRefs, loadImageMap, scanRefs } from "./imageRefs";

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
});

afterAll(() => {
  rawDb.close();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  rawDb.exec("DELETE FROM images; DELETE FROM posts;");
});

const H1 = "abc1234567890def";
const H2 = "fedcba0987654321";

function insertImage(hash: string) {
  rawDb
    .prepare(
      `INSERT INTO images (hash, orig_name, orig_mime, orig_bytes, width, height, variants)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      hash,
      `${hash}.jpg`,
      "image/jpeg",
      1000,
      800,
      600,
      JSON.stringify([
        { width: 480, format: "avif", storageKey: `${hash}-480.avif`, bytes: 100 },
        { width: 800, format: "jpeg", storageKey: `${hash}-800.jpeg`, bytes: 200 },
      ]),
    );
}

function insertPost(slug: string, content: string[], cover: string | null = null) {
  rawDb
    .prepare(
      `INSERT INTO posts (slug, title, content, category, cover_image, published)
       VALUES (?, ?, ?, ?, ?, 1)`,
    )
    .run(slug, slug, JSON.stringify(content), "Notes", cover);
}

// ── scanRefs ────────────────────────────────────────────────────────

describe("scanRefs", () => {
  it("returns [] when no refs present", () => {
    expect(scanRefs(["just some text", "more text"])).toEqual([]);
  });

  it("extracts a single ref", () => {
    expect(scanRefs([`![cat](hash:${H1})`])).toEqual([H1]);
  });

  it("dedupes identical refs across paragraphs", () => {
    expect(scanRefs([`![a](hash:${H1})`, `![b](hash:${H1})`])).toEqual([H1]);
  });

  it("collects multiple distinct refs", () => {
    const out = scanRefs([`![a](hash:${H1}) text ![b](hash:${H2})`]);
    expect(out.sort()).toEqual([H1, H2].sort());
  });

  it("ignores hashes with wrong length", () => {
    expect(scanRefs(["![bad](hash:abc123)"])).toEqual([]);
    expect(scanRefs([`![bad](hash:${H1}extra)`])).toEqual([]);
  });

  it("ignores non-hash src like http URLs", () => {
    expect(scanRefs(["![ext](https://cdn.x/a.jpg)"])).toEqual([]);
  });

  it("ignores uppercase hex (canonical form is lowercase)", () => {
    expect(scanRefs(["![bad](hash:ABCDEF1234567890)"])).toEqual([]);
  });
});

// ── extractCoverHash ─────────────────────────────────────────────────

describe("extractCoverHash", () => {
  it("returns hash for canonical cover ref", () => {
    expect(extractCoverHash(`hash:${H1}`)).toBe(H1);
  });

  it("returns null for null/empty/http", () => {
    expect(extractCoverHash(null)).toBeNull();
    expect(extractCoverHash("")).toBeNull();
    expect(extractCoverHash("https://x/y.jpg")).toBeNull();
  });

  it("requires exact match (no surrounding text)", () => {
    expect(extractCoverHash(`prefix hash:${H1}`)).toBeNull();
    expect(extractCoverHash(`hash:${H1} suffix`)).toBeNull();
  });
});

// ── loadImageMap ─────────────────────────────────────────────────────

describe("loadImageMap", () => {
  it("returns {} for empty hash list", async () => {
    expect(await loadImageMap([])).toEqual({});
  });

  it("returns map keyed by hash for present rows", async () => {
    insertImage(H1);
    insertImage(H2);
    const map = await loadImageMap([H1, H2]);
    expect(Object.keys(map).sort()).toEqual([H1, H2].sort());
    expect(map[H1]!.width).toBe(800);
    expect(map[H1]!.variants).toHaveLength(2);
  });

  it("silently omits unknown hashes", async () => {
    insertImage(H1);
    const map = await loadImageMap([H1, H2]);
    expect(Object.keys(map)).toEqual([H1]);
  });
});

// ── findRefs / assertNoRefs ──────────────────────────────────────────

describe("findRefs", () => {
  it("returns [] when no posts reference the hash", async () => {
    insertPost("unrelated", ["just words"]);
    expect(await findRefs(H1)).toEqual([]);
  });

  it("finds a content reference", async () => {
    insertPost("post-with-img", [`hi ![x](hash:${H1}) bye`]);
    const hits = await findRefs(H1);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.slug).toBe("post-with-img");
    expect(hits[0]!.source).toBe("content");
  });

  it("finds a cover_image reference", async () => {
    insertPost("post-with-cover", ["body"], `hash:${H1}`);
    const hits = await findRefs(H1);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.source).toBe("cover");
  });

  it("reports both sources when one post uses the same hash in both places", async () => {
    insertPost("dual", [`![x](hash:${H1})`], `hash:${H1}`);
    const hits = await findRefs(H1);
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.source).sort()).toEqual(["content", "cover"]);
  });

  it("does not match a different hash in cover_image", async () => {
    insertPost("other-cover", ["body"], `hash:${H2}`);
    expect(await findRefs(H1)).toEqual([]);
  });
});

describe("assertNoRefs", () => {
  it("resolves silently when no posts reference the hash", async () => {
    insertPost("unrelated", ["body"]);
    await expect(assertNoRefs(H1)).resolves.toBeUndefined();
  });

  it("throws BAD_REQUEST listing referenced slugs", async () => {
    insertPost("post-a", [`![x](hash:${H1})`]);
    insertPost("post-b", ["body"], `hash:${H1}`);
    await expect(assertNoRefs(H1)).rejects.toThrow(/post-a|post-b/);
  });

  it("dedupes the slug list when one post hits twice (content + cover)", async () => {
    insertPost("dual", [`![x](hash:${H1})`], `hash:${H1}`);
    let caught: Error | null = null;
    try {
      await assertNoRefs(H1);
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).not.toBeNull();
    // "dual" should appear exactly once in the message
    const msg = caught!.message;
    expect(msg.match(/dual/g)?.length).toBe(1);
  });
});
