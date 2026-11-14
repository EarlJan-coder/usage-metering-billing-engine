import type { NextFunction, Request, Response } from "express";

import { AppError } from "./error.js";

/**
 * CSRF origin guard for cookie-authenticated writes (Review Focus 7).
 * A cross-origin request carrying our cookie must be rejected; requests
 * with no Origin header (curl, server-to-server) pass.
 */
export function originCheck(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const origin = req.headers.origin;
  if (!origin) {
    next();
    return;
  }
  const allowed = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let host = req.headers.host ?? "";
  const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol;
  const selfOrigins = [`${proto}://${host}`];
  // localhost dev servers commonly differ in port between frameworks
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    const hostname = host.split(":")[0]!;
    selfOrigins.push(`http://${hostname}:4000`, `http://${hostname}:3000`);
  }

  if (allowed.includes(origin) || selfOrigins.includes(origin)) {
    next();
    return;
  }
  next(new AppError(403, "bad_origin", "Request origin is not allowed"));
}
