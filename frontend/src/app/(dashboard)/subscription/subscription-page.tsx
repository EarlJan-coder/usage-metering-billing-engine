"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, RefreshCw, TriangleAlert } from "lucide-react";

import { SubscriptionCard } from "@/components/dashboard/subscription-card";
import { UsageProgress } from "@/components/dashboard/usage-progress";
import { PageHeader } from "@/components/layout/page-header";
import {
  CardSkeleton,
  LoadingSkeleton,
} from "@/components/shared/loading-skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApiError } from "@/lib/api/client";
import { subscriptionsApi } from "@/lib/api/subscriptions";
import { usageApi } from "@/lib/api/usage";
import { formatNumber } from "@/lib/format";

/**
 * Subscription page (frontend-plan §6G + Phase 8): current plan, status,
 * billing period, and backend-reported quota consumption, with explicit
 * loading, empty, and error states for each endpoint.
 */
export function SubscriptionPage() {
  const subscription = useQuery({
    queryKey: ["subscriptions", "current"],
    queryFn: () => subscriptionsApi.current(),
  });
  const usage = useQuery({
    queryKey: ["usage", "summary"],
    queryFn: () => usageApi.summary(),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscription"
        description="Current plan, status, billing period, and usage limits — all reported by the backend."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void subscription.refetch();
              void usage.refetch();
            }}
            disabled={subscription.isFetching || usage.isFetching}
          >
            <RefreshCw
              className={
                subscription.isFetching || usage.isFetching
                  ? "size-4 animate-spin"
                  : "size-4"
              }
              aria-hidden="true"
            />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Subscription state: data, empty, or error */}
        <div className="space-y-4">
          {subscription.isPending ? (
            <CardSkeleton className="h-56" />
          ) : subscription.isError && !subscription.data ? (
            <Alert variant="destructive">
              <TriangleAlert className="size-4" aria-hidden="true" />
              <AlertTitle>Could not load subscription</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-3">
                <span className="min-w-0 flex-1">
                  {subscription.error instanceof ApiError
                    ? subscription.error.message
                    : "The current subscription could not be loaded."}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void subscription.refetch()}
                >
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : subscription.data ? (
            <SubscriptionCard subscription={subscription.data} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Current Subscription
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  No subscription reported by the backend.
                </p>
                <Button variant="outline" asChild>
                  <Link href="/billing">
                    <CreditCard className="size-4" aria-hidden="true" />
                    View plans
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Quota consumption (§6G: usage limits + current consumption) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Usage limits</CardTitle>
            <CardDescription>
              Current consumption against the plan quotas reported by the
              backend.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {usage.isPending ? (
              <LoadingSkeleton lines={4} />
            ) : usage.isError && !usage.data ? (
              <Alert variant="destructive">
                <TriangleAlert className="size-4" aria-hidden="true" />
                <AlertTitle>Usage data could not be loaded</AlertTitle>
                <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <span className="min-w-0 flex-1">
                    {usage.error instanceof ApiError
                      ? usage.error.message
                      : "Quota consumption could not be loaded."}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void usage.refetch()}
                  >
                    Try again
                  </Button>
                </AlertDescription>
              </Alert>
            ) : usage.data ? (
              <div className="space-y-5">
                <UsageProgress
                  label="API calls"
                  used={usage.data.apiCallQuota.used}
                  limit={usage.data.apiCallQuota.limit}
                  formatValue={formatNumber}
                />
                <UsageProgress
                  label="AI tokens"
                  used={usage.data.tokenQuota.used}
                  limit={usage.data.tokenQuota.limit}
                  formatValue={formatNumber}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
