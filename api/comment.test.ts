import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppRouter } from "./router";
import type { TrpcContext } from "./context";

type Caller = ReturnType<AppRouter["createCaller"]>;

let dbPath: string;
let rawDb: Database.Database;
let publicCaller: Caller;
let adminCaller: Caller;
let postId: number;

function ctx(user: TrpcContext["user"] = null): TrpcContext {
  return {
    req: new Request("http://localhost/api/trpc"),
    resHeaders: new Headers(),
    user,
    authMethod: user ? "session" : null,
  };
}

function createTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE users (
      id integer PRIMARY KEY AUTOINCREMENT,
      username text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      totp_secret text,
      pending_totp_secret text,
      api_key text UNIQUE,
      is_admin integer DEFAULT true,
      created_at integer DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE sessions (
      id text PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE cascade,
      expires_at integer NOT NULL,
      created_at integer DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE login_challenges (
      id text PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE cascade,
      expires_at integer NOT NULL
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

    CREATE TABLE comments (
      id integer PRIMARY KEY AUTOINCREMENT,
      post_id integer NOT NULL REFERENCES posts(id) ON DELETE cascade,
      parent_id integer REFERENCES comments(id) ON DELETE cascade,
      author_name text NOT NULL,
      author_email text,
      content text NOT NULL,
      approved integer DEFAULT 0 NOT NULL,
      created_at integer DEFAULT (CURRENT_TIMESTAMP)
    );
  `);
}

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "my-blog-comment-"));
  dbPath = path.join(dir, "blog.db");
  process.env.DATABASE_URL = dbPath;
  rawDb = new Database(dbPath);
  rawDb.pragma("foreign_keys = ON");
  createTables(rawDb);

  rawDb
    .prepare(
      `INSERT INTO posts (slug, title, content, category, published) VALUES (?, ?, ?, ?, 1)`,
    )
    .run("hello-world", "Hello World", JSON.stringify(["body"]), "Notes");
  postId = (
    rawDb.prepare(`SELECT id FROM posts WHERE slug = ?`).get("hello-world") as {
      id: number;
    }
  ).id;

  const { appRouter } = await import("./router");
  publicCaller = appRouter.createCaller(ctx());
  adminCaller = appRouter.createCaller(
    ctx({ id: 1, username: "admin" }),
  );
});

afterAll(() => {
  rawDb.close();
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

beforeEach(() => {
  rawDb.exec(`DELETE FROM comments`);
});

async function approveLatest() {
  const row = rawDb
    .prepare(`SELECT id FROM comments ORDER BY id DESC LIMIT 1`)
    .get() as { id: number };
  await adminCaller.comment.approve({ id: row.id });
  return row.id;
}

describe("comment.submit — nested replies", () => {
  it("inserts a valid reply to an approved top-level comment", async () => {
    await publicCaller.comment.submit({
      postId,
      authorName: "Alice",
      content: "top level",
    });
    const parentId = await approveLatest();

    const result = await publicCaller.comment.submit({
      postId,
      parentId,
      authorName: "Bob",
      content: "reply",
    });
    expect(result.pending).toBe(true);

    const row = rawDb
      .prepare(
        `SELECT parent_id, approved FROM comments WHERE author_name = ?`,
      )
      .get("Bob") as { parent_id: number; approved: number };
    expect(row.parent_id).toBe(parentId);
    expect(row.approved).toBe(0);
  });

  it("rejects replies to a non-existent parent (NOT_FOUND)", async () => {
    await expect(
      publicCaller.comment.submit({
        postId,
        parentId: 99999,
        authorName: "Eve",
        content: "ghost reply",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects replies whose parent already has a parent (depth cap)", async () => {
    await publicCaller.comment.submit({
      postId,
      authorName: "Alice",
      content: "top",
    });
    const parentId = await approveLatest();

    await publicCaller.comment.submit({
      postId,
      parentId,
      authorName: "Bob",
      content: "reply",
    });
    const replyId = await approveLatest();

    await expect(
      publicCaller.comment.submit({
        postId,
        parentId: replyId,
        authorName: "Carol",
        content: "reply-to-reply",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects replies whose parent belongs to a different post", async () => {
    rawDb
      .prepare(
        `INSERT INTO posts (slug, title, content, category, published) VALUES (?, ?, ?, ?, 1)`,
      )
      .run("second", "Second", JSON.stringify(["body"]), "Notes");
    const otherPost = (
      rawDb.prepare(`SELECT id FROM posts WHERE slug = ?`).get("second") as {
        id: number;
      }
    ).id;

    await publicCaller.comment.submit({
      postId: otherPost,
      authorName: "Alice",
      content: "elsewhere",
    });
    const otherParent = await approveLatest();

    await expect(
      publicCaller.comment.submit({
        postId,
        parentId: otherParent,
        authorName: "Bob",
        content: "wrong post",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("FK enforcement at the DB layer", () => {
  it("rejects raw inserts with a bogus parent_id (FK pragma is ON)", () => {
    expect(() =>
      rawDb
        .prepare(
          `INSERT INTO comments (post_id, parent_id, author_name, content, approved) VALUES (?, 99999, 'X', 'x', 0)`,
        )
        .run(postId),
    ).toThrow(/FOREIGN KEY/i);
  });

  it("cascades replies when the parent is deleted", async () => {
    await publicCaller.comment.submit({
      postId,
      authorName: "Alice",
      content: "top",
    });
    const parentId = await approveLatest();
    await publicCaller.comment.submit({
      postId,
      parentId,
      authorName: "Bob",
      content: "reply",
    });

    rawDb.prepare(`DELETE FROM comments WHERE id = ?`).run(parentId);

    const remaining = rawDb
      .prepare(`SELECT count(*) as count FROM comments`)
      .get() as { count: number };
    expect(remaining.count).toBe(0);
  });
});

describe("comment.listForPost — visibility rules", () => {
  it("hides replies whose parent is unapproved", async () => {
    await publicCaller.comment.submit({
      postId,
      authorName: "Alice",
      content: "top (pending)",
    });
    const parentId = (
      rawDb
        .prepare(`SELECT id FROM comments ORDER BY id DESC LIMIT 1`)
        .get() as { id: number }
    ).id;

    await publicCaller.comment.submit({
      postId,
      parentId,
      authorName: "Bob",
      content: "reply",
    });
    // Approve the reply but NOT the parent.
    await approveLatest();

    const list = await publicCaller.comment.listForPost({ postId });
    expect(list).toEqual([]);
  });

  it("returns approved replies sorted ascending under each parent", async () => {
    await publicCaller.comment.submit({
      postId,
      authorName: "Alice",
      content: "top",
    });
    const parentId = await approveLatest();

    // Two replies in known order. Approve in same order — created_at ASC.
    await publicCaller.comment.submit({
      postId,
      parentId,
      authorName: "Bob",
      content: "first reply",
    });
    const firstReplyId = await approveLatest();
    // Force a distinct created_at so ordering is deterministic on fast machines.
    rawDb
      .prepare(`UPDATE comments SET created_at = created_at - 1 WHERE id = ?`)
      .run(firstReplyId);

    await publicCaller.comment.submit({
      postId,
      parentId,
      authorName: "Carol",
      content: "second reply",
    });
    await approveLatest();

    const list = await publicCaller.comment.listForPost({ postId });
    expect(list).toHaveLength(1);
    expect(list[0].replies.map((r) => r.authorName)).toEqual(["Bob", "Carol"]);
  });
});

describe("comment.adminList — parentId exposed", () => {
  it("returns parentId on each row so the moderation UI can show the thread", async () => {
    await publicCaller.comment.submit({
      postId,
      authorName: "Alice",
      content: "top",
    });
    const parentId = await approveLatest();
    await publicCaller.comment.submit({
      postId,
      parentId,
      authorName: "Bob",
      content: "reply",
    });

    const rows = await adminCaller.comment.adminList({ status: "all" });
    const reply = rows.find((r) => r.authorName === "Bob");
    expect(reply?.parentId).toBe(parentId);
  });
});
