/**
 * Safe redirect to the Stripe-hosted Checkout page.
 *
 * The URL comes from the backend (POST /subscriptions/checkout), but only
 * https targets — or plain http on local hosts (dev returns) — are ever
 * assigned: a `javascript:`/`data:` payload from a compromised response
 * must not execute, and payment URLs must not ride a plaintext downgrade.
 * Navigating there says nothing about payment: subscription state changes
 * only when the backend's verified webhook lands (backend-plan §5G).
 */

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isSafeCheckoutUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.trim() === "") return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return true;
    return parsed.protocol === "http:" && LOCAL_HOSTNAMES.has(parsed.hostname);
  } catch {
    return false;
  }
}

export type NavigateFn = (url: string) => void;

function defaultNavigate(url: string): void {
  window.location.assign(url);
}

/** Navigates to a safe checkout URL; returns false when refused. */
export function navigateToCheckout(
  url: unknown,
  navigate: NavigateFn = defaultNavigate,
): boolean {
  if (!isSafeCheckoutUrl(url)) return false;
  navigate(url);
  return true;
}
