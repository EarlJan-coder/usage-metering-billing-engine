import type { ReactNode } from "react";
import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Plan } from "@/lib/api/plans";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Pricing plan card (frontend-plan §7 — PlanCard, §6G).
 * Prices and limits are rendered exactly as GET /plans reports them —
 * no pricing logic lives in the frontend.
 */
export function PlanCard({
  plan,
  isCurrent,
  action,
  className,
}: {
  plan: Plan;
  /** True when this card is the workspace's current plan. */
  isCurrent: boolean;
  /** Action slot — checkout/downgrade button rendered by the page. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn("flex flex-col", isCurrent && "border-primary/50", className)}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">{plan.name}</CardTitle>
          {isCurrent ? (
            <Badge variant="secondary">Current plan</Badge>
          ) : null}
        </div>
        {plan.description ? (
          <CardDescription>{plan.description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        <div>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {formatCurrency(plan.priceMinor, plan.currency)} / {plan.interval}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Price as configured in the backend plan catalog.
          </p>
        </div>

        {plan.callsLimit !== null || plan.tokensLimit !== null ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Included limits
            </p>
            <ul className="space-y-1.5 text-sm">
              {plan.callsLimit !== null ? (
                <li>{formatNumber(plan.callsLimit)} API calls</li>
              ) : null}
              {plan.tokensLimit !== null ? (
                <li>{formatNumber(plan.tokensLimit)} AI tokens</li>
              ) : null}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Limits not reported by the backend.
          </p>
        )}

        {plan.features.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Features
            </p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check
                    className="mt-0.5 size-3.5 shrink-0 text-success"
                    aria-hidden="true"
                  />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {action ? <div className="mt-auto pt-1">{action}</div> : null}
      </CardContent>
    </Card>
  );
}
