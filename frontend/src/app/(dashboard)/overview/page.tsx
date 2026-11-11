import type { Metadata } from "next";
import { Activity } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="API calls, AI token consumption, estimated cost, and subscription status at a glance."
      />
      <EmptyState
        icon={Activity}
        title="No usage data yet"
        description="Once the backend API is configured (NEXT_PUBLIC_API_BASE_URL) and your first metering event is tracked, KPIs, charts, and recent activity will appear here."
      />
    </div>
  );
}
