"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc";

export type SortState = { key: string; order: SortDirection } | null;

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
};

/**
 * Generic data table (frontend-plan §7 — DataTable) with optional column
 * sorting. Sort state is lifted to the parent so pages can hand it to the
 * backend (usage history) or sort locally (breakdown tables).
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  sort = null,
  onSortChange,
  onRowClick,
  caption,
  emptyContent,
  isLoading = false,
  rowClassName,
}: {
  columns: Array<Column<T>>;
  rows: T[];
  getRowId: (row: T) => string;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  /** Makes rows activatable (click/Enter/Space) — e.g. to open a drawer. */
  onRowClick?: (row: T) => void;
  caption?: string;
  emptyContent?: ReactNode;
  isLoading?: boolean;
  rowClassName?: (row: T) => string;
}) {
  function toggleSort(key: string) {
    if (!onSortChange) return;
    if (sort?.key === key) {
      onSortChange({ key, order: sort.order === "asc" ? "desc" : "asc" });
    } else {
      onSortChange({ key, order: "asc" });
    }
  }

  return (
    <div data-slot="table-container" className="w-full">
      <Table>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn(column.headerClassName)}
                aria-sort={
                  sort?.key === column.key
                    ? sort.order === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
              >
                {column.sortable && onSortChange ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {column.header}
                    {sort?.key === column.key ? (
                      sort.order === "asc" ? (
                        <ArrowUp className="size-3.5" aria-hidden="true" />
                      ) : (
                        <ArrowDown className="size-3.5" aria-hidden="true" />
                      )
                    ) : (
                      <ArrowUpDown
                        className="size-3.5 text-muted-foreground/60"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                ) : (
                  column.header
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && !isLoading ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-32 text-center">
                {emptyContent ?? (
                  <span className="text-muted-foreground">No results.</span>
                )}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow
                key={getRowId(row)}
                className={cn(
                  onRowClick && "cursor-pointer",
                  rowClassName?.(row),
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? "button" : undefined}
                aria-label={
                  onRowClick ? `Open details for row ${getRowId(row)}` : undefined
                }
              >
                {columns.map((column) => (
                  <TableCell key={column.key} className={cn(column.className)}>
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
