import { eq, inArray, sql } from "drizzle-orm";

import type { AppDb } from "../db/index.js";
import { backgroundJobs } from "../db/schema.js";
import { backoffDelayMs, enqueueJobOnce } from "./queue.js";
import { stripeReconcileHandler } from "./handlers/stripe-reconcile.js";
import { monthlyRollupHandler } from "./handlers/monthly-rollup.js";
import { usageAlertsHandler } from "./handlers/usage-alerts.js";

export type JobHandler = (
  db: AppDb,
  payload: Record<string, unknown>,
) => Promise<void>;

const handlers = new Map<string, JobHandler>();

/** Registers (or replaces) the handler for a job type. */
export function registerJobHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

/**
 * Claims and runs one batch of due jobs. Claiming happens in a short
 * transaction with `FOR UPDATE SKIP LOCKED`, so concurrent workers (and
 * concurrent runOnce calls) can never process the same job twice.
 *
 * Failure handling: attempts+1 and a deterministic exponential backoff
 * (base 5s → 5s/10s/20s/…). While retries remain the job is `failed`;
 * after maxAttempts it becomes `dead` — permanently failed jobs stay
 * identifiable by that status, with lastError preserved.
 *
 * @returns how many jobs were processed in this batch.
 */
export async function runOnce(db: AppDb): Promise<number> {
  const claimedIds = await db.transaction(async (tx) => {
    const result = (await tx.execute(sql`
      select id from background_jobs
      where (status in ('pending', 'failed') and run_at <= now())
         or (status = 'processing' and updated_at < now() - interval '15 minutes')
      order by run_at
      limit 25
      for update skip locked
    `)) as unknown as { rows: Array<{ id: string }> };

    const ids = result.rows.map((row) => row.id);
    if (ids.length > 0) {
      await tx
        .update(backgroundJobs)
        .set({ status: "processing", updatedAt: new Date() })
        .where(inArray(backgroundJobs.id, ids));
    }
    return ids;
  });

  if (claimedIds.length === 0) return 0;

  const jobs = await db
    .select()
    .from(backgroundJobs)
    .where(inArray(backgroundJobs.id, claimedIds));

  for (const job of jobs) {
    try {
      const handler = handlers.get(job.type);
      if (!handler) {
        throw new Error(`no handler registered for job type "${job.type}"`);
      }
      await handler(db, job.payload ?? {});
      await db
        .update(backgroundJobs)
        .set({
          status: "completed",
          completedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(backgroundJobs.id, job.id));
    } catch (err) {
      const attempts = job.attempts + 1;
      const dead = attempts >= job.maxAttempts;
      await db
        .update(backgroundJobs)
        .set({
          attempts,
          status: dead ? "dead" : "failed",
          lastError: err instanceof Error ? err.message : String(err),
          runAt: dead
            ? job.runAt
            : new Date(Date.now() + backoffDelayMs(attempts)),
          updatedAt: new Date(),
        })
        .where(eq(backgroundJobs.id, job.id));
    }
  }

  return jobs.length;
}

let workerTimer: ReturnType<typeof setInterval> | null = null;
let lastScheduleMs = 0;

/**
 * Recurring job scheduler (review #3): one stripe_reconcile per hour and
 * one monthly_rollup per month, dedupe-armed across worker restarts.
 */
export async function scheduleRecurringJobs(db: AppDb): Promise<void> {
  const now = new Date();
  const hourKey = now.toISOString().slice(0, 13); // 2026-11-14T13
  const monthKey = now.toISOString().slice(0, 7); // 2026-11

  await enqueueJobOnce(db, {
    type: "stripe_reconcile",
    dedupeKey: `stripe_reconcile:${hourKey}`,
    payload: {},
  });
  await enqueueJobOnce(db, {
    type: "monthly_rollup",
    dedupeKey: `monthly_rollup:${monthKey}`,
    payload: {},
  });
}

/** Polls the queue on an interval. Safe to call twice — idempotent. */
export function startWorker(db: AppDb, intervalMs = 5_000): void {
  if (workerTimer) return;
  const tick = async (): Promise<void> => {
    if (Date.now() - lastScheduleMs > 60_000) {
      lastScheduleMs = Date.now();
      await scheduleRecurringJobs(db);
    }
    await runOnce(db);
  };
  workerTimer = setInterval(() => {
    void tick().catch(() => undefined);
  }, intervalMs);
  // never hold the process open just for the worker
  workerTimer.unref?.();
}

export function stopWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}

// Built-in handlers (Task 10).
registerJobHandler("usage_alerts", usageAlertsHandler);
registerJobHandler("monthly_rollup", monthlyRollupHandler);
registerJobHandler("stripe_reconcile", stripeReconcileHandler);
