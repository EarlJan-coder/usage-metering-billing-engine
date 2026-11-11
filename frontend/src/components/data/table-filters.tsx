"use client";

import type { ReactNode } from "react";
import { Download, Search } from "lucide-react";

import { DateRangePicker } from "@/components/data/date-range-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DateRange } from "@/lib/date-range";
import { cn } from "@/lib/utils";

/**
 * Search + date-range + export toolbar (frontend-plan §7 — TableFilters).
 * Extra filters can be injected through `children`.
 */
export function TableFilters({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  dateRange,
  onDateRangeChange,
  onExport,
  exportLabel = "Export CSV",
  children,
  className,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  onExport?: () => void;
  exportLabel?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between",
        className,
      )}
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {onSearchChange ? (
          <div className="relative w-full sm:w-72">
            <Search
              className="pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search ?? ""}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="pl-9"
            />
          </div>
        ) : null}
        <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
        {children}
      </div>

      {onExport ? (
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="size-4" aria-hidden="true" />
          {exportLabel}
        </Button>
      ) : null}
    </div>
  );
}
