import { sql } from "drizzle-orm";

import type { AppDb } from "../../db/index.js";
import { usageAlerts } from "../../db/schema.js";
import { utcMonthBounds } from "../../db/seed.js";
import { getCurrentSubscription } from "../../modules/subscriptions/repository.js";

const THRESHOLDS = [
  { threshold: 80, severity: "warning" as const },
  { threshold: 100, severity: "critical" as const },
];

/**
 * usage_alerts job: compares current-period usage against the plan limits
 * and records one alert per crossed threshold per metric. The unique
 * (tenant, metric, threshold, periodStart) index makes re-runs no-ops.
 *
 * payload: { tenantId?: string } — omitted means every tenant.
 */
export async function usageAlertsHandler(
  db: AppDb,
  payload: Record<string, unknown>,
): Promise<void> {
  const tenantIds = await resolveTenantIds(db, payload);

  for (const tenantId of tenantIds) {
    const current = await getCurrentSubscription(db, tenantId);
    if (!current) continue;

    const { subscription, plan } = current;
    const periodStart =
      subscription.currentPeriodStart ?? utcMonthBounds().start;
    const periodEnd = subscription.currentPeriodEnd;

    const where =
      periodEnd != null
        ? sql`tenant_id = ${tenantId} and created_at >= ${periodStart} and created_at < ${periodEnd}`
        : sql`tenant_id = ${tenantId} and created_at >= ${periodStart}`;

    const sums = await db.execute(sql`
      select
        coalesce(sum(case when type = 'api_call' then quantity else 0 end), 0)::bigint as api_calls,
        coalesce(sum(case when type = 'ai_tokens' then quantity else 0 end), 0)::bigint as tokens
      from usage_events
      where ${where}
    `);
    const row = (sums as unknown as { rows: Array<Record<string, unknown>> })
      .rows[0];
    const usedCalls = Number(row?.api_calls ?? 0);
    const usedTokens = Number(row?.tokens ?? 0);

    const metrics = [
      { metric: "api_calls" as const, used: usedCalls, limit: plan.apiCallsLimit },
      { metric: "tokens" as const, used: usedTokens, limit: plan.aiTokensLimit },
    ];

    for (const { metric, used, limit } of metrics) {
      if (!limit || limit <= 0) continue; // null = unlimited
      for (const { threshold, severity } of THRESHOLDS) {
        if (used * 100 < limit * threshold) continue;
        await db
          .insert(usageAlerts)
          .values({
            tenantId,
            metric,
            threshold,
            severity,
            message: `${metric} usage at ${threshold}% of the plan limit (${used}/${limit})`,
            periodStart,
          })
          .onConflictDoNothing();
      }
    }
  }
}

async function resolveTenantIds(
  db: AppDb,
  payload: Record<string, unknown>,
): Promise<string[]> {
  const explicit = payload.tenantId;
  if (typeof explicit === "string" && explicit.length > 0) {
    return [explicit];
  }
  const rows = await db.execute(
    sql`select distinct tenant_id from subscriptions order by tenant_id`,
  );
  return (rows as unknown as { rows: Array<{ tenant_id: string }> }).rows.map(
    (row) => row.tenant_id,
  );
}
