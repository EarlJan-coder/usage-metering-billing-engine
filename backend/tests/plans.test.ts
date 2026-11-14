import request from "supertest";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { seedPlans } from "../src/db/seed.js";
import { closeTestDb, db, resetDb } from "./helpers/db.js";

const app = createApp(db);

describe("plans (Task 4)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPlans(db);
  });

  afterAll(closeTestDb);

  test("GET /plans returns seeded free + pro with exact limits", async () => {
    const res = await request(app).get("/api/v1/plans");

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);

    const free = res.body.items.find((p: { code: string }) => p.code === "free");
    const pro = res.body.items.find((p: { code: string }) => p.code === "pro");

    expect(free).toMatchObject({
      name: "Free",
      priceMinor: 0,
      currency: "USD",
      interval: "month",
      callsLimit: 1000,
      tokensLimit: 100_000,
      isDefault: true,
    });
    expect(pro).toMatchObject({
      name: "Pro",
      priceMinor: 2900,
      callsLimit: 100_000,
      tokensLimit: 10_000_000,
      isDefault: false,
    });
  });

  test("shape matches the frontend normalizePlan contract", async () => {
    const res = await request(app).get("/api/v1/plans");

    for (const plan of res.body.items) {
      expect(typeof plan.id).toBe("string");
      expect(typeof plan.name).toBe("string");
      // flat limits (not nested under `limits`), features is a string array
      expect(plan).toHaveProperty("callsLimit");
      expect(plan).toHaveProperty("tokensLimit");
      expect(Array.isArray(plan.features)).toBe(true);
      expect(typeof plan.description === "string" || plan.description === null).toBe(true);
      expect(typeof plan.priceMinor).toBe("number");
      expect(typeof plan.isDefault).toBe("boolean");
    }
  });

  test("plans are public — no auth required (Ruling 5)", async () => {
    const res = await request(app).get("/api/v1/plans");
    expect(res.status).toBe(200);
  });

  test("plans ordered by price ascending", async () => {
    const res = await request(app).get("/api/v1/plans");
    const prices = res.body.items.map((p: { priceMinor: number }) => p.priceMinor);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  test("inactive plans are hidden", async () => {
    const { plans } = await import("../src/db/schema.js");
    const { eq } = await import("drizzle-orm");
    await db.update(plans).set({ active: false }).where(eq(plans.code, "pro"));

    const res = await request(app).get("/api/v1/plans");
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].code).toBe("free");
  });
});
