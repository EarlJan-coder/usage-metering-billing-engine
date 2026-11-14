import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import type { AppDb } from "./db/index.js";
import { createAdminRouter } from "./modules/admin/routes.js";
import { createApiKeysRouter } from "./modules/api-keys/routes.js";
import { createAuthRouter } from "./modules/auth/routes.js";
import { createBillingRouter } from "./modules/billing/routes.js";
import { createPlansRouter } from "./modules/plans/routes.js";
import { createTenantsRouter } from "./modules/tenants/routes.js";
import { createUsageRouter } from "./modules/usage-analytics/routes.js";
import { createMeteringRouter } from "./modules/metering/routes.js";
import { createSubscriptionsRouter } from "./modules/subscriptions/routes.js";
import { createWebhooksRouter } from "./modules/webhooks/routes.js";
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
  // one proxy hop by default so rate limiting sees real client IPs behind
  // nginx/TLS (review #11); override with TRUST_PROXY
  const trustProxy = process.env.TRUST_PROXY ?? "1";
  app.set(
    "trust proxy",
    /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
  );
  app.use(helmet());

  const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3000";
  app.use(cors({ origin: corsOrigin, credentials: true }));

  if (process.env.NODE_ENV !== "test") {
    app.use(pinoHttp({ logger }));
  }

  // Stripe webhooks need the RAW body for signature verification — mounted
  // on their own path BEFORE the JSON parser (Task 9).
  app.use("/api/v1/webhooks/stripe", express.raw({ type: "*/*" }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  const api = express.Router();
  api.use(globalLimiter);
  useRouter(api, "/auth", createAuthRouter(db));
  useRouter(api, "/tenants", createTenantsRouter(db));
  useRouter(api, "/api-keys", createApiKeysRouter(db));
  useRouter(api, "/metering", createMeteringRouter(db)); // API-key auth (§5C)
  useRouter(api, "/subscriptions", createSubscriptionsRouter(db));
  useRouter(api, "/usage", createUsageRouter(db));
  useRouter(api, "/billing", createBillingRouter(db));
  useRouter(api, "/admin", createAdminRouter(db)); // platform-admin only (§6H)
  useRouter(api, "/webhooks", createWebhooksRouter(db)); // verified Stripe (§5G)
  useRouter(api, "/plans", createPlansRouter(db)); // public catalog (Ruling 5)
  app.use("/api/v1", api);
  routerMounts.set(api, "/api/v1");

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

/** One registered HTTP route: the method and its full, concrete path. */
export type RouteSpec = { method: string; path: string };

/**
 * Mount path per router instance, captured at `use()` time so the route
 * walker below can reconstruct full paths from the live Express stack
 * without duplicating any route declarations.
 */
const routerMounts = new WeakMap<object, string>();

function useRouter(api: express.Router, mountPath: string, router: express.Router): void {
  routerMounts.set(router, mountPath);
  api.use(mountPath, router);
}

type StackLayer = {
  route?: {
    path: string | string[];
    methods: Record<string, boolean>;
  };
  handle?: { stack?: StackLayer[] };
};

function joinRoutePath(prefix: string, routePath: string): string {
  const combined = routePath === "/" ? prefix : `${prefix}${routePath}`;
  return combined === "" ? "/" : combined;
}

/**
 * Walks the Express router stack and returns every registered route —
 * used by tests/docs.test.ts to keep `docs/API.md` honest (Task 12).
 */
export function listRoutes(app: express.Express): RouteSpec[] {
  const out: RouteSpec[] = [];
  const root = (app as unknown as { router: { stack: StackLayer[] } }).router;

  const walk = (stack: StackLayer[], prefix: string): void => {
    for (const layer of stack) {
      if (layer.route) {
        const paths = Array.isArray(layer.route.path)
          ? layer.route.path
          : [layer.route.path];
        for (const [method, enabled] of Object.entries(layer.route.methods)) {
          if (!enabled || method === "_all") continue;
          for (const routePath of paths) {
            out.push({
              method: method.toUpperCase(),
              path: joinRoutePath(prefix, routePath),
            });
          }
        }
      } else if (layer.handle?.stack) {
        const mount = routerMounts.get(layer.handle) ?? "";
        walk(layer.handle.stack, `${prefix}${mount}`);
      }
    }
  };

  walk(root.stack, "");
  return out.sort((a, b) =>
    a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path),
  );
}
