import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { users } from "@db/schema";

const JWT_SECRET = new TextEncoder().encode(
  process.env.APP_SECRET || "lee-blog-jwt-secret-change-me"
);

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

  // 1. 尝试从 session cookie 读取 JWT
  let user: { id: number; username: string } | null = null;

  const cookieHeader = req.headers.get("cookie") || "";
  const sessionCookie = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("session="));

  if (sessionCookie) {
    const token = sessionCookie.replace("session=", "");
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET, { clockTolerance: 60 });
      if (payload.sub && payload.username) {
        user = {
          id: Number(payload.sub),
          username: String(payload.username),
        };
      }
    } catch {
      user = null;
    }
  }

  // 2. 如果没有 session，尝试从 API Key header 验证
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
