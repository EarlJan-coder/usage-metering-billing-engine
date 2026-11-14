import request from "supertest";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { seedPlans, utcMonthBounds } from "../src/db/seed.js";
import * as schema from "../src/db/schema.js";
import { closeTestDb, db, resetDb } from "./helpers/db.js";
import { registerUser } from "./helpers/auth.js";
import { generateApiKey } from "../src/services/api-key.js";

const app = createApp(db);
const { apiKeys, plans, subscriptions, usageEvents } = schema;

let keyCounter = 0;

async function makeKey(tenantId: string): Promise<string> {
  keyCounter += 1;
  const { plaintext, keyPrefix, keyHash } = generateApiKey();
  await db.insert(apiKeys).values({
    tenantId,
    name: `quota-${keyCounter}`,
    keyPrefix,
    keyHash,
  });
  return `Bearer ${plaintext}`;
}

async function setPlanLimits(
  tenantId: string,
  limits: { calls: number | null; tokens: number | null },
): Promise<void> {
  const [plan] = await db
    .select()
    .from(plans)
    .where(eq(plans.code, "free"))
    .limit(1);
  await db
    .update(plans)
    .set({ apiCallsLimit: limits.calls, aiTokensLimit: limits.tokens })
    .where(eq(plans.id, plan!.id));
}

async function seedUsage(
  tenantId: string,
  planId: string,
  opts: {
    apiCalls?: number;
    tokens?: number;
    createdAt?: Date;
    idPrefix?: string;
  } = {},
): Promise<void> {
  const { apiCalls = 0, tokens = 0, createdAt, idPrefix = "seed" } = opts;
  if (apiCalls > 0) {
    await db.insert(usageEvents).values({
      tenantId,
      type: "api_call",
      quantity: apiCalls,
      costMinor: 0,
      pricingVersion: 1,
      idempotencyKey: `${idPrefix}-calls`,
      ...(createdAt ? { createdAt } : {}),
    });
  }
  if (tokens > 0) {
    await db.insert(usageEvents).values({
      tenantId,
      type: "ai_tokens",
      quantity: tokens,
      costMinor: 0,
      pricingVersion: 1,
      idempotencyKey: `${idPrefix}-tokens`,
      ...(createdAt ? { createdAt } : {}),
    });
  }
  void planId;
}

async function setSubscriptionStatus(
  tenantId: string,
  status: "active" | "trialing" | "past_due" | "unpaid" | "canceled",
): Promise<void> {
  await db
    .update(subscriptions)
    .set({ status })
    .where(eq(subscriptions.tenantId, tenantId));
}

describe("quota enforcement (Task 8)", () => {
  let header: string;
  let tenantId: string;
  let planId: string;

  beforeEach(async () => {
    await resetDb();
    await seedPlans(db);
    const a = await registerUser(app);
    tenantId = a.body.tenant.id;
    header = await makeKey(tenantId);
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId));
    planId = sub!.planId;
  });

  afterAll(closeTestDb);

  let idemCounter = 0;
  const track = (body: Record<string, unknown>, key = header) => {
    idemCounter += 1;
    return request(app)
      .post("/api/v1/metering/track")
      .set("Authorization", key)
      .set("Idempotency-Key", `q-${idemCounter}-${Math.random().toString(36).slice(2)}`)
      .send(body);
  };

  test("999 used + 1 → 201; 1000 used + 1 → 429 (exact boundary)", async () => {
    await seedUsage(tenantId, planId, { apiCalls: 999 });

    const permitted = await track({ type: "api_call", quantity: 1 });
    expect(permitted.status).toBe(201);

    const rejected = await track({ type: "api_call", quantity: 1 });
    expect(rejected.status).toBe(429);
    expect(rejected.body.error.code).toBe("quota_exceeded");
    expect(rejected.body.error.details).toMatchObject({
      scope: "api_calls",
      used: 1000,
      limit: 1000,
    });
    expect(rejected.headers["retry-after"]).toBeDefined();
  });

  test("token quota is enforced independently", async () => {
    await seedUsage(tenantId, planId, { tokens: 99_000 });
    await setPlanLimits(tenantId, { calls: null, tokens: 100_000 });

    const ok = await track({
      type: "ai_tokens",
      inputTokens: 1_000,
      outputTokens: 0,
    });
    expect(ok.status).toBe(201); // 99_000 + 1_000 = 100_000 <= 100_000

    const over = await track({
      type: "ai_tokens",
      inputTokens: 1,
      outputTokens: 0,
    });
    expect(over.status).toBe(429);
    expect(over.body.error.details).toMatchObject({
      scope: "tokens",
      limit: 100_000,
    });
  });

  test("null limit never rejects", async () => {
    await setPlanLimits(tenantId, { calls: null, tokens: null });
    await seedUsage(tenantId, planId, { apiCalls: 10_000_000 });

    const res = await track({ type: "api_call", quantity: 5_000 });
    expect(res.status).toBe(201);
  });

  test("past_due subscription → 402 payment_required", async () => {
    await setSubscriptionStatus(tenantId, "past_due");

    const res = await track({ type: "api_call", quantity: 1 });
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe("payment_required");

    // no event recorded for a payment-restricted tenant
    const rows = await db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.tenantId, tenantId));
    expect(rows).toHaveLength(0);
  });

  test("unpaid subscription → 402 as well", async () => {
    await setSubscriptionStatus(tenantId, "unpaid");
    const res = await track({ type: "api_call", quantity: 1 });
    expect(res.status).toBe(402);
  });

  test("stale free-plan month rolls lazily to the current UTC month", async () => {
    // Seed a free subscription whose bounds are LAST month plus heavy usage.
    const lastMonth = new Date(Date.UTC(2020, 5, 1));
    const lastMonthEnd = new Date(Date.UTC(2020, 6, 1));
    await db
      .update(subscriptions)
      .set({
        currentPeriodStart: lastMonth,
        currentPeriodEnd: lastMonthEnd,
      })
      .where(eq(subscriptions.tenantId, tenantId));
    await seedUsage(tenantId, planId, {
      apiCalls: 5_000, // way over the 1000 limit — but from an old period
      createdAt: new Date("2020-06-15T12:00:00Z"),
      idPrefix: "old-period",
    });

    const res = await track({ type: "api_call", quantity: 1 });
    expect(res.status).toBe(201);

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId));
    const { start, end } = utcMonthBounds();
    expect(sub!.currentPeriodStart!.toISOString()).toBe(start.toISOString());
    expect(sub!.currentPeriodEnd!.toISOString()).toBe(end.toISOString());
  });

  test("events from earlier this month still count toward the limit", async () => {
    const { start } = utcMonthBounds();
    const earlierThisMonth = new Date(start.getTime() + 12 * 3600 * 1000);
    await seedUsage(tenantId, planId, {
      apiCalls: 1_000,
      createdAt: earlierThisMonth,
      idPrefix: "this-month",
    });

    const res = await track({ type: "api_call", quantity: 1 });
    expect(res.status).toBe(429);
    expect(res.body.error.details.used).toBe(1000);
  });

  test("canceled subscription falls back to free-plan limits", async () => {
    await setSubscriptionStatus(tenantId, "canceled");
    await seedUsage(tenantId, planId, { apiCalls: 1_000 });

    const res = await track({ type: "api_call", quantity: 1 });
    expect(res.status).toBe(429); // free limit still enforced
  });

  test("canceled + under limit still records", async () => {
    await setSubscriptionStatus(tenantId, "canceled");
    const res = await track({ type: "api_call", quantity: 1 });
    expect(res.status).toBe(201);
  });

  test("quota rejection writes no event row", async () => {
    await seedUsage(tenantId, planId, { apiCalls: 1_000 });
    const before = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(usageEvents)
      .where(eq(usageEvents.tenantId, tenantId));

    await track({ type: "api_call", quantity: 1 });

    const after = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(usageEvents)
      .where(eq(usageEvents.tenantId, tenantId));
    expect(after[0]!.n).toBe(before[0]!.n);
  });

  test("quota is per-tenant: tenant B unaffected by tenant A's usage", async () => {
    await seedUsage(tenantId, planId, { apiCalls: 1_000 });

    const b = await registerUser(app);
    const headerB = await makeKey(b.body.tenant.id);

    const res = await track({ type: "api_call", quantity: 1 }, headerB);
    expect(res.status).toBe(201);
  });
});
