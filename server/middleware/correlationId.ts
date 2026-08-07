/**
 * Correlation-ID middleware.
 *
 * Attaches a unique request ID to every incoming request so that all log
 * lines for a single request share a traceable identifier.
 *
 * - If the caller already sends an `X-Request-ID` header (e.g. a load
 *   balancer, Stripe webhooks, tests) that value is kept.
 * - Otherwise a v4-style UUID is generated using `crypto.randomUUID()`.
 * - The ID is written back on the response as `X-Request-ID` so clients
 *   can include it in bug reports.
 * - `req.correlationId` is set for downstream use.
 * - `requestIdStore` (AsyncLocalStorage) propagates the ID automatically to
 *   every async operation in the request's call chain so `log()` calls deep
 *   in services never need to pass the ID explicitly.
 */

import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { AsyncLocalStorage } from "async_hooks";

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

export const requestIdStore = new AsyncLocalStorage<string>();

export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const existing = req.headers["x-request-id"];
  const id = (Array.isArray(existing) ? existing[0] : existing) || randomUUID();
  req.correlationId = id;
  res.setHeader("X-Request-ID", id);
  requestIdStore.run(id, next);
}
