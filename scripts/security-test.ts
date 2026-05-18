#!/usr/bin/env node
/**
 * Security probe — image hotlink/abuse + admin attack surface.
 *
 * Usage:
 *   npx tsx scripts/security-test.ts                       # default http://localhost:3000
 *   npx tsx scripts/security-test.ts --server=https://blog.example.com
 *   npx tsx scripts/security-test.ts --skip-ratelimit      # skip 200+ req burst
 *
 * Run against a live dev server. Read-only probes only: no real users
 * created, no posts written. The image-guard runs BEFORE static, so a 404
 * from a non-existent hash still proves the guard let the request through
 * (status ≠ 403 / 429 = allowed). For positive-case file fetches we don't
 * need a real image to evaluate the guard.
 */

import { setTimeout as sleep } from "node:timers/promises";

interface Args {
  server: string;
  skipRateLimit: boolean;
  apiKey: string | null;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (flag: string) =>
    args.find((a) => a.startsWith(flag + "="))?.slice(flag.length + 1) ?? null;
  return {
    server: (get("--server") ?? "http://localhost:3000").replace(/\/$/, ""),
    skipRateLimit: args.includes("--skip-ratelimit"),
    apiKey: get("--api-key"),
  };
}

// ── tiny test harness ────────────────────────────────────────────────
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RST = "\x1b[0m";

interface Result {
  name: string;
  ok: boolean;
  detail: string;
}
const results: Result[] = [];

async function check(
  name: string,
  fn: () => Promise<{ ok: boolean; detail: string }>,
) {
  process.stdout.write(`${DIM}…${RST} ${name}`);
  try {
    const r = await fn();
    results.push({ name, ...r });
    const mark = r.ok ? `${GREEN}PASS${RST}` : `${RED}FAIL${RST}`;
    process.stdout.write(`\r${mark}  ${name} ${DIM}${r.detail}${RST}\n`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, detail });
    process.stdout.write(`\r${RED}ERR ${RST}  ${name} ${DIM}${detail}${RST}\n`);
  }
}

function section(label: string) {
  console.log(`\n${YELLOW}── ${label} ──${RST}`);
}

// ── helpers ──────────────────────────────────────────────────────────

const FAKE_HASH = "0000000000000000"; // 16-hex, well-formed but not in DB

async function hitImage(
  server: string,
  headers: Record<string, string>,
): Promise<Response> {
  return fetch(`${server}/uploads/img/${FAKE_HASH}-480.webp`, { headers });
}

// Guard runs before serve-static. Allowed → 404 (file missing) or 200 if hash
// happens to exist. Blocked by guard → 403. Rate-limited → 429.
function guardAllowed(status: number) {
  return status !== 403 && status !== 429;
}
function guardBlocked(status: number) {
  return status === 403;
}

async function trpcCall(
  server: string,
  procedure: string,
  input: unknown,
  init?: { headers?: Record<string, string>; method?: "GET" | "POST" },
): Promise<{ status: number; body: unknown }> {
  const url = `${server}/api/trpc/${procedure}`;
  const method = init?.method ?? "POST";
  // tRPC v10 superjson transformer wants { json: <value>, meta: ... }
  const payload = JSON.stringify({ json: input });
  const res =
    method === "POST"
      ? await fetch(url, {
          method,
          headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
          body: payload,
        })
      : await fetch(
          `${url}?input=${encodeURIComponent(payload)}`,
          { headers: init?.headers },
        );
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, body };
}

function trpcErrorCode(body: unknown): string | null {
  // tRPC + superjson wraps payload in `json`: body.error.json.data.code.
  // Fall back to flat shape for plain JSON transformers.
  const root = body as Record<string, unknown> | null;
  const err = root && typeof root === "object"
    ? (root.error as Record<string, unknown> | undefined)
    : undefined;
  if (!err) return null;
  const inner = (err.json as Record<string, unknown> | undefined) ?? err;
  const data = inner.data as Record<string, unknown> | undefined;
  if (data && "code" in data) return String(data.code);
  return null;
}

// ── main ─────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  console.log(`Target: ${args.server}`);

  // Ping
  try {
    const r = await fetch(args.server + "/api/trpc/auth.isSetup");
    if (!r.ok && r.status !== 400) {
      console.log(
        `${YELLOW}note:${RST} unexpected ${r.status} from auth.isSetup — server reachable but maybe wrong build`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${RED}cannot reach ${args.server}: ${msg}${RST}`);
    process.exit(2);
  }

  // ── Image guard: Sec-Fetch-Site ──
  section("Image guard — Sec-Fetch-Site");

  await check("cross-site SFS → 403", async () => {
    const r = await hitImage(args.server, { "Sec-Fetch-Site": "cross-site" });
    return { ok: guardBlocked(r.status), detail: `status=${r.status}` };
  });

  await check("same-origin SFS → allowed", async () => {
    const r = await hitImage(args.server, { "Sec-Fetch-Site": "same-origin" });
    return { ok: guardAllowed(r.status), detail: `status=${r.status}` };
  });

  await check("same-site SFS → allowed", async () => {
    const r = await hitImage(args.server, { "Sec-Fetch-Site": "same-site" });
    return { ok: guardAllowed(r.status), detail: `status=${r.status}` };
  });

  await check("'none' SFS (address bar) → allowed", async () => {
    const r = await hitImage(args.server, { "Sec-Fetch-Site": "none" });
    return { ok: guardAllowed(r.status), detail: `status=${r.status}` };
  });

  await check("cross-site SFS beats matching Referer", async () => {
    const r = await hitImage(args.server, {
      "Sec-Fetch-Site": "cross-site",
      Referer: `${args.server}/post/x`,
    });
    return { ok: guardBlocked(r.status), detail: `status=${r.status}` };
  });

  // ── Image guard: Referer fallback (SFS missing) ──
  section("Image guard — Referer fallback");

  await check("no SFS, no Referer → allowed (curl baseline)", async () => {
    const r = await hitImage(args.server, {});
    return { ok: guardAllowed(r.status), detail: `status=${r.status}` };
  });

  await check("no SFS, evil Referer → 403", async () => {
    const r = await hitImage(args.server, { Referer: "https://evil.com/page" });
    return { ok: guardBlocked(r.status), detail: `status=${r.status}` };
  });

  await check("no SFS, malformed Referer → 403", async () => {
    const r = await hitImage(args.server, { Referer: "not a url" });
    return { ok: guardBlocked(r.status), detail: `status=${r.status}` };
  });

  await check("no SFS, subdomain confusion → 403", async () => {
    // dev allowlist is "localhost:3000,localhost" — evil host that contains
    // it must not match. Construct one that includes the allowed host.
    const r = await hitImage(args.server, {
      Referer: "https://evil.com.localhost:3000/x",
    });
    return { ok: guardBlocked(r.status), detail: `status=${r.status}` };
  });

  // ── Image guard: response headers on allowed ──
  section("Image guard — response headers");

  await check("cache + nosniff headers on allowed response", async () => {
    const r = await hitImage(args.server, { "Sec-Fetch-Site": "same-origin" });
    const cc = r.headers.get("Cache-Control") ?? "";
    const xcto = r.headers.get("X-Content-Type-Options") ?? "";
    const ok = cc.includes("immutable") && xcto === "nosniff";
    return { ok, detail: `cc='${cc}' xcto='${xcto}'` };
  });

  // ── Image guard: rate limit ──
  section("Image guard — rate limit");

  if (args.skipRateLimit) {
    console.log(`${DIM}skipped (--skip-ratelimit)${RST}`);
  } else {
    await check("burst 220 same-IP same-origin → eventually 429", async () => {
      // dev runs on loopback so all requests share one bucket. Fire 220 in
      // small batches; expect at least one 429.
      let gotLimited = false;
      let allowed = 0;
      for (let batch = 0; batch < 22; batch++) {
        const promises = Array.from({ length: 10 }, () =>
          hitImage(args.server, { "Sec-Fetch-Site": "same-origin" }),
        );
        const settled = await Promise.all(promises);
        for (const r of settled) {
          if (r.status === 429) gotLimited = true;
          else if (guardAllowed(r.status)) allowed++;
        }
        if (gotLimited) break;
      }
      return {
        ok: gotLimited,
        detail: `429=${gotLimited ? "yes" : "no"} allowed=${allowed}`,
      };
    });
  }

  // ── Path traversal under /uploads/img/ ──
  section("Static serving — path traversal");

  await check("../../etc/passwd does not escape", async () => {
    const r = await fetch(
      args.server + "/uploads/img/../../../../etc/passwd",
      { headers: { "Sec-Fetch-Site": "same-origin" } },
    );
    // Either guard rejects (403) or static normalizes + 404. A 200 with
    // root:x:0:0 content would mean traversal works → fail.
    if (r.status === 200) {
      const text = (await r.text()).slice(0, 200);
      const leaked = text.includes("root:x:");
      return { ok: !leaked, detail: leaked ? "LEAKED /etc/passwd" : "200 but not passwd" };
    }
    return { ok: true, detail: `status=${r.status}` };
  });

  // ── Admin: setup gate ──
  section("Admin — setup gate");

  await check("auth.isSetup is reachable", async () => {
    const r = await trpcCall(args.server, "auth.isSetup", undefined, {
      method: "GET",
    });
    const ok = r.status === 200;
    return { ok, detail: `status=${r.status}` };
  });

  await check("auth.setup on initialized DB → CONFLICT", async () => {
    // If admin already exists, this must NOT create another. Either CONFLICT
    // (already initialized) or UNAUTHORIZED (setup token required) is fine.
    const r = await trpcCall(args.server, "auth.setup", {
      username: "attacker",
      password: "hunter2hunter2",
      setupToken: "wrong-token",
    });
    const code = trpcErrorCode(r.body);
    const ok =
      r.status >= 400 &&
      (code === "CONFLICT" || code === "UNAUTHORIZED" || code === "BAD_REQUEST");
    return { ok, detail: `status=${r.status} code=${code ?? "?"}` };
  });

  // ── Admin: login brute-force shape ──
  section("Admin — login attempts");

  await check("login with bogus credentials → UNAUTHORIZED", async () => {
    const r = await trpcCall(args.server, "auth.loginStep1", {
      username: "definitely-not-a-user-" + Date.now(),
      password: "wrong-password",
    });
    const code = trpcErrorCode(r.body);
    return {
      ok: r.status === 401 || code === "UNAUTHORIZED",
      detail: `status=${r.status} code=${code ?? "?"}`,
    };
  });

  await check("SQL-injection-ish username does not 500", async () => {
    const r = await trpcCall(args.server, "auth.loginStep1", {
      username: "' OR '1'='1",
      password: "anything",
    });
    const code = trpcErrorCode(r.body);
    // Must be a clean auth failure, not a 500 / DB error / success.
    const leaked =
      typeof r.body === "object" &&
      r.body !== null &&
      JSON.stringify(r.body).match(/syntax|sqlite/i);
    return {
      ok: r.status === 401 && code === "UNAUTHORIZED" && !leaked,
      detail: `status=${r.status} code=${code ?? "?"}`,
    };
  });

  await check("2FA challenge consumption — bogus token rejected", async () => {
    const r = await trpcCall(args.server, "auth.loginStep2", {
      tempToken: "00".repeat(32),
      code: "000000",
    });
    const code = trpcErrorCode(r.body);
    return {
      ok: r.status === 401 || code === "UNAUTHORIZED",
      detail: `status=${r.status} code=${code ?? "?"}`,
    };
  });

  // ── Admin: adminQuery guards ──
  section("Admin — adminQuery surface");

  await check("revokeApiKey without auth → UNAUTHORIZED", async () => {
    const r = await trpcCall(args.server, "auth.revokeApiKey", undefined);
    const code = trpcErrorCode(r.body);
    return {
      ok: code === "UNAUTHORIZED" || r.status === 401,
      detail: `status=${r.status} code=${code ?? "?"}`,
    };
  });

  await check("setup2FA without auth → UNAUTHORIZED", async () => {
    const r = await trpcCall(args.server, "auth.setup2FA", undefined);
    const code = trpcErrorCode(r.body);
    return {
      ok: code === "UNAUTHORIZED" || r.status === 401,
      detail: `status=${r.status} code=${code ?? "?"}`,
    };
  });

  await check("fake session cookie does not grant admin", async () => {
    const r = await trpcCall(args.server, "auth.revokeApiKey", undefined, {
      headers: { Cookie: "session=" + "f".repeat(64) },
    });
    const code = trpcErrorCode(r.body);
    return {
      ok: code === "UNAUTHORIZED" || r.status === 401,
      detail: `status=${r.status} code=${code ?? "?"}`,
    };
  });

  if (args.apiKey) {
    await check("API key on adminQuery → FORBIDDEN (no admin via CLI)", async () => {
      // API key is valid for /api/publish but adminMiddleware rejects with 403.
      // tRPC's fetch adapter does not read x-api-key from the trpc endpoint
      // path by default — auth.context reads it, so this exercises the gate.
      const r = await trpcCall(args.server, "auth.revokeApiKey", undefined, {
        headers: { "x-api-key": args.apiKey! },
      });
      const code = trpcErrorCode(r.body);
      return {
        ok: code === "FORBIDDEN" || r.status === 403,
        detail: `status=${r.status} code=${code ?? "?"}`,
      };
    });
  }

  // ── /api/publish: API-key gate ──
  section("Publish endpoint — auth gate");

  await check("/api/publish without key → 401", async () => {
    const r = await fetch(args.server + "/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "x", title: "x", content: ["x"] }),
    });
    return { ok: r.status === 401, detail: `status=${r.status}` };
  });

  await check("/api/publish with garbage key → 401", async () => {
    const r = await fetch(args.server + "/api/publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "definitely-not-a-real-key",
      },
      body: JSON.stringify({ slug: "x", title: "x", content: ["x"] }),
    });
    return { ok: r.status === 401, detail: `status=${r.status}` };
  });

  await check("/api/publish malformed body → 400", async () => {
    const r = await fetch(args.server + "/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": "x" },
      body: "{not json",
    });
    // 401 also acceptable because key check runs first.
    return { ok: r.status === 401 || r.status === 400, detail: `status=${r.status}` };
  });

  // ── Comment surface ──
  section("Comment endpoint — spam gate");

  await check("comment with honeypot website filled → not approved", async () => {
    // Comments are pending by default anyway; the honeypot path may silently
    // drop. We only check no 500 and no leaked error.
    const r = await trpcCall(args.server, "comment.submit", {
      postId: 1,
      authorName: "spam",
      content: "buy cheap pills",
      website: "http://spam.example",
    });
    return {
      ok: r.status < 500,
      detail: `status=${r.status}`,
    };
  });

  // brief wait so async stderr lines from server flush before summary
  await sleep(50);

  // ── summary ──
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(
    `\n${failed === 0 ? GREEN : RED}${passed}/${results.length} passed${RST}`,
  );
  if (failed > 0) {
    console.log(`${RED}Failures:${RST}`);
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  - ${r.name} ${DIM}(${r.detail})${RST}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
