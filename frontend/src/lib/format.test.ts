import { describe, expect, test } from "vitest";
import {
  formatCompactNumber,
  formatCurrency,
  formatDateTime,
  formatNumber,
  maskApiKey,
} from "./format";

describe("formatCurrency", () => {
  test("converts integer minor units to a dollar string", () => {
    expect(formatCurrency(123456)).toBe("$1,234.56");
  });

  test("formats zero and sub-dollar amounts", () => {
    expect(formatCurrency(0)).toBe("$0.00");
    expect(formatCurrency(5)).toBe("$0.05");
  });

  test("supports other currencies via ISO code", () => {
    expect(formatCurrency(100000, "EUR")).toBe("€1,000.00");
  });

  test("rounds fractional minor units half-up", () => {
    expect(formatCurrency(10.6)).toBe("$0.11");
  });
});

describe("formatNumber", () => {
  test("groups thousands", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  test("returns '0' for zero", () => {
    expect(formatNumber(0)).toBe("0");
  });
});

describe("formatCompactNumber", () => {
  test("compacts large numbers", () => {
    expect(formatCompactNumber(1500)).toBe("1.5K");
    expect(formatCompactNumber(2_500_000)).toBe("2.5M");
  });

  test("leaves small numbers alone", () => {
    expect(formatCompactNumber(999)).toBe("999");
  });
});

describe("formatDateTime", () => {
  test("formats an ISO timestamp as a readable date and time", () => {
    expect(formatDateTime("2026-11-11T14:30:00.000Z")).toBe(
      "Nov 11, 2026, 14:30",
    );
  });

  test("returns a placeholder for missing values", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateTime("")).toBe("—");
  });
});

describe("maskApiKey", () => {
  test("hides everything after the prefix and last four characters", () => {
    expect(maskApiKey("umk_live_abcdefgh12345678")).toBe(
      "umk_live_abc…5678",
    );
  });

  test("masks short keys entirely except a leading prefix", () => {
    expect(maskApiKey("short")).toBe("sho…rt");
  });
});

describe("formatCurrency resilience (malformed backend codes)", () => {
  test("does not throw on an invalid currency code", () => {
    expect(() => formatCurrency(1234, "usdd")).not.toThrow();
    expect(() => formatCurrency(1234, "")).not.toThrow();
  });

  test("falls back to plain decimal formatting", () => {
    expect(formatCurrency(1234, "usdd")).toBe("12.34");
    expect(formatCurrency(1234, "")).toBe("12.34");
  });
});
