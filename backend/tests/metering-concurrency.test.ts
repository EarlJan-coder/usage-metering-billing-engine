import request from "supertest";
import { count } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { seedPlans } from "../src/db/seed.js";
import * as schema from "../src/db/schema.js";
import { closeTestDb, db, resetDb } from "./helpers/db.js";
import { registerUser } from "./helpers/auth.js";
import { generateApiKey } from "../src/services/api-key.js";

const app = createApp(db);
const { apiKeys, usageEvents } = schema;

async function makeKey(tenantId: string): Promise<string> {
  const { plaintext, keyPrefix, keyHash } = generateApiKey();
  await db.insert(apiKeys).values({
    tenantId,
    name: "concurrency-test",
    keyPrefix,
    keyHash,
  });
  return `Bearer ${plaintext}`;
}

async function eventCount(): Promise<number> {
  const rows = await db.select({ n: count() }).from(usageEvents);
  return Number(rows[0]?.n ?? 0);
}

describe("metering concurrency (Task 7)", () => {
  let header: string;

  beforeEach(async () => {
    await resetDb();
    await seedPlans(db);
    const a = await registerUser(app);
    header = await makeKey(a.body.tenant.id);
  });

  afterAll(closeTestDb);

  test("5 parallel requests, SAME key → exactly 1 event, same event id", async () => {
    const idemKey = "parallel-same-key";

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post("/api/v1/metering/track")
          .set("Authorization", header)
          .set("Idempotency-Key", idemKey)
          .send({ type: "api_call", quantity: 2 }),
      ),
    );

    expect(await eventCount()).toBe(1);

    const ids = new Set(
      responses.map((r) => r.body.event?.id as string | undefined),
    );
    ids.delete(undefined);
    expect(ids.size).toBe(1);

    const statuses = responses.map((r) => r.status).sort();
    // one creator (201), the rest replays (200)
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 200)).toHaveLength(4);
    for (const r of responses) {
      expect(r.body.duplicate).toBe(r.status === 200);
    }
  });

  test("5 parallel requests, DIFFERENT keys → 5 events", async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post("/api/v1/metering/track")
          .set("Authorization", header)
          .set("Idempotency-Key", `parallel-distinct-${i}`)
          .send({ type: "api_call", quantity: 1 }),
      ),
    );

    for (const r of responses) expect(r.status).toBe(201);
    expect(await eventCount()).toBe(5);
  });
});
