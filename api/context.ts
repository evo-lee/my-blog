import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { eq } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { users } from "@db/schema";
import { verifySession } from "./sessions";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user: { id: number; username: string } | null;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const req = opts.req;
  const resHeaders = opts.resHeaders;

  let user: { id: number; username: string } | null = null;

  // 1. session cookie → DB lookup
  const cookieHeader = req.headers.get("cookie") || "";
  const sessionCookie = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("session="));

  if (sessionCookie) {
    const token = sessionCookie.replace("session=", "");
    const session = await verifySession(token);
    if (session) {
      const db = getDb();
      const found = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1);
      if (found.length > 0) user = found[0];
    }
  }

  // 2. fallback: x-api-key header (CLI publish)
  if (!user) {
    const apiKeyHeader = req.headers.get("x-api-key") || "";
    if (apiKeyHeader) {
      const db = getDb();
      const found = await db
        .select()
        .from(users)
        .where(eq(users.apiKey, apiKeyHeader))
        .limit(1);

      if (found.length > 0) {
        user = {
          id: found[0].id,
          username: found[0].username,
        };
      }
    }
  }

  return { req, resHeaders, user };
}
