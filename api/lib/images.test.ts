import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Test fixture roots — set before importing the module under test.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "my-blog-images-"));
const dbPath = path.join(tmpRoot, "blog.db");
const uploadDir = path.join(tmpRoot, "uploads");

process.env.DATABASE_URL = dbPath;
process.env.UPLOAD_DIR = uploadDir;
// Loosen for everything-default tests; the decompression-bomb test sets its own.
process.env.IMG_MAX_PIXELS = "40000000";
process.env.UPLOAD_MAX_BYTES = String(10 * 1024 * 1024);

// Static imports: env is set by module-top-level code above, before any top-
// level code in the imported modules runs. `images` reads env lazily inside
// functions, and `connection` reads `DATABASE_URL` only on first `getDb()`.
import sharp from "sharp";
import * as mod from "./images";

let rawDb: Database.Database;

function createImagesTable(db: Database.Database) {
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
  `);
}

beforeAll(() => {
  rawDb = new Database(dbPath);
  rawDb.pragma("foreign_keys = ON");
  createImagesTable(rawDb);
  fs.mkdirSync(uploadDir, { recursive: true });
});

afterAll(() => {
  rawDb.close();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  rawDb.exec("DELETE FROM images");
  for (const f of fs.readdirSync(uploadDir).filter((n) => /\.(avif|webp|jpeg|tmp)$/.test(n))) {
    fs.unlinkSync(path.join(uploadDir, f));
  }
});

// ── Fixtures ──────────────────────────────────────────────────────────

async function jpegOf(w: number, h: number, color = "#ff0000"): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 3, background: color },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function pngOf(w: number, h: number): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 4, background: "#00ff00" },
  })
    .png()
    .toBuffer();
}

const SVG_DOC = Buffer.from(
  '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
);

const FAKE_TEXT = Buffer.from("This pretends to be a JPEG but is plain text.");

// GIF magic header so file-type detects it as image/gif, which our whitelist rejects.
const FAKE_GIF = Buffer.concat([
  Buffer.from("GIF89a", "ascii"),
  Buffer.alloc(40, 0),
]);

// ── Validation ────────────────────────────────────────────────────────

describe("processUpload — input validation", () => {
  it("rejects an empty buffer", async () => {
    await expect(
      mod.processUpload(Buffer.alloc(0), { origName: "x", userId: null }),
    ).rejects.toThrow(/empty/i);
  });

  it("rejects a buffer over UPLOAD_MAX_BYTES", async () => {
    process.env.UPLOAD_MAX_BYTES = "200";
    try {
      const buf = await jpegOf(200, 200);
      expect(buf.byteLength).toBeGreaterThan(200);
      await expect(
        mod.processUpload(buf, { origName: "big.jpg", userId: null }),
      ).rejects.toThrow(/PAYLOAD_TOO_LARGE|too large/i);
    } finally {
      process.env.UPLOAD_MAX_BYTES = String(10 * 1024 * 1024);
    }
  });

  it("rejects text disguised as an image", async () => {
    await expect(
      mod.processUpload(FAKE_TEXT, { origName: "evil.jpg", userId: null }),
    ).rejects.toThrow(/unsupported|unknown/i);
  });

  it("rejects SVG", async () => {
    await expect(
      mod.processUpload(SVG_DOC, { origName: "vec.svg", userId: null }),
    ).rejects.toThrow(/unsupported/i);
  });

  it("rejects GIF (animation semantics out of scope)", async () => {
    await expect(
      mod.processUpload(FAKE_GIF, { origName: "anim.gif", userId: null }),
    ).rejects.toThrow(/unsupported/i);
  });

  it("rejects images over IMG_MAX_PIXELS", async () => {
    process.env.IMG_MAX_PIXELS = "10000"; // 100x100 = 10000 pixels exactly
    try {
      const buf = await jpegOf(200, 200); // 40000 pixels
      await expect(
        mod.processUpload(buf, { origName: "bomb.jpg", userId: null }),
      ).rejects.toThrow();
    } finally {
      process.env.IMG_MAX_PIXELS = "40000000";
    }
  });
});

// ── Variant generation ────────────────────────────────────────────────

describe("processUpload — variant generation", () => {
  it("generates 3 variants (one width) for an image smaller than the smallest preset", async () => {
    const buf = await jpegOf(300, 200);
    const stored = await mod.processUpload(buf, {
      origName: "small.jpg",
      userId: null,
    });
    expect(stored.variants).toHaveLength(3);
    expect(stored.variants.map((v) => v.format).sort()).toEqual(
      ["avif", "jpeg", "webp"],
    );
    expect(stored.variants.every((v) => v.width === 300)).toBe(true);
  });

  it("generates 6 variants for a mid-size image (preset 480 + source width)", async () => {
    const buf = await jpegOf(800, 600);
    const stored = await mod.processUpload(buf, {
      origName: "mid.jpg",
      userId: null,
    });
    expect(stored.variants).toHaveLength(6);
    const widths = [...new Set(stored.variants.map((v) => v.width))].sort(
      (a, b) => a - b,
    );
    expect(widths).toEqual([480, 800]);
  });

  it("generates 9 variants for a large image, capped at the largest preset", async () => {
    const buf = await jpegOf(4000, 3000);
    const stored = await mod.processUpload(buf, {
      origName: "big.jpg",
      userId: null,
    });
    expect(stored.variants).toHaveLength(9);
    const widths = [...new Set(stored.variants.map((v) => v.width))].sort(
      (a, b) => a - b,
    );
    expect(widths).toEqual([480, 960, 1920]);
  });

  it("writes every variant to disk and records its byte size", async () => {
    const buf = await pngOf(600, 600);
    const stored = await mod.processUpload(buf, {
      origName: "png.png",
      userId: null,
    });
    for (const v of stored.variants) {
      const p = path.join(uploadDir, v.storageKey);
      expect(fs.existsSync(p)).toBe(true);
      expect(fs.statSync(p).size).toBe(v.bytes);
      expect(v.bytes).toBeGreaterThan(0);
    }
  });
});

// ── Idempotency ───────────────────────────────────────────────────────

describe("processUpload — idempotency", () => {
  it("returns the existing row when the same buffer is uploaded twice", async () => {
    const buf = await jpegOf(500, 400);
    const first = await mod.processUpload(buf, {
      origName: "a.jpg",
      userId: null,
    });
    const second = await mod.processUpload(buf, {
      origName: "renamed.jpg", // different name — should not produce a new row
      userId: null,
    });
    expect(second.id).toBe(first.id);
    expect(second.hash).toBe(first.hash);
    // origName comes from the first insert; second call is a pure DB lookup
    expect(second.origName).toBe("a.jpg");
  });
});

// ── findImageByHash / listImages ──────────────────────────────────────

describe("findImageByHash + listImages", () => {
  it("returns null for an unknown hash", async () => {
    expect(await mod.findImageByHash("0".repeat(16))).toBeNull();
  });

  it("lists images newest first", async () => {
    await mod.processUpload(await jpegOf(300, 200), {
      origName: "a.jpg",
      userId: null,
    });
    await mod.processUpload(await jpegOf(300, 200, "#00ff00"), {
      origName: "b.jpg",
      userId: null,
    });
    const list = await mod.listImages();
    expect(list).toHaveLength(2);
    // listImages orders by created_at desc; newest first
    expect(list[0]!.origName).toBe("b.jpg");
  });
});

// ── cleanupTmpFiles ───────────────────────────────────────────────────

describe("cleanupTmpFiles", () => {
  it("removes .tmp files and leaves regular variants in place", async () => {
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(path.join(uploadDir, "orphan-480.webp.tmp"), "stale");
    fs.writeFileSync(path.join(uploadDir, "good-480.webp"), "kept");
    await mod.cleanupTmpFiles();
    expect(fs.existsSync(path.join(uploadDir, "orphan-480.webp.tmp"))).toBe(false);
    expect(fs.existsSync(path.join(uploadDir, "good-480.webp"))).toBe(true);
  });
});
