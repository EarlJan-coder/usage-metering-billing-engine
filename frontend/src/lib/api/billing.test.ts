import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { setBearerToken, setUnauthorizedHandler } from "./client";
import { billingApi, normalizeBillingSummary } from "./billing";

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

describe("normalizeBillingSummary", () => {
  test("maps the canonical summary payload", () => {
    const summary = normalizeBillingSummary({
      estimatedCost: 1250,
      currency: "EUR",
      periodStart: "2026-11-01T00:00:00.000Z",
      periodEnd: "2026-12-01T00:00:00.000Z",
      nextInvoiceAt: "2026-12-01T00:00:00.000Z",
      status: "active",
    });

    expect(summary).toEqual({
      estimatedCostMinor: 1250,
      currency: "EUR",
      periodStart: "2026-11-01T00:00:00.000Z",
      periodEnd: "2026-12-01T00:00:00.000Z",
      nextInvoiceAt: "2026-12-01T00:00:00.000Z",
      status: "active",
    });
  });

  test("accepts snake_case aliases", () => {
    const summary = normalizeBillingSummary({
      estimated_cost: 999,
      current_period_start: "2026-11-01T00:00:00.000Z",
      current_period_end: "2026-12-01T00:00:00.000Z",
      next_invoice_date: "2026-12-01T00:00:00.000Z",
      subscription_status: "past_due",
    });

    expect(summary).toMatchObject({
      estimatedCostMinor: 999,
      periodStart: "2026-11-01T00:00:00.000Z",
      periodEnd: "2026-12-01T00:00:00.000Z",
      nextInvoiceAt: "2026-12-01T00:00:00.000Z",
      status: "past_due",
    });
    expect(summary.currency).toBe("USD");
  });

  test("tolerates an empty payload with zeroed cost", () => {
    expect(normalizeBillingSummary(null)).toEqual({
      estimatedCostMinor: 0,
      currency: "USD",
      periodStart: null,
      periodEnd: null,
      nextInvoiceAt: null,
      status: null,
    });
    expect(normalizeBillingSummary({}).estimatedCostMinor).toBe(0);
  });
});

describe("billingApi endpoints (backend-plan section 6)", () => {
  test("summary GETs /billing/summary", async () => {
    const fetchSpy = stubFetch(async () =>
      okResponse({ estimatedCost: 1250, currency: "USD" }),
    );

    const summary = await billingApi.summary();

    expect(fetchSpy.mock.calls[0]![0]).toBe("/billing/summary");
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("GET");
    expect(summary.estimatedCostMinor).toBe(1250);
  });
});
