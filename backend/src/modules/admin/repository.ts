import { desc, sql } from "drizzle-orm";

import type { AppDb } from "../../db/index.js";
import { webhookEvents } from "../../db/schema.js";

export type AdminTenantRow = {
  id: string;
  name: string;
  plan: string;
  status: string;
  createdAt: Date;
  memberCount: number;
};

export type JobsSnapshot = {
  pending: number;
  processing: number;
  failed: number;
  completed: number;
};

function rowsOf<T>(result: unknown): T[] {
  return (result as { rows: T[] }).rows;
}

/** Every tenant with its plan, subscription status, and member count. */
export async function listTenants(db: AppDb): Promise<AdminTenantRow[]> {
  const result = await db.execute(sql`
    select
      t.id,
      t.name,
      p.name as plan,
      s.status,
      t.created_at as created_at,
      (select count(*) from tenant_members m where m.tenant_id = t.id)::int as member_count
    from tenants t
    join subscriptions s on s.tenant_id = t.id
    join plans p on p.id = s.plan_id
    order by t.created_at
  `);

  return rowsOf<{
    id: string;
    name: string;
    plan: string;
    status: string;
    created_at: Date;
    member_count: number;
  }>(result).map((row) => ({
    id: row.id,
    name: row.name,
    plan: row.plan,
    status: row.status,
    // raw execute yields strings for timestamptz — normalize to Date
    createdAt: new Date(row.created_at),
    memberCount: Number(row.member_count),
  }));
}

/** Platform-wide counters. `failed` includes permanently dead jobs. */
export async function platformMetrics(db: AppDb): Promise<{
  totalTenants: number;
  activeSubscriptions: number;
  totalApiCalls: number;
  totalTokens: number;
  estimatedRevenue: number;
  jobs: JobsSnapshot;
}> {
  const [counts] = rowsOf<{
    total_tenants: number;
    active_subscriptions: number;
    total_api_calls: number;
    total_tokens: number;
    estimated_revenue: number;
  }>(
    await db.execute(sql`
      select
        (select count(*) from tenants)::int as total_tenants,
        (select count(*) from subscriptions where status in ('active', 'trialing'))::int as active_subscriptions,
        (select coalesce(sum(quantity), 0) from usage_events where type = 'api_call')::bigint as total_api_calls,
        (select coalesce(sum(quantity), 0) from usage_events where type = 'ai_tokens')::bigint as total_tokens,
        (select coalesce(sum(p.price_minor), 0)
           from subscriptions s join plans p on p.id = s.plan_id
          where s.status in ('active', 'trialing'))::bigint as estimated_revenue
    `),
  );

  const jobRows = rowsOf<{ status: string; n: number }>(
    await db.execute(sql`
      select status, count(*)::int as n from background_jobs group by status
    `),
  );
  const byStatus = new Map(jobRows.map((row) => [row.status, Number(row.n)]));

  return {
    totalTenants: Number(counts?.total_tenants ?? 0),
    activeSubscriptions: Number(counts?.active_subscriptions ?? 0),
    totalApiCalls: Number(counts?.total_api_calls ?? 0),
    totalTokens: Number(counts?.total_tokens ?? 0),
    estimatedRevenue: Number(counts?.estimated_revenue ?? 0),
    jobs: {
      pending: byStatus.get("pending") ?? 0,
      processing: byStatus.get("processing") ?? 0,
      failed: (byStatus.get("failed") ?? 0) + (byStatus.get("dead") ?? 0),
      completed: byStatus.get("completed") ?? 0,
    },
  };
}

/** Most recent webhook deliveries. */
export async function listWebhookEvents(db: AppDb, limit = 50) {
  return db
    .select({
      id: webhookEvents.id,
      type: webhookEvents.type,
      status: webhookEvents.status,
      receivedAt: webhookEvents.receivedAt,
    })
    .from(webhookEvents)
    .orderBy(desc(webhookEvents.receivedAt))
    .limit(limit);
}
