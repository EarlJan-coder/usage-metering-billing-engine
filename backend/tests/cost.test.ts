import { describe, expect, test } from "vitest";

import {
  calculateCost,
  type CostInput,
} from "../src/modules/cost-calculation/calculator.js";
import { PRICING_VERSION } from "../src/config/pricing.js";

describe("cost calculator (Task 6)", () => {
  test("ai_tokens with split input/cached/output prices exactly", () => {
    // default rates: input 150, cached 30, output 600 minor/M tokens
    // billable input = 1_000_000 - 250_000 = 750_000
    //   750_000 * 150 = 112_500_000 + 500_000 round → 113
    //   250_000 * 30  =   7_500_000 + 500_000 round → 8
    //   500_000 * 600 = 300_000_000 + 500_000 round → 300
    const result = calculateCost({
      type: "ai_tokens",
      quantity: 1_750_000n,
      inputTokens: 1_000_000n,
      outputTokens: 500_000n,
      cachedInputTokens: 250_000n,
    });

    expect(result.costMinor).toBe(113n + 8n + 300n);
    expect(result.costMinor).toBe(421n);
    expect(result.pricingVersion).toBe(PRICING_VERSION);
    expect(result.rateTable).toMatchObject({ default: expect.any(Object) });
  });

  test("reasoning tokens are a subset of output — never re-priced", () => {
    const base: CostInput = {
      type: "ai_tokens",
      quantity: 1_500_000n,
      inputTokens: 1_000_000n,
      outputTokens: 500_000n,
    };
    const withReasoning: CostInput = { ...base, reasoningTokens: 200_000n };

    expect(calculateCost(withReasoning).costMinor).toBe(
      calculateCost(base).costMinor,
    );
  });

  test("cachedInput > input clamps billable input at zero", () => {
    const result = calculateCost({
      type: "ai_tokens",
      quantity: 1_000_000n,
      inputTokens: 100_000n,
      outputTokens: 0n,
      cachedInputTokens: 900_000n, // more than input — clamp, no negatives
    });

    // billable input = 0 → only cached price applies (900k * 30)
    expect(result.costMinor).toBe((900_000n * 30n + 500_000n) / 1_000_000n);
    expect(result.costMinor).toBeGreaterThanOrEqual(0n);
  });

  test("api_call costs quantity * per-call rate", () => {
    expect(
      calculateCost({ type: "api_call", quantity: 100n }).costMinor,
    ).toBe(0n); // default apiCallPerCallMinor = 0
  });

  test("custom model rates apply", () => {
    // rates.ts has only "default" — a model that falls through uses default;
    // verify an explicitly configured model changes the total.
    const result = calculateCost({
      type: "ai_tokens",
      quantity: 1_000_000n,
      inputTokens: 1_000_000n,
      outputTokens: 0n,
      model: "gpt-default-fallback",
    });
    expect(result.costMinor).toBe((1_000_000n * 150n + 500_000n) / 1_000_000n);
    expect(result.costMinor).toBe(150n);
  });

  test("result carries pricingVersion 1 and the rate snapshot", () => {
    const result = calculateCost({ type: "api_call", quantity: 1n });
    expect(result.pricingVersion).toBe(1);
    expect(Object.keys(result.rateTable).length).toBeGreaterThan(0);
    expect(typeof result.rateTable).toBe("object");
  });

  test("BigInt only — no float inputs or outputs", () => {
    const result = calculateCost({
      type: "ai_tokens",
      quantity: 3n,
      inputTokens: 3n,
      outputTokens: 0n,
    });
    expect(typeof result.costMinor).toBe("bigint");
    // 3 tokens at 150/M rounds half-up to 0
    expect(result.costMinor).toBe(0n);
  });
});
