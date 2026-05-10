import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { works, workDetails, workTags } from "@db/schema";
import { createRouter, publicQuery } from "../middleware";

export const workRouter = createRouter({
  // 列出所有已发布作品
  list: publicQuery.query(async () => {
    const db = getDb();
    return db
      .select()
      .from(works)
      .where(eq(works.published, true))
      .orderBy(asc(works.createdAt));
  }),

  // 根据 slug 获取单个已发布作品（含详情段落和标签）
  bySlug: publicQuery
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const workResult = await db
        .select()
        .from(works)
        .where(and(eq(works.slug, input.slug), eq(works.published, true)))
        .limit(1);

      if (workResult.length === 0) return null;

      const work = workResult[0];

      const details = await db
        .select()
        .from(workDetails)
        .where(eq(workDetails.workId, work.id))
        .orderBy(asc(workDetails.sortOrder));

      const tags = await db
        .select({ name: workTags.name })
        .from(workTags)
        .where(eq(workTags.workId, work.id));

      return {
        ...work,
        details: details.map((d) => d.content),
        tags: tags.map((t) => t.name),
      };
    }),
});
