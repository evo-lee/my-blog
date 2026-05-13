// Single source of truth for site settings defaults.
// Used by the API seed (api/routers/settings.ts), the client fallback
// (src/hooks/useSettings.ts), and the SQL column defaults (db/schema.ts).

export const SITE_DEFAULTS = {
  siteTitle: "Lee's Blog",
  heroTitleEn: "Evo Lee",
  heroTitleZh: "Evo Lee",
  heroSubtitleEn: "Thoughts on literature, design, and the quiet spaces in between.",
  heroSubtitleZh: "关于文学、设计，以及其间安静角落的思考。",
  icpNumber: "",
  publicSecurityNumber: "",
  copyrightEn: "© 2026 — All rights reserved",
  copyrightZh: "© 2026 — 保留所有权利",
  // Each analytics integration is independently enabled by setting its
  // identifier (and, for Umami, its script URL) to a non-empty value.
  gaMeasurementId: "",
  umamiSiteId: "",
  umamiScriptUrl: "",
} as const;

export type SiteSettingsDefaults = typeof SITE_DEFAULTS;
