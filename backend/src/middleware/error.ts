import type { NextFunction, Request, Response } from "express";

import { logger } from "../utils/logger.js";

/**
 * Application error carrying the API error envelope fields
 * (backend-plan §6: `{ error: { message, code } }`).
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Terminal 404 for unmatched routes. */
export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    error: { message: `Not found: ${req.method} ${req.path}`, code: "not_found" },
  });
}

/**
 * Central error handler: AppError → its own status/code; malformed JSON
 * body → 400; anything else → 500 with a generic message (no stack leak).
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (
    err instanceof SyntaxError &&
    "type" in err &&
    (err as { type?: string }).type === "entity.parse.failed"
  ) {
    res.status(400).json({
      error: { message: "Request body is not valid JSON", code: "bad_request" },
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.status >= 500) logger.error({ err }, "request failed");
    if (err.status === 429) {
      // Quota/rate rejections tell the client when to come back.
      res.setHeader("Retry-After", String((err.details as { retryAfter?: number } | undefined)?.retryAfter ?? 60));
    }
    res.status(err.status).json({
      error: {
        message: err.message,
        code: err.code,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  logger.error({ err }, "unhandled error");
  res.status(500).json({
    error: { message: "Internal Server Error", code: "internal_error" },
  });
}
