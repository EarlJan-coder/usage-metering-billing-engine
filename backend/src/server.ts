import "dotenv/config";

import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { createDb } from "./db/index.js";
import { logger } from "./utils/logger.js";

const config = loadConfig();
const { db } = createDb(config.databaseUrl);
const app = createApp(db);

app.listen(config.port, "0.0.0.0", () => {
  logger.info({ port: config.port }, "server listening");
});
