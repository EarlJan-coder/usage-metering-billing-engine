import { apiFetch } from "./client";
import { asObject, pickBooleanLike, pickObject, pickString } from "./normalize";

/**
 * Subscription endpoint (backend-plan §6: GET /subscriptions/current).
 * Status strings are passed through untouched for StatusBadge tone mapping.
 */

export type CurrentSubscription = {
  planName: string;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export function normalizeSubscription(
  payload: unknown,
): CurrentSubscription | null {
  const root = asObject(payload);
  if (!root) return null;

  const plan = pickObject(root, "plan", "subscription");
  const planName =
    (plan ? pickString(plan, "name", "planName", "code") : null) ??
    pickString(root, "planName", "plan_name", "plan");
  if (!planName) return null;

  const cancelAt =
    root.cancelAtPeriodEnd ?? root.cancel_at_period_end ?? false;
  return {
    planName,
    status: pickString(root, "status") ?? "unknown",
    periodStart:
      pickString(
        root,
        "currentPeriodStart",
        "current_period_start",
        "periodStart",
      ) ?? null,
    periodEnd:
      pickString(root, "currentPeriodEnd", "current_period_end", "periodEnd") ??
      null,
    cancelAtPeriodEnd: pickBooleanLike(cancelAt),
  };
}

export const subscriptionsApi = {
  async current(): Promise<CurrentSubscription | null> {
    const payload = await apiFetch<unknown>("/subscriptions/current");
    return normalizeSubscription(payload);
  },

  /**
   * Starts Stripe Checkout through the backend (backend-plan §6:
   * POST /subscriptions/checkout). Returns the hosted-page URL to redirect
   * to; null when the backend omits it. The redirect proves nothing —
   * subscription state only changes via verified webhooks (§5G).
   */
  async checkout(input: { planId: string }): Promise<{ url: string | null }> {
    const payload = await apiFetch<unknown>("/subscriptions/checkout", {
      method: "POST",
      body: { planId: input.planId },
    });
    const root = asObject(payload);
    if (!root) return { url: null };
    const session = pickObject(root, "session", "checkoutSession", "data");
    const url =
      pickString(root, "url", "checkoutUrl", "checkout_url") ??
      (session ? pickString(session, "url", "checkoutUrl") : null);
    return { url };
  },

  /**
   * Cancels the current subscription (backend-plan §6: POST
   * /subscriptions/cancel). Returns the updated subscription when the
   * backend echoes it, else null — callers refetch /subscriptions/current.
   */
  async cancel(): Promise<CurrentSubscription | null> {
    const payload = await apiFetch<unknown>("/subscriptions/cancel", {
      method: "POST",
    });
    return normalizeSubscription(payload);
  },
};
