import Stripe from "stripe";

/**
 * Stripe client factory (backend-plan §5G). Returns null when
 * STRIPE_SECRET_KEY is absent so callers can answer 503
 * `stripe_not_configured` instead of crashing at boot. A fresh client per
 * call keeps tests free of shared mutable state.
 */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}
