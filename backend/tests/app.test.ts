import request from "supertest";
import { describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config/env.js";

describe("app scaffolding (Task 1)", () => {
  test("GET /healthz returns 200 { status: \"ok\" }", async () => {
    const app = createApp();
    const res = await request(app).get("/healthz");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  test("unknown route returns the 404 error envelope", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/definitely-missing");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { message: expect.any(String), code: "not_found" },
    });
  });

  test("loadConfig requires DATABASE_URL and names it in the error", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  test("loadConfig accepts a complete environment", () => {
    const config = loadConfig({
      PORT: "4100",
      DATABASE_URL: "postgres://user:pass@localhost:5432/billing",
      SESSION_SECRET: "test-secret",
      NODE_ENV: "test",
      CORS_ORIGIN: "http://localhost:3000",
    });

    expect(config.port).toBe(4100);
    expect(config.databaseUrl).toBe(
      "postgres://user:pass@localhost:5432/billing",
    );
    expect(config.sessionSecret).toBe("test-secret");
    expect(config.nodeEnv).toBe("test");
    expect(config.corsOrigin).toBe("http://localhost:3000");
  });
});
