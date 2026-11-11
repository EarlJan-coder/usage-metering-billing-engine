import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ApiKeysPage } from "./api-keys-page";

function okResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

const KEYS = [
  {
    id: "k_1",
    name: "production",
    maskedKey: "sk_live_••••4f2a",
    status: "active",
    createdAt: "2026-11-01T00:00:00.000Z",
    lastUsedAt: "2026-11-10T12:00:00.000Z",
  },
  {
    id: "k_2",
    name: "staging",
    prefix: "sk_test_9c1d",
    status: "revoked",
    created_at: "2026-10-15T00:00:00.000Z",
    last_used_at: null,
  },
];

function stubFetch() {
  const spy = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST" && url.endsWith("/api-keys")) {
      return Promise.resolve(
        okResponse({
          id: "k_3",
          name: "new-key",
          key: "sk_live_newsecret123",
          status: "active",
          createdAt: "2026-11-11T00:00:00.000Z",
        }),
      );
    }
    if (init?.method === "DELETE") {
      return Promise.resolve(okResponse({ ok: true }));
    }
    if (url.endsWith("/api-keys")) {
      return Promise.resolve(okResponse({ items: KEYS }));
    }
    return Promise.resolve(okResponse({}, 404));
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function renderApiKeys() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ApiKeysPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ApiKeysPage", () => {
  test("lists keys with masked value, status, and dates", async () => {
    stubFetch();

    renderApiKeys();

    expect(await screen.findByText("production")).toBeInTheDocument();
    expect(screen.getByText("sk_live_••••4f2a")).toBeInTheDocument();
    expect(screen.getByText("sk_test_9c1d")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Revoked")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
    expect(screen.getByText(/Nov 1, 2026/)).toBeInTheDocument();
  });

  test("creates a key and reveals the plaintext exactly once", async () => {
    const fetchSpy = stubFetch();
    const user = userEvent.setup();
    // Installed after setup(): user-event replaces navigator.clipboard.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderApiKeys();
    await screen.findByText("production");

    await user.click(
      screen.getByRole("button", { name: /Create API key/ }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox"), "new-key");
    await user.click(within(dialog).getByRole("button", { name: /Create key/ }));

    // One-time reveal dialog with the secret.
    const reveal = await screen.findByText("Copy your new API key");
    expect(reveal).toBeInTheDocument();
    expect(screen.getByText("sk_live_newsecret123")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /cannot be shown again/,
    );

    const createCall = fetchSpy.mock.calls.find(
      (call) =>
        String(call[0]).endsWith("/api-keys") &&
        (call[1] as RequestInit)?.method === "POST",
    );
    expect(createCall).toBeDefined();
    expect(
      JSON.parse((createCall![1] as RequestInit).body as string),
    ).toEqual({ name: "new-key" });

    // Copy hands the secret to the clipboard.
    await user.click(screen.getByRole("button", { name: "Copy API key" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("sk_live_newsecret123"),
    );

    // Closing discards it for good.
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(
        screen.queryByText("sk_live_newsecret123"),
      ).not.toBeInTheDocument();
    });
  });

  test("surfaces validation errors before any request", async () => {
    const fetchSpy = stubFetch();
    const user = userEvent.setup();

    renderApiKeys();
    await screen.findByText("production");

    await user.click(screen.getByRole("button", { name: /Create API key/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /Create key/ }));

    expect(
      await within(dialog).findByText(/Give the key a name/),
    ).toBeInTheDocument();
    const postCalls = fetchSpy.mock.calls.filter(
      (call) => (call[1] as RequestInit)?.method === "POST",
    );
    expect(postCalls).toHaveLength(0);
  });

  test("revokes a key after explicit confirmation", async () => {
    const fetchSpy = stubFetch();
    const user = userEvent.setup();

    renderApiKeys();
    await screen.findByText("production");

    await user.click(screen.getByRole("button", { name: "Revoke production" }));

    const confirm = await screen.findByRole("dialog");
    expect(
      within(confirm).getByText(/cannot be undone/),
    ).toBeInTheDocument();

    await user.click(
      within(confirm).getByRole("button", { name: "Revoke key" }),
    );

    await waitFor(() => {
      const deleteCall = fetchSpy.mock.calls.find(
        (call) => (call[1] as RequestInit)?.method === "DELETE",
      );
      expect(deleteCall).toBeDefined();
      expect(String(deleteCall![0])).toBe("/api-keys/k_1");
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  test("shows the developer integration example from the backend contract", async () => {
    stubFetch();

    renderApiKeys();

    expect(await screen.findByText("Developer integration")).toBeInTheDocument();
    expect(
      screen.getByText(/curl -X POST http:\/\/localhost:4000\/api\/v1\/metering\/track/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Idempotency-Key: unique-request-id/)).toBeInTheDocument();
  });

  test("shows an error alert with retry when the list fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );

    renderApiKeys();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load API keys");
    expect(
      screen.getByRole("button", { name: /Try again/ }),
    ).toBeInTheDocument();
  });
});
