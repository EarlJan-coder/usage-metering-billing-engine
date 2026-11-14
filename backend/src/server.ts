import "dotenv/config";

import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { createDb } from "./db/index.js";
import { startWorker } from "./jobs/runner.js";
import { logger } from "./utils/logger.js";

const config = loadConfig();
const { db } = createDb(config.databaseUrl);
const app = createApp(db);

app.listen(config.port, "0.0.0.0", () => {
  logger.info({ port: config.port }, "server listening");
});

// Background job worker (usage alerts, monthly rollups, Stripe reconcile).
if (process.env.WORKER_DISABLED !== "1") {
  startWorker(db);
}
