import request from "supertest";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

import { createApp } from "../src/app.js";
import { seedPlans, utcMonthBounds } from "../src/db/seed.js";
import * as schema from "../src/db/schema.js";
import { backoffDelayMs, enqueueJob } from "../src/jobs/queue.js";
import { registerJobHandler, runOnce } from "../src/jobs/runner.js";
import { closeTestDb, db, resetDb } from "./helpers/db.js";
import { registerUser } from "./helpers/auth.js";
import { generateApiKey } from "../src/services/api-key.js";

const h = vi.hoisted(() => ({
  retrieve: vi.fn(),
}));

vi.mock("../src/services/stripe.js", async () => {
  const { default: StripeCtor } = await import("stripe");
  const real = new StripeCtor("sk_test_dummy");
  return {
    getStripe: () => ({
      webhooks: real.webhooks,
      subscriptions: { retrieve: h.retrieve },
    }),
  };
});

const app = createApp(db);
const {
  apiKeys,
  backgroundJobs,
  plans,
  subscriptions,
  usageAlerts,
  usageEvents,
  usageMonthlyRollups,
} = schema;

async function jobCount(): Promise<number> {
  const rows = await db.select({ n: count() }).from(backgroundJobs);
  return Number(rows[0]!.n);
}

async function seedUsage(
  tenantId: string,
  opts: {
    apiCalls?: number;
    tokens?: number;
    apiCallCostMinor?: number;
    tokenCostMinor?: number;
    createdAt?: Date;
    idPrefix?: string;
  },
): Promise<void> {
  const {
    apiCalls = 0,
    tokens = 0,
    apiCallCostMinor = 0,
    tokenCostMinor = 0,
    createdAt,
    idPrefix = "seed",
  } = opts;
  const when = createdAt ? { createdAt } : {};
  if (apiCalls > 0) {
    await db.insert(usageEvents).values({
      tenantId,
      type: "api_call",
      quantity: apiCalls,
      costMinor: apiCallCostMinor,
      pricingVersion: 1,
      idempotencyKey: `${idPrefix}-calls-${Math.random()}`,
      ...when,
    });
  }
  if (tokens > 0) {
    await db.insert(usageEvents).values({
      tenantId,
      type: "ai_tokens",
      quantity: tokens,
      costMinor: tokenCostMinor,
      pricingVersion: 1,
      idempotencyKey: `${idPrefix}-tokens-${Math.random()}`,
      ...when,
    });
  }
}

describe("background jobs (Task 10)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPlans(db);
  });

  afterAll(closeTestDb);

  test("enqueue + runOnce executes the handler and marks the job completed", async () => {
    const seen: Array<Record<string, unknown>> = [];
    registerJobHandler("test_ok", async (_db, payload) => {
      seen.push(payload);
    });

    const id = await enqueueJob(db, {
      type: "test_ok",
      payload: { hello: "world" },
    });
    expect(id).toBeTruthy();

    const processed = await runOnce(db);
    expect(processed).toBe(1);
    expect(seen).toEqual([{ hello: "world" }]);

    const [job] = await db
      .select()
      .from(backgroundJobs)
      .where(eq(backgroundJobs.id, id!));
    expect(job!.status).toBe("completed");
    expect(job!.completedAt).not.toBeNull();
    expect(job!.attempts).toBe(0);
    expect(job!.lastError).toBeNull();
  });

  test("failing handler retries on an exact exponential schedule (attempts 1..4)", async () => {
    registerJobHandler("test_fail", async () => {
      throw new Error("boom");
    });

    const id = await enqueueJob(db, { type: "test_fail", maxAttempts: 5 });
    const exactDelays = [5_000, 10_000, 20_000, 40_000]; // base 5s * 2^(n-1)

    for (let attempt = 1; attempt <= 4; attempt++) {
      // make the retry due now, as an operator would
      await db
        .update(backgroundJobs)
        .set({ runAt: new Date(Date.now() - 1_000) })
        .where(eq(backgroundJobs.id, id!));

      await runOnce(db);

      const [job] = await db
        .select()
        .from(backgroundJobs)
        .where(eq(backgroundJobs.id, id!));
      expect(job!.attempts).toBe(attempt);
      expect(job!.status).toBe("failed"); // retries remain
      expect(job!.lastError).toBe("boom");

      expect(backoffDelayMs(attempt)).toBe(exactDelays[attempt - 1]);
      const aheadMs = job!.runAt.getTime() - Date.now();
      expect(aheadMs).toBeGreaterThan(exactDelays[attempt - 1] - 2_000);
      expect(aheadMs).toBeLessThanOrEqual(exactDelays[attempt - 1] + 2_000);
    }
  });

  test("a job that exhausts maxAttempts becomes dead with lastError set", async () => {
    registerJobHandler("test_fail_dead", async () => {
      throw new Error("kaboom");
    });

    const id = await enqueueJob(db, {
      type: "test_fail_dead",
      maxAttempts: 2,
    });

    for (let i = 0; i < 2; i++) {
      await db
        .update(backgroundJobs)
        .set({ runAt: new Date(Date.now() - 1_000) })
        .where(eq(backgroundJobs.id, id!));
      await runOnce(db);
    }

    const [job] = await db
      .select()
      .from(backgroundJobs)
      .where(eq(backgroundJobs.id, id!));
    expect(job!.status).toBe("dead");
    expect(job!.attempts).toBe(2);
    expect(job!.lastError).toBe("kaboom");

    // permanently failed jobs are never claimed again
    expect(await runOnce(db)).toBe(0);
  });

  test("the same dedupeKey enqueues one row only (no-op on repeat)", async () => {
    registerJobHandler("test_dedupe", async () => undefined);

    const first = await enqueueJob(db, {
      type: "test_dedupe",
      dedupeKey: "dedupe-1",
    });
    const second = await enqueueJob(db, {
      type: "test_dedupe",
      dedupeKey: "dedupe-1",
    });

    expect(first).toBeTruthy();
    expect(second).toBeNull();
    expect(await jobCount()).toBe(1);
  });

  test("two concurrent runOnce calls never double-process one job (SKIP LOCKED)", async () => {
    let runs = 0;
    registerJobHandler("test_count", async () => {
      runs += 1;
    });

    await enqueueJob(db, { type: "test_count" });

    const [a, b] = await Promise.all([runOnce(db), runOnce(db)]);
    expect(a + b).toBe(1);
    expect(runs).toBe(1);
  });

  test("usage_alerts warns at 80% and is idempotent; critical lands at 100%", async () => {
    const a = await registerUser(app);
    const tenantId = a.body.tenant.id;
    await seedUsage(tenantId, { apiCalls: 800, idPrefix: "80pct" });

    await enqueueJob(db, { type: "usage_alerts", payload: { tenantId } });
    await runOnce(db);

    let alerts = await db.select().from(usageAlerts);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      tenantId,
      metric: "api_calls",
      threshold: 80,
      severity: "warning",
    });

    // re-run: the unique (tenant, metric, threshold, period) suppresses dupes
    await enqueueJob(db, { type: "usage_alerts", payload: { tenantId } });
    await runOnce(db);
    alerts = await db.select().from(usageAlerts);
    expect(alerts).toHaveLength(1);

    // crossing 100% adds exactly one critical row
    await seedUsage(tenantId, { apiCalls: 200, idPrefix: "100pct" });
    await enqueueJob(db, { type: "usage_alerts", payload: { tenantId } });
    await runOnce(db);

    alerts = await db.select().from(usageAlerts);
    expect(alerts).toHaveLength(2);
    const seen = alerts
      .map((row) => `${row.metric}:${row.threshold}:${row.severity}`)
      .sort();
    expect(seen).toEqual(["api_calls:100:critical", "api_calls:80:warning"]);
  });

  test("monthly_rollup recomputes the previous month idempotently", async () => {
    const a = await registerUser(app);
    const tenantId = a.body.tenant.id;

    const { start: curStart } = utcMonthBounds();
    const prevStart = utcMonthBounds(new Date(curStart.getTime() - 1)).start;
    const midPrevMonth = new Date(prevStart.getTime() + 15 * 24 * 3600 * 1000);

    await seedUsage(tenantId, {
      apiCalls: 12,
      tokens: 3_400,
      apiCallCostMinor: 55,
      createdAt: midPrevMonth,
      idPrefix: "prev-month",
    });
    // this month's usage must NOT leak into the previous-month rollup
    await seedUsage(tenantId, { apiCalls: 999, idPrefix: "this-month" });

    await enqueueJob(db, { type: "monthly_rollup" });
    await runOnce(db);

    const rollups = await db.select().from(usageMonthlyRollups);
    expect(rollups).toHaveLength(1);
    expect(rollups[0]).toMatchObject({
      tenantId,
      apiCalls: 12,
      tokens: 3_400,
      costMinor: 55,
    });
    expect(rollups[0]!.periodStart.toISOString()).toBe(prevStart.toISOString());

    // re-run: same single row, byte-identical values
    await enqueueJob(db, { type: "monthly_rollup" });
    await runOnce(db);
    const again = await db.select().from(usageMonthlyRollups);
    expect(again).toHaveLength(1);
    expect(again[0]).toEqual(rollups[0]);
  });

  test("stripe_reconcile syncs local state through the stripe wrapper", async () => {
    const a = await registerUser(app);
    const tenantId = a.body.tenant.id;

    const [pro] = await db.select().from(plans).where(eq(plans.code, "pro"));
    await db
      .update(plans)
      .set({ stripePriceId: "price_pro_test" })
      .where(eq(plans.id, pro!.id));
    await db
      .update(subscriptions)
      .set({
        planId: pro!.id,
        stripeCustomerId: "cus_rec_1",
        stripeSubscriptionId: "sub_rec_1",
      })
      .where(eq(subscriptions.tenantId, tenantId));

    h.retrieve.mockResolvedValue({
      id: "sub_rec_1",
      status: "past_due",
      cancel_at_period_end: true,
      current_period_start: 1700000000,
      current_period_end: 1702678400,
      items: { data: [{ price: { id: "price_pro_test" } }] },
    });

    await enqueueJob(db, {
      type: "stripe_reconcile",
      payload: { tenantId },
    });
    expect(await runOnce(db)).toBe(1);
    expect(h.retrieve).toHaveBeenCalledWith("sub_rec_1");

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId));
    expect(sub!.status).toBe("past_due");
    expect(sub!.cancelAtPeriodEnd).toBe(true);
    expect(sub!.planId).toBe(pro!.id);
    expect(sub!.currentPeriodStart!.toISOString()).toBe(
      new Date(1700000000 * 1000).toISOString(),
    );
    expect(sub!.lastStripeEventAt).toBeGreaterThan(0);
  });

  test("metering enqueues one usage_alerts job per tenant-period after accepted tracks", async () => {
    const a = await registerUser(app);
    const tenantId = a.body.tenant.id;

    const { plaintext, keyPrefix, keyHash } = generateApiKey();
    await db
      .insert(apiKeys)
      .values({ tenantId, name: "jobs-test", keyPrefix, keyHash });
    const header = `Bearer ${plaintext}`;

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId));
    const periodIso = sub!.currentPeriodStart!.toISOString();

    for (const key of ["hook-1", "hook-2"]) {
      const res = await request(app)
        .post("/api/v1/metering/track")
        .set("Authorization", header)
        .set("Idempotency-Key", key)
        .send({ type: "api_call", quantity: 1 });
      expect(res.status).toBe(201);
    }

    const jobs = await db.select().from(backgroundJobs);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      type: "usage_alerts",
      status: "pending",
      dedupeKey: `alerts:${tenantId}:${periodIso}`,
    });
  });
});
