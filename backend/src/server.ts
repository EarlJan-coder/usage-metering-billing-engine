import "dotenv/config";

import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { logger } from "./utils/logger.js";

const config = loadConfig();
const app = createApp();

app.listen(config.port, "0.0.0.0", () => {
  logger.info({ port: config.port }, "server listening");
});
