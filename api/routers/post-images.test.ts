import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppRouter } from "../router";
import type { TrpcContext } from "../context";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "my-blog-post-images-"));
const dbPath = path.join(tmpRoot, "blog.db");
process.env.DATABASE_URL = dbPath;
process.env.UPLOAD_DIR = path.join(tmpRoot, "uploads");

let rawDb: Database.Database;
let publicCaller: ReturnType<AppRouter["createCaller"]>;

function ctx(user: TrpcContext["user"] = null): TrpcContext {
  return {
    req: new Request("http://localhost/api/trpc"),
    resHeaders: new Headers(),
    user,
    authMethod: user ? "session" : null,
  };
}

beforeAll(async () => {
  rawDb = new Database(dbPath);
  rawDb.exec(`
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
  const { appRouter } = await import("../router");
  publicCaller = appRouter.createCaller(ctx());
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

function insertImage(hash: string, width = 800) {
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
      width,
      Math.round(width * 0.75),
      JSON.stringify([
        { width: 480, format: "webp", storageKey: `${hash}-480.webp`, bytes: 100 },
        { width, format: "webp", storageKey: `${hash}-${width}.webp`, bytes: 200 },
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

describe("post.bySlug — images map injection", () => {
  it("returns empty images map when post has no refs", async () => {
    insertPost("plain", ["just text", "no refs here"]);
    const res = await publicCaller.post.bySlug({ slug: "plain" });
    expect(res).not.toBeNull();
    expect(res!.images).toEqual({});
  });

  it("includes images referenced from markdown content", async () => {
    insertImage(H1);
    insertImage(H2);
    insertPost("with-imgs", [
      `intro ![a](hash:${H1})`,
      `more ![b](hash:${H2})`,
    ]);
    const res = await publicCaller.post.bySlug({ slug: "with-imgs" });
    expect(Object.keys(res!.images).sort()).toEqual([H1, H2].sort());
    expect(res!.images[H1]!.variants).toHaveLength(2);
  });

  it("includes the image referenced by cover_image", async () => {
    insertImage(H1);
    insertPost("cover-only", ["body"], `hash:${H1}`);
    const res = await publicCaller.post.bySlug({ slug: "cover-only" });
    expect(Object.keys(res!.images)).toEqual([H1]);
  });

  it("dedupes when same hash appears in both content and cover", async () => {
    insertImage(H1);
    insertPost("dual", [`![x](hash:${H1})`], `hash:${H1}`);
    const res = await publicCaller.post.bySlug({ slug: "dual" });
    expect(Object.keys(res!.images)).toEqual([H1]);
  });

  it("silently omits hashes that have no DB row", async () => {
    insertImage(H1);
    insertPost("partial", [`![ok](hash:${H1}) ![missing](hash:${H2})`]);
    const res = await publicCaller.post.bySlug({ slug: "partial" });
    expect(Object.keys(res!.images)).toEqual([H1]);
  });

  it("returns null for unknown slug", async () => {
    const res = await publicCaller.post.bySlug({ slug: "nope" });
    expect(res).toBeNull();
  });
});
