"use client";

import { useMemo, useRef, useState } from "react";
import { History, RefreshCw, TriangleAlert } from "lucide-react";

import { DataTable, type Column, type SortState } from "@/components/data/data-table";
import { TableFilters } from "@/components/data/table-filters";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useUsageHistory,
  type UsageHistoryFilters,
} from "@/hooks/use-usage-history";
import { ApiError } from "@/lib/api/client";
import type { UsageEvent } from "@/lib/api/usage";
import { EMPTY_DATE_RANGE, type DateRange } from "@/lib/date-range";
import { downloadCsv, usageEventsToCsv } from "@/lib/export";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { getPaginationState } from "@/lib/pagination";

const PAGE_SIZE = 25;

/** Milliseconds to wait after the last keystroke before querying. */
const SEARCH_DEBOUNCE_MS = 300;

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all text-right text-sm font-medium tabular-nums">
        {value}
      </dd>
    </div>
  );
}

/**
 * Event details drawer (frontend-plan §6E — event details drawer).
 * Shows every field the backend reported for one usage event.
 */
export function EventDetailsDrawer({
  event,
  onOpenChange,
}: {
  event: UsageEvent | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={event !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Event details</SheetTitle>
          <SheetDescription>
            Full record as reported by the backend.
          </SheetDescription>
        </SheetHeader>
        {event ? (
          <dl className="divide-y divide-border/60 px-4">
            <DetailRow label="Event ID" value={event.id} />
            <DetailRow
              label="Timestamp"
              value={formatDateTime(event.createdAt)}
            />
            <DetailRow label="Usage Type" value={event.type} />
            <DetailRow label="API Key" value={event.apiKeyName ?? "—"} />
            <DetailRow label="Model" value={event.model ?? "—"} />
            <DetailRow
              label="Quantity"
              value={
                event.quantity === null ? "—" : formatNumber(event.quantity)
              }
            />
            <DetailRow
              label="Input Tokens"
              value={
                event.inputTokens === null
                  ? "—"
                  : formatNumber(event.inputTokens)
              }
            />
            <DetailRow
              label="Output Tokens"
              value={
                event.outputTokens === null
                  ? "—"
                  : formatNumber(event.outputTokens)
              }
            />
            <DetailRow
              label="Cost"
              value={
                event.cost === null ? "—" : formatCurrency(event.cost)
              }
            />
            <div className="flex items-center justify-between gap-4 py-2.5">
              <dt className="text-sm text-muted-foreground">Status</dt>
              <dd>
                <StatusBadge status={event.status} />
              </dd>
            </div>
          </dl>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Usage history table (frontend-plan §6E): searchable, sortable, paginated
 * event log with date filtering, CSV export, and an event details drawer.
 * All data comes from GET /usage/history — totals included.
 */
export function UsageHistory() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRange>(EMPTY_DATE_RANGE);
  const [sort, setSort] = useState<SortState>({
    key: "createdAt",
    order: "desc",
  });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<UsageEvent | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filters: UsageHistoryFilters = useMemo(
    () => ({
      search,
      from: range.from,
      to: range.to,
      sort: sort?.key ?? null,
      order: sort?.order ?? null,
      page,
      pageSize: PAGE_SIZE,
    }),
    [search, range, sort, page],
  );

  const history = useUsageHistory(filters);
  const data = history.data;
  const events = data?.events ?? [];
  const pagination = getPaginationState(page, PAGE_SIZE, data?.total ?? 0);

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
  }

  function handleExport() {
    downloadCsv("usage-history.csv", usageEventsToCsv(events));
  }

  const columns: Array<Column<UsageEvent>> = [
    {
      key: "createdAt",
      header: "Timestamp",
      cell: (event) => (
        <span className="tabular-nums text-muted-foreground">
          {formatDateTime(event.createdAt)}
        </span>
      ),
      sortable: true,
    },
    {
      key: "id",
      header: "Event ID",
      cell: (event) => (
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          {event.id}
        </code>
      ),
      sortable: true,
    },
    {
      key: "type",
      header: "Usage Type",
      cell: (event) => <span>{event.type}</span>,
      sortable: true,
    },
    {
      key: "apiKeyName",
      header: "API Key",
      cell: (event) => (
        <span className="text-muted-foreground">{event.apiKeyName ?? "—"}</span>
      ),
      sortable: true,
    },
    {
      key: "model",
      header: "Model",
      cell: (event) => (
        <span className="text-muted-foreground">{event.model ?? "—"}</span>
      ),
    },
    {
      key: "inputTokens",
      header: "Input Tokens",
      cell: (event) => (
        <span className="tabular-nums">
          {event.inputTokens === null ? "—" : formatNumber(event.inputTokens)}
        </span>
      ),
      className: "text-right",
      headerClassName: "text-right",
    },
    {
      key: "outputTokens",
      header: "Output Tokens",
      cell: (event) => (
        <span className="tabular-nums">
          {event.outputTokens === null
            ? "—"
            : formatNumber(event.outputTokens)}
        </span>
      ),
      className: "text-right",
      headerClassName: "text-right",
    },
    {
      key: "cost",
      header: "Cost",
      cell: (event) => (
        <span className="tabular-nums font-medium">
          {event.cost === null ? "—" : formatCurrency(event.cost)}
        </span>
      ),
      sortable: true,
      className: "text-right",
      headerClassName: "text-right",
    },
    {
      key: "status",
      header: "Status",
      cell: (event) => <StatusBadge status={event.status} />,
      sortable: true,
    },
  ];

  const header = (
    <PageHeader
      title="Usage History"
      description="Searchable, filterable record of every metered event for this workspace."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => void history.refetch()}
          disabled={history.isFetching}
        >
          <RefreshCw
            className={history.isFetching ? "size-4 animate-spin" : "size-4"}
            aria-hidden="true"
          />
          Refresh
        </Button>
      }
    />
  );

  const filtersBar = (
    <TableFilters
      search={searchInput}
      onSearchChange={handleSearchChange}
      searchPlaceholder="Search events…"
      dateRange={range}
      onDateRangeChange={(next) => {
        setRange(next);
        setPage(1);
      }}
      onExport={events.length > 0 ? handleExport : undefined}
    />
  );

  if (history.isError && !data) {
    const message =
      history.error instanceof ApiError
        ? history.error.message
        : "Usage history could not be loaded.";
    return (
      <div className="space-y-6">
        {header}
        {filtersBar}
        <Alert variant="destructive" role="alert">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>Could not load usage history</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <span className="min-w-0 flex-1">{message}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void history.refetch()}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const hasFilters =
    search !== "" || range.from !== null || range.to !== null;

  return (
    <div className="space-y-6">
      {header}
      {filtersBar}

      <Card>
        <CardContent className="space-y-4">
          {history.isPending && !data ? (
            <LoadingSkeleton lines={8} />
          ) : (
            <>
              <DataTable
                columns={columns}
                rows={events}
                getRowId={(event) => event.id}
                sort={sort}
                onSortChange={(next) => {
                  setSort(next);
                  setPage(1);
                }}
                onRowClick={(event) => setSelected(event)}
                caption="Usage history events"
                emptyContent={
                  <span className="inline-flex flex-col items-center gap-2 text-muted-foreground">
                    <History className="size-5" aria-hidden="true" />
                    {hasFilters
                      ? "No events match the current filters."
                      : "No usage events recorded yet."}
                  </span>
                }
              />

              {/* Pagination (§6E) */}
              <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
                <p className="text-sm text-muted-foreground tabular-nums">
                  {pagination.total === 0
                    ? "No events"
                    : `Showing ${pagination.from}–${pagination.to} of ${formatNumber(pagination.total)}`}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!pagination.hasPrev || history.isFetching}
                    onClick={() => setPage((current) => current - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!pagination.hasNext || history.isFetching}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <EventDetailsDrawer
        event={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
