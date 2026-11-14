import { Router } from "express";

import type { AppDb } from "../../db/index.js";
import { requireAuth } from "../../middleware/auth.js";
import * as service from "./service.js";

/**
 * Usage analytics (§6D/§6E): summary, ranged analytics, and the event
 * history. Everything is scoped to the session's tenant.
 */
export function createUsageRouter(db: AppDb): Router {
  const router = Router();
  router.use(requireAuth(db));

  router.get("/summary", async (req, res, next) => {
    try {
      res.json(await service.getSummary(db, req.auth!.tenantId));
    } catch (err) {
      next(err);
    }
  });

  router.get("/history", async (req, res, next) => {
    try {
      res.json(
        await service.getHistory(db, req.auth!.tenantId, {
          limit: req.query.limit as string | undefined,
          offset: req.query.offset as string | undefined,
          search: req.query.search as string | undefined,
          from: req.query.from as string | undefined,
          to: req.query.to as string | undefined,
          sort: req.query.sort as string | undefined,
          order: req.query.order as string | undefined,
        }),
      );
    } catch (err) {
      next(err);
    }
  });

  router.get("/", async (req, res, next) => {
    try {
      res.json(
        await service.getAnalytics(db, req.auth!.tenantId, {
          from: req.query.from as string | undefined,
          to: req.query.to as string | undefined,
          granularity: req.query.granularity as string | undefined,
        }),
      );
    } catch (err) {
      next(err);
    }
  });

  return router;
}
