"use client";

import { useState } from "react";
import { BarChart3, Download, RefreshCw, TriangleAlert } from "lucide-react";

import { DataTable, type Column } from "@/components/data/data-table";
import { TableFilters } from "@/components/data/table-filters";
import { UsageChart } from "@/components/dashboard/usage-chart";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUsageAnalytics } from "@/hooks/use-usage-analytics";
import { ApiError } from "@/lib/api/client";
import type { UsageBreakdownRow } from "@/lib/api/usage";
import {
  EMPTY_DATE_RANGE,
  type DateRange,
} from "@/lib/date-range";
import {
  breakdownToCsv,
  downloadCsv,
} from "@/lib/export";
import {
  formatCompactNumber,
  formatCurrency,
  formatNumber,
} from "@/lib/format";
import type { Granularity } from "@/lib/api/usage";

const GRANULARITIES: Array<{ value: Granularity; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

function breakdownColumns(dimension: string): Array<Column<UsageBreakdownRow>> {
  return [
    {
      key: "name",
      header: dimension,
      cell: (row) => (
        <span className="font-medium">{row.name}</span>
      ),
      sortable: true,
    },
    {
      key: "apiCalls",
      header: "API Calls",
      cell: (row) => (
        <span className="tabular-nums">{formatNumber(row.apiCalls)}</span>
      ),
      sortable: true,
      className: "text-right",
      headerClassName: "text-right",
    },
    {
      key: "tokens",
      header: "Tokens",
      cell: (row) => (
        <span className="tabular-nums">{formatNumber(row.tokens)}</span>
      ),
      sortable: true,
      className: "text-right",
      headerClassName: "text-right",
    },
    {
      key: "cost",
      header: "Cost",
      cell: (row) => (
        <span className="tabular-nums">{formatCurrency(row.cost)}</span>
      ),
      sortable: true,
      className: "text-right",
      headerClassName: "text-right",
    },
  ];
}

/**
 * Usage analytics (frontend-plan §6D): API usage, AI token, and cost trend
 * charts with daily/weekly/monthly granularity, date range filters, per-key
 * and per-model breakdowns, and CSV export — all from GET /usage.
 */
export function UsageAnalytics() {
  const [range, setRange] = useState<DateRange>(EMPTY_DATE_RANGE);
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [keySort, setKeySort] = useState<{ key: string; order: "asc" | "desc" }>(
    { key: "apiCalls", order: "desc" },
  );
  const [modelSort, setModelSort] = useState<{
    key: string;
    order: "asc" | "desc";
  }>({ key: "apiCalls", order: "desc" });

  const analytics = useUsageAnalytics({
    ...(range.from ? { from: range.from } : {}),
    ...(range.to ? { to: range.to } : {}),
    granularity,
  });

  const data = analytics.data;

  function exportBreakdown(
    rows: UsageBreakdownRow[],
    dimension: string,
    filename: string,
  ) {
    downloadCsv(filename, breakdownToCsv(rows, dimension, data?.currency));
  }

  const header = (
    <PageHeader
      title="Usage Analytics"
      description="API usage, token consumption, and cost trends over daily, weekly, and monthly windows."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => void analytics.refetch()}
          disabled={analytics.isFetching}
        >
          <RefreshCw
            className={analytics.isFetching ? "size-4 animate-spin" : "size-4"}
            aria-hidden="true"
          />
          Refresh
        </Button>
      }
    />
  );

  if (analytics.isError && !data) {
    const message =
      analytics.error instanceof ApiError
        ? analytics.error.message
        : "Analytics could not be loaded.";
    return (
      <div className="space-y-6">
        {header}
        <Alert variant="destructive" role="alert">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>Could not load analytics</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <span className="min-w-0 flex-1">{message}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void analytics.refetch()}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <TableFilters
        dateRange={range}
        onDateRangeChange={setRange}
      >
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={granularity}
          onValueChange={(value) => {
            if (value) setGranularity(value as Granularity);
          }}
          aria-label="Chart granularity"
          className="ml-auto"
        >
          {GRANULARITIES.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              aria-label={`View ${option.label.toLowerCase()}`}
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </TableFilters>

      {analytics.isPending && !data ? (
        <LoadingSkeleton lines={6} />
      ) : data ? (
        <>
          {/* Trend charts (§6D) */}
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>API Usage</CardTitle>
                <CardDescription>
                  API calls over the selected window.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UsageChart
                  data={data.apiCallsSeries}
                  formatValue={formatCompactNumber}
                  emptyDescription="No API call data for this range."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>AI Token Usage</CardTitle>
                <CardDescription>
                  Input and output tokens consumed over the selected window.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UsageChart
                  data={data.tokensSeries}
                  formatValue={formatCompactNumber}
                  emptyDescription="No token data for this range."
                />
              </CardContent>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Cost Trend</CardTitle>
                <CardDescription>
                  Estimated cost over the selected window, priced by the
                  backend.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UsageChart
                  data={data.costSeries}
                  formatValue={(value) => formatCurrency(value, data.currency)}
                  emptyDescription="No cost data for this range."
                />
              </CardContent>
            </Card>
          </div>

          {/* Breakdowns (§6D) */}
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div className="space-y-1.5">
                  <CardTitle>Usage by API Key</CardTitle>
                  <CardDescription>
                    Calls, tokens, and cost attributed to each key.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.byApiKey.length === 0}
                  onClick={() =>
                    exportBreakdown(
                      data.byApiKey,
                      "API Key",
                      "usage-by-api-key.csv",
                    )
                  }
                >
                  <Download className="size-4" aria-hidden="true" />
                  CSV
                </Button>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={breakdownColumns("API Key")}
                  rows={data.byApiKey}
                  getRowId={(row) => row.name}
                  sort={keySort}
                  onSortChange={(next) => {
                    if (next) setKeySort(next);
                  }}
                  caption="Usage by API key"
                  emptyContent={
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <BarChart3 className="size-4" aria-hidden="true" />
                      No per-key breakdown reported for this range.
                    </span>
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div className="space-y-1.5">
                  <CardTitle>Usage by Model</CardTitle>
                  <CardDescription>
                    Breakdown by model, when model metadata is available.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.byModel.length === 0}
                  onClick={() =>
                    exportBreakdown(
                      data.byModel,
                      "Model",
                      "usage-by-model.csv",
                    )
                  }
                >
                  <Download className="size-4" aria-hidden="true" />
                  CSV
                </Button>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={breakdownColumns("Model")}
                  rows={data.byModel}
                  getRowId={(row) => row.name}
                  sort={modelSort}
                  onSortChange={(next) => {
                    if (next) setModelSort(next);
                  }}
                  caption="Usage by model"
                  emptyContent={
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <BarChart3 className="size-4" aria-hidden="true" />
                      No model metadata reported for this range.
                    </span>
                  }
                />
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
