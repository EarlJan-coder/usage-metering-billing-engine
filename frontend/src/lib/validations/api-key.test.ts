import { describe, expect, test } from "vitest";

import { createApiKeySchema } from "./api-key";

describe("createApiKeySchema", () => {
  test("accepts a normal key name", () => {
    expect(
      createApiKeySchema.safeParse({ name: "production" }).success,
    ).toBe(true);
  });

  test("trims surrounding whitespace", () => {
    const result = createApiKeySchema.safeParse({ name: "  staging  " });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.name).toBe("staging");
  });

  test("requires a non-empty name", () => {
    const result = createApiKeySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(["name"]);
  });

  test("rejects names longer than 100 characters", () => {
    const result = createApiKeySchema.safeParse({ name: "x".repeat(101) });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(["name"]);
  });
});
