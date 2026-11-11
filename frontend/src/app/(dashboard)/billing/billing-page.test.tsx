import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BillingPage } from "./billing-page";

const state = vi.hoisted(() => ({
  search: "",
  subscription: {
    plan: { name: "Free" },
    status: "active",
    currentPeriodStart: "2026-11-01T00:00:00.000Z",
    currentPeriodEnd: "2026-12-01T00:00:00.000Z",
  } as unknown,
  plans: {
    items: [
      {
        id: "free",
        name: "Free",
        description: "For evaluation",
        price: 0,
        currency: "USD",
        interval: "month",
        limits: { apiCalls: 1000, tokens: 100000 },
        features: ["Usage analytics"],
        isDefault: true,
      },
      {
        id: "pro",
        name: "Pro",
        description: "For production workloads",
        price: 2000,
        currency: "USD",
        interval: "month",
        limits: { apiCalls: 50000, tokens: 1000000 },
        features: ["Usage analytics", "Priority support"],
        isDefault: false,
      },
    ],
  } as unknown,
  summary: {
    estimatedCost: 4599,
    currency: "USD",
    periodStart: "2026-11-01T00:00:00.000Z",
    periodEnd: "2026-12-01T00:00:00.000Z",
    nextInvoiceAt: "2026-12-01T00:00:00.000Z",
  } as unknown,
  failSummary: false,
  checkoutResponse: {
    url: "https://checkout.stripe.com/pay/cs_test_123",
  } as unknown,
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

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(state.search),
}));

vi.mock("@/lib/checkout-redirect", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/checkout-redirect")>();
  return { ...actual, navigateToCheckout: vi.fn(() => true) };
});

import { navigateToCheckout } from "@/lib/checkout-redirect";

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
    if (url.endsWith("/billing/summary")) {
      return state.failSummary
        ? Promise.reject(new TypeError("Failed to fetch"))
        : Promise.resolve(okResponse(state.summary));
    }
    if (url.endsWith("/plans")) return Promise.resolve(okResponse(state.plans));
    if (url.endsWith("/subscriptions/current")) {
      return Promise.resolve(okResponse(state.subscription));
    }
    if (url.endsWith("/subscriptions/checkout")) {
      return Promise.resolve(okResponse(state.checkoutResponse));
    }
    if (url.endsWith("/subscriptions/cancel")) {
      return Promise.resolve(
        okResponse({ plan: { name: "Free" }, status: "canceled" }),
      );
    }
    return Promise.resolve(okResponse({}, 404));
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function renderBilling() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BillingPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.search = "";
  state.subscription = {
    plan: { name: "Free" },
    status: "active",
    currentPeriodStart: "2026-11-01T00:00:00.000Z",
    currentPeriodEnd: "2026-12-01T00:00:00.000Z",
  };
  state.failSummary = false;
  state.checkoutResponse = {
    url: "https://checkout.stripe.com/pay/cs_test_123",
  };
  vi.mocked(navigateToCheckout).mockClear();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BillingPage", () => {
  test("shows estimated cost, billing period, and subscription status", async () => {
    stubFetch();

    renderBilling();

    expect(await screen.findByText("$45.99")).toBeInTheDocument();
    expect(await screen.findByText("Active")).toBeInTheDocument();
    expect(await screen.findByText("Free")).toBeInTheDocument();
    expect(screen.getAllByText(/Nov 1, 2026/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Dec 1, 2026/).length).toBeGreaterThan(0);
  });

  test("renders Free and Pro plan cards with the current plan marked", async () => {
    stubFetch();

    renderBilling();

    await screen.findByRole("button", { name: /Upgrade to Pro/ });
    expect(screen.getByText("$0.00 / month")).toBeInTheDocument();
    expect(screen.getByText("$20.00 / month")).toBeInTheDocument();
    expect(screen.getByText("Current plan")).toBeInTheDocument();
    expect(screen.getByText(/1,000 API calls/)).toBeInTheDocument();
    expect(screen.getByText(/100,000 AI tokens/)).toBeInTheDocument();
  });

  test("starts checkout and opens the backend-provided URL", async () => {
    const fetchSpy = stubFetch();
    const user = userEvent.setup();

    renderBilling();
    await user.click(await screen.findByRole("button", { name: /Upgrade to Pro/ }));

    await waitFor(() => {
      const call = fetchSpy.mock.calls.find((entry) =>
        String(entry[0]).endsWith("/subscriptions/checkout"),
      );
      expect(call).toBeDefined();
      expect(
        JSON.parse((call![1] as RequestInit).body as string),
      ).toEqual({ planId: "pro" });
    });
    await waitFor(() =>
      expect(vi.mocked(navigateToCheckout)).toHaveBeenCalledWith(
        "https://checkout.stripe.com/pay/cs_test_123",
      ),
    );
  });

  test("shows an honest notice when returning from checkout", async () => {
    state.search = "checkout=success";
    const fetchSpy = stubFetch();

    renderBilling();

    expect(
      await screen.findByText("Returned from Stripe Checkout"),
    ).toBeInTheDocument();
    expect(screen.getByText(/verified webhook/)).toBeInTheDocument();
    expect(
      screen.queryByText(/payment (was )?(successful|succeeded)/i),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some((entry) =>
          String(entry[0]).endsWith("/subscriptions/current"),
        ),
      ).toBe(true);
    });
  });

  test("shows a cancellation notice for a canceled checkout", async () => {
    state.search = "checkout=canceled";
    stubFetch();

    renderBilling();

    expect(await screen.findByText("Checkout canceled")).toBeInTheDocument();
    expect(
      screen.getByText(/No changes were made to your subscription/),
    ).toBeInTheDocument();
  });

  test("downgrades to Free after explicit confirmation", async () => {
    state.subscription = {
      plan: { name: "Pro" },
      status: "active",
      currentPeriodStart: "2026-11-01T00:00:00.000Z",
      currentPeriodEnd: "2026-12-01T00:00:00.000Z",
    };
    const fetchSpy = stubFetch();
    const user = userEvent.setup();

    renderBilling();
    await user.click(
      await screen.findByRole("button", { name: "Downgrade to Free" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/cancels the paid subscription/i),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: "Confirm downgrade" }),
    );

    await waitFor(() => {
      const call = fetchSpy.mock.calls.find(
        (entry) =>
          String(entry[0]).endsWith("/subscriptions/cancel") &&
          (entry[1] as RequestInit)?.method === "POST",
      );
      expect(call).toBeDefined();
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  test("shows an honest error when checkout returns no URL", async () => {
    state.checkoutResponse = { ok: true };
    stubFetch();
    const user = userEvent.setup();

    renderBilling();
    await user.click(await screen.findByRole("button", { name: /Upgrade to Pro/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/no redirect URL/i);
    expect(alert).toHaveTextContent(/Nothing was charged/);
    expect(vi.mocked(navigateToCheckout)).not.toHaveBeenCalled();
  });

  test("falls back to the default plan when the backend reports no subscription", async () => {
    state.subscription = {};
    stubFetch();

    renderBilling();

    await screen.findByRole("button", { name: /Upgrade to Pro/ });
    expect(screen.getByText("Current plan")).toBeInTheDocument();
    expect(
      await screen.findByText("No subscription reported"),
    ).toBeInTheDocument();
  });

  test("shows an error alert with retry when the summary fails", async () => {
    state.failSummary = true;
    stubFetch();
    const user = userEvent.setup();

    renderBilling();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Could not load billing information/);
    expect(
      within(alert).getByRole("button", { name: /Try again/ }),
    ).toBeInTheDocument();

    state.failSummary = false;
    await user.click(within(alert).getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("$45.99")).toBeInTheDocument();
  });
});
