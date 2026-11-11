import { describe, expect, test } from "vitest";

import { forgotPasswordSchema, loginSchema, registerSchema } from "./auth";

describe("loginSchema", () => {
  test("accepts valid credentials", () => {
    const result = loginSchema.safeParse({
      email: "ada@example.com",
      password: "secret123",
    });
    expect(result.success).toBe(true);
  });

  test("rejects a malformed email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "secret123",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(["email"]);
  });

  test("requires a password", () => {
    const result = loginSchema.safeParse({
      email: "ada@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(["password"]);
  });
});

describe("registerSchema", () => {
  const valid = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    password: "supersecret1",
    confirmPassword: "supersecret1",
  };

  test("accepts a complete registration", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  test("rejects passwords shorter than 8 characters", () => {
    const result = registerSchema.safeParse({
      ...valid,
      password: "short",
      confirmPassword: "short",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(["password"]);
  });

  test("rejects mismatched password confirmation", () => {
    const result = registerSchema.safeParse({
      ...valid,
      confirmPassword: "different1",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(["confirmPassword"]);
    expect(result.error.issues[0]?.message).toMatch(/match/i);
  });

  test("requires a name of at least 2 characters", () => {
    const result = registerSchema.safeParse({ ...valid, name: "A" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(["name"]);
  });
});

describe("forgotPasswordSchema", () => {
  test("accepts a valid email", () => {
    expect(
      forgotPasswordSchema.safeParse({ email: "ada@example.com" }).success,
    ).toBe(true);
  });

  test("rejects an invalid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(
      false,
    );
  });
});
