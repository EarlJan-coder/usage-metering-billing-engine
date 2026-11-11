"use client";

import Link from "next/link";
import { ChevronsUpDown, Settings2, Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/lib/auth/session";

/**
 * Shows the active workspace and links to workspace settings
 * (frontend-plan §7 — WorkspaceSwitcher).
 */
export function WorkspaceSwitcher() {
  const { tenant } = useSession();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 max-w-[180px] justify-between gap-1.5 px-2 text-left font-normal"
          aria-label="Workspace menu"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
              <Building2 className="size-3" aria-hidden="true" />
            </span>
            <span className="truncate text-sm font-medium">
              {tenant?.name ?? "Workspace"}
            </span>
          </span>
          <ChevronsUpDown
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Workspace
        </DropdownMenuLabel>
        <DropdownMenuItem disabled>
          <Building2 className="size-4" aria-hidden="true" />
          <span className="truncate">{tenant?.name ?? "No workspace"}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings2 className="size-4" aria-hidden="true" />
            Workspace settings
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
