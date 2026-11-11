import { apiFetch } from "./client";
import {
  asObject,
  pickArray,
  pickBooleanLike,
  pickNumber,
  pickObject,
  pickString,
} from "./normalize";

/**
 * Plan catalog endpoint (backend-plan §6: GET /plans, §5B: Free seeded at
 * 1,000 calls / 100,000 tokens, Pro configurable).
 *
 * Plans are configuration served by the backend — limits and prices are
 * rendered exactly as reported, never hardcoded or recomputed here.
 */

export type Plan = {
  id: string;
  name: string;
  description: string | null;
  /** Price in integer minor units per interval (backend-plan §4). */
  priceMinor: number;
  currency: string;
  /** Billing interval label, e.g. "month". */
  interval: string;
  callsLimit: number | null;
  tokensLimit: number | null;
  features: string[];
  isDefault: boolean;
};

function normalizeFeatures(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const features: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim()) {
      features.push(entry.trim());
    } else {
      const record = asObject(entry);
      const label = record ? pickString(record, "label", "name", "text") : null;
      if (label) features.push(label);
    }
  }
  return features;
}

export function normalizePlan(payload: unknown): Plan | null {
  const record = asObject(payload);
  if (!record) return null;

  const id = pickString(record, "id", "planId", "plan_id", "code");
  const name = pickString(record, "name", "planName", "plan_name", "title");
  if (!id || !name) return null;

  const limits = pickObject(record, "limits", "quotas", "quota");
  const callsLimit =
    (limits ? pickNumber(limits, "apiCalls", "api_calls", "calls") : null) ??
    pickNumber(record, "callsLimit", "apiCallLimit", "api_call_limit") ??
    null;
  const tokensLimit =
    (limits ? pickNumber(limits, "tokens", "aiTokens", "ai_tokens") : null) ??
    pickNumber(record, "tokensLimit", "tokenLimit", "token_limit") ??
    null;

  const rawIsDefault =
    record.isDefault ?? record.is_default ?? record.isFree ?? record.is_free;

  return {
    id,
    name,
    description:
      pickString(record, "description", "tagline", "summary") ?? null,
    priceMinor:
      pickNumber(record, "priceMinor", "price_minor", "price", "amount") ?? 0,
    currency: pickString(record, "currency") ?? "USD",
    interval:
      pickString(record, "interval", "billingInterval", "billing_interval") ??
      "month",
    callsLimit,
    tokensLimit,
    features: normalizeFeatures(
      pickArray(record, "features", "highlights", "bullets") ?? record.features,
    ),
    isDefault: pickBooleanLike(rawIsDefault),
  };
}

export function normalizePlans(payload: unknown): Plan[] {
  const list = Array.isArray(payload)
    ? payload
    : pickArray(asObject(payload) ?? {}, "items", "plans", "data");
  if (!list) return [];
  const plans: Plan[] = [];
  for (const entry of list) {
    const plan = normalizePlan(entry);
    if (plan) plans.push(plan);
  }
  return plans;
}

export const plansApi = {
  async list(): Promise<Plan[]> {
    const payload = await apiFetch<unknown>("/plans");
    return normalizePlans(payload);
  },
};
