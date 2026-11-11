import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { OverviewDashboard } from "./overview-dashboard";

function okResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

const SUMMARY = {
  totalApiCalls: 48392,
  totalTokens: 1240000,
  estimatedCost: 4218,
  currency: "USD",
  apiCallsSeries: [{ date: "2026-11-01", value: 1200 }],
  tokensSeries: [{ date: "2026-11-01", value: 30000 }],
  costSeries: [{ date: "2026-11-01", value: 12 }],
  quota: {
    apiCalls: { used: 900, limit: 1000 },
    tokens: { used: 50000, limit: 100000 },
  },
  alerts: [{ id: "a1", message: "API call quota at 90%", severity: "warning" }],
};

const SUBSCRIPTION = {
  plan: { name: "Pro" },
  status: "active",
  currentPeriodStart: "2026-11-01T00:00:00.000Z",
  currentPeriodEnd: "2026-12-01T00:00:00.000Z",
  cancelAtPeriodEnd: false,
};

const HISTORY = {
  items: [
    {
      id: "e1",
      type: "ai_tokens",
      createdAt: "2026-11-11T10:00:00.000Z",
      apiKeyName: "production",
      quantity: 1200,
      cost: 45,
      status: "recorded",
    },
  ],
};

function stubApiFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/usage/summary")) return Promise.resolve(okResponse(SUMMARY));
      if (url.includes("/usage/history")) return Promise.resolve(okResponse(HISTORY));
      if (url.includes("/subscriptions/current")) {
        return Promise.resolve(okResponse(SUBSCRIPTION));
      }
      return Promise.resolve(okResponse({}, 404));
    }),
  );
}

function renderOverview() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OverviewDashboard />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("OverviewDashboard", () => {
  test("renders KPI cards from the backend summary and subscription", async () => {
    stubApiFetch();

    renderOverview();

    expect(await screen.findByText("Total API Calls")).toBeInTheDocument();
    expect(screen.getByText("48.4K")).toBeInTheDocument();
    expect(screen.getByText("AI Tokens Consumed")).toBeInTheDocument();
    expect(screen.getByText("1.2M")).toBeInTheDocument();
    expect(screen.getByText("Estimated Monthly Cost")).toBeInTheDocument();
    expect(screen.getByText("$42.18")).toBeInTheDocument();
    expect(screen.getAllByText("Current Subscription").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pro").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
  });

  test("shows quota progress, alerts, and recent activity", async () => {
    stubApiFetch();

    renderOverview();

    expect(await screen.findByText("Usage limits")).toBeInTheDocument();
    expect(screen.getByText("900 / 1,000")).toBeInTheDocument();
    expect(screen.getByText("90% of limit used")).toBeInTheDocument();
    expect(screen.getByText("API call quota at 90%")).toBeInTheDocument();

    expect(await screen.findByText("Recent activity")).toBeInTheDocument();
    expect(await screen.findByText("AI token usage")).toBeInTheDocument();
    expect(screen.getByText(/production/)).toBeInTheDocument();
    expect(screen.getByText("$0.45")).toBeInTheDocument();
  });

  test("shows an error alert with retry when the summary fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );

    renderOverview();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load usage data");
    expect(alert).toHaveTextContent(/Cannot reach the API server/);
    expect(
      screen.getByRole("button", { name: /Try again/ }),
    ).toBeInTheDocument();
  });
});
