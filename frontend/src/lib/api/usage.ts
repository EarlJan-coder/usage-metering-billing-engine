import { apiFetch } from "./client";
import {
  asObject,
  pickArray,
  pickNumber,
  pickObject,
  pickString,
} from "./normalize";

/**
 * Usage endpoints (backend-plan §6: GET /usage, GET /usage/history,
 * GET /usage/summary).
 *
 * Monetary values are integer minor units (backend-plan §4) — formatted with
 * formatCurrency, never recomputed here. Series and breakdowns are
 * backend-provided; the frontend only renders them.
 */

export type MetricPoint = { date: string; value: number };

export type UsageQuota = { used: number; limit: number | null };

export type UsageAlert = {
  id: string;
  message: string;
  severity: "info" | "warning" | "critical";
};

export type UsageSummary = {
  totalApiCalls: number;
  totalTokens: number;
  /** Estimated cost for the current period, in minor units. */
  estimatedCost: number;
  currency: string;
  apiCallsSeries: MetricPoint[];
  tokensSeries: MetricPoint[];
  costSeries: MetricPoint[];
  apiCallQuota: UsageQuota;
  tokenQuota: UsageQuota;
  alerts: UsageAlert[];
};

export type UsageEvent = {
  id: string;
  type: string;
  createdAt: string | null;
  apiKeyName: string | null;
  /** Model name when the event carries model metadata (§6E). */
  model: string | null;
  quantity: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Event cost in minor units. */
  cost: number | null;
  status: string;
};

/** One page of usage history plus the backend-reported total (§6E). */
export type HistoryPage = {
  events: UsageEvent[];
  total: number;
};

function normalizePoints(value: unknown): MetricPoint[] {
  if (!Array.isArray(value)) return [];
  const points: MetricPoint[] = [];
  for (const entry of value) {
    const record = asObject(entry);
    if (!record) continue;
    const date = pickString(record, "date", "day", "timestamp", "x");
    const valueOrNull = pickNumber(record, "value", "count", "amount", "total", "y");
    if (date === null || valueOrNull === null) continue;
    points.push({ date, value: valueOrNull });
  }
  return points;
}

function normalizeQuota(
  quota: Record<string, unknown> | null,
  key: string,
  fallbackUsed: number,
): UsageQuota {
  const nested = pickObject(quota ?? {}, key, `${key}Usage`);
  const used =
    (nested ? pickNumber(nested, "used", "consumed", "current") : null) ??
    pickNumber(quota ?? {}, `${key}Used`, `${key}_used`) ??
    fallbackUsed;
  const limit =
    (nested ? pickNumber(nested, "limit", "max", "quota") : null) ??
    pickNumber(quota ?? {}, `${key}Limit`, `${key}_limit`);
  return { used, limit };
}

function normalizeAlerts(value: unknown): UsageAlert[] {
  if (!Array.isArray(value)) return [];
  const alerts: UsageAlert[] = [];
  for (const entry of value) {
    const record = asObject(entry);
    if (!record) continue;
    const message = pickString(record, "message", "text", "detail");
    if (!message) continue;
    const severity = pickString(record, "severity", "level") ?? "info";
    alerts.push({
      id: pickString(record, "id") ?? `alert-${alerts.length}`,
      message,
      severity:
        severity === "critical" || severity === "error"
          ? "critical"
          : severity === "warning"
            ? "warning"
            : "info",
    });
  }
  return alerts;
}

export function normalizeSummary(payload: unknown): UsageSummary {
  const root = asObject(payload) ?? {};
  const totalApiCalls =
    pickNumber(root, "totalApiCalls", "total_api_calls", "apiCallsTotal") ?? 0;
  const totalTokens =
    pickNumber(
      root,
      "totalTokens",
      "total_ai_tokens",
      "aiTokensTotal",
      "tokensTotal",
    ) ?? 0;
  const estimatedCost =
    pickNumber(
      root,
      "estimatedCost",
      "estimated_monthly_cost",
      "estimatedMonthlyCost",
      "totalCost",
    ) ?? 0;

  const quota = pickObject(root, "quota", "quotas", "limits");
  const alertsValue = pickArray(root, "alerts", "usageAlerts", "usage_alerts");

  return {
    totalApiCalls,
    totalTokens,
    estimatedCost,
    currency: pickString(root, "currency") ?? "USD",
    apiCallsSeries: normalizePoints(
      pickArray(root, "apiCallsSeries", "api_calls_series", "apiCalls") ??
        root.apiCallsSeries,
    ),
    tokensSeries: normalizePoints(
      pickArray(root, "tokensSeries", "tokenSeries", "tokens_series", "aiTokensSeries") ??
        root.tokensSeries,
    ),
    costSeries: normalizePoints(
      pickArray(root, "costSeries", "cost_series", "costs") ?? root.costSeries,
    ),
    apiCallQuota: normalizeQuota(quota, "apiCalls", totalApiCalls),
    tokenQuota: normalizeQuota(quota, "tokens", totalTokens),
    alerts: normalizeAlerts(alertsValue),
  };
}

function normalizeEvent(entry: unknown): UsageEvent | null {
  const record = asObject(entry);
  if (!record) return null;
  const id = pickString(record, "id", "eventId", "event_id");
  if (!id) return null;
  return {
    id,
    type: pickString(record, "type", "usageType", "kind") ?? "api_call",
    createdAt:
      pickString(record, "createdAt", "created_at", "timestamp", "date") ??
      null,
    apiKeyName:
      pickString(record, "apiKeyName", "api_key_name", "apiKey", "keyName") ??
      null,
    model:
      pickString(record, "model", "modelName", "model_name") ?? null,
    quantity: pickNumber(record, "quantity", "tokens", "count"),
    inputTokens:
      pickNumber(record, "inputTokens", "input_tokens", "promptTokens") ?? null,
    outputTokens:
      pickNumber(record, "outputTokens", "output_tokens", "completionTokens") ??
      null,
    cost: pickNumber(record, "cost", "amount", "estimatedCost"),
    status: pickString(record, "status") ?? "recorded",
  };
}

export function normalizeEvents(payload: unknown): UsageEvent[] {
  const list = Array.isArray(payload)
    ? payload
    : pickArray(asObject(payload) ?? {}, "items", "events", "history", "data");
  if (!list) return [];
  const events: UsageEvent[] = [];
  for (const entry of list) {
    const event = normalizeEvent(entry);
    if (event) events.push(event);
  }
  return events;
}

/** Wraps the event list with the backend-reported row total (§6E). */
export function normalizeHistoryPage(payload: unknown): HistoryPage {
  const root = asObject(payload);
  const events = normalizeEvents(payload);
  if (!root) return { events, total: events.length };

  const meta = pickObject(root, "meta", "pagination");
  const total =
    pickNumber(root, "total", "count", "totalCount", "total_count") ??
    (meta ? pickNumber(meta, "total", "count", "totalCount") : null) ??
    events.length;
  return { events, total };
}

/** One row of a "usage by X" breakdown table (§6D). */
export type UsageBreakdownRow = {
  name: string;
  apiCalls: number;
  tokens: number;
  /** Cost in minor units. */
  cost: number;
};

/** Analytics payload for GET /usage (§6D: charts + breakdowns). */
export type UsageAnalytics = {
  apiCallsSeries: MetricPoint[];
  tokensSeries: MetricPoint[];
  costSeries: MetricPoint[];
  currency: string;
  byApiKey: UsageBreakdownRow[];
  byModel: UsageBreakdownRow[];
};

function normalizeBreakdown(value: unknown): UsageBreakdownRow[] {
  if (!Array.isArray(value)) return [];
  const rows: UsageBreakdownRow[] = [];
  for (const entry of value) {
    const record = asObject(entry);
    if (!record) continue;
    const name =
      pickString(record, "name", "key", "apiKey", "api_key", "model", "label") ??
      null;
    if (!name) continue;
    rows.push({
      name,
      apiCalls:
        pickNumber(record, "apiCalls", "api_calls", "calls", "count") ?? 0,
      tokens:
        pickNumber(record, "tokens", "aiTokens", "ai_tokens", "value") ?? 0,
      cost:
        pickNumber(record, "cost", "amount", "estimatedCost") ?? 0,
    });
  }
  return rows;
}

export function normalizeAnalytics(payload: unknown): UsageAnalytics {
  const root = asObject(payload) ?? {};
  return {
    apiCallsSeries: normalizePoints(
      pickArray(root, "apiCallsSeries", "api_calls_series", "apiCalls") ??
        root.apiCallsSeries,
    ),
    tokensSeries: normalizePoints(
      pickArray(
        root,
        "tokensSeries",
        "tokenSeries",
        "tokens_series",
        "aiTokensSeries",
      ) ?? root.tokensSeries,
    ),
    costSeries: normalizePoints(
      pickArray(root, "costSeries", "cost_series", "costs") ?? root.costSeries,
    ),
    currency: pickString(root, "currency") ?? "USD",
    byApiKey: normalizeBreakdown(
      pickArray(root, "byApiKey", "by_api_key", "usageByApiKey", "apiKeys") ??
        root.byApiKey,
    ),
    byModel: normalizeBreakdown(
      pickArray(root, "byModel", "by_model", "usageByModel", "models") ??
        root.byModel,
    ),
  };
}

/**
 * Builds `?a=1&b=2`, skipping undefined/null/blank values. Values are
 * URL-encoded; numbers are stringified.
 */
export function buildQueryString(
  params: Record<string, string | number | null | undefined>,
): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return pairs.length > 0 ? `?${pairs.join("&")}` : "";
}

export type HistoryParams = {
  limit?: number;
  offset?: number;
  search?: string;
  /** Inclusive yyyy-MM-dd bounds. */
  from?: string;
  to?: string;
  sort?: string;
  order?: "asc" | "desc";
};

/** Maps history filter params onto the backend query contract (§6E). */
export function buildHistoryQuery(params?: HistoryParams): string {
  if (!params) return "";
  return buildQueryString({
    limit: params.limit,
    offset: params.offset,
    search: params.search,
    from: params.from,
    to: params.to,
    sort: params.sort,
    order: params.order,
  });
}

export type Granularity = "daily" | "weekly" | "monthly";

export type AnalyticsParams = {
  from?: string;
  to?: string;
  granularity?: Granularity;
};

export const usageApi = {
  async summary(): Promise<UsageSummary> {
    const payload = await apiFetch<unknown>("/usage/summary");
    return normalizeSummary(payload);
  },

  /** Analytics for GET /usage: series, breakdowns, date range, granularity. */
  async analytics(params?: AnalyticsParams): Promise<UsageAnalytics> {
    const query = buildQueryString({
      from: params?.from,
      to: params?.to,
      granularity: params?.granularity,
    });
    const payload = await apiFetch<unknown>(`/usage${query}`);
    return normalizeAnalytics(payload);
  },

  async history(params?: HistoryParams): Promise<HistoryPage> {
    const payload = await apiFetch<unknown>(
      `/usage/history${buildHistoryQuery(params)}`,
    );
    return normalizeHistoryPage(payload);
  },
};
