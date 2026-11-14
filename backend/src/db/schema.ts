import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ enums */

export const tenantRoleEnum = pgEnum("tenant_role", ["admin", "member"]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "canceled",
]);

export const usageEventTypeEnum = pgEnum("usage_event_type", [
  "api_call",
  "ai_tokens",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "dead",
]);

export const apiKeyStatusEnum = pgEnum("api_key_status", ["active", "revoked"]);

export const alertSeverityEnum = pgEnum("alert_severity", [
  "info",
  "warning",
  "critical",
]);

export const alertMetricEnum = pgEnum("alert_metric", ["api_calls", "tokens"]);

export const webhookStatusEnum = pgEnum("webhook_status", [
  "received",
  "processed",
  "failed",
]);

/* --------------------------------------------------------------- helpers */

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/* ---------------------------------------------------------------- tables */

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  platformAdmin: boolean("platform_admin").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tenants = pgTable("tenants", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tenantMembers = pgTable(
  "tenant_members",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: tenantRoleEnum("role").notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tenant_members_tenant_user_unique").on(t.tenantId, t.userId)],
);

export const plans = pgTable(
  "plans",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    priceMinor: integer("price_minor").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    interval: text("interval").notNull().default("month"),
    apiCallsLimit: integer("api_calls_limit"),
    aiTokensLimit: integer("ai_tokens_limit"),
    features: jsonb("features").$type<string[]>().notNull().default([]),
    isDefault: boolean("is_default").notNull().default(false),
    stripePriceId: text("stripe_price_id"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("plans_active_idx").on(t.active)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .unique()
      .references(() => tenants.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    status: subscriptionStatusEnum("status").notNull().default("active"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    /** Unix seconds of the last Stripe event applied — out-of-order guard. */
    lastStripeEventAt: bigint("last_stripe_event_at", { mode: "number" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("subscriptions_status_idx").on(t.status)],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    type: usageEventTypeEnum("type").notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull().default(0),
    costMinor: bigint("cost_minor", { mode: "number" }).notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    pricingVersion: integer("pricing_version").notNull(),
    status: text("status").notNull().default("recorded"),
    idempotencyKey: text("idempotency_key").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("usage_events_tenant_idem_unique").on(t.tenantId, t.idempotencyKey),
    index("usage_events_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("usage_events_api_key_idx").on(t.apiKeyId),
  ],
);

export const aiTokenUsageDetails = pgTable(
  "ai_token_usage_details",
  {
    id: id(),
    usageEventId: uuid("usage_event_id")
      .notNull()
      .unique()
      .references(() => usageEvents.id, { onDelete: "cascade" }),
    inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
    outputTokens: bigint("output_tokens", { mode: "number" })
      .notNull()
      .default(0),
    cachedInputTokens: bigint("cached_input_tokens", { mode: "number" })
      .notNull()
      .default(0),
    reasoningTokens: bigint("reasoning_tokens", { mode: "number" })
      .notNull()
      .default(0),
    model: text("model"),
    createdAt: createdAt(),
  },
);

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("idempotency_records_tenant_endpoint_key_unique").on(
      t.tenantId,
      t.endpoint,
      t.idempotencyKey,
    ),
  ],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: id(),
    stripeEventId: text("stripe_event_id").notNull().unique(),
    type: text("type").notNull(),
    status: webhookStatusEnum("status").notNull().default("received"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [index("webhook_events_received_idx").on(t.receivedAt)],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    status: apiKeyStatusEnum("status").notNull().default("active"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("api_keys_prefix_idx").on(t.keyPrefix)],
);

export const backgroundJobs = pgTable(
  "background_jobs",
  {
    id: id(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: jobStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    dedupeKey: text("dedupe_key"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("background_jobs_dedupe_pending_unique")
      .on(t.dedupeKey)
      .where(sql`status in ('pending', 'processing')`),
    index("background_jobs_status_run_idx").on(t.status, t.runAt),
  ],
);

export const usageAlerts = pgTable(
  "usage_alerts",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    metric: alertMetricEnum("metric").notNull(),
    threshold: integer("threshold").notNull(),
    severity: alertSeverityEnum("severity").notNull().default("warning"),
    message: text("message").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("usage_alerts_tenant_metric_threshold_period_unique").on(
      t.tenantId,
      t.metric,
      t.threshold,
      t.periodStart,
    ),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const pricingVersions = pgTable(
  "pricing_versions",
  {
    id: id(),
    version: integer("version").notNull().unique(),
    rates: jsonb("rates").$type<Record<string, number>>().notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    note: text("note"),
  },
);

export const usageMonthlyRollups = pgTable(
  "usage_monthly_rollups",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    apiCalls: bigint("api_calls", { mode: "number" }).notNull().default(0),
    tokens: bigint("tokens", { mode: "number" }).notNull().default(0),
    costMinor: bigint("cost_minor", { mode: "number" }).notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("usage_monthly_rollups_tenant_period_unique").on(
      t.tenantId,
      t.periodStart,
    ),
  ],
);
