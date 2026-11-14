/**
 * Application table names in TRUNCATE-safe order (single TRUNCATE with
 * CASCADE accepts any order; listed alphabetically for readability).
 * Used by tests/helpers/db.ts resetDb().
 */
export const TABLES = [
  "ai_token_usage_details",
  "api_keys",
  "background_jobs",
  "idempotency_records",
  "plans",
  "pricing_versions",
  "sessions",
  "subscriptions",
  "tenant_members",
  "tenants",
  "usage_alerts",
  "usage_events",
  "usage_monthly_rollups",
  "users",
  "webhook_events",
] as const;
