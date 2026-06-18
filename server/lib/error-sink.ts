/**
 * Centralized Error Sink
 *
 * Provides:
 *   1. Process-level handlers for uncaughtException and unhandledRejection so
 *      fatal errors are logged with the correlation ID before the process exits.
 *   2. An Express 4-argument error-handler middleware that sanitizes all 5xx
 *      messages shown to clients while writing the full stack to the console.
 *
 * Usage — call `registerErrorSink(app)` as the LAST `app.use()` before starting
 * the server (after all routes are registered).
 */

import type { Express, Request, Response, NextFunction } from "express";
import { requestIdStore } from "../middleware/correlationId";

function currentRid(): string {
  return requestIdStore.getStore() ?? "—";
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

export function registerErrorSink(app: Express): void {
  process.on("uncaughtException", (err: Error) => {
    console.error(`[FATAL] [rid=${currentRid()}] uncaughtException: ${err.stack ?? err.message}`);
  });

  process.on("unhandledRejection", (reason: unknown) => {
    console.error(`[FATAL] [rid=${currentRid()}] unhandledRejection: ${formatError(reason)}`);
  });

  app.use(
    (
      err: any,
      req: Request,
      res: Response,
      _next: NextFunction,
    ): void => {
      const rid = (req as any).correlationId ?? currentRid();
      const status: number = err?.status ?? err?.statusCode ?? 500;

      console.error(
        `[ERROR] [rid=${rid}] ${req.method} ${req.path} → ${status}: ${formatError(err)}`,
      );

      const clientMessage =
        status < 500
          ? err?.message ?? "Request failed"
          : "Internal Server Error";

      if (!res.headersSent) {
        res.status(status).json({ message: clientMessage, requestId: rid });
      }
    },
  );
}
