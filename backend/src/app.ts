import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import type { AppDb } from "./db/index.js";
import { createApiKeysRouter } from "./modules/api-keys/routes.js";
import { createAuthRouter } from "./modules/auth/routes.js";
import { createPlansRouter } from "./modules/plans/routes.js";
import { createTenantsRouter } from "./modules/tenants/routes.js";
import { createMeteringRouter } from "./modules/metering/routes.js";
import { setDefaultApiKeyDb } from "./services/api-key.js";
import { globalLimiter } from "./middleware/rate-limit.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { logger } from "./utils/logger.js";

/**
 * Builds the Express application (backend-plan §3: modular monolith).
 * Route modules from `src/modules/*` mount under `/api/v1` as their tasks
 * land; the db handle is injected so tests point the app at the test
 * database while server.ts points it at DATABASE_URL.
 */
export function createApp(db: AppDb): express.Express {
  setDefaultApiKeyDb(db);
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());

  const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3000";
  app.use(cors({ origin: corsOrigin, credentials: true }));

  if (process.env.NODE_ENV !== "test") {
    app.use(pinoHttp({ logger }));
  }

  // Stripe webhooks mount `express.raw()` on their own path BEFORE the JSON
  // parser (Task 9) — signature verification needs the raw body.
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  const api = express.Router();
  api.use(globalLimiter);
  api.use("/auth", createAuthRouter(db));
  api.use("/tenants", createTenantsRouter(db));
  api.use("/api-keys", createApiKeysRouter(db));
  api.use("/metering", createMeteringRouter(db)); // API-key auth (§5C)
  api.use("/plans", createPlansRouter(db)); // public catalog (Ruling 5)
  app.use("/api/v1", api);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
