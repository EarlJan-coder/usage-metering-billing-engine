import type { Metadata } from "next";
import { Receipt } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export const metadata: Metadata = { title: "Costs & Billing" };

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Costs & Billing"
        description="Estimated costs, cost breakdowns, and plan options — all calculated by the backend."
      />
      <EmptyState
        icon={Receipt}
        title="No billing data yet"
        description="Estimated spend, cost trends, and Free/Pro plan cards will load from GET /billing/summary once the backend is connected."
      />
    </div>
  );
}
