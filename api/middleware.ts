import { initTRPC, TRPCError } from "@trpc/server";
import { SignJWT, jwtVerify } from "jose";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

// ── 需要登录（session cookie 或 API Key）──
const authedMiddleware = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Please login or provide a valid API key",
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const authedQuery = t.procedure.use(authedMiddleware);

// ── 需要管理员权限（所有注册用户默认是 admin）──
const adminMiddleware = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Please login or provide a valid API key",
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminQuery = t.procedure.use(adminMiddleware);

// ── JWT 工具 ──
const JWT_SECRET = new TextEncoder().encode(
  process.env.APP_SECRET || "lee-blog-jwt-secret-change-me"
);

export async function createSessionToken(userId: number, username: string): Promise<string> {
  return new SignJWT({ username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { clockTolerance: 60 });
    return {
      userId: Number(payload.sub),
      username: String(payload.username),
    };
  } catch {
    return null;
  }
}
