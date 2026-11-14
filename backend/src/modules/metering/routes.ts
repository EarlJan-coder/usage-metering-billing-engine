import { Router } from "express";

import type { AppDb } from "../../db/index.js";
import { authenticateApiKey } from "../../services/api-key.js";
import { AppError } from "../../middleware/error.js";
import { trackSchema } from "./schema.js";
import { trackUsage } from "./service.js";

/**
 * POST /metering/track — the only API-key-authenticated endpoint (§5C).
 * Auth is `Authorization: Bearer umk_…`, never the session cookie, so a
 * browser can never report usage on a tenant's behalf.
 */
export function createMeteringRouter(db: AppDb): Router {
  const router = Router();

  router.post("/track", async (req, res, next) => {
    try {
      const idempotencyKey = req.headers["idempotency-key"];
      if (typeof idempotencyKey !== "string" || idempotencyKey.trim() === "") {
        throw new AppError(
          400,
          "idempotency_key_required",
          "Idempotency-Key header is required",
        );
      }
      if (idempotencyKey.length > 255) {
        throw new AppError(
          400,
          "validation_error",
          "Idempotency-Key must be at most 255 characters",
        );
      }

      const auth = await authenticateApiKey(
        req.headers.authorization,
        db,
      );
      if (!auth) {
        throw new AppError(401, "invalid_api_key", "Invalid or revoked API key");
      }

      // Validate AFTER auth so unauthenticated junk never hits Zod parsing
      // cost — but before any row is written.
      const parsed = trackSchema.safeParse(req.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        throw new AppError(
          400,
          "validation_error",
          first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid request body",
        );
      }

      const result = await trackUsage(db, auth, parsed.data, idempotencyKey.trim(), {
        userAgent: req.headers["user-agent"],
        ip: req.ip,
      });

      if (result.created) {
        res.status(201).json({ event: result.event, duplicate: false });
      } else {
        res.status(200).json({ event: result.event, duplicate: true });
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
}
