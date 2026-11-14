import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";

import { AppError } from "../../middleware/error.js";
import type { AppDb } from "../../db/index.js";
import {
  plans,
  subscriptions,
  tenantMembers,
  tenants,
  users,
} from "../../db/schema.js";
import {
  issueSession,
  revokeSession,
  type AuthContext,
} from "../../services/session.js";
import { utcMonthBounds } from "../../db/seed.js";
import type { LoginInput, RegisterInput } from "./schema.js";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
};

export type AuthTenant = { id: string; name: string };

export type AuthPayload = { user: AuthUser; tenant: AuthTenant };

function publicUser(
  row: { id: string; name: string; email: string },
  role: "admin" | "member",
): AuthUser {
  return { id: row.id, name: row.name, email: row.email, role };
}

/**
 * Creates user + tenant + admin membership + free subscription + session
 * in ONE transaction (register side effects are all-or-nothing).
 */
export async function register(
  db: AppDb,
  input: RegisterInput,
): Promise<{ payload: AuthPayload; token: string }> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (existing.length > 0) {
    throw new AppError(409, "email_taken", "An account with this email already exists");
  }

  const passwordHash = bcrypt.hashSync(input.password, 10);

  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ name: input.name, email: input.email, passwordHash })
      .returning();
    if (!user) throw new AppError(500, "internal_error", "Failed to create user");

    const [tenant] = await tx
      .insert(tenants)
      .values({ name: `${input.name}'s Workspace` })
      .returning();
    if (!tenant) throw new AppError(500, "internal_error", "Failed to create tenant");

    await tx.insert(tenantMembers).values({
      tenantId: tenant.id,
      userId: user.id,
      role: "admin",
    });

    const [freePlan] = await tx
      .select()
      .from(plans)
      .where(eq(plans.code, "free"))
      .limit(1);
    if (freePlan) {
      const { start, end } = utcMonthBounds();
      await tx.insert(subscriptions).values({
        tenantId: tenant.id,
        planId: freePlan.id,
        status: "active",
        currentPeriodStart: start,
        currentPeriodEnd: end,
      });
    }

    const { token } = await issueSession(tx, user.id, tenant.id);
    return { user, tenant, token };
  });

  return {
    payload: {
      user: publicUser(result.user, "admin"),
      tenant: { id: result.tenant.id, name: result.tenant.name },
    },
    token: result.token,
  };
}

/** Login: identical 401 for unknown email and wrong password. */
export async function login(
  db: AppDb,
  input: LoginInput,
): Promise<{ payload: AuthPayload; token: string }> {
  const invalid = new AppError(
    401,
    "invalid_credentials",
    "Invalid email or password",
  );

  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  const user = rows[0];
  if (!user) throw invalid;

  const ok = bcrypt.compareSync(input.password, user.passwordHash);
  if (!ok) throw invalid;

  const memberships = await db
    .select({
      tenantId: tenantMembers.tenantId,
      role: tenantMembers.role,
      name: tenants.name,
    })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
    .where(eq(tenantMembers.userId, user.id))
    .limit(1);
  const membership = memberships[0];
  if (!membership) {
    throw new AppError(403, "forbidden", "Account has no workspace");
  }

  const { token } = await issueSession(db, user.id, membership.tenantId);
  return {
    payload: {
      user: publicUser(user, membership.role),
      tenant: { id: membership.tenantId, name: membership.name },
    },
    token,
  };
}

export async function logout(db: AppDb, token: string | undefined): Promise<void> {
  if (token) await revokeSession(db, token);
}

/** GET /auth/me — re-reads the live user/tenant from the session context. */
export async function me(
  db: AppDb,
  ctx: AuthContext,
): Promise<AuthPayload> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: tenantMembers.role,
      tenantName: tenants.name,
    })
    .from(users)
    .innerJoin(
      tenantMembers,
      and(
        eq(tenantMembers.userId, users.id),
        eq(tenantMembers.tenantId, ctx.tenantId),
      ),
    )
    .innerJoin(tenants, eq(tenants.id, ctx.tenantId))
    .where(eq(users.id, ctx.userId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new AppError(401, "unauthorized", "Session is no longer valid");
  return {
    user: publicUser(row, row.role),
    tenant: { id: ctx.tenantId, name: row.tenantName },
  };
}
