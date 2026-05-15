import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, or, desc, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { posts } from "@db/schema";
import { createRouter, publicQuery, adminQuery } from "../middleware";
import { extractCoverHash, loadImageMap, scanRefs } from "../lib/imageRefs";

// Escape SQLite LIKE wildcards so user-supplied `%` / `_` are matched
// literally instead of degenerating into a full-table scan. Paired with
// an explicit `ESCAPE '\'` clause in the LIKE expression below.
function escapeLikePattern(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}

function parseContent(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export const postRouter = createRouter({
  // 列出已发布文章（支持分页，按时间倒序）
  list: publicQuery
    .input(
      z
        .object({
          page: z.number().min(1).default(1),
          perPage: z.number().min(1).max(20).default(6),
        })
        .default({ page: 1, perPage: 6 })
    )
    .query(async ({ input }) => {
      const db = getDb();
      const offset = (input.page - 1) * input.perPage;

      const results = await db
        .select()
        .from(posts)
        .where(eq(posts.published, true))
        .orderBy(desc(posts.createdAt))
        .limit(input.perPage)
        .offset(offset);

      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(posts)
        .where(eq(posts.published, true));

      const total = countResult[0]?.count || 0;

      return {
        items: results.map((post) => ({
          ...post,
          content: parseContent(post.content),
        })),
        total,
        page: input.page,
        perPage: input.perPage,
        totalPages: Math.ceil(total / input.perPage),
      };
    }),

  // 根据 slug 获取单篇已发布文章
  // 返回 { post, images } —— images 是 markdown 里 `hash:<16hex>` 引用以及
  // cover_image 字段（若也是 hash:xxx 形式）解析后的 map。
  bySlug: publicQuery
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const result = await db
        .select()
        .from(posts)
        .where(and(eq(posts.slug, input.slug), eq(posts.published, true)))
        .limit(1);

      if (result.length === 0) return null;

      const row = result[0]!;
      const content = parseContent(row.content);

      const hashes = scanRefs(content);
      const coverHash = extractCoverHash(row.coverImage);
      if (coverHash) hashes.push(coverHash);

      const images =
        hashes.length > 0 ? await loadImageMap([...new Set(hashes)]) : {};

      return {
        post: { ...row, content },
        images,
      };
    }),

  // 搜索已发布文章
  search: publicQuery
    .input(z.object({ q: z.string().trim().min(1).max(100) }))
    .query(async ({ input }) => {
      const db = getDb();
      const pattern = `%${escapeLikePattern(input.q)}%`;
      const results = await db
        .select()
        .from(posts)
        .where(
          and(
            eq(posts.published, true),
            or(
              sql`${posts.title} LIKE ${pattern} ESCAPE '\\'`,
              sql`${posts.excerpt} LIKE ${pattern} ESCAPE '\\'`,
              sql`${posts.category} LIKE ${pattern} ESCAPE '\\'`,
              sql`${posts.publishedDate} LIKE ${pattern} ESCAPE '\\'`
            )
          )
        )
        .orderBy(desc(posts.createdAt));

      return results.map((post) => ({
        ...post,
        content: parseContent(post.content),
      }));
    }),

  // ── Admin only ──

  // 创建文章（需要 admin 认证）
  create: adminQuery
    .input(
      z.object({
        slug: z.string().min(1).max(255),
        title: z.string().min(1).max(255),
        titleZh: z.string().max(255).optional(),
        excerpt: z.string().optional(),
        excerptZh: z.string().optional(),
        content: z.array(z.string()),
        category: z.string().min(1).max(50),
        coverImage: z.string().max(255).optional(),
        publishedDate: z.string().max(20).optional(),
        wordCount: z.number().optional(),
        published: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();

      const existing = await db
        .select()
        .from(posts)
        .where(eq(posts.slug, input.slug))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Slug '${input.slug}' already exists`,
        });
      }

      const result = await db.insert(posts).values({
        ...input,
        content: JSON.stringify(input.content),
      });

      return { id: Number(result.lastInsertRowid), slug: input.slug };
    }),

  // 更新文章
  update: adminQuery
    .input(
      z.object({
        id: z.number(),
        slug: z.string().min(1).max(255).optional(),
        title: z.string().min(1).max(255).optional(),
        titleZh: z.string().max(255).optional(),
        excerpt: z.string().optional(),
        excerptZh: z.string().optional(),
        content: z.array(z.string()).optional(),
        category: z.string().min(1).max(50).optional(),
        coverImage: z.string().max(255).optional(),
        publishedDate: z.string().max(20).optional(),
        wordCount: z.number().optional(),
        published: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;

      // Preflight: row must exist; if slug is changing, no other row owns it.
      const existing = await db
        .select({ id: posts.id, slug: posts.slug })
        .from(posts)
        .where(eq(posts.id, id))
        .limit(1);

      if (existing.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Post id=${id} not found`,
        });
      }

      if (data.slug && data.slug !== existing[0].slug) {
        const dup = await db
          .select({ id: posts.id })
          .from(posts)
          .where(eq(posts.slug, data.slug))
          .limit(1);
        if (dup.length > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Slug '${data.slug}' already exists`,
          });
        }
      }

      const updateData: Record<string, unknown> = {
        ...data,
        updatedAt: new Date(),
      };
      if (data.content) {
        updateData.content = JSON.stringify(data.content);
      }

      await db.update(posts).set(updateData).where(eq(posts.id, id));
      return { id };
    }),

  // 删除文章
  delete: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(posts).where(eq(posts.id, input.id));
      return { success: true };
    }),

  // 列出所有文章（admin 用，包含草稿）
  adminList: adminQuery
    .input(
      z
        .object({
          page: z.number().min(1).default(1),
          perPage: z.number().min(1).max(50).default(20),
        })
        .default({ page: 1, perPage: 20 })
    )
    .query(async ({ input }) => {
      const db = getDb();
      const offset = (input.page - 1) * input.perPage;

      const results = await db
        .select()
        .from(posts)
        .orderBy(desc(posts.createdAt))
        .limit(input.perPage)
        .offset(offset);

      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(posts);

      const total = countResult[0]?.count || 0;

      return {
        items: results,
        total,
        page: input.page,
        perPage: input.perPage,
        totalPages: Math.ceil(total / input.perPage),
      };
    }),

  // 直接按 id 取单篇（admin 用，不受 published 过滤限制）
  adminById: adminQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const result = await db
        .select()
        .from(posts)
        .where(eq(posts.id, input.id))
        .limit(1);

      if (result.length === 0) return null;
      return result[0];
    }),
});
