import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/**
 * Quota consumption indicator (frontend-plan §7 — UsageProgress).
 * Percentages are display math over backend-reported used/limit values;
 * the limit itself is never recomputed.
 */
export function UsageProgress({
  label,
  used,
  limit,
  formatValue,
}: {
  label: string;
  used: number;
  limit: number | null;
  formatValue: (value: number) => string;
}) {
  const limitValue = limit !== null && limit > 0 ? limit : null;

  if (limitValue === null) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{label}</span>
          <span className="tabular-nums text-muted-foreground">
            {formatValue(used)} used
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          No limit reported by the backend.
        </p>
      </div>
    );
  }

  const percent = Math.min(
    100,
    Math.max(0, Math.round((used / limitValue) * 100)),
  );
  const indicatorTone =
    percent >= 90
      ? "[&>[data-slot=progress-indicator]]:bg-destructive"
      : percent >= 75
        ? "[&>[data-slot=progress-indicator]]:bg-warning"
        : "";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {formatValue(used)} / {formatValue(limitValue)}
        </span>
      </div>
      <Progress
        value={percent}
        aria-label={`${label} usage`}
        className={cn("h-2", indicatorTone)}
      />
      <p className="text-xs text-muted-foreground">
        {percent}% of limit used
      </p>
    </div>
  );
}
