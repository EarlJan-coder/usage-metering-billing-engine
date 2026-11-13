import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { axe, toHaveNoViolations } from "jest-axe";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  GUEST_SESSION,
  SessionProvider,
  type SessionValue,
} from "@/lib/auth/session";

expect.extend(toHaveNoViolations);

/**
 * Typed wrapper around axe's matcher (registered above via expect.extend).
 * We cannot augment vitest's `Assertion` interface: this program already
 * holds two mutually incompatible declarations — jest-dom's
 * `Assertion<T = any>` (1 param) and vitest's `Assertion<R, T>` (2 params)
 * — so any `declare module "vitest"` merge fails TS2428 no matter its
 * shape. skipLibCheck hides the lib-side conflict; only checked files
 * surface it. The single cast here keeps the call sites clean.
 */
function expectNoViolations(results: Awaited<ReturnType<typeof axe>>): void {
  (expect(results) as unknown as { toHaveNoViolations(): void })
    .toHaveNoViolations();
}

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/overview",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

import Home from "./app/page";
import { LoginForm } from "./app/(auth)/login/login-form";
import { AdminPage } from "./app/(dashboard)/admin/admin-page";
import { BillingPage } from "./app/(dashboard)/billing/billing-page";
import { OverviewDashboard } from "./app/(dashboard)/overview/overview-dashboard";
import { SettingsPage } from "./app/(dashboard)/settings/settings-page";
import { UsageHistory } from "./app/(dashboard)/usage/usage-history";
import { DashboardLayout } from "./components/layout/dashboard-layout";

function okResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(okResponse({}))),
  );
}

function adminSession(): SessionValue {
  return {
    status: "authenticated",
    user: {
      id: "u_1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "admin",
    },
    tenant: { id: "t_1", name: "Acme Inc", plan: "Pro" },
    tenants: [{ id: "t_1", name: "Acme Inc", plan: "Pro" }],
    signOut: vi.fn(),
    refresh: async () => "authenticated",
  };
}

function withProviders(ui: React.ReactNode, session = adminSession()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <SessionProvider value={session}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </SessionProvider>
  );
}

beforeEach(() => {
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Renders and waits until every loading skeleton is gone, so axe scans
 * the resolved DOM instead of loading placeholders. */
async function renderAxe(ui: React.ReactNode, session = adminSession()) {
  const utils = render(withProviders(ui, session));
  await waitFor(() => {
    expect(
      utils.container.querySelector('[data-slot="skeleton"]'),
    ).toBeNull();
  });
  return utils;
}

/**
 * Accessibility regression suite (frontend-plan Phase 10 — accessibility
 * improvements). Runs axe-core over representative surfaces of every
 * layout: marketing, auth, dashboard shell, and the dashboard pages.
 */
describe("accessibility (axe-core)", () => {
  test("landing page", async () => {
    const { container } = await renderAxe(<Home />);
    expectNoViolations(await axe(container));
  });

  test("login form", async () => {
    const { container } = await renderAxe(
      <LoginForm />,
      GUEST_SESSION,
    );
    expectNoViolations(await axe(container));
  });

  test("dashboard shell (sidebar, header, theme switcher)", async () => {
    const { container } = await renderAxe(
      <DashboardLayout>
        <div />
      </DashboardLayout>,
    );
    expectNoViolations(await axe(container));
  });

  test("settings page", async () => {
    const { container } = await renderAxe(<SettingsPage />);
    expectNoViolations(await axe(container));
  });

  test("billing page", async () => {
    const { container } = await renderAxe(<BillingPage />);
    expectNoViolations(await axe(container));
  });

  test("admin page", async () => {
    const { container } = await renderAxe(<AdminPage />);
    expectNoViolations(await axe(container));
  });

  test("overview dashboard", async () => {
    const { container } = await renderAxe(<OverviewDashboard />);
    expectNoViolations(await axe(container));
  });

  test("usage history (dense table, filters, export)", async () => {
    const { container } = await renderAxe(<UsageHistory />);
    expectNoViolations(await axe(container));
  });
});
