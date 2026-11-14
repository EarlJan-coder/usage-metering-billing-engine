import request from "supertest";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { seedPlans } from "../src/db/seed.js";
import * as schema from "../src/db/schema.js";
import { closeTestDb, db, resetDb } from "./helpers/db.js";

const { users, sessions, subscriptions } = schema;

const app = createApp(db);

async function countRows(table: { _: unknown }): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(table as never);
  return rows[0]?.n ?? -1;
}

describe("auth (Task 3)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPlans(db);
  });

  afterAll(closeTestDb);

  const validBody = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    password: "correct-horse-1",
  };

  test("register returns 201 with user+tenant and an HttpOnly cookie", async () => {
    const res = await request(app).post("/api/v1/auth/register").send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: "ada@example.com",
      role: "admin",
      name: "Ada Lovelace",
    });
    expect(res.body.user.id).toBeTruthy();
    expect(res.body.tenant).toMatchObject({ name: "Ada Lovelace's Workspace" });
    expect(res.body.tenant.id).toBeTruthy();

    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    const sid = String(setCookie);
    expect(sid).toContain("sid=");
    expect(sid).toContain("HttpOnly");
    expect(sid.toLowerCase()).toContain("samesite=lax");
  });

  test("register stores a bcrypt hash, never the plaintext password", async () => {
    await request(app).post("/api/v1/auth/register").send(validBody);

    const [row] = await db.select().from(users).limit(1);
    expect(row).toBeDefined();
    expect(row!.passwordHash).not.toBe(validBody.password);
    expect(row!.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(row!.passwordHash.length).toBeGreaterThan(30);
  });

  test("register creates a free-plan subscription for the new tenant", async () => {
    const res = await request(app).post("/api/v1/auth/register").send(validBody);

    const subs = await db.select().from(subscriptions);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.tenantId).toBe(res.body.tenant.id);
    expect(subs[0]!.status).toBe("active");
    expect(subs[0]!.currentPeriodStart).toBeTruthy();
    expect(subs[0]!.currentPeriodEnd).toBeTruthy();
  });

  test("duplicate email → 409 email_taken", async () => {
    await request(app).post("/api/v1/auth/register").send(validBody);
    const res = await request(app).post("/api/v1/auth/register").send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("email_taken");
    expect(await countRows(users)).toBe(1);
  });

  test("login happy path returns 200 + cookie + user/tenant", async () => {
    await request(app).post("/api/v1/auth/register").send(validBody);
    const res = await request(app).post("/api/v1/auth/login").send({
      email: validBody.email,
      password: validBody.password,
    });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: validBody.email });
    expect(res.body.tenant.id).toBeTruthy();
    expect(String(res.headers["set-cookie"])).toContain("sid=");
  });

  test("wrong password and unknown email both return 401 invalid_credentials", async () => {
    await request(app).post("/api/v1/auth/register").send(validBody);

    const wrongPw = await request(app).post("/api/v1/auth/login").send({
      email: validBody.email,
      password: "not-the-password",
    });
    expect(wrongPw.status).toBe(401);
    expect(wrongPw.body.error.code).toBe("invalid_credentials");

    const unknown = await request(app).post("/api/v1/auth/login").send({
      email: "nobody@example.com",
      password: "whatever-123",
    });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.code).toBe("invalid_credentials");
    // identical bodies → no user enumeration
    expect(unknown.body).toEqual(wrongPw.body);
  });

  test("GET /auth/me with cookie → 200; without cookie → 401", async () => {
    const reg = await request(app)
      .post("/api/v1/auth/register")
      .send(validBody);
    const cookie = String(reg.headers["set-cookie"]).split(";")[0]!;

    const me = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(validBody.email);

    const anon = await request(app).get("/api/v1/auth/me");
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe("unauthorized");
  });

  test("logout deletes the session: /auth/me → 401 afterwards", async () => {
    const reg = await request(app)
      .post("/api/v1/auth/register")
      .send(validBody);
    const cookie = String(reg.headers["set-cookie"]).split(";")[0]!;

    expect(await countRows(sessions)).toBe(1);
    const out = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", cookie);
    expect(out.status).toBe(204);
    expect(await countRows(sessions)).toBe(0);

    const me = await request(app).get("/api/v1/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(401);
  });

  test("forgot-password → 501 not_implemented", async () => {
    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: validBody.email });
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe("not_implemented");
  });
});
