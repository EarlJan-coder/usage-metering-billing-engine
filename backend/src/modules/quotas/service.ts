import { and, eq, gte, lt, sql } from "drizzle-orm";

import type { AppDb } from "../../db/index.js";
import {
  plans,
  subscriptions,
  usageEvents,
} from "../../db/schema.js";
import { utcMonthBounds } from "../../db/seed.js";

export type QuotaScope = "api_calls" | "tokens";

export type QuotaDecision =
  | { permitted: true }
  | {
      permitted: false;
      scope: QuotaScope;
      used: number;
      limit: number;
      reason: "quota_exceeded" | "payment_required";
    };

export type ProjectedUsage = { apiCalls: number; tokens: number };

/**
 * Decides whether one more event may be recorded — MUST be called inside
 * a transaction that already holds `SELECT … FOR UPDATE` on the tenant's
 * subscription row, so concurrent tracks serialize here (Review Focus 2).
 *
 * Boundary semantics (exact): `used + projected <= limit` permits;
 * `> limit` rejects. `limit: null` is unlimited. Statuses `active` and
 * `trialing` pass; `past_due`/`unpaid` → 402; `canceled` is treated as
 * the free plan (webhooks keep it truthful — Task 9).
 */
export async function checkQuota(
  db: AppDb | Parameters<Parameters<AppDb["transaction"]>[0]>[0],
  auth: { tenantId: string },
  projected: ProjectedUsage,
): Promise<QuotaDecision> {
  const rows = await db
    .select({
      status: subscriptions.status,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      planCode: plans.code,
      callsLimit: plans.apiCallsLimit,
      tokensLimit: plans.aiTokensLimit,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.tenantId, auth.tenantId))
    .limit(1);

  const sub = rows[0];
  if (!sub) {
    // No subscription row — treat as free with no limits recorded.
    return { permitted: true };
  }

  if (sub.status === "past_due" || sub.status === "unpaid") {
    return {
      permitted: false,
      scope: "api_calls",
      used: 0,
      limit: 0,
      reason: "payment_required",
    };
  }

  // Resolve the billing period. Free plans (and canceled subscriptions)
  // roll their period lazily to the current UTC month (Ruling 7).
  const now = new Date();
  const isFreePeriod = sub.planCode === "free" || sub.status === "canceled";
  let periodStart = sub.currentPeriodStart;
  let periodEnd = sub.currentPeriodEnd;

  if (
    isFreePeriod &&
    (!periodEnd || periodEnd <= now || !periodStart)
  ) {
    const bounds = utcMonthBounds(now);
    periodStart = bounds.start;
    periodEnd = bounds.end;
    await db
      .update(subscriptions)
      .set({
        currentPeriodStart: bounds.start,
        currentPeriodEnd: bounds.end,
        updatedAt: now,
      })
      .where(eq(subscriptions.tenantId, auth.tenantId));
  }

  // Sum usage inside the resolved period.
  const inPeriod =
    periodStart && periodEnd
      ? and(
          eq(usageEvents.tenantId, auth.tenantId),
          gte(usageEvents.createdAt, periodStart),
          lt(usageEvents.createdAt, periodEnd),
        )
      : eq(usageEvents.tenantId, auth.tenantId);

  const sums = await db
    .select({
      apiCalls: sql<number>`coalesce(sum(case when type = 'api_call' then quantity else 0 end), 0)::bigint`,
      tokens: sql<number>`coalesce(sum(case when type = 'ai_tokens' then quantity else 0 end), 0)::bigint`,
    })
    .from(usageEvents)
    .where(inPeriod);

  const usedCalls = Number(sums[0]?.apiCalls ?? 0);
  const usedTokens = Number(sums[0]?.tokens ?? 0);

  const callsLimit = sub.callsLimit;
  if (callsLimit !== null && usedCalls + projected.apiCalls > callsLimit) {
    return {
      permitted: false,
      scope: "api_calls",
      used: usedCalls,
      limit: callsLimit,
      reason: "quota_exceeded",
    };
  }

  const tokensLimit = sub.tokensLimit;
  if (tokensLimit !== null && usedTokens + projected.tokens > tokensLimit) {
    return {
      permitted: false,
      scope: "tokens",
      used: usedTokens,
      limit: tokensLimit,
      reason: "quota_exceeded",
    };
  }

  return { permitted: true };
}
