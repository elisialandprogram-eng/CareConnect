import { db } from "./db";
import { appointments, providers, users } from "@shared/schema";
import { and, eq, gte, lte, lt, inArray, isNotNull } from "drizzle-orm";
import { log } from "./index";
import { notify } from "./services/notification-dispatcher";
import { normalizeLang } from "./services/i18n";
import { storage } from "./storage";

// How long a "pending" appointment may sit unactioned before it auto-expires.
// Override with PENDING_APPT_EXPIRY_HOURS (defaults to 24h).
const PENDING_EXPIRY_HOURS = Number(process.env.PENDING_APPT_EXPIRY_HOURS || 24);

/**
 * Three-tier appointment reminders:
 *   • 24h before (tick: every hour)
 *   • 1h  before (tick: every 5 min)
 *   • 15m before (tick: every 5 min)
 * Plus a "post-visit" prompt 1h after the appointment ended (tick: every 5 min).
 *
 * Memo prevents duplicate sends per (appointment, tier).
 */

const TICK_5M = 5 * 60 * 1000;
const sentMemo = new Set<string>();

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function hhmm(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface ReminderWindow {
  date: string;
  startMin: string; // inclusive
  endMin: string;   // inclusive
}

function windowAheadMinutes(minutes: number, span: number = 5): ReminderWindow {
  const target = new Date(Date.now() + minutes * 60 * 1000);
  const start = new Date(target.getTime() - (span / 2) * 60 * 1000);
  const end = new Date(target.getTime() + (span / 2) * 60 * 1000);
  return { date: isoDate(target), startMin: hhmm(start), endMin: hhmm(end) };
}

async function sendForTier(tier: "24h" | "1h" | "15m") {
  const win = tier === "24h"
    ? windowAheadMinutes(24 * 60, 60) // 1h tolerance for the hourly tick
    : tier === "1h"
      ? windowAheadMinutes(60, 5)
      : windowAheadMinutes(15, 5);

  const upcoming = await db
    .select()
    .from(appointments)
    .where(and(
      eq(appointments.date, win.date),
      gte(appointments.startTime, win.startMin),
      lte(appointments.startTime, win.endMin),
      inArray(appointments.status, ["approved", "confirmed", "rescheduled"]),
    ));
  if (!upcoming.length) return 0;

  const providerIds = Array.from(new Set(upcoming.map(a => a.providerId)));
  const providerRows = providerIds.length
    ? await db.select().from(providers).where(inArray(providers.id, providerIds))
    : [];
  const providerUserMap = new Map<string, string>();
  providerRows.forEach(p => providerUserMap.set(p.id, p.userId));

  const userIds = Array.from(new Set([
    ...upcoming.map(a => a.patientId),
    ...providerRows.map(p => p.userId),
  ]));
  const userRows = userIds.length
    ? await db.select().from(users).where(inArray(users.id, userIds))
    : [];
  const langByUser = new Map<string, any>();
  userRows.forEach(u => langByUser.set(u.id, normalizeLang(u.languagePreference)));

  let sent = 0;
  for (const appt of upcoming) {
    const memoKey = `appt:${appt.id}:${tier}`;
    if (sentMemo.has(memoKey)) continue;
    try {
      await notify.reminder(appt.patientId, tier, {
        date: appt.date, time: appt.startTime, appointmentId: appt.id,
        lang: langByUser.get(appt.patientId),
      });
      sent++;
      const providerUserId = providerUserMap.get(appt.providerId);
      if (providerUserId) {
        await notify.reminder(providerUserId, tier, {
          date: appt.date, time: appt.startTime, appointmentId: appt.id,
          lang: langByUser.get(providerUserId),
        });
        sent++;
      }
      sentMemo.add(memoKey);
    } catch (err) {
      log(`reminderCron[${tier}]: failed for appt ${appt.id}: ${(err as Error).message}`);
    }
  }
  return sent;
}

async function sendPostVisit() {
  // Look for appointments whose endTime was ~60–75 min ago today
  const now = new Date();
  const lookFrom = new Date(now.getTime() - 75 * 60 * 1000);
  const lookTo = new Date(now.getTime() - 60 * 60 * 1000);
  // Constrain to same date for the simple text-based query
  if (isoDate(lookFrom) !== isoDate(lookTo)) return 0;
  const win: ReminderWindow = { date: isoDate(lookFrom), startMin: hhmm(lookFrom), endMin: hhmm(lookTo) };

  const recent = await db
    .select()
    .from(appointments)
    .where(and(
      eq(appointments.date, win.date),
      gte(appointments.endTime, win.startMin),
      lte(appointments.endTime, win.endMin),
      inArray(appointments.status, ["completed", "confirmed", "approved"]),
    ));
  if (!recent.length) return 0;

  const providerIds = Array.from(new Set(recent.map(a => a.providerId)));
  const providerRows = providerIds.length
    ? await db.select().from(providers).where(inArray(providers.id, providerIds))
    : [];
  const providerUserById = new Map<string, string>();
  providerRows.forEach(p => providerUserById.set(p.id, p.userId));
  const userRows = providerRows.length
    ? await db.select().from(users).where(inArray(users.id, providerRows.map(p => p.userId)))
    : [];
  const userById = new Map(userRows.map(u => [u.id, u]));

  let sent = 0;
  for (const appt of recent) {
    const memoKey = `appt:${appt.id}:postvisit`;
    if (sentMemo.has(memoKey)) continue;
    const providerUserId = providerUserById.get(appt.providerId);
    const provUser = providerUserId ? userById.get(providerUserId) : null;
    const providerName = provUser ? `${provUser.firstName} ${provUser.lastName}` : "your provider";
    try {
      await notify.postVisit(appt.patientId, {
        providerName,
        appointmentId: appt.id,
      });
      sentMemo.add(memoKey);
      sent++;
    } catch (e) {
      log(`reminderCron[postvisit]: failed for appt ${appt.id}: ${(e as Error).message}`);
    }
  }
  return sent;
}

let hourlyTimer: NodeJS.Timeout | null = null;

/**
 * Auto-expire pending appointments that the provider has not acted on within
 * PENDING_EXPIRY_HOURS hours. Notifies the patient when an appointment is
 * expired so they can rebook.
 */
async function expireStalePending() {
  const cutoff = new Date(Date.now() - PENDING_EXPIRY_HOURS * 60 * 60 * 1000);
  const stale = await db
    .select()
    .from(appointments)
    .where(and(
      eq(appointments.status, "pending"),
      isNotNull(appointments.createdAt),
      lt(appointments.createdAt, cutoff),
    ));
  if (!stale.length) return 0;

  let expired = 0;
  for (const appt of stale) {
    try {
      await db.update(appointments)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(appointments.id, appt.id));
      try {
        const apptRef = appt.appointmentNumber ? ` (${appt.appointmentNumber})` : "";
        await storage.createUserNotification({
          userId: appt.patientId,
          type: "appointment",
          title: "Appointment Expired",
          message: `Your appointment request${apptRef} expired because the provider didn't respond within ${PENDING_EXPIRY_HOURS} hours. Please book again or choose a different provider.`,
          isRead: false,
        });
      } catch (notifyErr) {
        log(`reminderCron[expire]: notify failed for appt ${appt.id}: ${(notifyErr as Error).message}`);
      }
      expired++;
    } catch (err) {
      log(`reminderCron[expire]: failed for appt ${appt.id}: ${(err as Error).message}`);
    }
  }
  return expired;
}

async function tick() {
  try {
    const totals = await Promise.all([
      sendForTier("1h"),
      sendForTier("15m"),
      sendPostVisit(),
      expireStalePending(),
    ]);
    const sum = totals.reduce((a, b) => a + b, 0);
    if (sum > 0) log(`reminderCron: 5-min tick processed ${sum} item(s)`);
  } catch (err) {
    log(`reminderCron: 5-min tick failed: ${(err as Error).message}`);
  }
}

async function tickHourly() {
  try {
    const sent = await sendForTier("24h");
    if (sent > 0) log(`reminderCron: hourly tick sent ${sent} 24h reminder(s)`);
  } catch (err) {
    log(`reminderCron: hourly tick failed: ${(err as Error).message}`);
  }
}

export function startReminderCron() {
  tick();
  tickHourly();
  setInterval(tick, TICK_5M);
  if (hourlyTimer) clearInterval(hourlyTimer);
  hourlyTimer = setInterval(tickHourly, 60 * 60 * 1000);
  log("reminderCron started — 5-min tick (1h/15m/post-visit), hourly tick (24h)");
}
