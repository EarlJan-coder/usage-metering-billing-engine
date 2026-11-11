import { apiFetch } from "./client";
import { asObject, pickString } from "./normalize";

/**
 * Billing summary endpoint (backend-plan §6: GET /billing/summary).
 *
 * Estimated cost arrives in integer minor units (backend-plan §4) and is
 * formatted with formatCurrency — the frontend never recalculates costs
 * (frontend-plan §10).
 */

export type BillingSummary = {
  /** Estimated cost for the current period, in minor units. */
  estimatedCostMinor: number;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
  nextInvoiceAt: string | null;
  /** Subscription status when the summary carries it; else null. */
  status: string | null;
};

function numberOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function normalizeBillingSummary(payload: unknown): BillingSummary {
  const root = asObject(payload) ?? {};

  const cost =
    root.estimatedCost ??
    root.estimated_cost ??
    root.estimatedMonthlyCost ??
    root.estimated_monthly_cost ??
    root.totalCost ??
    root.total_cost ??
    root.amount ??
    0;

  return {
    estimatedCostMinor: numberOrZero(cost),
    currency: pickString(root, "currency") ?? "USD",
    periodStart:
      pickString(
        root,
        "periodStart",
        "currentPeriodStart",
        "current_period_start",
      ) ?? null,
    periodEnd:
      pickString(root, "periodEnd", "currentPeriodEnd", "current_period_end") ??
      null,
    nextInvoiceAt:
      pickString(
        root,
        "nextInvoiceAt",
        "nextInvoiceDate",
        "next_invoice_at",
        "next_invoice_date",
      ) ?? null,
    status:
      pickString(root, "status", "subscriptionStatus", "subscription_status") ??
      null,
  };
}

export const billingApi = {
  async summary(): Promise<BillingSummary> {
    const payload = await apiFetch<unknown>("/billing/summary");
    return normalizeBillingSummary(payload);
  },
};
