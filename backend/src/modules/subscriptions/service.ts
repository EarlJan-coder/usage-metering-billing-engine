import type Stripe from "stripe";

import type { AppDb } from "../../db/index.js";
import { AppError } from "../../middleware/error.js";
import { getStripe } from "../../services/stripe.js";
import { findPlan } from "../tenants/service.js";
import {
  getCurrentSubscription,
  updateSubscriptionByTenant,
  type PlanRow,
  type SubscriptionRow,
} from "./repository.js";

const DEFAULT_SUCCESS_URL = "http://localhost:3000/billing?checkout=success";
const DEFAULT_CANCEL_URL = "http://localhost:3000/billing?checkout=cancelled";

export type CurrentSubscriptionPayload = {
  plan: { id: string; name: string; code: string };
  planName: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** Wire shape shared by GET /current and POST /cancel (frontend contract). */
export function shapeSubscription(
  sub: SubscriptionRow,
  plan: PlanRow,
): CurrentSubscriptionPayload {
  return {
    plan: { id: plan.id, name: plan.name, code: plan.code },
    planName: plan.name,
    status: sub.status,
    currentPeriodStart: iso(sub.currentPeriodStart),
    currentPeriodEnd: iso(sub.currentPeriodEnd),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  };
}

function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) {
    throw new AppError(
      503,
      "stripe_not_configured",
      "Stripe billing is not configured on this deployment",
    );
  }
  return stripe;
}

/**
 * Starts Stripe Checkout for a paid plan (§5G). The redirect proves nothing:
 * subscription state only changes when a VERIFIED webhook arrives (§5G).
 */
export async function startCheckout(
  db: AppDb,
  tenantId: string,
  planIdOrCode: string,
): Promise<{ url: string }> {
  const stripe = requireStripe();

  const plan = await findPlan(db, planIdOrCode);
  if (!plan) throw new AppError(404, "not_found", "Plan not found");
  if (plan.priceMinor <= 0) {
    throw new AppError(400, "invalid_plan", "Only paid plans can be purchased");
  }

  const current = await getCurrentSubscription(db, tenantId);
  if (!current) throw new AppError(404, "not_found", "Subscription not found");

  // Create the Stripe customer once per tenant, reuse afterwards.
  let customerId = current.subscription.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { tenantId },
    });
    customerId = customer.id;
    await updateSubscriptionByTenant(db, tenantId, {
      stripeCustomerId: customerId,
    });
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
    plan.stripePriceId
      ? [{ price: plan.stripePriceId, quantity: 1 }]
      : [
          {
            quantity: 1,
            price_data: {
              currency: plan.currency.toLowerCase(),
              unit_amount: plan.priceMinor,
              recurring: {
                interval: plan.interval === "year" ? "year" : "month",
              },
              product_data: { name: plan.name },
            },
          },
        ];

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: lineItems,
    success_url: process.env.STRIPE_SUCCESS_URL ?? DEFAULT_SUCCESS_URL,
    cancel_url: process.env.STRIPE_CANCEL_URL ?? DEFAULT_CANCEL_URL,
    metadata: { tenantId, planId: plan.id },
    subscription_data: { metadata: { tenantId, planId: plan.id } },
  });

  if (!session.url) {
    throw new AppError(
      502,
      "stripe_error",
      "Stripe did not return a checkout URL",
    );
  }
  return { url: session.url };
}

/**
 * Cancels at period end through the Stripe API — a state change we make
 * ourselves, not a redirect. The free plan has nothing to cancel (§5G).
 */
export async function cancelSubscription(
  db: AppDb,
  tenantId: string,
): Promise<CurrentSubscriptionPayload> {
  const stripe = requireStripe();

  const current = await getCurrentSubscription(db, tenantId);
  if (!current) throw new AppError(404, "not_found", "Subscription not found");

  const stripeSubscriptionId = current.subscription.stripeSubscriptionId;
  if (current.plan.priceMinor <= 0 || !stripeSubscriptionId) {
    throw new AppError(
      400,
      "invalid_subscription",
      "There is no paid subscription to cancel",
    );
  }

  await stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  const updated = await updateSubscriptionByTenant(db, tenantId, {
    cancelAtPeriodEnd: true,
    updatedAt: new Date(),
  });

  return shapeSubscription(updated ?? current.subscription, current.plan);
}

export async function getCurrent(
  db: AppDb,
  tenantId: string,
): Promise<CurrentSubscriptionPayload> {
  const current = await getCurrentSubscription(db, tenantId);
  if (!current) throw new AppError(404, "not_found", "Subscription not found");
  return shapeSubscription(current.subscription, current.plan);
}
