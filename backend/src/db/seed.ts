import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { DEFAULT_RATES, PRICING_VERSION } from "../config/pricing.js";
import { createDb, type AppDb } from "./index.js";
import * as schema from "./schema.js";

const { apiKeys, plans, pricingVersions, subscriptions, tenantMembers, tenants, users } =
  schema;

/** Demo credentials — documented in backend/README.md, never production. */
export const DEMO_EMAIL = "demo@example.com";
export const DEMO_PASSWORD = "demo-password-123";
export const DEMO_API_KEY_PLAINTEXT =
  "umk_" +
  createHash("sha256").update("usage-metering-demo-key").digest("hex").slice(0, 40);

const FREE_PLAN = {
  code: "free",
  name: "Free",
  description: "For evaluation and side projects",
  priceMinor: 0,
  currency: "USD",
  interval: "month",
  apiCallsLimit: 1000,
  aiTokensLimit: 100_000,
  features: ["1,000 API calls / month", "100,000 AI tokens / month"],
  isDefault: true,
  active: true,
} as const;

const PRO_PLAN = {
  code: "pro",
  name: "Pro",
  description: "For production workloads",
  priceMinor: 2900,
  currency: "USD",
  interval: "month",
  apiCallsLimit: 100_000,
  aiTokensLimit: 10_000_000,
  features: [
    "100,000 API calls / month",
    "10,000,000 AI tokens / month",
    "Stripe-backed billing",
  ],
  isDefault: false,
  active: true,
  stripePriceId: process.env.STRIPE_PRO_PRICE_ID ?? null,
} as const;

/** Current UTC calendar month bounds (free-plan billing period). */
export function utcMonthBounds(now: Date = new Date()): {
  start: Date;
  end: Date;
} {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

/**
 * Idempotent seed: plans, pricing version, demo platform-admin user with a
 * personal tenant, free subscription, and a demo API key (hash only).
 */
export async function seed(db: AppDb): Promise<void> {
  for (const plan of [FREE_PLAN, PRO_PLAN]) {
    const values = { ...plan, features: [...plan.features] };
    await db
      .insert(plans)
      .values(values)
      .onConflictDoUpdate({ target: plans.code, set: { ...values } });
  }

  await db
    .insert(pricingVersions)
    .values({
      version: PRICING_VERSION,
      rates: { ...DEFAULT_RATES },
      note: "initial rates",
    })
    .onConflictDoUpdate({
      target: pricingVersions.version,
      set: { rates: { ...DEFAULT_RATES }, note: "initial rates" },
    });

  const [freePlan] = await db
    .select()
    .from(plans)
    .where(eq(plans.code, "free"))
    .limit(1);
  if (!freePlan) throw new Error("seed: free plan missing after upsert");

  let [demoTenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.name, "Demo Workspace"))
    .limit(1);
  if (!demoTenant) {
    [demoTenant] = await db
      .insert(tenants)
      .values({ name: "Demo Workspace" })
      .returning();
  }

  let [demoUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, DEMO_EMAIL))
    .limit(1);
  if (!demoUser) {
    [demoUser] = await db
      .insert(users)
      .values({
        name: "Demo User",
        email: DEMO_EMAIL,
        passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10),
        platformAdmin: true,
      })
      .returning();
  }
  if (!demoTenant || !demoUser) throw new Error("seed: demo fixtures missing");

  await db
    .insert(tenantMembers)
    .values({ tenantId: demoTenant.id, userId: demoUser.id, role: "admin" })
    .onConflictDoNothing({
      target: [tenantMembers.tenantId, tenantMembers.userId],
    });

  const { start, end } = utcMonthBounds();
  await db
    .insert(subscriptions)
    .values({
      tenantId: demoTenant.id,
      planId: freePlan.id,
      status: "active",
      currentPeriodStart: start,
      currentPeriodEnd: end,
    })
    .onConflictDoNothing({ target: subscriptions.tenantId });

  const keyHash = createHash("sha256")
    .update(DEMO_API_KEY_PLAINTEXT)
    .digest("hex");
  await db
    .insert(apiKeys)
    .values({
      tenantId: demoTenant.id,
      name: "Demo key",
      keyPrefix: DEMO_API_KEY_PLAINTEXT.slice(0, 12),
      keyHash,
    })
    .onConflictDoNothing({ target: apiKeys.keyHash });
}

const isCli =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db, pool } = createDb(url);
  try {
    await seed(db);
    console.log(`seeded ${url.replace(/:[^:@]*@/, ":***@")}`);
  } finally {
    await pool.end();
  }
}
