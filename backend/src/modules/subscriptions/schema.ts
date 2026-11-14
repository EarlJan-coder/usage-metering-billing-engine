import { z } from "zod";

export const checkoutSchema = z.object({
  /** Plan UUID or plan code — both resolve (Task 4 plan lookup). */
  planId: z.string().trim().min(1, "planId is required").max(200),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
