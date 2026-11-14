import { sql } from "drizzle-orm";

import type { AppDb } from "../../db/index.js";
import { usageMonthlyRollups } from "../../db/schema.js";
import { utcMonthBounds } from "../../db/seed.js";

/**
 * monthly_rollup job: upserts one usage_monthly_rollups row per tenant for
 * the PREVIOUS UTC month. Recomputation is idempotent — re-running simply
 * overwrites the counters with the same totals.
 *
 * payload: { tenantId?: string } — omitted means every tenant.
 */
export async function monthlyRollupHandler(
  db: AppDb,
  payload: Record<string, unknown>,
): Promise<void> {
  const now = new Date();
  const { start: currentStart } = utcMonthBounds(now);
  const prevStart = utcMonthBounds(new Date(currentStart.getTime() - 1)).start;

  const explicit = payload.tenantId;
  const where =
    typeof explicit === "string" && explicit.length > 0
      ? sql`tenant_id = ${explicit}`
      : sql`true`;

  const sums = await db.execute(sql`
    select
      tenant_id,
      coalesce(sum(case when type = 'api_call' then quantity else 0 end), 0)::bigint as api_calls,
      coalesce(sum(case when type = 'ai_tokens' then quantity else 0 end), 0)::bigint as tokens,
      coalesce(sum(cost_minor), 0)::bigint as cost_minor
    from usage_events
    where ${where} and created_at >= ${prevStart} and created_at < ${currentStart}
    group by tenant_id
  `);

  for (const row of (sums as unknown as {
    rows: Array<{
      tenant_id: string;
      api_calls: number;
      tokens: number;
      cost_minor: number;
    }>;
  }).rows) {
    const values = {
      tenantId: row.tenant_id,
      periodStart: prevStart,
      apiCalls: Number(row.api_calls),
      tokens: Number(row.tokens),
      costMinor: Number(row.cost_minor),
    };
    await db
      .insert(usageMonthlyRollups)
      .values(values)
      .onConflictDoUpdate({
        target: [usageMonthlyRollups.tenantId, usageMonthlyRollups.periodStart],
        set: {
          apiCalls: values.apiCalls,
          tokens: values.tokens,
          costMinor: values.costMinor,
        },
      });
  }
}
