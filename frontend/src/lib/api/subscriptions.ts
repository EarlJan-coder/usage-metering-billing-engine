import { apiFetch } from "./client";
import { asObject, pickObject, pickString } from "./normalize";

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
    cancelAtPeriodEnd: cancelAt === true,
  };
}

export const subscriptionsApi = {
  async current(): Promise<CurrentSubscription | null> {
    const payload = await apiFetch<unknown>("/subscriptions/current");
    return normalizeSubscription(payload);
  },
};
