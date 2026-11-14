import { createHash, randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import type { AppDb, DbOrTx } from "../db/index.js";
import { apiKeys } from "../db/schema.js";

const KEY_PREFIX = "umk_";

/** sha256 hex of the plaintext key — the only form stored (§5I). */
export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** Generates `umk_` + 40 hex chars (160 bits of entropy). */
export function generateApiKey(): { plaintext: string; keyPrefix: string; keyHash: string } {
  const plaintext = KEY_PREFIX + randomBytes(20).toString("hex");
  return {
    plaintext,
    keyPrefix: plaintext.slice(0, 12),
    keyHash: hashApiKey(plaintext),
  };
}

/** Human-readable mask for tables: `umk_ab12cd34…` (never the secret). */
export function maskApiKey(plaintextOrPrefix: string): string {
  return `${plaintextOrPrefix.slice(0, 12)}…`;
}

export type ApiKeyAuth = { tenantId: string; apiKeyId: string };

/**
 * Resolves an API key to a tenant. Accepts the full `Bearer umk_…` header
 * or a bare `umk_…` value. Returns null for missing, malformed, unknown,
 * or revoked keys — no partial results.
 */
export async function authenticateApiKey(
  header: string | undefined,
  dbOverride?: AppDb | DbOrTx,
): Promise<ApiKeyAuth | null> {
  if (!header) return null;
  const match = /^(?:Bearer\s+)?(umk_[0-9a-f]{40})$/i.exec(header.trim());
  if (!match) return null;
  const plaintext = match[1]!;

  const db = dbOverride ?? defaultDb;
  if (!db) return null;

  const rows = await db
    .select({
      id: apiKeys.id,
      tenantId: apiKeys.tenantId,
      status: apiKeys.status,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashApiKey(plaintext)))
    .limit(1);

  const row = rows[0];
  if (!row || row.status !== "active") return null;

  // Freshness stamp (§5I) — awaited so callers observe a consistent row.
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id));

  return { tenantId: row.tenantId, apiKeyId: row.id };
}

/** Fire-and-forget lastUsedAt touch (§5I). */
export async function touchApiKey(
  db: AppDb | DbOrTx,
  apiKeyId: string,
): Promise<void> {
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, apiKeyId));
}

/**
 * The route layer injects the request-scoped db before calling
 * authenticateApiKey; this module-level default exists only so the
 * two-argument form keeps tests simple.
 */
let defaultDb: AppDb | DbOrTx | null = null;

export function setDefaultApiKeyDb(db: AppDb | DbOrTx | null): void {
  defaultDb = db;
}
