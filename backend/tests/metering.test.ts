import request from "supertest";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { seedPlans } from "../src/db/seed.js";
import * as schema from "../src/db/schema.js";
import { closeTestDb, db, resetDb } from "./helpers/db.js";
import { registerUser } from "./helpers/auth.js";
import { generateApiKey } from "../src/services/api-key.js";

const app = createApp(db);
const { apiKeys, usageEvents, aiTokenUsageDetails } = schema;

type KeyPair = { header: string; tenantId: string };

async function makeKey(tenantId: string): Promise<KeyPair> {
  const { plaintext, keyPrefix, keyHash } = generateApiKey();
  await db.insert(apiKeys).values({
    tenantId,
    name: "metering-test",
    keyPrefix,
    keyHash,
  });
  return { header: `Bearer ${plaintext}`, tenantId };
}

async function eventCount(): Promise<number> {
  const rows = await db.select({ n: count() }).from(usageEvents);
  return Number(rows[0]?.n ?? 0);
}

describe("metering track (Task 7)", () => {
  let key: KeyPair;
  let tenantId: string;

  beforeEach(async () => {
    await resetDb();
    await seedPlans(db);
    const a = await registerUser(app);
    tenantId = a.body.tenant.id;
    key = await makeKey(tenantId);
  });

  afterAll(closeTestDb);

  const idem = () => `key-${Math.random().toString(36).slice(2)}`;

  test("api_call happy path → 201 with cost and metadata", async () => {
    const res = await request(app)
      .post("/api/v1/metering/track")
      .set("Authorization", key.header)
      .set("Idempotency-Key", idem())
      .set("User-Agent", "acme-integration/1.0")
      .send({ type: "api_call", quantity: 5 });

    expect(res.status).toBe(201);
    expect(res.body.duplicate).toBe(false);
    expect(res.body.event).toMatchObject({
      type: "api_call",
      quantity: 5,
      costMinor: 0,
      currency: "USD",
      pricingVersion: 1,
      status: "recorded",
    });
    expect(res.body.event.id).toBeTruthy();
    expect(res.body.event.createdAt).toBeTruthy();

    const rows = await db.select().from(usageEvents);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tenantId).toBe(tenantId);
    expect(rows[0]!.quantity).toBe(5);
    expect(rows[0]!.apiKeyId).toBeTruthy();
    const meta = rows[0]!.metadata as Record<string, unknown>;
    expect(meta.userAgent).toBe("acme-integration/1.0");
  });

  test("ai_tokens persists the token breakdown row", async () => {
    // 1.5M tokens exceeds the seeded free-plan quota (100k) — lift it so
    // this test exercises persistence, not quota (quota has its own suite).
    await db
      .update(schema.plans)
      .set({ aiTokensLimit: null })
      .where(eq(schema.plans.code, "free"));

    const res = await request(app)
      .post("/api/v1/metering/track")
      .set("Authorization", key.header)
      .set("Idempotency-Key", idem())
      .send({
        type: "ai_tokens",
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        cachedInputTokens: 250_000,
        reasoningTokens: 100_000,
        model: "gpt-4o",
      });

    expect(res.status).toBe(201);
    // 421 minor units — same math as the cost engine test
    expect(res.body.event.costMinor).toBe(421);
    expect(res.body.event).toMatchObject({
      type: "ai_tokens",
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cachedInputTokens: 250_000,
      reasoningTokens: 100_000,
      model: "gpt-4o",
    });

    const details = await db.select().from(aiTokenUsageDetails);
    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cachedInputTokens: 250_000,
      reasoningTokens: 100_000,
      model: "gpt-4o",
    });
  });

  test("missing Idempotency-Key → 400 idempotency_key_required", async () => {
    const res = await request(app)
      .post("/api/v1/metering/track")
      .set("Authorization", key.header)
      .send({ type: "api_call", quantity: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("idempotency_key_required");
    expect(await eventCount()).toBe(0);
  });

  test("bad or revoked key → 401 and ZERO event rows", async () => {
    const bad = await request(app)
      .post("/api/v1/metering/track")
      .set("Authorization", "Bearer umk_0000000000000000000000000000000000000000")
      .set("Idempotency-Key", idem())
      .send({ type: "api_call", quantity: 1 });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe("invalid_api_key");

    const noAuth = await request(app)
      .post("/api/v1/metering/track")
      .set("Idempotency-Key", idem())
      .send({ type: "api_call", quantity: 1 });
    expect(noAuth.status).toBe(401);

    expect(await eventCount()).toBe(0);
  });

  test("same key twice → second returns duplicate:true, one row (Review Focus 4)", async () => {
    const idemKey = idem();
    const body = { type: "api_call", quantity: 3 };

    const first = await request(app)
      .post("/api/v1/metering/track")
      .set("Authorization", key.header)
      .set("Idempotency-Key", idemKey)
      .send(body);
    expect(first.status).toBe(201);
    expect(first.body.duplicate).toBe(false);

    const second = await request(app)
      .post("/api/v1/metering/track")
      .set("Authorization", key.header)
      .set("Idempotency-Key", idemKey)
      .send(body);

    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.event.id).toBe(first.body.event.id);
    expect(second.body.event).toEqual(first.body.event);
    expect(await eventCount()).toBe(1);
  });

  test("same key + DIFFERENT body → original result replayed, still 1 row (Review Focus 4)", async () => {
    const idemKey = idem();
    const first = await request(app)
      .post("/api/v1/metering/track")
      .set("Authorization", key.header)
      .set("Idempotency-Key", idemKey)
      .send({ type: "api_call", quantity: 3 });
    expect(first.status).toBe(201);

    const conflicting = await request(app)
      .post("/api/v1/metering/track")
      .set("Authorization", key.header)
      .set("Idempotency-Key", idemKey)
      .send({ type: "ai_tokens", inputTokens: 999_999 });

    expect(conflicting.status).toBe(200);
    expect(conflicting.body.duplicate).toBe(true);
    expect(conflicting.body.event.id).toBe(first.body.event.id);
    expect(conflicting.body.event.type).toBe("api_call");
    expect(await eventCount()).toBe(1);
  });

  test("unknown field or bad type → 400 validation_error", async () => {
    const unknownField = await request(app)
      .post("/api/v1/metering/track")
      .set("Authorization", key.header)
      .set("Idempotency-Key", idem())
      .send({ type: "api_call", quantity: 1, bogus: true });
    expect(unknownField.status).toBe(400);
    expect(unknownField.body.error.code).toBe("validation_error");

    const negative = await request(app)
      .post("/api/v1/metering/track")
      .set("Authorization", key.header)
      .set("Idempotency-Key", idem())
      .send({ type: "api_call", quantity: -5 });
    expect(negative.status).toBe(400);

    const aiNoTokens = await request(app)
      .post("/api/v1/metering/track")
      .set("Authorization", key.header)
      .set("Idempotency-Key", idem())
      .send({ type: "ai_tokens" });
    expect(aiNoTokens.status).toBe(400);

    expect(await eventCount()).toBe(0);
  });

  test("tenant isolation: key from tenant A records under A only", async () => {
    const b = await registerUser(app);
    const keyB = await makeKey(b.body.tenant.id);

    await request(app)
      .post("/api/v1/metering/track")
      .set("Authorization", keyB.header)
      .set("Idempotency-Key", idem())
      .send({ type: "api_call", quantity: 1 });

    const rows = await db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.tenantId, tenantId));
    expect(rows).toHaveLength(0);
  });

  test("cached input must be a subset of input tokens (review #8)", async () => {
    const noInput = await request(app)
      .post("/api/v1/metering/track")
      .set("Authorization", key.header)
      .set("Idempotency-Key", idem())
      .send({ type: "ai_tokens", cachedInputTokens: 100 });
    expect(noInput.status).toBe(400);
    expect(noInput.body.error.code).toBe("validation_error");

    const tooMuchCached = await request(app)
      .post("/api/v1/metering/track")
      .set("Authorization", key.header)
      .set("Idempotency-Key", idem())
      .send({ type: "ai_tokens", inputTokens: 50, cachedInputTokens: 100 });
    expect(tooMuchCached.status).toBe(400);
    expect(tooMuchCached.body.error.code).toBe("validation_error");

    // nothing was metered by either invalid payload
    expect(await eventCount()).toBe(0);
  });
});
