# Backend — Usage Metering & Billing Engine

Express + TypeScript + PostgreSQL (Drizzle ORM) service implementing
idempotent usage metering, quota enforcement, versioned cost calculation,
Stripe test-mode billing with verified webhooks, and a background job
queue. Full endpoint reference: [`docs/API.md`](docs/API.md).

## Prerequisites

- Node.js 20+
- Docker (for PostgreSQL)

## Run it

```bash
# 1. start PostgreSQL (host port 5433 — 5432 is often taken locally)
docker compose up -d

# 2. install dependencies
npm install

# 3. configure the environment
cp .env.example .env          # then edit as needed

# 4. apply migrations and seed the plan catalog
npm run migrate
npm run seed

# 5. start the API (port 4000, all routes under /api/v1)
npm run dev

# 6. run the test suite (uses the separate billing_test database)
npm test
```

`npm run seed` is idempotent — safe to run repeatedly. It loads the
`free`/`pro` plans, pricing version 1, and a demo platform-admin user
(`demo@example.com` / `demo-password-1` — development only).

## Scripts

| script | what it does |
| --- | --- |
| `npm run dev` | tsx watch on `src/server.ts` |
| `npm run build` | compile to `dist/` |
| `npm start` | run the compiled server |
| `npm test` | vitest against the `billing_test` database |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run migrate` | apply Drizzle migrations to `DATABASE_URL` |
| `npm run seed` | idempotent plan/pricing/demo seed |

## Environment

See [`.env.example`](.env.example). Highlights:

| variable | required | notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | e.g. `postgres://billing:billing@localhost:5433/billing` |
| `SESSION_SECRET` | yes | signs session token hashes |
| `CORS_ORIGIN` | no | default `http://localhost:3000` |
| `STRIPE_SECRET_KEY` | no | absent → billing endpoints answer `503 stripe_not_configured` |
| `STRIPE_WEBHOOK_SECRET` | no | absent → `/webhooks/stripe` refuses deliveries |
| `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` | no | checkout redirects |
| `WORKER_DISABLED` | no | set `1` to run the API without the background worker |

## Architecture

```
src/
  app.ts                 Express app factory + listRoutes() registry
  server.ts              boot + background worker
  config/                env validation, pricing tables
  db/                    Drizzle schema (15 tables), migrations, seed
  middleware/            auth, validation, origin check, rate limits, errors
  modules/               one folder per feature: routes + service (+ repository)
    auth/ tenants/ plans/ api-keys/ metering/ quotas/ cost-calculation/
    subscriptions/ webhooks/ usage-analytics/ billing/ admin/
  jobs/                  queue + runner + handlers (alerts, rollups, reconcile)
  services/              sessions, API keys, Stripe wrapper
  codes.ts               canonical error-code registry
tests/                   120+ tests, all against a real Postgres
```

Key behaviours worth knowing:

- **Metering is idempotent**: `Idempotency-Key` replays return the
  original result (even with a different body) and create no new event.
- **Quotas are exact**: `used + incoming <= limit` passes; over the limit
  is `429 quota_exceeded` with `Retry-After` and `{ scope, used, limit }`.
  `past_due`/`unpaid` subscriptions get `402`.
- **Money is integers**: minor units end to end, BigInt half-up rounding
  per million tokens. Reasoning tokens are a subset of output and are
  never re-priced.
- **Webhooks are verified**: `stripe-signature` over the raw body, per
  event-id dedupe in `webhook_events`, out-of-order guard per
  subscription. The checkout redirect changes nothing by itself.
