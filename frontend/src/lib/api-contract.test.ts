import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { adminApi } from "./api/admin";
import { apiKeysApi } from "./api/api-keys";
import { ApiError, setBearerToken, setUnauthorizedHandler } from "./api/client";
import { authApi } from "./api/auth";
import { billingApi } from "./api/billing";
import { plansApi } from "./api/plans";
import { subscriptionsApi } from "./api/subscriptions";
import { usageApi } from "./api/usage";

/**
 * API contract integration guard (backend-plan §6 — REST API Contract).
 *
 * The backend is the source of truth (frontend-plan §10), so every *Api
 * module must speak exactly the documented `/api/v1` endpoint + method
 * contract. This suite exercises each exported operation against a
 * recorded fetch and asserts path, method, and body shape — a contract
 * drift on either side fails here before it fails in production.
 */

function okResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

/** Stubs fetch, runs the operation, returns the recorded first call. */
async function record(
  run: () => Promise<unknown>,
  payload: unknown = {},
  status = 200,
): Promise<{ path: string; init: RequestInit }> {
  const spy = vi.fn((...args: unknown[]): Promise<Response> => {
    void args; // fetch(url, init) — args only read by the assertions below
    return Promise.resolve(okResponse(payload, status));
  });
  vi.stubGlobal("fetch", spy);
  await run().catch(() => undefined);
  expect(spy).toHaveBeenCalled();
  const call = spy.mock.calls[0]!;
  return { path: String(call[0]), init: (call[1] ?? {}) as RequestInit };
}

beforeEach(() => {
  setBearerToken(null);
  setUnauthorizedHandler(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("auth endpoints (§6: Authentication)", () => {
  test("register → POST /auth/register", async () => {
    const { path, init } = await record(() =>
      authApi.register({
        name: "Ada",
        email: "ada@example.com",
        password: "correct horse battery staple",
      }),
    );
    expect(path).toBe("/auth/register");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toMatchObject({
      email: "ada@example.com",
    });
  });

  test("login → POST /auth/login", async () => {
    const { path, init } = await record(() =>
      authApi.login({ email: "ada@example.com", password: "secret" }),
    );
    expect(path).toBe("/auth/login");
    expect(init.method).toBe("POST");
  });

  test("logout → POST /auth/logout", async () => {
    const { path, init } = await record(() => authApi.logout());
    expect(path).toBe("/auth/logout");
    expect(init.method).toBe("POST");
  });

  test("me → GET /auth/me", async () => {
    const { path, init } = await record(() => authApi.me());
    expect(path).toBe("/auth/me");
    expect((init.method ?? "GET").toUpperCase()).toBe("GET");
  });

  test("forgotPassword → POST /auth/forgot-password (not in §6 — documented extra)", async () => {
    const { path, init } = await record(() =>
      authApi.forgotPassword({ email: "ada@example.com" }),
    );
    expect(path).toBe("/auth/forgot-password");
    expect(init.method).toBe("POST");
  });
});

describe("plans endpoint (§6: Plans)", () => {
  test("list → GET /plans", async () => {
    const { path, init } = await record(() => plansApi.list());
    expect(path).toBe("/plans");
    expect((init.method ?? "GET").toUpperCase()).toBe("GET");
  });
});

describe("usage endpoints (§6: Usage)", () => {
  test("summary → GET /usage/summary", async () => {
    const { path, init } = await record(() => usageApi.summary());
    expect(path).toBe("/usage/summary");
    expect((init.method ?? "GET").toUpperCase()).toBe("GET");
  });

  test("history → GET /usage/history (query-string params)", async () => {
    const { path, init } = await record(() =>
      usageApi.history({ limit: 25, offset: 25, search: "api" }),
    );
    expect(path.startsWith("/usage/history")).toBe(true);
    expect(path).toContain("?");
    expect((init.method ?? "GET").toUpperCase()).toBe("GET");
  });

  test("analytics → GET /usage (never /usage/history)", async () => {
    const { path, init } = await record(() => usageApi.analytics());
    expect(/^\/usage(\?|$)/.test(path)).toBe(true);
    expect(path.startsWith("/usage/history")).toBe(false);
    expect((init.method ?? "GET").toUpperCase()).toBe("GET");
  });
});

describe("billing endpoints (§6: Billing)", () => {
  test("summary → GET /billing/summary", async () => {
    const { path, init } = await record(() => billingApi.summary());
    expect(path).toBe("/billing/summary");
    expect((init.method ?? "GET").toUpperCase()).toBe("GET");
  });
});

describe("subscription endpoints (§6: Subscriptions)", () => {
  test("current → GET /subscriptions/current", async () => {
    const { path, init } = await record(() => subscriptionsApi.current());
    expect(path).toBe("/subscriptions/current");
    expect((init.method ?? "GET").toUpperCase()).toBe("GET");
  });

  test("checkout → POST /subscriptions/checkout with { planId }", async () => {
    const { path, init } = await record(() =>
      subscriptionsApi.checkout({ planId: "plan_pro" }),
      { url: "https://checkout.stripe.com/c/pay/cs_test_123" },
    );
    expect(path).toBe("/subscriptions/checkout");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ planId: "plan_pro" });
  });

  test("cancel → POST /subscriptions/cancel", async () => {
    const { path, init } = await record(() => subscriptionsApi.cancel());
    expect(path).toBe("/subscriptions/cancel");
    expect(init.method).toBe("POST");
  });
});

describe("api key endpoints (§6: API Keys)", () => {
  test("list → GET /api-keys", async () => {
    const { path, init } = await record(() => apiKeysApi.list());
    expect(path).toBe("/api-keys");
    expect((init.method ?? "GET").toUpperCase()).toBe("GET");
  });

  test("create → POST /api-keys with { name }", async () => {
    const { path, init } = await record(() =>
      apiKeysApi.create({ name: "production" }),
      { id: "key_1", plaintext: "sk_live_newkey" },
    );
    expect(path).toBe("/api-keys");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ name: "production" });
  });

  test("revoke → DELETE /api-keys/:id", async () => {
    const { path, init } = await record(() => apiKeysApi.revoke("key_1"));
    expect(path).toBe("/api-keys/key_1");
    expect(init.method).toBe("DELETE");
  });
});

describe("admin endpoints (§6: Admin)", () => {
  test("metrics → GET /admin/metrics", async () => {
    const { path, init } = await record(() => adminApi.metrics());
    expect(path).toBe("/admin/metrics");
    expect((init.method ?? "GET").toUpperCase()).toBe("GET");
  });

  test("tenants → GET /admin/tenants", async () => {
    const { path, init } = await record(() => adminApi.tenants());
    expect(path).toBe("/admin/tenants");
    expect((init.method ?? "GET").toUpperCase()).toBe("GET");
  });

  test("webhooks → GET /admin/webhooks", async () => {
    const { path, init } = await record(() => adminApi.webhooks());
    expect(path).toBe("/admin/webhooks");
    expect((init.method ?? "GET").toUpperCase()).toBe("GET");
  });
});

describe("error propagation across the contract", () => {
  test("backend error responses surface as ApiError with status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          okResponse({ message: "Internal Server Error" }, 500),
        ),
      ),
    );

    await expect(plansApi.list()).rejects.toBeInstanceOf(ApiError);
    await expect(plansApi.list()).rejects.toMatchObject({ status: 500 });
  });
});
