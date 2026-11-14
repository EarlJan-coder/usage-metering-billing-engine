import { eq } from "drizzle-orm";

import type { AppDb } from "../../db/index.js";
import { subscriptions } from "../../db/schema.js";
import { getStripe } from "../../services/stripe.js";
import {
  applySubscriptionSnapshot,
  type SubLike,
} from "../../modules/webhooks/service.js";

/**
 * stripe_reconcile job: pulls each paid subscription's current state from
 * Stripe and applies it through the SAME sync function the webhooks use,
 * healing any missed or out-of-order deliveries.
 *
 * payload: { tenantId?: string } — omitted means every Stripe-linked tenant.
 */
export async function stripeReconcileHandler(
  db: AppDb,
  payload: Record<string, unknown>,
): Promise<void> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("stripe_reconcile requires Stripe to be configured");
  }

  const explicit = payload.tenantId;
  const rows =
    typeof explicit === "string" && explicit.length > 0
      ? await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.tenantId, explicit))
      : await db.select().from(subscriptions);

  const appliedAtUnix = Math.floor(Date.now() / 1000);

  for (const row of rows) {
    if (!row.stripeSubscriptionId) continue;
    const sub = (await stripe.subscriptions.retrieve(
      row.stripeSubscriptionId,
    )) as unknown as SubLike;
    await applySubscriptionSnapshot(db, row, sub, appliedAtUnix);
  }
}
