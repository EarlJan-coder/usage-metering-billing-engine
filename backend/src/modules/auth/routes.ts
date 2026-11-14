import { Router } from "express";

import type { AppDb } from "../../db/index.js";
import { AppError } from "../../middleware/error.js";
import { originCheck } from "../../middleware/origin-check.js";
import { authLimiter } from "../../middleware/rate-limit.js";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
} from "./schema.js";
import * as service from "./service.js";

export const SESSION_COOKIE = "sid";

export function setSessionCookie(
  res: { cookie: (name: string, value: string, opts: object) => unknown },
  token: string,
): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function createAuthRouter(db: AppDb): Router {
  const router = Router();

  router.post(
    "/register",
    authLimiter,
    originCheck,
    validate(registerSchema),
    async (req, res, next) => {
      try {
        const { payload, token } = await service.register(db, req.body);
        setSessionCookie(res, token);
        res.status(201).json(payload);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/login",
    authLimiter,
    originCheck,
    validate(loginSchema),
    async (req, res, next) => {
      try {
        const { payload, token } = await service.login(db, req.body);
        setSessionCookie(res, token);
        res.status(200).json(payload);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post("/logout", originCheck, async (req, res, next) => {
    try {
      await service.logout(db, req.sessionToken ?? req.cookies?.sid);
      res.clearCookie(SESSION_COOKIE, { path: "/" });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.get("/me", requireAuth(db), async (req, res, next) => {
    try {
      const payload = await service.me(db, req.auth!);
      res.json(payload);
    } catch (err) {
      next(err);
    }
  });

  // No email-sending capability exists (Ruling 6): honest 501 stub.
  router.post(
    "/forgot-password",
    authLimiter,
    originCheck,
    validate(forgotPasswordSchema),
    (_req, _res, next) => {
      next(
        new AppError(
          501,
          "not_implemented",
          "Password reset is not available on this deployment yet",
        ),
      );
    },
  );

  return router;
}
