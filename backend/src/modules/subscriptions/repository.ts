import { eq } from "drizzle-orm";

import type { AppDb } from "../../db/index.js";
import { plans, subscriptions } from "../../db/schema.js";

export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type PlanRow = typeof plans.$inferSelect;

/** The tenant's single subscription row joined to its plan (Ruling 7). */
export async function getCurrentSubscription(
  db: AppDb,
  tenantId: string,
): Promise<{ subscription: SubscriptionRow; plan: PlanRow } | null> {
  const rows = await db
    .select({ subscription: subscriptions, plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.tenantId, tenantId))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateSubscriptionByTenant(
  db: AppDb,
  tenantId: string,
  patch: Partial<typeof subscriptions.$inferInsert>,
): Promise<SubscriptionRow | null> {
  const rows = await db
    .update(subscriptions)
    .set(patch)
    .where(eq(subscriptions.tenantId, tenantId))
    .returning();
  return rows[0] ?? null;
}

export async function findByStripeSubscriptionId(
  db: AppDb,
  stripeSubscriptionId: string,
): Promise<SubscriptionRow | null> {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);
  return rows[0] ?? null;
}
