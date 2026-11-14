import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { errorHandler, notFound } from "./middleware/error.js";
import { logger } from "./utils/logger.js";

/**
 * Builds the Express application (backend-plan §3: modular monolith).
 * Route modules from `src/modules/*` mount under `/api/v1` as their tasks
 * land; this factory stays free of strict env validation so tests can boot
 * it without a configured database — server.ts validates the environment.
 */
export function createApp(): express.Express {
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

  // Future tasks: app.use("/api/v1", router) mounting auth/tenants/plans/…

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
