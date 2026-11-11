"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";

import { BillingSummary } from "@/components/billing/billing-summary";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { PricingComparison } from "@/components/billing/pricing-comparison";
import { PageHeader } from "@/components/layout/page-header";
import { CardSkeleton, LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/client";
import { billingApi } from "@/lib/api/billing";
import { plansApi, type Plan } from "@/lib/api/plans";
import { subscriptionsApi, type CurrentSubscription } from "@/lib/api/subscriptions";
import { navigateToCheckout } from "@/lib/checkout-redirect";
import { formatDateTime } from "@/lib/format";

/**
 * Subscription status snapshot shown next to the billing summary
 * (frontend-plan §6G). Never renders the plan name here — the plan cards
 * below are the single source for plan identity on this page.
 */
function SubscriptionStatusCard({
  subscription,
  failed,
}: {
  subscription: CurrentSubscription | null;
  failed: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Subscription status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {subscription ? (
          <>
            <StatusBadge status={subscription.status} />
            <div className="space-y-1 text-sm text-muted-foreground">
              <p className="text-xs font-medium uppercase tracking-wider">
                Billing period
              </p>
              <p className="tabular-nums">
                {subscription.periodStart && subscription.periodEnd
                  ? `${formatDateTime(subscription.periodStart)} – ${formatDateTime(subscription.periodEnd)}`
                  : "Billing period not reported"}
              </p>
              {subscription.cancelAtPeriodEnd ? (
                <p className="text-warning">Cancels at period end</p>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {failed
              ? "Subscription status could not be loaded."
              : "No subscription reported"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BillingPageContent() {
  const searchParams = useSearchParams();
  const checkoutParam = searchParams.get("checkout");

  const summary = useQuery({
    queryKey: ["billing", "summary"],
    queryFn: () => billingApi.summary(),
  });
  const subscription = useQuery({
    queryKey: ["subscriptions", "current"],
    queryFn: () => subscriptionsApi.current(),
  });
  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: () => plansApi.list(),
  });

  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [pendingDowngrade, setPendingDowngrade] = useState<Plan | null>(null);

  const checkoutMutation = useMutation({
    mutationFn: (planId: string) => subscriptionsApi.checkout({ planId }),
    onSuccess: (result) => {
      if (!result.url) {
        setCheckoutError(
          "The backend returned no redirect URL for Stripe Checkout. Nothing was charged and your plan is unchanged — try again.",
        );
        return;
      }
      if (!navigateToCheckout(result.url)) {
        setCheckoutError(
          "The backend returned an unsafe redirect URL. Nothing was charged — try again.",
        );
      }
    },
    onError: (error) => {
      setCheckoutError(
        error instanceof ApiError
          ? error.message
          : "Checkout could not be started. Nothing was charged — try again.",
      );
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => subscriptionsApi.cancel(),
    onSuccess: () => {
      setPendingDowngrade(null);
      void subscription.refetch();
    },
  });

  // Current plan: matched by backend-reported plan name, falling back to
  // the catalog's default plan when no subscription exists (§6G).
  const currentPlan = subscription.data
    ? (plans.data?.find((plan) => plan.name === subscription.data!.planName) ??
      null)
    : (plans.data?.find((plan) => plan.isDefault) ?? null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Costs & Billing"
        description="Estimated costs, subscription status, and Free/Pro plan options — every value calculated by the backend."
      />

      {/* Return states from Stripe Checkout — the redirect itself proves
          nothing; only the backend's verified webhook confirms payment. */}
      {checkoutParam ? (
        checkoutParam === "canceled" ? (
          <Alert>
            <AlertTitle>Checkout canceled</AlertTitle>
            <AlertDescription>
              No changes were made to your subscription. You can start again
              from the plan cards below.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <AlertTitle>Returned from Stripe Checkout</AlertTitle>
            <AlertDescription>
              Coming back from Stripe does not confirm payment — the backend
              activates your plan only after the verified webhook arrives.
              Subscription data below was reloaded from the backend.
            </AlertDescription>
          </Alert>
        )
      ) : null}

      {/* Billing overview: estimated cost + subscription status (§6G) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {summary.isPending ? (
            <CardSkeleton className="h-44" />
          ) : summary.isError && !summary.data ? (
            <Alert variant="destructive">
              <TriangleAlert className="size-4" aria-hidden="true" />
              <AlertTitle>Could not load billing information</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <span className="min-w-0 flex-1">
                  {summary.error instanceof ApiError
                    ? summary.error.message
                    : "The billing summary could not be loaded."}
                </span>
                <Button size="sm" variant="outline" onClick={() => void summary.refetch()}>
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : summary.data ? (
            <BillingSummary summary={summary.data} />
          ) : null}
        </div>

        {subscription.isPending ? (
          <CardSkeleton className="h-44" />
        ) : (
          <SubscriptionStatusCard
            subscription={subscription.data ?? null}
            failed={subscription.isError && !subscription.data}
          />
        )}
      </div>

      {/* Plan cards (§6G: Free and Pro with upgrade/downgrade options) */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Plans</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Free and Pro pricing as configured in the backend plan catalog.
          </p>
        </div>

        {plans.isPending ? (
          <div className="grid gap-4 md:grid-cols-2">
            <CardSkeleton className="h-72" />
            <CardSkeleton className="h-72" />
          </div>
        ) : plans.isError && !plans.data ? (
          <Alert variant="destructive">
            <TriangleAlert className="size-4" aria-hidden="true" />
            <AlertTitle>Could not load plans</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <span className="min-w-0 flex-1">
                {plans.error instanceof ApiError
                  ? plans.error.message
                  : "The plan catalog could not be loaded."}
              </span>
              <Button size="sm" variant="outline" onClick={() => void plans.refetch()}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <PricingComparison
            plans={plans.data ?? []}
            currentPlan={currentPlan}
            renderAction={(plan, action) => {
              if (action === "current") return null;
              if (action === "upgrade") {
                return (
                  <CheckoutButton
                    planName={plan.name}
                    isPending={
                      checkoutMutation.isPending &&
                      checkoutMutation.variables === plan.id
                    }
                    onClick={() => {
                      setCheckoutError(null);
                      checkoutMutation.mutate(plan.id);
                    }}
                    className="w-full"
                  />
                );
              }
              return (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setPendingDowngrade(plan)}
                >
                  Downgrade to {plan.name}
                </Button>
              );
            }}
          />
        )}
      </section>

      {checkoutError ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>Checkout could not start</AlertTitle>
          <AlertDescription>{checkoutError}</AlertDescription>
        </Alert>
      ) : null}

      {/* Downgrade always requires explicit confirmation (§6G). */}
      <Dialog
        open={pendingDowngrade !== null}
        onOpenChange={(open) => {
          if (!open && !cancelMutation.isPending) setPendingDowngrade(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm downgrade</DialogTitle>
            <DialogDescription>
              Downgrading to {pendingDowngrade?.name ?? "the Free plan"}{" "}
              cancels the paid subscription and moves your workspace to that
              plan once the current billing period ends.
            </DialogDescription>
          </DialogHeader>
          {cancelMutation.isError ? (
            <p className="text-sm text-destructive">
              The downgrade could not be completed. Nothing was changed — try
              again.
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingDowngrade(null)}
              disabled={cancelMutation.isPending}
            >
              Keep current plan
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? "Downgrading…" : "Confirm downgrade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Billing page (frontend-plan §6G + Phase 8): billing overview, plan
 * cards, Stripe Checkout through the backend, and the confirmed downgrade
 * flow. useSearchParams (checkout return state) requires a Suspense
 * boundary for static prerendering in Next 16.
 */
export function BillingPage() {
  return (
    <Suspense fallback={<LoadingSkeleton lines={6} />}>
      <BillingPageContent />
    </Suspense>
  );
}
