import { z } from "zod";

/** New API key form schema (frontend-plan §6F — key creation). */
export const createApiKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the key a name so you can recognize it later")
    .max(100, "Name must be 100 characters or fewer"),
});

export type CreateApiKeyValues = z.infer<typeof createApiKeySchema>;
