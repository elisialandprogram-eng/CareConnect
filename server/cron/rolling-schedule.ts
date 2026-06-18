/**
 * Rolling Schedule Cron — Part 1: Smart Recurring Template Engine
 *
 * Runs once per day (triggered from reminderCron.ts tickDaily).
 * Reads provider_schedule_templates and auto-generates time_slots
 * 30 days ahead, respecting provider_time_off and availability_exceptions.
 *
 * Safety rules:
 *  - Never overwrites already-booked slots (is_booked = true)
 *  - Never overwrites slots held in active checkout (appointment_slot_holds)
 *  - Skips dates covered by provider_time_off or availability_exceptions
 *  - Uses ON CONFLICT DO NOTHING for idempotent re-runs
 */

import { pool } from "../db";
import { todayInTz } from "../lib/tzUtils";

const log = (msg: string) => console.log(`[rolling-schedule] ${msg}`);
const warn = (msg: string) => console.warn(`[rolling-schedule] ${msg}`);

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
const toMins = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function runRollingSchedule(): Promise<{ generated: number; skipped: number }> {
  let generated = 0;
  let skipped = 0;

  try {
    // Fetch all active templates grouped by provider
    const { rows: templates } = await pool.query<{
      provider_id: string;
      day_of_week: number;
      start_time: string;
      end_time: string;
      slot_duration_mins: number;
      buffer_before_mins: number;
      buffer_after_mins: number;
    }>(
      `SELECT provider_id, day_of_week, start_time, end_time,
              slot_duration_mins, buffer_before_mins, buffer_after_mins
         FROM provider_schedule_templates
        WHERE is_active = TRUE
        ORDER BY provider_id, day_of_week, start_time`,
    );

    if (templates.length === 0) {
      log("no active templates found — nothing to generate");
      return { generated, skipped };
    }

    // Group by provider
    const byProvider = new Map<string, typeof templates>();
    for (const t of templates) {
      const list = byProvider.get(t.provider_id) ?? [];
      list.push(t);
      byProvider.set(t.provider_id, list);
    }

    const todayUtc = new Date();
    todayUtc.setHours(0, 0, 0, 0);
    const horizon = addDays(todayUtc, 90);

    for (const [providerId, provTemplates] of byProvider) {
      // TZ Hardening Sprint: determine "today" in the provider's local timezone.
      // If the provider is UTC+5 and the server clock says 23:00 UTC on June 15,
      // it is already June 16 for the provider — we must generate June 16 slots.
      let today = todayUtc;
      try {
        const { rows: tzRows } = await pool.query<{ timezone: string }>(
          `SELECT u.timezone
             FROM users u
             JOIN providers p ON p.user_id = u.id
            WHERE p.id = $1
            LIMIT 1`,
          [providerId],
        );
        const tz = tzRows[0]?.timezone;
        if (tz && tz.trim() && tz !== "UTC") {
          today = todayInTz(tz);
        }
      } catch { /* non-fatal — use UTC today */ }

      // Fetch leave ranges for this provider (to skip blackout dates)
      const { rows: leaveRows } = await pool.query<{
        start_date: string;
        end_date: string;
      }>(
        `SELECT start_date, end_date FROM provider_time_off
          WHERE provider_id = $1
            AND end_date >= $2`,
        [providerId, dateStr(today)],
      );
      const leaveRanges = leaveRows.map(r => ({
        start: new Date(r.start_date + "T00:00:00"),
        end: new Date(r.end_date + "T23:59:59"),
      }));

      // Fetch specific exception dates for this provider
      const { rows: exRows } = await pool.query<{ date: string }>(
        `SELECT date FROM availability_exceptions
          WHERE provider_id = $1
            AND date::date >= $2::date`,
        [providerId, dateStr(today)],
      );
      const exceptionDates = new Set(exRows.map(r => r.date.slice(0, 10)));

      // Group templates by day-of-week
      const byDay = new Map<number, typeof provTemplates>();
      for (const t of provTemplates) {
        const list = byDay.get(t.day_of_week) ?? [];
        list.push(t);
        byDay.set(t.day_of_week, list);
      }

      // Walk each day in the 30-day window
      for (let d = new Date(today); d < horizon; d = addDays(d, 1)) {
        const ds = dateStr(d);
        const dow = d.getDay(); // 0=Sun … 6=Sat

        // ── Holiday/leave blackout guard ───────────────────────────────────
        if (exceptionDates.has(ds)) {
          skipped++;
          continue;
        }
        const isOnLeave = leaveRanges.some(r => d >= r.start && d <= r.end);
        if (isOnLeave) {
          skipped++;
          continue;
        }

        const dayTemplates = byDay.get(dow);
        if (!dayTemplates || dayTemplates.length === 0) continue;

        // ── Check what slots already exist for this provider+date ──────────
        const { rows: existingRows } = await pool.query<{
          start_time: string;
          end_time: string;
        }>(
          `SELECT start_time, end_time
             FROM time_slots
            WHERE provider_id = $1 AND date = $2
              AND is_booked = FALSE
              AND NOT EXISTS (
                SELECT 1 FROM appointment_slot_holds ash
                WHERE  ash.provider_id = time_slots.provider_id
                  AND  ash.date        = time_slots.date
                  AND  ash.start_time  = time_slots.start_time
                  AND  ash.end_time    = time_slots.end_time
                  AND  ash.expires_at  > NOW()
              )`,
          [providerId, ds],
        );
        const existingSet = new Set(existingRows.map(r => `${r.start_time}|${r.end_time}`));

        // ── Interval Slicer Engine ─────────────────────────────────────────
        // For each template window on this day, generate slots using
        // SLOT_STEP = duration + bufferBefore + bufferAfter
        for (const tmpl of dayTemplates) {
          const startMins = toMins(tmpl.start_time);
          const endMins = toMins(tmpl.end_time);
          const dur = tmpl.slot_duration_mins;
          const bufBefore = tmpl.buffer_before_mins;
          const bufAfter = tmpl.buffer_after_mins;
          const step = dur + bufBefore + bufAfter;

          for (let t = startMins; t + dur <= endMins; t += step) {
            const startTime = fmt(t);
            const endTime = fmt(t + dur);
            const key = `${startTime}|${endTime}`;
            if (existingSet.has(key)) continue; // already present — skip

            // Insert with ON CONFLICT DO NOTHING for idempotency
            try {
              await pool.query(
                `INSERT INTO time_slots (id, provider_id, date, start_time, end_time, is_booked, is_blocked)
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, FALSE, FALSE)
                 ON CONFLICT DO NOTHING`,
                [providerId, ds, startTime, endTime],
              );
              generated++;
            } catch (insertErr: any) {
              warn(`insert failed for ${providerId} ${ds} ${startTime}: ${insertErr.message}`);
            }
          }
        }
      }
    }

    log(`run complete — generated=${generated} skipped=${skipped}`);
  } catch (err: any) {
    warn(`fatal error: ${err.message}`);
  }

  return { generated, skipped };
}
