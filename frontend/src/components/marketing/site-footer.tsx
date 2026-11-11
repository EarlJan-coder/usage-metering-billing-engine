import Link from "next/link";
import { Activity } from "lucide-react";

const COLUMNS: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "How it works", href: "#how-it-works" },
      { label: "Pricing", href: "#pricing" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Help Center", href: "/help" },
      { label: "API reference", href: "/docs" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Sign In", href: "/login" },
      { label: "Get Started", href: "/signup" },
    ],
  },
];

/** Marketing footer (frontend-plan §6A — section 8). */
export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <Link href="/" className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"
              >
                <Activity className="size-4" />
              </span>
              <span className="text-sm font-semibold tracking-tight">
                Usage Metering
              </span>
            </Link>
            <p className="mt-3 text-sm text-muted-foreground">
              Usage metering and billing for SaaS products — API calls, AI
              tokens, quotas, and Stripe-backed subscriptions from one engine.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {column.title}
              </p>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 border-t border-border/60 pt-6 text-xs text-muted-foreground">
          © Usage Metering &amp; Billing Engine. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
