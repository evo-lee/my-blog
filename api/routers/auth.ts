import { z } from "zod";
import bcrypt from "bcryptjs";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { users } from "@db/schema";
import { createRouter, publicQuery, adminQuery, createSessionToken } from "../middleware";

function setSessionCookie(resHeaders: Headers, token: string) {
  resHeaders.append(
    "Set-Cookie",
    `session=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`
  );
}

export const authRouter = createRouter({
  // ── 检查是否已初始化 ──
  isSetup: publicQuery.query(async () => {
    const db = getDb();
    const count = await db.select().from(users).limit(1);
    return { isSetup: count.length === 0 };
  }),

  // ── 初始化管理员账号（仅首次）──
  setup: publicQuery
    .input(
      z.object({
        username: z.string().min(3).max(50),
        password: z.string().min(6).max(100),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = await db.select().from(users).limit(1);
      if (existing.length > 0) {
        throw new Error("Admin already initialized");
      }

      const hash = await bcrypt.hash(input.password, 12);
      await db.insert(users).values({
        username: input.username,
        passwordHash: hash,
        isAdmin: true,
      });

      return { success: true };
    }),

  // ── 登录第一步：用户名密码 ──
  loginStep1: publicQuery
    .input(
      z.object({
        username: z.string(),
        password: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const result = await db
        .select()
        .from(users)
        .where(eq(users.username, input.username))
        .limit(1);

      if (result.length === 0) {
        throw new Error("Invalid username or password");
      }

      const user = result[0];
      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) {
        throw new Error("Invalid username or password");
      }

      // 如果已启用 2FA，返回需要 2FA 验证的状态
      if (user.totpSecret) {
        const tempToken = await createSessionToken(user.id, user.username);
        return {
          success: true,
          require2FA: true,
          tempToken,
        };
      }

      // 没有 2FA，直接签发完整 session + cookie
      const token = await createSessionToken(user.id, user.username);
      setSessionCookie(ctx.resHeaders, token);

      return {
        success: true,
        require2FA: false,
        user: { id: user.id, username: user.username },
      };
    }),

  // ── 登录第二步：2FA TOTP 验证 ──
  loginStep2: publicQuery
    .input(
      z.object({
        tempToken: z.string(),
        code: z.string().length(6),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { verifySessionToken } = await import("../middleware");
      const session = await verifySessionToken(input.tempToken);
      if (!session) {
        throw new Error("Invalid session");
      }

      const db = getDb();
      const result = await db
        .select()
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1);

      if (result.length === 0 || !result[0].totpSecret) {
        throw new Error("2FA not configured");
      }

      const verified = speakeasy.totp.verify({
        secret: result[0].totpSecret,
        encoding: "base32",
        token: input.code,
        window: 2,
      });

      if (!verified) {
        throw new Error("Invalid 2FA code");
      }

      const token = await createSessionToken(session.userId, session.username);
      setSessionCookie(ctx.resHeaders, token);

      return {
        success: true,
        user: { id: session.userId, username: session.username },
      };
    }),

  // ── 设置 2FA（生成 QR 码）──
  setup2FA: adminQuery.mutation(async ({ ctx }) => {
    const secret = speakeasy.generateSecret({
      name: `Lee's Blog (${ctx.user.username})`,
      length: 32,
    });

    const db = getDb();
    await db
      .update(users)
      .set({ totpSecret: secret.base32 })
      .where(eq(users.id, ctx.user.id));

    const qrUrl = await QRCode.toDataURL(secret.otpauth_url || "");

    return {
      secret: secret.base32,
      qrUrl,
    };
  }),

  // ── 验证并启用 2FA ──
  verify2FA: adminQuery
    .input(z.object({ code: z.string().length(6) }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const result = await db
        .select()
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      if (result.length === 0 || !result[0].totpSecret) {
        throw new Error("2FA not configured");
      }

      const verified = speakeasy.totp.verify({
        secret: result[0].totpSecret,
        encoding: "base32",
        token: input.code,
        window: 2,
      });

      if (!verified) {
        throw new Error("Invalid 2FA code");
      }

      return { success: true };
    }),

  // ── 获取当前用户 ──
  me: publicQuery.query(async ({ ctx }) => {
    if (!ctx.user) return null;

    const db = getDb();
    const result = await db
      .select({
        id: users.id,
        username: users.username,
        apiKey: users.apiKey,
        has2FA: users.totpSecret,
      })
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    if (result.length === 0) return null;

    return {
      id: result[0].id,
      username: result[0].username,
      apiKey: result[0].apiKey ? true : false,
      has2FA: !!result[0].has2FA,
    };
  }),

  // ── 生成 API Key ──
  generateApiKey: adminQuery.mutation(async ({ ctx }) => {
    const apiKey = crypto.randomUUID().replace(/-/g, "");

    const db = getDb();
    await db
      .update(users)
      .set({ apiKey })
      .where(eq(users.id, ctx.user.id));

    return { apiKey };
  }),

  // ── 删除 API Key ──
  revokeApiKey: adminQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    await db
      .update(users)
      .set({ apiKey: null })
      .where(eq(users.id, ctx.user.id));

    return { success: true };
  }),

  // ── 登出（清除 cookie）──
  logout: publicQuery.mutation(async ({ ctx }) => {
    ctx.resHeaders.append(
      "Set-Cookie",
      "session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax"
    );
    return { success: true };
  }),
});
