import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { setBearerToken, setUnauthorizedHandler } from "./client";
import {
  normalizeEvents,
  normalizeSummary,
  usageApi,
} from "./usage";

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

describe("normalizeSummary", () => {
  test("maps the canonical usage summary payload", () => {
    const summary = normalizeSummary({
      totalApiCalls: 48392,
      totalTokens: 1240000,
      estimatedCost: 4218,
      currency: "USD",
      apiCallsSeries: [
        { date: "2026-11-01", value: 1200 },
        { date: "2026-11-02", value: 1500 },
      ],
      tokensSeries: [{ date: "2026-11-01", value: 30000 }],
      costSeries: [{ date: "2026-11-01", value: 12 }],
      quota: {
        apiCalls: { used: 48392, limit: 1000 },
        tokens: { used: 1240000, limit: 100000 },
      },
      alerts: [
        { id: "a1", message: "API call quota at 92%", severity: "warning" },
      ],
    });

    expect(summary.totalApiCalls).toBe(48392);
    expect(summary.totalTokens).toBe(1240000);
    expect(summary.estimatedCost).toBe(4218);
    expect(summary.currency).toBe("USD");
    expect(summary.apiCallsSeries).toEqual([
      { date: "2026-11-01", value: 1200 },
      { date: "2026-11-02", value: 1500 },
    ]);
    expect(summary.tokensSeries).toEqual([
      { date: "2026-11-01", value: 30000 },
    ]);
    expect(summary.costSeries).toEqual([{ date: "2026-11-01", value: 12 }]);
    expect(summary.apiCallQuota).toEqual({ used: 48392, limit: 1000 });
    expect(summary.tokenQuota).toEqual({ used: 1240000, limit: 100000 });
    expect(summary.alerts).toEqual([
      { id: "a1", message: "API call quota at 92%", severity: "warning" },
    ]);
  });

  test("accepts snake_case aliases", () => {
    const summary = normalizeSummary({
      total_api_calls: 10,
      total_ai_tokens: 20,
      estimated_monthly_cost: 300,
      currency: "EUR",
      api_calls_series: [{ day: "2026-11-01", count: 5 }],
    });

    expect(summary.totalApiCalls).toBe(10);
    expect(summary.totalTokens).toBe(20);
    expect(summary.estimatedCost).toBe(300);
    expect(summary.currency).toBe("EUR");
    expect(summary.apiCallsSeries).toEqual([
      { date: "2026-11-01", value: 5 },
    ]);
  });

  test("yields safe defaults for empty payloads", () => {
    const summary = normalizeSummary({});

    expect(summary).toEqual({
      totalApiCalls: 0,
      totalTokens: 0,
      estimatedCost: 0,
      currency: "USD",
      apiCallsSeries: [],
      tokensSeries: [],
      costSeries: [],
      apiCallQuota: { used: 0, limit: null },
      tokenQuota: { used: 0, limit: null },
      alerts: [],
    });
  });
});

describe("normalizeEvents", () => {
  test("reads items, events, and bare-array payloads", () => {
    const event = {
      id: "e1",
      type: "ai_tokens",
      createdAt: "2026-11-11T10:00:00.000Z",
      apiKeyName: "production",
      quantity: 1200,
      cost: 45,
      status: "recorded",
    };

    expect(normalizeEvents({ items: [event] })).toEqual([event]);
    expect(normalizeEvents({ events: [event] })).toEqual([event]);
    expect(normalizeEvents([event])).toEqual([event]);
  });

  test("drops entries without an id and tolerates garbage", () => {
    expect(
      normalizeEvents({ items: [{ type: "api_call" }, { id: "e2" }] }),
    ).toEqual([
      {
        id: "e2",
        type: "api_call",
        createdAt: null,
        apiKeyName: null,
        quantity: null,
        cost: null,
        status: "recorded",
      },
    ]);
    expect(normalizeEvents(null)).toEqual([]);
    expect(normalizeEvents({})).toEqual([]);
    expect(normalizeEvents("nope")).toEqual([]);
  });
});

describe("usageApi endpoints (backend-plan section 6)", () => {
  test("summary GETs /usage/summary", async () => {
    const fetchSpy = stubFetch(async () => okResponse({}));

    await usageApi.summary();

    expect(fetchSpy.mock.calls[0]![0]).toBe("/usage/summary");
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("GET");
  });

  test("history GETs /usage/history with a limit param", async () => {
    const fetchSpy = stubFetch(async () => okResponse({ items: [] }));

    await usageApi.history({ limit: 5 });

    expect(fetchSpy.mock.calls[0]![0]).toBe("/usage/history?limit=5");
  });

  test("history omits the query string without params", async () => {
    const fetchSpy = stubFetch(async () => okResponse({ items: [] }));

    await usageApi.history();

    expect(fetchSpy.mock.calls[0]![0]).toBe("/usage/history");
  });
});
