import { initTRPC, TRPCError } from "@trpc/server";
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
