import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  getBearerToken,
  setBearerToken,
  setUnauthorizedHandler,
} from "./client";
import { authApi, extractToken, normalizeAuthPayload } from "./auth";

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

describe("normalizeAuthPayload", () => {
  test("maps a wrapped user and tenant payload", () => {
    const result = normalizeAuthPayload({
      user: {
        id: "u_1",
        name: "Ada Lovelace",
        email: "ada@example.com",
        role: "admin",
      },
      tenant: { id: "t_1", name: "Acme", plan: "pro" },
    });

    expect(result.user).toEqual({
      id: "u_1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "admin",
    });
    expect(result.tenant).toEqual({ id: "t_1", name: "Acme", plan: "pro" });
  });

  test("accepts a flat user object and defaults role to member", () => {
    const result = normalizeAuthPayload({
      id: "u_2",
      email: "grace@example.com",
    });

    expect(result.user).toEqual({
      id: "u_2",
      name: "grace",
      email: "grace@example.com",
      role: "member",
    });
    expect(result.tenant).toBeNull();
  });

  test("builds a workspace from tenantId when only the id is present", () => {
    const result = normalizeAuthPayload({
      user: { id: "u_3", email: "linus@example.com" },
      tenantId: "t_9",
    });

    expect(result.tenant).toEqual({ id: "t_9", name: "Workspace" });
  });

  test("returns no session for garbage payloads", () => {
    expect(normalizeAuthPayload(null)).toEqual({ user: null, tenant: null });
    expect(normalizeAuthPayload("nope")).toEqual({ user: null, tenant: null });
    expect(normalizeAuthPayload({})).toEqual({ user: null, tenant: null });
  });
});

describe("extractToken", () => {
  test("reads token and accessToken field names", () => {
    expect(extractToken({ token: "abc" })).toBe("abc");
    expect(extractToken({ accessToken: "xyz" })).toBe("xyz");
    expect(extractToken({})).toBeNull();
    expect(extractToken(null)).toBeNull();
  });
});

describe("authApi endpoints (backend-plan section 6 contract)", () => {
  test("login POSTs /auth/login and captures the returned token", async () => {
    const fetchSpy = stubFetch(async () =>
      okResponse({ token: "jwt-1", user: { id: "u_1", email: "a@b.co" } }),
    );

    await authApi.login({ email: "a@b.co", password: "secret123" });

    expect(fetchSpy.mock.calls[0]![0]).toBe("/auth/login");
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("POST");
    expect(getBearerToken()).toBe("jwt-1");
  });

  test("register POSTs /auth/register", async () => {
    const fetchSpy = stubFetch(async () => okResponse({ token: "jwt-2" }));

    await authApi.register({
      name: "Ada",
      email: "ada@example.com",
      password: "supersecret1",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe("/auth/register");
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("POST");
  });

  test("me GETs /auth/me with credentials included", async () => {
    const fetchSpy = stubFetch(async () =>
      okResponse({ user: { id: "u_1", email: "a@b.co" } }),
    );

    await authApi.me();

    expect(fetchSpy.mock.calls[0]![0]).toBe("/auth/me");
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
  });

  test("logout POSTs /auth/logout and clears the bearer token", async () => {
    const fetchSpy = stubFetch(async () => okResponse({ ok: true }));
    setBearerToken("stale");

    await authApi.logout();

    expect(fetchSpy.mock.calls[0]![0]).toBe("/auth/logout");
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("POST");
    expect(getBearerToken()).toBeNull();
  });

  test("forgotPassword POSTs /auth/forgot-password", async () => {
    const fetchSpy = stubFetch(async () => okResponse({ ok: true }));

    await authApi.forgotPassword({ email: "ada@example.com" });

    expect(fetchSpy.mock.calls[0]![0]).toBe("/auth/forgot-password");
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("POST");
  });
});

describe("bearer token lifecycle (JWT-in-body mode, backend-plan §6)", () => {
  test("me keeps a login-issued token when the payload omits it", async () => {
    stubFetch(async () => okResponse({ user: { id: "u_1", email: "a@b.co" } }));
    setBearerToken("jwt-from-login");

    await authApi.me();

    expect(getBearerToken()).toBe("jwt-from-login");
  });

  test("me refreshes the token when the payload carries one", async () => {
    stubFetch(async () => okResponse({ token: "rotated" }));
    setBearerToken("jwt-old");

    await authApi.me();

    expect(getBearerToken()).toBe("rotated");
  });

  test("login without a token clears a stale bearer (fresh session)", async () => {
    stubFetch(async () => okResponse({ user: { id: "u_1", email: "a@b.co" } }));
    setBearerToken("stale");

    await authApi.login({ email: "a@b.co", password: "secret123" });

    expect(getBearerToken()).toBeNull();
  });
});
