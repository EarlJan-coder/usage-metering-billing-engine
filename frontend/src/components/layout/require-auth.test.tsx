import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const nav = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/overview",
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), back: vi.fn() }),
}));

import { SessionProvider, type SessionValue } from "@/lib/auth/session";

import { RequireAuth } from "./require-auth";

function sessionWith(status: SessionValue["status"]): SessionValue {
  return {
    status,
    user:
      status === "authenticated"
        ? {
            id: "u_1",
            name: "Ada Lovelace",
            email: "ada@example.com",
            role: "member",
          }
        : null,
    tenant: null,
    tenants: [],
    signOut: vi.fn(),
    refresh: async () => status,
  };
}

function renderGuard(status: SessionValue["status"]) {
  return render(
    <SessionProvider value={sessionWith(status)}>
      <RequireAuth>
        <div>Secret dashboard</div>
      </RequireAuth>
    </SessionProvider>,
  );
}

beforeEach(() => {
  nav.replace.mockClear();
});

/**
 * Route guard behavior (frontend-plan Phase 4 — protected routes, session
 * expiration): loading shows a session-check state, unauthenticated
 * redirects with a return path, a transient backend error must NOT log
 * the user out, and authenticated renders the children.
 */
describe("RequireAuth", () => {
  test("shows the session-check state while loading", () => {
    renderGuard("loading");

    expect(
      screen.getByRole("status", { name: /Checking your session/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Secret dashboard")).not.toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  test("redirects unauthenticated visitors to login with a return path", () => {
    renderGuard("unauthenticated");

    expect(nav.replace).toHaveBeenCalledWith("/login?next=%2Foverview");
    expect(screen.queryByText("Secret dashboard")).not.toBeInTheDocument();
  });

  test("renders an honest warning and no redirect on a backend error", () => {
    renderGuard("error");

    expect(nav.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Secret dashboard")).toBeInTheDocument();
  });

  test("renders the children for an authenticated session", () => {
    renderGuard("authenticated");

    expect(screen.getByText("Secret dashboard")).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
