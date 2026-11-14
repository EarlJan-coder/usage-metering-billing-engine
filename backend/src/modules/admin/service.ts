import type { AppDb } from "../../db/index.js";
import {
  listTenants,
  listWebhookEvents,
  platformMetrics,
  type AdminTenantRow,
} from "./repository.js";

/** GET /admin/tenants — every tenant with plan, status, and members. */
export async function getAdminTenants(db: AppDb) {
  const rows = await listTenants(db);
  return {
    items: rows.map((row: AdminTenantRow) => ({
      id: row.id,
      name: row.name,
      plan: row.plan,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      memberCount: row.memberCount,
    })),
  };
}

/** GET /admin/metrics — platform-wide operational counters. */
export async function getAdminMetrics(db: AppDb) {
  const metrics = await platformMetrics(db);
  return {
    totalTenants: metrics.totalTenants,
    activeSubscriptions: metrics.activeSubscriptions,
    totalApiCalls: metrics.totalApiCalls,
    totalTokens: metrics.totalTokens,
    estimatedRevenue: metrics.estimatedRevenue,
    currency: "USD",
    jobs: metrics.jobs,
  };
}

/** GET /admin/webhooks — recent Stripe delivery state. */
export async function getAdminWebhooks(db: AppDb) {
  const rows = await listWebhookEvents(db);
  return {
    items: rows.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      receivedAt: row.receivedAt.toISOString(),
    })),
  };
}
