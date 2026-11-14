import "./setup-env.js";

import pg from "pg";

import { migrate } from "../src/db/index.js";

/**
 * Runs once per `npm test`: rebuild the test database schema from scratch
 * (DROP + CREATE + migrate) so a regenerated migration can never leave the
 * suite running against a stale schema.
 */
export default async function globalSetup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // Both schemas: drizzle's journal lives outside `public` — leaving it
    // behind makes the migrator skip statements on the next run.
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await client.query("CREATE SCHEMA public");
  } finally {
    await client.end();
  }

  await migrate(url);
}
