import { Router } from "express";

import type { AppDb } from "../../db/index.js";
import { requireAuth } from "../../middleware/auth.js";
import { originCheck } from "../../middleware/origin-check.js";
import { validate } from "../../middleware/validate.js";
import { checkoutSchema } from "./schema.js";
import * as service from "./service.js";

/**
 * Subscription management (§5G). Checkout returns a hosted-page URL; the
 * subscription itself only changes when a verified Stripe webhook lands.
 */
export function createSubscriptionsRouter(db: AppDb): Router {
  const router = Router();
  router.use(requireAuth(db));

  router.get("/current", async (req, res, next) => {
    try {
      res.json(await service.getCurrent(db, req.auth!.tenantId));
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/checkout",
    originCheck,
    validate(checkoutSchema),
    async (req, res, next) => {
      try {
        res.json(
          await service.startCheckout(db, req.auth!.tenantId, req.body.planId),
        );
      } catch (err) {
        next(err);
      }
    },
  );

  router.post("/cancel", originCheck, async (req, res, next) => {
    try {
      res.json(await service.cancelSubscription(db, req.auth!.tenantId));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
