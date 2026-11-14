import { Router } from "express";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

import type { AppDb } from "../../db/index.js";
import { webhookEvents } from "../../db/schema.js";
import { AppError } from "../../middleware/error.js";
import { getStripe } from "../../services/stripe.js";
import { processStripeEvent } from "./service.js";

/**
 * POST /webhooks/stripe (§5G). Only VERIFIED events are trusted: the raw
 * body arrives via `express.raw()` mounted before the JSON parser, so the
 * signature covers the exact bytes Stripe sent. Every event is recorded in
 * `webhook_events`; a delivered event is never reprocessed (Review Focus 3).
 */
export function createWebhooksRouter(db: AppDb): Router {
  const router = Router();

  router.post("/stripe", async (req, res, next) => {
    try {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      const stripe = getStripe();
      if (!stripe || !secret) {
        throw new AppError(
          503,
          "stripe_not_configured",
          "Stripe billing is not configured on this deployment",
        );
      }

      const signature = req.headers["stripe-signature"];
      const payload = req.body;
      if (typeof signature !== "string" || !Buffer.isBuffer(payload)) {
        throw new AppError(
          400,
          "invalid_signature",
          "Missing Stripe signature or raw body",
        );
      }

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(payload, signature, secret);
      } catch {
        throw new AppError(
          400,
          "invalid_signature",
          "Stripe signature verification failed",
        );
      }

      // Claim the delivery slot. A retry of a FAILED event takes its row
      // over and reprocesses; anything else already present is a duplicate.
      const claimed = await db
        .insert(webhookEvents)
        .values({
          stripeEventId: event.id,
          type: event.type,
          status: "received",
          payload: event as unknown as Record<string, unknown>,
        })
        .onConflictDoNothing()
        .returning({ id: webhookEvents.id });

      let claimId: string;
      const firstClaim = claimed[0];
      if (firstClaim) {
        claimId = firstClaim.id;
      } else {
        const rows = await db
          .select()
          .from(webhookEvents)
          .where(eq(webhookEvents.stripeEventId, event.id))
          .limit(1);
        const existing = rows[0];
        if (!existing || existing.status !== "failed") {
          res.status(200).json({ received: true, duplicate: true });
          return;
        }
        await db
          .update(webhookEvents)
          .set({ status: "received", error: null, receivedAt: new Date() })
          .where(eq(webhookEvents.id, existing.id));
        claimId = existing.id;
      }

      try {
        await processStripeEvent(db, event, stripe);
      } catch (err) {
        // Keep the failure visible and answer 5xx so Stripe redelivers.
        await db
          .update(webhookEvents)
          .set({
            status: "failed",
            error: err instanceof Error ? err.message : "unknown error",
          })
          .where(eq(webhookEvents.id, claimId));
        throw err;
      }

      await db
        .update(webhookEvents)
        .set({ status: "processed", processedAt: new Date() })
        .where(eq(webhookEvents.id, claimId));

      res.status(200).json({ received: true, duplicate: false });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
