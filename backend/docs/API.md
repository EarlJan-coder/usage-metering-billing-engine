# API Reference — Usage Metering & Billing Engine

Base URL: `http://localhost:4000` (all resource routes are prefixed `/api/v1`).

**Authentication conventions**

| Style | Where | How |
| --- | --- | --- |
| Session cookie | Dashboard routes | `sid` HttpOnly cookie, set by login/register |
| API key | `POST /api/v1/metering/track` only | `Authorization: Bearer umk_…` |
| Public | `GET /api/v1/plans`, `GET /healthz` | none |

**Error envelope** — every non-2xx response has this shape:

```json
{ "error": { "message": "Human-readable explanation", "code": "machine_code" } }
```

429 responses additionally carry a `Retry-After` header (seconds) and, for
quota rejections, `error.details: { scope, used, limit }`.

---

## Operational

### GET /healthz

Liveness probe. Public.

**Response** `200`

```json
{ "status": "ok" }
```

---

## Authentication

Session cookie `sid` is set (HttpOnly, SameSite=Lax) on register/login and
cleared on logout. `POST /api/v1/auth/logout` is the only logout route.

### POST /api/v1/auth/register

Public. Creates user + personal workspace + free-plan subscription and
signs the session in.

**Request body**

| field | type | notes |
| --- | --- | --- |
| name | string | 1–100 chars |
| email | string | unique, lowercased |
| password | string | min 8 chars (bcrypt-hashed, never stored raw) |

**Response** `201`

```json
{
  "user": { "id": "…uuid…", "name": "Ada Lovelace", "email": "ada@example.com", "role": "admin" },
  "tenant": { "id": "…uuid…", "name": "Ada Lovelace's Workspace" }
}
```

**Errors** `400 validation_error`, `409 email_taken`, `429 rate_limited`

```bash
curl -i -X POST http://localhost:4000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ada Lovelace","email":"ada@example.com","password":"correct-horse-1"}'
```

### POST /api/v1/auth/login

Public. Same response as register. Unknown email and wrong password both
return the identical `401` body (no user enumeration).

**Request body**: `email`, `password`.

**Response** `200`

```json
{
  "user": { "id": "…uuid…", "name": "Ada Lovelace", "email": "ada@example.com", "role": "admin" },
  "tenant": { "id": "…uuid…", "name": "Ada Lovelace's Workspace" }
}
```

**Errors** `400 validation_error`, `401 invalid_credentials`, `429 rate_limited`

```bash
curl -i -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","password":"correct-horse-1"}'
```

### POST /api/v1/auth/logout

Requires session cookie. Revokes the session and clears the cookie.

**Response** `204` (empty body)

**Errors** `403 bad_origin` (cross-origin write with a valid cookie)

```bash
curl -i -X POST http://localhost:4000/api/v1/auth/logout -b cookies.txt
```

### GET /api/v1/auth/me

Requires session cookie.

**Response** `200` — same `{ user, tenant }` shape as register.

**Errors** `401 unauthorized`

```bash
curl -i http://localhost:4000/api/v1/auth/me -b cookies.txt
```

### POST /api/v1/auth/forgot-password

Public. Honest stub: no mail transport exists on this deployment.

**Request body**: `email`.

**Response** — always

```json
{ "error": { "message": "Password reset is not available on this deployment yet", "code": "not_implemented" } }
```

**Errors** `501 not_implemented`, `400 validation_error`, `429 rate_limited`

```bash
curl -i -X POST http://localhost:4000/api/v1/auth/forgot-password \
  -H 'Content-Type: application/json' -d '{"email":"ada@example.com"}'
```

---

## Tenants & plans

### GET /api/v1/tenants

Requires session. Lists only the workspaces the caller is a member of.

**Response** `200`

```json
{ "items": [ { "id": "…uuid…", "name": "Ada Lovelace's Workspace", "role": "admin", "createdAt": "2026-11-14T12:00:00.000Z" } ] }
```

**Errors** `401 unauthorized`

```bash
curl -i http://localhost:4000/api/v1/tenants -b cookies.txt
```

### GET /api/v1/tenants/:id

Requires session. Membership-scoped: a foreign tenant id is
indistinguishable from a missing one (`404`).

**Response** `200`

```json
{ "id": "…uuid…", "name": "Ada Lovelace's Workspace", "role": "admin", "createdAt": "2026-11-14T12:00:00.000Z" }
```

**Errors** `401 unauthorized`, `404 not_found`

```bash
curl -i http://localhost:4000/api/v1/tenants/0f2b6c1a-0000-4000-8000-000000000000 -b cookies.txt
```

### POST /api/v1/tenants

Requires session. Creates a workspace with the caller as admin and a
free-plan subscription. The session stays on the current workspace.

**Request body**: `name` (1–100 chars).

**Response** `201`

```json
{ "id": "…uuid…", "name": "Second Workspace", "role": "admin", "createdAt": "2026-11-14T12:05:00.000Z" }
```

**Errors** `400 validation_error`, `401 unauthorized`

```bash
curl -i -X POST http://localhost:4000/api/v1/tenants \
  -H 'Content-Type: application/json' -b cookies.txt -d '{"name":"Second Workspace"}'
```

### GET /api/v1/plans

Public plan catalog. Active plans only, cheapest first. Limits are flat
(`callsLimit`, `tokensLimit`); `null` means unlimited.

**Response** `200`

```json
{
  "items": [
    {
      "id": "…uuid…", "code": "free", "name": "Free",
      "description": "For evaluation and side projects",
      "priceMinor": 0, "currency": "USD", "interval": "month",
      "callsLimit": 1000, "tokensLimit": 100000,
      "features": ["1,000 API calls / month", "100,000 AI tokens / month"],
      "isDefault": true
    }
  ]
}
```

**Errors** — none beyond envelope failures.

```bash
curl -i http://localhost:4000/api/v1/plans
```

---

## API keys

Keys are shown in plaintext **once** at creation and stored only as a
SHA-256 hash. `umk_` prefix + 40 hex chars.

### GET /api/v1/api-keys

Requires session. Tenant-scoped list — never contains the secret or hash.

**Response** `200`

```json
{
  "items": [
    {
      "id": "…uuid…", "name": "CI key", "maskedKey": "umk_ab12cd34…",
      "status": "active", "createdAt": "2026-11-14T12:10:00.000Z", "lastUsedAt": null
    }
  ]
}
```

**Errors** `401 unauthorized`

```bash
curl -i http://localhost:4000/api/v1/api-keys -b cookies.txt
```

### POST /api/v1/api-keys

Requires session.

**Request body**: `name` (1–100 chars).

**Response** `201`

```json
{
  "id": "…uuid…", "name": "CI key", "maskedKey": "umk_ab12cd34…",
  "status": "active", "createdAt": "2026-11-14T12:10:00.000Z", "lastUsedAt": null,
  "plaintext": "umk_ab12cd34ef567890ab12cd34ef567890ab12cd34"
}
```

`plaintext` is returned exactly once — it cannot be recovered afterwards.

**Errors** `400 validation_error`, `401 unauthorized`

```bash
curl -i -X POST http://localhost:4000/api/v1/api-keys \
  -H 'Content-Type: application/json' -b cookies.txt -d '{"name":"CI key"}'
```

### DELETE /api/v1/api-keys/:id

Requires session. Soft revoke: status becomes `revoked`, the key stops
authenticating immediately. Foreign/unknown ids → `404`.

**Response** `204` (empty body)

**Errors** `401 unauthorized`, `404 not_found`

```bash
curl -i -X DELETE http://localhost:4000/api/v1/api-keys/1c9d4e70-0000-4000-8000-000000000000 -b cookies.txt
```

---

## Metering

### POST /api/v1/metering/track

**API-key auth only** (`Authorization: Bearer umk_…`) — a browser session
can never report usage. Requires an `Idempotency-Key` header (≤255 chars):
replays of the same key return the ORIGINAL result and create no new
event, even with a different body.

**Request body**

| field | type | notes |
| --- | --- | --- |
| type | string | `api_call` or `ai_tokens` |
| quantity | int ≥ 0 | api_call only; defaults to 1 |
| inputTokens | int ≥ 0 | ai_tokens; at least one token field required |
| outputTokens | int ≥ 0 | ai_tokens |
| cachedInputTokens | int ≥ 0 | subset of input, priced at the cached rate |
| reasoningTokens | int ≥ 0 | subset of output, never re-priced |
| model | string | selects the rate table entry |
| metadata | object | stored on the event |

Unknown fields are rejected (`validation_error`) — a typo never becomes a
free event.

**Response** `201` (created) / `200` (idempotent replay)

```json
{
  "duplicate": false,
  "event": {
    "id": "…uuid…", "type": "ai_tokens", "quantity": 1500000,
    "inputTokens": 1000000, "outputTokens": 500000,
    "cachedInputTokens": 250000, "reasoningTokens": 100000, "model": "gpt-4o",
    "costMinor": 421, "currency": "USD", "pricingVersion": 1,
    "status": "recorded", "createdAt": "2026-11-14T12:15:00.000Z"
  }
}
```

**Errors** `400 idempotency_key_required`, `400 validation_error`,
`401 invalid_api_key`, `402 payment_required` (past_due/unpaid
subscription), `429 quota_exceeded` (with `details: { scope, used, limit }`
and `Retry-After`)

```bash
curl -i -X POST http://localhost:4000/api/v1/metering/track \
  -H "Authorization: Bearer umk_ab12cd34ef567890ab12cd34ef567890ab12cd34" \
  -H "Idempotency-Key: order-42-attempt-1" \
  -H 'Content-Type: application/json' \
  -d '{"type":"ai_tokens","inputTokens":1000000,"outputTokens":500000,"model":"gpt-4o"}'
```

---

## Subscriptions & billing

Subscription state changes only through VERIFIED Stripe webhooks — the
checkout redirect proves nothing.

### GET /api/v1/subscriptions/current

Requires session.

**Response** `200`

```json
{
  "plan": { "id": "…uuid…", "name": "Free", "code": "free" },
  "planName": "Free",
  "status": "active",
  "currentPeriodStart": "2026-11-01T00:00:00.000Z",
  "currentPeriodEnd": "2026-12-01T00:00:00.000Z",
  "cancelAtPeriodEnd": false
}
```

**Errors** `401 unauthorized`, `404 not_found`

```bash
curl -i http://localhost:4000/api/v1/subscriptions/current -b cookies.txt
```

### POST /api/v1/subscriptions/checkout

Requires session. Starts Stripe Checkout for a paid plan. `planId`
accepts a plan UUID or plan code. The Stripe customer is created once per
tenant and reused.

**Request body**: `planId` (string).

**Response** `200`

```json
{ "url": "https://checkout.stripe.com/c/pay/cs_test_…" }
```

**Errors** `400 invalid_plan` (free plan), `401 unauthorized`,
`404 not_found` (unknown plan), `502 stripe_error`,
`503 stripe_not_configured`

```bash
curl -i -X POST http://localhost:4000/api/v1/subscriptions/checkout \
  -H 'Content-Type: application/json' -b cookies.txt -d '{"planId":"pro"}'
```

### POST /api/v1/subscriptions/cancel

Requires session. Cancels at period end through the Stripe API (a state
change we make — not a redirect). Free plan → `invalid_subscription`.

**Response** `200` — same shape as `GET /subscriptions/current` with
`cancelAtPeriodEnd: true`.

**Errors** `400 invalid_subscription`, `401 unauthorized`, `404 not_found`,
`503 stripe_not_configured`

```bash
curl -i -X POST http://localhost:4000/api/v1/subscriptions/cancel -b cookies.txt
```

### GET /api/v1/billing/summary

Requires session. Current-period metered cost and period bounds; the next
invoice lands at period end.

**Response** `200`

```json
{
  "estimatedCost": 421,
  "currency": "USD",
  "periodStart": "2026-11-01T00:00:00.000Z",
  "periodEnd": "2026-12-01T00:00:00.000Z",
  "nextInvoiceAt": "2026-12-01T00:00:00.000Z",
  "status": "active"
}
```

**Errors** `401 unauthorized`, `404 not_found`

```bash
curl -i http://localhost:4000/api/v1/billing/summary -b cookies.txt
```

---

## Webhooks

### POST /api/v1/webhooks/stripe

Public endpoint, but every delivery must carry a valid
`Stripe-Signature` header over the RAW body (`express.raw` mounts before
the JSON parser). Unverifiable payloads are rejected without a trace.

Duplicate deliveries (same Stripe event id) return `duplicate: true` and
are never reprocessed. Out-of-order `customer.subscription.updated`
events never regress fresher state.

Handled event types: `checkout.session.completed`,
`customer.subscription.updated`, `customer.subscription.deleted`.
Others are recorded but ignored.

**Response** `200`

```json
{ "received": true, "duplicate": false }
```

**Errors** `400 invalid_signature`, `503 stripe_not_configured`

```bash
# signed with the endpoint secret (see EVIDENCE.md for a full replay transcript)
curl -i -X POST http://localhost:4000/api/v1/webhooks/stripe \
  -H "Stripe-Signature: t=1700000000,v1=…" \
  -H 'Content-Type: application/json' \
  -d '{"id":"evt_1","type":"customer.subscription.updated", …}'
```

---

## Usage analytics

All usage routes require a session and are scoped to the caller's tenant.

### GET /api/v1/usage/summary

Current-period totals, daily series (zero-filled through today), quota vs
plan limits, and recent usage alerts.

**Response** `200`

```json
{
  "totalApiCalls": 60,
  "totalTokens": 6000,
  "estimatedCost": 42,
  "currency": "USD",
  "apiCallsSeries": [ { "date": "2026-11-11", "value": 10 } ],
  "tokensSeries": [ { "date": "2026-11-11", "value": 1000 } ],
  "costSeries": [ { "date": "2026-11-11", "value": 7 } ],
  "apiCallQuota": { "used": 60, "limit": 1000 },
  "tokenQuota": { "used": 6000, "limit": 100000 },
  "quota": { "apiCalls": { "used": 60, "limit": 1000 }, "tokens": { "used": 6000, "limit": 100000 } },
  "alerts": [ { "id": "…uuid…", "message": "api_calls usage at 80% of the plan limit (800/1000)", "severity": "warning" } ]
}
```

`limit: null` means unlimited. Series points: `{ date: "YYYY-MM-DD", value }`.

**Errors** `401 unauthorized`, `404 not_found`

```bash
curl -i http://localhost:4000/api/v1/usage/summary -b cookies.txt
```

### GET /api/v1/usage

Ranged analytics with breakdowns.

**Query params**

| param | type | default | notes |
| --- | --- | --- | --- |
| from | yyyy-MM-dd | 29 days ago | inclusive |
| to | yyyy-MM-dd | today | inclusive |
| granularity | daily \| weekly \| monthly | daily | bucket size |

**Response** `200`

```json
{
  "apiCallsSeries": [ { "date": "2026-11-11", "value": 20 } ],
  "tokensSeries": [ { "date": "2026-11-11", "value": 2000 } ],
  "costSeries": [ { "date": "2026-11-11", "value": 14 } ],
  "currency": "USD",
  "byApiKey": [ { "name": "key-one", "apiCalls": 40, "tokens": 1000, "cost": 7 } ],
  "byModel": [ { "name": "model-x", "apiCalls": 2, "tokens": 4000, "cost": 28 } ]
}
```

**Errors** `400 validation_error` (bad granularity), `401 unauthorized`

```bash
curl -i "http://localhost:4000/api/v1/usage?from=2026-11-11&to=2026-11-14&granularity=daily" -b cookies.txt
```

### GET /api/v1/usage/history

Paginated, searchable event log.

**Query params**

| param | type | default | notes |
| --- | --- | --- | --- |
| limit | int | 20 | clamped 1–100 |
| offset | int | 0 | |
| search | string | — | matches model OR API key name (ILIKE) |
| from | yyyy-MM-dd | — | inclusive day |
| to | yyyy-MM-dd | — | inclusive day |
| sort | createdAt | createdAt | |
| order | asc \| desc | desc | |

**Response** `200`

```json
{
  "items": [
    {
      "id": "…uuid…", "type": "ai_tokens", "createdAt": "2026-11-14T12:15:30.000Z",
      "apiKeyName": "key-two", "model": "model-x",
      "quantity": 3000, "inputTokens": 2000, "outputTokens": 1000,
      "cost": 21, "status": "recorded"
    }
  ],
  "total": 6
}
```

**Errors** `401 unauthorized`

```bash
curl -i "http://localhost:4000/api/v1/usage/history?limit=2&offset=2&search=model-x" -b cookies.txt
```

---

## Platform admin

All admin routes require a session whose user carries the platform-admin
flag — a regular tenant admin gets `403 forbidden`.

### GET /api/v1/admin/tenants

**Response** `200`

```json
{
  "items": [
    {
      "id": "…uuid…", "name": "Ada Admin's Workspace",
      "plan": "Free", "status": "active",
      "createdAt": "2026-11-14T12:00:00.000Z", "memberCount": 1
    }
  ]
}
```

**Errors** `401 unauthorized`, `403 forbidden`

```bash
curl -i http://localhost:4000/api/v1/admin/tenants -b admin-cookies.txt
```

### GET /api/v1/admin/metrics

Platform-wide counters. `jobs.failed` includes permanently dead jobs.

**Response** `200`

```json
{
  "totalTenants": 2,
  "activeSubscriptions": 2,
  "totalApiCalls": 55,
  "totalTokens": 2000,
  "estimatedRevenue": 2900,
  "currency": "USD",
  "jobs": { "pending": 2, "processing": 1, "failed": 2, "completed": 3 }
}
```

**Errors** `401 unauthorized`, `403 forbidden`

```bash
curl -i http://localhost:4000/api/v1/admin/metrics -b admin-cookies.txt
```

### GET /api/v1/admin/webhooks

Most recent Stripe webhook deliveries (up to 50).

**Response** `200`

```json
{
  "items": [
    {
      "id": "…uuid…", "type": "customer.subscription.updated",
      "status": "processed", "receivedAt": "2026-11-14T12:30:00.000Z"
    }
  ]
}
```

**Errors** `401 unauthorized`, `403 forbidden`

```bash
curl -i http://localhost:4000/api/v1/admin/webhooks -b admin-cookies.txt
```

---

## Error codes

| code | HTTP | meaning |
| --- | --- | --- |
| `bad_request` | 400 | Request body is not valid JSON |
| `validation_error` | 400 | Zod rejected the body/query |
| `invalid_plan` | 400 | Plan cannot be purchased (e.g. free) |
| `invalid_subscription` | 400 | No paid subscription to cancel |
| `idempotency_key_required` | 400 | Missing Idempotency-Key on /metering/track |
| `invalid_signature` | 400 | Stripe webhook signature missing or wrong |
| `unauthorized` | 401 | No valid session |
| `invalid_credentials` | 401 | Wrong email or password |
| `invalid_api_key` | 401 | Unknown/revoked API key |
| `forbidden` | 403 | Authenticated but not allowed here |
| `bad_origin` | 403 | Cross-origin write blocked (CSRF guard) |
| `not_found` | 404 | Resource missing or not yours (IDOR-safe) |
| `payment_required` | 402 | Subscription is past_due/unpaid |
| `quota_exceeded` | 429 | Plan limit reached (details: scope/used/limit) |
| `rate_limited` | 429 | IP rate limit hit (Retry-After header) |
| `stripe_error` | 502 | Stripe returned no usable result |
| `stripe_not_configured` | 503 | STRIPE_* env vars absent on this deployment |
| `not_implemented` | 501 | Honest stub (e.g. password reset) |
| `internal_error` | 500 | Unexpected server failure |
| `email_taken` | 409 | Registration with an existing email |
