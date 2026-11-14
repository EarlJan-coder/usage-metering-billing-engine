import request from "supertest";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { seedPlans } from "../src/db/seed.js";
import { closeTestDb, db, resetDb } from "./helpers/db.js";

const app = createApp(db);

const creds = {
  name: "Grace Hopper",
  email: "grace@example.com",
  password: "secure-pass-99",
};

describe("security middleware (Task 3)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPlans(db);
    delete process.env.TEST_RATE_LIMIT;
  });

  afterAll(closeTestDb);

  test("register body missing password → 400 validation_error", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      name: "No Password",
      email: "nopw@example.com",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
    expect(res.body.error.message).toMatch(/password/i);
  });

  test("cross-origin write with a valid cookie → 403 bad_origin", async () => {
    await request(app).post("/api/v1/auth/register").send(creds);
    const login = await request(app).post("/api/v1/auth/login").send({
      email: creds.email,
      password: creds.password,
    });
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;

    const cross = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", cookie)
      .set("Origin", "https://evil.example");
    expect(cross.status).toBe(403);
    expect(cross.body.error.code).toBe("bad_origin");

    // session still alive — the foreign request did not log us out
    const me = await request(app).get("/api/v1/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
  });

  test("same-origin and absent Origin pass the origin check", async () => {
    await request(app).post("/api/v1/auth/register").send(creds);
    const login = await request(app).post("/api/v1/auth/login").send({
      email: creds.email,
      password: creds.password,
    });
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;

    const sameOrigin = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000");
    expect(sameOrigin.status).toBe(204);

    const noOrigin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: creds.email, password: creds.password });
    expect(noOrigin.status).toBe(200);
  });

  test("11th auth attempt inside the window → 429 rate_limited", async () => {
    process.env.TEST_RATE_LIMIT = "1";
    const bad = { email: "brute@example.com", password: "wrong-pass-1" };

    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      const res = await request(app).post("/api/v1/auth/login").send(bad);
      lastStatus = res.status;
      if (res.status === 429) {
        expect(res.body.error.code).toBe("rate_limited");
        break;
      }
    }
    expect(lastStatus).toBe(429);
    delete process.env.TEST_RATE_LIMIT;
  });

  test("helmet security headers are present", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
  });
});
