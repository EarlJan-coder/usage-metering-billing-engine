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

  test("checkout POSTs /subscriptions/checkout with the plan id", async () => {
    const fetchSpy = stubFetch(async () =>
      okResponse({ url: "https://checkout.stripe.com/c/pay/cs_test_123" }),
    );

    const result = await subscriptionsApi.checkout({ planId: "pro" });

    expect(fetchSpy.mock.calls[0]![0]).toBe("/subscriptions/checkout");
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("POST");
    expect(
      JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string),
    ).toEqual({ planId: "pro" });
    expect(result.url).toBe("https://checkout.stripe.com/c/pay/cs_test_123");
  });

  test("checkout reads checkoutUrl/session.url aliases", async () => {
    stubFetch(async () =>
      okResponse({ session: { url: "https://checkout.stripe.com/pay/cs_test_9" } }),
    );
    expect((await subscriptionsApi.checkout({ planId: "pro" })).url).toBe(
      "https://checkout.stripe.com/pay/cs_test_9",
    );

    stubFetch(async () =>
      okResponse({ checkout_url: "https://checkout.stripe.com/pay/cs_test_8" }),
    );
    expect((await subscriptionsApi.checkout({ planId: "pro" })).url).toBe(
      "https://checkout.stripe.com/pay/cs_test_8",
    );
  });

  test("checkout returns a null url when the backend sends no redirect", async () => {
    stubFetch(async () => okResponse({ ok: true }));

    const result = await subscriptionsApi.checkout({ planId: "pro" });

    expect(result.url).toBeNull();
  });

  test("cancel POSTs /subscriptions/cancel", async () => {
    const fetchSpy = stubFetch(async () =>
      okResponse({ plan: { name: "Pro" }, status: "canceled" }),
    );

    const result = await subscriptionsApi.cancel();

    expect(fetchSpy.mock.calls[0]![0]).toBe("/subscriptions/cancel");
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("POST");
    expect(result?.status).toBe("canceled");
  });
});
