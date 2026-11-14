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
import { calculateCost } from "../cost-calculation/calculator.js";
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

  return db.transaction(async (tx) => {
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

    // 2. Serialize on the tenant's subscription row (quota in Task 8).
    await tx.execute(
      sql`select id from subscriptions where tenant_id = ${auth.tenantId} for update`,
    );

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
}
