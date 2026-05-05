import { createRouter, publicQuery } from "./middleware";
import { postRouter } from "./routers/post";
import { workRouter } from "./routers/work";
import { authRouter } from "./routers/auth";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),

  post: postRouter,
  work: workRouter,
  auth: authRouter,
});

export type AppRouter = typeof appRouter;
