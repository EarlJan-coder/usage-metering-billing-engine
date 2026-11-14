import { and, eq } from "drizzle-orm";

import type { AppDb, DbOrTx } from "../../db/index.js";
import {
  plans,
  subscriptions,
  tenantMembers,
  tenants,
} from "../../db/schema.js";
import { utcMonthBounds } from "../../db/seed.js";
import { AppError } from "../../middleware/error.js";
import type { CreateTenantInput } from "./schema.js";

export type TenantListItem = {
  id: string;
  name: string;
  role: "admin" | "member";
  createdAt: Date;
};

export type TenantDetail = TenantListItem;

/** All tenants the user is a member of, with their role. */
export async function listUserTenants(
  db: AppDb,
  userId: string,
): Promise<TenantListItem[]> {
  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      role: tenantMembers.role,
      createdAt: tenants.createdAt,
    })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
    .where(eq(tenantMembers.userId, userId))
    .orderBy(tenants.createdAt);

  return rows;
}

/**
 * Tenant detail scoped to membership: a tenant the user does not belong to
 * is indistinguishable from one that does not exist (404, IDOR guard).
 */
export async function getTenantForMember(
  db: AppDb,
  userId: string,
  tenantId: string,
): Promise<TenantDetail | null> {
  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      role: tenantMembers.role,
      createdAt: tenants.createdAt,
    })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
    .where(
      and(
        eq(tenantMembers.userId, userId),
        eq(tenantMembers.tenantId, tenantId),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/** Creates a tenant + admin membership + free subscription in one tx. */
export async function createTenant(
  db: AppDb,
  userId: string,
  input: CreateTenantInput,
): Promise<TenantDetail> {
  return db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({ name: input.name })
      .returning();
    if (!tenant) throw new AppError(500, "internal_error", "Failed to create tenant");

    await tx.insert(tenantMembers).values({
      tenantId: tenant.id,
      userId,
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

    return {
      id: tenant.id,
      name: tenant.name,
      role: "admin" as const,
      createdAt: tenant.createdAt,
    };
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolves a plan by UUID or code (checkout accepts either — Task 9). */
export async function findPlan(
  db: AppDb | DbOrTx,
  idOrCode: string,
): Promise<{ id: string; code: string; priceMinor: number } | null> {
  const select = {
    id: plans.id,
    code: plans.code,
    priceMinor: plans.priceMinor,
    active: plans.active,
  };

  let row;
  if (UUID_RE.test(idOrCode)) {
    const rows = await db
      .select(select)
      .from(plans)
      .where(eq(plans.id, idOrCode))
      .limit(1);
    row = rows[0];
  } else {
    const rows = await db
      .select(select)
      .from(plans)
      .where(eq(plans.code, idOrCode))
      .limit(1);
    row = rows[0];
  }

  if (!row || !row.active) return null;
  return row;
}
