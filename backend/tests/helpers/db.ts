import { createDb } from "../../src/db/index.js";

/** Shared connection for all integration tests in this worker. */
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set");

const { db, pool } = createDb(url);

export const testDbUrl = url;
export { db, pool };

/** Empties every application table (keeps the migrated schema). */
export async function resetDb(): Promise<void> {
  const { TABLES } = await import("../../src/db/meta.js");
  await pool.query(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

/** Closes the shared pool — call from `afterAll` so vitest can exit. */
export async function closeTestDb(): Promise<void> {
  await pool.end();
}
