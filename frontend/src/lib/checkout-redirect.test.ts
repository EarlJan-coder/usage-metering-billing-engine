import { afterEach, describe, expect, test, vi } from "vitest";

import { isSafeCheckoutUrl, navigateToCheckout } from "./checkout-redirect";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isSafeCheckoutUrl", () => {
  test("accepts https and http URLs", () => {
    expect(isSafeCheckoutUrl("https://checkout.stripe.com/pay/cs_test_1")).toBe(
      true,
    );
    expect(isSafeCheckoutUrl("http://localhost:3000/billing?checkout=ok")).toBe(
      true,
    );
  });

  test("rejects non-http schemes and malformed values", () => {
    expect(isSafeCheckoutUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeCheckoutUrl("data:text/html,x")).toBe(false);
    expect(isSafeCheckoutUrl("not a url")).toBe(false);
    expect(isSafeCheckoutUrl("")).toBe(false);
    expect(isSafeCheckoutUrl(null)).toBe(false);
    expect(isSafeCheckoutUrl(undefined)).toBe(false);
  });
});

describe("navigateToCheckout", () => {
  test("assigns the window location for a safe URL", () => {
    const assign = vi.fn();

    expect(
      navigateToCheckout(
        "https://checkout.stripe.com/pay/cs_test_1",
        assign,
      ),
    ).toBe(true);
    expect(assign).toHaveBeenCalledWith(
      "https://checkout.stripe.com/pay/cs_test_1",
    );
  });

  test("refuses unsafe URLs without navigating", () => {
    const assign = vi.fn();

    expect(navigateToCheckout("javascript:alert(1)", assign)).toBe(false);
    expect(navigateToCheckout(123, assign)).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });
});
