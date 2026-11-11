import type { ReactNode } from "react";

import { PlanCard } from "./plan-card";
import { cn } from "@/lib/utils";
import type { Plan } from "@/lib/api/plans";

export type PlanActionKind = "current" | "upgrade" | "downgrade";

/**
 * Decides the card action against the current subscription (frontend-plan
 * §6G): the current plan gets the marker, a more expensive plan is an
 * upgrade (Stripe Checkout), a cheaper one a downgrade (cancel flow).
 * Falls back to no current plan when the backend reports none.
 */
export function planActionFor(
  plan: Plan,
  currentPlan: Plan | null,
): PlanActionKind {
  if (!currentPlan) return "upgrade";
  if (currentPlan.id === plan.id) return "current";
  return plan.priceMinor > currentPlan.priceMinor ? "upgrade" : "downgrade";
}

/**
 * Free/Pro pricing comparison grid (frontend-plan §7 — PricingComparison).
 * The page supplies the action node per plan; this component only decides
 * which action kind applies and marks the current plan.
 */
export function PricingComparison({
  plans,
  currentPlan,
  renderAction,
  className,
}: {
  plans: Plan[];
  currentPlan: Plan | null;
  renderAction?: (plan: Plan, action: PlanActionKind) => ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-2", className)}>
      {plans.map((plan) => {
        const action = planActionFor(plan, currentPlan);
        return (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrent={action === "current"}
            action={renderAction?.(plan, action)}
          />
        );
      })}
    </div>
  );
}
