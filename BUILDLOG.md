# BUILDLOG — Usage Metering & Billing Engine

Build narrative for the backend (Tasks 1–13 of
`docs/superpowers/plans/2026-11-14-backend-usage-metering.md`). Every task
followed the same loop: branch → failing tests (TDD red) → implement →
green + typecheck + build → merge `--no-ff` to `main` → push. Test counts
are from the real suite at each merge.

## Phase 1 — Scaffold

Express 5 + TypeScript (NodeNext, strict), pino logging, helmet, CORS,
cookie-parser, Zod, error envelope `{ error: { message, code } }`, Docker
Postgres on host port **5433** (5432 already occupied locally). Env
validation fails fast naming the missing variable.
**4 tests.**

## Phase 2 — Schema & migrations

15 tables / 8 enums via Drizzle: users, tenants, tenant_members, plans,
subscriptions, api_keys, usage_events, ai_token_usage_details,
idempotency_records, usage_alerts, usage_monthly_rollups, jobs,
webhook_events, sessions, pricing_versions. Drizzle-kit migration +
idempotent seed (plans, pricing version, demo admin).
**11 tests** (uniqueness, FK integrity, seed idempotency).

Gotcha fixed here: the migrator stores its journal in a `drizzle` schema —
test setup must drop that schema too or the second run skips every
statement. Also: Drizzle wraps pg errors, SQLSTATE lives on `err.cause`.

## Phase 3 — Auth & security middleware

Cookie sessions (`sid`, raw token never stored — sha256 + secret),
bcrypt(10) passwords, register/login/logout/me, CSRF origin guard for
cookie-authenticated writes, global (300/min) and auth (10/15min) rate
limits, Zod validation middleware. `/auth/forgot-password` is an honest
`501` stub — there is no mail transport.
**25 tests** (enumeration-safe login, session revocation, origin checks,
rate-limit behaviour, helmet headers).

## Phase 4 — Tenants & plans

Tenant list/detail scoped to membership (foreign tenant id → `404`, same
body as missing — IDOR-safe), workspace creation with admin membership +
free subscription in one transaction. `GET /plans` is public (Ruling 5) —
the pricing page renders before login.
**36 tests.**

## Phase 5 — API keys

`umk_` + 40 hex chars (160 bits), sha256 at rest, plaintext returned once,
soft revoke. `authenticateApiKey` accepts the full `Authorization: Bearer`
header or a bare key and stamps `lastUsedAt`.
**45 tests.**

## Phase 6 — Cost engine

Pure, versioned calculator: BigInt only, integer minor-unit rates,
half-up rounding per million tokens. Input priced minus cached input,
cached input at the cached rate, output at the output rate. Reasoning
tokens are a subset of output and are never re-priced (Ruling 10). Cached
input beyond input clamps billable input at zero.
**52 tests.**

## Phase 7 — Idempotent metering

`POST /metering/track` (API-key auth only). One transaction: claim the
(idempotency key) slot with `ON CONFLICT DO NOTHING` → lock the
subscription `FOR UPDATE` → price → insert event (+ token detail row) →
store the response. Concurrent duplicates block on the unique index and
replay the original result; same key + different body replays the
original too. `ai_tokens` quantity = input + output (cached is a subset).
**62 tests**, including 5-way concurrency races.

## Phase 8 — Quota enforcement

`checkQuota` runs under the same subscription lock: exact boundary
(`used + incoming <= limit` passes), `null` limit = unlimited, lazy
UTC-month period roll for free/canceled subscriptions (Ruling 7),
`past_due`/`unpaid` → `402 payment_required`, over-limit → `429
quota_exceeded` with `Retry-After` and `{ scope, used, limit }`. A
rejected track writes nothing — the rollback frees the idempotency slot
so a later retry can succeed.
**74 tests** including a 10-way boundary race (exactly 1 accepted).

## Phase 9 — Stripe checkout & webhooks (test mode)

Checkout creates/reuses one Stripe customer per tenant and starts a
subscription session (price id or `price_data` fallback). Cancel is a
state change we make (`cancel_at_period_end`), not a redirect. Webhooks:
`express.raw` mounted before the JSON parser, `constructEvent` over the
exact bytes, per-event-id dedupe in `webhook_events` (retries of failed
events take the row over), out-of-order guard via `lastStripeEventAt`,
`customer.subscription.deleted` reverts to the free plan. Verified by
signing real payloads with Stripe's own test-header helper.
**88 tests.**

Gotcha fixed here: supertest JSON-serializes Buffer bodies — webhook
fixtures must be sent as strings or the signature covers `{"type":"Buffer"…}`.

## Phase 10 — Background jobs

Postgres-backed queue: `enqueueJob` with partial-unique dedupe keys,
`runOnce` claiming `FOR UPDATE SKIP LOCKED`, exponential backoff
(5s · 2^(n−1)), `dead` status + `lastError` after `maxAttempts`, interval
worker in `server.ts`. Handlers: usage alerts (80% warning / 100%
critical, deduped by unique index), monthly rollups (idempotent
recompute of the previous month), Stripe reconciliation (same sync
function as webhooks). Metering arms the alerts job per tenant-period.
**97 tests.**

## Phase 11 — Analytics, billing, admin

`/usage/summary` (totals + zero-filled daily series + quota + alerts),
`/usage` (ranged series with weekly/monthly granularity, by-API-key and
by-model breakdowns), `/usage/history` (pagination, search over model and
key name, day filters, asc/desc), `/billing/summary` (period bounds +
in-period cost), `/admin/*` (platform-admin gated: tenant list with plan
and member counts, platform metrics with job snapshot where `failed`
includes `dead`, webhook delivery state). Responses match the frontend
normalizer contracts field-for-field.
**116 tests.**

## Phase 12 — Docs & deliverables

`docs/API.md` covering all 25 routes with request/response shapes, curl
examples, and the full error-code table. `src/codes.ts` is the canonical
code registry; `listRoutes()` walks the live Express router (mount paths
captured at `use()` time) so `docs.test.ts` proves docs ↔ routes in both
directions, docs ↔ codes in both directions, and that `capstone.yaml`
lists only real endpoints.

## Phase 13 — Hardening & acceptance

Cross-tenant isolation matrix, webhook replay/concurrency races,
metering→quota→cost→analytics end-to-end, frontend contract suite kept
green.

## Whole-branch code review & fix pass

A fresh reviewer examined the full `c97dda7..9d1befe` range (98 files) in
seven passes and verified the claims by running the suites. Verdict:
"With fixes". Both Criticals and all nine Importants were fixed on
`fix/backend-review-findings` with regression tests:

- **Critical — quota failed open**: a tenant without a subscription row
  metered unlimited. Now fails CLOSED to the free plan's limits (and
  registration refuses to create tenants when no free plan is seeded);
  a per-tenant advisory lock closes the no-row serialization gap.
- **Critical — stale paid period disabled quota**: a lost renewal
  webhook left the usage window in the past, so usage summed to zero.
  Any elapsed period now rolls forward inside the lock.
- Important: `monthly_rollup`/`stripe_reconcile` are now actually
  scheduled (hourly / monthly, dedupe-armed); checkout webhook events
  obey the out-of-order guard; `incomplete` maps to `past_due` (never
  paid quota before payment); failed-webhook retries claim atomically;
  jobs stuck in `processing` are recovered after a visibility timeout;
  cached input must be a subset of input tokens; the seed's demo
  credentials are refused under `NODE_ENV=production`; session hashing
  no longer has a fallback secret; `trust proxy` keeps rate limiting
  honest behind one proxy hop.
- Minor taken: concurrent-register duplicate race now answers `409`,
  origin check applied consistently to all cookie-authenticated writes,
  plan limit `0` no longer treated as unlimited for alerts, dead
  dynamic imports removed, `.env.example`/README/EVIDENCE refreshed.

## Key rulings (from the design ledger)

1. Cookie sessions (`sid`, sha256-hashed) for dashboard auth; API-key
   bearer only on `/metering/track` — a browser can never report usage.
2. One subscription row per tenant; free plans roll their period lazily
   to the current UTC month inside the quota path.
3. Idempotency-key reuse with a different body replays the ORIGINAL
   result (never a 409) — the first request owns the key.
4. Money is integer minor units everywhere; BigInt half-up rounding.
   Reasoning tokens ⊂ output tokens, never re-priced. Cached input ⊂ input.
5. `GET /plans` is public; everything else is session- or key-scoped.
6. `/auth/forgot-password` is a `501` stub — no mail transport exists.
7. `canceled` subscriptions fall back to free-plan limits; webhooks keep
   status truthful.
8. Platform admin = `users.platform_admin` flag; tenant admin ≠ platform
   admin.
9. `/billing/invoices` omitted (no invoice data source in test mode).
10. `createApp(db)` takes an injected db handle so tests and server share
    one factory.
11. `authenticateApiKey` accepts the full Bearer header or a bare key and
    touches `lastUsedAt` synchronously.
12. Error envelope `{ error: { message, code } }`; 429s carry
    `Retry-After` (default 60) and quota details.
13. Postgres on host port 5433 to coexist with a local 5432 instance.
