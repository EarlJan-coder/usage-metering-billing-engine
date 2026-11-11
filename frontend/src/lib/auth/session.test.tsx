import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { apiFetch, setBearerToken, setUnauthorizedHandler } from "@/lib/api/client";
import { SessionProvider, useSession } from "./session";

function okResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

function errorResponse(status: number, payload: unknown = {}): Response {
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

function Probe() {
  const { status, user, tenant, signOut } = useSession();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user?.name ?? "none"}</span>
      <span data-testid="tenant">{tenant?.name ?? "none"}</span>
      <button onClick={() => void signOut()}>sign out</button>
    </div>
  );
}

const ME_PAYLOAD = {
  user: {
    id: "u_1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: "admin",
  },
  tenant: { id: "t_1", name: "Acme", plan: "pro" },
};

beforeEach(() => {
  setBearerToken(null);
  setUnauthorizedHandler(null);
  vi.unstubAllGlobals();
});

describe("SessionProvider", () => {
  test("loads the session from GET /auth/me on mount", async () => {
    const fetchSpy = stubFetch(async () => okResponse(ME_PAYLOAD));

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated"),
    );
    expect(screen.getByTestId("user")).toHaveTextContent("Ada Lovelace");
    expect(screen.getByTestId("tenant")).toHaveTextContent("Acme");
    expect(fetchSpy.mock.calls[0]![0]).toBe("/auth/me");
    expect(
      (fetchSpy.mock.calls[0]![1] as RequestInit).credentials,
    ).toBe("include");
  });

  test("treats a 401 from /auth/me as unauthenticated", async () => {
    stubFetch(async () => errorResponse(401));

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"),
    );
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });

  test("reports error status when the backend is unreachable", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("error"),
    );
  });

  test("signOut calls POST /auth/logout and clears the session", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(okResponse(ME_PAYLOAD))
      .mockResolvedValueOnce(okResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated"),
    );

    await user.click(screen.getByRole("button", { name: "sign out" }));

    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"),
    );
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    const logoutCall = fetchSpy.mock.calls.find(
      (call) => call[0] === "/auth/logout",
    );
    expect(logoutCall).toBeDefined();
    expect((logoutCall![1] as RequestInit).method).toBe("POST");
  });

  test("a 401 on any API call expires an authenticated session", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(okResponse(ME_PAYLOAD))
      .mockResolvedValueOnce(errorResponse(401));
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated"),
    );

    await expect(apiFetch("/usage/summary")).rejects.toMatchObject({
      status: 401,
    });

    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"),
    );
  });
});
