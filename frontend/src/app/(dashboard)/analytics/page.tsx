import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export const metadata: Metadata = { title: "Usage Analytics" };

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Usage Analytics"
        description="API usage, token consumption, and cost trends over daily, weekly, and monthly windows."
      />
      <EmptyState
        icon={BarChart3}
        title="Analytics will appear here"
        description="Date range filters, per-key and per-model breakdowns, and CSV export are wired to the backend usage analytics endpoints."
      />
    </div>
  );
}
