import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { setBearerToken, setUnauthorizedHandler } from "./client";
import {
  adminApi,
  normalizePlatformMetrics,
  normalizeTenants,
  normalizeWebhookEvents,
} from "./admin";

function okResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

function stubFetch(impl: (...args: unknown[]) => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  setBearerToken(null);
  setUnauthorizedHandler(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("normalizePlatformMetrics", () => {
  test("maps the canonical metrics payload", () => {
    const metrics = normalizePlatformMetrics({
      totalTenants: 12,
      activeSubscriptions: 5,
      totalApiCalls: 48210,
      totalTokens: 934000,
      estimatedRevenue: 123400,
      currency: "EUR",
      jobs: { pending: 3, processing: 1, failed: 0, completed: 42 },
    });

    expect(metrics).toEqual({
      totalTenants: 12,
      activeSubscriptions: 5,
      totalApiCalls: 48210,
      totalTokens: 934000,
      estimatedRevenueMinor: 123400,
      currency: "EUR",
      jobs: { pending: 3, processing: 1, failed: 0, completed: 42 },
    });
  });

  test("accepts snake_case and revenue aliases", () => {
    const metrics = normalizePlatformMetrics({
      total_tenants: 4,
      active_subscriptions: 2,
      total_api_calls: 100,
      ai_tokens: 200,
      platform_revenue: 999,
      job_stats: { queued: 7, running: 2, dead: 1, succeeded: 9 },
    });

    expect(metrics).toMatchObject({
      totalTenants: 4,
      activeSubscriptions: 2,
      totalApiCalls: 100,
      totalTokens: 200,
      estimatedRevenueMinor: 999,
      currency: "USD",
      jobs: { pending: 7, processing: 2, failed: 1, completed: 9 },
    });
  });

  test("zeros an empty payload and reports no job stats", () => {
    expect(normalizePlatformMetrics(null)).toEqual({
      totalTenants: 0,
      activeSubscriptions: 0,
      totalApiCalls: 0,
      totalTokens: 0,
      estimatedRevenueMinor: 0,
      currency: "USD",
      jobs: null,
    });
    expect(normalizePlatformMetrics({ total_tenants: "oops" }).totalTenants).toBe(0);
  });
});

describe("normalizeTenants", () => {
  test("reads items/tenants/bare arrays and drops invalid entries", () => {
    const acme = { id: "t_1", name: "Acme Inc" };
    const globex = { tenant_id: "t_2", tenant_name: "Globex" };

    expect(normalizeTenants({ items: [acme, globex] })).toHaveLength(2);
    expect(normalizeTenants({ tenants: [acme] })).toHaveLength(1);
    expect(normalizeTenants([acme])).toHaveLength(1);
    expect(normalizeTenants({ items: [{ plan: "Pro" }] })).toEqual([]);
    expect(normalizeTenants(null)).toEqual([]);
  });

  test("maps plan, status, created date, and member count aliases", () => {
    const [tenant] = normalizeTenants([
      {
        tenantId: "t_1",
        name: "Acme Inc",
        plan_name: "Pro",
        subscription_status: "active",
        created_at: "2026-01-05T00:00:00.000Z",
        user_count: 3,
      },
    ]);

    expect(tenant).toEqual({
      id: "t_1",
      name: "Acme Inc",
      plan: "Pro",
      status: "active",
      createdAt: "2026-01-05T00:00:00.000Z",
      memberCount: 3,
    });
  });
});

describe("normalizeWebhookEvents", () => {
  test("reads items/events/webhooks arrays and drops invalid entries", () => {
    const event = { id: "evt_1", type: "checkout.session.completed" };

    expect(normalizeWebhookEvents({ items: [event] })).toHaveLength(1);
    expect(normalizeWebhookEvents({ events: [event] })).toHaveLength(1);
    expect(normalizeWebhookEvents({ webhooks: [event] })).toHaveLength(1);
    expect(normalizeWebhookEvents([event])).toHaveLength(1);
    expect(normalizeWebhookEvents({ items: [{ status: "delivered" }] })).toEqual([]);
    expect(normalizeWebhookEvents(undefined)).toEqual([]);
  });

  test("maps type/status/received-at aliases", () => {
    const [event] = normalizeWebhookEvents([
      {
        event_id: "evt_2",
        event_type: "customer.subscription.updated",
        delivery_status: "delivered",
        received_at: "2026-11-01T10:00:00.000Z",
      },
    ]);

    expect(event).toEqual({
      id: "evt_2",
      type: "customer.subscription.updated",
      status: "delivered",
      receivedAt: "2026-11-01T10:00:00.000Z",
    });
  });
});

describe("adminApi endpoints (backend-plan section 6)", () => {
  test("metrics GETs /admin/metrics", async () => {
    const fetchSpy = stubFetch(async () =>
      okResponse({ total_tenants: 4, active_subscriptions: 2 }),
    );

    const metrics = await adminApi.metrics();

    expect(fetchSpy.mock.calls[0]![0]).toBe("/admin/metrics");
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("GET");
    expect(metrics.totalTenants).toBe(4);
  });

  test("tenants GETs /admin/tenants", async () => {
    const fetchSpy = stubFetch(async () =>
      okResponse({ items: [{ id: "t_1", name: "Acme Inc" }] }),
    );

    const tenants = await adminApi.tenants();

    expect(fetchSpy.mock.calls[0]![0]).toBe("/admin/tenants");
    expect(tenants).toHaveLength(1);
    expect(tenants[0]!.name).toBe("Acme Inc");
  });

  test("webhooks GETs /admin/webhooks", async () => {
    const fetchSpy = stubFetch(async () =>
      okResponse({
        items: [{ id: "evt_1", type: "checkout.session.completed" }],
      }),
    );

    const events = await adminApi.webhooks();

    expect(fetchSpy.mock.calls[0]![0]).toBe("/admin/webhooks");
    expect(events[0]!.type).toBe("checkout.session.completed");
  });

  test("propagates a 403 from backend authorization as ApiError", async () => {
    stubFetch(async () =>
      okResponse({ message: "Forbidden" }, 403),
    );

    await expect(adminApi.metrics()).rejects.toMatchObject({
      status: 403,
    });
  });
});
