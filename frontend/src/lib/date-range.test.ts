import { describe, expect, test } from "vitest";

import {
  formatDateRangeLabel,
  fromIsoDateString,
  toIsoDateString,
} from "./date-range";

describe("toIsoDateString", () => {
  test("formats a local date as yyyy-MM-dd", () => {
    expect(toIsoDateString(new Date(2026, 10, 11))).toBe("2026-11-11");
    expect(toIsoDateString(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("fromIsoDateString", () => {
  test("parses yyyy-MM-dd as local midnight", () => {
    const date = fromIsoDateString("2026-11-11");
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
    expect(date!.getMonth()).toBe(10);
    expect(date!.getDate()).toBe(11);
  });

  test("returns null for invalid input", () => {
    expect(fromIsoDateString("garbage")).toBeNull();
    expect(fromIsoDateString("")).toBeNull();
  });
});

describe("formatDateRangeLabel", () => {
  test("says Any time when no bounds are set", () => {
    expect(formatDateRangeLabel({ from: null, to: null })).toBe("Any time");
  });

  test("labels open-ended ranges", () => {
    expect(formatDateRangeLabel({ from: "2026-11-01", to: null })).toBe(
      "Since Nov 1, 2026",
    );
    expect(formatDateRangeLabel({ from: null, to: "2026-11-11" })).toBe(
      "Until Nov 11, 2026",
    );
  });

  test("labels a bounded range", () => {
    expect(
      formatDateRangeLabel({ from: "2026-11-01", to: "2026-11-11" }),
    ).toBe("Nov 1 – Nov 11, 2026");
  });
});
