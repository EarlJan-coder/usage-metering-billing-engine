import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(100),
  email: z.string().trim().toLowerCase().email("invalid email").max(254),
  password: z.string().min(8, "password must be at least 8 characters").max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("invalid email").max(254),
  password: z.string().min(1, "password is required").max(200),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("invalid email").max(254),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
