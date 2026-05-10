import { sql } from "drizzle-orm";
import {
  sqliteTable,
  integer,
  text,
} from "drizzle-orm/sqlite-core";

// ── 管理员用户表 ──
export const users = sqliteTable("users", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  username: text("username", { length: 50 }).notNull().unique(),
  passwordHash: text("password_hash", { length: 255 }).notNull(),
  totpSecret: text("totp_secret", { length: 255 }),       // 2FA 密钥
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
