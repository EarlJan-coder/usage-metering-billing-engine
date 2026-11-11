import type { Metadata } from "next";

import { BillingPage } from "./billing-page";

export const metadata: Metadata = { title: "Costs & Billing" };

export default function BillingPageRoute() {
  return <BillingPage />;
}
