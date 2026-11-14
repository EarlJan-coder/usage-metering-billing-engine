import request from "supertest";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { authenticateApiKey } from "../src/services/api-key.js";
import { seedPlans } from "../src/db/seed.js";
import * as schema from "../src/db/schema.js";
import { closeTestDb, db, resetDb } from "./helpers/db.js";
import { registerUser } from "./helpers/auth.js";

const app = createApp(db);
const { apiKeys } = schema;

async function createKey(
  cookie: string,
  name = "Test key",
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await request(app)
    .post("/api/v1/api-keys")
    .set("Cookie", cookie)
    .send({ name });
  return { status: res.status, body: res.body };
}

describe("api keys (Task 5)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPlans(db);
  });

  afterAll(closeTestDb);

  test("POST creates a key and returns the plaintext exactly once", async () => {
    const a = await registerUser(app);
    const { status, body } = await createKey(a.cookie, "CI key");

    expect(status).toBe(201);
    expect(typeof body.plaintext).toBe("string");
    expect(String(body.plaintext)).toMatch(/^umk_[0-9a-f]{40}$/);
    expect(body.name).toBe("CI key");
    expect(body.status).toBe("active");
    expect(typeof body.maskedKey).toBe("string");
    expect(String(body.maskedKey)).not.toContain(String(body.plaintext).slice(12));
  });

  test("list never contains the secret or the hash", async () => {
    const a = await registerUser(app);
    const created = await createKey(a.cookie);

    const res = await request(app)
      .get("/api/v1/api-keys")
      .set("Cookie", a.cookie);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(String(created.body.plaintext));
    expect(raw).not.toContain("keyHash");
    expect(raw).not.toMatch(/umk_[0-9a-f]{40}/);
    expect(res.body.items[0]).not.toHaveProperty("plaintext");
  });

  test("stored hash differs from the plaintext", async () => {
    const a = await registerUser(app);
    const created = await createKey(a.cookie);

    const rows = await db.select().from(apiKeys);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.keyHash).not.toBe(created.body.plaintext);
    expect(rows[0]!.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]!.keyPrefix).toBe(String(created.body.plaintext).slice(0, 12));
  });

  test("revoked key authenticates as null (Review Focus 6)", async () => {
    const a = await registerUser(app);
    const created = await createKey(a.cookie);
    const plaintext = String(created.body.plaintext);

    expect(await authenticateApiKey(plaintext)).toMatchObject({
      tenantId: expect.any(String),
    });

    const del = await request(app)
      .delete(`/api/v1/api-keys/${created.body.id}`)
      .set("Cookie", a.cookie);
    expect(del.status).toBe(204);

    expect(await authenticateApiKey(plaintext)).toBeNull();
  });

  test("DELETE another tenant's key id → 404 (IDOR guard)", async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const bKey = await createKey(b.cookie, "Bob's key");

    const res = await request(app)
      .delete(`/api/v1/api-keys/${bKey.body.id}`)
      .set("Cookie", a.cookie);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
    // Bob's key still works
    expect(await authenticateApiKey(String(bKey.body.plaintext))).not.toBeNull();
  });

  test("authenticateApiKey(garbage) → null", async () => {
    expect(await authenticateApiKey("not-a-key")).toBeNull();
    expect(await authenticateApiKey(undefined)).toBeNull();
    expect(await authenticateApiKey("umk_0000000000000000000000000000000000000000")).toBeNull();
  });

  test("successful auth updates lastUsedAt", async () => {
    const a = await registerUser(app);
    const created = await createKey(a.cookie);

    const before = await db.select().from(apiKeys);
    expect(before[0]!.lastUsedAt).toBeNull();

    await authenticateApiKey(String(created.body.plaintext));

    const after = await db.select().from(apiKeys);
    expect(after[0]!.lastUsedAt).not.toBeNull();
  });

  test("create requires a session", async () => {
    const res = await request(app)
      .post("/api/v1/api-keys")
      .send({ name: "anon" });
    expect(res.status).toBe(401);
  });

  test("missing name → 400 validation_error", async () => {
    const a = await registerUser(app);
    const res = await request(app)
      .post("/api/v1/api-keys")
      .set("Cookie", a.cookie)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });
});
