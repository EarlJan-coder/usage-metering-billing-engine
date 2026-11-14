import { Router } from "express";

import type { AppDb } from "../../db/index.js";
import { requireAuth } from "../../middleware/auth.js";
import { AppError } from "../../middleware/error.js";
import { validate } from "../../middleware/validate.js";
import { createTenantSchema } from "./schema.js";
import * as service from "./service.js";

function jsonDate(value: Date): string {
  return value.toISOString();
}

export function createTenantsRouter(db: AppDb): Router {
  const router = Router();
  router.use(requireAuth(db));

  router.get("/", async (req, res, next) => {
    try {
      const items = await service.listUserTenants(db, req.auth!.userId);
      res.json({
        items: items.map((t) => ({
          id: t.id,
          name: t.name,
          role: t.role,
          createdAt: jsonDate(t.createdAt),
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const tenant = await service.getTenantForMember(
        db,
        req.auth!.userId,
        req.params.id!,
      );
      if (!tenant) {
        throw new AppError(404, "not_found", "Tenant not found");
      }
      res.json({
        id: tenant.id,
        name: tenant.name,
        role: tenant.role,
        createdAt: jsonDate(tenant.createdAt),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/", validate(createTenantSchema), async (req, res, next) => {
    try {
      const tenant = await service.createTenant(db, req.auth!.userId, req.body);
      res.status(201).json({
        id: tenant.id,
        name: tenant.name,
        role: tenant.role,
        createdAt: jsonDate(tenant.createdAt),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
