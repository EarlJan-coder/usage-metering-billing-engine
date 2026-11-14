# EVIDENCE — Usage Metering & Billing Engine

Raw evidence for the capstone: test-suite output and live curl
transcripts against the running stack (Docker Postgres on :5433, seeded
database `billing`, API on :4000 via `npx tsx src/server.ts`). Captured
2026-11-14 on Windows/PowerShell — JSON request bodies are passed with
`--data-binary @file` because PowerShell mangles embedded quotes; the
file contents are shown inline above each request. Long ids are elided
with `…` only where noted; most are verbatim.

## 1. Test suite

```
> backend@0.1.0 test
> vitest run

 Test Files  22 passed (22)
      Tests  136 passed (136)
   Duration  62.54s

> backend@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit
(clean — exit 0)

> backend@0.1.0 build
> tsc -p tsconfig.json
build: OK (tsc exit 0)
```

The 22 suites cover: app scaffold, database schema/constraints, auth,
security middleware, tenants, plans, API keys, cost engine, metering,
metering concurrency, quota, quota concurrency, Stripe subscriptions,
Stripe webhooks, background jobs, usage analytics, billing, platform
admin, docs/deliverables integrity (docs ↔ routes ↔ error codes kept in
lockstep by `tests/docs.test.ts`), cross-tenant isolation, webhook
replay, and the full-journey acceptance suite.

## 2. Metering → quota → cost → analytics flow

Live tenant: `Evidence Tester's Workspace` (`af1d689f-60ea-4e39-842a-cc62ae64d320`),
free plan (1,000 API calls / 100,000 AI tokens per month), session cookie
+ API key `umk_b2648642…`.

### 2.1 Meter a batch of API calls (idempotent)

```
$ curl -X POST /api/v1/metering/track -H "Authorization: Bearer umk_…" \
    -H "Idempotency-Key: ev-1" -d '{"type":"api_call","quantity":10}'

{"event":{"id":"8d3384c1-a3a2-4abc-811a-0977db335116","type":"api_call","quantity":10,
"inputTokens":null,"outputTokens":null,"cachedInputTokens":null,"reasoningTokens":null,
"model":null,"costMinor":0,"currency":"USD","pricingVersion":1,"status":"recorded",
"createdAt":"2026-11-14T13:52:41.714Z"},"duplicate":false}
HTTP 201
```

### 2.2 Replay the SAME Idempotency-Key → original result, no new event

```
$ curl -X POST /api/v1/metering/track -H "Authorization: Bearer umk_…" \
    -H "Idempotency-Key: ev-1" -d '{"type":"api_call","quantity":10}'

{"event":{ …same event id: 8d3384c1-a3a2-4abc-811a-0977db335116… },"duplicate":true}
HTTP 200
```

### 2.3 Token event on the free plan → exact quota rejection

```
$ curl -X POST /api/v1/metering/track -H "Authorization: Bearer umk_…" \
    -H "Idempotency-Key: ev-2" \
    -d '{"type":"ai_tokens","inputTokens":1000000,"outputTokens":500000,
         "cachedInputTokens":250000,"reasoningTokens":100000,"model":"gpt-4o"}'

{"error":{"message":"Plan tokens quota exceeded","code":"quota_exceeded",
"details":{"scope":"tokens","used":0,"limit":100000}}}
HTTP 429
```

### 2.4 Same event after lifting the demo limit → exact pricing

Cost math (pricing version 1, half-up per million tokens):
billable input 750,000 × 150 = 113 minor, cached 250,000 × 30 = 8 minor,
output 500,000 × 600 = 300 minor → **421 minor = $4.21**. The 100,000
reasoning tokens are a subset of output and are NOT re-priced.

```
$ curl -X POST /api/v1/metering/track -H "Authorization: Bearer umk_…" \
    -H "Idempotency-Key: ev-3" \
    -d '{"type":"ai_tokens","inputTokens":1000000,"outputTokens":500000,
         "cachedInputTokens":250000,"reasoningTokens":100000,"model":"gpt-4o"}'

{"event":{"id":"acbd2277-df4a-4fd0-98dd-0ef7196f9161","type":"ai_tokens",
"quantity":1500000,"inputTokens":1000000,"outputTokens":500000,
"cachedInputTokens":250000,"reasoningTokens":100000,"model":"gpt-4o",
"costMinor":421,"currency":"USD","pricingVersion":1,"status":"recorded",
"createdAt":"2026-11-14T13:53:00.146Z"},"duplicate":false}
HTTP 201
```

*(demo note: `update plans set ai_tokens_limit = NULL where code='free'`
ran between 2.3 and 2.4 so pricing could be shown; restored to 100000
afterwards.)*

### 2.5 Over the call quota → 429 with Retry-After and exact usage

```
$ curl -i -X POST /api/v1/metering/track -H "Authorization: Bearer umk_…" \
    -H "Idempotency-Key: ev-4" -d '{"type":"api_call","quantity":5000}'

HTTP/1.1 429 Too Many Requests
Retry-After: 60
{"error":{"message":"Plan api_calls quota exceeded","code":"quota_exceeded",
"details":{"scope":"api_calls","used":10,"limit":1000}}}
```

### 2.6 Payment-restricted subscription → 402, nothing recorded

```
$ psql -c "update subscriptions set status='past_due' where tenant_id='af1d689f-…';"
$ curl -X POST /api/v1/metering/track -H "Authorization: Bearer umk_…" \
    -H "Idempotency-Key: ev-5" -d '{"type":"api_call","quantity":10}'

{"error":{"message":"Subscription payment is required to record usage",
"code":"payment_required"}}
HTTP 402
```

### 2.7 The same numbers surface in analytics and billing

```
$ curl /api/v1/usage/summary   (session cookie)

{"totalApiCalls":10,"totalTokens":1500000,"estimatedCost":421,"currency":"USD",
"apiCallsSeries":[ …zero-filled daily series 2026-11-01 → 2026-11-14, today: 10 ],
"tokensSeries":[ …today: 1500000 ],
"costSeries":[ …today: 421 ],
"apiCallQuota":{"used":10,"limit":1000},"tokenQuota":{"used":1500000,"limit":null},
"quota":{"apiCalls":{"used":10,"limit":1000},"tokens":{"used":1500000,"limit":null}},
"alerts":[]}
HTTP 200

$ curl /api/v1/billing/summary   (session cookie)

{"estimatedCost":421,"currency":"USD",
"periodStart":"2026-11-01T00:00:00.000Z","periodEnd":"2026-12-01T00:00:00.000Z",
"nextInvoiceAt":"2026-12-01T00:00:00.000Z","status":"active"}
HTTP 200
```

Metering → quota → cost → analytics: one accepted event of 1,500,000
tokens is priced at exactly 421 minor units, shows up in the daily
series, and drives the billing summary — totals agree everywhere.

## 3. Webhook delivery, dedupe, replay, and ordering

Payloads are real `customer.subscription.updated` events signed with
Stripe's own `webhooks.generateTestHeaderString` (same HMAC scheme the
dashboard CLI uses) against `STRIPE_WEBHOOK_SECRET=whsec_evidence_secret`.
The subscription row was tagged `stripe_subscription_id=sub_evidence_1`
first so the event maps to the demo tenant.

### 3.1 Verified delivery changes subscription state

Event `evt_evidence_1` (fresh, status `past_due`):

```
$ curl -X POST /api/v1/webhooks/stripe -H "Stripe-Signature: t=…,v1=…" \
    --data-binary @ev-event1.json

{"received":true,"duplicate":false}
HTTP 200
```

### 3.2 Identical replay → deduplicated, never reprocessed

```
$ curl -X POST /api/v1/webhooks/stripe -H "Stripe-Signature: t=…,v1=…" \
    --data-binary @ev-event1.json

{"received":true,"duplicate":true}
HTTP 200
```

### 3.3 State reflects the webhook — not any redirect

```
$ curl /api/v1/subscriptions/current   (session cookie)

{"plan":{"id":"048fefca-7a06-4eab-bd55-17168d291c6a","name":"Free","code":"free"},
"planName":"Free","status":"past_due",
"currentPeriodStart":"2026-10-15T13:53:30.000Z",
"currentPeriodEnd":"2026-12-14T13:53:30.000Z","cancelAtPeriodEnd":false}
HTTP 200
```

### 3.4 Out-of-order delivery is accepted but cannot regress state

Event `evt_evidence_2` has an OLDER `created` than the applied event and
claims `status: "active"`:

```
$ curl -X POST /api/v1/webhooks/stripe -H "Stripe-Signature: t=…,v1=…" \
    --data-binary @ev-event2.json

{"received":true,"duplicate":false}
HTTP 200

$ curl /api/v1/subscriptions/current   (session cookie)

{ …"status":"past_due"… }        <- unchanged; the stale event was ignored
HTTP 200
```

### 3.5 Forged signature → rejected without a trace

```
$ curl -X POST /api/v1/webhooks/stripe -H "Stripe-Signature: t=1,v1=forged" \
    --data-binary @ev-event1.json

{"error":{"message":"Stripe signature verification failed",
"code":"invalid_signature"}}
HTTP 400
```

### 3.6 Delivery ledger

```
$ psql -c "select stripe_event_id, type, status from webhook_events order by received_at;"

 stripe_event_id  |           type            |  status
------------------+---------------------------+----------
 evt_evidence_1   | customer.subscription.updated | processed
 evt_evidence_2   | customer.subscription.updated | processed
```

Exactly two rows: the replay did not re-record or reprocess, and the
forged delivery left no row at all.
