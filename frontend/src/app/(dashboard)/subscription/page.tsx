import type { Metadata } from "next";
import { CreditCard } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export const metadata: Metadata = { title: "Subscription" };

export default function SubscriptionPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscription"
        description="Current plan, status, billing period, and usage limits from the backend."
      />
      <EmptyState
        icon={CreditCard}
        title="No subscription information"
        description="Plan status, billing period, and quota consumption will be loaded from GET /subscriptions/current once the backend is connected."
      />
    </div>
  );
}
