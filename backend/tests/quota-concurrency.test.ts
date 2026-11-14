import request from "supertest";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { seedPlans } from "../src/db/seed.js";
import * as schema from "../src/db/schema.js";
import { closeTestDb, db, resetDb } from "./helpers/db.js";
import { registerUser } from "./helpers/auth.js";
import { generateApiKey } from "../src/services/api-key.js";

const app = createApp(db);
const { apiKeys, plans, subscriptions, usageEvents } = schema;

async function makeKey(tenantId: string): Promise<string> {
  const { plaintext, keyPrefix, keyHash } = generateApiKey();
  await db.insert(apiKeys).values({
    tenantId,
    name: "quota-concurrency",
    keyPrefix,
    keyHash,
  });
  return `Bearer ${plaintext}`;
}

async function eventCountFor(tenantId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(usageEvents)
    .where(eq(usageEvents.tenantId, tenantId));
  return rows[0]!.n;
}

describe("quota concurrency (Task 8)", () => {
  let header: string;
  let tenantId: string;

  beforeEach(async () => {
    await resetDb();
    await seedPlans(db);
    const a = await registerUser(app);
    tenantId = a.body.tenant.id;
    header = await makeKey(tenantId);

    // Free plan = 1000 calls; used = 999 → exactly ONE slot left.
    const [plan] = await db
      .select()
      .from(plans)
      .where(eq(plans.code, "free"))
      .limit(1);
    await db.insert(usageEvents).values({
      tenantId,
      type: "api_call",
      quantity: 999,
      costMinor: 0,
      pricingVersion: 1,
      idempotencyKey: "preload-999",
    });
    void plan;
  });

  afterAll(closeTestDb);

  test("10 parallel tracks at the boundary → exactly 1 accepted, 9 rejected (Review Focus 2)", async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        request(app)
          .post("/api/v1/metering/track")
          .set("Authorization", header)
          .set("Idempotency-Key", `boundary-${i}`)
          .send({ type: "api_call", quantity: 1 }),
      ),
    );

    const accepted = responses.filter((r) => r.status === 201);
    const rejected = responses.filter((r) => r.status === 429);

    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(9);
    for (const r of rejected) {
      expect(r.body.error.code).toBe("quota_exceeded");
    }

    // 999 preloaded + 1 accepted = 1000 rows' worth of calls
    const rows = await db
      .select({ n: sql<number>`sum(quantity)::int` })
      .from(usageEvents)
      .where(eq(usageEvents.tenantId, tenantId));
    expect(rows[0]!.n).toBe(1000);

    // and exactly one NEW event row beyond the preload
    expect(await eventCountFor(tenantId)).toBe(2);
  });
});
