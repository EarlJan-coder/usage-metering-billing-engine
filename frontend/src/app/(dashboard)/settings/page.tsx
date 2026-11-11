import type { Metadata } from "next";
import { Settings } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Account, profile, workspace, theme, and security preferences."
      />
      <EmptyState
        icon={Settings}
        title="Settings panels are being built"
        description="Profile information, workspace details, theme preferences, and security settings will appear here."
      />
    </div>
  );
}
