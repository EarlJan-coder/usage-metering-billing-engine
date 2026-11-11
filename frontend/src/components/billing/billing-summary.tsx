import { Receipt } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BillingSummary as BillingSummaryData } from "@/lib/api/billing";
import { formatCurrency, formatDateTime } from "@/lib/format";

/**
 * Billing overview summary (frontend-plan §7 — BillingSummary, §6G).
 * The estimated cost comes from GET /billing/summary in integer minor units
 * and is only formatted here — never recalculated by the frontend (§10).
 */
export function BillingSummary({
  summary,
}: {
  summary: BillingSummaryData;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Receipt className="size-4" aria-hidden="true" />
          Estimated cost
        </CardTitle>
        <CardDescription>
          Calculated by the backend pricing engine for the current billing
          period.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        <p className="text-3xl font-semibold tracking-tight tabular-nums">
          {formatCurrency(summary.estimatedCostMinor, summary.currency)}
        </p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Billing period
            </dt>
            <dd className="tabular-nums">
              {summary.periodStart && summary.periodEnd
                ? `${formatDateTime(summary.periodStart)} – ${formatDateTime(summary.periodEnd)}`
                : "Not reported by the backend"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Next invoice
            </dt>
            <dd className="tabular-nums">
              {summary.nextInvoiceAt
                ? formatDateTime(summary.nextInvoiceAt)
                : "Not reported by the backend"}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
