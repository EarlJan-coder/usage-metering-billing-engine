import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";

import type { AppDb } from "../../db/index.js";
import { apiKeys } from "../../db/schema.js";
import { requireAuth } from "../../middleware/auth.js";
import { originCheck } from "../../middleware/origin-check.js";
import { AppError } from "../../middleware/error.js";
import { validate } from "../../middleware/validate.js";
import {
  generateApiKey,
  maskApiKey,
} from "../../services/api-key.js";
import { createApiKeySchema } from "./schema.js";

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function shape(row: typeof apiKeys.$inferSelect): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    maskedKey: maskApiKey(row.keyPrefix),
    status: row.status,
    createdAt: iso(row.createdAt),
    lastUsedAt: iso(row.lastUsedAt),
  };
}

/**
 * API key management (§5I): plaintext returned ONCE at creation, stored
 * only as sha256; revoke is a soft delete scoped to the session tenant.
 */
export function createApiKeysRouter(db: AppDb): Router {
  const router = Router();
  router.use(requireAuth(db));

  router.get("/", async (req, res, next) => {
    try {
      const rows = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.tenantId, req.auth!.tenantId))
        .orderBy(desc(apiKeys.createdAt));
      res.json({ items: rows.map(shape) });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/",
    originCheck,
    validate(createApiKeySchema),
    async (req, res, next) => {
    try {
      const { plaintext, keyPrefix, keyHash } = generateApiKey();
      const [row] = await db
        .insert(apiKeys)
        .values({
          tenantId: req.auth!.tenantId,
          name: req.body.name,
          keyPrefix,
          keyHash,
        })
        .returning();
      if (!row) throw new AppError(500, "internal_error", "Failed to create API key");

      res.status(201).json({ ...shape(row), plaintext });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", originCheck, async (req, res, next) => {
    try {
      const rows = await db
        .update(apiKeys)
        .set({ status: "revoked", revokedAt: new Date() })
        .where(
          and(
            eq(apiKeys.id, String(req.params.id)),
            eq(apiKeys.tenantId, req.auth!.tenantId),
          ),
        )
        .returning({ id: apiKeys.id });

      if (rows.length === 0) {
        // unknown id and foreign id are indistinguishable (IDOR guard)
        throw new AppError(404, "not_found", "API key not found");
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
