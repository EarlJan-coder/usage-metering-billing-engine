import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";

import { subscriptions, tenantMembers, users } from "../db/schema.js";
import type { DbOrTx } from "../db/index.js";
import { sessions } from "../db/schema.js";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type AuthContext = {
  userId: string;
  tenantId: string;
  role: "admin" | "member";
  platformAdmin: boolean;
};

/** Server-side hash of the raw session token (Ruling 11). */
export function hashToken(token: string): string {
  const secret = process.env.SESSION_SECRET ?? "test-session-secret-0123456789";
  return createHash("sha256").update(`${token}:${secret}`).digest("hex");
}

export function createSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/** Inserts a session row and returns the raw cookie value. */
export async function issueSession(
  db: DbOrTx,
  userId: string,
  tenantId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    tenantId,
    expiresAt,
  });
  return { token, expiresAt };
}

export async function revokeSession(
  db: DbOrTx,
  token: string,
): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

/**
 * Resolves a raw session token to an auth context. Returns null for
 * unknown, expired, or foreign-tenant rows — never throws.
 */
export async function resolveSession(
  db: DbOrTx,
  token: string | undefined,
): Promise<AuthContext | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);

  const rows = await db
    .select({
      userId: sessions.userId,
      tenantId: sessions.tenantId,
      expiresAt: sessions.expiresAt,
      role: tenantMembers.role,
      platformAdmin: users.platformAdmin,
      // compare hashes in constant time at the DB layer is impractical;
      // hash lookup is by digest, so a direct index hit is fine.
    })
    .from(sessions)
    .innerJoin(tenantMembers, and(
      eq(tenantMembers.tenantId, sessions.tenantId),
      eq(tenantMembers.userId, sessions.userId),
    ))
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(
      eq(sessions.tokenHash, tokenHash),
      gt(sessions.expiresAt, new Date()),
    ))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.userId,
    tenantId: row.tenantId,
    role: row.role,
    platformAdmin: row.platformAdmin,
  };
}

/** Constant-time compare helper for future token checks. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Verifies a subscription row exists for the tenant (register side-effect). */
export async function hasSubscription(
  db: DbOrTx,
  tenantId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .limit(1);
  return rows.length > 0;
}
