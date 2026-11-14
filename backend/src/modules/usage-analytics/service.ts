import { desc, eq } from "drizzle-orm";

import type { AppDb } from "../../db/index.js";
import { usageAlerts } from "../../db/schema.js";
import { AppError } from "../../middleware/error.js";
import { utcMonthBounds } from "../../db/seed.js";
import { getCurrentSubscription } from "../subscriptions/repository.js";
import {
  breakdownByApiKey,
  breakdownByModel,
  historyPage,
  seriesBuckets,
  totalsOf,
  type Bucket,
  type HistoryRow,
} from "./repository.js";

const DAY_MS = 24 * 3600 * 1000;
const SERIES_KEYS = ["apiCalls", "tokens", "costMinor"] as const;

type Granularity = "daily" | "weekly" | "monthly";

const GRANULARITY_SQL = {
  daily: "day",
  weekly: "week",
  monthly: "month",
} as const;

function floorDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function floorBucket(date: Date, granularity: Granularity): Date {
  const day = floorDay(date);
  if (granularity === "daily") return day;
  if (granularity === "monthly") {
    return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
  }
  // weekly: ISO weeks start on Monday
  const backToMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - backToMonday * DAY_MS);
}

function nextBucket(date: Date, granularity: Granularity): Date {
  if (granularity === "daily") return new Date(date.getTime() + DAY_MS);
  if (granularity === "weekly") return new Date(date.getTime() + 7 * DAY_MS);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
  );
}

/** `YYYY-MM-DD` labels from the bucket holding `from` through `to`. */
function bucketLabels(
  granularity: Granularity,
  from: Date,
  to: Date,
): string[] {
  const labels: string[] = [];
  let cursor = floorBucket(from, granularity);
  const end = floorBucket(to, granularity);
  while (cursor.getTime() <= end.getTime()) {
    labels.push(cursor.toISOString().slice(0, 10));
    cursor = nextBucket(cursor, granularity);
  }
  return labels;
}

function zeroFill(
  granularity: Granularity,
  from: Date,
  to: Date,
  buckets: Bucket[],
): Record<(typeof SERIES_KEYS)[number], Array<{ date: string; value: number }>> {
  const byDate = new Map(buckets.map((b) => [b.date, b]));
  const labels = bucketLabels(granularity, from, to);

  const series = {
    apiCalls: [] as Array<{ date: string; value: number }>,
    tokens: [] as Array<{ date: string; value: number }>,
    costMinor: [] as Array<{ date: string; value: number }>,
  };
  for (const date of labels) {
    const bucket = byDate.get(date);
    series.apiCalls.push({ date, value: bucket?.apiCalls ?? 0 });
    series.tokens.push({ date, value: bucket?.tokens ?? 0 });
    series.costMinor.push({ date, value: bucket?.costMinor ?? 0 });
  }
  return series;
}

/** Parses an inclusive `yyyy-MM-dd` day; null when absent/invalid. */
function parseDay(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayAfter(date: Date): Date {
  return new Date(date.getTime() + DAY_MS);
}

export type UsageAlertView = { id: string; message: string; severity: string };

/**
 * GET /usage/summary (§6D): current-period totals, daily series, quota
 * against the plan limits, and the tenant's recent usage alerts.
 */
export async function getSummary(db: AppDb, tenantId: string) {
  const current = await getCurrentSubscription(db, tenantId);
  if (!current) throw new AppError(404, "not_found", "Subscription not found");

  const { subscription, plan } = current;
  const periodStart =
    subscription.currentPeriodStart ?? utcMonthBounds().start;
  const now = new Date();
  const windowEnd =
    subscription.currentPeriodEnd && subscription.currentPeriodEnd < now
      ? subscription.currentPeriodEnd
      : now;

  const buckets = await seriesBuckets(
    db,
    tenantId,
    periodStart,
    windowEnd,
    "day",
  );
  const totals = totalsOf(buckets);
  const series = zeroFill("daily", periodStart, windowEnd, buckets);

  const alerts = await db
    .select({
      id: usageAlerts.id,
      message: usageAlerts.message,
      severity: usageAlerts.severity,
    })
    .from(usageAlerts)
    .where(eq(usageAlerts.tenantId, tenantId))
    .orderBy(desc(usageAlerts.createdAt))
    .limit(10);

  const apiCallQuota = {
    used: totals.apiCalls,
    limit: plan.apiCallsLimit,
  };
  const tokenQuota = { used: totals.tokens, limit: plan.aiTokensLimit };

  return {
    totalApiCalls: totals.apiCalls,
    totalTokens: totals.tokens,
    estimatedCost: totals.costMinor,
    currency: "USD",
    apiCallsSeries: series.apiCalls,
    tokensSeries: series.tokens,
    costSeries: series.costMinor,
    apiCallQuota,
    tokenQuota,
    // nested form — what the frontend normalizer reads
    quota: { apiCalls: apiCallQuota, tokens: tokenQuota },
    alerts,
  };
}

export type AnalyticsQuery = {
  from?: string;
  to?: string;
  granularity?: string;
};

/** GET /usage (§6D): ranged series plus by-key and by-model breakdowns. */
export async function getAnalytics(
  db: AppDb,
  tenantId: string,
  query: AnalyticsQuery,
) {
  const granularity: Granularity =
    query.granularity === "weekly"
      ? "weekly"
      : query.granularity === "monthly"
        ? "monthly"
        : "daily";
  if (
    query.granularity !== undefined &&
    !["daily", "weekly", "monthly"].includes(query.granularity)
  ) {
    throw new AppError(
      400,
      "validation_error",
      "granularity: must be daily, weekly, or monthly",
    );
  }

  const today = floorDay(new Date());
  const from = parseDay(query.from) ?? new Date(today.getTime() - 29 * DAY_MS);
  const to = parseDay(query.to) ?? today;
  const toExclusive = dayAfter(to);

  const buckets = await seriesBuckets(
    db,
    tenantId,
    from,
    toExclusive,
    GRANULARITY_SQL[granularity],
  );
  const series = zeroFill(granularity, from, to, buckets);

  const [byApiKey, byModel] = await Promise.all([
    breakdownByApiKey(db, tenantId, from, toExclusive),
    breakdownByModel(db, tenantId, from, toExclusive),
  ]);

  return {
    apiCallsSeries: series.apiCalls,
    tokensSeries: series.tokens,
    costSeries: series.costMinor,
    currency: "USD",
    byApiKey: byApiKey.map((row) => ({
      name: row.name,
      apiCalls: row.apiCalls,
      tokens: row.tokens,
      cost: row.costMinor,
    })),
    byModel: byModel.map((row) => ({
      name: row.name,
      apiCalls: row.apiCalls,
      tokens: row.tokens,
      cost: row.costMinor,
    })),
  };
}

export type HistoryParams = {
  limit?: string;
  offset?: string;
  search?: string;
  from?: string;
  to?: string;
  sort?: string;
  order?: string;
};

/** GET /usage/history (§6E): paginated, searchable event log. */
export async function getHistory(db: AppDb, tenantId: string, params: HistoryParams) {
  const limitRaw = Number(params.limit ?? 20);
  const offsetRaw = Number(params.offset ?? 0);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100)
    : 20;
  const offset = Number.isFinite(offsetRaw) ? Math.max(Math.trunc(offsetRaw), 0) : 0;

  const order = params.order === "asc" ? "asc" : "desc";
  const search = params.search?.trim() || undefined;

  const from = parseDay(params.from) ?? undefined;
  const to = parseDay(params.to) ?? undefined;

  const page = await historyPage(db, tenantId, {
    limit,
    offset,
    order,
    ...(search ? { search } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to: dayAfter(to) } : {}),
  });

  return {
    items: page.items.map((row: HistoryRow) => ({
      id: row.id,
      type: row.type,
      createdAt: row.createdAt.toISOString(),
      apiKeyName: row.apiKeyName,
      model: row.model,
      quantity: row.quantity,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cost: row.cost,
      status: row.status,
    })),
    total: page.total,
  };
}
