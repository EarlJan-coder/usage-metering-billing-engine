"use client";

import Link from "next/link";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Header notification indicator (frontend-plan §5). Surfaces usage alerts;
 * Phase 5 passes the live count from the backend summary.
 */
export function NotificationIndicator({ count = 0 }: { count?: number }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={
            count > 0
              ? `Notifications (${count} unread)`
              : "Notifications"
          }
          className="relative"
        >
          <Bell className="size-4" aria-hidden="true" />
          {count > 0 ? (
            <span
              aria-hidden="true"
              className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-destructive"
            />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-4 py-3 text-sm font-medium">
          Notifications
        </div>
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          {count > 0
            ? `You have ${count} usage alert${count === 1 ? "" : "s"}.`
            : "Usage alerts appear here when you approach your plan limits."}
        </div>
        <div className="border-t border-border p-2">
          <Link
            href="/billing"
            className="block rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-accent hover:text-accent-foreground"
          >
            View plan &amp; usage limits
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
