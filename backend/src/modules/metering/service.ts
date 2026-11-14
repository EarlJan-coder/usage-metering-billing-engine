import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

import type { AppDb } from "../../db/index.js";
import {
  aiTokenUsageDetails,
  idempotencyRecords,
  subscriptions,
  usageEvents,
} from "../../db/schema.js";
import { utcMonthBounds } from "../../db/seed.js";
import { enqueueJob } from "../../jobs/queue.js";
import { calculateCost } from "../cost-calculation/calculator.js";
import { checkQuota } from "../quotas/service.js";
import { getCurrentSubscription } from "../subscriptions/repository.js";
import { AppError } from "../../middleware/error.js";
import type { TrackInput } from "./schema.js";

const ENDPOINT = "metering/track";

export type TrackEvent = {
  id: string;
  type: "api_call" | "ai_tokens";
  quantity: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  model: string | null;
  costMinor: number;
  currency: string;
  pricingVersion: number;
  status: string;
  createdAt: string;
};

export type TrackResult =
  | { created: true; event: TrackEvent }
  | { created: false; event: TrackEvent };

function hashRequest(input: TrackInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function shapeEvent(
  row: typeof usageEvents.$inferSelect,
  detail: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    cachedInputTokens?: number | null;
    reasoningTokens?: number | null;
    model?: string | null;
  },
): TrackEvent {
  return {
    id: row.id,
    type: row.type,
    quantity: row.quantity,
    inputTokens: detail.inputTokens ?? null,
    outputTokens: detail.outputTokens ?? null,
    cachedInputTokens: detail.cachedInputTokens ?? null,
    reasoningTokens: detail.reasoningTokens ?? null,
    model: detail.model ?? null,
    costMinor: row.costMinor,
    currency: row.currency,
    pricingVersion: row.pricingVersion,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Records one billable event idempotently (§5C) in ONE transaction:
 *
 *  1. claim the (tenant, endpoint, idempotencyKey) record — a concurrent
 *     or repeated claim blocks on the unique index, then replays the
 *     stored response (Review Focus 4: same key + different body still
 *     replays the ORIGINAL result);
 *  2. lock the tenant's subscription row FOR UPDATE (Task 8 quota check
 *     extends this same lock);
 *  3. price the event with the versioned calculator;
 *  4. insert usage_events (+ token detail row);
 *  5. store the response on the idempotency record and commit.
 */
export async function trackUsage(
  db: AppDb,
  auth: { tenantId: string; apiKeyId: string },
  input: TrackInput,
  idempotencyKey: string,
  context: { userAgent?: string; ip?: string },
): Promise<TrackResult> {
  const requestHash = hashRequest(input);

  const result = await db.transaction(async (tx) => {
    // 1. Claim the idempotency slot.
    const claimed = await tx
      .insert(idempotencyRecords)
      .values({
        tenantId: auth.tenantId,
        endpoint: ENDPOINT,
        idempotencyKey,
        requestHash,
        responseStatus: 201,
        responseBody: {},
      })
      .onConflictDoNothing()
      .returning({ id: idempotencyRecords.id });

    if (claimed.length === 0) {
      // Duplicate: the unique index made us wait for the winner to commit,
      // so this SELECT sees the final stored response.
      const rows = await tx
        .select()
        .from(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.tenantId, auth.tenantId),
            eq(idempotencyRecords.endpoint, ENDPOINT),
            eq(idempotencyRecords.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      const stored = rows[0]?.responseBody as { event?: TrackEvent } | null;
      if (stored?.event) {
        return { created: false as const, event: stored.event };
      }
      // Row exists but winner rolled back mid-flight — treat as fresh claim
      // is impossible (row wouldn't exist); fall through defensively.
      throw new Error("idempotency record in inconsistent state");
    }

    // 2. Serialize on the tenant's subscription row — the quota check
    //    below runs under this lock, so concurrent tracks cannot race
    //    past the limit (Review Focus 2).
    await tx.execute(
      sql`select id from subscriptions where tenant_id = ${auth.tenantId} for update`,
    );

    // 2b. Quota gate (Task 8). Reject BEFORE pricing/inserting: a rejected
    //     track writes no event, and the rollback releases the idempotency
    //     claim so a later retry may still succeed.
    const projected =
      input.type === "ai_tokens"
        ? {
            apiCalls: 0,
            tokens: (input.inputTokens ?? 0) + (input.outputTokens ?? 0),
          }
        : { apiCalls: input.quantity ?? 1, tokens: 0 };

    const decision = await checkQuota(tx, auth, projected);
    if (!decision.permitted) {
      if (decision.reason === "payment_required") {
        throw new AppError(
          402,
          "payment_required",
          "Subscription payment is required to record usage",
        );
      }
      throw new AppError(
        429,
        "quota_exceeded",
        `Plan ${decision.scope} quota exceeded`,
        { scope: decision.scope, used: decision.used, limit: decision.limit },
      );
    }

    // 3. Price it.
    const isTokens = input.type === "ai_tokens";
    const inputTokens = input.inputTokens ?? 0;
    const outputTokens = input.outputTokens ?? 0;
    const cachedInputTokens = input.cachedInputTokens ?? 0;
    const reasoningTokens = input.reasoningTokens ?? 0;
    const quantity = isTokens
      ? inputTokens + outputTokens
      : (input.quantity ?? 1);

    const cost = calculateCost({
      type: input.type,
      quantity: BigInt(quantity),
      inputTokens: BigInt(inputTokens),
      outputTokens: BigInt(outputTokens),
      cachedInputTokens: BigInt(cachedInputTokens),
      reasoningTokens: BigInt(reasoningTokens),
      model: input.model,
    });

    // 4. Persist the event.
    const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) };
    if (context.userAgent) metadata.userAgent = context.userAgent;
    if (context.ip) metadata.ip = context.ip;
    metadata.idempotencyKey = idempotencyKey;

    const [eventRow] = await tx
      .insert(usageEvents)
      .values({
        tenantId: auth.tenantId,
        apiKeyId: auth.apiKeyId,
        type: input.type,
        quantity,
        costMinor: Number(cost.costMinor),
        pricingVersion: cost.pricingVersion,
        idempotencyKey,
        metadata,
      })
      .returning();
    if (!eventRow) throw new Error("failed to insert usage event");

    if (isTokens) {
      await tx.insert(aiTokenUsageDetails).values({
        usageEventId: eventRow.id,
        inputTokens,
        outputTokens,
        cachedInputTokens,
        reasoningTokens,
        model: input.model ?? null,
      });
    }

    const event = shapeEvent(eventRow, {
      inputTokens: isTokens ? inputTokens : null,
      outputTokens: isTokens ? outputTokens : null,
      cachedInputTokens: isTokens ? cachedInputTokens : null,
      reasoningTokens: isTokens ? reasoningTokens : null,
      model: isTokens ? (input.model ?? null) : null,
    });

    // 5. Store the response for future replays.
    await tx
      .update(idempotencyRecords)
      .set({ responseBody: { event } })
      .where(eq(idempotencyRecords.id, claimed[0]!.id));

    return { created: true as const, event };
  });

  if (result.created) {
    // Task 10: an accepted track arms the usage-alert check for this
    // tenant-period (deduped by key). Queue trouble must never fail a
    // request whose event is already committed.
    try {
      const current = await getCurrentSubscription(db, auth.tenantId);
      const periodStart =
        current?.subscription.currentPeriodStart ?? utcMonthBounds().start;
      await enqueueJob(db, {
        type: "usage_alerts",
        payload: { tenantId: auth.tenantId },
        dedupeKey: `alerts:${auth.tenantId}:${periodStart.toISOString()}`,
      });
    } catch {
      // best-effort — the periodic reconcile jobs remain as backstop
    }
  }

  return result;
}
