import { eq } from "drizzle-orm";

import type { AppDb } from "../db/index.js";
import { backgroundJobs } from "../db/schema.js";

export const BACKOFF_BASE_MS = 5_000;

/**
 * Retry delay for the n-th failed attempt: base * 2^(n-1).
 * 5s, 10s, 20s, 40s, … — deterministic so tests can assert the schedule.
 */
export function backoffDelayMs(attempts: number): number {
  return BACKOFF_BASE_MS * 2 ** Math.max(attempts - 1, 0);
}

export type EnqueueJobInput = {
  type: string;
  payload?: Record<string, unknown>;
  /**
   * While a job with this key is pending/processing the enqueue is a no-op
   * (partial unique index). Completed/failed-away jobs do not block re-arming.
   */
  dedupeKey?: string;
  runAt?: Date;
  maxAttempts?: number;
};

/**
 * Adds a job to the queue. Returns the job id, or null when a job with the
 * same dedupeKey is already pending/processing.
 */
export async function enqueueJob(
  db: AppDb,
  input: EnqueueJobInput,
): Promise<string | null> {
  const rows = await db
    .insert(backgroundJobs)
    .values({
      type: input.type,
      payload: input.payload ?? {},
      dedupeKey: input.dedupeKey ?? null,
      runAt: input.runAt ?? new Date(),
      maxAttempts: input.maxAttempts ?? 5,
    })
    .onConflictDoNothing()
    .returning({ id: backgroundJobs.id });

  return rows[0]?.id ?? null;
}

/**
 * Enqueues a recurring job at most once per dedupeKey — a row in ANY
 * status blocks re-arming, so a scheduled job runs once per period even
 * across worker restarts (review #3).
 */
export async function enqueueJobOnce(
  db: AppDb,
  input: EnqueueJobInput,
): Promise<string | null> {
  if (!input.dedupeKey) return enqueueJob(db, input);

  const existing = await db
    .select({ id: backgroundJobs.id })
    .from(backgroundJobs)
    .where(eq(backgroundJobs.dedupeKey, input.dedupeKey))
    .limit(1);
  if (existing.length > 0) return null;

  return enqueueJob(db, input);
}
