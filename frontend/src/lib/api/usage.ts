import { apiFetch } from "./client";
import {
  asObject,
  pickArray,
  pickNumber,
  pickObject,
  pickString,
} from "./normalize";

/**
 * Usage summary + history endpoints (backend-plan §6:
 * GET /usage/summary, GET /usage/history).
 *
 * Monetary values are integer minor units (backend-plan §4) — formatted with
 * formatCurrency, never recomputed here. Series are backend-provided points;
 * the frontend only renders them.
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
  quantity: number | null;
  /** Event cost in minor units. */
  cost: number | null;
  status: string;
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
    quantity: pickNumber(record, "quantity", "tokens", "count"),
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

export type HistoryParams = { limit?: number };

export const usageApi = {
  async summary(): Promise<UsageSummary> {
    const payload = await apiFetch<unknown>("/usage/summary");
    return normalizeSummary(payload);
  },

  async history(params?: HistoryParams): Promise<UsageEvent[]> {
    const query = params?.limit !== undefined ? `?limit=${params.limit}` : "";
    const payload = await apiFetch<unknown>(`/usage/history${query}`);
    return normalizeEvents(payload);
  },
};
