/**
 * Structured application logger.
 *
 * Wraps the existing `logSystemEvent()` helper and the console `log()` from
 * server/index.ts with severity levels, event categories, optional timing,
 * and correlation-ID propagation.
 *
 * Category → system_event_type enum mapping
 * ------------------------------------------
 * The `system_events` table uses a fixed PostgreSQL enum:
 *   api_error | payment_failure | notification_failure |
 *   slow_endpoint | failed_job | auth_failure
 *
 * We map our richer categories to these values when persisting to the DB.
 * Only warn / error / critical events are persisted; info and debug are
 * console-only (no DB write).
 *
 * Category contract
 * -----------------
 * auth         — login, logout, OTP, token rotation
 * booking      — appointment creation, conflict, slot hold, waitlist
 * payment      — charge, refund, wallet delta, payout
 * webhook      — incoming webhook events (Stripe, etc.)
 * scheduler    — cron tick results, job success/failure
 * notification — email, SMS, push, in-app dispatch
 * search       — FTS queries, cache hit/miss
 * db           — slow queries, connection issues, migration
 * cache        — eviction, miss-rate spikes
 * system       — generic/catch-all
 */

import { logSystemEvent } from "../middleware/monitoring";

export type LogLevel = "debug" | "info" | "warn" | "error" | "critical";
export type LogCategory =
  | "auth"
  | "booking"
  | "payment"
  | "webhook"
  | "scheduler"
  | "notification"
  | "search"
  | "db"
  | "cache"
  | "system";

// Map our categories to the allowed system_event_type enum values.
const CATEGORY_EVENT_TYPE: Record<LogCategory, string> = {
  auth:         "auth_failure",
  booking:      "api_error",
  payment:      "payment_failure",
  webhook:      "api_error",
  scheduler:    "failed_job",
  notification: "notification_failure",
  search:       "api_error",
  db:           "api_error",
  cache:        "api_error",
  system:       "api_error",
};

const LEVEL_TO_SEVERITY: Record<LogLevel, "info" | "warning" | "error" | "critical"> = {
  debug:    "info",
  info:     "info",
  warn:     "warning",
  error:    "error",
  critical: "critical",
};

/**
 * Core structured log call.  Always goes to console; also persists to
 * system_events for warn/error/critical so they surface in the admin
 * monitoring panel.
 *
 * Only warn/error/critical are persisted to DB — info and debug are
 * console-only.  This avoids spamming system_events with routine heartbeats.
 */
export function slog(
  level: LogLevel,
  category: LogCategory,
  source: string,
  message: string,
  opts?: {
    correlationId?: string | null;
    durationMs?: number;
    countryCode?: string | null;
    metadata?: Record<string, unknown>;
  },
): void {
  const ts = new Date().toISOString();
  const { correlationId, durationMs, countryCode, metadata } = opts ?? {};

  const parts: string[] = [`[${ts}]`, `[${level.toUpperCase()}]`, `[${category}]`, `[${source}]`, message];
  if (correlationId) parts.push(`(rid=${correlationId})`);
  if (durationMs !== undefined) parts.push(`(${durationMs}ms)`);
  const line = parts.join(" ");

  if (level === "debug" || level === "info") {
    console.log(line);
    return; // console-only for debug / info
  }
  if (level === "warn") {
    console.warn(line);
  } else {
    console.error(line);
  }

  // Persist warn/error/critical to system_events using the correct enum value.
  const meta: Record<string, unknown> = { ...(metadata ?? {}) };
  if (correlationId) meta.correlationId = correlationId;
  if (durationMs !== undefined) meta.durationMs = durationMs;

  logSystemEvent(
    CATEGORY_EVENT_TYPE[category],
    LEVEL_TO_SEVERITY[level],
    source,
    message,
    meta,
    countryCode ?? null,
  ).catch(() => {});
}

// ── Convenience wrappers ───────────────────────────────────────────────────

/** Log a financial event (refund, charge, wallet delta). */
export function logPayment(opts: {
  event: "refund_issued" | "refund_failed" | "charge_completed" | "wallet_delta" | "payout_queued";
  appointmentId?: string;
  userId?: string;
  amountUsd?: number;
  error?: string;
  correlationId?: string | null;
  countryCode?: string | null;
  durationMs?: number;
}): void {
  const { event, appointmentId, userId, amountUsd, error, ...rest } = opts;
  const level: LogLevel = error ? "error" : "info";
  const message = error
    ? `${event} FAILED: ${error}${appointmentId ? ` (appt=${appointmentId})` : ""}`
    : `${event}${appointmentId ? ` appt=${appointmentId}` : ""}${amountUsd !== undefined ? ` amount=${amountUsd}` : ""}`;
  slog(level, "payment", event, message, {
    ...rest,
    metadata: { appointmentId, userId, amountUsd, error },
  });
}

/** Log a booking event (new booking, conflict, hold created/expired). */
export function logBooking(opts: {
  event: "booking_created" | "booking_conflict" | "hold_created" | "hold_expired" | "hold_limit_hit" | "waitlist_fulfilled";
  appointmentId?: string;
  providerId?: string;
  patientId?: string;
  detail?: string;
  correlationId?: string | null;
  countryCode?: string | null;
  durationMs?: number;
}): void {
  const { event, appointmentId, providerId, patientId, detail, ...rest } = opts;
  const level: LogLevel = event === "booking_conflict" || event === "hold_limit_hit" ? "warn" : "info";
  const message = `${event}${appointmentId ? ` appt=${appointmentId}` : ""}${detail ? ` — ${detail}` : ""}`;
  slog(level, "booking", event, message, {
    ...rest,
    metadata: { appointmentId, providerId, patientId, detail },
  });
}

/** Log a webhook delivery event (Stripe or other). */
export function logWebhook(opts: {
  vendor: "stripe" | string;
  eventType: string;
  eventId?: string;
  status: "received" | "processed" | "failed" | "duplicate";
  durationMs?: number;
  error?: string;
  correlationId?: string | null;
}): void {
  const { vendor, eventType, eventId, status, error, ...rest } = opts;
  const level: LogLevel = status === "failed" ? "error" : status === "duplicate" ? "warn" : "info";
  const message = `${vendor}:${eventType} ${status}${eventId ? ` (id=${eventId})` : ""}${error ? ` — ${error}` : ""}`;
  slog(level, "webhook", `${vendor}_webhook`, message, {
    ...rest,
    metadata: { vendor, eventType, eventId, status, error },
  });
}

/** Log a scheduler (cron) job result. Only failures are persisted to the DB. */
export function logScheduler(opts: {
  job: string;
  status: "started" | "completed" | "failed" | "skipped";
  itemsProcessed?: number;
  durationMs?: number;
  error?: string;
}): void {
  const { job, status, itemsProcessed, durationMs, error } = opts;
  // Only failures warrant a DB write — completed/skipped are console-only.
  const level: LogLevel = status === "failed" ? "error" : "info";
  const message = `scheduler:${job} ${status}${itemsProcessed !== undefined ? ` items=${itemsProcessed}` : ""}${error ? ` — ${error}` : ""}`;
  slog(level, "scheduler", `cron_${job}`, message, {
    durationMs,
    metadata: { job, status, itemsProcessed, error },
  });
}
