import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { SubscriptionPage } from "./subscription-page";

const state = vi.hoisted(() => ({
  subscription: {
    plan: { name: "Pro" },
    status: "active",
    currentPeriodStart: "2026-11-01T00:00:00.000Z",
    currentPeriodEnd: "2026-12-01T00:00:00.000Z",
    cancelAtPeriodEnd: true,
  } as unknown,
  usage: {
    totalApiCalls: 1000,
    totalTokens: 50000,
    quota: {
      apiCalls: { used: 1000, limit: 5000 },
      tokens: { used: 50000, limit: 500000 },
    },
  } as unknown,
  failSubscription: false,
  failUsage: false,
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
  const spy = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/subscriptions/current")) {
      return state.failSubscription
        ? Promise.reject(new TypeError("Failed to fetch"))
        : Promise.resolve(okResponse(state.subscription));
    }
    if (url.endsWith("/usage/summary")) {
      return state.failUsage
        ? Promise.reject(new TypeError("Failed to fetch"))
        : Promise.resolve(okResponse(state.usage));
    }
    return Promise.resolve(okResponse({}, 404));
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function renderSubscription() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SubscriptionPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.subscription = {
    plan: { name: "Pro" },
    status: "active",
    currentPeriodStart: "2026-11-01T00:00:00.000Z",
    currentPeriodEnd: "2026-12-01T00:00:00.000Z",
    cancelAtPeriodEnd: true,
  };
  state.failSubscription = false;
  state.failUsage = false;
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SubscriptionPage", () => {
  test("shows current plan, status, and billing period", async () => {
    stubFetch();

    renderSubscription();

    expect(await screen.findByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Current Subscription")).toBeInTheDocument();
    expect(screen.getAllByText(/Nov 1, 2026/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Cancels at period end/)).toBeInTheDocument();
  });

  test("shows usage limits and current consumption from the backend", async () => {
    stubFetch();

    renderSubscription();

    expect(await screen.findByText(/1,000 \/ 5,000/)).toBeInTheDocument();
    expect(screen.getByText("20% of limit used")).toBeInTheDocument();
    expect(screen.getByText(/50,000 \/ 500,000/)).toBeInTheDocument();
    expect(screen.getByText("10% of limit used")).toBeInTheDocument();
  });

  test("shows an empty state when the backend reports no subscription", async () => {
    state.subscription = {};
    stubFetch();

    renderSubscription();

    expect(
      await screen.findByText(/No subscription reported/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View plans/ })).toHaveAttribute(
      "href",
      "/billing",
    );
  });

  test("shows an error alert with retry when the subscription fails", async () => {
    state.failSubscription = true;
    stubFetch();
    const user = userEvent.setup();

    renderSubscription();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Could not load subscription/);
    expect(
      within(alert).getByRole("button", { name: /Try again/ }),
    ).toBeInTheDocument();

    state.failSubscription = false;
    await user.click(within(alert).getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("Pro")).toBeInTheDocument();
  });

  test("shows an error alert with retry when usage data fails", async () => {
    state.failUsage = true;
    stubFetch();

    renderSubscription();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Usage data could not be loaded/);
    expect(
      within(alert).getByRole("button", { name: /Try again/ }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Pro")).toBeInTheDocument();
  });

  test("refresh refetches subscription and usage from the backend", async () => {
    const fetchSpy = stubFetch();
    const user = userEvent.setup();

    renderSubscription();
    await screen.findByText("Pro");

    const countCalls = () =>
      fetchSpy.mock.calls.filter((entry) =>
        String(entry[0]).endsWith("/subscriptions/current"),
      ).length;
    expect(countCalls()).toBe(1);

    await user.click(screen.getByRole("button", { name: /Refresh/ }));

    await waitFor(() => expect(countCalls()).toBeGreaterThan(1));
  });
});
