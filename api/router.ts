import { createRouter, publicQuery } from "./middleware";
import { postRouter } from "./routers/post";
import { workRouter } from "./routers/work";
import { authRouter } from "./routers/auth";
import { settingsRouter } from "./routers/settings";
import { commentRouter } from "./routers/comment";
import { uploadRouter } from "./routers/upload";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),

  post: postRouter,
  work: workRouter,
  auth: authRouter,
  settings: settingsRouter,
  comment: commentRouter,
  upload: uploadRouter,
});

export type AppRouter = typeof appRouter;
