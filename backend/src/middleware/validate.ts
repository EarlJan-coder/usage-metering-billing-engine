import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

import { AppError } from "./error.js";

/**
 * Zod validation middleware: parses `req.body` and replaces it with the
 * typed value, or throws 400 validation_error (backend-plan §6).
 */
export function validate<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const where = first?.path.join(".") || "body";
      next(
        new AppError(
          400,
          "validation_error",
          first ? `${where}: ${first.message}` : "Invalid request body",
        ),
      );
      return;
    }
    req.body = parsed.data;
    next();
  };
}
