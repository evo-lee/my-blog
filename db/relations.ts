import { relations } from "drizzle-orm";
import { works, workDetails, workTags } from "./schema";

export const worksRelations = relations(works, ({ many }) => ({
  details: many(workDetails),
  tags: many(workTags),
}));

export const workDetailsRelations = relations(workDetails, ({ one }) => ({
  work: one(works, {
    fields: [workDetails.workId],
    references: [works.id],
  }),
}));

export const workTagsRelations = relations(workTags, ({ one }) => ({
  work: one(works, {
    fields: [workTags.workId],
    references: [works.id],
  }),
}));
