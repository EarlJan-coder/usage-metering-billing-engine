import request from "supertest";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { seedPlans } from "../src/db/seed.js";
import { closeTestDb, db, resetDb } from "./helpers/db.js";
import { registerUser } from "./helpers/auth.js";

const app = createApp(db);

type Subject = {
  cookie: string;
  tenantId: string;
  userId: string;
  email: string;
  keyId: string;
  keyPlaintext: string;
  eventIds: string[];
};

async function makeSubject(name: string, email: string): Promise<Subject> {
  const reg = await registerUser(app, { name, email });

  const key = await request(app)
    .post("/api/v1/api-keys")
    .set("Cookie", reg.cookie)
    .send({ name: `${name}'s key` });
  expect(key.status).toBe(201);

  const eventIds: string[] = [];
  for (let i = 0; i < 2; i++) {
    const res = await request(app)
      .post("/api/v1/metering/track")
      .set("Authorization", `Bearer ${key.body.plaintext}`)
      .set("Idempotency-Key", `${email}-track-${i}`)
      .send({ type: "api_call", quantity: 1 });
    expect(res.status).toBe(201);
    eventIds.push(res.body.event.id);
  }

  return {
    cookie: reg.cookie,
    tenantId: reg.body.tenant.id,
    userId: reg.body.user.id,
    email,
    keyId: key.body.id,
    keyPlaintext: key.body.plaintext,
    eventIds,
  };
}

/** Every identifier that belongs to `subject` and must never leak elsewhere. */
function markers(subject: Subject): string[] {
  return [
    subject.tenantId,
    subject.userId,
    subject.email,
    subject.keyId,
    subject.keyPlaintext,
    ...subject.eventIds,
  ];
}

function expectNoForeignIds(body: unknown, foreign: Subject, where: string) {
  const raw = JSON.stringify(body);
  for (const marker of markers(foreign)) {
    expect(raw.includes(marker), `${where} leaked ${marker}`).toBe(false);
  }
}

describe("tenant isolation matrix (Task 13)", () => {
  let alice: Subject;
  let bob: Subject;

  beforeEach(async () => {
    await resetDb();
    await seedPlans(db);
    alice = await makeSubject("Alice Iso", "alice-iso@example.com");
    bob = await makeSubject("Bob Iso", "bob-iso@example.com");
  });

  afterAll(closeTestDb);

  const dataEndpoints = (cookie: string): Array<[string, () => Promise<request.Response>]> => [
    ["usage/summary", () => request(app).get("/api/v1/usage/summary").set("Cookie", cookie)],
    ["usage", () => request(app).get("/api/v1/usage").set("Cookie", cookie)],
    ["usage/history", () => request(app).get("/api/v1/usage/history").set("Cookie", cookie)],
    ["billing/summary", () => request(app).get("/api/v1/billing/summary").set("Cookie", cookie)],
    ["subscriptions/current", () => request(app).get("/api/v1/subscriptions/current").set("Cookie", cookie)],
    ["api-keys", () => request(app).get("/api/v1/api-keys").set("Cookie", cookie)],
    ["tenants", () => request(app).get("/api/v1/tenants").set("Cookie", cookie)],
  ];

  test("every tenant-scoped data endpoint is clean of foreign ids", async () => {
    for (const [label, call] of dataEndpoints(alice.cookie)) {
      const res = await call();
      expect(res.status).toBe(200);
      expectNoForeignIds(res.body, bob, `alice ${label}`);
    }

    // and symmetrically: Bob never sees Alice
    for (const [label, call] of dataEndpoints(bob.cookie)) {
      const res = await call();
      expect(res.status).toBe(200);
      expectNoForeignIds(res.body, alice, `bob ${label}`);
    }
  });

  test("GET /tenants/:id with a foreign tenant id → 404, no foreign ids", async () => {
    const res = await request(app)
      .get(`/api/v1/tenants/${bob.tenantId}`)
      .set("Cookie", alice.cookie);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
    expectNoForeignIds(res.body, bob, "GET /tenants/:id");
  });

  test("DELETE /api-keys/:id with a foreign key id → 404 and the key survives", async () => {
    const res = await request(app)
      .delete(`/api/v1/api-keys/${bob.keyId}`)
      .set("Cookie", alice.cookie);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
    expectNoForeignIds(res.body, bob, "DELETE /api-keys/:id");

    // Bob's key still authenticates and still shows in Bob's list
    const track = await request(app)
      .post("/api/v1/metering/track")
      .set("Authorization", `Bearer ${bob.keyPlaintext}`)
      .set("Idempotency-Key", "iso-after-delete")
      .send({ type: "api_call", quantity: 1 });
    expect(track.status).toBe(201);

    const list = await request(app)
      .get("/api/v1/api-keys")
      .set("Cookie", bob.cookie);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(bob.keyId);
    expect(list.body.items[0].status).toBe("active");
  });

  test("metering with an A key never records under B and vice versa", async () => {
    const before = await request(app)
      .get("/api/v1/usage/summary")
      .set("Cookie", bob.cookie);
    const callsBefore = before.body.totalApiCalls;

    const res = await request(app)
      .post("/api/v1/metering/track")
      .set("Authorization", `Bearer ${alice.keyPlaintext}`)
      .set("Idempotency-Key", "iso-cross-track")
      .send({ type: "api_call", quantity: 500 });
    expect(res.status).toBe(201);

    const after = await request(app)
      .get("/api/v1/usage/summary")
      .set("Cookie", bob.cookie);
    expect(after.body.totalApiCalls).toBe(callsBefore);

    const aliceAfter = await request(app)
      .get("/api/v1/usage/summary")
      .set("Cookie", alice.cookie);
    expect(aliceAfter.body.totalApiCalls).toBe(2 + 500); // 2 setup tracks + 500
    expectNoForeignIds(aliceAfter.body, bob, "alice summary");
  });
});
