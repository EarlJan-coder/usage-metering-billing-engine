import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { setBearerToken, setUnauthorizedHandler } from "./client";
import {
  buildHistoryQuery,
  buildQueryString,
  normalizeAnalytics,
  normalizeEvents,
  normalizeHistoryPage,
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
      model: null,
      quantity: 1200,
      inputTokens: null,
      outputTokens: null,
      cost: 45,
      status: "recorded",
    };

    expect(normalizeEvents({ items: [event] })).toEqual([event]);
    expect(normalizeEvents({ events: [event] })).toEqual([event]);
    expect(normalizeEvents([event])).toEqual([event]);
  });

  test("normalizes model and token split fields across aliases", () => {
    const [event] = normalizeEvents([
      {
        id: "e3",
        model: "gpt-4o-mini",
        input_tokens: 800,
        output_tokens: 400,
      },
    ]);

    expect(event).toMatchObject({
      id: "e3",
      model: "gpt-4o-mini",
      inputTokens: 800,
      outputTokens: 400,
    });
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
        model: null,
        quantity: null,
        inputTokens: null,
        outputTokens: null,
        cost: null,
        status: "recorded",
      },
    ]);
    expect(normalizeEvents(null)).toEqual([]);
    expect(normalizeEvents({})).toEqual([]);
    expect(normalizeEvents("nope")).toEqual([]);
  });
});

describe("normalizeHistoryPage", () => {
  test("pairs events with a backend-reported total", () => {
    const page = normalizeHistoryPage({
      items: [{ id: "e1" }, { id: "e2" }],
      total: 57,
    });

    expect(page.events).toHaveLength(2);
    expect(page.total).toBe(57);
  });

  test("reads total/count aliases and meta wrappers", () => {
    expect(
      normalizeHistoryPage({ items: [{ id: "e1" }], count: 12 }).total,
    ).toBe(12);
    expect(
      normalizeHistoryPage({
        data: [{ id: "e1" }],
        meta: { total: 9 },
      }).total,
    ).toBe(9);
  });

  test("defaults total to the returned event count", () => {
    const page = normalizeHistoryPage({ items: [{ id: "e1" }] });
    expect(page.total).toBe(1);

    expect(normalizeHistoryPage(null)).toEqual({ events: [], total: 0 });
  });
});

describe("normalizeAnalytics", () => {
  test("maps series and per-key / per-model breakdowns", () => {
    const analytics = normalizeAnalytics({
      apiCallsSeries: [{ date: "2026-11-01", value: 100 }],
      tokensSeries: [{ date: "2026-11-01", value: 5000 }],
      costSeries: [{ date: "2026-11-01", value: 75 }],
      currency: "USD",
      byApiKey: [
        { name: "production", apiCalls: 90, tokens: 4500, cost: 70 },
      ],
      byModel: [{ name: "gpt-4o-mini", apiCalls: 80, tokens: 4000, cost: 60 }],
    });

    expect(analytics.apiCallsSeries).toEqual([
      { date: "2026-11-01", value: 100 },
    ]);
    expect(analytics.tokensSeries).toEqual([
      { date: "2026-11-01", value: 5000 },
    ]);
    expect(analytics.costSeries).toEqual([{ date: "2026-11-01", value: 75 }]);
    expect(analytics.currency).toBe("USD");
    expect(analytics.byApiKey).toEqual([
      { name: "production", apiCalls: 90, tokens: 4500, cost: 70 },
    ]);
    expect(analytics.byModel).toEqual([
      { name: "gpt-4o-mini", apiCalls: 80, tokens: 4000, cost: 60 },
    ]);
  });

  test("accepts snake_case aliases for breakdowns", () => {
    const analytics = normalizeAnalytics({
      by_api_key: [{ key: "staging", api_calls: 10, ai_tokens: 100, amount: 5 }],
      by_model: [{ model: "claude-sonnet", api_calls: 4, ai_tokens: 40, amount: 2 }],
    });

    expect(analytics.byApiKey).toEqual([
      { name: "staging", apiCalls: 10, tokens: 100, cost: 5 },
    ]);
    expect(analytics.byModel).toEqual([
      { name: "claude-sonnet", apiCalls: 4, tokens: 40, cost: 2 },
    ]);
  });

  test("yields safe defaults for empty payloads", () => {
    expect(normalizeAnalytics(null)).toEqual({
      apiCallsSeries: [],
      tokensSeries: [],
      costSeries: [],
      currency: "USD",
      byApiKey: [],
      byModel: [],
    });
  });
});

describe("buildQueryString", () => {
  test("skips undefined, null, and blank values", () => {
    expect(buildQueryString({ a: 1, b: undefined, c: null, d: "" })).toBe(
      "?a=1",
    );
  });

  test("returns an empty string when nothing survives filtering", () => {
    expect(buildQueryString({ a: undefined })).toBe("");
  });

  test("URL-encodes values", () => {
    expect(buildQueryString({ search: "a b&c" })).toBe("?search=a%20b%26c");
  });
});

describe("buildHistoryQuery", () => {
  test("maps history params onto the backend contract", () => {
    const query = buildHistoryQuery({
      limit: 25,
      offset: 50,
      search: "prod",
      from: "2026-11-01",
      to: "2026-11-11",
      sort: "createdAt",
      order: "desc",
    });

    expect(query).toBe(
      "?limit=25&offset=50&search=prod&from=2026-11-01&to=2026-11-11&sort=createdAt&order=desc",
    );
  });

  test("returns an empty string without params", () => {
    expect(buildHistoryQuery({})).toBe("");
    expect(buildHistoryQuery()).toBe("");
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

  test("history returns a HistoryPage with events and total", async () => {
    stubFetch(async () =>
      okResponse({ items: [{ id: "e1" }], total: 41 }),
    );

    const page = await usageApi.history();

    expect(page.total).toBe(41);
    expect(page.events.map((event) => event.id)).toEqual(["e1"]);
  });

  test("analytics GETs /usage with from, to, and granularity", async () => {
    const fetchSpy = stubFetch(async () => okResponse({}));

    await usageApi.analytics({
      from: "2026-11-01",
      to: "2026-11-11",
      granularity: "weekly",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "/usage?from=2026-11-01&to=2026-11-11&granularity=weekly",
    );
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("GET");
  });

  test("analytics omits the query string without params", async () => {
    const fetchSpy = stubFetch(async () => okResponse({}));

    await usageApi.analytics();

    expect(fetchSpy.mock.calls[0]![0]).toBe("/usage");
  });
});
