import type { ReactNode } from "react";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { RequireAuth } from "@/components/layout/require-auth";

export default function DashboardRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <DashboardLayout>
      <RequireAuth>{children}</RequireAuth>
    </DashboardLayout>
  );
}
