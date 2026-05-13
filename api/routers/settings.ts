import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../queries/connection";
import { siteSettings } from "@db/schema";
import { SITE_DEFAULTS } from "@db/site-defaults";
import { createRouter, publicQuery, adminQuery } from "../middleware";
import { normalizeAnalytics } from "../lib/analytics";

const SETTINGS_ID = 1;

async function loadOrSeed() {
  const db = getDb();
  // Idempotent seed: if two concurrent calls race, the second INSERT becomes
  // a no-op rather than a PK-violation crash.
  await db
    .insert(siteSettings)
    .values({ id: SETTINGS_ID, ...SITE_DEFAULTS })
    .onConflictDoNothing({ target: siteSettings.id });

  const rows = await db
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.id, SETTINGS_ID))
    .limit(1);
  return rows[0];
}

export const settingsRouter = createRouter({
  get: publicQuery.query(async () => loadOrSeed()),

  update: adminQuery
    .input(
      z.object({
        siteTitle: z.string().min(1).max(100),
        heroTitleEn: z.string().min(1).max(100),
        heroTitleZh: z.string().min(1).max(100),
        heroSubtitleEn: z.string().max(500),
        heroSubtitleZh: z.string().max(500),
        icpNumber: z.string().max(100),
        publicSecurityNumber: z.string().max(100),
        copyrightEn: z.string().max(200),
        copyrightZh: z.string().max(200),
        gaMeasurementId: z.string().max(100),
        umamiSiteId: z.string().max(100),
        umamiScriptUrl: z.string().max(255),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      await loadOrSeed();

      // Each integration validates independently; blank = disabled.
      let analytics;
      try {
        analytics = normalizeAnalytics({
          gaMeasurementId: input.gaMeasurementId,
          umamiSiteId: input.umamiSiteId,
          umamiScriptUrl: input.umamiScriptUrl,
        });
      } catch (err) {
        const issues = (err as { issues?: { message: string }[] })?.issues;
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: issues?.[0]?.message ?? "Invalid analytics settings",
        });
      }

      await db
        .update(siteSettings)
        .set({ ...input, ...analytics, updatedAt: new Date() })
        .where(eq(siteSettings.id, SETTINGS_ID));
      return { success: true };
    }),
});
