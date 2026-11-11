import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  ApiError,
  apiFetch,
  setBearerToken,
  setUnauthorizedHandler,
} from "./client";

function okResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

function errorResponse(status: number, payload: unknown): Response {
  return {
    ok: false,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
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

describe("apiFetch", () => {
  test("joins NEXT_PUBLIC_API_BASE_URL with the path, sends cookies, and parses JSON", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com/api/v1/");
    const fetchSpy = stubFetch(async () => okResponse({ ok: true }));

    const result = await apiFetch<{ ok: boolean }>("/auth/me");

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchSpy.mock.calls[0]! as [
      string,
      RequestInit | undefined,
    ];
    expect(url).toBe("https://api.example.com/api/v1/auth/me");
    expect(init?.credentials).toBe("include");
    expect(init?.method).toBe("GET");
  });

  test("serializes JSON bodies with a content-type header", async () => {
    const fetchSpy = stubFetch(async () => okResponse({ ok: true }));

    await apiFetch("/auth/login", {
      method: "POST",
      body: { email: "ada@example.com" },
    });

    const [, init] = fetchSpy.mock.calls[0]! as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ email: "ada@example.com" }));
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  test("attaches the in-memory bearer token when one is set", async () => {
    const fetchSpy = stubFetch(async () => okResponse({ ok: true }));

    setBearerToken("tok-123");
    await apiFetch("/usage/summary");
    setBearerToken(null);
    await apiFetch("/usage/summary");

    const withToken = fetchSpy.mock.calls[0]![1] as RequestInit;
    const withoutToken = fetchSpy.mock.calls[1]![1] as RequestInit;
    expect((withToken.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok-123",
    );
    expect(
      (withoutToken.headers as Record<string, string>).Authorization,
    ).toBeUndefined();
  });

  test("throws ApiError carrying the error envelope on non-2xx", async () => {
    stubFetch(async () =>
      errorResponse(400, {
        error: { message: "Invalid credentials", code: "invalid_credentials" },
      }),
    );

    const attempt = apiFetch("/auth/login", { method: "POST", body: {} });
    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await expect(attempt).rejects.toMatchObject({
      status: 400,
      message: "Invalid credentials",
      code: "invalid_credentials",
    });
  });

  test("invokes the unauthorized handler exactly once on 401", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    stubFetch(async () => errorResponse(401, {}));

    await expect(apiFetch("/auth/me")).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("wraps network failures as ApiError with status 0", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(apiFetch("/auth/me")).rejects.toMatchObject({
      status: 0,
      code: "network_error",
    });
  });
});
