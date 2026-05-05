import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { getDb } from "./queries/connection";
import { users, posts } from "@db/schema";
import { eq, desc } from "drizzle-orm";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

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
  const user = await db
    .select()
    .from(users)
    .where(eq(users.apiKey, apiKey))
    .limit(1);

  if (user.length === 0) {
    return c.json({ error: "Invalid API Key" }, 401);
  }

  const body = await c.req.json();
  const {
    slug,
    title,
    excerpt,
    content,
    category = "LITERATURE",
    coverImage = "",
    publishedDate,
  } = body;

  if (!slug || !title || !content || !Array.isArray(content)) {
    return c.json({ error: "Missing required fields: slug, title, content[]" }, 400);
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

  const wordCount = content.join(" ").split(/\s+/).length;

  const result = await db.insert(posts).values({
    slug,
    title,
    excerpt: excerpt || null,
    content: JSON.stringify(content),
    category,
    coverImage: coverImage || null,
    publishedDate: publishedDate || null,
    wordCount,
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

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
