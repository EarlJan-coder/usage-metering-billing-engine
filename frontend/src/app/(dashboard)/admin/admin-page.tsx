"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Building2,
  CreditCard,
  DollarSign,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/layout/page-header";
import {
  CardSkeleton,
  LoadingSkeleton,
} from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { adminApi, type JobStats } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session";
import { formatCompactNumber, formatCurrency, formatDateTime, formatNumber } from "@/lib/format";

/** Honest error copy; a backend 403 means role authorization denied. */
function describeError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return "The backend denied access — platform administrator access is required.";
    }
    if (error.message) return error.message;
  }
  return fallback;
}

function ErrorAlert({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive">
      <TriangleAlert className="size-4" aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <span className="min-w-0 flex-1">{message}</span>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function JobStatsGrid({ jobs }: { jobs: JobStats }) {
  const entries: Array<{ label: string; value: number }> = [
    { label: "Pending", value: jobs.pending },
    { label: "Processing", value: jobs.processing },
    { label: "Failed", value: jobs.failed },
    { label: "Completed", value: jobs.completed },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {entries.map((entry) => (
        <div key={entry.label} className="rounded-lg border border-border/60 p-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {entry.label}
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {formatNumber(entry.value)}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * Platform admin dashboard (frontend-plan §6I + Phase 9): platform KPIs,
 * background job status, recent webhook events, and tenant management —
 * all from the authorization-gated /admin/* endpoints. The role gate here
 * mirrors (never replaces) the backend's role-based authorization.
 */
export function AdminPage() {
  const { status, user } = useSession();
  const isAdmin = user?.role === "admin";

  const metrics = useQuery({
    queryKey: ["admin", "metrics"],
    queryFn: () => adminApi.metrics(),
    enabled: isAdmin,
  });
  const tenants = useQuery({
    queryKey: ["admin", "tenants"],
    queryFn: () => adminApi.tenants(),
    enabled: isAdmin,
  });
  const webhooks = useQuery({
    queryKey: ["admin", "webhooks"],
    queryFn: () => adminApi.webhooks(),
    enabled: isAdmin,
  });

  const header = (
    <PageHeader
      title="Platform Admin"
      description="Platform-wide tenants, subscriptions, usage, revenue, webhook deliveries, and job health — restricted to administrators by backend authorization."
    />
  );

  if (status === "loading") {
    return (
      <div className="space-y-6">
        {header}
        <LoadingSkeleton lines={6} />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={ShieldCheck}
          title="Administrator access required"
          description="Platform administration is restricted to administrator accounts. The backend authorizes every /admin/* endpoint by role, and this page mirrors that check."
          action={
            <Button variant="outline" asChild>
              <Link href="/overview">Back to overview</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {/* Platform KPIs from GET /admin/metrics */}
      {metrics.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <CardSkeleton className="h-28" />
          <CardSkeleton className="h-28" />
          <CardSkeleton className="h-28" />
          <CardSkeleton className="h-28" />
        </div>
      ) : metrics.isError && !metrics.data ? (
        <ErrorAlert
          title="Could not load platform metrics"
          message={describeError(
            metrics.error,
            "Platform metrics could not be loaded.",
          )}
          onRetry={() => void metrics.refetch()}
        />
      ) : metrics.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Total tenants"
            value={formatNumber(metrics.data.totalTenants)}
            icon={Building2}
          />
          <MetricCard
            title="Active subscriptions"
            value={formatNumber(metrics.data.activeSubscriptions)}
            icon={CreditCard}
          />
          <MetricCard
            title="API calls tracked"
            value={formatNumber(metrics.data.totalApiCalls)}
            sublabel={`${formatCompactNumber(metrics.data.totalTokens)} AI tokens`}
            icon={Activity}
          />
          <MetricCard
            title="Estimated revenue"
            value={formatCurrency(
              metrics.data.estimatedRevenueMinor,
              metrics.data.currency,
            )}
            sublabel="Reported by the backend pricing engine"
            icon={DollarSign}
          />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Background job status (§6I) — honest when unreported */}
        <Card>
          <CardHeader>
            <CardTitle>Background jobs</CardTitle>
            <CardDescription>
              Queue health as reported by GET /admin/metrics.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.isPending ? (
              <LoadingSkeleton lines={2} />
            ) : metrics.isError && !metrics.data ? (
              <p className="text-sm text-muted-foreground">
                Job counters load with platform metrics.
              </p>
            ) : metrics.data?.jobs ? (
              <JobStatsGrid jobs={metrics.data.jobs} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Job status not reported — this backend build does not include
                background job status in GET /admin/metrics.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent webhook events (§6I) */}
        <Card>
          <CardHeader>
            <CardTitle>Recent webhook events</CardTitle>
            <CardDescription>
              Latest Stripe webhook deliveries from GET /admin/webhooks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {webhooks.isPending ? (
              <LoadingSkeleton lines={3} />
            ) : webhooks.isError && !webhooks.data ? (
              <ErrorAlert
                title="Could not load webhook events"
                message={describeError(
                  webhooks.error,
                  "Webhook events could not be loaded.",
                )}
                onRetry={() => void webhooks.refetch()}
              />
            ) : webhooks.data && webhooks.data.length > 0 ? (
              <ul className="divide-y divide-border/60">
                {webhooks.data.map((event) => (
                  <li
                    key={`${event.id}-${event.type}`}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate font-mono text-xs">
                        {event.type}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(event.receivedAt)}
                      </p>
                    </div>
                    <StatusBadge status={event.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No webhook events reported.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tenant management (§6I) — display only; admin mutations are not
          part of the backend contract. */}
      <Card>
        <CardHeader>
          <CardTitle>Tenant management</CardTitle>
          <CardDescription>
            Tenants from GET /admin/tenants. Tenant changes are managed by
            the backend, not from this table.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tenants.isPending ? (
            <LoadingSkeleton lines={4} />
          ) : tenants.isError && !tenants.data ? (
            <ErrorAlert
              title="Could not load tenants"
              message={describeError(
                tenants.error,
                "The tenant list could not be loaded.",
              )}
              onRetry={() => void tenants.refetch()}
            />
          ) : tenants.data && tenants.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Tenant</th>
                    <th className="py-2 pr-4 font-medium">Plan</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Members</th>
                    <th className="py-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {tenants.data.map((tenant) => (
                    <tr key={tenant.id || tenant.name}>
                      <td className="py-2.5 pr-4 font-medium">
                        {tenant.name}
                      </td>
                      <td className="py-2.5 pr-4">
                        {tenant.plan ?? "—"}
                      </td>
                      <td className="py-2.5 pr-4">
                        {tenant.status ? (
                          <StatusBadge status={tenant.status} />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums">
                        {tenant.memberCount !== null
                          ? formatNumber(tenant.memberCount)
                          : "—"}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {tenant.createdAt
                          ? formatDateTime(tenant.createdAt)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No tenants reported.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
