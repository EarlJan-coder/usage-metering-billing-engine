import request from "supertest";
import { count, eq } from "drizzle-orm";
import Stripe from "stripe";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

import { createApp } from "../src/app.js";
import { seedPlans } from "../src/db/seed.js";
import * as schema from "../src/db/schema.js";
import { closeTestDb, db, resetDb } from "./helpers/db.js";
import { registerUser } from "./helpers/auth.js";

const SECRET = "whsec_replay_secret_0123456789";

const h = vi.hoisted(() => ({
  retrieve: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../src/services/stripe.js", async () => {
  const { default: StripeCtor } = await import("stripe");
  const real = new StripeCtor("sk_test_dummy_for_signing");
  return {
    getStripe: () => ({
      webhooks: real.webhooks,
      subscriptions: { retrieve: h.retrieve, update: h.update },
    }),
  };
});

process.env.STRIPE_WEBHOOK_SECRET = SECRET;
const signer = new Stripe("sk_test_dummy_for_signing");

const app = createApp(db);
const { plans, webhookEvents } = schema;

let cookie: string;
let tenantId: string;
let proPlanId: string;

const T = 1700000000;

function checkoutEvent(created: number, id = "evt_r_checkout") {
  return {
    id,
    object: "event",
    api_version: "2024-06-20",
    created,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_r1",
        object: "checkout.session",
        customer: "cus_r1",
        subscription: "sub_r1",
        metadata: { tenantId, planId: proPlanId },
      },
    },
  };
}

function updatedEvent(created: number, id = "evt_r_updated") {
  return {
    id,
    object: "event",
    api_version: "2024-06-20",
    created,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_r1",
        object: "subscription",
        status: "active",
        cancel_at_period_end: true,
        current_period_start: T,
        current_period_end: T + 2_592_000,
        metadata: { tenantId },
        items: { data: [{ price: { id: "price_pro_test" } }] },
      },
    },
  };
}

function deletedEvent(created: number, id = "evt_r_deleted") {
  return {
    id,
    object: "event",
    api_version: "2024-06-20",
    created,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: "sub_r1",
        object: "subscription",
        metadata: { tenantId },
      },
    },
  };
}

async function deliver(event: object) {
  const payload = JSON.stringify(event);
  const signature = await signer.webhooks.generateTestHeaderStringAsync({
    payload,
    secret: SECRET,
  });
  return request(app)
    .post("/api/v1/webhooks/stripe")
    .set("Content-Type", "application/json")
    .set("Stripe-Signature", signature)
    .send(payload);
}

describe("webhook replay (Task 13)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPlans(db);
    const a = await registerUser(app, { name: "Rita Replay" });
    cookie = a.cookie;
    tenantId = a.body.tenant.id;

    const [pro] = await db.select().from(plans).where(eq(plans.code, "pro"));
    proPlanId = pro!.id;
    await db
      .update(plans)
      .set({ stripePriceId: "price_pro_test" })
      .where(eq(plans.id, proPlanId));

    h.retrieve.mockReset();
    h.update.mockReset();
    h.retrieve.mockResolvedValue({
      id: "sub_r1",
      status: "active",
      cancel_at_period_end: false,
      current_period_start: T,
      current_period_end: T + 2_592_000,
      metadata: { tenantId, planId: proPlanId },
      items: { data: [{ price: { id: "price_pro_test" } }] },
    });
  });

  afterAll(closeTestDb);

  test("replaying checkout→update→delete changes nothing (Review Focus)", async () => {
    const sequence = [
      checkoutEvent(T),
      updatedEvent(T + 10),
      deletedEvent(T + 20),
    ];

    // single delivery
    for (const event of sequence) {
      const res = await deliver(event);
      expect(res.status).toBe(200);
      expect(res.body.duplicate).toBe(false);
    }

    const stateAfterFirst = await request(app)
      .get("/api/v1/subscriptions/current")
      .set("Cookie", cookie);
    expect(stateAfterFirst.status).toBe(200);
    // terminal state of the sequence: canceled, back on free
    expect(stateAfterFirst.body.planName).toBe("Free");
    expect(stateAfterFirst.body.status).toBe("canceled");
    expect(stateAfterFirst.body.cancelAtPeriodEnd).toBe(false);

    // full replay of the same three deliveries
    for (const event of sequence) {
      const res = await deliver(event);
      expect(res.status).toBe(200);
      expect(res.body.duplicate).toBe(true);
    }

    // state byte-identical, no handler ran again
    const stateAfterReplay = await request(app)
      .get("/api/v1/subscriptions/current")
      .set("Cookie", cookie);
    expect(stateAfterReplay.body).toEqual(stateAfterFirst.body);

    // exactly one webhook_events row per Stripe event id
    const rows = await db.select().from(webhookEvents);
    expect(rows).toHaveLength(3);
    const ids = rows.map((r) => r.stripeEventId).sort();
    expect(ids).toEqual(["evt_r_checkout", "evt_r_deleted", "evt_r_updated"]);
    for (const row of rows) expect(row.status).toBe("processed");
    const total = await db.select({ n: count() }).from(webhookEvents);
    expect(Number(total[0]!.n)).toBe(3);
  });

  test("interleaved replays cannot corrupt state either", async () => {
    // deliver 1,2 then replay 1 then deliver 3 then replay 2,3
    await deliver(checkoutEvent(T));
    await deliver(updatedEvent(T + 10));
    await deliver(checkoutEvent(T)); // replay
    await deliver(deletedEvent(T + 20));
    await deliver(updatedEvent(T + 10)); // replay of a non-terminal event
    await deliver(deletedEvent(T + 20)); // replay

    const state = await request(app)
      .get("/api/v1/subscriptions/current")
      .set("Cookie", cookie);
    expect(state.body.planName).toBe("Free");
    expect(state.body.status).toBe("canceled");

    const rows = await db.select().from(webhookEvents);
    expect(rows).toHaveLength(3);
  });
});
