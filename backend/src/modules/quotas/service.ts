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

type DbLike = AppDb | Parameters<Parameters<AppDb["transaction"]>[0]>[0];

const DAY_MS = 24 * 3600 * 1000;

/** Adds one calendar month in UTC (day-of-month overflow clamps like JS dates). */
function addUtcMonth(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/**
 * Decides whether one more event may be recorded — MUST be called inside
 * a transaction that already holds the tenant serialization lock (the
 * subscription `FOR UPDATE` row lock plus the per-tenant advisory lock),
 * so concurrent tracks cannot race past the limit (Review Focus 2).
 *
 * FAILS CLOSED (code review, Critical): a missing subscription row is
 * held to the free plan's limits — never unlimited — and a stale billing
 * period (webhook lag on a paid plan) is rolled forward so the usage
 * window always includes "now". Boundary semantics (exact):
 * `used + projected <= limit` permits; `> limit` rejects. `limit: null`
 * is unlimited. Statuses `active`/`trialing` pass; `past_due`/`unpaid` →
 * 402; `canceled` is treated as the free plan (Ruling 7).
 */
export async function checkQuota(
  db: DbLike,
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

  const now = new Date();
  const sub = rows[0];

  let callsLimit: number | null;
  let tokensLimit: number | null;
  let windowStart: Date;
  let windowEnd: Date;

  if (sub) {
    if (sub.status === "past_due" || sub.status === "unpaid") {
      return {
        permitted: false,
        scope: "api_calls",
        used: 0,
        limit: 0,
        reason: "payment_required",
      };
    }
    callsLimit = sub.callsLimit;
    tokensLimit = sub.tokensLimit;

    // Resolve the billing period. Any plan whose period has elapsed is
    // rolled forward inside this lock so the usage window covers "now" —
    // a delayed/lost Stripe renewal webhook must never disable quota
    // (Critical #2). The eventual webhook overwrites with exact bounds.
    let periodStart = sub.currentPeriodStart;
    let periodEnd = sub.currentPeriodEnd;

    if (!periodStart || !periodEnd || periodEnd <= now) {
      if (sub.planCode === "free" || sub.status === "canceled") {
        const bounds = utcMonthBounds(now);
        periodStart = bounds.start;
        periodEnd = bounds.end;
      } else {
        // paid plan: advance whole intervals from the stale period
        let start = periodStart ?? utcMonthBounds(now).start;
        let end = periodEnd ?? addUtcMonth(start);
        while (end.getTime() <= now.getTime()) {
          start = addUtcMonth(start);
          end = addUtcMonth(end);
        }
        periodStart = start;
        periodEnd = end;
      }
      await db
        .update(subscriptions)
        .set({
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          updatedAt: now,
        })
        .where(eq(subscriptions.tenantId, auth.tenantId));
    }

    windowStart = periodStart;
    windowEnd = periodEnd;
  } else {
    // No subscription row: fail CLOSED to the free plan's limits against
    // the current UTC month (Critical #1). Missing configuration must
    // never mean free unlimited metering.
    const [freePlan] = await db
      .select()
      .from(plans)
      .where(eq(plans.code, "free"))
      .limit(1);
    if (!freePlan) {
      throw new Error(
        "tenant has no subscription and no free plan is configured",
      );
    }
    callsLimit = freePlan.apiCallsLimit;
    tokensLimit = freePlan.aiTokensLimit;
    const bounds = utcMonthBounds(now);
    windowStart = bounds.start;
    windowEnd = bounds.end;
  }

  // Sum usage inside the resolved window.
  const sums = await db
    .select({
      apiCalls: sql<number>`coalesce(sum(case when type = 'api_call' then quantity else 0 end), 0)::bigint`,
      tokens: sql<number>`coalesce(sum(case when type = 'ai_tokens' then quantity else 0 end), 0)::bigint`,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.tenantId, auth.tenantId),
        gte(usageEvents.createdAt, windowStart),
        lt(usageEvents.createdAt, windowEnd),
      ),
    );

  const usedCalls = Number(sums[0]?.apiCalls ?? 0);
  const usedTokens = Number(sums[0]?.tokens ?? 0);

  if (callsLimit !== null && usedCalls + projected.apiCalls > callsLimit) {
    return {
      permitted: false,
      scope: "api_calls",
      used: usedCalls,
      limit: callsLimit,
      reason: "quota_exceeded",
    };
  }

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
