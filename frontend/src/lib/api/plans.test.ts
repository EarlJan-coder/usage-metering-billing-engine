import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { setBearerToken, setUnauthorizedHandler } from "./client";
import { normalizePlan, normalizePlans, plansApi } from "./plans";

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

describe("normalizePlan", () => {
  test("maps the canonical seeded plan payload", () => {
    const plan = normalizePlan({
      id: "free",
      name: "Free",
      description: "For evaluation",
      price: 0,
      currency: "USD",
      interval: "month",
      limits: { apiCalls: 1000, tokens: 100000 },
      features: ["Usage analytics"],
      isDefault: true,
    });

    expect(plan).toEqual({
      id: "free",
      name: "Free",
      description: "For evaluation",
      priceMinor: 0,
      currency: "USD",
      interval: "month",
      callsLimit: 1000,
      tokensLimit: 100000,
      features: ["Usage analytics"],
      isDefault: true,
    });
  });

  test("accepts snake_case and flat limit aliases", () => {
    const plan = normalizePlan({
      plan_id: "pro",
      plan_name: "Pro",
      price_minor: 2000,
      billing_interval: "month",
      api_call_limit: 50000,
      token_limit: 1000000,
      is_default: false,
    });

    expect(plan).toMatchObject({
      id: "pro",
      name: "Pro",
      priceMinor: 2000,
      interval: "month",
      callsLimit: 50000,
      tokensLimit: 1000000,
      isDefault: false,
    });
  });

  test("returns null without an id or name", () => {
    expect(normalizePlan({ name: "Free" })).toBeNull();
    expect(normalizePlan({ id: "free" })).toBeNull();
    expect(normalizePlan(null)).toBeNull();
    expect(normalizePlan("nope")).toBeNull();
  });

  test("defaults missing optional fields", () => {
    const plan = normalizePlan({ id: "free", name: "Free" });

    expect(plan).toMatchObject({
      priceMinor: 0,
      currency: "USD",
      interval: "month",
      callsLimit: null,
      tokensLimit: null,
      features: [],
      isDefault: false,
    });
    expect(plan!.description).toBeNull();
  });
});

describe("normalizePlans", () => {
  test("reads items/plans/bare-array payloads and drops invalid entries", () => {
    const free = { id: "free", name: "Free" };
    const pro = { id: "pro", name: "Pro" };

    expect(normalizePlans({ items: [free, pro] })).toHaveLength(2);
    expect(normalizePlans({ plans: [free] })).toHaveLength(1);
    expect(normalizePlans([free])).toHaveLength(1);
    expect(normalizePlans({ items: [{ name: "no-id" }] })).toEqual([]);
    expect(normalizePlans(null)).toEqual([]);
  });
});

describe("plansApi endpoints (backend-plan section 6)", () => {
  test("list GETs /plans", async () => {
    const fetchSpy = stubFetch(async () => okResponse({ items: [] }));

    await plansApi.list();

    expect(fetchSpy.mock.calls[0]![0]).toBe("/plans");
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("GET");
  });

  test("list returns normalized plans", async () => {
    stubFetch(async () =>
      okResponse({
        items: [
          { id: "free", name: "Free", limits: { apiCalls: 1000, tokens: 100000 } },
          { id: "pro", name: "Pro", price: 2000 },
        ],
      }),
    );

    const plans = await plansApi.list();

    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({ id: "free", callsLimit: 1000, tokensLimit: 100000 });
    expect(plans[1]).toMatchObject({ id: "pro", priceMinor: 2000 });
  });
});
