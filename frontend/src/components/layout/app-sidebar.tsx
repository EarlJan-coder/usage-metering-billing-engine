"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity } from "lucide-react";

import { secondaryNav, navSections } from "@/components/layout/nav";
import { useSession } from "@/lib/auth/session";
import { cn } from "cn";

function SidebarLink({
  href,
  label,
  icon: Icon,
  active,
  muted = false,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  muted?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring/50",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : muted
            ? "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

/** Fixed desktop sidebar (frontend-plan §5 — AppSidebar). */
export function AppSidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const { user } = useSession();
  const sections = navSections(user?.role ?? "member");

  return (
    <div
      className={cn(
        "flex h-full w-[240px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        className,
      )}
    >
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-4">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Activity className="size-4" aria-hidden="true" />
        </span>
        <span className="text-sm font-semibold tracking-tight">
          Usage Metering
        </span>
      </div>

      <nav
        aria-label="Main navigation"
        className="flex-1 overflow-y-auto px-3 py-4"
      >
        <div className="space-y-5">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="mb-1.5 px-2 text-[0.6875rem] font-medium uppercase tracking-wider text-sidebar-foreground/50">
                {section.label}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <SidebarLink
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      active={
                        pathname === item.href ||
                        pathname.startsWith(`${item.href}/`)
                      }
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <div className="space-y-0.5 border-t border-sidebar-border p-3">
        {secondaryNav.map((item) => (
          <SidebarLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={
              pathname === item.href || pathname.startsWith(`${item.href}/`)
            }
            muted
          />
        ))}
      </div>
    </div>
  );
}
