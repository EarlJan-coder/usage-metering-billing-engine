import { and, asc, desc, eq, ilike, lt, gte, or, sql } from "drizzle-orm";

import type { AppDb } from "../../db/index.js";
import { apiKeys, aiTokenUsageDetails, usageEvents } from "../../db/schema.js";

export type Bucket = {
  date: string;
  apiCalls: number;
  tokens: number;
  costMinor: number;
};

export type BreakdownRow = {
  name: string;
  apiCalls: number;
  tokens: number;
  costMinor: number;
};

export type HistoryRow = {
  id: string;
  type: string;
  createdAt: Date;
  apiKeyName: string | null;
  model: string | null;
  quantity: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cost: number;
  status: string;
};

function rowsOf<T>(result: unknown): T[] {
  return (result as { rows: T[] }).rows;
}

/**
 * Usage grouped into time buckets (day/week/month, UTC). The bucket label
 * is `YYYY-MM-DD` — the start of the bucket.
 */
export async function seriesBuckets(
  db: AppDb,
  tenantId: string,
  from: Date,
  to: Date,
  granularity: "day" | "week" | "month",
): Promise<Bucket[]> {
  const result = await db.execute(sql`
    select
      to_char(date_trunc(${granularity}, created_at at time zone 'UTC'), 'YYYY-MM-DD') as date,
      coalesce(sum(case when type = 'api_call' then quantity else 0 end), 0)::bigint as api_calls,
      coalesce(sum(case when type = 'ai_tokens' then quantity else 0 end), 0)::bigint as tokens,
      coalesce(sum(cost_minor), 0)::bigint as cost_minor
    from usage_events
    where tenant_id = ${tenantId} and created_at >= ${from} and created_at < ${to}
    group by 1
    order by 1
  `);

  return rowsOf<{
    date: string;
    api_calls: number;
    tokens: number;
    cost_minor: number;
  }>(result).map((row) => ({
    date: row.date,
    apiCalls: Number(row.api_calls),
    tokens: Number(row.tokens),
    costMinor: Number(row.cost_minor),
  }));
}

/** Totals for one window — derived from the same bucketed source. */
export function totalsOf(buckets: Bucket[]): {
  apiCalls: number;
  tokens: number;
  costMinor: number;
} {
  return buckets.reduce(
    (acc, b) => ({
      apiCalls: acc.apiCalls + b.apiCalls,
      tokens: acc.tokens + b.tokens,
      costMinor: acc.costMinor + b.costMinor,
    }),
    { apiCalls: 0, tokens: 0, costMinor: 0 },
  );
}

/** Usage grouped by API key name (revoked keys show as `(removed key)`). */
export async function breakdownByApiKey(
  db: AppDb,
  tenantId: string,
  from: Date,
  to: Date,
): Promise<BreakdownRow[]> {
  const result = await db.execute(sql`
    select
      coalesce(k.name, '(removed key)') as name,
      coalesce(sum(case when e.type = 'api_call' then e.quantity else 0 end), 0)::bigint as api_calls,
      coalesce(sum(case when e.type = 'ai_tokens' then e.quantity else 0 end), 0)::bigint as tokens,
      coalesce(sum(e.cost_minor), 0)::bigint as cost_minor
    from usage_events e
    left join api_keys k on k.id = e.api_key_id
    where e.tenant_id = ${tenantId} and e.created_at >= ${from} and e.created_at < ${to}
    group by 1
    order by 1
  `);

  return rowsOf<{
    name: string;
    api_calls: number;
    tokens: number;
    cost_minor: number;
  }>(result).map((row) => ({
    name: row.name,
    apiCalls: Number(row.api_calls),
    tokens: Number(row.tokens),
    costMinor: Number(row.cost_minor),
  }));
}

/** Usage grouped by model (from token detail rows). */
export async function breakdownByModel(
  db: AppDb,
  tenantId: string,
  from: Date,
  to: Date,
): Promise<BreakdownRow[]> {
  const result = await db.execute(sql`
    select
      coalesce(d.model, 'unknown') as name,
      count(*)::bigint as api_calls,
      coalesce(sum(e.quantity), 0)::bigint as tokens,
      coalesce(sum(e.cost_minor), 0)::bigint as cost_minor
    from usage_events e
    join ai_token_usage_details d on d.usage_event_id = e.id
    where e.tenant_id = ${tenantId} and e.created_at >= ${from} and e.created_at < ${to}
    group by 1
    order by 1
  `);

  return rowsOf<{
    name: string;
    api_calls: number;
    tokens: number;
    cost_minor: number;
  }>(result).map((row) => ({
    name: row.name,
    apiCalls: Number(row.api_calls),
    tokens: Number(row.tokens),
    costMinor: Number(row.cost_minor),
  }));
}

export type HistoryQuery = {
  limit: number;
  offset: number;
  search?: string;
  from?: Date;
  to?: Date;
  order: "asc" | "desc";
};

/** One page of usage history plus the full filtered row count. */
export async function historyPage(
  db: AppDb,
  tenantId: string,
  query: HistoryQuery,
): Promise<{ items: HistoryRow[]; total: number }> {
  const search = query.search ? `%${query.search}%` : null;

  const conditions = [
    eq(usageEvents.tenantId, tenantId),
    ...(query.from ? [gte(usageEvents.createdAt, query.from)] : []),
    ...(query.to ? [lt(usageEvents.createdAt, query.to)] : []),
    ...(search
      ? [
          or(
            ilike(aiTokenUsageDetails.model, search),
            ilike(apiKeys.name, search),
          )!,
        ]
      : []),
  ];
  const where = and(...conditions);

  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(usageEvents)
    .leftJoin(apiKeys, eq(apiKeys.id, usageEvents.apiKeyId))
    .leftJoin(
      aiTokenUsageDetails,
      eq(aiTokenUsageDetails.usageEventId, usageEvents.id),
    )
    .where(where);

  const rows = await db
    .select({
      id: usageEvents.id,
      type: usageEvents.type,
      createdAt: usageEvents.createdAt,
      apiKeyName: apiKeys.name,
      model: aiTokenUsageDetails.model,
      quantity: usageEvents.quantity,
      inputTokens: aiTokenUsageDetails.inputTokens,
      outputTokens: aiTokenUsageDetails.outputTokens,
      cost: usageEvents.costMinor,
      status: usageEvents.status,
    })
    .from(usageEvents)
    .leftJoin(apiKeys, eq(apiKeys.id, usageEvents.apiKeyId))
    .leftJoin(
      aiTokenUsageDetails,
      eq(aiTokenUsageDetails.usageEventId, usageEvents.id),
    )
    .where(where)
    .orderBy(
      query.order === "asc" ? asc(usageEvents.createdAt) : desc(usageEvents.createdAt),
    )
    .limit(query.limit)
    .offset(query.offset);

  return { items: rows, total: countRow?.n ?? 0 };
}
