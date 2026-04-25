import { db } from "./db";
import { appointments, providers } from "@shared/schema";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { storage } from "./storage";
import { log } from "./index";

const REMINDER_INTERVAL_MS = 60 * 60 * 1000;
const sentMemo = new Set<string>();

function todayPlusHours(hours: number): { date: string; hourStart: string; hourEnd: string } {
  const d = new Date(Date.now() + hours * 60 * 60 * 1000);
  const date = d.toISOString().slice(0, 10);
  const hh = String(d.getHours()).padStart(2, "0");
  return {
    date,
    hourStart: `${hh}:00`,
    hourEnd: `${hh}:59`,
  };
}

async function generateRemindersOnce() {
  try {
    const target = todayPlusHours(24);
    const upcoming = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.date, target.date),
          gte(appointments.startTime, target.hourStart),
          lte(appointments.startTime, target.hourEnd),
          inArray(appointments.status, ["approved", "confirmed", "rescheduled"]),
        ),
      );

    if (!upcoming.length) return;

    const providerIds = Array.from(new Set(upcoming.map((a) => a.providerId)));
    const providerRows = providerIds.length
      ? await db.select().from(providers).where(inArray(providers.id, providerIds))
      : [];
    const providerUserMap = new Map<string, string>();
    providerRows.forEach((p) => providerUserMap.set(p.id, p.userId));

    let created = 0;
    for (const appt of upcoming) {
      const memoKey = `appt:${appt.id}`;
      if (sentMemo.has(memoKey)) continue;

      const providerUserId = providerUserMap.get(appt.providerId);
      const title = "Appointment in 24 hours";
      const message = `You have an appointment on ${appt.date} at ${appt.startTime}.`;

      try {
        if (appt.patientId) {
          await storage.createUserNotification({
            userId: appt.patientId,
            title,
            message,
            type: "reminder",
            data: JSON.stringify({ appointmentId: appt.id }),
          } as any);
          created++;
        }
        if (providerUserId) {
          await storage.createUserNotification({
            userId: providerUserId,
            title,
            message: `Upcoming appointment on ${appt.date} at ${appt.startTime}.`,
            type: "reminder",
            data: JSON.stringify({ appointmentId: appt.id }),
          } as any);
          created++;
        }
        sentMemo.add(memoKey);
      } catch (err) {
        log(`reminderCron: failed to create notification for appt ${appt.id}: ${(err as Error).message}`);
      }
    }

    if (created > 0) log(`reminderCron: created ${created} reminder(s)`);
  } catch (err) {
    log(`reminderCron: tick failed: ${(err as Error).message}`);
  }
}

export function startReminderCron() {
  generateRemindersOnce();
  setInterval(generateRemindersOnce, REMINDER_INTERVAL_MS);
  log("reminderCron started (24h appointment reminders, hourly tick)");
}
