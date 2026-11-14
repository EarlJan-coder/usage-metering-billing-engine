import { z } from "zod";

/**
 * Strict environment loader (backend-plan §3 Phase 1). Every runtime that
 * needs configuration (server, migrations, worker) validates through here
 * so a missing variable fails fast with the variable's NAME in the error.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(8, "SESSION_SECRET must be at least 8 chars"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:3000"),
  LOG_LEVEL: z.string().default("info"),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_SUCCESS_URL: z.string().min(1).optional(),
  STRIPE_CANCEL_URL: z.string().min(1).optional(),
  TEST_DATABASE_URL: z.string().min(1).optional(),
});

export type Config = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  sessionSecret: string;
  corsOrigin: string;
  logLevel: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  stripeSuccessUrl?: string;
  stripeCancelUrl?: string;
  testDatabaseUrl?: string;
};

export class ConfigError extends Error {
  constructor(issues: string[]) {
    super(`Invalid environment: ${issues.join("; ")}`);
    this.name = "ConfigError";
  }
}

/** Validates `env` (defaults to process.env) into a typed Config. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
    throw new ConfigError(issues);
  }
  const raw = parsed.data;
  const config: Config = {
    nodeEnv: raw.NODE_ENV,
    port: raw.PORT,
    databaseUrl: raw.DATABASE_URL,
    sessionSecret: raw.SESSION_SECRET,
    corsOrigin: raw.CORS_ORIGIN,
    logLevel: raw.LOG_LEVEL,
  };
  if (raw.STRIPE_SECRET_KEY !== undefined)
    config.stripeSecretKey = raw.STRIPE_SECRET_KEY;
  if (raw.STRIPE_WEBHOOK_SECRET !== undefined)
    config.stripeWebhookSecret = raw.STRIPE_WEBHOOK_SECRET;
  if (raw.STRIPE_SUCCESS_URL !== undefined)
    config.stripeSuccessUrl = raw.STRIPE_SUCCESS_URL;
  if (raw.STRIPE_CANCEL_URL !== undefined)
    config.stripeCancelUrl = raw.STRIPE_CANCEL_URL;
  if (raw.TEST_DATABASE_URL !== undefined)
    config.testDatabaseUrl = raw.TEST_DATABASE_URL;
  return config;
}
