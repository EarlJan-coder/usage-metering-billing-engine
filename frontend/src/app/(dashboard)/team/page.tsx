import type { Metadata } from "next";
import { Users } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export const metadata: Metadata = { title: "Team Members" };

export default function TeamPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Team Members"
        description="People with access to this workspace and their roles."
      />
      <EmptyState
        icon={Users}
        title="Team management is not connected yet"
        description="Members and roles will be listed here once the backend exposes tenant membership endpoints."
      />
    </div>
  );
}
