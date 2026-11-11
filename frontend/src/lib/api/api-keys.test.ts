import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { setBearerToken, setUnauthorizedHandler } from "./client";
import {
  apiKeysApi,
  normalizeApiKey,
  normalizeApiKeys,
  extractPlaintextKey,
} from "./api-keys";

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

describe("normalizeApiKey", () => {
  test("maps the canonical key payload", () => {
    const key = normalizeApiKey({
      id: "k_1",
      name: "production",
      maskedKey: "sk_live_••••4f2a",
      status: "active",
      createdAt: "2026-11-01T00:00:00.000Z",
      lastUsedAt: "2026-11-10T12:00:00.000Z",
    });

    expect(key).toEqual({
      id: "k_1",
      name: "production",
      maskedKey: "sk_live_••••4f2a",
      status: "active",
      createdAt: "2026-11-01T00:00:00.000Z",
      lastUsedAt: "2026-11-10T12:00:00.000Z",
    });
  });

  test("accepts snake_case aliases and prefix/key aliases", () => {
    const key = normalizeApiKey({
      key_id: "k_2",
      key_name: "staging",
      prefix: "sk_test_9c1d",
      created_at: "2026-11-02T00:00:00.000Z",
      last_used_at: null,
    });

    expect(key).toMatchObject({
      id: "k_2",
      name: "staging",
      maskedKey: "sk_test_9c1d",
      createdAt: "2026-11-02T00:00:00.000Z",
      lastUsedAt: null,
    });
    expect(key!.status).toBe("active");
  });

  test("returns null without an id", () => {
    expect(normalizeApiKey({ name: "no-id" })).toBeNull();
    expect(normalizeApiKey(null)).toBeNull();
    expect(normalizeApiKey("nope")).toBeNull();
  });
});

describe("normalizeApiKeys", () => {
  test("reads items/keys/bare-array payloads and drops invalid entries", () => {
    const key = { id: "k_1", name: "a" };

    expect(normalizeApiKeys({ items: [key] })).toEqual([
      normalizeApiKey(key),
    ]);
    expect(normalizeApiKeys({ keys: [key] })).toHaveLength(1);
    expect(normalizeApiKeys([key])).toHaveLength(1);
    expect(normalizeApiKeys({ items: [{ name: "bad" }] })).toEqual([]);
    expect(normalizeApiKeys(null)).toEqual([]);
  });
});

describe("extractPlaintextKey", () => {
  test("reads one-time key field names", () => {
    expect(extractPlaintextKey({ key: "sk_live_abc" })).toBe("sk_live_abc");
    expect(extractPlaintextKey({ secret: "sk_secret" })).toBe("sk_secret");
    expect(extractPlaintextKey({ plaintext: "pk_plain" })).toBe("pk_plain");
    expect(extractPlaintextKey({ data: { apiKey: "sk_nested" } })).toBe(
      "sk_nested",
    );
    expect(extractPlaintextKey({})).toBeNull();
    expect(extractPlaintextKey(null)).toBeNull();
  });

  test("ignores masked values so a masked key is never treated as plaintext", () => {
    expect(
      extractPlaintextKey({ key: "sk_live_••••4f2a", maskedKey: "sk_live_••••4f2a" }),
    ).toBeNull();
  });
});

describe("apiKeysApi endpoints (backend-plan section 6)", () => {
  test("list GETs /api-keys", async () => {
    const fetchSpy = stubFetch(async () => okResponse({ items: [] }));

    await apiKeysApi.list();

    expect(fetchSpy.mock.calls[0]![0]).toBe("/api-keys");
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("GET");
  });

  test("create POSTs /api-keys with the key name and returns the one-time plaintext", async () => {
    const fetchSpy = stubFetch(async () =>
      okResponse({
        id: "k_9",
        name: "production",
        key: "sk_live_newkey",
        status: "active",
        createdAt: "2026-11-11T00:00:00.000Z",
      }),
    );

    const created = await apiKeysApi.create({ name: "production" });

    expect(fetchSpy.mock.calls[0]![0]).toBe("/api-keys");
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("POST");
    expect(
      JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string),
    ).toEqual({ name: "production" });
    expect(created.key.id).toBe("k_9");
    expect(created.plaintext).toBe("sk_live_newkey");
  });

  test("create returns null plaintext when the backend sends no one-time key", async () => {
    stubFetch(async () => okResponse({ id: "k_10", name: "x" }));

    const created = await apiKeysApi.create({ name: "x" });

    expect(created.key.id).toBe("k_10");
    expect(created.plaintext).toBeNull();
  });

  test("revoke DELETEs /api-keys/:id", async () => {
    const fetchSpy = stubFetch(async () => okResponse({ ok: true }));

    await apiKeysApi.revoke("k_1");

    expect(fetchSpy.mock.calls[0]![0]).toBe("/api-keys/k_1");
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
  });
});
