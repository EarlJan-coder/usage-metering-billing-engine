import pino from "pino";

/** Process-wide logger; level from LOG_LEVEL (default "info"). */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
});
