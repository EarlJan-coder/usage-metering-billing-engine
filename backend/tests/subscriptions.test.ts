import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

import { createApp } from "../src/app.js";
import { seedPlans } from "../src/db/seed.js";
import * as schema from "../src/db/schema.js";
import { closeTestDb, db, resetDb } from "./helpers/db.js";
import { registerUser } from "./helpers/auth.js";

const h = vi.hoisted(() => ({
  getStripe: vi.fn(),
}));

vi.mock("../src/services/stripe.js", () => ({ getStripe: h.getStripe }));

const app = createApp(db);
const { plans, subscriptions } = schema;

function makeStripeMock() {
  return {
    customers: {
      create: vi.fn(async (_params: any) => ({ id: "cus_test_123" })),
    },
    checkout: {
      sessions: {
        create: vi.fn(async (_params: any) => ({
          id: "cs_test_1",
          url: "https://checkout.stripe.com/pay/cs_test_1",
        })),
      },
    },
    subscriptions: {
      update: vi.fn(async (id: string, params: object) => ({ id, ...params })),
    },
  };
}

describe("subscriptions (Task 9)", () => {
  let cookie: string;
  let tenantId: string;
  let stripeMock: ReturnType<typeof makeStripeMock>;

  beforeEach(async () => {
    await resetDb();
    await seedPlans(db);
    const a = await registerUser(app);
    cookie = a.cookie;
    tenantId = a.body.tenant.id;

    // A paid plan needs a Stripe price id to check out with.
    await db
      .update(plans)
      .set({ stripePriceId: "price_pro_test" })
      .where(eq(plans.code, "pro"));

    stripeMock = makeStripeMock();
    h.getStripe.mockReturnValue(stripeMock);
  });

  afterAll(closeTestDb);

  test("POST /subscriptions/checkout returns { url } and persists the Stripe customer", async () => {
    const res = await request(app)
      .post("/api/v1/subscriptions/checkout")
      .set("Cookie", cookie)
      .send({ planId: "pro" });

    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://checkout.stripe.com/pay/cs_test_1");

    // customer created once and stored on the subscription row
    expect(stripeMock.customers.create).toHaveBeenCalledTimes(1);
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId));
    expect(sub!.stripeCustomerId).toBe("cus_test_123");

    // checkout session is a subscription checkout tagged with our ids
    const params = stripeMock.checkout.sessions.create.mock.calls[0]![0];
    expect(params.mode).toBe("subscription");
    expect(params.line_items[0]).toMatchObject({ price: "price_pro_test" });
    expect(params.metadata).toMatchObject({ tenantId, planId: expect.any(String) });
  });

  test("POST /subscriptions/checkout accepts a plan UUID as well as a code", async () => {
    const [pro] = await db.select().from(plans).where(eq(plans.code, "pro"));

    const res = await request(app)
      .post("/api/v1/subscriptions/checkout")
      .set("Cookie", cookie)
      .send({ planId: pro!.id });

    expect(res.status).toBe(200);
    expect(res.body.url).toBeTruthy();
  });

  test("POST /subscriptions/checkout for the free plan → 400 invalid_plan", async () => {
    const res = await request(app)
      .post("/api/v1/subscriptions/checkout")
      .set("Cookie", cookie)
      .send({ planId: "free" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_plan");
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  test("POST /subscriptions/checkout unauthenticated → 401", async () => {
    const res = await request(app)
      .post("/api/v1/subscriptions/checkout")
      .send({ planId: "pro" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  test("GET /subscriptions/current matches the frontend normalizeSubscription shape", async () => {
    const res = await request(app)
      .get("/api/v1/subscriptions/current")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.planName).toBe("Free");
    expect(res.body.plan).toMatchObject({ code: "free", name: "Free" });
    expect(res.body.status).toBe("active");
    expect(typeof res.body.currentPeriodStart).toBe("string");
    expect(typeof res.body.currentPeriodEnd).toBe("string");
    expect(res.body.cancelAtPeriodEnd).toBe(false);
  });

  test("POST /subscriptions/cancel sets cancelAtPeriodEnd and calls Stripe", async () => {
    const [pro] = await db.select().from(plans).where(eq(plans.code, "pro"));
    await db
      .update(subscriptions)
      .set({ planId: pro!.id, stripeSubscriptionId: "sub_test_1" })
      .where(eq(subscriptions.tenantId, tenantId));

    const res = await request(app)
      .post("/api/v1/subscriptions/cancel")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.planName).toBe("Pro");
    expect(res.body.cancelAtPeriodEnd).toBe(true);

    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith("sub_test_1", {
      cancel_at_period_end: true,
    });

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId));
    expect(sub!.cancelAtPeriodEnd).toBe(true);
  });

  test("POST /subscriptions/cancel on the free plan → 400 invalid_subscription", async () => {
    const res = await request(app)
      .post("/api/v1/subscriptions/cancel")
      .set("Cookie", cookie);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_subscription");
  });

  test("checkout without Stripe configured → 503 stripe_not_configured", async () => {
    h.getStripe.mockReturnValue(null);

    const res = await request(app)
      .post("/api/v1/subscriptions/checkout")
      .set("Cookie", cookie)
      .send({ planId: "pro" });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("stripe_not_configured");
    expect(res.body.error.message).toMatch(/stripe/i);
  });
});
