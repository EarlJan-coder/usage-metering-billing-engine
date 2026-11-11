import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { setBearerToken, setUnauthorizedHandler } from "./client";
import { normalizeSubscription, subscriptionsApi } from "./subscriptions";

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

describe("normalizeSubscription", () => {
  test("maps a nested plan payload", () => {
    const subscription = normalizeSubscription({
      plan: { name: "Pro" },
      status: "active",
      currentPeriodStart: "2026-11-01T00:00:00.000Z",
      currentPeriodEnd: "2026-12-01T00:00:00.000Z",
      cancelAtPeriodEnd: true,
    });

    expect(subscription).toEqual({
      planName: "Pro",
      status: "active",
      periodStart: "2026-11-01T00:00:00.000Z",
      periodEnd: "2026-12-01T00:00:00.000Z",
      cancelAtPeriodEnd: true,
    });
  });

  test("accepts flat planName/status fields", () => {
    expect(
      normalizeSubscription({ planName: "Free", status: "trialing" }),
    ).toEqual({
      planName: "Free",
      status: "trialing",
      periodStart: null,
      periodEnd: null,
      cancelAtPeriodEnd: false,
    });
  });

  test("returns null when no plan identity exists", () => {
    expect(normalizeSubscription(null)).toBeNull();
    expect(normalizeSubscription({})).toBeNull();
    expect(normalizeSubscription({ status: "active" })).toBeNull();
  });
});

describe("subscriptionsApi endpoints (backend-plan section 6)", () => {
  test("current GETs /subscriptions/current", async () => {
    const fetchSpy = stubFetch(async () =>
      okResponse({ plan: { name: "Free" }, status: "active" }),
    );

    const result = await subscriptionsApi.current();

    expect(fetchSpy.mock.calls[0]![0]).toBe("/subscriptions/current");
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("GET");
    expect(result?.planName).toBe("Free");
  });
});
