import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { UsageHistory } from "./usage-history";

function okResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

const EVENTS = [
  {
    id: "evt_1",
    type: "ai_tokens",
    createdAt: "2026-11-11T10:00:00.000Z",
    apiKeyName: "production",
    model: "gpt-4o-mini",
    quantity: 1200,
    inputTokens: 800,
    outputTokens: 400,
    cost: 45,
    status: "recorded",
  },
  {
    id: "evt_2",
    type: "api_call",
    createdAt: "2026-11-11T09:00:00.000Z",
    apiKeyName: "staging",
    model: null,
    quantity: 1,
    inputTokens: null,
    outputTokens: null,
    cost: 2,
    status: "failed",
  },
];

function stubFetch(total = 2) {
  const spy = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/usage/history")) {
      return Promise.resolve(
        okResponse({ items: EVENTS.slice(0, total), total }),
      );
    }
    return Promise.resolve(okResponse({}, 404));
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function renderHistory() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <UsageHistory />
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

describe("UsageHistory", () => {
  test("renders the §6E columns with backend event data", async () => {
    stubFetch();

    renderHistory();

    for (const heading of [
      "Timestamp",
      "Event ID",
      "Usage Type",
      "API Key",
      "Model",
      "Input Tokens",
      "Output Tokens",
      "Cost",
      "Status",
    ]) {
      expect(
        await screen.findByRole("columnheader", { name: new RegExp(heading) }),
      ).toBeInTheDocument();
    }

    expect(await screen.findByText("evt_1")).toBeInTheDocument();
    expect(screen.getByText("gpt-4o-mini")).toBeInTheDocument();
    expect(screen.getByText("$0.45")).toBeInTheDocument();
    expect(screen.getByText("Showing 1–2 of 2")).toBeInTheDocument();
  });

  test("debounces search into the history query", async () => {
    const fetchSpy = stubFetch();
    const user = userEvent.setup();

    renderHistory();
    await screen.findByText("evt_1");
    const callsAfterLoad = fetchSpy.mock.calls.length;

    await user.type(screen.getByRole("searchbox"), "prod");

    await waitFor(
      () => {
        const historyCalls = fetchSpy.mock.calls.filter((call) =>
          String(call[0]).includes("/usage/history"),
        );
        expect(
          historyCalls.some((call) => String(call[0]).includes("search=prod")),
        ).toBe(true);
      },
      { timeout: 3000 },
    );
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsAfterLoad);
  });

  test("sorting a column sends sort and order params", async () => {
    const fetchSpy = stubFetch();
    const user = userEvent.setup();

    renderHistory();
    await screen.findByText("evt_1");

    const costHeader = screen.getByRole("columnheader", { name: /Cost/ });
    await user.click(within(costHeader).getByRole("button"));

    await waitFor(() => {
      const historyCalls = fetchSpy.mock.calls.filter((call) =>
        String(call[0]).includes("/usage/history"),
      );
      expect(
        historyCalls.some(
          (call) =>
            String(call[0]).includes("sort=cost") &&
            String(call[0]).includes("order=asc"),
        ),
      ).toBe(true);
    });
  });

  test("pagination requests the next offset page", async () => {
    const fetchSpy = stubFetch(50);
    const user = userEvent.setup();

    renderHistory();
    await screen.findByText("evt_1");
    expect(screen.getByText(/Showing 1–25 of 50/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      const historyCalls = fetchSpy.mock.calls.filter((call) =>
        String(call[0]).includes("/usage/history"),
      );
      expect(
        historyCalls.some((call) => String(call[0]).includes("offset=25")),
      ).toBe(true);
    });
    expect(screen.getByText(/Showing 26–50 of 50/)).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

  test("opens the event details drawer from a row", async () => {
    stubFetch();
    const user = userEvent.setup();

    renderHistory();
    // Rows keep native table semantics (no role="button"/aria-label on
    // <tr> — see data-table); find the row through its cell content.
    const cell = await screen.findByText("evt_1");
    const row = cell.closest("tr");
    expect(row).not.toBeNull();

    await user.click(row!);

    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByText("Event details")).toBeInTheDocument();
    expect(within(drawer).getByText("Event ID")).toBeInTheDocument();
    expect(within(drawer).getByText("evt_1")).toBeInTheDocument();
    expect(within(drawer).getByText("Input Tokens")).toBeInTheDocument();
    expect(within(drawer).getByText("800")).toBeInTheDocument();
  });

  test("exports the visible events as CSV", async () => {
    stubFetch();
    const createObjectURL = vi.fn(() => "blob:csv");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const user = userEvent.setup();

    renderHistory();
    await screen.findByText("evt_1");

    await user.click(screen.getByRole("button", { name: /Export CSV/ }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("usage-history.csv");
  });

  test("shows an empty state when no events match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(okResponse({ items: [], total: 0 }))),
    );

    renderHistory();

    expect(
      await screen.findByText("No usage events recorded yet."),
    ).toBeInTheDocument();
    expect(screen.getByText("No events")).toBeInTheDocument();
  });

  test("shows an error alert with retry when the backend fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );

    renderHistory();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load usage history");
    expect(
      screen.getByRole("button", { name: /Try again/ }),
    ).toBeInTheDocument();
  });
});
