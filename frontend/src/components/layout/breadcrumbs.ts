export type Crumb = {
  label: string;
  href: string;
};

const ROUTE_LABELS: Record<string, string> = {
  "/overview": "Overview",
  "/analytics": "Usage Analytics",
  "/usage": "Usage History",
  "/api-keys": "API Keys",
  "/subscription": "Subscription",
  "/billing": "Costs & Billing",
  "/team": "Team Members",
  "/settings": "Settings",
  "/admin": "Platform Admin",
  "/docs": "Documentation",
  "/help": "Help Center",
  "/login": "Sign In",
  "/signup": "Create Account",
  "/forgot-password": "Forgot Password",
};

function humanize(segment: string): string {
  const words = segment.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Derives the header breadcrumb trail from the current pathname. */
export function breadcrumbTrail(pathname: string): Crumb[] {
  if (pathname === "/") return [{ label: "Home", href: "/" }];

  const known = ROUTE_LABELS[pathname];
  if (known) return [{ label: known, href: pathname }];

  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  return [{ label: humanize(last), href: pathname }];
}
