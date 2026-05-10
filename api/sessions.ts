import { createHash, randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { sessions, loginChallenges } from "@db/schema";
import { getDb } from "./queries/connection";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ── Sessions ────────────────────────────────────────────────────

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const id = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const db = getDb();
  await db.insert(sessions).values({ id, userId, expiresAt });
  return token;
}

export async function verifySession(
  token: string
): Promise<{ userId: number } | null> {
  if (!token) return null;
  const id = hashToken(token);
  const db = getDb();
  const result = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .limit(1);
  if (result.length === 0) return null;
  const session = result[0];
  if (session.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  return { userId: session.userId };
}

export async function deleteSession(token: string): Promise<void> {
  if (!token) return;
  const id = hashToken(token);
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.id, id));
}

// ── Login challenges (2FA step 1 → step 2 handoff) ──────────────

export async function createLoginChallenge(userId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const id = hashToken(token);
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const db = getDb();
  await db.insert(loginChallenges).values({ id, userId, expiresAt });
  return token;
}

// 单次消费：找到则立即删除，再判断过期
export async function consumeLoginChallenge(
  token: string
): Promise<{ userId: number } | null> {
  if (!token) return null;
  const id = hashToken(token);
  const db = getDb();
  const result = await db
    .select()
    .from(loginChallenges)
    .where(eq(loginChallenges.id, id))
    .limit(1);
  if (result.length === 0) return null;
  const challenge = result[0];
  await db.delete(loginChallenges).where(eq(loginChallenges.id, id));
  if (challenge.expiresAt.getTime() < Date.now()) return null;
  return { userId: challenge.userId };
}

// ── 清理过期记录（可选，惰性调用即可，未挂定时任务）──────────────

export async function cleanupExpired(): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  await db.delete(loginChallenges).where(lt(loginChallenges.expiresAt, now));
}
