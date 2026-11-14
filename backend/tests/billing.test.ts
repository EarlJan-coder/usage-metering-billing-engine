import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { seedPlans } from "../src/db/seed.js";
import * as schema from "../src/db/schema.js";
import { closeTestDb, db, resetDb } from "./helpers/db.js";
import { registerUser } from "./helpers/auth.js";

const app = createApp(db);
const { subscriptions, usageEvents } = schema;

const DAY_MS = 24 * 3600 * 1000;

describe("billing summary (Task 11)", () => {
  let cookie: string;
  let tenantId: string;
  let periodStart: Date;
  let periodEnd: Date;

  beforeEach(async () => {
    await resetDb();
    await seedPlans(db);
    const a = await registerUser(app, { name: "Cass" });
    cookie = a.cookie;
    tenantId = a.body.tenant.id;

    // pinned period so fixtures are deterministic on any run date
    const now = new Date();
    periodStart = new Date(now.getTime() - 5 * DAY_MS);
    periodEnd = new Date(now.getTime() + 25 * DAY_MS);
    await db
      .update(subscriptions)
      .set({ currentPeriodStart: periodStart, currentPeriodEnd: periodEnd })
      .where(eq(subscriptions.tenantId, tenantId));

    // in-period cost
    await db.insert(usageEvents).values({
      tenantId,
      type: "ai_tokens",
      quantity: 1_000,
      costMinor: 42,
      pricingVersion: 1,
      idempotencyKey: "b-in",
      createdAt: new Date(now.getTime() - 1 * DAY_MS),
    });
    // out-of-period cost must not count
    await db.insert(usageEvents).values({
      tenantId,
      type: "ai_tokens",
      quantity: 500,
      costMinor: 99,
      pricingVersion: 1,
      idempotencyKey: "b-out",
      createdAt: new Date(periodStart.getTime() - DAY_MS),
    });
  });

  afterAll(closeTestDb);

  test("GET /billing/summary returns period bounds and in-period cost", async () => {
    const res = await request(app)
      .get("/api/v1/billing/summary")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.estimatedCost).toBe(42);
    expect(res.body.currency).toBe("USD");
    expect(res.body.periodStart).toBe(periodStart.toISOString());
    expect(res.body.periodEnd).toBe(periodEnd.toISOString());
    expect(res.body.nextInvoiceAt).toBe(periodEnd.toISOString());
    expect(res.body.status).toBe("active");
  });

  test("billing status is the subscription status verbatim", async () => {
    await db
      .update(subscriptions)
      .set({ status: "past_due" })
      .where(eq(subscriptions.tenantId, tenantId));

    const res = await request(app)
      .get("/api/v1/billing/summary")
      .set("Cookie", cookie);
    expect(res.body.status).toBe("past_due");
  });

  test("/subscriptions/current and /billing/summary agree on the period", async () => {
    const billing = await request(app)
      .get("/api/v1/billing/summary")
      .set("Cookie", cookie);
    const current = await request(app)
      .get("/api/v1/subscriptions/current")
      .set("Cookie", cookie);

    expect(current.status).toBe(200);
    expect(current.body.currentPeriodStart).toBe(billing.body.periodStart);
    expect(current.body.currentPeriodEnd).toBe(billing.body.periodEnd);
  });

  test("billing summary requires a session", async () => {
    const res = await request(app).get("/api/v1/billing/summary");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });
});
