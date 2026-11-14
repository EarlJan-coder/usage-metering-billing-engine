import { Router } from "express";

import type { AppDb } from "../../db/index.js";
import { requireAuth, requirePlatformAdmin } from "../../middleware/auth.js";
import * as service from "./service.js";

/**
 * Platform administration (§6H). Every route needs a session AND the
 * platform-admin flag — a regular tenant admin never gets in (403).
 */
export function createAdminRouter(db: AppDb): Router {
  const router = Router();
  router.use(requireAuth(db));
  router.use(requirePlatformAdmin);

  router.get("/tenants", async (_req, res, next) => {
    try {
      res.json(await service.getAdminTenants(db));
    } catch (err) {
      next(err);
    }
  });

  router.get("/metrics", async (_req, res, next) => {
    try {
      res.json(await service.getAdminMetrics(db));
    } catch (err) {
      next(err);
    }
  });

  router.get("/webhooks", async (_req, res, next) => {
    try {
      res.json(await service.getAdminWebhooks(db));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
