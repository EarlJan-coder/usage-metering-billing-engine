import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "error" | "neutral";

const SUCCESS_STATUSES = new Set([
  "active",
  "enabled",
  "paid",
  "succeeded",
  "completed",
  "delivered",
  "verified",
  "healthy",
  "ok",
]);

const WARNING_STATUSES = new Set([
  "pending",
  "trialing",
  "past_due",
  "incomplete",
  "incomplete_expired",
  "paused",
  "warning",
  "degraded",
  "retrying",
  "processing",
  "open",
]);

const ERROR_STATUSES = new Set([
  "canceled",
  "cancelled",
  "failed",
  "revoked",
  "error",
  "expired",
  "disabled",
  "unhealthy",
  "permanently_failed",
]);

function toneFor(status: string): Tone {
  const normalized = status.toLowerCase();
  if (SUCCESS_STATUSES.has(normalized)) return "success";
  if (WARNING_STATUSES.has(normalized)) return "warning";
  if (ERROR_STATUSES.has(normalized)) return "error";
  return "neutral";
}

const TONE_CLASSES: Record<Tone, string> = {
  success:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30",
  warning:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30",
  error:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30",
  neutral:
    "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/15 dark:text-slate-400 dark:border-slate-500/30",
};

function labelFor(status: string): string {
  const [first, ...rest] = status.split("_");
  return [
    first.charAt(0).toUpperCase() + first.slice(1).toLowerCase(),
    ...rest.map((part) => part.toLowerCase()),
  ].join(" ");
}

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(TONE_CLASSES[toneFor(status)], "font-medium", className)}
    >
      {labelFor(status)}
    </Badge>
  );
}
