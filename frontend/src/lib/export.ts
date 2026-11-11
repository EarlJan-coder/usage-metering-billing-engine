/**
 * CSV export builders (frontend-plan Phase 6 — CSV export for analytics
 * breakdowns and usage history). Values are formatted for humans; no
 * authoritative totals are computed here — rows carry backend values only.
 */

import type { UsageBreakdownRow, UsageEvent } from "@/lib/api/usage";
import { toCsv } from "@/lib/csv";
import { formatCurrency, formatNumber } from "@/lib/format";

/** Usage-history columns (frontend-plan §6E). */
export function usageEventsToCsv(
  events: UsageEvent[],
  currency = "USD",
): string {
  const headers = [
    "Timestamp",
    "Event ID",
    "Usage Type",
    "API Key",
    "Model",
    "Input Tokens",
    "Output Tokens",
    "Cost",
    "Status",
  ];
  const rows = events.map((event) => [
    event.createdAt,
    event.id,
    event.type,
    event.apiKeyName,
    event.model,
    event.inputTokens === null ? null : formatNumber(event.inputTokens),
    event.outputTokens === null ? null : formatNumber(event.outputTokens),
    event.cost === null ? null : formatCurrency(event.cost, currency),
    event.status,
  ]);
  return toCsv(headers, rows);
}

/** Breakdown table export for "usage by API key" / "usage by model" (§6D). */
export function breakdownToCsv(
  rows: UsageBreakdownRow[],
  dimension: string,
  currency = "USD",
): string {
  const headers = [dimension, "API Calls", "Tokens", "Cost"];
  const body = rows.map((row) => [
    row.name,
    row.apiCalls,
    row.tokens,
    formatCurrency(row.cost, currency),
  ]);
  return toCsv(headers, body);
}

/**
 * Triggers a browser download of a CSV string. The UTF-8 BOM keeps Excel
 * from mangling non-ASCII characters.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
