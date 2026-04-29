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
  | "review.replied"
  | "chat.new_message"
  | "ticket.replied"
  | "system.broadcast";

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
  "system.broadcast":             { inApp: true,  email: true,  sms: false, whatsapp: false, push: true  },
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
  eventKey: string,
  channel: string,
  status: string,
  externalId?: string,
  errorMessage?: string,
  payload?: any,
) {
  try {
    await db.insert(notificationDeliveryLogs).values({
      userId,
      eventKey,
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
  const lang: Lang = normalizeLang(prefs.language || user.languagePreference);
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
  paymentReceived: (userId: string, opts: { amount: string; currency: string; appointmentId: string; lang?: Lang }) =>
    dispatchNotification({
      userId,
      eventKey: "payment.received",
      title: t("appt.payment.heading", opts.lang || "en"),
      body: `We received your payment of ${opts.amount} ${opts.currency}.`,
      email: {
        subject: t("appt.payment.subject", opts.lang || "en"),
        headingKey: "appt.payment.heading",
        intro: `We received your payment of ${opts.amount} ${opts.currency}.`,
        details: [
          { label: t("label.amount", opts.lang || "en"), value: `${opts.amount} ${opts.currency}` },
        ],
      },
      data: { appointmentId: opts.appointmentId },
    }),
  reviewLeft: (userId: string, opts: { patientName: string; rating: number; reviewId: string; lang?: Lang }) =>
    dispatchNotification({
      userId,
      eventKey: "review.replied",
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
};
