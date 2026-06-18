import { db, pool } from "./db";
import { appointments, providers, users, walletTransactions } from "@shared/schema";
import { and, eq, gte, lte, lt, inArray, isNotNull } from "drizzle-orm";
import { getStripe } from "./stripe";
import { log } from "./index";
import { notify, dispatchNotification } from "./services/notification-dispatcher";
import { storage } from "./storage";
import { normalizeLang } from "./services/i18n";
import { withJobTracking, recordJobStart, recordJobEnd } from "./lib/cronState";
import { logScheduler } from "./lib/logger";
import { fireAdminNotification } from "./routes/shared/helpers";
import { trackEvent } from "./services/analyticsTracker";

// Cooldown between successive overdue-invoice reminders for the same invoice.
// Override with INVOICE_REMINDER_COOLDOWN_DAYS. Default 7 days keeps it polite.
const INVOICE_REMINDER_COOLDOWN_DAYS = Number(process.env.INVOICE_REMINDER_COOLDOWN_DAYS || 7);
// Maximum total reminders we'll send for a single invoice before giving up
// (admin can still resend manually). Default 4 ⇒ ~4 weeks of nudges.
const INVOICE_REMINDER_MAX_PER_INVOICE = Number(process.env.INVOICE_REMINDER_MAX_PER_INVOICE || 4);

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
// hhmm() always uses UTC so it matches the UTC-based windowAheadMinutes fallback.
function hhmm(d: Date) {
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

interface ReminderWindow {
  date: string;
  startMin: string; // inclusive
  endMin: string;   // inclusive
}

// Legacy fallback window — used only for appointments that predate TZ Hardening
// and therefore have start_at IS NULL. Returns a UTC date + UTC time strings
// so the comparison is consistent (both sides are UTC).
function windowAheadMinutes(minutes: number, span: number = 5): ReminderWindow {
  const target = new Date(Date.now() + minutes * 60 * 1000);
  const start = new Date(target.getTime() - (span / 2) * 60 * 1000);
  const end = new Date(target.getTime() + (span / 2) * 60 * 1000);
  return { date: isoDate(target), startMin: hhmm(start), endMin: hhmm(end) };
}

async function sendForTier(tier: "24h" | "1h" | "15m") {
  const minsBefore = tier === "24h" ? 24 * 60 : tier === "1h" ? 60 : 15;
  const span      = tier === "24h" ? 60 : 5;

  const windowStart = new Date(Date.now() + (minsBefore - span / 2) * 60_000);
  const windowEnd   = new Date(Date.now() + (minsBefore + span / 2) * 60_000);

  // Primary: appointments with start_at TIMESTAMPTZ (authoritative UTC)
  const { rows: upcoming1 } = await pool.query<Record<string, any>>(
    `SELECT * FROM appointments
      WHERE start_at >= $1 AND start_at <= $2
        AND status = ANY(ARRAY['approved','confirmed','rescheduled','reschedule_proposed']::appointment_status[])`,
    [windowStart.toISOString(), windowEnd.toISOString()],
  );

  // Fallback: legacy appointments that predate the TZ Sprint (start_at IS NULL).
  // Uses UTC date+time text window — consistent because hhmm() is now UTC-based.
  const win = windowAheadMinutes(minsBefore, span);
  const { rows: upcoming2 } = await pool.query<Record<string, any>>(
    `SELECT * FROM appointments
      WHERE start_at IS NULL
        AND date = $1 AND start_time >= $2 AND start_time <= $3
        AND status = ANY(ARRAY['approved','confirmed','rescheduled','reschedule_proposed']::appointment_status[])`,
    [win.date, win.startMin, win.endMin],
  );

  // Merge + dedupe by id
  const seenIds = new Set<string>();
  const upcoming: Record<string, any>[] = [];
  for (const row of [...upcoming1, ...upcoming2]) {
    if (!seenIds.has(row.id)) { seenIds.add(row.id); upcoming.push(row); }
  }

  if (!upcoming.length) return 0;

  const providerIds = Array.from(new Set(upcoming.map(a => a.provider_id as string)));
  const providerRows = providerIds.length
    ? await db.select().from(providers).where(inArray(providers.id, providerIds))
    : [];
  const providerUserMap = new Map<string, string>();
  providerRows.forEach(p => providerUserMap.set(p.id, p.userId));

  const userIds = Array.from(new Set([
    ...upcoming.map(a => a.patient_id as string),
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
      await notify.reminder(appt.patient_id, tier, {
        date: appt.date, time: appt.start_time, appointmentId: appt.id,
        lang: langByUser.get(appt.patient_id),
      });
      sent++;
      const providerUserId = providerUserMap.get(appt.provider_id);
      if (providerUserId) {
        await notify.reminder(providerUserId, tier, {
          date: appt.date, time: appt.start_time, appointmentId: appt.id,
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
  // Look for appointments whose end was ~60–75 min ago.
  // Primary: use end_at TIMESTAMPTZ (UTC authoritative).
  // Fallback: legacy appointments with end_at IS NULL (text-based, UTC-consistent).
  const lookFrom = new Date(Date.now() - 75 * 60_000);
  const lookTo   = new Date(Date.now() - 60 * 60_000);

  const { rows: r1 } = await pool.query<Record<string, any>>(
    `SELECT * FROM appointments
      WHERE end_at >= $1 AND end_at <= $2 AND status = 'completed'`,
    [lookFrom.toISOString(), lookTo.toISOString()],
  );
  const win: ReminderWindow = { date: isoDate(lookFrom), startMin: hhmm(lookFrom), endMin: hhmm(lookTo) };
  const { rows: r2 } = await pool.query<Record<string, any>>(
    `SELECT * FROM appointments
      WHERE end_at IS NULL
        AND date = $1 AND end_time >= $2 AND end_time <= $3
        AND status = 'completed'`,
    [win.date, win.startMin, win.endMin],
  );
  const seenIds = new Set<string>();
  const recent: Record<string, any>[] = [];
  for (const row of [...r1, ...r2]) {
    if (!seenIds.has(row.id)) { seenIds.add(row.id); recent.push(row); }
  }

  if (!recent.length) return 0;

  const providerIds = Array.from(new Set(recent.map(a => a.provider_id as string)));
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
    const providerUserId = providerUserById.get(appt.provider_id);
    const provUser = providerUserId ? userById.get(providerUserId) : null;
    const providerName = provUser ? `${provUser.firstName} ${provUser.lastName}` : "your provider";
    try {
      await notify.postVisit(appt.patient_id, {
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
 * expired so they can rebook. Also frees the reserved time slot.
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
      const autoNote = `[AUTO] Expired by system: provider didn't respond within ${PENDING_EXPIRY_HOURS}h`;
      const newNote = appt.privateNote ? `${appt.privateNote}\n${autoNote}` : autoNote;
      await db.update(appointments)
        .set({ status: "expired", privateNote: newNote, updatedAt: new Date() })
        .where(eq(appointments.id, appt.id));
      // Release the held time slot so other patients can book it.
      if (appt.timeSlotId) {
        try {
          await storage.updateTimeSlot(appt.timeSlotId, { isBooked: false });
        } catch (slotErr) {
          log(`reminderCron[expire]: free slot failed for appt ${appt.id}: ${(slotErr as Error).message}`);
        }
      }
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

/**
 * Auto-cancel approved/confirmed/rescheduled appointments that ended more than
 * 24h ago and were never marked completed. Frees the reserved slot too.
 */
async function cancelStaleConfirmed() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const cutoffDate = isoDate(cutoff);
  const stale = await db
    .select()
    .from(appointments)
    .where(and(
      inArray(appointments.status, ["approved", "confirmed", "rescheduled"]),
      lt(appointments.date, cutoffDate),
    ));
  if (!stale.length) return 0;

  let cancelled = 0;
  for (const appt of stale) {
    try {
      const autoNote = "[AUTO] Auto-cancelled: visit ended >24h ago without completion";
      const newNote = appt.privateNote ? `${appt.privateNote}\n${autoNote}` : autoNote;
      await db.update(appointments)
        .set({ status: "cancelled", privateNote: newNote, updatedAt: new Date() })
        .where(eq(appointments.id, appt.id));
      if (appt.timeSlotId) {
        try {
          await storage.updateTimeSlot(appt.timeSlotId, { isBooked: false });
        } catch (slotErr) {
          log(`reminderCron[stale]: free slot failed for appt ${appt.id}: ${(slotErr as Error).message}`);
        }
      }
      // Notify the patient so they are not left wondering what happened.
      try {
        const apptRef = appt.appointmentNumber ? ` (${appt.appointmentNumber})` : "";
        await storage.createUserNotification({
          userId: appt.patientId,
          type: "appointment",
          title: "Appointment Automatically Closed",
          message: `Your appointment${apptRef} on ${appt.date} was automatically closed because the visit was not marked as completed by the provider. If you believe this is an error, please contact support.`,
          isRead: false,
        });
      } catch (notifyErr) {
        log(`reminderCron[stale]: notify failed for appt ${appt.id}: ${(notifyErr as Error).message}`);
      }
      // P0 — Issue refund for any paid appointment that was auto-cancelled.
      // Provider earnings are only recorded on 'completed' so no double-payment occurs.
      // The auto-cancel represents provider inaction; the patient deserves a full refund.
      try {
        const alreadyProcessed = (appt as any).refundStatus === "processed";
        if (!alreadyProcessed) {
          // Check for wallet debit first
          const debits = await db
            .select()
            .from(walletTransactions)
            .where(and(
              eq(walletTransactions.referenceType, "appointment"),
              eq(walletTransactions.referenceId, appt.id),
              eq(walletTransactions.type, "debit"),
            ));
          const totalDebited = debits.reduce((sum, d) => sum + Math.abs(Number(d.amount || 0)), 0);
          if (totalDebited > 0) {
            await storage.refundWallet(appt.patientId, totalDebited, {
              description: `Refund for auto-cancelled appointment ${appt.appointmentNumber || appt.id}`,
              referenceType: "appointment",
              referenceId: appt.id,
              idempotencyKey: `appointment:${appt.id}:stale-cancel-refund`,
            });
            await db.update(appointments)
              .set({ refundStatus: "processed" } as any)
              .where(eq(appointments.id, appt.id));
            await pool.query(
              `UPDATE payments SET refunded_amount = COALESCE(refunded_amount,0) + $1 WHERE appointment_id = $2`,
              [totalDebited, appt.id],
            ).catch(() => {});
            log(`reminderCron[stale]: wallet refund $${totalDebited} issued for appt ${appt.id}`);
          } else {
            // No wallet debit — check for Stripe card payment
            try {
              const payment = await storage.getPaymentByAppointment(appt.id);
              const stripe = getStripe();
              if (
                stripe && payment &&
                payment.paymentMethod === "card" &&
                payment.stripePaymentId &&
                payment.status === "completed" &&
                !(payment as any).stripeRefundId
              ) {
                const refundAmt = Math.max(
                  0,
                  Number(payment.amount || 0) - Number((payment as any).refundedAmount || 0),
                );
                if (refundAmt > 0) {
                  const stripeRefund = await stripe.refunds.create(
                    { payment_intent: payment.stripePaymentId, amount: Math.round(refundAmt * 100) },
                    { idempotencyKey: `appointment:${appt.id}:stale-card-refund` },
                  );
                  await pool.query(
                    `UPDATE payments SET refunded_amount = COALESCE(refunded_amount,0) + $1, stripe_refund_id = $2 WHERE id = $3`,
                    [refundAmt, stripeRefund.id, payment.id],
                  ).catch(() => {});
                  await db.update(appointments)
                    .set({ refundStatus: "processed" } as any)
                    .where(eq(appointments.id, appt.id));
                  log(`reminderCron[stale]: Stripe refund ${stripeRefund.id} ($${refundAmt}) issued for appt ${appt.id}`);
                }
              }
            } catch (cardErr) {
              log(`reminderCron[stale]: Stripe refund failed for appt ${appt.id}: ${(cardErr as Error).message}`);
              await db.update(appointments)
                .set({ refundStatus: "failed" } as any)
                .where(eq(appointments.id, appt.id)).catch(() => {});
            }
          }
        }
      } catch (refundErr) {
        log(`reminderCron[stale]: refund failed for appt ${appt.id}: ${(refundErr as Error).message}`);
      }
      cancelled++;
    } catch (err) {
      log(`reminderCron[stale]: failed for appt ${appt.id}: ${(err as Error).message}`);
    }
  }
  return cancelled;
}

/**
 * Part 2/3 (Sprint 6): Expire stale slot holds and notify the waitlist for
 * each freed slot. Runs every 5-min tick. Safe to run repeatedly — holds
 * are deleted atomically and waitlist fan-out is best-effort (failures logged,
 * never re-thrown so the tick never aborts because of a notification error).
 */
async function expireAndNotifySlotHolds(): Promise<number> {
  try {
    // Snapshot expired holds BEFORE deleting them (needed for waitlist fan-out)
    const { rows } = await pool.query(
      `SELECT DISTINCT provider_id, date, start_time, end_time
       FROM appointment_slot_holds WHERE expires_at < NOW()`
    );
    if (!rows.length) return 0;

    const deleted = await storage.deleteExpiredSlotHolds();

    // Notify waitlist for each unique freed slot (best-effort, fire-and-forget)
    const FANOUT = Number(process.env.WAITLIST_NOTIFY_FANOUT || 3);
    for (const row of rows) {
      (async () => {
        try {
          const off = await storage.isProviderOnTimeOff(row.provider_id, row.date).catch(() => false);
          if (off) return;
          const matches = await storage.getActiveWaitlistEntries({
            providerId: row.provider_id,
            date: row.date,
            slotStartTime: row.start_time,
            limit: FANOUT,
          });
          if (!matches.length) return;
          const providerRow = await storage.getProvider(row.provider_id).catch(() => null);
          const providerName = (providerRow as any)?.businessName || "your preferred provider";
          for (const entry of matches) {
            await dispatchNotification({
              userId: entry.patientId,
              eventKey: "waitlist.slot_available",
              title: `A slot just opened with ${providerName}`,
              body: `Good news — a slot you were waiting for is now available on ${row.date} at ${row.start_time}. Tap to book before someone else grabs it.`,
              data: {
                providerId: row.provider_id,
                date: row.date,
                startTime: row.start_time,
                endTime: row.end_time,
                waitlistEntryId: entry.id,
              },
            });
            await storage.updateWaitlistEntry(entry.id, { status: "notified", notifiedAt: new Date() } as any);
          }
        } catch (e: any) {
          log(`reminderCron[slotExpiry]: waitlist notify failed for slot ${row.provider_id}/${row.date}/${row.start_time}: ${(e as Error).message}`);
        }
      })();
    }

    if (deleted > 0) log(`reminderCron[slotExpiry]: expired ${deleted} hold(s)`);
    return deleted;
  } catch (e) {
    log(`reminderCron[slotExpiry]: failed: ${(e as Error).message}`);
    return 0;
  }
}

/**
 * Run one named subtask, log its duration, and NEVER throw.
 * Any exception is caught, logged with the task name, and 0 is returned so
 * the parent tick always continues to the next subtask.
 */
async function runSubtask(name: string, fn: () => Promise<number>): Promise<number> {
  const t0 = Date.now();
  try {
    const count = await fn();
    const n = count ?? 0;
    if (n > 0) log(`reminderCron[${name}]: processed ${n} item(s) in ${Date.now() - t0}ms`);
    return n;
  } catch (err) {
    log(`reminderCron[${name}]: FAILED in ${Date.now() - t0}ms — ${(err as Error).message}`);
    return 0;
  }
}

async function tick() {
  const start = recordJobStart("tick_5min");
  // Tasks run SEQUENTIALLY to stay within the pool limit (max 12 connections).
  // Each subtask is independently isolated via runSubtask — one failure never
  // aborts the others or marks the whole tick as failed.
  let sum = 0;
  sum += await runSubtask("reminder_1h",    () => sendForTier("1h"));
  sum += await runSubtask("reminder_15m",   () => sendForTier("15m"));
  sum += await runSubtask("post_visit",     () => sendPostVisit());
  sum += await runSubtask("expire_pending", () => expireStalePending());
  sum += await runSubtask("cancel_stale",   () => cancelStaleConfirmed());
  sum += await runSubtask("slot_holds",     () => expireAndNotifySlotHolds());
  sum += await runSubtask("group_sessions", async () => {
    const gs = await storage.tickGroupSessionStatuses();
    const n = (gs.toLive || 0) + (gs.toCompleted || 0);
    if (n > 0) log(`reminderCron[group]: live=${gs.toLive} completed=${gs.toCompleted}`);
    return n;
  });
  if (sum > 0) log(`reminderCron: 5-min tick processed ${sum} item(s)`);
  recordJobEnd("tick_5min", start, { itemCount: sum });
  logScheduler({ job: "tick_5min", status: "completed", itemsProcessed: sum, durationMs: Date.now() - start });
}

/**
 * Walk overdue invoices and nudge each patient via the notification dispatcher
 * (in-app + email by default). Honors a per-invoice cooldown so we never spam.
 * Capped at INVOICE_REMINDER_MAX_PER_INVOICE total reminders per invoice.
 */
async function sendOverdueInvoiceReminders() {
  const due = await storage.getOverdueInvoicesNeedingReminder({
    cooldownDays: INVOICE_REMINDER_COOLDOWN_DAYS,
    limit: 100,
  });
  if (!due.length) return 0;

  // Hydrate patients in one batch.
  const patientIds = Array.from(new Set(due.map(i => i.patientId)));
  const patientRows = patientIds.length
    ? await db.select().from(users).where(inArray(users.id, patientIds))
    : [];
  const patientById = new Map(patientRows.map(p => [p.id, p]));

  let sent = 0;
  for (const inv of due) {
    if ((inv.reminderCount ?? 0) >= INVOICE_REMINDER_MAX_PER_INVOICE) continue;
    const patient = patientById.get(inv.patientId);
    if (!patient) continue;
    try {
      const dueIso = new Date(inv.dueDate).toISOString().slice(0, 10);
      const remindersBefore = inv.reminderCount ?? 0;
      const ordinal = remindersBefore === 0 ? "" : ` (reminder #${remindersBefore + 1})`;
      await dispatchNotification({
        userId: patient.id,
        eventKey: "invoice.overdue",
        title: `Reminder: Invoice ${inv.invoiceNumber} is overdue${ordinal}`,
        body: `Hello ${patient.firstName}, your invoice ${inv.invoiceNumber} for ${inv.totalAmount} ${inv.countryCode === "IR" ? "IRR" : inv.countryCode === "HU" ? "HUF" : "USD"} was due on ${dueIso} and is still unpaid. Please log in to settle it at your earliest convenience.`,
        data: { invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, dueDate: dueIso },
      });
      await storage.markInvoiceReminderSent(inv.id);
      sent++;
    } catch (err) {
      log(`reminderCron[invoice]: failed for invoice ${inv.id}: ${(err as Error).message}`);
    }
  }
  return sent;
}

/**
 * Appointment preparation reminder — sent 48h before to give patients
 * time to prepare (bring documents, stop medications, etc.).
 * Runs on the hourly tick so it has a ±1h window.
 */
async function sendPrepReminders() {
  const minsBefore = 48 * 60;
  const span = 60;
  const windowStart = new Date(Date.now() + (minsBefore - span / 2) * 60_000);
  const windowEnd   = new Date(Date.now() + (minsBefore + span / 2) * 60_000);

  const { rows: u1 } = await pool.query<Record<string, any>>(
    `SELECT * FROM appointments
      WHERE start_at >= $1 AND start_at <= $2
        AND status = ANY(ARRAY['approved','confirmed','rescheduled','reschedule_proposed']::appointment_status[])`,
    [windowStart.toISOString(), windowEnd.toISOString()],
  );
  const win = windowAheadMinutes(minsBefore, span);
  const { rows: u2 } = await pool.query<Record<string, any>>(
    `SELECT * FROM appointments
      WHERE start_at IS NULL
        AND date = $1 AND start_time >= $2 AND start_time <= $3
        AND status = ANY(ARRAY['approved','confirmed','rescheduled','reschedule_proposed']::appointment_status[])`,
    [win.date, win.startMin, win.endMin],
  );
  const seenP = new Set<string>();
  const upcoming: Record<string, any>[] = [];
  for (const row of [...u1, ...u2]) {
    if (!seenP.has(row.id)) { seenP.add(row.id); upcoming.push(row); }
  }
  if (!upcoming.length) return 0;

  const userIds = Array.from(new Set(upcoming.map(a => a.patient_id as string)));
  const userRows = userIds.length
    ? await db.select().from(users).where(inArray(users.id, userIds))
    : [];
  const langByUser = new Map<string, any>();
  userRows.forEach(u => langByUser.set(u.id, normalizeLang(u.languagePreference)));

  let sent = 0;
  for (const appt of upcoming) {
    const memoKey = `appt:${appt.id}:48h`;
    if (sentMemo.has(memoKey)) continue;
    try {
      await notify.reminder(appt.patient_id, "24h", {
        date: appt.date, time: appt.start_time, appointmentId: appt.id,
        lang: langByUser.get(appt.patient_id),
      });
      sentMemo.add(memoKey);
      sent++;
    } catch (err) {
      log(`reminderCron[48h-prep]: failed for appt ${appt.id}: ${(err as Error).message}`);
    }
  }
  return sent;
}

/**
 * Soft-expire provider documents whose expiry_date is more than 6 months
 * in the past. Sets verification_status to 'expired' so admins can re-verify.
 * Uses text comparison on the ISO-date string stored in the column — safe for
 * YYYY-MM-DD strings which sort lexicographically.
 */
async function expireStaleProviderDocuments(): Promise<number> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    // Expire docs on their actual expiry date (or past it)
    const expired = await pool.query(
      `UPDATE provider_documents
          SET verification_status = 'expired',
              expired_at = NOW()
        WHERE expiry_date IS NOT NULL
          AND expiry_date <= $1
          AND verification_status NOT IN ('expired', 'rejected')
       RETURNING id`,
      [today],
    );
    // Mark expiring_soon for approved docs expiring within 30 days
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    const in30Str = in30.toISOString().slice(0, 10);
    await pool.query(
      `UPDATE provider_documents
          SET verification_status = 'expiring_soon'
        WHERE expiry_date IS NOT NULL
          AND expiry_date > $1
          AND expiry_date <= $2
          AND verification_status = 'approved'`,
      [today, in30Str],
    );
    return expired.rowCount ?? 0;
  } catch (err) {
    log(`reminderCron[docExpiry]: ${(err as Error).message}`);
    return 0;
  }
}

// ── Stale Pending-Verification Account Cleanup ────────────────────────────────
// Deletes accounts that were registered but never verified within 7 days.
// Cascades in correct FK-dependency order before removing the user row.
// Runs inside tickHourly. Safe to re-run (idempotent).

const PENDING_VERIFICATION_EXPIRY_DAYS =
  Number(process.env.PENDING_VERIFICATION_EXPIRY_DAYS || 7);

async function cleanupStalePendingAccounts(): Promise<number> {
  try {
    // Collect stale unverified user IDs in one query.
    const { rows: staleRows } = await pool.query<{ id: string }>(
      `SELECT id FROM users
        WHERE is_email_verified = false
          AND created_at < NOW() - INTERVAL '1 day' * $1`,
      [PENDING_VERIFICATION_EXPIRY_DAYS],
    );
    if (!staleRows.length) return 0;

    const ids = staleRows.map((r) => r.id);
    // Cascade deletes across dependent tables (same order as purgeUnverifiedUser).
    await pool.query(`DELETE FROM refresh_tokens             WHERE user_id = ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM push_subscriptions         WHERE user_id = ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM notification_preferences   WHERE user_id = ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM notification_queue         WHERE user_id = ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM notification_delivery_logs WHERE user_id = ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM user_notifications         WHERE user_id = ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM wallet_transactions        WHERE user_id = ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM wallets                    WHERE user_id = ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM audit_logs                 WHERE user_id = ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM users                      WHERE id      = ANY($1::uuid[])`, [ids]);

    log(`reminderCron[pendingCleanup]: removed ${ids.length} stale pending-verification account(s)`);
    return ids.length;
  } catch (err) {
    log(`reminderCron[pendingCleanup]: ${(err as Error).message}`);
    return 0;
  }
}

// ── Data Retention ────────────────────────────────────────────────────────────
// Runs once per hour. Prunes rows that are past their retention window to keep
// high-volume tables from growing unboundedly. All deletes are idempotent and
// safe to re-run.

const RETENTION = {
  userNotificationsDays: Number(process.env.RETAIN_NOTIFICATIONS_DAYS || 90),
  systemEventsDays:      Number(process.env.RETAIN_SYSTEM_EVENTS_DAYS  || 90),
  auditLogsDays:         Number(process.env.RETAIN_AUDIT_LOGS_DAYS     || 180),
  idempotencyKeysDays:   Number(process.env.RETAIN_IDEMPOTENCY_DAYS    || 3),
};

async function pruneOldData(): Promise<Record<string, number>> {
  const results: Record<string, number> = {};

  const tasks: Array<{ name: string; sql: string; cutoffDays: number }> = [
    {
      name: "user_notifications",
      sql: `DELETE FROM user_notifications WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
      cutoffDays: RETENTION.userNotificationsDays,
    },
    {
      name: "system_events",
      sql: `DELETE FROM system_events WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
      cutoffDays: RETENTION.systemEventsDays,
    },
    {
      name: "audit_logs",
      sql: `DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
      cutoffDays: RETENTION.auditLogsDays,
    },
    {
      name: "idempotency_keys",
      sql: `DELETE FROM idempotency_keys WHERE expires_at < NOW()`,
      cutoffDays: 0, // uses expires_at column
    },
    {
      name: "appointment_slot_holds",
      sql: `DELETE FROM appointment_slot_holds WHERE expires_at < NOW()`,
      cutoffDays: 0, // uses expires_at column
    },
  ];

  for (const task of tasks) {
    try {
      const params = task.cutoffDays > 0 ? [task.cutoffDays] : [];
      const sql = task.cutoffDays > 0 ? task.sql : task.sql;
      const r = await pool.query(sql, params);
      results[task.name] = r.rowCount ?? 0;
    } catch (err) {
      log(`reminderCron[retention]: failed to prune ${task.name}: ${(err as Error).message}`);
      results[task.name] = -1;
    }
  }

  return results;
}

// Track when we last ran retention so it doesn't run more than once per hour
// even if tickHourly is called multiple times (e.g. unit tests).
let lastRetentionRun = 0;

// Track the last date on which the rolling schedule was published.
// One run per calendar day is sufficient — the cron generates slots 30 days ahead.
let lastRollingScheduleDate = "";

// ── Provider weekly / monthly summary notifications ───────────────────────
// Sent at most once per day on Mondays (weekly) and on the 1st (monthly).
// In-memory dedup prevents duplicate sends within the same server process
// even if tickHourly fires multiple times.
let lastWeeklySummaryDate = "";
let lastMonthlySummaryDate = "";

async function sendProviderSummaries(window: "week" | "month"): Promise<number> {
  const todayKey = new Date().toISOString().slice(0, 10);
  if (window === "week") {
    if (lastWeeklySummaryDate === todayKey) return 0;
    lastWeeklySummaryDate = todayKey;
  } else {
    if (lastMonthlySummaryDate === todayKey) return 0;
    lastMonthlySummaryDate = todayKey;
  }

  const intervalSql = window === "week" ? "7 days" : "30 days";
  const windowLabel = window === "week" ? "last week" : "last month";

  let sent = 0;
  try {
    const providerRows = await pool.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM providers WHERE is_verified = true AND is_active = true LIMIT 500`,
    );
    if (!providerRows.rows.length) return 0;

    for (const row of providerRows.rows) {
      try {
        const stats = await pool.query<{ completed: string; revenue: string }>(
          `SELECT COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                  COALESCE(SUM(total_amount::numeric) FILTER (WHERE status = 'completed'), 0) AS revenue
           FROM appointments
           WHERE provider_id = $1 AND date::date >= CURRENT_DATE - INTERVAL '${intervalSql}'`,
          [row.id],
        );
        const s = stats.rows[0] ?? { completed: "0", revenue: "0" };
        const completed = Number(s.completed);
        const revenue = Number(s.revenue);
        await storage.createUserNotification({
          userId: row.user_id,
          type: "system",
          title: `Your ${window === "week" ? "weekly" : "monthly"} summary`,
          message: `${windowLabel.charAt(0).toUpperCase() + windowLabel.slice(1)}: ${completed} appointment${completed !== 1 ? "s" : ""} completed, revenue $${revenue.toFixed(2)} USD. Open your Insights tab to see full details.`,
          isRead: false,
        } as any);
        sent++;
      } catch (e) {
        log(`reminderCron[${window}Summary]: failed for provider ${row.id}: ${(e as Error).message}`);
      }
    }
  } catch (err) {
    log(`reminderCron[${window}Summary]: ${(err as Error).message}`);
  }
  return sent;
}

async function tickHourly() {
  const start = recordJobStart("tick_hourly");
  // Sync exchange rates first so financial ops always have fresh rates
  try {
    const { syncRates } = await import("./services/currency");
    await withJobTracking("sync_exchange_rates", syncRates);
  } catch (rateErr) {
    console.warn("[cron] exchange rate sync failed (non-fatal — serving with cached rates):", (rateErr as Error).message);
  }

  // Every module runs via runSubtask so ONE failure never aborts the rest.
  // Tasks run sequentially to stay within the pool connection limit.
  let totalItems = 0;
  const now = new Date();

  totalItems += await runSubtask("reminder_24h",     () => sendForTier("24h"));
  totalItems += await runSubtask("prep_reminder",    () => sendPrepReminders());
  totalItems += await runSubtask("invoice_reminder", () => sendOverdueInvoiceReminders());
  totalItems += await runSubtask("doc_expiry",       () => expireStaleProviderDocuments());

  // Weekly summary — every Monday
  if (now.getDay() === 1) {
    totalItems += await runSubtask("weekly_summary", () => sendProviderSummaries("week"));
    totalItems += await runSubtask("profile_nudge",  () => sendProfileCompletionReminders());
  }
  // Monthly summary — 1st of every month
  if (now.getDate() === 1) {
    totalItems += await runSubtask("monthly_summary", () => sendProviderSummaries("month"));
  }

  // Module 3: expire waitlist offers not acted on within WAITLIST_OFFER_EXPIRY_HOURS
  totalItems += await runSubtask("waitlist_expiry",  () => expireNotifiedWaitlistEntries());

  // Module 4: proactive document expiry reminders (30/14/7 days before)
  totalItems += await runSubtask("doc_advance",      () => sendDocumentExpiryReminders());

  // Module 4: credential / license expiry alerts (60/30/14 days before)
  totalItems += await runSubtask("cred_expiry",      () => sendCredentialExpiryAlerts());

  // Module 5: 7-day post-appointment follow-up reminders
  totalItems += await runSubtask("followup",         () => sendFollowUpReminders());

  // Module 5: package expiry retention alerts (7-day window)
  totalItems += await runSubtask("pkg_alerts",       () => sendPackageRetentionAlerts());

  // W7: auto-renew packages BEFORE expiring them (renewal must happen first)
  totalItems += await runSubtask("pkg_renew",        () => renewExpiredPackages());

  // Module 5: expire packages that have passed their expiry date and notify users
  totalItems += await runSubtask("pkg_expire",       () => expireAndNotifyPackages());

  // W5: expire gift cards that have passed their expiry date
  totalItems += await runSubtask("gc_expire",        () => expireGiftCards());

  // Rolling schedule — expand provider time_slots 30 days ahead (once per day)
  const todayKey = now.toISOString().slice(0, 10);
  if (todayKey !== lastRollingScheduleDate) {
    lastRollingScheduleDate = todayKey;
    import("./cron/rolling-schedule")
      .then(({ runRollingSchedule }) => runRollingSchedule())
      .catch(e => log(`reminderCron[rollingSchedule]: failed: ${(e as Error).message}`));
  }

  // C14.5-P4: Wallet drift integrity check — flags providers with balance mismatches
  try {
    const { runWalletAudit } = await import("./cron/wallet-audit");
    const audit = await runWalletAudit();
    if (audit.flagged > 0)  log(`reminderCron[walletAudit]: flagged ${audit.flagged} wallet(s) with audit hold`);
    if (audit.cleared > 0) log(`reminderCron[walletAudit]: cleared ${audit.cleared} wallet(s) from audit hold`);
  } catch (auditErr) {
    log(`reminderCron[walletAudit]: failed: ${(auditErr as Error).message}`);
  }

  // Data retention — run at most once per hour
  const nowMs = Date.now();
  if (nowMs - lastRetentionRun >= 60 * 60 * 1000) {
    lastRetentionRun = nowMs;
    try {
      const pruned = await withJobTracking("data_retention", pruneOldData);
      const summary = Object.entries(pruned)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}=${n}`)
        .join(", ");
      if (summary) log(`reminderCron: retention pruned — ${summary}`);
    } catch (retentionErr) {
      log(`reminderCron[retention]: FAILED — ${(retentionErr as Error).message}`);
    }

    // Stale pending-verification accounts cleanup (runs alongside retention)
    try {
      const purged = await withJobTracking("pending_account_cleanup", cleanupStalePendingAccounts);
      if (purged > 0) log(`reminderCron: pending-verification cleanup removed ${purged} account(s)`);
    } catch (cleanupErr) {
      log(`reminderCron[pendingCleanup]: FAILED — ${(cleanupErr as Error).message}`);
    }
  }

  recordJobEnd("tick_hourly", start, { itemCount: totalItems });
  logScheduler({ job: "tick_hourly", status: "completed", itemsProcessed: totalItems, durationMs: Date.now() - start });
}

// ── Module 3: Waitlist offer auto-expiry ────────────────────────────────────
// Entries in status "notified" that haven't been acted on within
// WAITLIST_OFFER_EXPIRY_HOURS (default 24h) are moved to "expired".
// This frees the slot to be re-offered to the next patient in the queue.

const WAITLIST_OFFER_EXPIRY_HOURS = Number(process.env.WAITLIST_OFFER_EXPIRY_HOURS || 24);

async function expireNotifiedWaitlistEntries(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - WAITLIST_OFFER_EXPIRY_HOURS * 60 * 60 * 1000);
    const result = await pool.query(
      `UPDATE waitlist_entries
          SET status = 'expired'
        WHERE status = 'notified'
          AND notified_at IS NOT NULL
          AND notified_at < $1
       RETURNING id, patient_id, provider_id`,
      [cutoff],
    );
    const rows = result.rows as { id: string; patient_id: string; provider_id: string }[];
    for (const row of rows) {
      try {
        await storage.createUserNotification({
          userId: row.patient_id,
          type: "appointment",
          title: "Waitlist offer expired",
          message: `Your waitlist offer for an available slot has expired after ${WAITLIST_OFFER_EXPIRY_HOURS} hours. You remain on the waitlist and will be notified if another slot opens.`,
          isRead: false,
        } as any);
      } catch (notifyErr) {
        console.warn("[cron] waitlist expiry notification failed for patient", row.patient_id, ":", (notifyErr as Error).message);
      }
    }
    return rows.length;
  } catch (err) {
    log(`reminderCron[waitlistExpiry]: ${(err as Error).message}`);
    return 0;
  }
}

// ── Module 4: Proactive document expiry reminders ────────────────────────────
// Sends advance alerts to providers when their documents are 30 / 14 / 7 days
// from expiry. Uses memo keys so we never send the same tier twice per document.

const docExpiryMemo = new Set<string>();

async function sendDocumentExpiryReminders(): Promise<number> {
  const TIERS = [
    { days: 30, label: "30 days" },
    { days: 14, label: "14 days" },
    { days: 7,  label: "7 days"  },
  ];

  let sent = 0;
  for (const tier of TIERS) {
    try {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + tier.days);
      const targetStr = targetDate.toISOString().slice(0, 10);

      // Documents expiring on targetDate (exact day match for idempotency)
      const { rows } = await pool.query<{
        id: string; provider_id: string; document_type: string; expiry_date: string;
      }>(
        `SELECT pd.id, pd.provider_id, pd.document_type, pd.expiry_date
           FROM provider_documents pd
          WHERE pd.expiry_date = $1
            AND pd.verification_status NOT IN ('expired', 'rejected')`,
        [targetStr],
      );
      if (!rows.length) continue;

      const providerIds = [...new Set(rows.map(r => r.provider_id))];
      const { rows: provRows } = await pool.query<{ id: string; user_id: string }>(
        `SELECT id, user_id FROM providers WHERE id = ANY($1)`,
        [providerIds],
      );
      const userByProvider = new Map(provRows.map(p => [p.id, p.user_id]));

      for (const doc of rows) {
        const memoKey = `doc:${doc.id}:${tier.days}d`;
        if (docExpiryMemo.has(memoKey)) continue;
        const userId = userByProvider.get(doc.provider_id);
        if (!userId) continue;
        try {
          await storage.createUserNotification({
            userId,
            type: "system",
            title: `Document expiring in ${tier.label}`,
            message: `Your ${doc.document_type.replace(/_/g, " ")} document expires on ${doc.expiry_date}. Please upload an updated version to keep your profile compliant.`,
            isRead: false,
          } as any);
          docExpiryMemo.add(memoKey);
          sent++;
          // Alert admins on the 7-day tier so the verification queue stays clean
          if (tier.days === 7) {
            fireAdminNotification(
              "document_expiring_soon",
              `Provider document expiring in 7 days`,
              `A provider's ${doc.document_type.replace(/_/g, " ")} document expires on ${doc.expiry_date}. Review the provider's verification queue.`,
              { severity: "warning", providerId: doc.provider_id }
            ).catch(() => {});
          }
        } catch (e) {
          log(`reminderCron[docExpiry]: notify failed for doc ${doc.id}: ${(e as Error).message}`);
        }
      }
    } catch (err) {
      log(`reminderCron[docExpiry:${tier.days}d]: ${(err as Error).message}`);
    }
  }
  return sent;
}

// ── Module 4: Profile completion reminders ───────────────────────────────────
// Runs weekly (Monday) for providers whose profiles are missing key fields.
// Fields checked: bio, profile photo, at least one active service.

let lastProfileReminderDate = "";

async function sendProfileCompletionReminders(): Promise<number> {
  const todayKey = new Date().toISOString().slice(0, 10);
  if (lastProfileReminderDate === todayKey) return 0;
  lastProfileReminderDate = todayKey;

  let sent = 0;
  try {
    const { rows } = await pool.query<{
      provider_id: string; user_id: string; first_name: string; bio: string | null;
      profile_image_url: string | null; has_service: boolean;
    }>(
      `SELECT p.id AS provider_id, p.user_id,
              u.first_name,
              p.bio,
              COALESCE(u.profile_image_url, NULL) AS profile_image_url,
              EXISTS(
                SELECT 1 FROM services s
                WHERE s.provider_id = p.id AND s.is_active = true
              ) AS has_service
         FROM providers p
         JOIN users u ON u.id = p.user_id
        WHERE p.is_verified = false
          AND p.is_active = true
        LIMIT 200`,
    );

    for (const row of rows) {
      const missing: string[] = [];
      if (!row.bio) missing.push("bio / about section");
      if (!row.profile_image_url) missing.push("profile photo");
      if (!row.has_service) missing.push("at least one active service");
      if (!missing.length) continue;

      try {
        await storage.createUserNotification({
          userId: row.user_id,
          type: "system",
          title: "Complete your profile to attract more patients",
          message: `Hi ${row.first_name}, your profile is missing: ${missing.join(", ")}. A complete profile gets up to 3× more bookings.`,
          isRead: false,
        } as any);
        sent++;
      } catch (e) {
        log(`reminderCron[profileComplete]: failed for provider ${row.provider_id}: ${(e as Error).message}`);
      }
    }
  } catch (err) {
    log(`reminderCron[profileComplete]: ${(err as Error).message}`);
  }
  return sent;
}

// ── Module 5: 7-day follow-up reminders ──────────────────────────────────────
// Patients who had an appointment completed ~7 days ago are sent a gentle
// "How are you feeling? Consider booking a follow-up" prompt.
// Uses updated_at as a proxy for completion time. Memo prevents duplicates
// within the same server process lifetime.

const followupMemo = new Set<string>();

async function sendFollowUpReminders(): Promise<number> {
  try {
    // Appointments completed 7 days ago ± 1h (updated_at tracks last status change)
    const seven = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const lo = new Date(seven.getTime() - 60 * 60 * 1000);
    const hi = new Date(seven.getTime() + 60 * 60 * 1000);

    const { rows } = await pool.query<{
      id: string; patient_id: string; provider_id: string; date: string;
    }>(
      `SELECT id, patient_id, provider_id, date
         FROM appointments
        WHERE status = 'completed'
          AND updated_at >= $1
          AND updated_at <= $2`,
      [lo, hi],
    );
    if (!rows.length) return 0;

    let sent = 0;
    for (const appt of rows) {
      const memoKey = `followup:${appt.id}`;
      if (followupMemo.has(memoKey)) continue;
      try {
        await storage.createUserNotification({
          userId: appt.patient_id,
          type: "appointment",
          title: "How are you feeling?",
          message: `It's been a week since your appointment on ${appt.date}. If you need further care or a check-up, your provider is ready to see you again.`,
          isRead: false,
        } as any);
        followupMemo.add(memoKey);
        sent++;

        trackEvent({
          eventType: "followup_scheduled",
          userId: appt.patient_id,
          providerId: appt.provider_id,
          metadata: { appointmentId: appt.id, daysSince: 7 },
        }).catch(() => {});
      } catch (e) {
        log(`reminderCron[followup]: failed for appt ${appt.id}: ${(e as Error).message}`);
      }
    }
    return sent;
  } catch (err) {
    log(`reminderCron[followup]: ${(err as Error).message}`);
    return 0;
  }
}

// ── W7: Subscription Auto-Renewal Engine ─────────────────────────────────────
// Runs every hour. Finds active packages with auto_renew = true that have
// just expired. Attempts a wallet debit equal to the package price. On
// success: creates a fresh user_package row and marks the old one 'renewed'.
// On failure: grants a 3-day grace period and notifies the patient.

let _renewRunning = false;

async function renewExpiredPackages(): Promise<number> {
  if (_renewRunning) return 0;
  _renewRunning = true;
  try {
    const { rows: due } = await pool.query<{
      id: string; user_id: string; package_id: string; price: string;
      currency: string; duration_days: number; package_name: string;
    }>(
      `SELECT up.id, up.user_id, up.package_id, p.price::text, p.currency,
              p.duration_days, COALESCE(p.name, 'Membership Package') AS package_name
         FROM user_packages up
         JOIN packages p ON p.id = up.package_id
        WHERE up.status = 'active'
          AND up.auto_renew = true
          AND up.expires_at IS NOT NULL
          AND up.expires_at < NOW()
          AND up.grace_period_ends_at IS NULL`,
    );
    if (!due.length) return 0;

    let renewed = 0;
    for (const row of due) {
      try {
        const priceUSD = Number(row.price);
        if (priceUSD <= 0) {
          // Free package: just extend
          const newExpiry = new Date();
          newExpiry.setDate(newExpiry.getDate() + (row.duration_days || 30));
          await pool.query(
            `INSERT INTO user_packages (user_id, package_id, status, price_paid, country_code, expires_at, auto_renew, created_at)
             SELECT user_id, package_id, 'active', price_paid, country_code, $1, auto_renew, NOW()
               FROM user_packages WHERE id = $2`,
            [newExpiry, row.id],
          );
          await pool.query(`UPDATE user_packages SET status = 'renewed' WHERE id = $1`, [row.id]);
          renewed++;
          continue;
        }

        // Check wallet balance before charging
        const { rows: walletRows } = await pool.query(
          `SELECT balance FROM wallets WHERE user_id = $1`,
          [row.user_id],
        );
        const balance = walletRows[0] ? Number(walletRows[0].balance) : 0;

        if (balance >= priceUSD) {
          // Debit wallet
          await storage.debitWallet(row.user_id, priceUSD, {
            description: `Auto-renewal: ${row.package_name}`,
            referenceType: "package_purchase",
            referenceId: row.id,
            idempotencyKey: `pkg-autorenew-${row.id}`,
          });
          // Create new active user_package
          const newExpiry = new Date();
          newExpiry.setDate(newExpiry.getDate() + (row.duration_days || 30));
          await pool.query(
            `INSERT INTO user_packages (user_id, package_id, status, price_paid, country_code, expires_at, auto_renew, created_at)
             SELECT user_id, package_id, 'active', price_paid, country_code, $1, auto_renew, NOW()
               FROM user_packages WHERE id = $2`,
            [newExpiry, row.id],
          );
          await pool.query(`UPDATE user_packages SET status = 'renewed' WHERE id = $1`, [row.id]);
          // Notify success via dispatcher (multi-channel + delivery logging)
          const newExpiry2 = new Date();
          newExpiry2.setDate(newExpiry2.getDate() + (row.duration_days || 30));
          notify.membershipRenewed(row.user_id, {
            packageName: row.package_name,
            formattedAmount: `$${priceUSD.toFixed(2)} USD`,
            expiresAt: newExpiry2.toISOString().slice(0, 10),
          }).catch(() => {});
          renewed++;
        } else {
          // Insufficient funds — set grace period (3 days) and notify
          const grace = new Date();
          grace.setDate(grace.getDate() + 3);
          await pool.query(
            `UPDATE user_packages SET grace_period_ends_at = $1 WHERE id = $2`,
            [grace, row.id],
          );
          notify.packageRenewalFailed(row.user_id, {
            packageName: row.package_name,
            graceDays: 3,
          }).catch(() => {});
        }
      } catch (e) {
        log(`reminderCron[renewal]: failed for user_package ${row.id}: ${(e as Error).message}`);
      }
    }
    return renewed;
  } catch (err) {
    log(`reminderCron[renewal]: ${(err as Error).message}`);
    return 0;
  } finally {
    _renewRunning = false;
  }
}

// ── W5: Gift Card Expiry ──────────────────────────────────────────────────────
// Marks gift cards as inactive once their expires_at has passed.

async function expireGiftCards(): Promise<number> {
  try {
    const { rowCount } = await pool.query(
      `UPDATE gift_cards SET is_active = false
        WHERE is_active = true
          AND expires_at IS NOT NULL
          AND expires_at < NOW()`,
    );
    return rowCount ?? 0;
  } catch (err) {
    log(`reminderCron[gcExpiry]: ${(err as Error).message}`);
    return 0;
  }
}

// ── Module 5: Package retention alerts ───────────────────────────────────────
// Alerts patients when their active package expires within 7 days so they
// can renew or book their remaining sessions before losing them.

const packageAlertMemo = new Set<string>();

async function sendPackageRetentionAlerts(): Promise<number> {
  try {
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { rows } = await pool.query<{
      id: string; user_id: string; package_id: string; expires_at: string; package_name: string;
    }>(
      `SELECT up.id, up.user_id, up.package_id, up.expires_at::text,
              COALESCE(p.name, 'Membership Package') AS package_name
         FROM user_packages up
         JOIN packages p ON p.id = up.package_id
        WHERE up.status = 'active'
          AND up.expires_at IS NOT NULL
          AND up.expires_at > $1
          AND up.expires_at <= $2`,
      [now, in7],
    );
    if (!rows.length) return 0;

    let sent = 0;
    for (const row of rows) {
      const memoKey = `pkg-expiry:${row.id}`;
      if (packageAlertMemo.has(memoKey)) continue;
      try {
        const expiresOn = row.expires_at?.slice(0, 10) ?? "soon";
        await storage.createUserNotification({
          userId: row.user_id,
          type: "system",
          title: `Your "${row.package_name}" package expires soon`,
          message: `Your package expires on ${expiresOn}. Log in to book any remaining sessions or renew before it expires.`,
          isRead: false,
        } as any);
        packageAlertMemo.add(memoKey);
        sent++;

        trackEvent({
          eventType: "package_expiry_alert",
          userId: row.user_id,
          metadata: { userPackageId: row.id, packageId: row.package_id, expiresAt: expiresOn },
        }).catch(() => {});
      } catch (e) {
        log(`reminderCron[pkgExpiry]: failed for user_package ${row.id}: ${(e as Error).message}`);
      }
    }
    return sent;
  } catch (err) {
    log(`reminderCron[pkgExpiry]: ${(err as Error).message}`);
    return 0;
  }
}

// ── Module 4: Credential / license expiry alerts ─────────────────────────────
// Providers with license_expiry_date approaching 60 / 30 / 14 days get alerted.

const credExpiryMemo = new Set<string>();

async function sendCredentialExpiryAlerts(): Promise<number> {
  const TIERS = [
    { days: 60, label: "60 days" },
    { days: 30, label: "30 days" },
    { days: 14, label: "14 days" },
  ];

  let sent = 0;
  for (const tier of TIERS) {
    try {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + tier.days);
      const targetStr = targetDate.toISOString().slice(0, 10);

      const { rows } = await pool.query<{ id: string; user_id: string; license_expiry_date: string }>(
        `SELECT id, user_id, license_expiry_date::text
           FROM providers
          WHERE license_expiry_date::date = $1::date
            AND is_active = true`,
        [targetStr],
      );

      for (const row of rows) {
        const memoKey = `cred:${row.id}:${tier.days}d`;
        if (credExpiryMemo.has(memoKey)) continue;
        try {
          await storage.createUserNotification({
            userId: row.user_id,
            type: "system",
            title: `Your professional license expires in ${tier.label}`,
            message: `Your license expires on ${targetStr}. Please renew it and upload the updated document to maintain your verified status and continue accepting bookings.`,
            isRead: false,
          } as any);
          credExpiryMemo.add(memoKey);
          sent++;
        } catch (e) {
          log(`reminderCron[credExpiry]: failed for provider ${row.id}: ${(e as Error).message}`);
        }
      }
    } catch (err) {
      log(`reminderCron[credExpiry:${tier.days}d]: ${(err as Error).message}`);
    }
  }
  return sent;
}

// ── Module 5: Expire overdue packages and notify users ──────────────────────
// Marks active packages whose expires_at < NOW() as expired and sends a
// "package.expired" notification to each affected user.

let _pkgExpireRunning = false;

async function expireAndNotifyPackages(): Promise<number> {
  // Prevent concurrent runs (e.g. if a previous hourly tick is still processing)
  if (_pkgExpireRunning) {
    log("reminderCron[pkgExpire]: previous run still active — skipping tick");
    return 0;
  }
  _pkgExpireRunning = true;
  try {
    // Find packages to expire (before updating so we can notify users)
    const { rows } = await pool.query<{
      id: string; user_id: string; package_name: string;
    }>(
      `SELECT up.id, up.user_id,
              COALESCE(p.name, 'Membership Package') AS package_name
         FROM user_packages up
         JOIN packages p ON p.id = up.package_id
        WHERE up.status = 'active'
          AND up.expires_at IS NOT NULL
          AND up.expires_at < NOW()`,
    );
    if (!rows.length) return 0;

    let expired = 0;
    for (const row of rows) {
      try {
        await pool.query(
          `UPDATE user_packages SET status = 'expired' WHERE id = $1`,
          [row.id],
        );
        notify.packageExpired(row.user_id, { packageName: row.package_name })
          .catch(e => log(`reminderCron[pkgExpire]: notify failed for ${row.id}: ${(e as Error).message}`));
        expired++;
      } catch (e) {
        log(`reminderCron[pkgExpire]: failed for user_package ${row.id}: ${(e as Error).message}`);
      }
    }
    return expired;
  } catch (err) {
    log(`reminderCron[pkgExpire]: ${(err as Error).message}`);
    return 0;
  } finally {
    _pkgExpireRunning = false;
  }
}

export function startReminderCron() {
  // Delay the FIRST execution by 8 s so startup migrations have time to
  // release their pool connections before any cron query hits the DB.
  // The 5-min and 1-hour intervals start immediately so no tick is lost
  // once the server is truly up. The hourly tick is staggered by 2 s extra
  // to prevent the two initial runs from flooding the pool simultaneously.
  const STARTUP_DELAY_MS = 8_000;
  setTimeout(tick,       STARTUP_DELAY_MS);
  setTimeout(tickHourly, STARTUP_DELAY_MS + 2_000);
  setInterval(tick, TICK_5M);
  if (hourlyTimer) clearInterval(hourlyTimer);
  hourlyTimer = setInterval(tickHourly, 60 * 60 * 1000);
  log(`reminderCron started — first tick in ${STARTUP_DELAY_MS / 1000}s, then every 5 min / 1 h`);
}
