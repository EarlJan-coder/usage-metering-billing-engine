import { apiFetch } from "./client";
import {
  asObject,
  pickArray,
  pickNumber,
  pickObject,
  pickString,
} from "./normalize";

/**
 * Platform admin endpoints (backend-plan §6: GET /admin/tenants,
 * GET /admin/metrics, GET /admin/webhooks). These are authorization-
 * gated by the backend — a 403 propagates as ApiError and the UI renders
 * an honest access-required state (frontend-plan §6I).
 *
 * Response bodies are unspecified in the plan, so normalizers accept
 * camelCase + snake_case aliases and default safely on empty payloads.
 */

export type JobStats = {
  pending: number;
  processing: number;
  failed: number;
  completed: number;
};

export type PlatformMetrics = {
  totalTenants: number;
  activeSubscriptions: number;
  totalApiCalls: number;
  totalTokens: number;
  /** Platform revenue in integer minor units (backend-plan §4). */
  estimatedRevenueMinor: number;
  currency: string;
  /** Background job counts when the backend reports them, else null. */
  jobs: JobStats | null;
};

export type AdminTenant = {
  id: string;
  name: string;
  plan: string | null;
  status: string | null;
  createdAt: string | null;
  memberCount: number | null;
};

export type WebhookEvent = {
  id: string;
  type: string;
  status: string;
  receivedAt: string | null;
};

function numberOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function normalizeJobStats(payload: unknown): JobStats | null {
  const record = asObject(payload);
  if (!record) return null;
  return {
    pending:
      pickNumber(record, "pending", "queued", "waiting") ?? 0,
    processing:
      pickNumber(record, "processing", "running", "active") ?? 0,
    failed: pickNumber(record, "failed", "dead", "deadLetter") ?? 0,
    completed:
      pickNumber(record, "completed", "succeeded", "done") ?? 0,
  };
}

export function normalizePlatformMetrics(payload: unknown): PlatformMetrics {
  const root = asObject(payload) ?? {};
  const jobs = pickObject(
    root,
    "jobs",
    "jobStats",
    "job_stats",
    "backgroundJobs",
    "background_jobs",
    "queue",
  );

  return {
    totalTenants: numberOrZero(
      root.totalTenants ?? root.total_tenants ?? root.tenantCount ?? root.tenant_count,
    ),
    activeSubscriptions: numberOrZero(
      root.activeSubscriptions ??
        root.active_subscriptions ??
        root.subscriptionsActive ??
        root.paidSubscriptions,
    ),
    totalApiCalls: numberOrZero(
      root.totalApiCalls ?? root.total_api_calls ?? root.apiCalls ?? root.api_calls,
    ),
    totalTokens: numberOrZero(
      root.totalTokens ??
        root.total_tokens ??
        root.aiTokens ??
        root.ai_tokens ??
        root.tokenCount,
    ),
    estimatedRevenueMinor: numberOrZero(
      root.estimatedRevenue ??
        root.estimated_revenue ??
        root.platformRevenue ??
        root.platform_revenue ??
        root.totalRevenue ??
        root.total_revenue ??
        root.revenue ??
        root.amount,
    ),
    currency: pickString(root, "currency") ?? "USD",
    jobs: normalizeJobStats(jobs),
  };
}

export function normalizeTenants(payload: unknown): AdminTenant[] {
  const list = Array.isArray(payload)
    ? payload
    : pickArray(asObject(payload) ?? {}, "items", "tenants", "data");
  if (!list) return [];

  const tenants: AdminTenant[] = [];
  for (const entry of list) {
    const record = asObject(entry);
    if (!record) continue;
    const id = pickString(record, "id", "tenantId", "tenant_id");
    const name = pickString(record, "name", "tenantName", "tenant_name");
    if (!id && !name) continue;
    tenants.push({
      id: id ?? "",
      name: name ?? id ?? "",
      plan:
        pickString(record, "plan", "planName", "plan_name", "tier") ?? null,
      status:
        pickString(
          record,
          "status",
          "subscriptionStatus",
          "subscription_status",
        ) ?? null,
      createdAt:
        pickString(record, "createdAt", "created_at", "createdDate", "created") ??
        null,
      memberCount:
        pickNumber(
          record,
          "memberCount",
          "member_count",
          "userCount",
          "user_count",
          "users",
          "members",
        ) ?? null,
    });
  }
  return tenants;
}

export function normalizeWebhookEvents(payload: unknown): WebhookEvent[] {
  const list = Array.isArray(payload)
    ? payload
    : pickArray(asObject(payload) ?? {}, "items", "events", "webhooks", "data");
  if (!list) return [];

  const events: WebhookEvent[] = [];
  for (const entry of list) {
    const record = asObject(entry);
    if (!record) continue;
    const id = pickString(record, "id", "eventId", "event_id");
    const type = pickString(record, "type", "eventType", "event_type");
    if (!id && !type) continue;
    events.push({
      id: id ?? "",
      type: type ?? "unknown event",
      status:
        pickString(record, "status", "deliveryStatus", "delivery_status", "state") ??
        "unknown",
      receivedAt:
        pickString(
          record,
          "receivedAt",
          "received_at",
          "createdAt",
          "created_at",
          "timestamp",
        ) ?? null,
    });
  }
  return events;
}

export const adminApi = {
  async metrics(): Promise<PlatformMetrics> {
    const payload = await apiFetch<unknown>("/admin/metrics");
    return normalizePlatformMetrics(payload);
  },

  async tenants(): Promise<AdminTenant[]> {
    const payload = await apiFetch<unknown>("/admin/tenants");
    return normalizeTenants(payload);
  },

  async webhooks(): Promise<WebhookEvent[]> {
    const payload = await apiFetch<unknown>("/admin/webhooks");
    return normalizeWebhookEvents(payload);
  },
};
