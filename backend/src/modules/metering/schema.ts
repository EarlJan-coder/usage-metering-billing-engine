import { z } from "zod";

const nonNegInt = z
  .number()
  .int("must be an integer")
  .nonnegative("must be >= 0");

/**
 * POST /metering/track body (§5C). `.strict()` — unknown fields are a
 * 400, not silently dropped, so a typo never becomes a free event.
 */
export const trackSchema = z
  .object({
    type: z.enum(["api_call", "ai_tokens"]),
    quantity: nonNegInt.optional(),
    inputTokens: nonNegInt.optional(),
    outputTokens: nonNegInt.optional(),
    cachedInputTokens: nonNegInt.optional(),
    reasoningTokens: nonNegInt.optional(),
    model: z.string().min(1).max(200).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.type === "ai_tokens") {
      const hasTokens =
        value.inputTokens !== undefined ||
        value.outputTokens !== undefined ||
        value.cachedInputTokens !== undefined;
      if (!hasTokens) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["inputTokens"],
          message: "ai_tokens requires at least one token field",
        });
      }
      // cached input is a SUBSET of input (Ruling 4) — a cached-only
      // payload would otherwise meter quantity 0 while still costing
      // money (review #8)
      if (value.cachedInputTokens !== undefined) {
        if (
          value.inputTokens === undefined ||
          value.cachedInputTokens > value.inputTokens
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["cachedInputTokens"],
            message: "cachedInputTokens must be a subset of inputTokens",
          });
        }
      }
    }
    // api_call with no quantity defaults to 1 in the service.
  });

export type TrackInput = z.infer<typeof trackSchema>;
