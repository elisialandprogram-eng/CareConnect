/**
 * Request monitoring middleware.
 * Logs slow requests (>2 s) and 5xx errors to the system_events table.
 */

import type { Request, Response, NextFunction } from "express";
import { pool } from "../db";

const SLOW_THRESHOLD_MS = 2000;

export function monitoringMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, path: reqPath } = req;

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const { statusCode } = res;

    const isApiRoute = reqPath.startsWith("/api/");
    if (!isApiRoute) return;

    const isError = statusCode >= 500;
    const isSlow = durationMs >= SLOW_THRESHOLD_MS;

    if (!isError && !isSlow) return;

    const eventType = isError ? "api_error" : "slow_endpoint";
    const severity = isError ? (statusCode >= 503 ? "critical" : "error") : "warning";
    const message = isError
      ? `${method} ${reqPath} returned ${statusCode}`
      : `${method} ${reqPath} took ${durationMs}ms`;

    pool.query(
      `INSERT INTO system_events
         (event_type, severity, source, message, metadata, country_code)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        eventType,
        severity,
        `${method} ${reqPath}`,
        message,
        JSON.stringify({ statusCode, durationMs, method, path: reqPath }),
        (req as any).user?.countryCode ?? null,
      ],
    ).catch((err: Error) => {
      console.error("[monitoring] failed to write system event:", err.message);
    });
  });

  next();
}

export async function logSystemEvent(
  eventType: string,
  severity: "info" | "warning" | "error" | "critical",
  source: string,
  message: string,
  metadata?: Record<string, unknown>,
  countryCode?: string | null,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO system_events
         (event_type, severity, source, message, metadata, country_code)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [eventType, severity, source, message, JSON.stringify(metadata ?? {}), countryCode ?? null],
    );
  } catch (err: any) {
    console.error("[monitoring] logSystemEvent failed:", err.message);
  }
}
