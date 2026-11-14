import { rateLimit } from "express-rate-limit";

/** Global ceiling: 300 requests/min/IP (backend-plan §5A). */
export const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  // Tests exercise rate limits on the auth limiter specifically; keep the
  // global one from interfering with normal test traffic.
  skip: () => process.env.NODE_ENV === "test" && process.env.TEST_RATE_LIMIT !== "1",
  message: {
    error: { message: "Too many requests, slow down", code: "rate_limited" },
  },
});

/** Auth endpoints: 10 attempts per 15 minutes per IP (backend-plan §5A). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test" && process.env.TEST_RATE_LIMIT !== "1",
  message: {
    error: { message: "Too many authentication attempts", code: "rate_limited" },
  },
});
