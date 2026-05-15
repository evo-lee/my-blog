import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Socket } from "node:net";
import { env } from "../lib/env";

// 200 requests / minute / IP. Memory bucket: process restart resets; bucket
// for an IP that hasn't fired in >60s gets reset on next request. No GC sweep
// because the map only grows by *unique* IPs in any 60s window, which is
// bounded by request rate anyway.
const RATE_LIMIT_PER_MIN = 200;
const RATE_LIMIT_WINDOW_MS = 60_000;

interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

// Test-only: clear bucket state between tests.
export function __resetBuckets(): void {
  buckets.clear();
}

// @hono/node-server stuffs Node's IncomingMessage into c.env.incoming.
interface NodeHttpEnv {
  incoming?: { socket?: Socket };
}

function getClientIp(c: Context): string {
  if (process.env.TRUSTED_PROXY === "1") {
    const xff = c.req.header("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
  }
  // c.env may be undefined in tests / non-node-server runtimes — guard the access.
  const node = c.env as NodeHttpEnv | undefined;
  return node?.incoming?.socket?.remoteAddress ?? "anon";
}

function refererHostAllowed(
  ref: string | undefined,
  allowed: Set<string>,
): boolean {
  // Empty Referer falls through to Sec-Fetch-Site's decision. By the time we
  // reach this fn we already know SFS was missing, so empty Referer here means
  // a non-browser client (curl, share-card crawler). Allow it — images are
  // public assets; the guard only stops typical browser hotlinks.
  if (!ref) return true;
  try {
    return allowed.has(new URL(ref).host);
  } catch {
    return false;
  }
}

// Sec-Fetch-Site values from the Fetch Metadata spec:
//   "same-origin" / "same-site" — page on our own host fetched the resource → allow
//   "none"                       — user-initiated (address bar / bookmark / share card) → allow
//   "cross-site"                 — third-party page → deny
//   <missing>                    — old browser or non-browser client → fall back to Referer
function sfsVerdict(sfs: string | undefined): "allow" | "deny" | "fallback" {
  if (!sfs) return "fallback";
  if (sfs === "cross-site") return "deny";
  return "allow";
}

function parseAllowedHosts(): Set<string> {
  const raw =
    process.env.IMG_ALLOWED_HOSTS ??
    (env.isProduction ? "" : "localhost:3000,localhost");
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export const imageGuard = createMiddleware(async (c, next) => {
  // 1. Sec-Fetch-Site is the strongest signal in modern browsers; check first.
  const verdict = sfsVerdict(c.req.header("Sec-Fetch-Site"));
  if (verdict === "deny") return c.text("Forbidden", 403);
  if (verdict === "fallback") {
    const allowed = parseAllowedHosts();
    if (!refererHostAllowed(c.req.header("Referer"), allowed)) {
      return c.text("Forbidden", 403);
    }
  }

  // 2. Per-IP rate limit.
  const ip = getClientIp(c);
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else if (bucket.count >= RATE_LIMIT_PER_MIN) {
    return c.text("Too Many Requests", 429);
  } else {
    bucket.count++;
  }

  await next();

  // 3. Long cache + sniff guard. Hash filenames make this safe — content can
  // never change under a given URL.
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  c.header("X-Content-Type-Options", "nosniff");
});
