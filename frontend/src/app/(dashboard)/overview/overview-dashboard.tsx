"use client";

import Link from "next/link";
import {
  Activity,
  BarChart3,
  BookOpen,
  CreditCard,
  KeyRound,
  Receipt,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Zap,
} from "lucide-react";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SubscriptionCard } from "@/components/dashboard/subscription-card";
import { UsageChart } from "@/components/dashboard/usage-chart";
import { UsageProgress } from "@/components/dashboard/usage-progress";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOverviewData } from "@/hooks/use-overview-data";
import { ApiError } from "@/lib/api/client";
import type { UsageSummary } from "@/lib/api/usage";
import {
  formatCompactNumber,
  formatCurrency,
  formatNumber,
} from "@/lib/format";

const QUICK_ACTIONS: Array<{
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { label: "Create API key", href: "/api-keys", icon: KeyRound },
  { label: "View analytics", href: "/analytics", icon: BarChart3 },
  { label: "Manage billing", href: "/billing", icon: Receipt },
  { label: "Read the docs", href: "/docs", icon: BookOpen },
];

function AlertsList({ summary }: { summary: UsageSummary }) {
  if (summary.alerts.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No usage alerts.</p>
    );
  }

  return (
    <ul className="space-y-2">
      {summary.alerts.map((alert) => (
        <li
          key={alert.id}
          className={
            alert.severity === "critical"
              ? "flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
              : alert.severity === "warning"
                ? "flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
                : "flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm"
          }
        >
          <TriangleAlert
            className={
              alert.severity === "critical"
                ? "size-4 shrink-0 text-destructive"
                : "size-4 shrink-0 text-warning"
            }
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">{alert.message}</span>
          <Badge variant="outline" className="shrink-0 text-[0.6875rem]">
            {alert.severity}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/**
 * Overview dashboard (frontend-plan §6C + Phase 5): KPI cards, charts,
 * usage progress, recent activity, subscription info, usage alerts, and
 * quick actions — every value sourced from the backend REST API.
 */
export function OverviewDashboard() {
  const { summary, subscription, recent, refetchAll } = useOverviewData();

  const header = (
    <PageHeader
      title="Overview"
      description="API calls, AI token consumption, estimated cost, and subscription status at a glance."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetchAll()}
          disabled={summary.isFetching || subscription.isFetching || recent.isFetching}
        >
          <RefreshCw
            className={
              summary.isFetching ? "size-4 animate-spin" : "size-4"
            }
            aria-hidden="true"
          />
          Refresh
        </Button>
      }
    />
  );

  if (summary.isLoading && !summary.data) {
    return (
      <div className="space-y-6">
        {header}
        <LoadingSkeleton lines={6} />
      </div>
    );
  }

  if (summary.isError && !summary.data) {
    const message =
      summary.error instanceof ApiError
        ? summary.error.message
        : "The usage summary could not be loaded.";
    return (
      <div className="space-y-6">
        {header}
        <Alert variant="destructive" role="alert">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>Could not load usage data</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <span className="min-w-0 flex-1">{message}</span>
            <Button size="sm" variant="outline" onClick={() => void refetchAll()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const data = summary.data!;
  const currentSubscription = subscription.data ?? null;

  return (
    <div className="space-y-6">
      {header}

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total API Calls"
          value={formatCompactNumber(data.totalApiCalls)}
          sublabel={`${formatNumber(data.totalApiCalls)} all time this period`}
          icon={Activity}
        />
        <MetricCard
          title="AI Tokens Consumed"
          value={formatCompactNumber(data.totalTokens)}
          sublabel={`${formatNumber(data.totalTokens)} tokens this period`}
          icon={Sparkles}
        />
        <MetricCard
          title="Estimated Monthly Cost"
          value={formatCurrency(data.estimatedCost, data.currency)}
          sublabel="Calculated by the backend pricing engine"
          icon={Receipt}
        />
        <MetricCard
          title="Current Subscription"
          value={currentSubscription?.planName ?? "—"}
          sublabel={
            subscription.isError
              ? "Subscription unavailable"
              : "Plan reported by the backend"
          }
          icon={CreditCard}
          footer={
            currentSubscription ? (
              <StatusBadge status={currentSubscription.status} />
            ) : null
          }
        />
      </div>

      {/* Charts + subscription */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Usage trends</CardTitle>
            <CardDescription>
              API calls, AI token consumption, and estimated cost over time —
              as reported by the backend.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="apiCalls">
              <TabsList className="mb-4">
                <TabsTrigger value="apiCalls">API Calls</TabsTrigger>
                <TabsTrigger value="tokens">AI Tokens</TabsTrigger>
                <TabsTrigger value="cost">Estimated Cost</TabsTrigger>
              </TabsList>
              <TabsContent value="apiCalls">
                <UsageChart
                  data={data.apiCallsSeries}
                  formatValue={formatCompactNumber}
                  emptyDescription="API call data will appear once your services report usage."
                />
              </TabsContent>
              <TabsContent value="tokens">
                <UsageChart
                  data={data.tokensSeries}
                  formatValue={formatCompactNumber}
                  emptyDescription="AI token data will appear once your services report usage."
                />
              </TabsContent>
              <TabsContent value="cost">
                <UsageChart
                  data={data.costSeries}
                  formatValue={(value) =>
                    formatCurrency(value, data.currency)
                  }
                  emptyDescription="Cost trend data will appear once your services report usage."
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <SubscriptionCard
          subscription={currentSubscription}
          failed={subscription.isError}
        />
      </div>

      {/* Usage limits + quick actions */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Usage limits</CardTitle>
            <CardDescription>
              Quota consumption for the current billing period.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <UsageProgress
              label="API calls"
              used={data.apiCallQuota.used}
              limit={data.apiCallQuota.limit}
              formatValue={formatNumber}
            />
            <UsageProgress
              label="AI tokens"
              used={data.tokenQuota.used}
              limit={data.tokenQuota.limit}
              formatValue={formatNumber}
            />
            <div className="space-y-2 border-t border-border/60 pt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Usage alerts
              </p>
              <AlertsList summary={data} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {QUICK_ACTIONS.map((action) => (
              <Button
                key={action.href}
                variant="outline"
                className="justify-start"
                asChild
              >
                <Link href={action.href}>
                  <action.icon className="size-4" aria-hidden="true" />
                  {action.label}
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>
              Latest metered events for this workspace.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/usage">
              <Zap className="size-4" aria-hidden="true" />
              View all
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recent.isPending && !recent.data ? (
            <LoadingSkeleton lines={4} />
          ) : (
            <ActivityFeed
              events={recent.data ?? []}
              currency={data.currency}
              emptyDescription={
                recent.isError
                  ? "Recent activity could not be loaded from the backend."
                  : undefined
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
