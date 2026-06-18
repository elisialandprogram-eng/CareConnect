/**
 * Central notification dispatcher.
 *
 * Single entry point for every transactional / system notification in the app.
 * Fans out one logical "event" to the user's enabled channels:
 *   in-app  →  user_notifications row (always available, free)
 *   email   →  Resend
 *   sms     →  Twilio
 *   whatsapp →  Twilio WhatsApp Business
 *   push    →  Web Push (VAPID)
 *
 * Each dispatch respects:
 *   - the user's notification_preferences row (master + per-event overrides)
 *   - quiet hours (skips non-urgent channels during quiet window)
 *   - localization (user.languagePreference / preferences.language)
 *   - delivery logging (notification_delivery_logs)
 */
import { db } from "../db";
import {
  notificationPreferences,
  notificationDeliveryLogs,
  pushSubscriptions,
  users,
  type User,
  type NotificationPreferences,
  type PushSubscription as DbPushSubscription,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { sendEmail } from "./channels/email";
import { sendSms } from "./channels/sms";
import { sendWhatsApp } from "./channels/whatsapp";
import { sendPush } from "./channels/push";
import { renderEvent, type DetailRow } from "./email/templates";
import { t, normalizeLang, type Lang } from "./i18n";

export type EventKey =
  | "appointment.booked"
  | "appointment.confirmed"
  | "appointment.rescheduled"
  | "appointment.cancelled"
  | "appointment.reminder.24h"
  | "appointment.reminder.1h"
  | "appointment.reminder.15m"
  | "appointment.postvisit"
  | "payment.received"
  | "payment.refunded"
  | "review.left"
  | "review.replied"
  | "payout.approved"
  | "payout.paid"
  | "payout.rejected"
  | "chat.new_message"
  | "ticket.replied"
  | "waitlist.slot_available"
  | "waitlist.joined"
  | "invoice.overdue"
  | "system.broadcast"
  | "package.expired"
  | "package.purchased"
  | "membership.purchased"
  | "membership.expired"
  | "membership.renewed"
  | "wallet.topup"
  | "wallet.refund"
  | "package.renewal_failed"
  | "bug.created"
  | "bug.status_changed"
  | "bug.comment_added"
  | "bug.assigned"
  | "bug.resolved"
  | "bug.closed";

export interface DispatchOptions {
  userId: string;
  eventKey: EventKey;
  /** Short title — used for in-app + push */
  title: string;
  /** Plain-text body — used for SMS/WhatsApp/push and as fallback */
  body: string;
  /** Email-specific overrides */
  email?: {
    subject?: string;
    headingKey?: string;
    introKey?: string;
    intro?: string;
    details?: DetailRow[];
    cta?: { label: string; url: string };
    attachments?: Array<{ filename: string; content: string; contentType?: string }>;
  };
  /** Push CTA url + tag */
  push?: { url?: string; tag?: string };
  /** Arbitrary JSON to persist with the in-app notification */
  data?: Record<string, any>;
  /** If true, bypass quiet hours and per-event overrides for emergencies */
  urgent?: boolean;
}

interface ChannelDecision {
  inApp: boolean;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  push: boolean;
}

const DEFAULT_PER_EVENT: Record<EventKey, ChannelDecision> = {
  "appointment.booked":           { inApp: true,  email: true,  sms: true,  whatsapp: true,  push: true  },
  "appointment.confirmed":        { inApp: true,  email: true,  sms: true,  whatsapp: true,  push: true  },
  "appointment.rescheduled":      { inApp: true,  email: true,  sms: true,  whatsapp: true,  push: true  },
  "appointment.cancelled":        { inApp: true,  email: true,  sms: true,  whatsapp: true,  push: true  },
  "appointment.reminder.24h":     { inApp: true,  email: true,  sms: false, whatsapp: false, push: true  },
  "appointment.reminder.1h":      { inApp: true,  email: false, sms: true,  whatsapp: true,  push: true  },
  "appointment.reminder.15m":     { inApp: true,  email: false, sms: true,  whatsapp: true,  push: true  },
  "appointment.postvisit":        { inApp: true,  email: true,  sms: false, whatsapp: false, push: true  },
  "payment.received":             { inApp: true,  email: true,  sms: false, whatsapp: false, push: false },
  "review.replied":               { inApp: true,  email: true,  sms: false, whatsapp: false, push: true  },
  "chat.new_message":             { inApp: true,  email: false, sms: false, whatsapp: false, push: true  },
  "ticket.replied":               { inApp: true,  email: true,  sms: false, whatsapp: false, push: true  },
  "waitlist.slot_available":      { inApp: true,  email: true,  sms: true,  whatsapp: true,  push: true  },
  "waitlist.joined":              { inApp: true,  email: false, sms: false, whatsapp: false, push: false },
  "invoice.overdue":              { inApp: true,  email: true,  sms: false, whatsapp: false, push: false },
  "system.broadcast":             { inApp: true,  email: true,  sms: false, whatsapp: false, push: true  },
  "package.expired":              { inApp: true,  email: true,  sms: false, whatsapp: false, push: false },
  "bug.created":                  { inApp: true,  email: false, sms: false, whatsapp: false, push: false },
  "bug.status_changed":           { inApp: true,  email: false, sms: false, whatsapp: false, push: false },
  "bug.comment_added":            { inApp: true,  email: false, sms: false, whatsapp: false, push: false },
  "bug.assigned":                 { inApp: true,  email: false, sms: false, whatsapp: false, push: false },
  "bug.resolved":                 { inApp: true,  email: false, sms: false, whatsapp: false, push: false },
  "bug.closed":                   { inApp: true,  email: false, sms: false, whatsapp: false, push: false },
  "review.left":                  { inApp: true,  email: true,  sms: false, whatsapp: false, push: true  },
  "payout.approved":              { inApp: true,  email: true,  sms: false, whatsapp: false, push: true  },
  "payout.paid":                  { inApp: true,  email: true,  sms: false, whatsapp: false, push: true  },
  "payout.rejected":              { inApp: true,  email: true,  sms: false, whatsapp: false, push: true  },
  "payment.refunded":             { inApp: true,  email: true,  sms: false, whatsapp: false, push: false },
  "package.purchased":            { inApp: true,  email: true,  sms: false, whatsapp: false, push: false },
  "membership.purchased":         { inApp: true,  email: true,  sms: false, whatsapp: false, push: false },
  "membership.expired":           { inApp: true,  email: true,  sms: false, whatsapp: false, push: false },
  "membership.renewed":           { inApp: true,  email: true,  sms: false, whatsapp: false, push: false },
  "wallet.topup":                 { inApp: true,  email: false, sms: false, whatsapp: false, push: false },
  "wallet.refund":                { inApp: true,  email: false, sms: false, whatsapp: false, push: false },
  "package.renewal_failed":       { inApp: true,  email: true,  sms: false, whatsapp: false, push: false },
};

async function getOrCreatePrefs(userId: string): Promise<NotificationPreferences> {
  const [existing] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  if (existing) return existing;
  const [created] = await db.insert(notificationPreferences).values({ userId }).returning();
  return created;
}

function isInQuietHours(prefs: NotificationPreferences): boolean {
  const start = prefs.quietHoursStart;
  const end = prefs.quietHoursEnd;
  if (!start || !end) return false;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sH, sM] = start.split(":").map(Number);
  const [eH, eM] = end.split(":").map(Number);
  if (Number.isNaN(sH) || Number.isNaN(eH)) return false;
  const s = sH * 60 + sM;
  const e = eH * 60 + eM;
  return s <= e ? cur >= s && cur < e : cur >= s || cur < e;
}

function decideChannels(prefs: NotificationPreferences, eventKey: EventKey, urgent: boolean): ChannelDecision {
  const def = DEFAULT_PER_EVENT[eventKey] || DEFAULT_PER_EVENT["system.broadcast"];
  let overrides: Partial<ChannelDecision> = {};
  if (prefs.eventOverrides) {
    try {
      const parsed = JSON.parse(prefs.eventOverrides);
      const ev = parsed?.[eventKey];
      if (ev && typeof ev === "object") {
        overrides = {
          inApp: typeof ev.inApp === "boolean" ? ev.inApp : undefined,
          email: typeof ev.email === "boolean" ? ev.email : undefined,
          sms: typeof ev.sms === "boolean" ? ev.sms : undefined,
          whatsapp: typeof ev.whatsapp === "boolean" ? ev.whatsapp : undefined,
          push: typeof ev.push === "boolean" ? ev.push : undefined,
        } as any;
      }
    } catch {}
  }

  const merged: ChannelDecision = {
    inApp: overrides.inApp ?? def.inApp,
    email: (overrides.email ?? def.email) && prefs.emailEnabled,
    sms: (overrides.sms ?? def.sms) && prefs.smsEnabled,
    whatsapp: (overrides.whatsapp ?? def.whatsapp) && prefs.whatsappEnabled,
    push: (overrides.push ?? def.push) && prefs.pushEnabled,
  };

  if (!urgent && isInQuietHours(prefs)) {
    // Suppress noisy channels but always keep in-app
    return { inApp: merged.inApp, email: merged.email, sms: false, whatsapp: false, push: false };
  }
  return merged;
}

async function logDelivery(
  userId: string,
  eventKey: string | null | undefined,
  channel: string,
  status: string,
  externalId?: string,
  errorMessage?: string,
  payload?: any,
) {
  try {
    await db.insert(notificationDeliveryLogs).values({
      userId,
      eventKey: eventKey ?? "admin_notify",
      channel,
      status,
      externalId,
      errorMessage,
      payload: payload ? JSON.stringify(payload).slice(0, 4000) : null,
    });
  } catch (e) {
    console.error("[notify] delivery log insert failed:", e);
  }
}

export async function dispatchNotification(opts: DispatchOptions): Promise<void> {
  const { userId, eventKey } = opts;
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1).then(r => r[0]);
  if (!user) {
    console.warn("[notify] user not found:", userId);
    return;
  }
  const prefs = await getOrCreatePrefs(userId);
  const lang: Lang = normalizeLang(user.languagePreference);
  const decision = decideChannels(prefs, eventKey, !!opts.urgent);

  // 1. In-app
  if (decision.inApp) {
    try {
      await storage.createUserNotification({
        userId,
        type: eventKey.split(".")[0] || "system",
        title: opts.title,
        message: opts.body,
        data: opts.data ? JSON.stringify(opts.data) : null,
        isRead: false,
      } as any);
      await logDelivery(userId, eventKey, "in_app", "sent");
      // Push a lightweight signal over the chat WebSocket so connected clients
      // invalidate their unread-count cache immediately (no DB round-trip).
      try {
        const { pushToUser } = await import("../chat/ws");
        pushToUser(userId, { type: "notification:count_changed" });
      } catch {}
    } catch (e: any) {
      await logDelivery(userId, eventKey, "in_app", "failed", undefined, e?.message);
    }
  }

  // 2. Email
  if (decision.email && user.email) {
    try {
      const html = renderEvent({
        lang,
        headingKey: opts.email?.headingKey || `${eventKey.replace(/\./g, "_")}.heading`,
        introKey: opts.email?.introKey,
        intro: opts.email?.intro || opts.body,
        details: opts.email?.details,
        cta: opts.email?.cta,
      });
      const subject = opts.email?.subject || opts.title;
      const r = await sendEmail({ to: user.email, subject, html, attachments: opts.email?.attachments });
      await logDelivery(userId, eventKey, "email", r.status, r.externalId, r.error);
    } catch (e: any) {
      await logDelivery(userId, eventKey, "email", "failed", undefined, e?.message);
    }
  }

  // 3. SMS
  if (decision.sms) {
    const phone = user.mobileNumber || user.phone;
    if (phone) {
      const r = await sendSms({ to: normalizePhone(phone), body: `${opts.title}\n${opts.body}` });
      await logDelivery(userId, eventKey, "sms", r.status, r.externalId, r.error);
    } else {
      await logDelivery(userId, eventKey, "sms", "skipped", undefined, "no phone");
    }
  }

  // 4. WhatsApp
  if (decision.whatsapp) {
    const phone = user.mobileNumber || user.phone;
    if (phone) {
      const r = await sendWhatsApp({ to: normalizePhone(phone), body: `${opts.title}\n${opts.body}` });
      await logDelivery(userId, eventKey, "whatsapp", r.status, r.externalId, r.error);
    } else {
      await logDelivery(userId, eventKey, "whatsapp", "skipped", undefined, "no phone");
    }
  }

  // 5. Web push
  if (decision.push) {
    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    if (subs.length === 0) {
      await logDelivery(userId, eventKey, "push", "skipped", undefined, "no subscriptions");
    } else {
      for (const sub of subs as DbPushSubscription[]) {
        const r = await sendPush(sub, {
          title: opts.title,
          body: opts.body,
          url: opts.push?.url,
          tag: opts.push?.tag || eventKey,
        });
        await logDelivery(userId, eventKey, "push", r.status, undefined, r.error);
        // 404 / 410 means the browser unregistered this subscription — delete it
        // immediately so future dispatches skip dead endpoints and don't rack up
        // repeated failed delivery attempts.
        if (r.expired) {
          try {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
            await logDelivery(userId, eventKey, "push", "subscription_removed", undefined,
              `Expired push subscription removed (id: ${sub.id})`);
          } catch (cleanupErr: any) {
            console.error("[notify] failed to remove expired push subscription:", cleanupErr?.message);
          }
        }
      }
    }
  }
}

function normalizePhone(p: string): string {
  let s = p.replace(/[^\d+]/g, "");
  if (!s.startsWith("+")) s = "+" + s;
  return s;
}

/** Convenience wrappers used throughout the app */
export const notify = {
  appointmentBooked: (userId: string, opts: { providerName: string; date: string; time: string; service?: string; appointmentId: string; lang?: Lang }) =>
    dispatchNotification({
      userId,
      eventKey: "appointment.booked",
      title: t("appt.confirm.heading", opts.lang || "en"),
      body: `Your appointment with ${opts.providerName} is on ${opts.date} at ${opts.time}.`,
      email: {
        subject: t("appt.confirm.subject", opts.lang || "en"),
        headingKey: "appt.confirm.heading",
        introKey: "appt.confirm.intro",
        details: [
          { label: t("label.date", opts.lang || "en"), value: opts.date },
          { label: t("label.time", opts.lang || "en"), value: opts.time },
          { label: t("label.provider", opts.lang || "en"), value: opts.providerName },
          ...(opts.service ? [{ label: t("label.service", opts.lang || "en"), value: opts.service }] : []),
        ],
      },
      data: { appointmentId: opts.appointmentId },
      push: { url: `/patient/appointments/${opts.appointmentId}` },
    }),
  appointmentRescheduled: (userId: string, opts: { date: string; time: string; appointmentId: string; lang?: Lang }) =>
    dispatchNotification({
      userId,
      eventKey: "appointment.rescheduled",
      title: t("appt.reschedule.heading", opts.lang || "en"),
      body: `New time: ${opts.date} at ${opts.time}.`,
      email: {
        subject: t("appt.reschedule.subject", opts.lang || "en"),
        headingKey: "appt.reschedule.heading",
        introKey: "appt.reschedule.intro",
        details: [
          { label: t("label.date", opts.lang || "en"), value: opts.date },
          { label: t("label.time", opts.lang || "en"), value: opts.time },
        ],
      },
      data: { appointmentId: opts.appointmentId },
    }),
  appointmentCancelled: (userId: string, opts: { date: string; time: string; appointmentId: string; lang?: Lang }) =>
    dispatchNotification({
      userId,
      eventKey: "appointment.cancelled",
      title: t("appt.cancel.heading", opts.lang || "en"),
      body: `Your appointment on ${opts.date} at ${opts.time} was cancelled.`,
      email: {
        subject: t("appt.cancel.subject", opts.lang || "en"),
        headingKey: "appt.cancel.heading",
        introKey: "appt.cancel.intro",
        details: [
          { label: t("label.date", opts.lang || "en"), value: opts.date },
          { label: t("label.time", opts.lang || "en"), value: opts.time },
        ],
      },
      data: { appointmentId: opts.appointmentId },
    }),
  paymentReceived: (userId: string, opts: { amount: string; currency: string; appointmentId: string; lang?: Lang; formattedAmount: string }) => {
    // formattedAmount is required — always pass a pre-formatted, localised amount string.
    const _pmtDisplay = opts.formattedAmount;
    return dispatchNotification({
      userId,
      eventKey: "payment.received",
      title: t("appt.payment.heading", opts.lang || "en"),
      body: `We received your payment of ${_pmtDisplay}.`,
      email: {
        subject: t("appt.payment.subject", opts.lang || "en"),
        headingKey: "appt.payment.heading",
        intro: `We received your payment of ${_pmtDisplay}.`,
        details: [
          { label: t("label.amount", opts.lang || "en"), value: _pmtDisplay },
        ],
      },
      data: { appointmentId: opts.appointmentId },
    });
  },
  reviewLeft: (userId: string, opts: { patientName: string; rating: number; reviewId: string; lang?: Lang }) =>
    dispatchNotification({
      userId,
      eventKey: "review.left",
      title: `New ${opts.rating}-star review`,
      body: `${opts.patientName} left a ${opts.rating}-star review.`,
      email: {
        subject: `New ${opts.rating}-star review from ${opts.patientName}`,
        intro: `${opts.patientName} just left a ${opts.rating}-star review on your profile.`,
      },
      data: { reviewId: opts.reviewId },
      push: { url: `/provider-dashboard?tab=reviews` },
    }),
  reviewReplied: (userId: string, opts: { providerName: string; reviewId: string; lang?: Lang }) =>
    dispatchNotification({
      userId,
      eventKey: "review.replied",
      title: t("review.reply.heading", opts.lang || "en"),
      body: `${opts.providerName} replied to your review.`,
      email: {
        subject: t("review.reply.subject", opts.lang || "en"),
        headingKey: "review.reply.heading",
        intro: `${opts.providerName} replied to your review.`,
      },
      data: { reviewId: opts.reviewId },
    }),
  ticketReplied: (userId: string, opts: { ticketId: string; subject: string; lang?: Lang }) =>
    dispatchNotification({
      userId,
      eventKey: "ticket.replied",
      title: "New reply on your support ticket",
      body: `Support replied on "${opts.subject}".`,
      data: { ticketId: opts.ticketId },
      push: { url: `/support/tickets/${opts.ticketId}` },
    }),
  chatMessage: (userId: string, opts: { senderName: string; preview: string; conversationId: string }) =>
    dispatchNotification({
      userId,
      eventKey: "chat.new_message",
      title: `New message from ${opts.senderName}`,
      body: opts.preview.slice(0, 140),
      data: { conversationId: opts.conversationId },
      push: { url: `/chat/${opts.conversationId}`, tag: `chat:${opts.conversationId}` },
    }),
  reminder: (userId: string, tier: "24h" | "1h" | "15m", opts: { date: string; time: string; appointmentId: string; lang?: Lang }) => {
    const map: Record<string, EventKey> = {
      "24h": "appointment.reminder.24h",
      "1h": "appointment.reminder.1h",
      "15m": "appointment.reminder.15m",
    };
    const headingKey = `appt.reminder${tier === "24h" ? "24" : tier === "1h" ? "1" : "15"}.heading`;
    const subjectKey = `appt.reminder${tier === "24h" ? "24" : tier === "1h" ? "1" : "15"}.subject`;
    return dispatchNotification({
      userId,
      eventKey: map[tier],
      title: t(headingKey, opts.lang || "en"),
      body: `${opts.date} at ${opts.time}`,
      email: {
        subject: t(subjectKey, opts.lang || "en"),
        headingKey,
        intro: `Your appointment is on ${opts.date} at ${opts.time}.`,
      },
      data: { appointmentId: opts.appointmentId, tier },
      urgent: tier !== "24h",
    });
  },
  postVisit: (userId: string, opts: { providerName: string; appointmentId: string; lang?: Lang }) =>
    dispatchNotification({
      userId,
      eventKey: "appointment.postvisit",
      title: t("appt.postvisit.heading", opts.lang || "en"),
      body: `How was your visit with ${opts.providerName}? Tap to leave a review.`,
      email: {
        subject: t("appt.postvisit.subject", opts.lang || "en"),
        headingKey: "appt.postvisit.heading",
        introKey: "appt.postvisit.intro",
        cta: { label: "Leave a review", url: `/patient/appointments/${opts.appointmentId}#review` },
      },
      data: { appointmentId: opts.appointmentId },
      push: { url: `/patient/appointments/${opts.appointmentId}#review` },
    }),
  broadcast: (userId: string, opts: { title: string; message: string; channels?: string[] }) =>
    dispatchNotification({
      userId,
      eventKey: "system.broadcast",
      title: opts.title,
      body: opts.message,
      email: { subject: opts.title, headingKey: "system.broadcast.heading", intro: opts.message },
    }),
  waitlistJoined: (userId: string, opts: { providerName: string; preferredDate?: string; lang?: Lang }) =>
    dispatchNotification({
      userId,
      eventKey: "waitlist.joined",
      title: "Added to waitlist",
      body: opts.preferredDate
        ? `You're on the waitlist for ${opts.providerName} on ${opts.preferredDate}. We'll notify you when a slot opens.`
        : `You're on the waitlist for ${opts.providerName}. We'll notify you when a slot opens.`,
      data: {},
      push: { url: `/waitlist` },
    }),
  packageExpired: (userId: string, opts: { packageName: string; lang?: Lang }) =>
    dispatchNotification({
      userId,
      eventKey: "package.expired",
      title: "Package expired",
      body: `Your "${opts.packageName}" package has expired. Visit the packages page to renew or purchase a new plan.`,
      email: {
        subject: `Your "${opts.packageName}" package has expired`,
        intro: `Your "${opts.packageName}" package has expired. Visit the packages page to renew or purchase a new plan.`,
      },
      data: {},
      push: { url: `/packages` },
    }),

  appointmentConfirmed: (userId: string, opts: { providerName: string; date: string; time: string; appointmentId: string; lang?: Lang }) =>
    dispatchNotification({
      userId,
      eventKey: "appointment.confirmed",
      title: t("appt.confirm.heading", opts.lang || "en"),
      body: `Your appointment with ${opts.providerName} on ${opts.date} at ${opts.time} is confirmed.`,
      email: {
        subject: t("appt.confirm.subject", opts.lang || "en"),
        headingKey: "appt.confirm.heading",
        introKey: "appt.confirm.intro",
        details: [
          { label: t("label.date", opts.lang || "en"), value: opts.date },
          { label: t("label.time", opts.lang || "en"), value: opts.time },
          { label: t("label.provider", opts.lang || "en"), value: opts.providerName },
        ],
      },
      data: { appointmentId: opts.appointmentId },
      push: { url: `/patient/appointments/${opts.appointmentId}` },
    }),

  waitlistSlotAvailable: (userId: string, opts: { providerName: string; date?: string; lang?: Lang }) =>
    dispatchNotification({
      userId,
      eventKey: "waitlist.slot_available",
      title: "Slot available",
      body: opts.date
        ? `A slot with ${opts.providerName} is now available on ${opts.date}. Book before it fills up.`
        : `A slot with ${opts.providerName} is now available. Book before it fills up.`,
      email: {
        subject: `Slot available — ${opts.providerName}`,
        intro: opts.date
          ? `Good news! A slot with ${opts.providerName} opened up on ${opts.date}.`
          : `Good news! A slot with ${opts.providerName} is now available.`,
        cta: { label: "Book now", url: `/providers` },
      },
      data: {},
      push: { url: `/providers`, tag: `waitlist:${opts.providerName}` },
      urgent: true,
    }),

  payoutStatusChanged: (userId: string, opts: { status: "approved" | "paid" | "rejected"; formattedAmount: string; notes?: string; lang?: Lang }) => {
    const eventKey: EventKey = opts.status === "approved" ? "payout.approved"
      : opts.status === "paid" ? "payout.paid"
      : "payout.rejected";
    const title = opts.status === "approved" ? "Payout request approved"
      : opts.status === "paid" ? "Payout sent"
      : "Payout request rejected";
    const body = opts.status === "approved"
      ? `Your payout request for ${opts.formattedAmount} has been approved and will be processed soon.`
      : opts.status === "paid"
      ? `Your payout of ${opts.formattedAmount} has been sent successfully.`
      : opts.notes ? `Your payout request was not approved: ${opts.notes}` : "Your payout request was not approved.";
    return dispatchNotification({
      userId,
      eventKey,
      title,
      body,
      email: { subject: title, intro: body },
      push: { url: `/provider-dashboard?tab=earnings` },
    });
  },

  invoiceOverdue: (userId: string, opts: { invoiceNumber: string; dueDate: string; formattedAmount: string; lang?: Lang }) =>
    dispatchNotification({
      userId,
      eventKey: "invoice.overdue",
      title: "Invoice overdue",
      body: `Invoice ${opts.invoiceNumber} for ${opts.formattedAmount} was due on ${opts.dueDate}. Please complete payment.`,
      email: {
        subject: `Invoice ${opts.invoiceNumber} is overdue`,
        intro: `Invoice ${opts.invoiceNumber} for ${opts.formattedAmount} was due on ${opts.dueDate} and remains unpaid.`,
        cta: { label: "View invoice", url: `/patient/appointments` },
      },
      data: { invoiceNumber: opts.invoiceNumber },
      urgent: true,
    }),

  paymentRefunded: (userId: string, opts: { formattedAmount: string; appointmentId?: string; method?: string; lang?: Lang }) =>
    dispatchNotification({
      userId,
      eventKey: "payment.refunded",
      title: "Refund processed",
      body: `Your refund of ${opts.formattedAmount} has been processed${opts.method ? ` to your ${opts.method}` : ""}.`,
      email: {
        subject: "Your refund has been processed",
        intro: `Your refund of ${opts.formattedAmount} has been processed${opts.method ? ` to your ${opts.method}` : ""}.`,
        details: [
          { label: "Amount", value: opts.formattedAmount },
          ...(opts.method ? [{ label: "Method", value: opts.method }] : []),
        ],
      },
      data: { appointmentId: opts.appointmentId },
      push: { url: opts.appointmentId ? `/patient/appointments/${opts.appointmentId}` : `/patient/appointments` },
    }),

  walletTopup: (userId: string, opts: { formattedAmount: string; newBalance: string; lang?: Lang }) =>
    dispatchNotification({
      userId,
      eventKey: "wallet.topup",
      title: "Wallet topped up",
      body: `${opts.formattedAmount} has been added to your wallet. New balance: ${opts.newBalance}.`,
      data: {},
    }),

  walletRefund: (userId: string, opts: { formattedAmount: string; reason?: string; lang?: Lang }) =>
    dispatchNotification({
      userId,
      eventKey: "wallet.refund",
      title: "Wallet credited",
      body: `${opts.formattedAmount} has been credited to your wallet${opts.reason ? ` (${opts.reason})` : ""}.`,
      data: {},
    }),

  membershipPurchased: (userId: string, opts: { packageName: string; formattedAmount: string; expiresAt?: string; lang?: Lang }) =>
    dispatchNotification({
      userId,
      eventKey: "membership.purchased",
      title: "Membership activated",
      body: `Your "${opts.packageName}" membership is now active.${opts.expiresAt ? ` Renews on ${opts.expiresAt}.` : ""}`,
      email: {
        subject: `"${opts.packageName}" membership activated`,
        intro: `Your "${opts.packageName}" membership is now active. You paid ${opts.formattedAmount}.`,
        details: [
          { label: "Plan", value: opts.packageName },
          { label: "Amount paid", value: opts.formattedAmount },
          ...(opts.expiresAt ? [{ label: "Renews", value: opts.expiresAt }] : []),
        ],
        cta: { label: "View membership", url: `/packages` },
      },
      data: {},
      push: { url: `/packages` },
    }),

  membershipExpired: (userId: string, opts: { packageName: string; lang?: Lang }) =>
    dispatchNotification({
      userId,
      eventKey: "membership.expired",
      title: "Membership expired",
      body: `Your "${opts.packageName}" membership has expired. Renew to keep your benefits.`,
      email: {
        subject: `Your "${opts.packageName}" membership has expired`,
        intro: `Your "${opts.packageName}" membership has expired. Renew now to keep enjoying your benefits.`,
        cta: { label: "Renew membership", url: `/packages` },
      },
      data: {},
      push: { url: `/packages` },
    }),

  membershipRenewed: (userId: string, opts: { packageName: string; formattedAmount: string; expiresAt?: string; lang?: Lang }) =>
    dispatchNotification({
      userId,
      eventKey: "membership.renewed",
      title: "Membership renewed",
      body: `Your "${opts.packageName}" membership has been renewed.${opts.expiresAt ? ` Valid until ${opts.expiresAt}.` : ""}`,
      email: {
        subject: `"${opts.packageName}" membership renewed`,
        intro: `Your "${opts.packageName}" membership has been renewed. You paid ${opts.formattedAmount}.`,
        details: [
          { label: "Plan", value: opts.packageName },
          { label: "Amount paid", value: opts.formattedAmount },
          ...(opts.expiresAt ? [{ label: "Valid until", value: opts.expiresAt }] : []),
        ],
      },
      data: {},
      push: { url: `/packages` },
    }),

  packageRenewalFailed: (userId: string, opts: { packageName: string; graceDays?: number; lang?: Lang }) => {
    const grace = opts.graceDays ?? 3;
    return dispatchNotification({
      userId,
      eventKey: "package.renewal_failed",
      title: `Action required: "${opts.packageName}" renewal failed`,
      body: `We couldn't auto-renew your ${opts.packageName} package due to insufficient wallet balance. Top up your wallet within ${grace} day${grace !== 1 ? "s" : ""} to keep your membership active.`,
      email: {
        subject: `Action required — "${opts.packageName}" renewal failed`,
        intro: `We were unable to auto-renew your "${opts.packageName}" package because your wallet balance was insufficient. Please top up your wallet within ${grace} day${grace !== 1 ? "s" : ""} to keep your membership benefits active.`,
        cta: { label: "Top up wallet", url: `/wallet` },
      },
      data: {},
      push: { url: `/wallet` },
    });
  },

  packagePurchased: (userId: string, opts: { packageName: string; formattedAmount: string; sessionsIncluded?: number; lang?: Lang }) =>
    dispatchNotification({
      userId,
      eventKey: "package.purchased",
      title: "Package purchased",
      body: `Your "${opts.packageName}" package is active.${opts.sessionsIncluded ? ` ${opts.sessionsIncluded} sessions included.` : ""}`,
      email: {
        subject: `"${opts.packageName}" package purchased`,
        intro: `Your "${opts.packageName}" package is now active.`,
        details: [
          { label: "Package", value: opts.packageName },
          { label: "Amount paid", value: opts.formattedAmount },
          ...(opts.sessionsIncluded ? [{ label: "Sessions", value: String(opts.sessionsIncluded) }] : []),
        ],
        cta: { label: "View package", url: `/packages` },
      },
      data: {},
      push: { url: `/packages` },
    }),
};
