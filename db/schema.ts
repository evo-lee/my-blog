import { sql } from "drizzle-orm";
import {
  sqliteTable,
  integer,
  text,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import { SITE_DEFAULTS } from "./site-defaults";

// ── 管理员用户表 ──
export const users = sqliteTable("users", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  username: text("username", { length: 50 }).notNull().unique(),
  passwordHash: text("password_hash", { length: 255 }).notNull(),
  // verified 2FA secret — login enforces TOTP iff this is set
  totpSecret: text("totp_secret", { length: 255 }),
  // pending 2FA secret — written by setup2FA, promoted to totpSecret only
  // after verify2FA succeeds. Lets the user re-scan or abort safely.
  pendingTotpSecret: text("pending_totp_secret", { length: 255 }),
  apiKey: text("api_key", { length: 255 }).unique(),     // CLI 发布用
  isAdmin: integer("is_admin", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(CURRENT_TIMESTAMP)`),
});

// ── Session 表（DB-backed sessions，cookie 持有原始 token，DB 只存 SHA-256 哈希）──
export const sessions = sqliteTable("sessions", {
  id: text("id", { length: 64 }).primaryKey(),  // SHA-256(token) hex = 64 chars
  userId: integer("user_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(CURRENT_TIMESTAMP)`),
});

// ── 2FA 登录挑战表（loginStep1 创建，loginStep2 单次消费）──
export const loginChallenges = sqliteTable("login_challenges", {
  id: text("id", { length: 64 }).primaryKey(),
  userId: integer("user_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

// ── 文章表 ──
export const posts = sqliteTable("posts", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  slug: text("slug", { length: 255 }).notNull().unique(),
  title: text("title", { length: 255 }).notNull(),
  titleZh: text("title_zh", { length: 255 }),
  excerpt: text("excerpt"),
  excerptZh: text("excerpt_zh"),
  content: text("content").notNull(), // JSON string
  category: text("category", { length: 50 }).notNull(),
  coverImage: text("cover_image", { length: 255 }),
  publishedDate: text("published_date", { length: 20 }),
  wordCount: integer("word_count", { mode: "number" }).default(0),
  published: integer("published", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(CURRENT_TIMESTAMP)`),
});

// ── 作品表 ──
export const works = sqliteTable("works", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  slug: text("slug", { length: 255 }).notNull().unique(),
  title: text("title", { length: 255 }).notNull(),
  subtitle: text("subtitle", { length: 255 }),
  category: text("category", { length: 50 }).notNull(),
  description: text("description"),
  year: text("year", { length: 10 }),
  coverImage: text("cover_image", { length: 255 }),
  link: text("link", { length: 255 }),
  published: integer("published", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(CURRENT_TIMESTAMP)`),
});

// ── 作品详情段落表 ──
export const workDetails = sqliteTable("work_details", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  workId: integer("work_id", { mode: "number" }).notNull().references(() => works.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  sortOrder: integer("sort_order", { mode: "number" }).default(0),
});

// ── 作品标签表 ──
export const workTags = sqliteTable("work_tags", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  workId: integer("work_id", { mode: "number" }).notNull().references(() => works.id, { onDelete: "cascade" }),
  name: text("name", { length: 50 }).notNull(),
});

// ── 站点设置表（单行，id=1）──
export const siteSettings = sqliteTable("site_settings", {
  id: integer("id", { mode: "number" }).primaryKey(),
  siteTitle: text("site_title", { length: 100 }).notNull().default(SITE_DEFAULTS.siteTitle),
  heroTitleEn: text("hero_title_en", { length: 100 }).notNull().default(SITE_DEFAULTS.heroTitleEn),
  heroTitleZh: text("hero_title_zh", { length: 100 }).notNull().default(SITE_DEFAULTS.heroTitleZh),
  heroSubtitleEn: text("hero_subtitle_en").notNull().default(SITE_DEFAULTS.heroSubtitleEn),
  heroSubtitleZh: text("hero_subtitle_zh").notNull().default(SITE_DEFAULTS.heroSubtitleZh),
  icpNumber: text("icp_number", { length: 100 }).notNull().default(SITE_DEFAULTS.icpNumber),
  publicSecurityNumber: text("public_security_number", { length: 100 }).notNull().default(SITE_DEFAULTS.publicSecurityNumber),
  copyrightEn: text("copyright_en", { length: 200 }).notNull().default(SITE_DEFAULTS.copyrightEn),
  copyrightZh: text("copyright_zh", { length: 200 }).notNull().default(SITE_DEFAULTS.copyrightZh),
  // Analytics: each integration toggles on independently. Empty string = off.
  // GA4 expects an id matching ^G-[A-Z0-9]{6,}$. Umami needs both a UUID site
  // id and an https script URL. Validation lives in api/lib/analytics.ts.
  gaMeasurementId: text("ga_measurement_id", { length: 100 }).notNull().default(SITE_DEFAULTS.gaMeasurementId),
  umamiSiteId: text("umami_site_id", { length: 100 }).notNull().default(SITE_DEFAULTS.umamiSiteId),
  umamiScriptUrl: text("umami_script_url", { length: 255 }).notNull().default(SITE_DEFAULTS.umamiScriptUrl),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(CURRENT_TIMESTAMP)`),
});

// ── 图片表 ──
// hash 是 sha256(input).slice(0, 16) —— 16 hex chars, 64-bit 碰撞域；个人博客规模够用。
// variants 是 JSON-stringified ImageVariant[]: { width, format, storageKey, bytes? }
// storageKey 只存相对文件名（如 "abc1234567890def-960.webp"）；公开 URL 在响应/前端
// 边界拼 "/uploads/img/" + storageKey，避免把绝对路径锁进 DB。
export const images = sqliteTable("images", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  hash: text("hash", { length: 16 }).notNull().unique(),
  origName: text("orig_name", { length: 255 }).notNull(),
  origMime: text("orig_mime", { length: 50 }).notNull(),
  origBytes: integer("orig_bytes", { mode: "number" }).notNull(),
  width: integer("width", { mode: "number" }).notNull(),
  height: integer("height", { mode: "number" }).notNull(),
  variants: text("variants").notNull(),
  uploadedBy: integer("uploaded_by", { mode: "number" }).references(
    () => users.id,
    { onDelete: "set null" },
  ),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(CURRENT_TIMESTAMP)`),
});

// ── 评论表 ──
export const comments = sqliteTable("comments", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  postId: integer("post_id", { mode: "number" })
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  // Self-reference for 1-level threading. Depth cap (parent.parent_id IS NULL)
  // enforced in api/routers/comment.ts submit.
  parentId: integer("parent_id", { mode: "number" }).references(
    (): AnySQLiteColumn => comments.id,
    { onDelete: "cascade" },
  ),
  authorName: text("author_name", { length: 50 }).notNull(),
  authorEmail: text("author_email", { length: 100 }),
  content: text("content").notNull(),
  approved: integer("approved", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(CURRENT_TIMESTAMP)`),
});
