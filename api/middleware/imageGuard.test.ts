import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { __resetBuckets, imageGuard } from "./imageGuard";

function makeApp() {
  const app = new Hono();
  app.use("/uploads/img/*", imageGuard);
  app.get("/uploads/img/:name", (c) => c.text(`served:${c.req.param("name")}`));
  return app;
}

const URL_BASE = "http://test.local/uploads/img/abc.webp";

const ORIG_ENV = {
  IMG_ALLOWED_HOSTS: process.env.IMG_ALLOWED_HOSTS,
  TRUSTED_PROXY: process.env.TRUSTED_PROXY,
  NODE_ENV: process.env.NODE_ENV,
};

beforeEach(() => {
  __resetBuckets();
  // Test-time defaults — production behaviour exercised in selected tests.
  process.env.IMG_ALLOWED_HOSTS = "blog.example.com";
  process.env.TRUSTED_PROXY = "1"; // so XFF can stand in for socket IP in tests
});

afterEach(() => {
  process.env.IMG_ALLOWED_HOSTS = ORIG_ENV.IMG_ALLOWED_HOSTS;
  process.env.TRUSTED_PROXY = ORIG_ENV.TRUSTED_PROXY;
  process.env.NODE_ENV = ORIG_ENV.NODE_ENV;
});

// Each test uses a unique XFF so the per-IP bucket doesn't carry state across
// tests beyond __resetBuckets above.
function req(headers: Record<string, string>, ip = "10.0.0.1") {
  return makeApp().request(URL_BASE, {
    headers: { "x-forwarded-for": ip, ...headers },
  });
}

// ── Sec-Fetch-Site ─────────────────────────────────────────────────

describe("imageGuard — Sec-Fetch-Site", () => {
  it("denies cross-site", async () => {
    const res = await req({ "Sec-Fetch-Site": "cross-site" });
    expect(res.status).toBe(403);
  });

  it("allows same-origin", async () => {
    const res = await req({ "Sec-Fetch-Site": "same-origin" });
    expect(res.status).toBe(200);
  });

  it("allows same-site", async () => {
    const res = await req({ "Sec-Fetch-Site": "same-site" });
    expect(res.status).toBe(200);
  });

  it("allows 'none' (address bar / share card)", async () => {
    const res = await req({ "Sec-Fetch-Site": "none" });
    expect(res.status).toBe(200);
  });

  it("denies cross-site even when Referer is same-host (SFS wins)", async () => {
    const res = await req({
      "Sec-Fetch-Site": "cross-site",
      Referer: "https://blog.example.com/post/x",
    });
    expect(res.status).toBe(403);
  });
});

// ── Referer fallback (SFS missing) ─────────────────────────────────

describe("imageGuard — Referer fallback", () => {
  it("allows empty Referer when SFS absent (curl, share crawler, public asset)", async () => {
    const res = await req({});
    expect(res.status).toBe(200);
  });

  it("allows Referer with exact-host match", async () => {
    const res = await req({ Referer: "https://blog.example.com/post/x" });
    expect(res.status).toBe(200);
  });

  it("denies Referer from a third-party host", async () => {
    const res = await req({ Referer: "https://evil.com/page" });
    expect(res.status).toBe(403);
  });

  it("denies a subdomain-confusion attempt (no startsWith match)", async () => {
    const res = await req({
      Referer: "https://evil.com.blog.example.com/page",
    });
    expect(res.status).toBe(403);
  });

  it("denies a malformed Referer", async () => {
    const res = await req({ Referer: "not a url" });
    expect(res.status).toBe(403);
  });

  it("respects IMG_ALLOWED_HOSTS multi-value comma list", async () => {
    process.env.IMG_ALLOWED_HOSTS = "blog.example.com,staging.example.com";
    const res = await req({ Referer: "https://staging.example.com/x" });
    expect(res.status).toBe(200);
  });
});

// ── Rate limit ────────────────────────────────────────────────────

describe("imageGuard — rate limit", () => {
  it("returns 429 on the 201st request from the same IP", async () => {
    const ip = "10.0.0.99";
    for (let i = 0; i < 200; i++) {
      const r = await req({ "Sec-Fetch-Site": "same-origin" }, ip);
      expect(r.status).toBe(200);
    }
    const last = await req({ "Sec-Fetch-Site": "same-origin" }, ip);
    expect(last.status).toBe(429);
  });

  it("does not count requests from a different IP", async () => {
    const a = "10.0.0.50";
    const b = "10.0.0.51";
    for (let i = 0; i < 200; i++) {
      await req({ "Sec-Fetch-Site": "same-origin" }, a);
    }
    const fromA = await req({ "Sec-Fetch-Site": "same-origin" }, a);
    const fromB = await req({ "Sec-Fetch-Site": "same-origin" }, b);
    expect(fromA.status).toBe(429);
    expect(fromB.status).toBe(200);
  });
});

// ── TRUSTED_PROXY gating ──────────────────────────────────────────

describe("imageGuard — TRUSTED_PROXY", () => {
  it("ignores X-Forwarded-For when TRUSTED_PROXY is not set", async () => {
    process.env.TRUSTED_PROXY = "0";
    // All requests collapse into the "anon" bucket because Hono test runtime
    // doesn't expose a real socket. Run 200 with two different XFFs that
    // should have been distinct under TRUSTED_PROXY=1 — both share the same
    // bucket, so #201 must 429.
    for (let i = 0; i < 100; i++) {
      const r = await req({ "Sec-Fetch-Site": "same-origin" }, "5.5.5.5");
      expect(r.status).toBe(200);
    }
    for (let i = 0; i < 100; i++) {
      const r = await req({ "Sec-Fetch-Site": "same-origin" }, "6.6.6.6");
      expect(r.status).toBe(200);
    }
    const last = await req(
      { "Sec-Fetch-Site": "same-origin" },
      "7.7.7.7",
    );
    expect(last.status).toBe(429);
  });

  it("uses first XFF segment when TRUSTED_PROXY=1", async () => {
    const ip = "9.9.9.9";
    for (let i = 0; i < 200; i++) {
      const r = await req(
        { "Sec-Fetch-Site": "same-origin" },
        `${ip}, 1.2.3.4`,
      );
      expect(r.status).toBe(200);
    }
    // Different first segment → distinct bucket → still passes
    const otherFirst = await req(
      { "Sec-Fetch-Site": "same-origin" },
      "8.8.8.8, 1.2.3.4",
    );
    expect(otherFirst.status).toBe(200);
    // Same first segment → exhausted bucket → 429
    const sameFirst = await req(
      { "Sec-Fetch-Site": "same-origin" },
      `${ip}, 9.9.9.10`,
    );
    expect(sameFirst.status).toBe(429);
  });
});

// ── Headers on success ────────────────────────────────────────────

describe("imageGuard — response headers", () => {
  it("adds immutable cache and nosniff on allowed responses", async () => {
    const res = await req({ "Sec-Fetch-Site": "same-origin" });
    expect(res.headers.get("Cache-Control")).toContain("immutable");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
