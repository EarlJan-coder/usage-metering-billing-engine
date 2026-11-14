import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { seedPlans } from "../src/db/seed.js";
import * as schema from "../src/db/schema.js";
import { closeTestDb, db, resetDb } from "./helpers/db.js";
import { registerUser } from "./helpers/auth.js";

const app = createApp(db);
const { tenantMembers, subscriptions, tenants } = schema;

describe("tenants (Task 4)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPlans(db);
  });

  afterAll(closeTestDb);

  test("user A sees only their own tenants", async () => {
    const a = await registerUser(app, { name: "Alice" });
    const b = await registerUser(app, { name: "Bob" });

    const res = await request(app)
      .get("/api/v1/tenants")
      .set("Cookie", a.cookie);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(a.body.tenant.id);
    expect(res.body.items[0].name).toBe("Alice's Workspace");
    const ids = res.body.items.map((t: { id: string }) => t.id);
    expect(ids).not.toContain(b.body.tenant.id);
  });

  test("A requesting B's tenant id → 404 (IDOR guard)", async () => {
    const a = await registerUser(app, { name: "Alice" });
    const b = await registerUser(app, { name: "Bob" });

    const res = await request(app)
      .get(`/api/v1/tenants/${b.body.tenant.id}`)
      .set("Cookie", a.cookie);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
    expect(JSON.stringify(res.body)).not.toContain(b.body.tenant.id);
  });

  test("A requesting their own tenant → 200 with membership role", async () => {
    const a = await registerUser(app, { name: "Alice" });

    const res = await request(app)
      .get(`/api/v1/tenants/${a.body.tenant.id}`)
      .set("Cookie", a.cookie);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: a.body.tenant.id,
      name: "Alice's Workspace",
      role: "admin",
    });
  });

  test("POST /tenants creates tenant + admin membership + free subscription", async () => {
    const a = await registerUser(app, { name: "Alice" });

    const res = await request(app)
      .post("/api/v1/tenants")
      .set("Cookie", a.cookie)
      .send({ name: "Second Workspace" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: expect.any(String), name: "Second Workspace" });

    const members = await db
      .select()
      .from(tenantMembers)
      .where(eq(tenantMembers.tenantId, res.body.id));
    expect(members).toHaveLength(1);
    expect(members[0]!.role).toBe("admin");
    expect(members[0]!.userId).toBe(a.body.user.id);

    const subs = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, res.body.id));
    expect(subs).toHaveLength(1);
    expect(subs[0]!.status).toBe("active");

    // session stays on the original tenant
    const me = await request(app).get("/api/v1/auth/me").set("Cookie", a.cookie);
    expect(me.body.tenant.id).toBe(a.body.tenant.id);
  });

  test("empty name → 400 validation_error", async () => {
    const a = await registerUser(app);

    const res = await request(app)
      .post("/api/v1/tenants")
      .set("Cookie", a.cookie)
      .send({ name: "   " });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
    expect(await db.select().from(tenants)).toHaveLength(1);
  });

  test("unauthenticated tenant list → 401", async () => {
    const res = await request(app).get("/api/v1/tenants");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });
});
