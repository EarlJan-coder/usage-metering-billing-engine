import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { SessionProvider, type SessionValue } from "@/lib/auth/session";

import { AdminPage } from "./admin-page";

const state = vi.hoisted(() => ({
  metrics: {
    totalTenants: 12,
    activeSubscriptions: 5,
    totalApiCalls: 48210,
    totalTokens: 934000,
    estimatedRevenue: 123400,
    currency: "USD",
    jobs: { pending: 3, processing: 1, failed: 0, completed: 42 },
  } as unknown,
  tenants: {
    items: [
      {
        id: "t_1",
        name: "Acme Inc",
        plan: "Pro",
        status: "active",
        created_at: "2026-01-05T00:00:00.000Z",
        user_count: 4,
      },
    ],
  } as unknown,
  webhooks: {
    items: [
      {
        id: "evt_1",
        type: "checkout.session.completed",
        status: "delivered",
        received_at: "2026-11-01T10:00:00.000Z",
      },
    ],
  } as unknown,
  failMetrics: false,
  failTenants: false,
  failWebhooks: false,
  metricsStatus: 200,
}));

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

function okResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

function stubFetch() {
  const spy = vi.fn((...args: unknown[]) => {
    const url = String(args[0]);
    if (url.endsWith("/admin/metrics")) {
      if (state.failMetrics) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      return Promise.resolve(okResponse(state.metrics, state.metricsStatus));
    }
    if (url.endsWith("/admin/tenants")) {
      if (state.failTenants) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      return Promise.resolve(okResponse(state.tenants));
    }
    if (url.endsWith("/admin/webhooks")) {
      if (state.failWebhooks) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      return Promise.resolve(okResponse(state.webhooks));
    }
    return Promise.resolve(okResponse({}, 404));
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function sessionWith(role: "admin" | "member"): SessionValue {
  return {
    status: "authenticated",
    user: {
      id: "u_1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      role,
    },
    tenant: { id: "t_1", name: "Acme Inc", plan: "Pro" },
    tenants: [{ id: "t_1", name: "Acme Inc", plan: "Pro" }],
    signOut: vi.fn(),
    refresh: async () => "authenticated",
  };
}

function renderAdmin(role: "admin" | "member" = "admin") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <SessionProvider value={sessionWith(role)}>
      <QueryClientProvider client={client}>
        <AdminPage />
      </QueryClientProvider>
    </SessionProvider>,
  );
}

beforeEach(() => {
  state.metrics = {
    totalTenants: 12,
    activeSubscriptions: 5,
    totalApiCalls: 48210,
    totalTokens: 934000,
    estimatedRevenue: 123400,
    currency: "USD",
    jobs: { pending: 3, processing: 1, failed: 0, completed: 42 },
  };
  state.failMetrics = false;
  state.failTenants = false;
  state.failWebhooks = false;
  state.metricsStatus = 200;
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AdminPage", () => {
  test("denies non-administrators without calling admin endpoints", () => {
    const fetchSpy = stubFetch();

    renderAdmin("member");

    expect(
      screen.getByText(/Administrator access required/),
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("renders platform KPIs from /admin/metrics", async () => {
    stubFetch();

    renderAdmin("admin");

    expect(await screen.findByText("Total tenants")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Active subscriptions")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("$1,234.00")).toBeInTheDocument();
    expect(screen.getByText("48,210")).toBeInTheDocument();
  });

  test("renders recent webhook events", async () => {
    stubFetch();

    renderAdmin("admin");

    expect(
      await screen.findByText("checkout.session.completed"),
    ).toBeInTheDocument();
    expect(screen.getByText("Delivered")).toBeInTheDocument();
    expect(screen.getAllByText(/Nov 1, 2026/).length).toBeGreaterThan(0);
  });

  test("renders the tenant management table", async () => {
    stubFetch();

    renderAdmin("admin");

    expect(await screen.findByText("Acme Inc")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText(/Jan 5, 2026/)).toBeInTheDocument();
  });

  test("shows an error alert with retry when metrics fail", async () => {
    state.failMetrics = true;
    stubFetch();
    const user = userEvent.setup();

    renderAdmin("admin");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Could not load platform metrics/);
    expect(
      within(alert).getByRole("button", { name: /Try again/ }),
    ).toBeInTheDocument();

    state.failMetrics = false;
    await user.click(within(alert).getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("$1,234.00")).toBeInTheDocument();
  });

  test("shows an honest message when the backend answers 403", async () => {
    state.metricsStatus = 403;
    stubFetch();

    renderAdmin("admin");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/platform administrator access/i);
  });

  test("shows an error alert with retry when webhook events fail", async () => {
    state.failWebhooks = true;
    stubFetch();
    const user = userEvent.setup();

    renderAdmin("admin");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Could not load webhook events/);

    state.failWebhooks = false;
    await user.click(within(alert).getByRole("button", { name: /Try again/ }));
    expect(
      await screen.findByText("checkout.session.completed"),
    ).toBeInTheDocument();
  });

  test("shows an error alert with retry when tenants fail", async () => {
    state.failTenants = true;
    stubFetch();
    const user = userEvent.setup();

    renderAdmin("admin");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Could not load tenants/);

    state.failTenants = false;
    await user.click(within(alert).getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("Acme Inc")).toBeInTheDocument();
  });

  test("reports background job status honestly when unreported", async () => {
    const withoutJobs: Record<string, unknown> = {
      ...(state.metrics as Record<string, unknown>),
    };
    delete withoutJobs.jobs;
    state.metrics = withoutJobs;
    stubFetch();

    renderAdmin("admin");

    expect(await screen.findByText(/not reported/i)).toBeInTheDocument();
    expect(screen.getByText(/background job status/i)).toBeInTheDocument();
  });

  test("shows job counters when the backend reports them", async () => {
    stubFetch();

    renderAdmin("admin");

    expect(await screen.findByText("42")).toBeInTheDocument();
    expect(screen.getByText(/Background jobs/)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
