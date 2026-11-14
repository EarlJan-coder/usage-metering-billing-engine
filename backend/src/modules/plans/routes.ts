import { Router } from "express";
import { asc, eq } from "drizzle-orm";

import type { AppDb } from "../../db/index.js";
import { plans } from "../../db/schema.js";

/**
 * Plan catalog — PUBLIC (Ruling 5): the marketing site and the pricing
 * page render it before login. Active plans only, cheapest first.
 */
export function createPlansRouter(db: AppDb): Router {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      const rows = await db
        .select()
        .from(plans)
        .where(eq(plans.active, true))
        .orderBy(asc(plans.priceMinor));

      res.json({
        items: rows.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          description: p.description,
          priceMinor: p.priceMinor,
          currency: p.currency,
          interval: p.interval,
          callsLimit: p.apiCallsLimit,
          tokensLimit: p.aiTokensLimit,
          features: p.features,
          isDefault: p.isDefault,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
