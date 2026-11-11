# Backend Development Plan — Usage Metering & Billing Engine

## 1. Objective

Build a reliable, secure, multi-tenant Usage Metering & Billing Engine that tracks API calls and AI token consumption, enforces subscription quotas, calculates usage costs, and synchronizes subscription information with Stripe.

The backend must be developed independently of the frontend and expose a documented REST API.

## 2. Technology Stack

- **Runtime:** Node.js
- **Language:** TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL
- **ORM:** Drizzle ORM
- **Validation:** Zod
- **Authentication:** Session-based authentication or JWT
- **Payment Integration:** Stripe Test Mode
- **Background Jobs:** PostgreSQL-backed job queue or equivalent
- **Testing:** Vitest and Supertest
- **Development:** Docker and Docker Compose

## 3. Backend Architecture

Use a modular monolith with clearly separated responsibilities.

```text
backend/
├── src/
│   ├── config/
│   ├── db/
│   │   ├── schema/
│   │   ├── migrations/
│   │   └── seed.ts
│   ├── middleware/
│   ├── modules/
│   │   ├── auth/
│   │   ├── tenants/
│   │   ├── plans/
│   │   ├── subscriptions/
│   │   ├── metering/
│   │   ├── quotas/
│   │   ├── cost-calculation/
│   │   ├── usage-analytics/
│   │   ├── billing/
│   │   ├── api-keys/
│   │   ├── webhooks/
│   │   └── admin/
│   ├── jobs/
│   ├── services/
│   ├── utils/
│   ├── app.ts
│   └── server.ts
├── tests/
├── Dockerfile
├── docker-compose.yml
├── drizzle.config.ts
├── package.json
└── .env.example
```

Each module should contain its own routes, controller, service, schema, and repository where appropriate.

## 4. Database Design

Create PostgreSQL tables for:

1. Users
2. Tenants
3. Tenant Members
4. Plans
5. Subscriptions
6. Usage Events
7. AI Token Usage Details
8. Idempotency Records
9. Webhook Events
10. API Keys
11. Background Jobs
12. Usage Alerts

Requirements:
- Use UUID primary keys.
- Add appropriate foreign keys and indexes.
- Enforce tenant-level data isolation.
- Store timestamps consistently in UTC.
- Use database transactions for critical operations.
- Store monetary values using integer minor units or another exact decimal representation.
- Add migrations and seed scripts.

## 5. Core Backend Modules

### A. Authentication and Tenant Management

Implement:
- User registration and login.
- Secure password hashing.
- Session management.
- Tenant creation.
- Tenant membership.
- Role-based authorization.
- Tenant-scoped database queries.

Every tenant-owned resource must be checked against the authenticated tenant.

### B. Plans and Subscription Management

Create two initial plans:

**Free Plan**
- 1,000 API calls/month.
- 100,000 AI tokens/month.

**Pro Plan**
- Higher configurable limits.
- Stripe-backed subscription.

Requirements:
- Plan configuration must not be hardcoded throughout the application.
- Store subscription status.
- Track billing periods.
- Support subscription upgrades and downgrades.
- Sync subscription state through Stripe webhooks.

### C. Usage Metering

Build the central usage tracking service.

Track:
- API request count.
- AI input tokens.
- AI output tokens.
- Cached input tokens.
- Reasoning tokens where applicable.

Requirements:
- Each billable request must have an idempotency key.
- Repeated requests using the same key must not create duplicate usage events.
- The repeated request should return the original result.
- Use transactions to protect against concurrent duplicate requests.
- Preserve enough metadata to audit usage.

### D. Quota Enforcement

Before processing a billable request:

1. Identify the tenant.
2. Retrieve the active subscription.
3. Retrieve the plan limits.
4. Retrieve current usage for the billing period.
5. Calculate projected usage.
6. Determine whether the request is permitted.
7. Record usage if accepted.

Expected behavior:
- Requests within limits are accepted.
- Requests that exceed usage quotas return HTTP 429.
- Payment or subscription restrictions return HTTP 402 where appropriate.
- Exact quota boundaries must be handled consistently.
- Concurrent requests must not bypass quota enforcement.

### E. Cost Calculation

Implement a dedicated pricing engine.

Requirements:
- Keep pricing constants in configuration.
- Support different input and output token rates.
- Apply cheaper rates for cached input tokens.
- Count reasoning tokens correctly without double-counting overlapping categories.
- Use exact arithmetic.
- Store pricing versions for historical calculations.
- Produce reproducible cost calculations.

AI usage can be simulated. An actual AI model is not required by the capstone.

### F. Usage Analytics and Billing

Provide services for:
- Daily usage summaries.
- Monthly usage summaries.
- API call totals.
- AI token totals.
- Estimated costs.
- Usage breakdowns.
- Current subscription information.
- Remaining quota.

### G. Stripe Integration

Use Stripe Test Mode only.

Implement:
- Stripe Checkout Session creation.
- Subscription retrieval.
- Subscription synchronization.
- Webhook signature verification.
- Webhook event deduplication.

Handle:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Important:
Never activate a subscription solely because the frontend redirects to a success page. The verified webhook must update the subscription state.

### H. Background Jobs

Implement at least one background processing workflow.

Recommended jobs:
- Usage threshold alerts.
- Monthly usage aggregation.
- Stripe subscription reconciliation.

Requirements:
- Retry failed jobs.
- Use exponential backoff.
- Prevent duplicate job execution where necessary.
- Log failures.
- Provide a way to identify permanently failed jobs.

### I. API Key Management

Implement:
- API key generation.
- Secure key hashing.
- Key validation.
- Key revocation.
- Last-used timestamps.
- Tenant ownership.

Display plaintext keys only once when created.

## 6. REST API Contract

Use `/api/v1` as the API prefix.

| Module | Suggested endpoints |
|---|---|
| Authentication | POST `/auth/register`, POST `/auth/login`, POST `/auth/logout`, GET `/auth/me` |
| Tenants | GET `/tenants`, POST `/tenants`, GET `/tenants/:id` |
| Plans | GET `/plans` |
| Usage | GET `/usage`, GET `/usage/history`, GET `/usage/summary` |
| Metering | POST `/metering/track` |
| Billing | GET `/billing/summary`, GET `/billing/invoices` |
| Subscriptions | GET `/subscriptions/current`, POST `/subscriptions/checkout`, POST `/subscriptions/cancel` |
| API Keys | GET `/api-keys`, POST `/api-keys`, DELETE `/api-keys/:id` |
| Webhooks | POST `/webhooks/stripe` |
| Admin | GET `/admin/tenants`, GET `/admin/metrics`, GET `/admin/webhooks` |

These are proposed application endpoints. Invoice endpoints should only be implemented if invoice functionality is included.

Document every endpoint with:
- HTTP method.
- Request parameters.
- Request body.
- Response structure.
- Authentication requirements.
- Error responses.
- Example requests.

## 7. Backend Development Phases

### Phase 1 — Architecture and Project Setup
- Initialize TypeScript and Express.
- Configure environment variables.
- Configure PostgreSQL and Drizzle.
- Establish module structure.
- Configure logging and error handling.
- Set up Docker.

### Phase 2 — Database and Tenant Foundation
- Create database schemas.
- Implement migrations.
- Seed Free and Pro plans.
- Implement users and tenants.
- Implement tenant isolation.

### Phase 3 — Authentication and API Security
- Registration and login.
- Password hashing.
- Session handling.
- Authorization middleware.
- Zod validation.
- Rate limiting.

### Phase 4 — Usage Metering
- Build usage event service.
- Implement idempotency.
- Implement API call tracking.
- Implement simulated AI token tracking.
- Test duplicate requests.

### Phase 5 — Quota Enforcement
- Implement quota calculations.
- Enforce billing-period limits.
- Handle exact boundaries.
- Handle concurrent requests.
- Implement proper error responses.

### Phase 6 — Cost Calculation
- Implement token pricing.
- Implement API usage pricing if applicable.
- Add cached token pricing.
- Add pricing versioning.
- Test exact cost totals.

### Phase 7 — Stripe Integration
- Configure Stripe Test Mode.
- Create Checkout Sessions.
- Implement webhook verification.
- Implement webhook deduplication.
- Synchronize subscription status.

### Phase 8 — Background Processing
- Configure job processing.
- Implement retries.
- Implement usage alerts.
- Implement failure logging.

### Phase 9 — Analytics and API Completion
- Build usage summaries.
- Build cost breakdowns.
- Complete API documentation.
- Verify frontend-facing response structures.

### Phase 10 — Testing and Hardening
- Unit tests.
- Integration tests.
- Acceptance tests.
- Tenant isolation tests.
- Idempotency tests.
- Stripe webhook tests.
- Concurrency tests.

## 8. Backend Definition of Done

- [ ] PostgreSQL database and migrations work.
- [ ] Users and tenants are isolated.
- [ ] Usage events are recorded correctly.
- [ ] Duplicate requests do not create duplicate events.
- [ ] Quotas are enforced correctly.
- [ ] Costs are calculated accurately.
- [ ] Stripe test subscriptions synchronize through verified webhooks.
- [ ] Webhook replays are handled safely.
- [ ] Background jobs support retries.
- [ ] API documentation is available.
- [ ] Automated tests pass.
- [ ] `.env.example` is provided.
- [ ] No secrets are committed.
- [ ] Backend can run independently.

## 9. Required Documentation

Create:
- `README.md`
- `BUILDLOG.md`
- `EVIDENCE.md`
- `capstone.yaml`
- `.env.example`

The backend should be fully usable through API requests before frontend integration begins.