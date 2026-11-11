"use client";

import { Menu } from "lucide-react";

import { BreadcrumbBar } from "@/components/layout/breadcrumb-bar";
import { NotificationIndicator } from "@/components/layout/notification-indicator";
import { ProfileDropdown } from "@/components/layout/profile-dropdown";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { HEADER_HEIGHT } from "@/lib/constants";

/** Authenticated header: breadcrumbs, workspace, alerts, theme, profile. */
export function AppHeader({
  onMenuOpen,
}: {
  /** Opens the mobile navigation drawer. */
  onMenuOpen: () => void;
}) {
  return (
    <header
      style={{ minHeight: HEADER_HEIGHT }}
      className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:px-6"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        onClick={onMenuOpen}
        aria-label="Open navigation menu"
      >
        <Menu className="size-4" aria-hidden="true" />
      </Button>

      <div className="min-w-0 flex-1">
        <BreadcrumbBar />
      </div>

      <div className="flex items-center gap-1.5">
        <WorkspaceSwitcher />
        <Separator orientation="vertical" className="hidden h-5 sm:block" />
        <NotificationIndicator />
        <ThemeToggle />
        <ProfileDropdown />
      </div>
    </header>
  );
}
