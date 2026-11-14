/**
 * Cost calculation engine (backend-plan §5E) — PURE and versioned.
 *
 * Exact arithmetic only: every value is a BigInt, every rate an integer
 * minor unit, rounding half-up per million tokens. No floats anywhere.
 */
import {
  DEFAULT_RATES,
  MODEL_RATES,
  PRICING_VERSION,
  type ModelRates,
} from "../../config/pricing.js";

export type CostInput = {
  type: "api_call" | "ai_tokens";
  quantity: bigint;
  inputTokens?: bigint;
  outputTokens?: bigint;
  cachedInputTokens?: bigint;
  reasoningTokens?: bigint;
  model?: string;
};

export type CostResult = {
  costMinor: bigint;
  pricingVersion: number;
  rateTable: Record<string, number>;
};

const ONE_MILLION = 1_000_000n;
/** Half-up rounding constant for integer division by 1M. */
const ROUND_HALF_UP = 500_000n;

function ratesFor(model: string | undefined): ModelRates {
  if (model && MODEL_RATES[model]) return MODEL_RATES[model]!;
  return DEFAULT_RATES;
}

/** (tokens * rateMinor, half-up) → minor units. */
function price(tokens: bigint, rateMinor: number): bigint {
  if (tokens <= 0n || rateMinor === 0) return 0n;
  return (tokens * BigInt(rateMinor) + ROUND_HALF_UP) / ONE_MILLION;
}

/**
 * Computes the exact cost of one usage event.
 *
 * - `api_call`: quantity × per-call rate.
 * - `ai_tokens`: uncapped input at input rate, cached input at cached
 *   rate, output at output rate. `reasoningTokens` are a SUBSET of output
 *   and are never priced again (Ruling 10). `cachedInputTokens` beyond
 *   `inputTokens` clamps the billable input at zero — never negative.
 */
export function calculateCost(input: CostInput): CostResult {
  const rates = ratesFor(input.model);
  let costMinor: bigint;

  if (input.type === "api_call") {
    const quantity = input.quantity > 0n ? input.quantity : 0n;
    costMinor = quantity * BigInt(rates.apiCallPerCallMinor);
  } else {
    const inputTokens = input.inputTokens ?? 0n;
    const cachedInput = input.cachedInputTokens ?? 0n;
    const output = input.outputTokens ?? 0n;
    // Ruling 10: reasoning is informational only — excluded from pricing.

    const billableInput = inputTokens > cachedInput ? inputTokens - cachedInput : 0n;

    costMinor =
      price(billableInput, rates.inputPerMillionMinor) +
      price(cachedInput, rates.cachedInputPerMillionMinor) +
      price(output, rates.outputPerMillionMinor);
  }

  return {
    costMinor,
    pricingVersion: PRICING_VERSION,
    rateTable: { ...MODEL_RATES } as unknown as Record<string, number>,
  };
}
