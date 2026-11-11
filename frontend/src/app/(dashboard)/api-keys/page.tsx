import type { Metadata } from "next";
import { KeyRound } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export const metadata: Metadata = { title: "API Keys" };

export default function ApiKeysPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="API Keys"
        description="Create, revoke, and monitor the keys your services use to report usage."
      />
      <EmptyState
        icon={KeyRound}
        title="No API keys yet"
        description="Generate your first key to start tracking usage. Keys are shown once at creation and stored hashed by the backend."
      />
    </div>
  );
}
