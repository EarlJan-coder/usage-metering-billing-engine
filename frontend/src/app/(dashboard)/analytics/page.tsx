import type { Metadata } from "next";

import { UsageAnalytics } from "./usage-analytics";

export const metadata: Metadata = { title: "Usage Analytics" };

export default function AnalyticsPage() {
  return <UsageAnalytics />;
}
