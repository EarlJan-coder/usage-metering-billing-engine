import { and, eq, gte, lt, sql } from "drizzle-orm";

import type { AppDb } from "../../db/index.js";
import { usageEvents } from "../../db/schema.js";
import { utcMonthBounds } from "../../db/seed.js";
import { AppError } from "../../middleware/error.js";
import { getCurrentSubscription } from "../subscriptions/repository.js";

export type BillingSummaryPayload = {
  estimatedCost: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  nextInvoiceAt: string;
  status: string;
};

/**
 * GET /billing/summary (§6G): the current billing period from the
 * subscription, the in-period metered cost so far, and the subscription
 * status verbatim. The next invoice lands at period end.
 */
export async function getBillingSummary(
  db: AppDb,
  tenantId: string,
): Promise<BillingSummaryPayload> {
  const current = await getCurrentSubscription(db, tenantId);
  if (!current) throw new AppError(404, "not_found", "Subscription not found");

  const { subscription } = current;
  const month = utcMonthBounds();
  const periodStart = subscription.currentPeriodStart ?? month.start;
  const periodEnd = subscription.currentPeriodEnd ?? month.end;

  const rows = await db
    .select({
      cost: sql<number>`coalesce(sum(cost_minor), 0)::bigint`,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.tenantId, tenantId),
        gte(usageEvents.createdAt, periodStart),
        lt(usageEvents.createdAt, periodEnd),
      ),
    );

  return {
    estimatedCost: Number(rows[0]?.cost ?? 0),
    currency: "USD",
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    nextInvoiceAt: periodEnd.toISOString(),
    status: subscription.status,
  };
}
