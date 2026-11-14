/**
 * Canonical error-code registry (backend-plan §6). Every `error.code` the
 * API can return is listed here; `docs/API.md` documents each one and
 * `tests/docs.test.ts` keeps the two in lockstep.
 */
export const ERROR_CODES = [
  "bad_request",
  "validation_error",
  "invalid_plan",
  "invalid_subscription",
  "idempotency_key_required",
  "invalid_signature",
  "unauthorized",
  "invalid_credentials",
  "invalid_api_key",
  "forbidden",
  "bad_origin",
  "not_found",
  "email_taken",
  "payment_required",
  "quota_exceeded",
  "rate_limited",
  "stripe_error",
  "stripe_not_configured",
  "not_implemented",
  "internal_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
