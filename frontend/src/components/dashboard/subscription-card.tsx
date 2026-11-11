import Link from "next/link";
import { CreditCard } from "lucide-react";

import { StatusBadge } from "@/components/shared/status-badge";
import type { CurrentSubscription } from "@/lib/api/subscriptions";
import { formatDateTime } from "@/lib/format";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Subscription snapshot (frontend-plan §7 — SubscriptionCard).
 * Plan state comes from GET /subscriptions/current — never computed here.
 */
export function SubscriptionCard({
  subscription,
  failed = false,
  className,
}: {
  subscription: CurrentSubscription | null;
  /** True when the endpoint itself failed (vs. no subscription found). */
  failed?: boolean;
  className?: string;
}) {
  if (!subscription) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Current Subscription
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {failed
              ? "Subscription data could not be loaded from the backend."
              : "No subscription reported by the backend."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const period =
    subscription.periodStart && subscription.periodEnd
      ? `${formatDateTime(subscription.periodStart)} – ${formatDateTime(subscription.periodEnd)}`
      : "Billing period not reported";

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Current Subscription
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-2xl font-semibold tracking-tight">
            {subscription.planName}
          </p>
          <StatusBadge status={subscription.status} />
        </div>

        <div className="space-y-1.5 text-sm text-muted-foreground">
          <p className="text-xs font-medium uppercase tracking-wider">
            Billing period
          </p>
          <p className="tabular-nums">{period}</p>
          {subscription.cancelAtPeriodEnd ? (
            <p className="text-warning">Cancels at period end</p>
          ) : null}
        </div>

        <Button variant="outline" className="mt-auto" asChild>
          <Link href="/billing">
            <CreditCard className="size-4" aria-hidden="true" />
            Manage billing
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
