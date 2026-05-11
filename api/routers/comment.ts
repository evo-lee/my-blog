import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, desc, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { comments, posts } from "@db/schema";
import { createRouter, publicQuery, adminQuery } from "../middleware";

const submitInput = z.object({
  postId: z.number().int().positive(),
  authorName: z.string().trim().min(1).max(50),
  authorEmail: z.string().trim().email().max(100).optional().or(z.literal("")),
  content: z.string().trim().min(1).max(2000),
  // Honeypot: bots tend to fill every field. Real users never see it.
  // Accept arbitrary string here; the spam branch below decides what counts.
  website: z.string().max(255).optional(),
});

export const commentRouter = createRouter({
  // Public: approved comments for a post
  listForPost: publicQuery
    .input(z.object({ postId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({
          id: comments.id,
          authorName: comments.authorName,
          content: comments.content,
          createdAt: comments.createdAt,
        })
        .from(comments)
        .where(and(eq(comments.postId, input.postId), eq(comments.approved, true)))
        .orderBy(desc(comments.createdAt));
      return rows;
    }),

  // Public: submit comment (pending approval)
  submit: publicQuery.input(submitInput).mutation(async ({ input }) => {
    if (input.website && input.website.length > 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Spam detected" });
    }

    const db = getDb();
    const post = await db
      .select({ id: posts.id, published: posts.published })
      .from(posts)
      .where(eq(posts.id, input.postId))
      .limit(1);

    if (post.length === 0 || !post[0].published) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
    }

    await db.insert(comments).values({
      postId: input.postId,
      authorName: input.authorName,
      authorEmail: input.authorEmail ? input.authorEmail : null,
      content: input.content,
      approved: false,
    });

    return { success: true, pending: true };
  }),

  // ── Admin ──

  // Pending count for dashboard badge
  pendingCount: adminQuery.query(async () => {
    const db = getDb();
    const r = await db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(eq(comments.approved, false));
    return r[0]?.count ?? 0;
  }),

  // Admin list — filter by approved status; joins post title
  adminList: adminQuery
    .input(
      z
        .object({
          status: z.enum(["pending", "approved", "all"]).default("pending"),
        })
        .default({ status: "pending" })
    )
    .query(async ({ input }) => {
      const db = getDb();
      const baseQuery = db
        .select({
          id: comments.id,
          postId: comments.postId,
          postTitle: posts.title,
          postSlug: posts.slug,
          authorName: comments.authorName,
          authorEmail: comments.authorEmail,
          content: comments.content,
          approved: comments.approved,
          createdAt: comments.createdAt,
        })
        .from(comments)
        .leftJoin(posts, eq(comments.postId, posts.id));

      const filtered =
        input.status === "all"
          ? baseQuery
          : baseQuery.where(eq(comments.approved, input.status === "approved"));

      return filtered.orderBy(desc(comments.createdAt));
    }),

  approve: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db
        .update(comments)
        .set({ approved: true })
        .where(eq(comments.id, input.id));
      if (result.changes === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
      }
      return { success: true };
    }),

  unapprove: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db
        .update(comments)
        .set({ approved: false })
        .where(eq(comments.id, input.id));
      if (result.changes === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
      }
      return { success: true };
    }),

  delete: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.delete(comments).where(eq(comments.id, input.id));
      if (result.changes === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
      }
      return { success: true };
    }),
});
