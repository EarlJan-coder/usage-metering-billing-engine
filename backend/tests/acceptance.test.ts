import request from "supertest";
import { count, eq } from "drizzle-orm";
import Stripe from "stripe";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

import { createApp } from "../src/app.js";
import { runOnce } from "../src/jobs/runner.js";
import { seedPlans } from "../src/db/seed.js";
import * as schema from "../src/db/schema.js";
import { closeTestDb, db, resetDb } from "./helpers/db.js";
import { registerUser } from "./helpers/auth.js";

const SECRET = "whsec_acceptance_secret_0123456789";

const h = vi.hoisted(() => ({
  retrieve: vi.fn(),
  update: vi.fn(),
  createCustomer: vi.fn(),
  createSession: vi.fn(),
}));

vi.mock("../src/services/stripe.js", async () => {
  const { default: StripeCtor } = await import("stripe");
  const real = new StripeCtor("sk_test_dummy_for_signing");
  return {
    getStripe: () => ({
      webhooks: real.webhooks,
      subscriptions: { retrieve: h.retrieve, update: h.update },
      customers: { create: h.createCustomer },
      checkout: { sessions: { create: h.createSession } },
    }),
  };
});

process.env.STRIPE_WEBHOOK_SECRET = SECRET;
const signer = new Stripe("sk_test_dummy_for_signing");

const app = createApp(db);
const { backgroundJobs, plans, subscriptions, usageAlerts, users } = schema;

describe("acceptance journey (Task 13)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPlans(db);
    h.retrieve.mockReset();
    h.update.mockReset();
    h.createCustomer.mockReset();
    h.createSession.mockReset();
  });

  afterAll(closeTestDb);

  test("register → meter → quota → checkout → webhook → cancel → admin, end to end", async () => {
    // ── register + platform-admin flag + API key ────────────────────────
    const reg = await registerUser(app, { name: "Journey Tester" });
    const cookie = reg.cookie;
    const tenantId = reg.body.tenant.id;
    await db
      .update(users)
      .set({ platformAdmin: true })
      .where(eq(users.id, reg.body.user.id));

    const keyRes = await request(app)
      .post("/api/v1/api-keys")
      .set("Cookie", cookie)
      .send({ name: "journey-key" });
    expect(keyRes.status).toBe(201);
    const authHeader = `Bearer ${keyRes.body.plaintext}`;

    const track = (idemKey: string, body: object) =>
      request(app)
        .post("/api/v1/metering/track")
        .set("Authorization", authHeader)
        .set("Idempotency-Key", idemKey)
        .send(body);

    // ── 10 tracks, one of them a duplicate replay → 9 counted events ────
    for (let i = 0; i < 10; i++) {
      const res = await track(i === 2 ? "acc-track-0" : `acc-track-${i}`, {
        type: "api_call",
        quantity: 1,
      });
      expect(res.status).toBe(i === 2 ? 200 : 201);
      expect(res.body.duplicate).toBe(i === 2);
    }
    // plus one token event for the cost assertion
    const tokens = await track("acc-tokens", {
      type: "ai_tokens",
      inputTokens: 50_000,
      outputTokens: 25_000,
    });
    expect(tokens.status).toBe(201);
    // 50k×150 + 25k×600 half-up per million → 8 + 15 = 23 minor
    expect(tokens.body.event.costMinor).toBe(23);

    // ── summary: 9 counted calls + the token cost ───────────────────────
    const summary = await request(app)
      .get("/api/v1/usage/summary")
      .set("Cookie", cookie);
    expect(summary.body.totalApiCalls).toBe(9);
    expect(summary.body.totalTokens).toBe(75_000);
    expect(summary.body.estimatedCost).toBe(23);
    expect(summary.body.apiCallQuota).toEqual({ used: 9, limit: 1000 });

    // ── quota boundary on the free plan (1,000 calls) ───────────────────
    expect((await track("acc-bulk", { type: "api_call", quantity: 990 })).status).toBe(201);
    expect((await track("acc-at-limit", { type: "api_call", quantity: 1 })).status).toBe(201);
    const over = await track("acc-over", { type: "api_call", quantity: 1 });
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe("quota_exceeded");
    expect(over.body.error.details).toMatchObject({
      scope: "api_calls",
      used: 1000,
      limit: 1000,
    });

    // ── the metering-armed alerts job fires at 80%/100% ─────────────────
    const processed = await runOnce(db);
    expect(processed).toBeGreaterThanOrEqual(1);
    const alerts = await db.select().from(usageAlerts);
    const seen = alerts.map((a) => `${a.metric}:${a.threshold}:${a.severity}`).sort();
    expect(seen).toEqual(["api_calls:100:critical", "api_calls:80:warning"]);

    // ── checkout for pro (mocked) — state must NOT change yet ──────────
    const [pro] = await db.select().from(plans).where(eq(plans.code, "pro"));
    await db
      .update(plans)
      .set({ stripePriceId: "price_pro_test" })
      .where(eq(plans.id, pro!.id));
    h.createCustomer.mockResolvedValue({ id: "cus_acc_1" });
    h.createSession.mockResolvedValue({
      id: "cs_acc_1",
      url: "https://checkout.stripe.com/pay/cs_acc_1",
    });

    const checkout = await request(app)
      .post("/api/v1/subscriptions/checkout")
      .set("Cookie", cookie)
      .send({ planId: "pro" });
    expect(checkout.status).toBe(200);
    expect(checkout.body.url).toContain("checkout.stripe.com");

    const stillFree = await request(app)
      .get("/api/v1/subscriptions/current")
      .set("Cookie", cookie);
    expect(stillFree.body.planName).toBe("Free"); // redirect proves nothing

    // ── signed webhook activates pro ────────────────────────────────────
    const event = {
      id: "evt_acc_updated",
      object: "event",
      api_version: "2024-06-20",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_acc_1",
          object: "subscription",
          status: "active",
          cancel_at_period_end: false,
          current_period_start: 1700000000,
          current_period_end: 1702592000,
          metadata: { tenantId },
          items: { data: [{ price: { id: "price_pro_test" } }] },
        },
      },
    };
    const payload = JSON.stringify(event);
    const signature = await signer.webhooks.generateTestHeaderStringAsync({
      payload,
      secret: SECRET,
    });
    const hook = await request(app)
      .post("/api/v1/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", signature)
      .send(payload);
    expect(hook.status).toBe(200);
    expect(hook.body.duplicate).toBe(false);

    const onPro = await request(app)
      .get("/api/v1/subscriptions/current")
      .set("Cookie", cookie);
    expect(onPro.body.planName).toBe("Pro");
    expect(onPro.body.status).toBe("active");

    // ── quota is now the pro limit: 2,000 calls sail through ────────────
    const proTrack = await track("acc-pro-calls", {
      type: "api_call",
      quantity: 2_000,
    });
    expect(proTrack.status).toBe(201);

    // ── cancel at period end ────────────────────────────────────────────
    const cancel = await request(app)
      .post("/api/v1/subscriptions/cancel")
      .set("Cookie", cookie);
    expect(cancel.status).toBe(200);
    expect(cancel.body.cancelAtPeriodEnd).toBe(true);
    expect(h.update).toHaveBeenCalledWith("sub_acc_1", {
      cancel_at_period_end: true,
    });

    // ── admin metrics reflect the whole journey ─────────────────────────
    const metrics = await request(app)
      .get("/api/v1/admin/metrics")
      .set("Cookie", cookie);
    expect(metrics.status).toBe(200);
    expect(metrics.body).toMatchObject({
      totalTenants: 1,
      activeSubscriptions: 1,
      totalApiCalls: 3_000, // 9 + 990 + 1 + 2,000
      totalTokens: 75_000,
      estimatedRevenue: 2_900, // pro plan monthly minor units
      currency: "USD",
    });
    // one alerts job completed during the journey; the pro track armed a new one
    expect(metrics.body.jobs).toEqual({
      pending: 1,
      processing: 0,
      failed: 0,
      completed: 1,
    });

    const jobRows = await db.select({ n: count() }).from(backgroundJobs);
    expect(Number(jobRows[0]!.n)).toBe(2);

    // subscription row matches what the API reports
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId));
    expect(sub!.cancelAtPeriodEnd).toBe(true);
    expect(sub!.planId).toBe(pro!.id);
    expect(sub!.stripeCustomerId).toBe("cus_acc_1");
    expect(sub!.stripeSubscriptionId).toBe("sub_acc_1");
  });
});
