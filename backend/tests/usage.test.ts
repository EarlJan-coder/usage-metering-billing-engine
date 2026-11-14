import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { seedPlans } from "../src/db/seed.js";
import * as schema from "../src/db/schema.js";
import { closeTestDb, db, resetDb } from "./helpers/db.js";
import { registerUser } from "./helpers/auth.js";
import { generateApiKey } from "../src/services/api-key.js";

const app = createApp(db);
const { aiTokenUsageDetails, apiKeys, subscriptions, usageEvents } = schema;

const DAY_MS = 24 * 3600 * 1000;

function dayLabel(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function seedEvent(opts: {
  tenantId: string;
  type: "api_call" | "ai_tokens";
  quantity: number;
  createdAt: Date;
  idempotencyKey: string;
  apiKeyId?: string;
  costMinor?: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}): Promise<string> {
  const [row] = await db
    .insert(usageEvents)
    .values({
      tenantId: opts.tenantId,
      type: opts.type,
      quantity: opts.quantity,
      costMinor: opts.costMinor ?? 0,
      pricingVersion: 1,
      idempotencyKey: opts.idempotencyKey,
      apiKeyId: opts.apiKeyId ?? null,
      createdAt: opts.createdAt,
    })
    .returning({ id: usageEvents.id });

  if (opts.model !== undefined) {
    await db.insert(aiTokenUsageDetails).values({
      usageEventId: row!.id,
      inputTokens: opts.inputTokens ?? 0,
      outputTokens: opts.outputTokens ?? 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      model: opts.model,
    });
  }
  return row!.id;
}

describe("usage analytics (Task 11)", () => {
  let cookieA: string;
  let tenantA: string;
  let key1Id: string;
  let key2Id: string;
  let days: [Date, Date, Date];
  let eventIds: Record<string, string>;

  beforeEach(async () => {
    await resetDb();
    await seedPlans(db);

    const a = await registerUser(app, { name: "Ann" });
    cookieA = a.cookie;
    tenantA = a.body.tenant.id;

    const ids: Record<string, string> = {};
    for (const name of ["key-one", "key-two"]) {
      const { plaintext, keyPrefix, keyHash } = generateApiKey();
      const [row] = await db
        .insert(apiKeys)
        .values({ tenantId: tenantA, name, keyPrefix, keyHash })
        .returning({ id: apiKeys.id });
      ids[name] = row!.id;
    }
    key1Id = ids["key-one"]!;
    key2Id = ids["key-two"]!;

    // Three consecutive FULLY-PAST days (no midnight-edge flakes), all
    // inside a period we pin explicitly so fixtures stay deterministic on
    // any run date. The daily series zero-fills through today.
    const now = new Date();
    const dayStart = (offsetDays: number): Date =>
      new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - offsetDays,
        ),
      );
    days = [dayStart(3), dayStart(2), dayStart(1)];
    const at12h = (d: Date): Date => new Date(d.getTime() + 12 * 3600 * 1000);
    await db
      .update(subscriptions)
      .set({
        currentPeriodStart: days[0],
        currentPeriodEnd: new Date(now.getTime() + 30 * DAY_MS),
      })
      .where(eq(subscriptions.tenantId, tenantA));

    eventIds = {
      "calls-0": await seedEvent({
        tenantId: tenantA,
        type: "api_call",
        quantity: 10,
        createdAt: at12h(days[0]),
        idempotencyKey: "u-calls-0",
        apiKeyId: key1Id,
      }),
      "tok-0": await seedEvent({
        tenantId: tenantA,
        type: "ai_tokens",
        quantity: 1_000,
        createdAt: new Date(at12h(days[0]).getTime() + 30_000),
        idempotencyKey: "u-tok-0",
        apiKeyId: key1Id,
        costMinor: 7,
        model: "model-x",
        inputTokens: 600,
        outputTokens: 400,
      }),
      "calls-1": await seedEvent({
        tenantId: tenantA,
        type: "api_call",
        quantity: 20,
        createdAt: at12h(days[1]),
        idempotencyKey: "u-calls-1",
        apiKeyId: key2Id,
      }),
      "tok-1": await seedEvent({
        tenantId: tenantA,
        type: "ai_tokens",
        quantity: 2_000,
        createdAt: new Date(at12h(days[1]).getTime() + 30_000),
        idempotencyKey: "u-tok-1",
        apiKeyId: key2Id,
        costMinor: 14,
        model: "model-y",
        inputTokens: 1_000,
        outputTokens: 1_000,
      }),
      "calls-2": await seedEvent({
        tenantId: tenantA,
        type: "api_call",
        quantity: 30,
        createdAt: at12h(days[2]),
        idempotencyKey: "u-calls-2",
        apiKeyId: key1Id,
      }),
      "tok-2": await seedEvent({
        tenantId: tenantA,
        type: "ai_tokens",
        quantity: 3_000,
        createdAt: new Date(at12h(days[2]).getTime() + 30_000),
        idempotencyKey: "u-tok-2",
        apiKeyId: key2Id,
        costMinor: 21,
        model: "model-x",
        inputTokens: 2_000,
        outputTokens: 1_000,
      }),
    };
  });

  afterAll(closeTestDb);

  test("GET /usage/summary totals, series, and quota are exact", async () => {
    const res = await request(app)
      .get("/api/v1/usage/summary")
      .set("Cookie", cookieA);

    expect(res.status).toBe(200);
    expect(res.body.totalApiCalls).toBe(60);
    expect(res.body.totalTokens).toBe(6_000);
    expect(res.body.estimatedCost).toBe(42);
    expect(res.body.currency).toBe("USD");

    const labels = [...days.map(dayLabel), dayLabel(new Date())];
    expect(res.body.apiCallsSeries).toEqual([
      { date: labels[0], value: 10 },
      { date: labels[1], value: 20 },
      { date: labels[2], value: 30 },
      { date: labels[3], value: 0 }, // today, zero-filled
    ]);
    expect(res.body.tokensSeries).toEqual([
      { date: labels[0], value: 1_000 },
      { date: labels[1], value: 2_000 },
      { date: labels[2], value: 3_000 },
      { date: labels[3], value: 0 },
    ]);
    expect(res.body.costSeries).toEqual([
      { date: labels[0], value: 7 },
      { date: labels[1], value: 14 },
      { date: labels[2], value: 21 },
      { date: labels[3], value: 0 },
    ]);

    // free plan: 1000 calls / 100k tokens
    expect(res.body.apiCallQuota).toEqual({ used: 60, limit: 1000 });
    expect(res.body.tokenQuota).toEqual({ used: 6000, limit: 100_000 });
    // nested quota form (frontend normalizer contract)
    expect(res.body.quota.apiCalls).toEqual({ used: 60, limit: 1000 });
    expect(res.body.quota.tokens).toEqual({ used: 6000, limit: 100_000 });
  });

  test("summary quota follows the plan's limits (null = unlimited)", async () => {
    const { plans } = schema;
    await db
      .update(plans)
      .set({ apiCallsLimit: 50, aiTokensLimit: null })
      .where(eq(plans.code, "free"));

    const res = await request(app)
      .get("/api/v1/usage/summary")
      .set("Cookie", cookieA);

    expect(res.body.apiCallQuota).toEqual({ used: 60, limit: 50 });
    expect(res.body.tokenQuota).toEqual({ used: 6_000, limit: null });
  });

  test("GET /usage history pagination math is exact", async () => {
    const res = await request(app)
      .get("/api/v1/usage/history?limit=2&offset=2")
      .set("Cookie", cookieA);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(6);
    expect(res.body.items).toHaveLength(2);

    // default order: createdAt desc
    expect(res.body.items[0].id).toBe(eventIds["tok-1"]);
    expect(res.body.items[1].id).toBe(eventIds["calls-1"]);

    const firstPage = await request(app)
      .get("/api/v1/usage/history?limit=2")
      .set("Cookie", cookieA);
    expect(firstPage.body.items[0].id).toBe(eventIds["tok-2"]);
    expect(firstPage.body.items).toHaveLength(2);
  });

  test("history rows carry the detail fields and sort asc on request", async () => {
    const res = await request(app)
      .get("/api/v1/usage/history?sort=createdAt&order=asc&limit=1")
      .set("Cookie", cookieA);

    expect(res.body.items[0]).toMatchObject({
      id: eventIds["calls-0"],
      type: "api_call",
      apiKeyName: "key-one",
      quantity: 10,
      status: "recorded",
    });

    const tokenRow = await request(app)
      .get("/api/v1/usage/history?search=model-y")
      .set("Cookie", cookieA);
    expect(tokenRow.body.total).toBe(1);
    expect(tokenRow.body.items[0]).toMatchObject({
      id: eventIds["tok-1"],
      model: "model-y",
      inputTokens: 1_000,
      outputTokens: 1_000,
      cost: 14,
      apiKeyName: "key-two",
    });
  });

  test("history search filters on model and API key name", async () => {
    const byModel = await request(app)
      .get("/api/v1/usage/history?search=model-x")
      .set("Cookie", cookieA);
    expect(byModel.body.total).toBe(2);
    const ids = byModel.body.items.map((i: { id: string }) => i.id).sort();
    expect(ids).toEqual([eventIds["tok-0"], eventIds["tok-2"]].sort());

    const byKey = await request(app)
      .get("/api/v1/usage/history?search=key-one")
      .set("Cookie", cookieA);
    expect(byKey.body.total).toBe(3); // calls-0, tok-0, calls-2
  });

  test("history from/to filters by day (inclusive)", async () => {
    const res = await request(app)
      .get(`/api/v1/usage/history?from=${dayLabel(days[0])}&to=${dayLabel(days[0])}`)
      .set("Cookie", cookieA);

    expect(res.body.total).toBe(2);
    const ids = res.body.items.map((i: { id: string }) => i.id).sort();
    expect(ids).toEqual([eventIds["calls-0"], eventIds["tok-0"]].sort());
  });

  test("tenant B's events never appear in tenant A's responses", async () => {
    const b = await registerUser(app, { name: "Bob" });
    await seedEvent({
      tenantId: b.body.tenant.id,
      type: "api_call",
      quantity: 999,
      createdAt: days[2],
      idempotencyKey: "b-calls",
    });

    const summary = await request(app)
      .get("/api/v1/usage/summary")
      .set("Cookie", cookieA);
    expect(summary.body.totalApiCalls).toBe(60);

    const history = await request(app)
      .get("/api/v1/usage/history")
      .set("Cookie", cookieA);
    expect(history.body.total).toBe(6);
  });

  test("GET /usage byApiKey and byModel sums equal the totals", async () => {
    const res = await request(app)
      .get("/api/v1/usage")
      .set("Cookie", cookieA);

    expect(res.status).toBe(200);
    expect(res.body.currency).toBe("USD");

    const sum = (rows: Array<{ apiCalls: number; tokens: number; cost: number }>, key: "apiCalls" | "tokens" | "cost") =>
      rows.reduce((acc, row) => acc + row[key], 0);

    expect(res.body.byApiKey).toHaveLength(2);
    expect(sum(res.body.byApiKey, "apiCalls")).toBe(60);
    expect(sum(res.body.byApiKey, "tokens")).toBe(6_000);
    expect(sum(res.body.byApiKey, "cost")).toBe(42);

    const one = res.body.byApiKey.find((r: { name: string }) => r.name === "key-one");
    expect(one).toMatchObject({ apiCalls: 40, tokens: 1_000, cost: 7 });

    expect(res.body.byModel).toHaveLength(2);
    expect(sum(res.body.byModel, "tokens")).toBe(6_000);
    expect(sum(res.body.byModel, "cost")).toBe(42);
    const modelX = res.body.byModel.find((r: { name: string }) => r.name === "model-x");
    expect(modelX).toMatchObject({ tokens: 4_000, cost: 28 });
  });

  test("GET /usage honours from/to and granularity", async () => {
    const res = await request(app)
      .get(
        `/api/v1/usage?from=${dayLabel(days[1])}&to=${dayLabel(days[2])}&granularity=daily`,
      )
      .set("Cookie", cookieA);

    expect(res.status).toBe(200);
    expect(res.body.apiCallsSeries).toEqual([
      { date: dayLabel(days[1]), value: 20 },
      { date: dayLabel(days[2]), value: 30 },
    ]);
    // out-of-range events stay out of the breakdowns too
    const sum = (rows: Array<{ apiCalls: number }>) =>
      rows.reduce((acc, row) => acc + row.apiCalls, 0);
    expect(sum(res.body.byApiKey)).toBe(50);
  });

  test("usage endpoints require a session", async () => {
    for (const path of ["/api/v1/usage/summary", "/api/v1/usage", "/api/v1/usage/history"]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    }
  });
});
