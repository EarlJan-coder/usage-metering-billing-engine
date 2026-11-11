import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  usageApi,
  type HistoryPage,
  type HistoryParams,
} from "@/lib/api/usage";

/** One filter state driving GET /usage/history (frontend-plan §6E). */
export type UsageHistoryFilters = {
  search: string;
  /** Inclusive yyyy-MM-dd bounds, or null. */
  from: string | null;
  to: string | null;
  /** Column key for sorting, or null for backend default order. */
  sort: string | null;
  order: "asc" | "desc" | null;
  /** 1-based page number. */
  page: number;
  pageSize: number;
};

export function usageHistoryParams(
  filters: UsageHistoryFilters,
): HistoryParams {
  const offset = (filters.page - 1) * filters.pageSize;
  return {
    limit: filters.pageSize,
    ...(offset > 0 ? { offset } : {}),
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    ...(filters.sort ? { sort: filters.sort } : {}),
    ...(filters.order ? { order: filters.order } : {}),
  };
}

/**
 * Paginated usage history (frontend-plan §6E). Keeps the previous page
 * visible while the next one loads so pagination feels instant.
 */
export function useUsageHistory(filters: UsageHistoryFilters) {
  return useQuery<HistoryPage>({
    queryKey: ["usage", "history", filters],
    queryFn: () => usageApi.history(usageHistoryParams(filters)),
    placeholderData: keepPreviousData,
  });
}
