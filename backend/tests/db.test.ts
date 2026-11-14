import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { createDb, migrate } from "../src/db/index.js";
import * as schema from "../src/db/schema.js";
import { seed } from "../src/db/seed.js";
import { closeTestDb, db, resetDb, testDbUrl } from "./helpers/db.js";

const { users, tenants, usageEvents, plans } = schema;

async function countRows(table: { _: unknown }): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(table as never);
  return rows[0]?.n ?? -1;
}

/** Drizzle wraps the pg error; the SQLSTATE lives on `cause`. */
async function expectDbError(
  promise: Promise<unknown>,
  sqlState: string,
): Promise<void> {
  await expect(promise).rejects.toSatisfy((err: unknown) => {
    const cause = (err as { cause?: { code?: string } }).cause;
    return cause?.code === sqlState;
  }, `expected a pg error with code ${sqlState}`);
}

describe("database schema (Task 2)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(closeTestDb);

  test("migrate() applies cleanly and is idempotent on a fresh database", async () => {
    // global-setup already migrated; running again must be a no-op, not an error.
    await expect(migrate(testDbUrl)).resolves.toBeUndefined();
  });

  test("duplicate email violates the unique constraint (23505)", async () => {
    await db.insert(users).values({
      name: "Ada",
      email: "dup@example.com",
      passwordHash: "hash-a",
    });

    await expectDbError(
      db.insert(users).values({
        name: "Impostor",
        email: "dup@example.com",
        passwordHash: "hash-b",
      }),
      "23505",
    );
  });

  test("duplicate (tenantId, idempotencyKey) violates the unique constraint", async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Acme" })
      .returning();
    expect(tenant).toBeDefined();

    const event = {
      tenantId: tenant!.id,
      type: "api_call" as const,
      quantity: 1,
      costMinor: 0,
      pricingVersion: 1,
      idempotencyKey: "same-key",
    };

    await db.insert(usageEvents).values(event);
    await expectDbError(db.insert(usageEvents).values(event), "23505");
  });

  test("usage event with unknown tenant violates the foreign key (23503)", async () => {
    await expectDbError(
      db.insert(usageEvents).values({
        tenantId: "00000000-0000-4000-8000-000000000000",
        type: "api_call",
        quantity: 1,
        costMinor: 0,
        pricingVersion: 1,
        idempotencyKey: "orphan",
      }),
      "23503",
    );
  });

  test("seed() is idempotent: exactly one free + one pro plan after two runs", async () => {
    const { db: seedDb, pool } = createDb(testDbUrl);
    try {
      await seed(seedDb);
      await seed(seedDb);

      const rows = await seedDb.select().from(plans);
      expect(rows).toHaveLength(2);
      expect(rows.filter((p) => p.code === "free")).toHaveLength(1);
      expect(rows.filter((p) => p.code === "pro")).toHaveLength(1);
      expect(rows.find((p) => p.code === "free")?.apiCallsLimit).toBe(1000);
      expect(rows.find((p) => p.code === "free")?.aiTokensLimit).toBe(100_000);
      expect(rows.find((p) => p.code === "free")?.isDefault).toBe(true);
      expect(rows.find((p) => p.code === "pro")?.priceMinor).toBe(2900);
    } finally {
      await pool.end();
    }
  });

  test("resetDb() empties every application table", async () => {
    await db.insert(users).values({
      name: "Ada",
      email: "wipe@example.com",
      passwordHash: "hash",
    });
    expect(await countRows(users)).toBe(1);

    await resetDb();

    expect(await countRows(users)).toBe(0);
    expect(await countRows(tenants)).toBe(0);
    expect(await countRows(plans)).toBe(0);
    expect(await countRows(usageEvents)).toBe(0);
  });

  test("plans seeded by code use stable unique codes", async () => {
    const { db: seedDb, pool } = createDb(testDbUrl);
    try {
      await seed(seedDb);
      const [free] = await seedDb
        .select()
        .from(plans)
        .where(eq(plans.code, "free"));
      expect(free?.id).toBeTruthy();
    } finally {
      await pool.end();
    }
  });
});
