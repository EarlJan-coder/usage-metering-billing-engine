# Backend Usage Metering & Billing Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the multi-tenant Usage Metering & Billing Engine REST API (backend-plan.md) — metering with idempotency, quota enforcement, versioned cost calculation, Stripe test-mode sync via verified webhooks, background jobs, and full API docs.

**Architecture:** Modular monolith in `backend/` (Express + TypeScript), PostgreSQL via Drizzle ORM, cookie-session auth, API-key auth for the metering endpoint, PostgreSQL-backed job queue with `FOR UPDATE SKIP LOCKED` claiming. The frontend (`frontend/src/lib/api/*`) already exists and is the contract consumer: response shapes must satisfy its normalizers (canonical camelCase; list endpoints return `{ items }`).

**Tech Stack:** Node 22, TypeScript strict, Express 4, PostgreSQL 16 (Docker), Drizzle ORM + drizzle-kit, Zod, Stripe SDK (test mode), bcryptjs, pino, Vitest + Supertest.

**Spec:** `backend-plan.md` (requirements; authority for behavior)
**Contract consumer:** `frontend/src/lib/api/*` + `frontend/src/lib/api-contract.test.ts` (authority for paths/methods/shapes)

## Global Constraints

- UUID primary keys; timestamps `timestamptz` UTC; money = integer minor units (USD), never floats.
- API prefix `/api/v1`; backend port `4000` (frontend default `http://localhost:4000/api/v1`).
- Error envelope on every non-2xx: `{ "error": { "message": string, "code": string } }` (frontend `client.ts` reads this).
- Response keys camelCase; list endpoints return `{ "items": [...] }`; `/usage/history` returns `{ "items": [...], "total": number }`.
- Plan limits/limits come from the `plans` table — never hardcoded in application logic.
- Tenant scoping: tenant id comes only from the session or API key, never from client body/query.
- Never activate a subscription from a success redirect — only verified Stripe webhooks change subscription state.
- Every billable `POST /metering/track` requires an `Idempotency-Key` header; duplicates return the original stored result, never a second event.
- Quota overage → HTTP 429; payment/subscription restriction → HTTP 402.
- Plaintext API key returned exactly once (POST /api-keys); stored only as a hash.
- Stripe test mode only; no secrets committed; `.env.example` is the only env template.
- TDD: write the failing test first, watch it fail, implement, watch it pass — every task. Exception: pure config/scaffolding files (package.json, tsconfig, Dockerfile) verified by the task's behavior test.
- Git workflow (established repo norm, frontend Ruling 1): branch per task, never commit to `main` directly, merge `--no-ff` to `main` after the task's tests pass, push branch + main to origin.

## Review Focus

Input classes/failure modes no single happy-path test covers; each line's test lives in the owning task.

1. **Cross-tenant IDOR** (Task 4/5): another tenant's tenant-id/api-key-id in the path → 404, never data. Owner: Task 13 isolation suite + per-task tests.
2. **Concurrent quota bypass** (Task 8): N parallel tracks at the limit boundary → accepted count never exceeds the plan limit. Owner: Task 8.
3. **Webhook replay / out-of-order delivery** (Task 9): same Stripe event delivered twice → processed once; older `subscription.updated` after a newer one → no regression. Owner: Task 9.
4. **Idempotency key reuse with a different body** (Task 7): same key, different payload → original stored result returned, one event row. Owner: Task 7.
5. **UTC billing-period rollover** (Task 8): events at the period edge count into the correct period; free-plan month rolls lazily. Owner: Task 8.
6. **Revoked API key used mid-flight** (Task 7): revoked key → 401, no event recorded. Owner: Task 7.
7. **CSRF on cookie-authenticated writes** (Task 3): cross-origin POST with a valid cookie and foreign `Origin` → 403; same-origin/absent Origin → passes. Owner: Task 3.

---

### Task 1: Project scaffolding

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/vitest.config.ts`, `backend/drizzle.config.ts`, `backend/.env.example`, `backend/Dockerfile`, `backend/docker-compose.yml`, `backend/src/config/env.ts`, `backend/src/app.ts`, `backend/src/server.ts`, `backend/src/middleware/error.ts`, `backend/src/utils/logger.ts`
- Test: `backend/tests/app.test.ts`

**Interfaces:**
- Produces: `createApp(): express.Express` (app with JSON body parsing, error handler, `/healthz`); `loadConfig(env?: NodeJS.ProcessEnv): Config` (Zod-validated: `PORT`, `DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV`, `CORS_ORIGIN`, `STRIPE_SECRET_KEY?`, `STRIPE_WEBHOOK_SECRET?`, `STRIPE_SUCCESS_URL?`, `STRIPE_CANCEL_URL?`, `LOG_LEVEL?`, `TEST_DATABASE_URL?`); `errorHandler` middleware emitting `{ error: { message, code } }`.

- [ ] **Step 1:** `npm init` in `backend/`, install deps (express, cors, helmet, cookie-parser, express-rate-limit, zod, dotenv, pino, pino-http, bcryptjs, drizzle-orm, pg, stripe, drizzle-kit, typescript, tsx, vitest, supertest + `@types/*`). `tsconfig.json` strict, `module: NodeNext`, outDir `dist`.
- [ ] **Step 2 (failing test):** `tests/app.test.ts` — `GET /healthz` returns 200 `{ status: "ok" }`; `loadConfig({})` throws with a message naming `DATABASE_URL`; unknown route returns 404 envelope `{ error: { message, code: "not_found" } }`. Run `npm test` → FAIL (no app).
- [ ] **Step 3:** Implement `env.ts`, `app.ts` (helmet, cors with credentials + `CORS_ORIGIN`, json, cookie-parser, `/healthz`, 404 + error handler), `server.ts` (listen on `PORT`, log via pino).
- [ ] **Step 4:** Run `npm test` → PASS 3/3.
- [ ] **Step 5:** `.env.example` with every var documented (no real secrets), `Dockerfile` (node:22-alpine, multi-stage build), `docker-compose.yml` (postgres:16-alpine, port 5432, healthcheck, two databases `billing` + `billing_test` via init SQL), commit.

```bash
git checkout -b feat/backend-task-1-scaffold
git add backend && git commit -m "feat(backend): scaffold Express+TS app, config, logging, Docker"
```

**Verify:** `cd backend && npm test` → 3 pass. `docker compose -f backend/docker-compose.yml config` → valid.

---

### Task 2: Database schema, migrations, seed

**Files:**
- Create: `backend/src/db/schema.ts` (all tables), `backend/src/db/index.ts` (pool + drizzle client), `backend/src/db/migrations/` (drizzle-kit generated), `backend/src/db/seed.ts`, `backend/src/db/meta.ts` (table list for test truncation)
- Test: `backend/tests/db.test.ts`, `backend/tests/helpers/db.ts` (migrate + `resetDb()`)

**Interfaces:**
- Produces: exported schema tables `users, tenants, tenantMembers, plans, subscriptions, usageEvents, aiTokenUsageDetails, idempotencyRecords, webhookEvents, apiKeys, backgroundJobs, usageAlerts, sessions, pricingVersions, usageMonthlyRollups`; `migrate(url)`; `resetDb()`; `seed(db)` idempotent.
- Consumes: Task 1 config/`TEST_DATABASE_URL`.

Tables (columns abbreviated; all have `id uuid pk defaultRandom()`, `createdAt timestamptz defaultNow()` where applicable):
- `users`: name, email unique, passwordHash, platformAdmin boolean default false, updatedAt.
- `tenants`: name, updatedAt.
- `tenantMembers`: tenantId FK, userId FK, role pgEnum(`admin`,`member`), unique(tenantId,userId).
- `plans`: code unique, name, description, priceMinor int, currency default `'USD'`, interval default `'month'`, apiCallsLimit int null, aiTokensLimit int null, features jsonb, isDefault boolean, stripePriceId text null, active boolean default true.
- `subscriptions`: tenantId unique FK, planId FK, status pgEnum(`active`,`trialing`,`past_due`,`unpaid`,`canceled`), stripeCustomerId/StripeSubscriptionId text null, currentPeriodStart/End timestamptz null, cancelAtPeriodEnd boolean default false, updatedAt.
- `usageEvents`: tenantId FK, apiKeyId FK null, type pgEnum(`api_call`,`ai_tokens`), quantity bigint, costMinor bigint, currency default `'USD'`, pricingVersion int, status default `'recorded'`, idempotencyKey text, metadata jsonb, unique(tenantId, idempotencyKey), index (tenantId, createdAt).
- `aiTokenUsageDetails`: usageEventId unique FK, inputTokens, outputTokens, cachedInputTokens, reasoningTokens bigint, model text null.
- `idempotencyRecords`: tenantId, endpoint, idempotencyKey, requestHash, responseStatus int, responseBody jsonb, unique(tenantId, endpoint, idempotencyKey).
- `webhookEvents`: stripeEventId unique, type, status pgEnum(`received`,`processed`,`failed`), payload jsonb, receivedAt, processedAt, error text null.
- `apiKeys`: tenantId FK, name, keyPrefix (first 12 chars, indexed), keyHash unique (sha256), status pgEnum(`active`,`revoked`), lastUsedAt, revokedAt.
- `backgroundJobs`: type text, payload jsonb, status pgEnum(`pending`,`processing`,`completed`,`failed`,`dead`), attempts int default 0, maxAttempts int default 5, runAt timestamptz, lastError text null, dedupeKey text null, completedAt, updatedAt; partial unique index on dedupeKey where status in (`pending`,`processing`); index (status, runAt).
- `usageAlerts`: tenantId, metric pgEnum(`api_calls`,`tokens`), threshold int (percent), severity pgEnum(`info`,`warning`,`critical`), message text, periodStart timestamptz, unique(tenantId, metric, threshold, periodStart), acknowledgedAt null.
- `sessions`: tokenHash unique, userId FK, tenantId FK, expiresAt, lastSeenAt.
- `pricingVersions`: version int unique, rates jsonb, effectiveFrom, note text.
- `usageMonthlyRollups`: tenantId, periodStart (month), apiCalls bigint, tokens bigint, costMinor bigint, unique(tenantId, periodStart).

- [ ] **Step 1 (failing test):** `tests/db.test.ts` — with `TEST_DATABASE_URL` pointing at a fresh DB: `migrate()` succeeds; inserting a second user with a duplicate email rejects (`23505`); two usage events with same `(tenantId, idempotencyKey)` reject; `seed()` twice succeeds (idempotent) and leaves exactly one `free` + one `pro` plan (`plans.count() === 2` after second run); `resetDb()` empties every table in `meta.ts`. Run → FAIL (no schema).
- [ ] **Step 2:** Write `schema.ts` + `db/index.ts`; `drizzle.config.ts`; `npx drizzle-kit generate` → migrations; `migrate()` via `drizzle-orm/node-postgres/migrator`.
- [ ] **Step 3:** `seed.ts`: Free plan (`code: 'free'`, 1000 apiCallsLimit, 100000 aiTokensLimit, priceMinor 0, isDefault true), Pro plan (`code: 'pro'`, 100000 calls, 10000000 tokens, priceMinor 2900, stripePriceId from env or null), pricing version 1 with rates from `src/config/pricing.ts` (Task 6 reads the same file; here just seed), demo platform-admin user + tenant + membership + free subscription + one API key (hash only).
- [ ] **Step 4:** Run → PASS. Wire `tests/helpers/db.ts` (global migrate once, `resetDb()` in integration `beforeEach`). Commit.

```bash
git checkout -b feat/backend-task-2-schema
git add backend && git commit -m "feat(backend): Drizzle schema, migrations, seed for 15 tables"
```

**Verify:** `cd backend && npm test` → all pass; `npx drizzle-kit generate` output committed.

---

### Task 3: Authentication, sessions, middleware

**Files:**
- Create: `backend/src/modules/auth/{routes.ts,controller.ts,service.ts,schema.ts,repository.ts}`, `backend/src/middleware/{auth.ts,origin-check.ts,rate-limit.ts,validate.ts}`, `backend/tests/helpers/auth.ts` (register helper)
- Test: `backend/tests/auth.test.ts`, `backend/tests/security.test.ts`

**Interfaces:**
- Produces: `POST /api/v1/auth/register|login|logout`, `GET /api/v1/auth/me`, `POST /api/v1/auth/forgot-password` (501 stub); middleware `requireAuth` (cookie `sid` → loads session → `req.auth = { userId, tenantId, role, platformAdmin }`, else 401), `requirePlatformAdmin` (403), `validate(zodSchema)` (400 envelope `code: "validation_error"`), `originCheck` for cookie-authed writes, rate limiters `authLimiter` (10/15min/IP), `globalLimiter` (300/min/IP); helper `registerUser(app, {email,password,name?})` → sets cookie.
- Consumes: Task 1 app/config/error envelope; Task 2 schema.

Request/response contracts:
- `POST /auth/register` `{ name, email, password }` (password min 8) → 201 `{ user: { id, name, email, role: "admin" }, tenant: { id, name } }` + `Set-Cookie: sid=…; HttpOnly; SameSite=Lax; Path=/`. Side effects in ONE transaction: user, tenant named `` `${name}'s Workspace` ``, membership admin, free-plan subscription (active, current UTC month bounds), session row (store sha256(token + SESSION_SECRET)).
- `POST /auth/login` → 200 same body; wrong password → 401 `code: "invalid_credentials"`; unknown email → same 401 (no user enumeration).
- `POST /auth/logout` → 204, deletes session row.
- `GET /auth/me` → 200 `{ user, tenant }` or 401.
- `POST /auth/forgot-password` → 501 `code: "not_implemented"` (frontend renders honest message).

- [ ] **Step 1 (failing tests):** `auth.test.ts` — register returns 201 with user+tenant and `Set-Cookie` HttpOnly; password hash ≠ plaintext (query users table); duplicate email → 409 `code: "email_taken"`; login happy path returns 200 + cookie; wrong password → 401; `/auth/me` with cookie → 200; without cookie → 401; logout then `/auth/me` → 401; `forgot-password` → 501. Run → FAIL.
- [ ] **Step 2:** Implement auth module + `requireAuth` + session helpers (timing-safe token compare via hash lookup).
- [ ] **Step 3:** Run → PASS.
- [ ] **Step 4 (failing tests):** `security.test.ts` — register body missing password → 400 `code: "validation_error"`; cross-origin POST `/auth/login` with `Origin: https://evil.example` → 403 `code: "bad_origin"`; same-origin (`Origin: http://localhost:4000` or absent) → passes; rate limiter: 11th login attempt within window → 429; auth routes respond with `X-Content-Type-Options`/helmet defaults (assert one header). Run → FAIL.
- [ ] **Step 5:** Implement `validate`, `originCheck`, limiters; run → PASS; commit.

```bash
git checkout -b feat/backend-task-3-auth
git add backend && git commit -m "feat(backend): session auth, validation, origin check, rate limits"
```

**Verify:** `cd backend && npm test`.

---

### Task 4: Tenants and plans modules

**Files:**
- Create: `backend/src/modules/tenants/{routes.ts,service.ts,schema.ts,repository.ts}`, `backend/src/modules/plans/{routes.ts,repository.ts}`
- Test: `backend/tests/tenants.test.ts`, `backend/tests/plans.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/tenants` → `{ items: [{ id, name, role, createdAt }] }` (tenants the session user belongs to); `POST /api/v1/tenants` `{ name }` → 201 tenant + membership(admin) + free subscription (session stays on original tenant); `GET /api/v1/tenants/:id` → tenant or 404 when not a member; `GET /api/v1/plans` → `{ items: [{ id, code, name, description, priceMinor, currency, interval, callsLimit, tokensLimit, features, isDefault }] }` (active plans ordered by price).
- Consumes: Task 2 schema, Task 3 `requireAuth`.

- [ ] **Step 1 (failing tests):** `tenants.test.ts` — user A sees only their tenants; A requesting B's tenant id (seeded second user) → 404 `code: "not_found"` (IDOR guard, Review Focus 1); POST creates tenant + admin membership + free subscription, returns 201; empty name → 400. Run → FAIL.
- [ ] **Step 2:** Implement; run → PASS.
- [ ] **Step 3 (failing tests):** `plans.test.ts` — seeded free/pro returned with exact limits (free: callsLimit 1000, tokensLimit 100000, priceMinor 0, isDefault true); shape matches frontend `normalizePlan` expectations (flat `callsLimit`/`tokensLimit`, `features` array); unauthenticated → 401? (Plans are public catalog — decide: `GET /plans` requires NO auth, matches "Available plans" marketing use; ledger this ruling). Run → FAIL.
- [ ] **Step 4:** Implement; run → PASS; commit.

```bash
git checkout -b feat/backend-task-4-tenants-plans
git add backend && git commit -m "feat(backend): tenant management with isolation, plan catalog"
```

**Verify:** `cd backend && npm test`.

---

### Task 5: API key management

**Files:**
- Create: `backend/src/modules/api-keys/{routes.ts,service.ts,schema.ts,repository.ts}`, `backend/src/services/api-key.ts` (hash/verify/format)
- Test: `backend/tests/api-keys.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/api-keys` → `{ items: [{ id, name, maskedKey, status, createdAt, lastUsedAt }] }` (never a secret); `POST /api/v1/api-keys` `{ name }` → 201 flat `{ id, name, maskedKey, status, createdAt, lastUsedAt, plaintext }` where `plaintext = "umk_" + 40 hex chars` shown ONCE; `DELETE /api/v1/api-keys/:id` → 204 (other tenant's id → 404); `authenticateApiKey(header: string | undefined): Promise<{ tenantId, apiKeyId } | null>` — parses `Bearer umk_…`, sha256 lookup, rejects revoked (`status='revoked'`), returns null otherwise; `touchApiKey(id)` sets lastUsedAt (fire-and-forget).
- Consumes: Task 2 schema, Task 3 `requireAuth`.

- [ ] **Step 1 (failing tests):** `api-keys.test.ts` — create returns plaintext once; list response contains no `umk_` secret and no keyHash (assert JSON.stringify has no plaintext value); stored hash ≠ plaintext; revoke → 204 then `authenticateApiKey(plaintext)` → null (Review Focus 6); cross-tenant DELETE → 404; `authenticateApiKey` with garbage → null; lastUsedAt set after a successful auth. Run → FAIL.
- [ ] **Step 2:** Implement; run → PASS; commit.

```bash
git checkout -b feat/backend-task-5-api-keys
git add backend && git commit -m "feat(backend): API key generation, hashing, revocation"
```

**Verify:** `cd backend && npm test`.

---

### Task 6: Cost calculation engine (pure)

**Files:**
- Create: `backend/src/config/pricing.ts`, `backend/src/modules/cost-calculation/{calculator.ts,types.ts}`
- Test: `backend/tests/cost.test.ts`

**Interfaces:**
- Produces: `PRICING_VERSION = 1`; `RATES` — per-model table default `{ inputPerMillionMinor: 150, outputPerMillionMinor: 600, cachedInputPerMillionMinor: 30, apiCallPerCallMinor: 0 }` (USD minor units per 1,000,000 tokens / per call), keyed by model name with `"default"` fallback; `calculateCost(input: CostInput): CostResult` where
  `CostInput = { type: "api_call" | "ai_tokens"; quantity: bigint; inputTokens?: bigint; outputTokens?: bigint; cachedInputTokens?: bigint; reasoningTokens?: bigint; model?: string }`
  and `CostResult = { costMinor: bigint; pricingVersion: number; rateTable: Record<string, number> }`.
- Consumes: nothing (pure; Task 7 feeds it).

Pricing rules (exact arithmetic, BigInt only — no floats anywhere):
- `api_call`: `costMinor = quantity * apiCallPerCallMinor`.
- `ai_tokens`: `billableInput = max(input - cachedInput, 0)` at input rate; `cachedInput` at cached rate; `output` at output rate. **`reasoningTokens` are a subset of output — recorded, never priced again** (Review Focus: no double-count).
- Per-million rates: `cost = (tokens * rateMinor + 500_000n) / 1_000_000n` (integer half-up). Rate table snapshot embedded in result for audit metadata.

- [ ] **Step 1 (failing tests):** `cost.test.ts` — exact totals: `ai_tokens` qty fields `{input:1_000_000, output:500_000, cached:250_000}` default model → `750*150/1000…` compute expected `(750_000*150 + 500_000)/1_000_000 + (250_000*30 + 500_000)/1_000_000 + (500_000*600 + 500_000)/1_000_000` = assert exact bigint; reasoning overlap: same input with `reasoning: 200_000` → identical cost (no double-count); `cached > input` clamps to 0 negative guard; `api_call` quantity 100 → `100 * 0 = 0`; custom model rate applies; result carries `pricingVersion === 1`. Run → FAIL.
- [ ] **Step 2:** Implement BigInt calculator; run → PASS; commit.

```bash
git checkout -b feat/backend-task-6-cost-engine
git add backend && git commit -m "feat(backend): versioned exact-arithmetic pricing engine"
```

**Verify:** `cd backend && npm test`.

---

### Task 7: Usage metering with idempotency

**Files:**
- Create: `backend/src/modules/metering/{routes.ts,service.ts,schema.ts,repository.ts}`, `backend/src/services/idempotency.ts`
- Test: `backend/tests/metering.test.ts`, `backend/tests/metering-concurrency.test.ts`

**Interfaces:**
- Produces: `POST /api/v1/metering/track` — auth: `Authorization: Bearer umk_…` (API key, not cookie); header `Idempotency-Key` required (missing → 400 `code: "idempotency_key_required"`); body Zod:
  `{ type: "api_call" | "ai_tokens", quantity?: number (default 1 for api_call), inputTokens?, outputTokens?, cachedInputTokens?, reasoningTokens?, model?, metadata? }` (non-negative ints; ai_tokens requires at least one token field).
  → 201 `{ event: { id, type, quantity, inputTokens, outputTokens, cachedInputTokens, reasoningTokens, model, costMinor, currency, pricingVersion, status, createdAt }, duplicate: false }`
  duplicate → 200 same `event` shape, `duplicate: true` (original stored response replayed byte-identical).
  Revoked/unknown key → 401 `code: "invalid_api_key"`; body invalid → 400. (Quota rejections live in Task 8 — Task 7 records unconditionally.)
- Consumes: Task 5 `authenticateApiKey`, Task 6 `calculateCost`, Task 2 schema.

Transaction flow (single transaction): (1) `INSERT INTO idempotency_records … ON CONFLICT DO NOTHING` — if conflict, read stored response and return it (hash mismatch still returns original, per spec "return the original result"); (2) `SELECT … FOR UPDATE` on the tenant's subscription row (lock acquired here already, Task 8 extends the same lock); (3) compute cost; (4) insert `usage_events` (+ `ai_token_usage_details` for `ai_tokens`); (5) store response in the idempotency record; (6) commit. Step 4 also touches the API key `lastUsedAt`.

- [ ] **Step 1 (failing tests):** `metering.test.ts` — happy path api_call → 201, event persisted with cost and metadata (request headers/user-agent captured in metadata); ai_tokens event persists token breakdown rows; missing Idempotency-Key → 400; bad/revoked key → 401 and ZERO event rows; same key twice (sequential) → second returns 200 `duplicate: true` with identical event id and `usage_events.count() === 1` (Review Focus 4); same key + DIFFERENT body → original result replayed, still 1 row; unknown body field/type → 400. Run → FAIL.
- [ ] **Step 2:** Implement; run → PASS.
- [ ] **Step 3 (failing test):** `metering-concurrency.test.ts` — fire 5 parallel requests with the same key via `Promise.all` → exactly 1 event row, all five responses report the same event id; fire 5 parallel requests with DIFFERENT keys → 5 rows. Run → FAIL.
- [ ] **Step 4:** Verify lock/`ON CONFLICT` handling makes it pass; run → PASS; commit.

```bash
git checkout -b feat/backend-task-7-metering
git add backend && git commit -m "feat(backend): idempotent usage metering endpoint"
```

**Verify:** `cd backend && npm test`.

---

### Task 8: Quota enforcement

**Files:**
- Create: `backend/src/modules/quotas/{service.ts,repository.ts}`, wire into `modules/metering/service.ts`
- Test: `backend/tests/quota.test.ts`, `backend/tests/quota-concurrency.test.ts`

**Interfaces:**
- Produces: inside the Task 7 transaction, after the subscription `FOR UPDATE` lock: `checkQuota(db, { tenantId, projected: { apiCalls, tokens } }): Promise<QuotaDecision>` where `QuotaDecision = { permitted: true } | { permitted: false; scope: "api_calls" | "tokens"; used: number; limit: number; reason: "quota_exceeded" | "payment_required" }`.
  Route mapping: `quota_exceeded` → 429 envelope `{ error: { message, code: "quota_exceeded", details: { scope, used, limit } } }` + `Retry-After` header; `payment_required` → 402 `code: "payment_required"`.
  Free-plan periods roll lazily: when `currentPeriodEnd <= now` and plan is free, the locked transaction resets period bounds to the current UTC month before summing.
  Paid periods come from `subscriptions.currentPeriodStart/End` (webhook-synced).
- Consumes: Task 7's transaction + lock; Task 2 schema.

Boundary semantics (exact): `used + projected <= limit` → permitted; `> limit` → rejected. Limit `null` = unlimited. Statuses `active|trialing` pass; `past_due|unpaid` → 402; `canceled` → treated as free plan (webhook Task 9 keeps it truthful).

- [ ] **Step 1 (failing tests):** `quota.test.ts` — free plan: 999 calls used + 1 → 201; 1000 used + 1 → 429 with `details.limit === 1000`, `details.scope === "api_calls"` (exact boundary, Review Focus 5); tokens quota independently enforced (100_000 tokens); `null` limit never rejects; subscription `past_due` → 402 (seed a past_due row); month rollover: seed a free subscription with last month's bounds + events last month → current request permitted and period bounds updated to this UTC month; events created yesterday still counted in this month's usage. Run → FAIL.
- [ ] **Step 2:** Implement `checkQuota` + wire into metering; run → PASS.
- [ ] **Step 3 (failing test):** `quota-concurrency.test.ts` — set used = limit−1; fire 10 parallel api_call tracks with distinct keys → exactly 1 accepted (201), 9 rejected (429), final `usage_events` count matches accepted count (Review Focus 2). Run → FAIL.
- [ ] **Step 4:** Ensure serialization via subscription-row lock; run → PASS; commit.

```bash
git checkout -b feat/backend-task-8-quota
git add backend && git commit -m "feat(backend): transactional quota enforcement with 429/402"
```

**Verify:** `cd backend && npm test`.

---

### Task 9: Stripe integration (test mode)

**Files:**
- Create: `backend/src/services/stripe.ts` (wrapper), `backend/src/modules/subscriptions/{routes.ts,service.ts,repository.ts,schema.ts}`, `backend/src/modules/webhooks/{routes.ts,service.ts}`
- Test: `backend/tests/subscriptions.test.ts`, `backend/tests/webhooks.test.ts`

**Interfaces:**
- Produces:
  - `POST /api/v1/subscriptions/checkout` `{ planId }` (accepts plan UUID **or** `code`) → 200 `{ url }`; requires auth; plan must be paid (`priceMinor > 0`) else 400 `code: "invalid_plan"`; creates/reuses Stripe customer (`subscriptions.stripeCustomerId`), returns `stripe.checkout.sessions.create({ mode: "subscription", line_items: [{ price }], success_url: STRIPE_SUCCESS_URL, cancel_url: STRIPE_CANCEL_URL })` URL. No Stripe config → 503 `code: "stripe_not_configured"`.
  - `POST /api/v1/subscriptions/cancel` → 200 subscription object; paid+Stripe → `stripe.subscriptions.update(id, { cancel_at_period_end: true })` and set local `cancelAtPeriodEnd = true` (state change is our own API call, not a redirect); free plan → 400 `code: "invalid_subscription"`.
  - `GET /api/v1/subscriptions/current` → `{ plan: { id, name, code }, planName, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd }` (no subscription row impossible — free row always exists).
  - `POST /api/v1/webhooks/stripe` — `express.raw()` body BEFORE json parser; `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)` (400 `code: "invalid_signature"` on failure); insert `webhook_events` row — duplicate `stripe_event_id` → 200 `{ received: true, duplicate: true }` WITHOUT reprocessing (Review Focus 3); handlers:
    - `checkout.session.completed` → upsert subscription row: status active, stripe ids, plan from `metadata.planId`/price lookup, period from session/subscription object.
    - `customer.subscription.updated` → sync status, period, plan, `cancelAtPeriodEnd`; **out-of-order guard**: ignore updates whose `stripeSubscriptionId` row has `updatedAt` newer than event `created` (store last stripe event timestamp on the row or compare via webhook_events) — simplest: process only if event `created` ≥ last processed stripe timestamp for that subscription.
    - `customer.subscription.deleted` → status canceled, plan reverts to free, period reset to current UTC month.
- Consumes: Task 2 schema, Task 4 plan lookup, Task 3 auth.

- [ ] **Step 1 (failing tests):** `subscriptions.test.ts` — checkout happy path (stripe service mocked via `vi.mock`) returns `{ url }` and persists `stripeCustomerId`; checkout for `free` plan → 400; unauthenticated → 401; `GET /subscriptions/current` shape matches frontend `normalizeSubscription` (planName present); cancel sets `cancelAtPeriodEnd` and calls stripe mock; missing env → 503. Run → FAIL.
- [ ] **Step 2:** Implement wrapper + routes; run → PASS.
- [ ] **Step 3 (failing tests):** `webhooks.test.ts` — sign payload with `stripe.webhooks.generateTestHeaderString`: valid signature → 200 and subscription becomes active with correct plan/period; SAME payload delivered twice → second returns `duplicate: true`, `webhook_events.count() === 1`, subscription state unchanged; tampered payload → 400 and NO webhook row; `customer.subscription.updated` with older `created` than the last processed event → state NOT regressed (out-of-order guard); `customer.subscription.deleted` → plan reverts to free; **success-redirect simulation: no endpoint exists that flips state without a webhook** (assert `/subscriptions/current` still free after checkout call alone). Run → FAIL.
- [ ] **Step 4:** Implement webhook service; run → PASS; commit.

```bash
git checkout -b feat/backend-task-9-stripe
git add backend && git commit -m "feat(backend): Stripe checkout, verified webhook sync, dedupe"
```

**Verify:** `cd backend && npm test`.

---

### Task 10: Background jobs

**Files:**
- Create: `backend/src/jobs/{queue.ts,runner.ts,handlers/usage-alerts.ts,handlers/monthly-rollup.ts,handlers/stripe-reconcile.ts}`, wire `startWorker(app)` in `server.ts`
- Test: `backend/tests/jobs.test.ts`

**Interfaces:**
- Produces: `enqueueJob(db, { type, payload, dedupeKey?, runAt?, maxAttempts? })` (partial-unique conflict → no-op); `runOnce(db): Promise<number>` claims due jobs `FOR UPDATE SKIP LOCKED`, runs handler, marks completed; failure → `attempts+1`, `runAt = now + base * 2^attempts` (exponential backoff, base 5s), status `failed` while retries remain, `dead` after `maxAttempts` with `lastError` persisted (permanently failed jobs identifiable by status `dead`); `startWorker(db, intervalMs)` / `stopWorker()`.
  Handlers: `usage_alerts` — computes current-period usage vs plan limits, inserts `usage_alerts` rows at 80% (warning) / 100% (critical) per metric, deduped by unique constraint; enqueued by metering after every accepted track (dedupeKey `alerts:{tenantId}:{periodStartIso}`); `monthly_rollup` — upserts `usage_monthly_rollups` per tenant for the previous month (idempotent recompute); `stripe_reconcile` — for each subscription with `stripeCustomerId`, fetches state via stripe wrapper (mocked in tests) and applies the same sync function as webhooks.
- Consumes: Task 7 (enqueue hook), Task 8 (usage sums), Task 9 (stripe wrapper), Task 2 schema.

- [ ] **Step 1 (failing tests):** `jobs.test.ts` — enqueue + `runOnce` executes a test handler and marks completed; failing handler → status failed, `runAt` ≈ `base * 2^attempts` seconds ahead (assert exact schedule for attempts 1..4); after maxAttempts → `dead` with `lastError` set (Review Focus: identifiable permanent failures); dedupeKey enqueued twice → 1 row; `SKIP LOCKED` claim: two concurrent `runOnce` never double-process one job (Promise.all → total processed 1); `usage_alerts` handler creates exactly one warning row at 80% and one critical at 100% on re-run (no dupes); `monthly_rollup` re-run produces identical rollup row. Run → FAIL.
- [ ] **Step 2:** Implement queue/runner/handlers; add metering enqueue hook; run → PASS; commit.

```bash
git checkout -b feat/backend-task-10-jobs
git add backend && git commit -m "feat(backend): PG-backed job queue with backoff and alerts"
```

**Verify:** `cd backend && npm test`.

---

### Task 11: Analytics, billing, and admin endpoints

**Files:**
- Create: `backend/src/modules/usage-analytics/{routes.ts,service.ts,repository.ts}`, `backend/src/modules/billing/{routes.ts,service.ts}`, `backend/src/modules/admin/{routes.ts,service.ts,repository.ts}`
- Test: `backend/tests/usage.test.ts`, `backend/tests/billing.test.ts`, `backend/tests/admin.test.ts`

**Interfaces:**
- Produces (all authed + tenant-scoped; admin requires `platformAdmin`):
  - `GET /api/v1/usage/summary` → `{ totalApiCalls, totalTokens, estimatedCost, currency, apiCallsSeries: [{date,value}], tokensSeries, costSeries, apiCallQuota: {used,limit}, tokenQuota: {used,limit}, alerts: [{id,message,severity}] }` (daily series for current period; quota from plan limits; cost = sum of event `costMinor`).
  - `GET /api/v1/usage?from&to&granularity=daily|weekly|monthly` → `{ apiCallsSeries, tokensSeries, costSeries, currency, byApiKey: [{name,apiCalls,tokens,cost}], byModel: [...] }`.
  - `GET /api/v1/usage/history?limit&offset&search&from&to&sort&order` → `{ items: [{ id, type, createdAt, apiKeyName, model, quantity, inputTokens, outputTokens, cost, status }], total }` (search on model/api-key name; sort `createdAt` asc/desc; defaults limit 20, order desc).
  - `GET /api/v1/billing/summary` → `{ estimatedCost, currency, periodStart, periodEnd, nextInvoiceAt, status }`.
  - `GET /api/v1/admin/tenants` → `{ items: [{ id, name, plan, status, createdAt, memberCount }] }`; `GET /api/v1/admin/metrics` → `{ totalTenants, activeSubscriptions, totalApiCalls, totalTokens, estimatedRevenue, currency, jobs: { pending, processing, failed, completed } }` (`failed` includes `dead`); `GET /api/v1/admin/webhooks` → `{ items: [{ id, type, status, receivedAt }] }`.
- Consumes: Task 2 schema, Task 8 quota service, Task 9 subscription repo, Task 10 jobs table.

- [ ] **Step 1 (failing tests):** `usage.test.ts` — seed known events across 3 days + 2 API keys + 2 models: summary totals exact; series points match seeded day sums; quota reflects plan limits; history pagination math (`total` = full count, page respects limit/offset); `search=model-x` filters; tenant B's events never appear in tenant A's responses (isolation); analytics `byApiKey`/`byModel` sums equal totals. Run → FAIL.
- [ ] **Step 2:** Implement usage analytics; run → PASS.
- [ ] **Step 3 (failing tests):** `billing.test.ts` — summary returns period bounds from subscription, cost = current-period event sum, status passthrough; `subscriptions/current` (already Task 9) consistent with billing period. `admin.test.ts` — non-platform-admin session → 403 `code: "forbidden"` on all three; platform admin (seeded) → 200 with exact metrics on seeded fixture (counts verified by hand); jobs stats include `dead` in `failed`. Run → FAIL.
- [ ] **Step 4:** Implement billing + admin; run → PASS; commit.

```bash
git checkout -b feat/backend-task-11-analytics-admin
git add backend && git commit -m "feat(backend): usage analytics, billing summary, admin endpoints"
```

**Verify:** `cd backend && npm test`.

---

### Task 12: API documentation and required deliverables

**Files:**
- Create: `backend/docs/API.md`, `backend/README.md`, `BUILDLOG.md` (repo root), `EVIDENCE.md` (repo root), `capstone.yaml` (repo root), update root `README.md` with backend section
- Test: `backend/tests/docs.test.ts`

**Interfaces:**
- Consumes: every endpoint from Tasks 3–11.
- Produces: `docs/API.md` documenting EVERY endpoint with method, path, auth requirement, request params/body, response structure, error responses (code list), example request (curl) and example response — per backend-plan §6. Root deliverables: `README.md` (run instructions: `docker compose up -d`, `npm i`, `npm run migrate`, `npm run seed`, `npm run dev`, `npm test`), `BUILDLOG.md` (phase-by-phase build narrative + key rulings), `EVIDENCE.md` (test run output, curl transcripts proving metering→quota→cost→analytics flow, webhook replay transcript), `capstone.yaml` (project manifest: name, stack, features, endpoints, evidence files).

- [ ] **Step 1 (failing test):** `docs.test.ts` — parse `docs/API.md` for a table/section listing every route (regex `METHOD /path`), compare against a registry exported from `src/app.ts` (`listRoutes()` walking the Express router): every registered route is documented, every documented route exists (both directions); every documented error `code` appears in the source `codes.ts` constants file. Run → FAIL.
- [ ] **Step 2:** Write docs + deliverables; implement route registry + `codes.ts`; run → PASS.
- [ ] **Step 3:** Capture EVIDENCE transcripts by running the real stack (Docker postgres, seeded data, curl through metering → summary → webhook replay) and paste outputs. Commit.

```bash
git checkout -b feat/backend-task-12-docs
git add -A && git commit -m "docs(backend): full API reference, README, BUILDLOG, EVIDENCE, capstone.yaml"
```

**Verify:** `cd backend && npm test`; `capstone.yaml` parses (test asserts YAML structure via a tiny parser or `yaml` package).

---

### Task 13: Hardening, acceptance suites, Definition of Done

**Files:**
- Create: `backend/tests/acceptance.test.ts`, `backend/tests/isolation.test.ts`, `backend/tests/webhook-replay.test.ts`; modify: any fixes surfaced
- Test: full suite `cd backend && npm test`

**Interfaces:**
- Consumes: all tasks.

- [ ] **Step 1 (failing tests):** `isolation.test.ts` — end-to-end: two tenants each register + track usage + create keys; every tenant-scoped endpoint (`/usage*`, `/billing/summary`, `/subscriptions/current`, `/api-keys`, `/tenants/:id`) accessed cross-tenant → 404/403 and payload contains zero foreign ids (deep-scan JSON). Run → FAIL.
- [ ] **Step 2:** `webhook-replay.test.ts` — replay a 3-event checkout→update→delete sequence twice: final state identical to single delivery; `webhook_events` shows one row per stripe id. Run → FAIL.
- [ ] **Step 3:** `acceptance.test.ts` — full journey in one test: register → create key → 10 tracks (one duplicate) → summary shows 9 counted calls + costs → quota boundary 429 at limit → checkout (mocked) → signed webhook activates pro plan → quota now pro limits → cancel → alerts job at 80% → admin metrics correct. Run → FAIL.
- [ ] **Step 4:** Fix anything surfaced (systematic-debugging, ledger rulings); run FULL suite → all green.
- [ ] **Step 5:** Verify DoD: `docker compose down -v && docker compose up -d` fresh → migrate → seed → `npm test` green → `npm run build` (tsc) clean → `node dist/server.js` boots and `/healthz` responds → confirm no secrets in git (`git log -p | grep -iE "sk_live|whsec" empty`, `.env` untracked) → frontend `cd frontend && npm test` still green (contract untouched). Ledger evidence.

```bash
git checkout -b feat/backend-task-13-hardening
git add backend && git commit -m "test(backend): isolation, replay, and acceptance suites"
```

**Verify:** `cd backend && npm test` (full), `npm run build`, frontend suite still green.
