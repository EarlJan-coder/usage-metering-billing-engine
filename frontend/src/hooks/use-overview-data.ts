import { useQuery } from "@tanstack/react-query";

import { subscriptionsApi } from "@/lib/api/subscriptions";
import { usageApi } from "@/lib/api/usage";

/** Recent-activity window shown on the overview page. */
export const RECENT_ACTIVITY_LIMIT = 5;

/**
 * Overview dashboard data (frontend-plan §6C + Phase 5): KPI summary,
 * current subscription, and recent usage activity — all from the backend.
 */
export function useOverviewData() {
  const summary = useQuery({
    queryKey: ["usage", "summary"],
    queryFn: () => usageApi.summary(),
  });

  const subscription = useQuery({
    queryKey: ["subscriptions", "current"],
    queryFn: () => subscriptionsApi.current(),
  });

  const recent = useQuery({
    queryKey: ["usage", "history", { limit: RECENT_ACTIVITY_LIMIT }],
    queryFn: () => usageApi.history({ limit: RECENT_ACTIVITY_LIMIT }),
  });

  const refetchAll = () =>
    Promise.all([summary.refetch(), subscription.refetch(), recent.refetch()]);

  return { summary, subscription, recent, refetchAll };
}
