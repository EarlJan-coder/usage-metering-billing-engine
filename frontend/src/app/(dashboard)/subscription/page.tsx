import type { Metadata } from "next";

import { SubscriptionPage } from "./subscription-page";

export const metadata: Metadata = { title: "Subscription" };

export default function SubscriptionPageRoute() {
  return <SubscriptionPage />;
}
