import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** KPI card for dashboard headline metrics (frontend-plan §7 — MetricCard). */
export function MetricCard({
  title,
  value,
  sublabel,
  icon: Icon,
  footer,
  className,
}: {
  title: string;
  value: string;
  sublabel?: string;
  icon?: LucideIcon;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {Icon ? (
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground"
          >
            <Icon className="size-4" />
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-1.5">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </p>
        {sublabel ? (
          <p className="text-xs text-muted-foreground">{sublabel}</p>
        ) : null}
        {footer}
      </CardContent>
    </Card>
  );
}
