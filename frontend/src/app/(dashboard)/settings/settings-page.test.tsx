import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { SessionProvider, type SessionValue } from "@/lib/auth/session";

const themeState = vi.hoisted(() => ({
  theme: "light",
  setTheme: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: themeState.theme,
    setTheme: themeState.setTheme,
  }),
}));

import { SettingsPage } from "./settings-page";

function sessionWith(overrides: Partial<SessionValue> = {}): SessionValue {
  return {
    status: "authenticated",
    user: {
      id: "u_1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "member",
    },
    tenant: { id: "t_1", name: "Acme Inc", plan: "Pro" },
    tenants: [{ id: "t_1", name: "Acme Inc", plan: "Pro" }],
    signOut: vi.fn(),
    refresh: async () => "authenticated",
    ...overrides,
  };
}

function renderSettings(session: SessionValue) {
  return render(
    <SessionProvider value={session}>
      <SettingsPage />
    </SessionProvider>,
  );
}

beforeEach(() => {
  themeState.theme = "light";
  themeState.setTheme.mockClear();
});

describe("SettingsPage", () => {
  test("shows profile information from the session", () => {
    renderSettings(sessionWith());

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("Member")).toBeInTheDocument();
  });

  test("shows workspace information from the session", () => {
    renderSettings(sessionWith());

    expect(screen.getByText("Acme Inc")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("t_1")).toBeInTheDocument();
  });

  test("switches the theme preference", async () => {
    const user = userEvent.setup();
    renderSettings(sessionWith());

    expect(
      screen.getByRole("button", { name: "Light" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Dark" }));

    expect(themeState.setTheme).toHaveBeenCalledWith("dark");
  });

  test("reports password changes as honestly unavailable", () => {
    renderSettings(sessionWith());

    expect(
      screen.getByText(/password changes? (is|are) not available/i),
    ).toBeInTheDocument();
  });

  test("signs out from the security section", async () => {
    const session = sessionWith();
    const user = userEvent.setup();
    renderSettings(session);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(session.signOut).toHaveBeenCalled();
  });
});
