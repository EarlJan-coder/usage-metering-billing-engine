import {
  BarChart3,
  BookOpen,
  CreditCard,
  History,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Receipt,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

export type SessionRole = "admin" | "member";

/**
 * Sidebar navigation (frontend-plan §5).
 * Invoices is intentionally absent until the backend exposes an invoice
 * endpoint (see ledger Ruling 5).
 */
export function navSections(role: SessionRole): NavSection[] {
  return [
    {
      label: "Workspace",
      items: [
        { label: "Overview", href: "/overview", icon: LayoutDashboard },
        { label: "Usage Analytics", href: "/analytics", icon: BarChart3 },
        { label: "Usage History", href: "/usage", icon: History },
        { label: "API Keys", href: "/api-keys", icon: KeyRound },
      ],
    },
    {
      label: "Billing",
      items: [
        { label: "Subscription", href: "/subscription", icon: CreditCard },
        { label: "Costs & Billing", href: "/billing", icon: Receipt },
      ],
    },
    {
      label: "Administration",
      items: [
        { label: "Team Members", href: "/team", icon: Users },
        { label: "Settings", href: "/settings", icon: Settings },
        ...(role === "admin"
          ? [
              {
                label: "Platform Admin",
                href: "/admin",
                icon: ShieldCheck,
              },
            ]
          : []),
      ],
    },
  ];
}

export const secondaryNav: NavItem[] = [
  { label: "Documentation", href: "/docs", icon: BookOpen },
  { label: "Help Center", href: "/help", icon: LifeBuoy },
];
