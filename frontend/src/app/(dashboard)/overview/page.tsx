import type { Metadata } from "next";

import { OverviewDashboard } from "./overview-dashboard";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return <OverviewDashboard />;
}
