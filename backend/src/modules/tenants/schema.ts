import { z } from "zod";

export const createTenantSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(100),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
