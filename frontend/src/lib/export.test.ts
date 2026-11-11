import { afterEach, describe, expect, test, vi } from "vitest";

import type { UsageEvent } from "@/lib/api/usage";
import type { UsageBreakdownRow } from "@/lib/api/usage";
import {
  breakdownToCsv,
  downloadCsv,
  usageEventsToCsv,
} from "./export";

const EVENTS: UsageEvent[] = [
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
    createdAt: null,
    apiKeyName: null,
    model: null,
    quantity: 1,
    inputTokens: null,
    outputTokens: null,
    cost: null,
    status: "failed",
  },
];

describe("usageEventsToCsv", () => {
  test("exports the §6E column set with a header row", () => {
    const csv = usageEventsToCsv(EVENTS);

    const [header, ...rows] = csv.split("\n");
    expect(header).toBe(
      "Timestamp,Event ID,Usage Type,API Key,Model,Input Tokens,Output Tokens,Cost,Status",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("evt_1");
    expect(rows[0]).toContain("ai_tokens");
    expect(rows[0]).toContain("production");
    expect(rows[0]).toContain("gpt-4o-mini");
  });

  test("formats cost as currency and leaves blanks for missing values", () => {
    const csv = usageEventsToCsv(EVENTS, "USD");

    const firstRow = csv.split("\n")[1]!;
    expect(firstRow).toContain("$0.45");

    const secondRow = csv.split("\n")[2]!;
    // null timestamp / api key / model / tokens / cost → consecutive empties.
    expect(secondRow).toContain("api_call");
    expect(secondRow).toContain("failed");
    expect(secondRow).toMatch(/,,,,,/);
  });

  test("renders a header-only file for no events", () => {
    const csv = usageEventsToCsv([]);
    expect(csv.split("\n")).toHaveLength(1);
    expect(csv).toContain("Event ID");
  });

  test("escapes hostile cell content", () => {
    const csv = usageEventsToCsv([
      { ...EVENTS[0]!, apiKeyName: 'key, "quoted"' },
    ]);

    expect(csv).toContain('"key, ""quoted"""');
  });
});

describe("breakdownToCsv", () => {
  test("exports dimension, API calls, tokens, and cost columns", () => {
    const rows: UsageBreakdownRow[] = [
      { name: "production", apiCalls: 90, tokens: 4500, cost: 70 },
    ];

    const csv = breakdownToCsv(rows, "API Key");

    expect(csv).toBe(
      "API Key,API Calls,Tokens,Cost\nproduction,90,4500,$0.70",
    );
  });
});

describe("downloadCsv", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("creates a Blob URL, clicks a hidden anchor, and revokes the URL", () => {
    const createObjectURL = vi.fn(() => "blob:csv-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    downloadCsv("events.csv", "a,b\n1,2");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:csv-url");

    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("events.csv");
  });
});
