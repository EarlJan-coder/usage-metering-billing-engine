import type { Metadata } from "next";
import { History } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export const metadata: Metadata = { title: "Usage History" };

export default function UsageHistoryPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Usage History"
        description="Searchable, filterable record of every metered event for this workspace."
      />
      <EmptyState
        icon={History}
        title="No events recorded"
        description="Metered events will be listed here with timestamps, usage type, API key, tokens, cost, and status — with search, date filters, sorting, and CSV export."
      />
    </div>
  );
}
