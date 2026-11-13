import { describe, expect, test } from "vitest";

import { escapeCsvValue, toCsv } from "./csv";

describe("escapeCsvValue", () => {
  test("passes through plain strings and numbers", () => {
    expect(escapeCsvValue("hello")).toBe("hello");
    expect(escapeCsvValue(42)).toBe("42");
    expect(escapeCsvValue(0)).toBe("0");
  });

  test("renders null and undefined as empty fields", () => {
    expect(escapeCsvValue(null)).toBe("");
    expect(escapeCsvValue(undefined)).toBe("");
  });

  test("quotes embedded commas, newlines, and doubles quotes", () => {
    expect(escapeCsvValue("a,b")).toBe('"a,b"');
    expect(escapeCsvValue("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
  });
});

describe("toCsv", () => {
  test("joins headers and rows with newlines", () => {
    const csv = toCsv(["Name", "Cost"], [["production", 45]]);
    expect(csv).toBe("Name,Cost\nproduction,45");
  });

  test("renders a header-only file when there are no rows", () => {
    expect(toCsv(["a", "b"], [])).toBe("a,b");
  });

  test("escapes hostile cell content", () => {
    const csv = toCsv(["note"], [['He said "go", then left']]);
    expect(csv).toBe('note\n"He said ""go"", then left"');
  });
});

describe("spreadsheet formula injection guard (OWASP CSV injection)", () => {
  test("prefixes string cells that begin with =, +, -, or @", () => {
    expect(escapeCsvValue("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(escapeCsvValue("+1+1")).toBe("'+1+1");
    expect(escapeCsvValue("@cmd")).toBe("'@cmd");
    expect(escapeCsvValue("-2+3")).toBe("'-2+3");
  });

  test("leaves numeric cells and safe strings untouched", () => {
    expect(escapeCsvValue(-42)).toBe("-42");
    expect(escapeCsvValue(1.5)).toBe("1.5");
    expect(escapeCsvValue("production")).toBe("production");
  });

  test("applies the guard through toCsv", () => {
    expect(toCsv(["note"], [["=1+1"]])).toBe("note\n'=1+1");
  });
});
