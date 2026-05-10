import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

// ── Authenticated: session cookie OR API key ──
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

// ── Admin: session cookie ONLY ──
// API keys are restricted to the publish surface (CLI workflow) — they must
// not be able to delete posts, rotate keys, or change 2FA. Browser admin
// actions go through the session cookie path.
const adminMiddleware = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Please login",
    });
  }
  if (ctx.authMethod !== "session") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "API keys cannot perform admin actions — log in via the browser",
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminQuery = t.procedure.use(adminMiddleware);
