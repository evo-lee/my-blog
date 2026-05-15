import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "@hono/node-server/serve-static";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createHash } from "node:crypto";
import path from "node:path";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { getDb } from "./queries/connection";
import { users, posts } from "@db/schema";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { countWords } from "./lib/words";
import { cleanupExpired } from "./sessions";
import { seedData } from "../db/seed";
import { imageGuard } from "./middleware/imageGuard";
import { cleanupTmpFiles, getUploadDir } from "./lib/images";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

// /uploads/img/* — image guard + static serving. UPLOAD_DIR is resolved to an
// absolute path so process managers that change cwd don't break it.
const UPLOAD_DIR = getUploadDir();
cleanupTmpFiles().catch((err) => console.error("tmp cleanup failed:", err));

app.use("/uploads/img/*", imageGuard);
app.use(
  "/uploads/img/*",
  serveStatic({
    root: path.relative(process.cwd(), path.dirname(UPLOAD_DIR)),
    rewriteRequestPath: (p) =>
      p.replace(/^\/uploads\/img/, "/" + path.basename(UPLOAD_DIR)),
  }),
);

// tRPC API
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});

// CLI publish endpoint
app.post("/api/publish", async (c) => {
  const apiKey = c.req.header("x-api-key");
  if (!apiKey) {
    return c.json({ error: "Missing X-API-Key header" }, 401);
  }

  const db = getDb();
  const apiKeyHash = createHash("sha256").update(apiKey).digest("hex");
  const user = await db
    .select()
    .from(users)
    .where(eq(users.apiKey, apiKeyHash))
    .limit(1);

  if (user.length === 0) {
    return c.json({ error: "Invalid API Key" }, 401);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const {
    slug,
    title,
    excerpt,
    content,
    category = "LITERATURE",
    coverImage = "",
    publishedDate,
  } = body as Record<string, unknown>;

  if (
    typeof slug !== "string" ||
    typeof title !== "string" ||
    !Array.isArray(content) ||
    !content.every((p) => typeof p === "string")
  ) {
    return c.json(
      { error: "Missing or invalid fields: slug (string), title (string), content (string[])" },
      400
    );
  }

  // Check slug uniqueness
  const existing = await db
    .select()
    .from(posts)
    .where(eq(posts.slug, slug))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ error: `Slug '${slug}' already exists` }, 409);
  }

  const result = await db.insert(posts).values({
    slug,
    title,
    excerpt: typeof excerpt === "string" ? excerpt : null,
    content: JSON.stringify(content),
    category: typeof category === "string" ? category : "LITERATURE",
    coverImage: typeof coverImage === "string" && coverImage ? coverImage : null,
    publishedDate: typeof publishedDate === "string" ? publishedDate : null,
    wordCount: countWords(content),
    published: true,
  });

  return c.json({
    success: true,
    id: Number(result.lastInsertRowid),
    slug,
    url: `/article/${slug}`,
  });
});

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

// One-shot migration: SHA-256 hex digests are 64 chars; legacy plaintext
// keys were 32 hex chars (UUID without hyphens). Null any users.api_key
// value whose length is not 64 so affected admins regenerate via the
// dashboard. Idempotent — once no plaintext rows remain, this is a no-op.
async function migrateLegacyApiKeys() {
  const db = getDb();
  await db
    .update(users)
    .set({ apiKey: null })
    .where(and(isNotNull(users.apiKey), ne(sql`length(${users.apiKey})`, 64)));
}
migrateLegacyApiKeys().catch((err) =>
  console.error("api key migration failed:", err)
);

// Fresh deployments should not render an empty blog. If the posts table is
// empty, keep the generated starter content until the owner replaces it with
// real writing. Existing databases are left untouched.
async function seedStarterContentIfEmpty() {
  const db = getDb();
  const existing = await db.select({ count: sql<number>`count(*)` }).from(posts);
  if ((existing[0]?.count ?? 0) > 0) return;

  for (const post of seedData.posts) {
    await db.insert(posts).values(post);
  }
}
seedStarterContentIfEmpty().catch((err) =>
  console.error("starter content seed failed:", err)
);

// Sweep expired sessions + login challenges hourly. Cheap (indexed delete);
// keeps DB tidy in long-running deployments.
const HOUR_MS = 60 * 60 * 1000;
const sweep = () => {
  cleanupExpired().catch((err) => console.error("session cleanup failed:", err));
};
sweep();
setInterval(sweep, HOUR_MS).unref();

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
