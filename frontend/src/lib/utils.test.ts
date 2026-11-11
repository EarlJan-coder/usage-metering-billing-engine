import { describe, expect, test } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  test("merges class names with later values winning", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  test("excludes falsy values", () => {
    expect(cn("p-2", false && "hidden", undefined, null)).toBe("p-2");
  });
});
