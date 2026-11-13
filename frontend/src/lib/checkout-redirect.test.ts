import { afterEach, describe, expect, test, vi } from "vitest";

import { isSafeCheckoutUrl, navigateToCheckout } from "./checkout-redirect";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isSafeCheckoutUrl", () => {
  test("accepts https URLs and http only for local hosts", () => {
    expect(isSafeCheckoutUrl("https://checkout.stripe.com/pay/cs_test_1")).toBe(
      true,
    );
    expect(isSafeCheckoutUrl("http://localhost:3000/billing?checkout=ok")).toBe(
      true,
    );
    expect(isSafeCheckoutUrl("http://127.0.0.1:3000/return")).toBe(true);
  });

  test("rejects plaintext http to non-local hosts (no downgrade)", () => {
    expect(isSafeCheckoutUrl("http://evil.com/steal")).toBe(false);
    expect(isSafeCheckoutUrl("http://192.168.1.10/steal")).toBe(false);
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
