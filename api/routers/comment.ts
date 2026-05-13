import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { alias } from "drizzle-orm/sqlite-core";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { comments, posts } from "@db/schema";
import { createRouter, publicQuery, adminQuery } from "../middleware";

const submitInput = z.object({
  postId: z.number().int().positive(),
  // Optional parent for 1-level threading. Depth cap enforced server-side.
  parentId: z.number().int().positive().optional(),
  authorName: z.string().trim().min(1).max(50),
  authorEmail: z.string().trim().email().max(100).optional().or(z.literal("")),
  content: z.string().trim().min(1).max(2000),
  // Honeypot: bots tend to fill every field. Real users never see it.
  // Accept arbitrary string here; the spam branch below decides what counts.
  website: z.string().max(255).optional(),
});

export const commentRouter = createRouter({
  // Public: approved top-level comments + their approved replies.
  // Replies under unapproved/deleted parents are hidden publicly.
  listForPost: publicQuery
    .input(z.object({ postId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();

      const topLevel = await db
        .select({
          id: comments.id,
          authorName: comments.authorName,
          content: comments.content,
          createdAt: comments.createdAt,
        })
        .from(comments)
        .where(
          and(
            eq(comments.postId, input.postId),
            eq(comments.approved, true),
            isNull(comments.parentId),
          ),
        )
        .orderBy(desc(comments.createdAt));

      if (topLevel.length === 0) {
        return topLevel.map((c) => ({ ...c, replies: [] as typeof topLevel }));
      }

      const parentIds = topLevel.map((c) => c.id);
      const replies = await db
        .select({
          id: comments.id,
          parentId: comments.parentId,
          authorName: comments.authorName,
          content: comments.content,
          createdAt: comments.createdAt,
        })
        .from(comments)
        .where(
          and(
            eq(comments.postId, input.postId),
            eq(comments.approved, true),
            inArray(comments.parentId, parentIds),
          ),
        )
        .orderBy(asc(comments.createdAt));

      const byParent = new Map<number, typeof topLevel>();
      for (const r of replies) {
        if (r.parentId == null) continue;
        const list = byParent.get(r.parentId) ?? [];
        list.push({
          id: r.id,
          authorName: r.authorName,
          content: r.content,
          createdAt: r.createdAt,
        });
        byParent.set(r.parentId, list);
      }

      return topLevel.map((c) => ({
        ...c,
        replies: byParent.get(c.id) ?? [],
      }));
    }),

  // Public: submit comment (pending approval). Supports optional parentId.
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

    if (input.parentId !== undefined) {
      const parent = await db
        .select({
          id: comments.id,
          postId: comments.postId,
          parentId: comments.parentId,
        })
        .from(comments)
        .where(eq(comments.id, input.parentId))
        .limit(1);

      if (parent.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Parent comment not found",
        });
      }
      if (parent[0].postId !== input.postId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Parent comment belongs to a different post",
        });
      }
      if (parent[0].parentId !== null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Replies can only nest one level deep",
        });
      }
    }

    try {
      await db.insert(comments).values({
        postId: input.postId,
        parentId: input.parentId ?? null,
        authorName: input.authorName,
        authorEmail: input.authorEmail ? input.authorEmail : null,
        content: input.content,
        approved: false,
      });
    } catch (err) {
      // Race: admin deleted the parent between our SELECT and the INSERT.
      // The FK pragma (api/queries/connection.ts) turns this into
      // SQLITE_CONSTRAINT_FOREIGNKEY. Map to CONFLICT (not 500).
      const code = (err as { code?: string })?.code;
      if (code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Parent comment was just removed — please refresh",
        });
      }
      throw err;
    }

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

  // Admin list — filter by approved status; joins post title.
  // Exposes parentId so the moderation UI can show "Reply to: …".
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
      const parent = alias(comments, "parent");
      const baseQuery = db
        .select({
          id: comments.id,
          postId: comments.postId,
          parentId: comments.parentId,
          parentAuthorName: parent.authorName,
          postTitle: posts.title,
          postSlug: posts.slug,
          authorName: comments.authorName,
          authorEmail: comments.authorEmail,
          content: comments.content,
          approved: comments.approved,
          createdAt: comments.createdAt,
        })
        .from(comments)
        .leftJoin(posts, eq(comments.postId, posts.id))
        .leftJoin(parent, eq(comments.parentId, parent.id));

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
