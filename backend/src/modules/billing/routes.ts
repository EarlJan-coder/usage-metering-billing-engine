import { Router } from "express";

import type { AppDb } from "../../db/index.js";
import { requireAuth } from "../../middleware/auth.js";
import { getBillingSummary } from "./service.js";

/** Billing summary (§6G) — tenant-scoped. */
export function createBillingRouter(db: AppDb): Router {
  const router = Router();
  router.use(requireAuth(db));

  router.get("/summary", async (req, res, next) => {
    try {
      res.json(await getBillingSummary(db, req.auth!.tenantId));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
