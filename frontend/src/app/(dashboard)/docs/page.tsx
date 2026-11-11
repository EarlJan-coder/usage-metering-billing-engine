import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Documentation" };

const ENDPOINTS: Array<{ method: string; path: string; description: string }> =
  [
    { method: "POST", path: "/auth/register", description: "Create an account" },
    { method: "POST", path: "/auth/login", description: "Sign in" },
    { method: "GET", path: "/auth/me", description: "Current session" },
    { method: "GET", path: "/plans", description: "Available plans" },
    { method: "GET", path: "/usage/summary", description: "Usage KPIs" },
    { method: "GET", path: "/usage/history", description: "Event list" },
    {
      method: "POST",
      path: "/metering/track",
      description: "Record usage (idempotent)",
    },
    {
      method: "GET",
      path: "/billing/summary",
      description: "Costs and billing",
    },
    {
      method: "GET",
      path: "/subscriptions/current",
      description: "Subscription state",
    },
    {
      method: "POST",
      path: "/subscriptions/checkout",
      description: "Start Stripe Checkout",
    },
    { method: "GET", path: "/api-keys", description: "List API keys" },
    { method: "POST", path: "/api-keys", description: "Create an API key" },
  ];

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-muted/60 p-4 text-[0.8125rem] leading-relaxed">
      <code>{code}</code>
    </pre>
  );
}

export default function DocsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Documentation"
        description="Everything you need to send your first metered event and understand how usage becomes cost."
      />

      <Alert>
        <BookOpen className="size-4" aria-hidden="true" />
        <AlertTitle>Backend first</AlertTitle>
        <AlertDescription>
          This frontend is a client of the REST API described in{" "}
          <code className="rounded bg-muted px-1">backend-plan.md</code>. Set{" "}
          <code className="rounded bg-muted px-1">
            NEXT_PUBLIC_API_BASE_URL
          </code>{" "}
          to the backend origin (for example{" "}
          <code className="rounded bg-muted px-1">
            http://localhost:4000/api/v1
          </code>
          ).
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Track usage</CardTitle>
            <CardDescription>
              Every billable request needs an idempotency key so retries never
              double-count.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <CodeBlock
              code={`curl -X POST http://localhost:4000/api/v1/metering/track \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Idempotency-Key: unique-request-id" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"api_call","quantity":1}'`}
            />
            <p className="text-sm text-muted-foreground">
              AI token usage uses the same endpoint with{" "}
              <code className="rounded bg-muted px-1">
                {`type: "ai_tokens"`}
              </code>{" "}
              and the token quantity fields returned by your model provider.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How metering works</CardTitle>
            <CardDescription>The path from request to invoice.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">1. Send</span> —
                your service reports API calls and token usage with an API key
                and idempotency key.
              </li>
              <li>
                <span className="font-medium text-foreground">2. Enforce</span> —
                the backend checks your subscription quotas and returns HTTP 429
                when a limit would be exceeded.
              </li>
              <li>
                <span className="font-medium text-foreground">3. Price</span> —
                the pricing engine computes exact costs with versioned rates for
                input, output, cached, and reasoning tokens.
              </li>
              <li>
                <span className="font-medium text-foreground">4. Bill</span> —
                Stripe Checkout upgrades your plan; verified webhooks update
                subscription state.
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>REST API reference</CardTitle>
          <CardDescription>
            All routes are prefixed with{" "}
            <code className="rounded bg-muted px-1">/api/v1</code> and require
            authentication unless noted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4">Method</th>
                  <th className="py-2 pr-4">Endpoint</th>
                  <th className="py-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {ENDPOINTS.map((endpoint) => (
                  <tr
                    key={`${endpoint.method} ${endpoint.path}`}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="py-2.5 pr-4">
                      <Badge
                        variant="outline"
                        className={
                          endpoint.method === "GET"
                            ? "font-mono text-emerald-700 dark:text-emerald-400"
                            : "font-mono text-primary"
                        }
                      >
                        {endpoint.method}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs">
                      {endpoint.path}
                    </td>
                    <td className="py-2.5 text-muted-foreground">
                      {endpoint.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            See also:{" "}
            <Link href="/help" className="font-medium text-primary underline-offset-4 hover:underline">
              Help Center
            </Link>{" "}
            ·{" "}
            <Link href="/api-keys" className="font-medium text-primary underline-offset-4 hover:underline">
              API Keys
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
