import request from "supertest";
import { count, eq } from "drizzle-orm";
import Stripe from "stripe";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

import { createApp } from "../src/app.js";
import { seedPlans, utcMonthBounds } from "../src/db/seed.js";
import * as schema from "../src/db/schema.js";
import { closeTestDb, db, resetDb } from "./helpers/db.js";
import { registerUser } from "./helpers/auth.js";

const SECRET = "whsec_test_secret_0123456789";

const h = vi.hoisted(() => ({
  retrieve: vi.fn(),
}));

// Real webhook crypto (signature verify + parse), stubbed network calls.
vi.mock("../src/services/stripe.js", async () => {
  const { default: StripeCtor } = await import("stripe");
  const real = new StripeCtor("sk_test_dummy_for_signing");
  return {
    getStripe: () => ({
      webhooks: real.webhooks,
      subscriptions: { retrieve: h.retrieve },
      customers: {
        create: vi.fn(async () => ({ id: "cus_test_123" })),
      },
      checkout: {
        sessions: {
          create: vi.fn(async () => ({
            id: "cs_test_1",
            url: "https://checkout.stripe.com/pay/cs_test_1",
          })),
        },
      },
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

function checkoutEvent(created: number, id = "evt_checkout_1") {
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
        id: "cs_1",
        object: "checkout.session",
        customer: "cus_1",
        subscription: "sub_1",
        metadata: { tenantId, planId: proPlanId },
      },
    },
  };
}

function subscriptionUpdatedEvent(
  created: number,
  fields: Record<string, unknown> = {},
  id = "evt_sub_updated_1",
) {
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
        id: "sub_1",
        object: "subscription",
        status: "active",
        cancel_at_period_end: false,
        current_period_start: 1700000000,
        current_period_end: 1702678400,
        metadata: { tenantId },
        items: { data: [{ price: { id: "price_pro_test" } }] },
        ...fields,
      },
    },
  };
}

function subscriptionDeletedEvent(created: number, id = "evt_sub_deleted_1") {
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
        id: "sub_1",
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
    .send(payload); // superagent serializes Buffers; strings go out verbatim
}

async function current() {
  const res = await request(app)
    .get("/api/v1/subscriptions/current")
    .set("Cookie", cookie);
  return res.body;
}

describe("stripe webhooks (Task 9)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPlans(db);
    const a = await registerUser(app);
    cookie = a.cookie;
    tenantId = a.body.tenant.id;

    const [pro] = await db.select().from(plans).where(eq(plans.code, "pro"));
    proPlanId = pro!.id;
    await db
      .update(plans)
      .set({ stripePriceId: "price_pro_test" })
      .where(eq(plans.id, proPlanId));

    h.retrieve.mockReset();
    h.retrieve.mockResolvedValue({
      id: "sub_1",
      status: "active",
      cancel_at_period_end: false,
      current_period_start: 1700000000,
      current_period_end: 1702678400,
      metadata: { tenantId, planId: proPlanId },
      items: { data: [{ price: { id: "price_pro_test" } }] },
    });
  });

  afterAll(closeTestDb);

  test("valid signature → 200 and the subscription becomes active on Pro", async () => {
    const res = await deliver(checkoutEvent(1700000100));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true });

    const body = await current();
    expect(body.planName).toBe("Pro");
    expect(body.status).toBe("active");
    expect(body.currentPeriodStart).toBe(
      new Date(1700000000 * 1000).toISOString(),
    );
    expect(body.currentPeriodEnd).toBe(new Date(1702678400 * 1000).toISOString());
  });

  test("the same event delivered twice is deduplicated (Review Focus 3)", async () => {
    const event = checkoutEvent(1700000100);

    const first = await deliver(event);
    expect(first.status).toBe(200);
    expect(first.body.duplicate).toBe(false);

    const before = await current();

    const second = await deliver(event);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ received: true, duplicate: true });

    const rows = await db.select({ n: count() }).from(webhookEvents);
    expect(Number(rows[0]!.n)).toBe(1);

    // no reprocessing: the Stripe subscription was retrieved exactly once
    expect(h.retrieve).toHaveBeenCalledTimes(1);

    const after = await current();
    expect(after).toEqual(before);
  });

  test("tampered payload → 400 invalid_signature and NO webhook row", async () => {
    const signed = JSON.stringify(checkoutEvent(1700000100));
    const signature = await signer.webhooks.generateTestHeaderStringAsync({
      payload: signed,
      secret: SECRET,
    });

    const res = await request(app)
      .post("/api/v1/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", signature)
      .send(JSON.stringify(checkoutEvent(1700000100, "evt_forged")));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_signature");

    const rows = await db.select({ n: count() }).from(webhookEvents);
    expect(Number(rows[0]!.n)).toBe(0);
  });

  test("out-of-order customer.subscription.updated never regresses state", async () => {
    await deliver(checkoutEvent(1700000100));

    // stale update: older than the last applied event for sub_1
    const stale = await deliver(
      subscriptionUpdatedEvent(1700000050, {
        status: "canceled",
        items: { data: [{ price: { id: "price_free_test" } }] },
      }),
    );
    expect(stale.status).toBe(200);

    let body = await current();
    expect(body.planName).toBe("Pro");
    expect(body.status).toBe("active");

    // a fresher update still applies
    const fresh = await deliver(
      subscriptionUpdatedEvent(1700000200, {
        status: "past_due",
        cancel_at_period_end: true,
      }, "evt_sub_updated_2"),
    );
    expect(fresh.status).toBe(200);

    body = await current();
    expect(body.status).toBe("past_due");
    expect(body.cancelAtPeriodEnd).toBe(true);
  });

  test("customer.subscription.deleted reverts the plan to free", async () => {
    await deliver(checkoutEvent(1700000100));

    const deleted = await deliver(subscriptionDeletedEvent(1700000200));
    expect(deleted.status).toBe(200);

    const body = await current();
    expect(body.planName).toBe("Free");
    expect(body.status).toBe("canceled");

    const { start, end } = utcMonthBounds();
    expect(body.currentPeriodStart).toBe(start.toISOString());
    expect(body.currentPeriodEnd).toBe(end.toISOString());
    expect(body.cancelAtPeriodEnd).toBe(false);
  });

  test("the checkout redirect alone never changes subscription state", async () => {
    const res = await request(app)
      .post("/api/v1/subscriptions/checkout")
      .set("Cookie", cookie)
      .send({ planId: "pro" });
    expect(res.status).toBe(200);
    expect(res.body.url).toBeTruthy();

    const body = await current();
    expect(body.planName).toBe("Free");
    expect(body.status).toBe("active");
  });

  test("a stale checkout.session.completed never rewinds state (review #4)", async () => {
    // a fresher update lands first
    const fresh = await deliver(
      subscriptionUpdatedEvent(1700000200, { status: "past_due" }, "evt_fresh_update"),
    );
    expect(fresh.status).toBe(200);

    const before = await current();
    expect(before.status).toBe("past_due");

    // then a redelivered OLD checkout event (different id → not deduped)
    const stale = await deliver(checkoutEvent(1700000100, "evt_stale_checkout"));
    expect(stale.status).toBe(200); // recorded, but must not be applied

    const after = await current();
    expect(after).toEqual(before);
  });

  test("incomplete Stripe status maps to past_due, never paid quota (review #5)", async () => {
    const res = await deliver(
      subscriptionUpdatedEvent(1700000300, { status: "incomplete" }, "evt_incomplete"),
    );
    expect(res.status).toBe(200);

    const body = await current();
    expect(body.status).toBe("past_due"); // payment not confirmed → 402 path
  });
});
