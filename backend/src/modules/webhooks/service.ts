import { eq } from "drizzle-orm";
import type Stripe from "stripe";

import type { AppDb } from "../../db/index.js";
import { plans } from "../../db/schema.js";
import { utcMonthBounds } from "../../db/seed.js";
import {
  findByStripeSubscriptionId,
  getCurrentSubscription,
  updateSubscriptionByTenant,
  type SubscriptionRow,
} from "../subscriptions/repository.js";
import { findPlanByStripePriceId } from "../tenants/service.js";

/**
 * Loose shapes for the Stripe objects inside event payloads. The wire
 * format varies by API version (periods live at the top level or under
 * subscription items), so handlers read defensively.
 */
export type SubItemLike = {
  price?: { id?: string } | null;
  current_period_start?: number;
  current_period_end?: number;
};

export type SubLike = {
  id?: string;
  status?: string;
  cancel_at_period_end?: boolean;
  current_period_start?: number;
  current_period_end?: number;
  metadata?: Record<string, string | undefined>;
  items?: { data?: SubItemLike[] };
};

type SessionLike = {
  customer?: string | { id?: string } | null;
  subscription?: string | { id?: string } | null;
  metadata?: Record<string, string | undefined>;
};

function asId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string") return id;
  }
  return null;
}

const VALID_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "canceled",
]);

/** Maps Stripe subscription statuses onto our enum; never throws. */
function mapStatus(
  status: string | undefined,
): "active" | "trialing" | "past_due" | "unpaid" | "canceled" {
  // conservative defaults: an unknown/unpaid state must never grant
  // paid-plan quota (review #5)
  if (!status) return "past_due";
  if (VALID_STATUSES.has(status)) {
    return status as "active" | "trialing" | "past_due" | "unpaid" | "canceled";
  }
  if (status === "incomplete") return "past_due"; // initial payment pending
  if (status === "paused") return "past_due";
  return "canceled"; // incomplete_expired and anything terminal
}

/** Billing period from the subscription object or its first item. */
function periodOf(sub: SubLike): { start: Date | null; end: Date | null } {
  const item = sub.items?.data?.[0];
  const startTs = sub.current_period_start ?? item?.current_period_start;
  const endTs = sub.current_period_end ?? item?.current_period_end;
  return {
    start: typeof startTs === "number" ? new Date(startTs * 1000) : null,
    end: typeof endTs === "number" ? new Date(endTs * 1000) : null,
  };
}

/**
 * Applies one VERIFIED Stripe event to local state (§5G). Unknown event
 * types are recorded but not processed. Out-of-order deliveries never
 * regress fresher state: each subscription row carries the Unix seconds of
 * the last event applied (Review Focus).
 */
export async function processStripeEvent(
  db: AppDb,
  event: Stripe.Event,
  stripe: Stripe,
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(db, event, stripe);
      return;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(db, event);
      return;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(db, event);
      return;
    default:
      return;
  }
}

/**
 * checkout.session.completed → the tenant is now on the purchased plan.
 * Period + plan truth comes from the subscription object when Stripe is
 * reachable; the session metadata + current UTC month is the fallback.
 */
async function handleCheckoutCompleted(
  db: AppDb,
  event: Stripe.Event,
  stripe: Stripe,
): Promise<void> {
  const session = event.data.object as unknown as SessionLike;
  const tenantId = session.metadata?.tenantId;
  const stripeSubscriptionId = asId(session.subscription);
  const customerId = asId(session.customer);

  if (!tenantId || !stripeSubscriptionId) {
    throw new Error(
      "checkout.session.completed is missing tenant/subscription metadata",
    );
  }

  const current = await getCurrentSubscription(db, tenantId);
  if (!current) {
    throw new Error(`no subscription row for tenant ${tenantId}`);
  }
  // Out-of-order guard (review #4): a redelivered/old checkout event must
  // never overwrite newer state or rewind the guard.
  const lastApplied = current.subscription.lastStripeEventAt;
  if (lastApplied !== null && event.created < lastApplied) {
    return;
  }

  let status: string | undefined = "active";
  let cancelAtPeriodEnd = false;
  let period = { start: null as Date | null, end: null as Date | null };
  let planId: string | undefined = session.metadata?.planId;

  try {
    const sub = (await stripe.subscriptions.retrieve(
      stripeSubscriptionId,
    )) as unknown as SubLike;
    status = sub.status;
    cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
    period = periodOf(sub);
    const priceId = sub.items?.data?.[0]?.price?.id;
    const planByPrice = priceId ? await findPlanByStripePriceId(db, priceId) : null;
    if (!planId && planByPrice) planId = planByPrice.id;
  } catch {
    const bounds = utcMonthBounds();
    period = { start: bounds.start, end: bounds.end };
  }

  const patch: Parameters<typeof updateSubscriptionByTenant>[2] = {
    status: mapStatus(status),
    stripeSubscriptionId,
    cancelAtPeriodEnd,
    lastStripeEventAt: Math.max(lastApplied ?? 0, event.created),
    updatedAt: new Date(),
  };
  if (customerId) patch.stripeCustomerId = customerId;
  if (planId) patch.planId = planId;
  if (period.start) patch.currentPeriodStart = period.start;
  if (period.end) patch.currentPeriodEnd = period.end;

  const updated = await updateSubscriptionByTenant(db, tenantId, patch);
  if (!updated) {
    throw new Error(`no subscription row for tenant ${tenantId}`);
  }
}

/** customer.subscription.updated → sync status/period/plan/cancel flags. */
async function handleSubscriptionUpdated(
  db: AppDb,
  event: Stripe.Event,
): Promise<void> {
  const sub = event.data.object as unknown as SubLike;
  const stripeSubscriptionId = sub.id;
  if (!stripeSubscriptionId) {
    throw new Error("customer.subscription.updated without a subscription id");
  }

  const row = await resolveRow(db, sub, stripeSubscriptionId);
  if (!row) return; // not ours — recorded only

  await applySubscriptionSnapshot(db, row, sub, event.created);
}

/**
 * The single state-sync primitive shared by webhooks and the
 * stripe_reconcile job: applies a Stripe subscription snapshot to the
 * local row. Snapshots older than the last applied one (out-of-order
 * deliveries) are ignored so state never regresses.
 */
export async function applySubscriptionSnapshot(
  db: AppDb,
  row: SubscriptionRow,
  sub: SubLike,
  appliedAtUnix: number,
): Promise<void> {
  if (
    row.lastStripeEventAt !== null &&
    appliedAtUnix < row.lastStripeEventAt
  ) {
    return;
  }

  const patch: Parameters<typeof updateSubscriptionByTenant>[2] = {
    status: mapStatus(sub.status),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    lastStripeEventAt: appliedAtUnix,
    updatedAt: new Date(),
  };
  // record the Stripe subscription id even when the row was resolved via
  // the tenant metadata tag — cancel/reconcile need it later
  if (sub.id) patch.stripeSubscriptionId = sub.id;
  const priceId = sub.items?.data?.[0]?.price?.id;
  if (priceId) {
    const planByPrice = await findPlanByStripePriceId(db, priceId);
    if (planByPrice) patch.planId = planByPrice.id;
  }
  const period = periodOf(sub);
  if (period.start) patch.currentPeriodStart = period.start;
  if (period.end) patch.currentPeriodEnd = period.end;

  await updateSubscriptionByTenant(db, row.tenantId, patch);
}

/**
 * customer.subscription.deleted → canceled, back to the free plan with a
 * fresh UTC-month period (Ruling 7).
 */
async function handleSubscriptionDeleted(
  db: AppDb,
  event: Stripe.Event,
): Promise<void> {
  const sub = event.data.object as unknown as SubLike;
  const stripeSubscriptionId = sub.id;
  if (!stripeSubscriptionId) {
    throw new Error("customer.subscription.deleted without a subscription id");
  }

  const row = await resolveRow(db, sub, stripeSubscriptionId);
  if (!row) return;

  if (row.lastStripeEventAt !== null && event.created < row.lastStripeEventAt) {
    return;
  }

  const [freePlan] = await db
    .select()
    .from(plans)
    .where(eq(plans.code, "free"))
    .limit(1);
  if (!freePlan) throw new Error("free plan missing from the catalog");

  const bounds = utcMonthBounds();
  await updateSubscriptionByTenant(db, row.tenantId, {
    status: "canceled",
    planId: freePlan.id,
    currentPeriodStart: bounds.start,
    currentPeriodEnd: bounds.end,
    cancelAtPeriodEnd: false,
    lastStripeEventAt: event.created,
    updatedAt: new Date(),
  });
}

/**
 * Finds the local subscription row for a Stripe subscription — by its
 * Stripe id first, falling back to the tenant tag we wrote into Stripe
 * metadata at checkout time.
 */
async function resolveRow(
  db: AppDb,
  sub: SubLike,
  stripeSubscriptionId: string,
): Promise<SubscriptionRow | null> {
  const byStripeId = await findByStripeSubscriptionId(db, stripeSubscriptionId);
  if (byStripeId) return byStripeId;

  const tenantId = sub.metadata?.tenantId;
  if (!tenantId) return null;
  const current = await getCurrentSubscription(db, tenantId);
  return current?.subscription ?? null;
}
