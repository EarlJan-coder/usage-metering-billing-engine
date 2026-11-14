import path from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as runMigrations } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

import * as schema from "./schema.js";

export type AppDb = ReturnType<typeof createDb>["db"];

/** A drizzle database handle or an open transaction (register runs in tx). */
export type DbOrTx =
  | AppDb
  | Parameters<Parameters<AppDb["transaction"]>[0]>[0];

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 10 });
}

export function createDb(connectionString: string): {
  pool: pg.Pool;
  db: ReturnType<typeof drizzle<typeof schema>>;
} {
  const pool = createPool(connectionString);
  const db = drizzle(pool, { schema });
  return { pool, db };
}

/** Applies all pending migrations from src/db/migrations. */
export async function migrate(connectionString: string): Promise<void> {
  const pool = new pg.Pool({ connectionString, max: 1 });
  try {
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "migrations",
    );
    const db = drizzle(pool);
    await runMigrations(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}
