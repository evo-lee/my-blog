import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb } from "./queries/connection";
import { users } from "@db/schema";
import { verifySession } from "./sessions";
import { readSessionCookie } from "./cookies";

export type AuthMethod = "session" | "apikey";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user: { id: number; username: string } | null;
  authMethod: AuthMethod | null;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const req = opts.req;
  const resHeaders = opts.resHeaders;

  let user: { id: number; username: string } | null = null;
  let authMethod: AuthMethod | null = null;

  // 1. session cookie → DB lookup
  const cookieToken = readSessionCookie(req);
  if (cookieToken) {
    const session = await verifySession(cookieToken);
    if (session) {
      const db = getDb();
      const found = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1);
      if (found.length > 0) {
        user = found[0];
        authMethod = "session";
      }
    }
  }

  // 2. fallback: x-api-key header. Note: API-key auth grants only a limited
  //    surface — adminMiddleware in middleware.ts rejects it for destructive
  //    admin procedures. Use session auth from the browser for those.
  //    The DB stores SHA-256(plaintext); hash the header value before lookup.
  if (!user) {
    const apiKeyHeader = req.headers.get("x-api-key") || "";
    if (apiKeyHeader) {
      const apiKeyHash = createHash("sha256").update(apiKeyHeader).digest("hex");
      const db = getDb();
      const found = await db
        .select()
        .from(users)
        .where(eq(users.apiKey, apiKeyHash))
        .limit(1);

      if (found.length > 0) {
        user = {
          id: found[0].id,
          username: found[0].username,
        };
        authMethod = "apikey";
      }
    }
  }

  return { req, resHeaders, user, authMethod };
}
