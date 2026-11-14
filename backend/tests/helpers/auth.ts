import request from "supertest";
import type { Express } from "express";

export type RegisterResult = {
  cookie: string;
  body: { user: { id: string; email: string }; tenant: { id: string; name: string } };
};

let counter = 0;

/** Registers a user through the real endpoint and returns their session cookie. */
export async function registerUser(
  app: Express,
  overrides: { email?: string; password?: string; name?: string } = {},
): Promise<RegisterResult> {
  counter += 1;
  const email = overrides.email ?? `user-${counter}-${Date.now()}@example.com`;
  const res = await request(app).post("/api/v1/auth/register").send({
    name: overrides.name ?? `User ${counter}`,
    email,
    password: overrides.password ?? "test-password-1",
  });
  if (res.status !== 201) {
    throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return {
    cookie: String(res.headers["set-cookie"]).split(";")[0]!,
    body: res.body,
  };
}
