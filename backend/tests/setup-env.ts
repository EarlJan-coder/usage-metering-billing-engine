/**
 * Vitest per-worker environment. Every test process gets a strict,
 * deterministic env before any src module is imported.
 */
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET ??= "test-session-secret-0123456789";
process.env.TEST_DATABASE_URL ??=
  "postgres://billing:billing@localhost:5433/billing_test";
process.env.LOG_LEVEL ??= "silent";
