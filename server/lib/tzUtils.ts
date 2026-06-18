/**
 * TZ Utilities — authoritative timezone functions for GoldenLife
 *
 * Single source of truth for:
 *   1. Converting provider wall-clock times → UTC absolute timestamps
 *   2. Looking up the provider's canonical timezone (users.timezone)
 *
 * Uses only Intl (built-in Node.js) — no external libraries needed.
 * Handles DST correctly because Intl uses the full IANA TZ database.
 */

/**
 * Convert a provider's local wall-clock date + time → absolute UTC Date.
 *
 * Algorithm:
 *   1. Parse the date+time string as UTC (naive reference).
 *   2. Render that UTC instant in the target timezone using Intl.
 *   3. The rendered string IS what that UTC instant looks like locally.
 *   4. drift = naive_UTC_ms - local_rendered_as_UTC_ms
 *   5. result = naive_UTC_ms + drift  ← actual UTC for the given local time
 *
 * Example (Budapest summer, UTC+2):
 *   localToUTC("2026-06-16", "09:00", "Europe/Budapest")
 *   → naive = 2026-06-16T09:00:00Z = 09:00 UTC
 *   → rendered in Budapest = 11:00 (Budapest shows +2h)
 *   → drift = 09:00 − 11:00 = −2h
 *   → result = 09:00 UTC + (−2h) = 07:00 UTC  ✓ (09:00 Budapest = 07:00 UTC)
 */
export function localToUTC(dateStr: string, timeStr: string, tz: string): Date {
  const safeDate = (dateStr || "").slice(0, 10);
  const safeTime = (timeStr || "00:00").replace(/^(\d{2}:\d{2}).*/, "$1");

  try {
    const naive = new Date(`${safeDate}T${safeTime}:00Z`);
    if (isNaN(naive.getTime())) return new Date(NaN);

    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const parts = Object.fromEntries(
      formatter.formatToParts(naive).map(p => [p.type, p.value]),
    );

    const hourVal = parts.hour === "24" ? "00" : (parts.hour ?? "00");
    const inTzAsUTC = new Date(
      `${parts.year}-${parts.month}-${parts.day}T${hourVal}:${parts.minute ?? "00"}:${parts.second ?? "00"}Z`,
    );
    if (isNaN(inTzAsUTC.getTime())) return new Date(NaN);

    const drift = naive.getTime() - inTzAsUTC.getTime();
    return new Date(naive.getTime() + drift);
  } catch {
    return new Date(NaN);
  }
}

/**
 * Country-code → canonical IANA timezone mapping.
 * Used as a fallback when a provider has not set their timezone explicitly.
 * Never use country as the ONLY source — this is a last-resort inference,
 * not a hard rule (a provider can physically be in any timezone).
 */
const COUNTRY_TZ: Record<string, string> = {
  HU: "Europe/Budapest",
  IR: "Asia/Tehran",
  US: "America/New_York",
  GB: "Europe/London",
  DE: "Europe/Berlin",
  FR: "Europe/Paris",
  IN: "Asia/Kolkata",
  AE: "Asia/Dubai",
};

/**
 * Get the provider's canonical timezone.
 * Authority order: users.timezone → provider_office_hours.timezone
 *                  → country_code inference → fallback ("UTC")
 *
 * users.timezone is the single source of truth — written by:
 *   - Provider setup form (POST /api/provider/setup)
 *   - Settings page (PATCH /api/auth/profile)
 *
 * Country-code fallback prevents Hungarian providers whose timezone was never
 * explicitly set from having all their slots treated as UTC (2h off from CEST).
 */
export async function getProviderTimezone(
  providerId: string | null | undefined,
  providerUserId: string | null | undefined,
  fallback = "UTC",
): Promise<string> {
  const { pool } = await import("../db");

  if (providerUserId) {
    try {
      const { rows } = await pool.query(
        `SELECT timezone FROM users WHERE id = $1 LIMIT 1`,
        [providerUserId],
      );
      const tz = rows[0]?.timezone;
      if (tz && typeof tz === "string" && tz.trim()) return tz.trim();
    } catch { /* non-fatal */ }
  }

  if (providerId) {
    try {
      const { rows } = await pool.query(
        `SELECT poh.timezone
           FROM provider_office_hours poh
          WHERE poh.provider_id = $1
          LIMIT 1`,
        [providerId],
      );
      const tz = rows[0]?.timezone;
      if (tz && typeof tz === "string" && tz.trim() && tz !== "UTC") return tz.trim();
    } catch { /* non-fatal */ }
  }

  // Country-code inference: look up the provider's registered country and
  // map it to the canonical IANA timezone for that country.
  // This prevents providers who never configured their timezone from having
  // all slot times treated as UTC (would be 2h off for Hungarian providers).
  if (providerId) {
    try {
      const { rows } = await pool.query(
        `SELECT country_code FROM providers WHERE id = $1 LIMIT 1`,
        [providerId],
      );
      const cc = rows[0]?.country_code;
      const ccTz = cc ? COUNTRY_TZ[String(cc).toUpperCase()] : undefined;
      if (ccTz) return ccTz;
    } catch { /* non-fatal */ }
  }

  return fallback;
}

/**
 * Get current server UTC milliseconds adjusted to look like provider local milliseconds.
 * Used for comparing "wall-clock now" against slot times stored as TEXT.
 *
 * NOTE: prefer using localToUTC() for absolute comparisons when possible.
 * This helper is retained for the synthetic-slot path which works in minute-offsets.
 */
export function providerLocalNowMs(tz: string): number {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(now).map(p => [p.type, p.value]),
    );
    const hourVal = parts.hour === "24" ? "00" : (parts.hour ?? "00");
    const localMs = new Date(
      `${parts.year}-${parts.month}-${parts.day}T${hourVal}:${parts.minute ?? "00"}:${parts.second ?? "00"}Z`,
    ).getTime();
    if (Number.isFinite(localMs)) return localMs;
  } catch { /* non-fatal */ }
  return Date.now();
}

/**
 * Returns "today" as a Date at local midnight in the given timezone.
 * Used by the rolling schedule cron to determine which day to generate slots for.
 */
export function todayInTz(tz: string): Date {
  try {
    const str = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  } catch {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
}

/**
 * Short timezone abbreviation for display (e.g. "CEST", "IST", "EDT").
 * Returns empty string on error.
 */
export function tzAbbr(tz: string, refDate: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(refDate);
    return parts.find(p => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}
