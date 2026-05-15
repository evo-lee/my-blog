import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppRouter } from "../router";
import type { TrpcContext } from "../context";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "my-blog-upload-router-"));
const dbPath = path.join(tmpRoot, "blog.db");
process.env.DATABASE_URL = dbPath;
process.env.UPLOAD_DIR = path.join(tmpRoot, "uploads");

let rawDb: Database.Database;
let publicCaller: ReturnType<AppRouter["createCaller"]>;
let adminCaller: ReturnType<AppRouter["createCaller"]>;

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
  `);
  const { appRouter } = await import("../router");
  publicCaller = appRouter.createCaller(ctx());
  adminCaller = appRouter.createCaller(ctx({ id: 1, username: "admin" }));
});

afterAll(() => {
  rawDb.close();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("uploadRouter auth gating", () => {
  it("rejects list without session", async () => {
    await expect(publicCaller.upload.list()).rejects.toThrow();
  });

  it("rejects delete without session", async () => {
    await expect(
      publicCaller.upload.delete({ hash: "0".repeat(16) }),
    ).rejects.toThrow();
  });

  it("rejects image upload without session", async () => {
    await expect(
      publicCaller.upload.image({
        dataBase64: Buffer.from("hi").toString("base64"),
        origName: "x.txt",
      }),
    ).rejects.toThrow();
  });

  it("admin list returns empty array initially", async () => {
    expect(await adminCaller.upload.list()).toEqual([]);
  });
});
