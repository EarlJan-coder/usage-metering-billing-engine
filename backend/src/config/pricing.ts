/**
 * Pricing constants (backend-plan §5E: pricing lives in configuration,
 * versions are stored for historical calculations). The cost calculator
 * (Task 6) consumes these; seed.ts stores version 1 from the same source.
 *
 * Rates are integer minor units (USD cents) per 1,000,000 tokens, or per
 * call — never floats (backend-plan §4).
 */
export const PRICING_VERSION = 1;

export type ModelRates = {
  inputPerMillionMinor: number;
  outputPerMillionMinor: number;
  cachedInputPerMillionMinor: number;
  apiCallPerCallMinor: number;
};

export const DEFAULT_RATES: ModelRates = {
  inputPerMillionMinor: 150,
  outputPerMillionMinor: 600,
  cachedInputPerMillionMinor: 30,
  apiCallPerCallMinor: 0,
};

/** Model name → rates; "default" catches every other model. */
export const MODEL_RATES: Record<string, ModelRates> = {
  default: DEFAULT_RATES,
};

export function ratesForModel(model: string | null | undefined): ModelRates {
  if (model && MODEL_RATES[model]) return MODEL_RATES[model]!;
  return DEFAULT_RATES;
}
