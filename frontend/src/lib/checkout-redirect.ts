/**
 * Safe redirect to the Stripe-hosted Checkout page.
 *
 * The URL comes from the backend (POST /subscriptions/checkout), but only
 * http(s) targets are ever assigned — a `javascript:` or `data:` payload
 * from a compromised response must not execute. Navigating there says
 * nothing about payment: subscription state changes only when the backend's
 * verified webhook lands (backend-plan §5G).
 */

export function isSafeCheckoutUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.trim() === "") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
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
