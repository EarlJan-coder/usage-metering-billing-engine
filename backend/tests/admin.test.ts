import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { seedPlans } from "../src/db/seed.js";
import * as schema from "../src/db/schema.js";
import { closeTestDb, db, resetDb } from "./helpers/db.js";
import { registerUser } from "./helpers/auth.js";

const app = createApp(db);
const {
  backgroundJobs,
  plans,
  subscriptions,
  usageEvents,
  users,
  webhookEvents,
} = schema;

describe("platform admin (Task 11)", () => {
  let adminCookie: string;

  beforeEach(async () => {
    await resetDb();
    await seedPlans(db);

    // tenant A (free) — owned by the platform admin
    const a = await registerUser(app, { name: "Ada Admin" });
    adminCookie = a.cookie;
    await db
      .update(users)
      .set({ platformAdmin: true })
      .where(eq(users.id, a.body.user.id));

    // tenant B (pro)
    const b = await registerUser(app, { name: "Bob Pro" });
    const [pro] = await db.select().from(plans).where(eq(plans.code, "pro"));
    await db
      .update(subscriptions)
      .set({ planId: pro!.id })
      .where(eq(subscriptions.tenantId, b.body.tenant.id));

    // known usage across both tenants
    await db.insert(usageEvents).values([
      {
        tenantId: a.body.tenant.id,
        type: "api_call",
        quantity: 50,
        costMinor: 100,
        pricingVersion: 1,
        idempotencyKey: "a-calls",
      },
      {
        tenantId: a.body.tenant.id,
        type: "ai_tokens",
        quantity: 2_000,
        costMinor: 200,
        pricingVersion: 1,
        idempotencyKey: "a-tokens",
      },
      {
        tenantId: b.body.tenant.id,
        type: "api_call",
        quantity: 5,
        costMinor: 0,
        pricingVersion: 1,
        idempotencyKey: "b-calls",
      },
    ]);

    // job queue snapshot: 2 pending, 1 processing, 1 failed, 1 dead, 3 done
    const jobRows: Array<typeof backgroundJobs.$inferInsert> = [
      { type: "t", status: "pending", payload: {} },
      { type: "t", status: "pending", payload: {} },
      { type: "t", status: "processing", payload: {} },
      { type: "t", status: "failed", payload: {}, lastError: "oops" },
      { type: "t", status: "dead", payload: {}, lastError: "fatal" },
      { type: "t", status: "completed", payload: {} },
      { type: "t", status: "completed", payload: {} },
      { type: "t", status: "completed", payload: {} },
    ];
    await db.insert(backgroundJobs).values(jobRows);

    const webhookRows: Array<typeof webhookEvents.$inferInsert> = [
      {
        stripeEventId: "evt_1",
        type: "checkout.session.completed",
        status: "processed",
        payload: {},
      },
      {
        stripeEventId: "evt_2",
        type: "customer.subscription.updated",
        status: "failed",
        payload: {},
      },
    ];
    await db.insert(webhookEvents).values(webhookRows);
  });

  afterAll(closeTestDb);

  const endpoints = [
    "/api/v1/admin/tenants",
    "/api/v1/admin/metrics",
    "/api/v1/admin/webhooks",
  ];

  test("non-platform-admin sessions get 403 forbidden everywhere", async () => {
    const member = await registerUser(app, { name: "Plain Member" });

    for (const path of endpoints) {
      const res = await request(app).get(path).set("Cookie", member.cookie);
      expect(res.status, path).toBe(403);
      expect(res.body.error.code).toBe("forbidden");
    }
  });

  test("anonymous requests get 401", async () => {
    for (const path of endpoints) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(401);
    }
  });

  test("GET /admin/metrics matches the seeded fixture exactly", async () => {
    const res = await request(app)
      .get("/api/v1/admin/metrics")
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalTenants: 2,
      activeSubscriptions: 2,
      totalApiCalls: 55,
      totalTokens: 2_000,
      estimatedRevenue: 2_900, // free (0) + pro (2900) monthly minor units
      currency: "USD",
      jobs: {
        pending: 2,
        processing: 1,
        failed: 2, // failed + dead are both permanent-tracked failures
        completed: 3,
      },
    });
  });

  test("GET /admin/tenants lists plan, status, and member counts", async () => {
    const res = await request(app)
      .get("/api/v1/admin/tenants")
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);

    const byName = Object.fromEntries(
      res.body.items.map((t: { name: string }) => [t.name, t]),
    );
    expect(byName["Ada Admin's Workspace"]).toMatchObject({
      plan: "Free",
      status: "active",
      memberCount: 1,
    });
    expect(byName["Bob Pro's Workspace"]).toMatchObject({
      plan: "Pro",
      status: "active",
      memberCount: 1,
    });
    for (const item of res.body.items) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.createdAt).toBe("string");
    }
  });

  test("GET /admin/webhooks lists delivery state", async () => {
    const res = await request(app)
      .get("/api/v1/admin/webhooks")
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    for (const item of res.body.items) {
      expect(item).toMatchObject({
        id: expect.any(String),
        type: expect.any(String),
        status: expect.any(String),
        receivedAt: expect.any(String),
      });
    }
    const types = res.body.items.map((i: { type: string }) => i.type).sort();
    expect(types).toEqual([
      "checkout.session.completed",
      "customer.subscription.updated",
    ]);
  });
});
