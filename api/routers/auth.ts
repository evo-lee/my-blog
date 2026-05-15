import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getDb } from "../queries/connection";
import { users } from "@db/schema";
import { env } from "../lib/env";

// API keys are stored in users.api_key as a SHA-256 hex digest (64 chars).
// The plaintext value is returned to the admin once at generation time and
// never persisted, mirroring the session-token pattern in sessions.ts.
function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

function setupTokenMatches(input: string, expected: string): boolean {
  const inputHash = createHash("sha256").update(input).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(inputHash, expectedHash);
}
import { createRouter, publicQuery, adminQuery } from "../middleware";
import {
  createSession,
  deleteSession,
  createLoginChallenge,
  consumeLoginChallenge,
} from "../sessions";
import {
  readSessionCookie,
  writeSessionCookie,
  clearSessionCookie,
} from "../cookies";

export const authRouter = createRouter({
  // ── 检查是否已初始化 ──
  isSetup: publicQuery.query(async () => {
    const db = getDb();
    const count = await db.select().from(users).limit(1);
    return {
      isSetup: count.length === 0,
      requiresSetupToken: !!env.adminSetupToken,
    };
  }),

  // ── 初始化管理员账号（仅首次）──
  setup: publicQuery
    .input(
      z.object({
        username: z.string().min(3).max(50),
        password: z.string().min(6).max(100),
        setupToken: z.string().max(200).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const expectedSetupToken = env.adminSetupToken;
      if (
        expectedSetupToken &&
        !setupTokenMatches(input.setupToken ?? "", expectedSetupToken)
      ) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid setup token",
        });
      }

      const hash = await bcrypt.hash(input.password, 12);

      // Serialize concurrent setups via a transaction so two simultaneous
      // requests can't both pass the check-then-insert and create two admins.
      try {
        db.transaction((tx) => {
          const existing = tx.select().from(users).limit(1).all();
          if (existing.length > 0) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Admin already initialized",
            });
          }
          tx.insert(users).values({
            username: input.username,
            passwordHash: hash,
            isAdmin: true,
          }).run();
        });
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to initialize admin",
        });
      }

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
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid username or password",
        });
      }

      const user = result[0];
      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid username or password",
        });
      }

      // 启用 2FA：签发短时挑战 token，等待 step2 提交 TOTP 验证码
      if (user.totpSecret) {
        const tempToken = await createLoginChallenge(user.id);
        return {
          success: true,
          require2FA: true,
          tempToken,
        };
      }

      // 无 2FA：直接签发 session + 写 cookie
      const token = await createSession(user.id);
      writeSessionCookie(ctx.resHeaders, token);

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
      const challenge = await consumeLoginChallenge(input.tempToken);
      if (!challenge) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid or expired challenge",
        });
      }

      const db = getDb();
      const result = await db
        .select()
        .from(users)
        .where(eq(users.id, challenge.userId))
        .limit(1);

      if (result.length === 0 || !result[0].totpSecret) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "2FA not configured",
        });
      }

      const verified = speakeasy.totp.verify({
        secret: result[0].totpSecret,
        encoding: "base32",
        token: input.code,
        window: 2,
      });

      if (!verified) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid 2FA code",
        });
      }

      const token = await createSession(challenge.userId);
      writeSessionCookie(ctx.resHeaders, token);

      return {
        success: true,
        user: { id: result[0].id, username: result[0].username },
      };
    }),

  // ── 设置 2FA：把秘钥存为 pending，等 verify2FA 成功后再正式启用 ──
  setup2FA: adminQuery.mutation(async ({ ctx }) => {
    const secret = speakeasy.generateSecret({
      name: `Lee's Blog (${ctx.user.username})`,
      length: 32,
    });

    const db = getDb();
    await db
      .update(users)
      .set({ pendingTotpSecret: secret.base32 })
      .where(eq(users.id, ctx.user.id));

    const qrUrl = await QRCode.toDataURL(secret.otpauth_url || "");

    return {
      secret: secret.base32,
      qrUrl,
    };
  }),

  // ── 验证 pending TOTP，并把它正式启用 ──
  verify2FA: adminQuery
    .input(z.object({ code: z.string().length(6) }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const result = await db
        .select()
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      if (result.length === 0 || !result[0].pendingTotpSecret) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No pending 2FA — call setup2FA first",
        });
      }

      const verified = speakeasy.totp.verify({
        secret: result[0].pendingTotpSecret,
        encoding: "base32",
        token: input.code,
        window: 2,
      });

      if (!verified) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid 2FA code",
        });
      }

      // Promote pending → active
      await db
        .update(users)
        .set({
          totpSecret: result[0].pendingTotpSecret,
          pendingTotpSecret: null,
        })
        .where(eq(users.id, ctx.user.id));

      return { success: true };
    }),

  // ── 取消 pending 2FA setup ──
  cancel2FASetup: adminQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    await db
      .update(users)
      .set({ pendingTotpSecret: null })
      .where(eq(users.id, ctx.user.id));
    return { success: true };
  }),

  // ── 移除已启用的 2FA；之后可重新 setup → verify ──
  disable2FA: adminQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    await db
      .update(users)
      .set({ totpSecret: null, pendingTotpSecret: null })
      .where(eq(users.id, ctx.user.id));
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
  // Returns the plaintext key to the caller exactly once; only the SHA-256
  // hash is stored, so DB exfiltration alone cannot grant publish access.
  generateApiKey: adminQuery.mutation(async ({ ctx }) => {
    const apiKey = randomBytes(32).toString("hex");

    const db = getDb();
    await db
      .update(users)
      .set({ apiKey: hashApiKey(apiKey) })
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

  // ── 登出（DB 删 session + 清除 cookie）──
  logout: publicQuery.mutation(async ({ ctx }) => {
    const token = readSessionCookie(ctx.req);
    if (token) await deleteSession(token);
    clearSessionCookie(ctx.resHeaders);
    return { success: true };
  }),
});
