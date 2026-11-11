import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { UsageAnalytics } from "./usage-analytics";

function okResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

const ANALYTICS = {
  apiCallsSeries: [
    { date: "2026-11-10", value: 100 },
    { date: "2026-11-11", value: 150 },
  ],
  tokensSeries: [{ date: "2026-11-10", value: 5000 }],
  costSeries: [{ date: "2026-11-10", value: 80 }],
  currency: "USD",
  byApiKey: [
    { name: "production", apiCalls: 90, tokens: 4500, cost: 70 },
    { name: "staging", apiCalls: 10, tokens: 500, cost: 10 },
  ],
  byModel: [{ name: "gpt-4o-mini", apiCalls: 80, tokens: 4000, cost: 60 }],
};

function stubFetch() {
  const spy = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/usage?") || url.endsWith("/usage")) {
      return Promise.resolve(okResponse(ANALYTICS));
    }
    return Promise.resolve(okResponse({}, 404));
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function renderAnalytics() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <UsageAnalytics />
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

describe("UsageAnalytics", () => {
  test("renders the three §6D trend charts with backend data", async () => {
    stubFetch();

    renderAnalytics();

    expect(await screen.findByText("API Usage")).toBeInTheDocument();
    expect(screen.getByText("AI Token Usage")).toBeInTheDocument();
    expect(screen.getByText("Cost Trend")).toBeInTheDocument();
    expect(
      await screen.findByText("Usage by API Key"),
    ).toBeInTheDocument();
    expect(screen.getByText("Usage by Model")).toBeInTheDocument();
    expect(screen.getByText("gpt-4o-mini")).toBeInTheDocument();
    expect(screen.getByText("production")).toBeInTheDocument();
  });

  test("granularity toggle refetches /usage with the selected view", async () => {
    const fetchSpy = stubFetch();
    const user = userEvent.setup();

    renderAnalytics();
    await screen.findByText("API Usage");

    await user.click(screen.getByRole("radio", { name: /weekly/i }));

    await waitFor(() => {
      const usageCalls = fetchSpy.mock.calls.filter((call) =>
        String(call[0]).includes("granularity=weekly"),
      );
      expect(usageCalls.length).toBeGreaterThan(0);
    });
  });

  test("exports a breakdown table as CSV", async () => {
    stubFetch();
    const createObjectURL = vi.fn(() => "blob:csv");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const user = userEvent.setup();

    renderAnalytics();
    await screen.findByText("Usage by API Key");

    const keyCard = screen
      .getByText("Usage by API Key")
      .closest("div[data-slot=card], .group\\/card")!;
    await user.click(
      withinKeyCard(keyCard).getByRole("button", { name: /CSV/ }),
    );

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("usage-by-api-key.csv");
  });

  test("shows an error alert with retry when analytics fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );

    renderAnalytics();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load analytics");
    expect(
      screen.getByRole("button", { name: /Try again/ }),
    ).toBeInTheDocument();
  });
});

function withinKeyCard(card: Element) {
  // Local helper to keep the CSV button scoped to the API-key card.
  return {
    getByRole: (role: string, options: { name: RegExp }) => {
      const buttons = Array.from(card.querySelectorAll("button"));
      const match = buttons.find((button) =>
        options.name.test(button.textContent ?? ""),
      );
      if (!match) throw new Error(`No button matching ${options.name}`);
      return match;
    },
  };
}
