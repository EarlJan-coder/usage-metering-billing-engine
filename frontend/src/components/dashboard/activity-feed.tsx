import { History, Sparkles, Zap } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import type { UsageEvent } from "@/lib/api/usage";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Recent metered events (frontend-plan §7 — ActivityFeed).
 * Timestamps are rendered in UTC; costs use backend minor units as-is.
 */
export function ActivityFeed({
  events,
  currency = "USD",
  emptyDescription = "Metered events will appear here as soon as your services report usage.",
  className,
}: {
  events: UsageEvent[];
  currency?: string;
  emptyDescription?: string;
  className?: string;
}) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No recent activity"
        description={emptyDescription}
        className={cn("border-0 bg-transparent px-4 py-10", className)}
      />
    );
  }

  return (
    <ul className={cn("divide-y divide-border/60", className)}>
      {events.map((event) => {
        const isTokens = event.type === "ai_tokens";
        return (
          <li key={event.id} className="flex items-center gap-3 py-3">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground"
            >
              {isTokens ? (
                <Sparkles className="size-4" />
              ) : (
                <Zap className="size-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {isTokens ? "AI token usage" : "API call"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {formatDateTime(event.createdAt)}
                {event.apiKeyName ? ` · ${event.apiKeyName}` : ""}
                {event.quantity !== null
                  ? ` · ${formatNumber(event.quantity)}${isTokens ? " tokens" : ""}`
                  : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {event.cost !== null ? (
                <p className="text-sm font-medium tabular-nums">
                  {formatCurrency(event.cost, currency)}
                </p>
              ) : null}
              <StatusBadge status={event.status} className="text-[0.6875rem]" />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
