import type { Metadata } from "next";

import { UsageHistory } from "./usage-history";

export const metadata: Metadata = { title: "Usage History" };

export default function UsageHistoryPage() {
  return <UsageHistory />;
}
