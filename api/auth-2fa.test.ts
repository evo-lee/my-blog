import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import speakeasy from "speakeasy";
import type { AppRouter } from "./router";
import type { TrpcContext } from "./context";

type Caller = ReturnType<AppRouter["createCaller"]>;

let dbPath: string;
let rawDb: Database.Database;
let publicCaller: Caller;
let adminCaller: Caller;

function ctx(user: TrpcContext["user"] = null): TrpcContext {
  return {
    req: new Request("http://localhost/api/trpc"),
    resHeaders: new Headers(),
    user,
    authMethod: user ? "session" : null,
  };
}

function createAuthTables(db: Database.Database) {
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
  `);
}

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "my-blog-auth-2fa-"));
  dbPath = path.join(dir, "blog.db");
  process.env.DATABASE_URL = dbPath;
  rawDb = new Database(dbPath);
  createAuthTables(rawDb);

  const { appRouter } = await import("./router");
  publicCaller = appRouter.createCaller(ctx());
  adminCaller = appRouter.createCaller(ctx({ id: 1, username: "admin" }));
});

afterAll(() => {
  rawDb.close();
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

async function waitForStarterPosts() {
  for (let i = 0; i < 20; i++) {
    const row = rawDb.prepare("SELECT count(*) as count FROM posts").get() as {
      count: number;
    };
    if (row.count >= 6) return row.count;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return 0;
}

describe("admin 2FA setup", () => {
  it("requires TOTP confirmation before enabling login 2FA and can be removed/reset", async () => {
    await publicCaller.auth.setup({
      username: "admin",
      password: "correct-password",
    });

    const pending = await adminCaller.auth.setup2FA();
    expect(pending.secret).toMatch(/^[A-Z2-7]+=*$/);
    expect(pending.qrUrl).toContain("data:image/png;base64,");

    const pendingLogin = await publicCaller.auth.loginStep1({
      username: "admin",
      password: "correct-password",
    });
    expect(pendingLogin.require2FA).toBe(false);

    const setupCode = speakeasy.totp({
      secret: pending.secret,
      encoding: "base32",
    });
    await adminCaller.auth.verify2FA({ code: setupCode });

    const enabledMe = await adminCaller.auth.me();
    expect(enabledMe?.has2FA).toBe(true);

    const protectedLogin = await publicCaller.auth.loginStep1({
      username: "admin",
      password: "correct-password",
    });
    expect(protectedLogin.require2FA).toBe(true);
    expect(protectedLogin.tempToken).toEqual(expect.any(String));

    const loginCode = speakeasy.totp({
      secret: pending.secret,
      encoding: "base32",
    });
    const loggedIn = await publicCaller.auth.loginStep2({
      tempToken: protectedLogin.tempToken!,
      code: loginCode,
    });
    expect(loggedIn.user?.username).toBe("admin");

    await adminCaller.auth.disable2FA();
    const disabledMe = await adminCaller.auth.me();
    expect(disabledMe?.has2FA).toBe(false);

    const passwordOnlyLogin = await publicCaller.auth.loginStep1({
      username: "admin",
      password: "correct-password",
    });
    expect(passwordOnlyLogin.require2FA).toBe(false);

    const reset = await adminCaller.auth.setup2FA();
    expect(reset.secret).toMatch(/^[A-Z2-7]+=*$/);
    expect(reset.secret).not.toBe(pending.secret);
  });

  it("seeds starter posts, publishes through the CLI path with a generated API key, then deletes the test post", async () => {
    const { default: app } = await import("./boot");
    const { publishFromFile } = await import("../scripts/publish");
    const serverUrl = "http://leeblog.test";

    await expect(waitForStarterPosts()).resolves.toBeGreaterThanOrEqual(6);

    const { apiKey } = await adminCaller.auth.generateApiKey();
    const articlePath = path.join(path.dirname(dbPath), "cli-publish-test.md");
    fs.writeFileSync(
      articlePath,
      `---
slug: cli-publish-smoke
title: CLI Publish Smoke
category: TEST
excerpt: Published by the CLI integration test.
date: 2026-05-11
---

This post is created by the CLI integration test.

It should be deleted before the test finishes.
`
    );

    const logs: string[] = [];
    const result = await publishFromFile({
      file: articlePath,
      server: serverUrl,
      apiKey,
      log: {
        log: (message?: unknown) => logs.push(String(message ?? "")),
        error: (message?: unknown) => logs.push(String(message ?? "")),
      },
      fetchImpl: (input, init) => app.request(String(input), init),
    });
    expect(result.slug).toBe("cli-publish-smoke");
    expect(logs.join("\n")).toContain("Published successfully");

    const created = rawDb
      .prepare("SELECT id, title, published FROM posts WHERE slug = ?")
      .get("cli-publish-smoke") as
      | { id: number; title: string; published: number }
      | undefined;
    expect(created).toMatchObject({
      title: "CLI Publish Smoke",
      published: 1,
    });

    await adminCaller.post.delete({ id: created!.id });

    const deleted = rawDb
      .prepare("SELECT id FROM posts WHERE slug = ?")
      .get("cli-publish-smoke");
    expect(deleted).toBeUndefined();
  });
});
