/**
 * analyticsTracker.ts — Module 7: Platform Event Tracking
 *
 * Tracks discrete platform events (searches, bookings, cancellations, etc.)
 * into the platform_events table for aggregated funnel analysis.
 *
 * Rules:
 *  - Never store sensitive health content (diagnosis, notes, prescription detail).
 *  - Only store country, provider type, service category — no PII beyond userId.
 *  - All operations are fire-and-forget (errors logged, never thrown to callers).
 */

import { pool } from "../db";

export type PlatformEventType =
  | "search"
  | "booking_started"
  | "booking_completed"
  | "booking_cancelled"
  | "waitlist_joined"
  | "waitlist_fulfilled"
  | "waitlist_converted"
  | "package_purchased"
  | "package_low_alert"
  | "package_expiry_alert"
  | "referral_converted"
  | "rebook_initiated"
  | "followup_scheduled"
  | "provider_onboarded"
  | "provider_verified"
  | "refund_issued"
  | "review_submitted"
  | "profile_viewed";

export interface TrackEventPayload {
  eventType: PlatformEventType;
  userId?: string | null;
  countryCode?: string | null;
  providerId?: string | null;
  serviceCategory?: string | null;  // e.g. "rehabilitation" (one of the 7 canonical categories)
  serviceMode?: string | null;      // "home_visit" | "clinic" | "online"
  metadata?: Record<string, string | number | boolean | null>;
}

/**
 * Fire-and-forget platform event recording.
 * Never throws — errors are caught and logged so callers are never affected.
 */
export async function trackEvent(payload: TrackEventPayload): Promise<void> {
  try {
    const metaJson = payload.metadata ? JSON.stringify(payload.metadata) : null;
    await pool.query(
      `INSERT INTO platform_events
         (event_type, user_id, country_code, provider_id, service_category, service_mode, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        payload.eventType,
        payload.userId ?? null,
        payload.countryCode ?? null,
        payload.providerId ?? null,
        payload.serviceCategory ?? null,
        payload.serviceMode ?? null,
        metaJson,
      ],
    );
  } catch (err) {
    console.error("[analyticsTracker] failed to record event:", payload.eventType, (err as Error).message);
  }
}

/**
 * Aggregate platform event counts grouped by event_type for a given period.
 * Returns summary safe for admin analytics dashboards.
 */
export async function getEventSummary(opts: {
  countryCode?: string | null;
  startDate?: string;   // YYYY-MM-DD
  endDate?: string;     // YYYY-MM-DD
}): Promise<Array<{ eventType: string; count: number; lastSeen: string }>> {
  try {
    const conditions: string[] = ["1=1"];
    const params: (string | null)[] = [];
    let idx = 1;

    if (opts.countryCode) {
      conditions.push(`country_code = $${idx++}`);
      params.push(opts.countryCode);
    }
    if (opts.startDate) {
      conditions.push(`created_at >= $${idx++}::date`);
      params.push(opts.startDate);
    }
    if (opts.endDate) {
      conditions.push(`created_at < ($${idx++}::date + INTERVAL '1 day')`);
      params.push(opts.endDate);
    }

    const { rows } = await pool.query<{ event_type: string; cnt: string; last_seen: string }>(
      `SELECT event_type, COUNT(*) AS cnt, MAX(created_at)::date AS last_seen
       FROM platform_events
       WHERE ${conditions.join(" AND ")}
       GROUP BY event_type
       ORDER BY cnt DESC`,
      params,
    );

    return rows.map(r => ({
      eventType: r.event_type,
      count: Number(r.cnt),
      lastSeen: String(r.last_seen).slice(0, 10),
    }));
  } catch (err) {
    console.error("[analyticsTracker] getEventSummary failed:", (err as Error).message);
    return [];
  }
}

/**
 * Daily event funnel: searches → bookings → completions, last N days.
 */
export async function getDailyFunnel(opts: {
  days?: number;
  countryCode?: string | null;
}): Promise<Array<{ date: string; searches: number; bookingsStarted: number; bookingsCompleted: number; cancellations: number }>> {
  const days = opts.days ?? 30;
  try {
    const params: (string | number | null)[] = [days];
    let countryFilter = "";
    if (opts.countryCode) {
      countryFilter = "AND country_code::text = $2";
      params.push(opts.countryCode);
    }

    const { rows } = await pool.query<{
      day: string;
      searches: string;
      bookings_started: string;
      bookings_completed: string;
      cancellations: string;
    }>(
      `SELECT
         created_at::date AS day,
         COUNT(*) FILTER (WHERE event_type = 'search')             AS searches,
         COUNT(*) FILTER (WHERE event_type = 'booking_started')    AS bookings_started,
         COUNT(*) FILTER (WHERE event_type = 'booking_completed')  AS bookings_completed,
         COUNT(*) FILTER (WHERE event_type = 'booking_cancelled')  AS cancellations
       FROM platform_events
       WHERE created_at >= CURRENT_DATE - ($1 || ' days')::interval
         ${countryFilter}
       GROUP BY day
       ORDER BY day`,
      params,
    );

    return rows.map(r => ({
      date: String(r.day).slice(0, 10),
      searches: Number(r.searches),
      bookingsStarted: Number(r.bookings_started),
      bookingsCompleted: Number(r.bookings_completed),
      cancellations: Number(r.cancellations),
    }));
  } catch (err) {
    console.error("[analyticsTracker] getDailyFunnel failed:", (err as Error).message);
    return [];
  }
}
