import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  usageApi,
  type AnalyticsParams,
  type UsageAnalytics,
} from "@/lib/api/usage";

/**
 * Analytics for GET /usage (frontend-plan §6D): trend series plus per-key
 * and per-model breakdowns for the selected date range and granularity.
 */
export function useUsageAnalytics(params: AnalyticsParams) {
  return useQuery<UsageAnalytics>({
    queryKey: ["usage", "analytics", params],
    queryFn: () => usageApi.analytics(params),
    placeholderData: keepPreviousData,
  });
}
