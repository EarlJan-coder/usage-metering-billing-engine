import type { NextFunction, Request, Response } from "express";

import type { AppDb } from "../db/index.js";
import { AppError } from "./error.js";
import { resolveSession, type AuthContext } from "../services/session.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      sessionToken?: string;
    }
  }
}

/** Reads the raw `sid` cookie value (unhashed — hashing happens inside). */
export function readSessionCookie(req: Request): string | undefined {
  const raw = req.cookies?.sid;
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

/**
 * Cookie-session authentication: resolves `sid` → AuthContext or 401
 * (backend-plan §5B/Ruling 11).
 */
export function requireAuth(db: AppDb) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = readSessionCookie(req);
      const ctx = await resolveSession(db, token);
      if (!ctx) {
        throw new AppError(401, "unauthorized", "Authentication required");
      }
      req.auth = ctx;
      req.sessionToken = token;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** 403 unless the session user carries the platform-admin flag (Ruling 8). */
export function requirePlatformAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.auth) {
    next(new AppError(401, "unauthorized", "Authentication required"));
    return;
  }
  if (!req.auth.platformAdmin) {
    next(new AppError(403, "forbidden", "Platform administrator access required"));
    return;
  }
  next();
}
