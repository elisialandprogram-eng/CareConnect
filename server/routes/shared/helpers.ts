/**
 * Shared route helpers — extracted from server/routes.ts
 *
 * Contains:
 *  - Email (resend + sendAppointmentEmail)
 *  - Crypto (hashOtp, hashToken, generateOtp, OTP_COOLDOWN)
 *  - Referral program (REFERRAL_* constants + maybeQualifyReferralForAppointment)
 *  - Waitlist fan-out (WAITLIST_NOTIFY_FANOUT + notifyWaitlistForFreedSlot)
 *  - Admin notifications (fireAdminNotification)
 */

import { createHash } from "crypto";
import { Resend } from "resend";
import { storage } from "../../storage";
import { pool } from "../../db";
import { dispatchNotification } from "../../services/notification-dispatcher";
import { trackEvent } from "../../services/analyticsTracker";
import { formatLocal } from "../../services/currency";

// ── Email ──────────────────────────────────────────────────────────────────
export const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;
export const FROM_EMAIL = "GoldenLife <no-reply@goldenlife.health>";

export async function sendAppointmentEmail(opts: {
  to: string;
  subject: string;
  heading: string;
  intro: string;
  details: { label: string; value: string }[];
  cta?: string;
}) {
  if (!resend) return;
  try {
    const detailRows = opts.details
      .map(
        (d) =>
          `<p style="margin: 5px 0;"><strong>${d.label}:</strong> ${d.value}</p>`
      )
      .join("");
    await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.to,
      subject: opts.subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a;">${opts.heading}</h2>
          <p>${opts.intro}</p>
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
            ${detailRows}
          </div>
          ${opts.cta ? `<p>${opts.cta}</p>` : ""}
          <p style="color: #64748b; font-size: 0.875rem; margin-top: 30px;">
            Thank you for choosing GoldenLife.<br>
            <em>This is an automated message, please do not reply.</em>
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error(`Failed to send "${opts.subject}" email:`, err);
  }
}

// ── Crypto helpers ─────────────────────────────────────────────────────────
export const hashOtp   = (otp: string) => createHash("sha256").update(otp).digest("hex");
export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");
export const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

export const OTP_COOLDOWN = 60 * 1000; // 60 s — also enforced DB-side

// ── Referral program ───────────────────────────────────────────────────────
export const REFERRAL_REFERRER_REWARD = Number(
  process.env.REFERRAL_REFERRER_REWARD || 5
);
export const REFERRAL_REFERRED_REWARD = Number(
  process.env.REFERRAL_REFERRED_REWARD || 5
);
export const REFERRAL_REWARD_CURRENCY =
  process.env.REFERRAL_REWARD_CURRENCY || "USD";

/**
 * Promote a pending referral to "qualified" when the referred patient
 * finishes their first paid appointment, and credit both wallets.
 * Safe to call multiple times — guarded by status='pending' in the UPDATE.
 */
export async function maybeQualifyReferralForAppointment(
  appt: any
): Promise<void> {
  if (!appt?.patientId || !appt?.id) return;
  const referral = await storage.getReferralByReferredUser(appt.patientId);
  if (!referral || referral.status !== "pending") return;

  const updated = await storage.qualifyReferral(appt.patientId, {
    appointmentId: appt.id,
    rewardAmount: REFERRAL_REFERRER_REWARD,
    rewardCurrency: REFERRAL_REWARD_CURRENCY,
  });
  if (!updated || updated.status !== "qualified") return;

  const tasks: Promise<any>[] = [];
  if (REFERRAL_REFERRER_REWARD > 0) {
    tasks.push(
      storage
        .topUpWallet(referral.referrerUserId, REFERRAL_REFERRER_REWARD, {
          description: "Referral reward — friend completed first appointment",
          referenceType: "referral",
          referenceId: referral.id,
          idempotencyKey: `referral-referrer:${referral.id}`,
        })
        .catch((e) =>
          console.error("[referral] referrer credit failed:", e?.message)
        )
    );
    tasks.push(
      storage
        .createUserNotification({
          userId: referral.referrerUserId,
          type: "wallet",
          title: "Referral reward earned",
          message: `Your friend just completed their first appointment! ${formatLocal(REFERRAL_REFERRER_REWARD, REFERRAL_REWARD_CURRENCY)} has been credited to your wallet.`,
          isRead: false,
        } as any)
        .catch(() => {})
    );
  }
  if (REFERRAL_REFERRED_REWARD > 0) {
    tasks.push(
      storage
        .topUpWallet(appt.patientId, REFERRAL_REFERRED_REWARD, {
          description: "Welcome bonus — referred by a friend",
          referenceType: "referral",
          referenceId: referral.id,
          idempotencyKey: `referral-referred:${referral.id}`,
        })
        .catch((e) =>
          console.error("[referral] referred credit failed:", e?.message)
        )
    );
    tasks.push(
      storage
        .createUserNotification({
          userId: appt.patientId,
          type: "wallet",
          title: "Welcome bonus credited",
          message: `Thanks for joining! ${formatLocal(REFERRAL_REFERRED_REWARD, REFERRAL_REWARD_CURRENCY)} has been credited to your wallet as a referral bonus.`,
          isRead: false,
        } as any)
        .catch(() => {})
    );
  }
  await Promise.all(tasks);

  // Analytics + admin notification (fire-and-forget, never block the caller)
  trackEvent({
    eventType: "referral_converted",
    userId: appt.patientId,
    metadata: {
      referralId: referral.id,
      referrerUserId: referral.referrerUserId,
      appointmentId: appt.id,
      referrerReward: REFERRAL_REFERRER_REWARD,
      referredReward: REFERRAL_REFERRED_REWARD,
      currency: REFERRAL_REWARD_CURRENCY,
    },
  }).catch(() => {});

  fireAdminNotification(
    "referral_qualified",
    "Referral converted",
    `A referred patient completed their first appointment. Referrer credited ${REFERRAL_REWARD_CURRENCY} ${REFERRAL_REFERRER_REWARD}, referred patient credited ${REFERRAL_REWARD_CURRENCY} ${REFERRAL_REFERRED_REWARD}.`,
    {
      severity: "info",
      metadata: {
        referralId: referral.id,
        referrerUserId: referral.referrerUserId,
        referredUserId: appt.patientId,
        appointmentId: appt.id,
      },
    }
  ).catch(() => {});
}

// ── Waitlist fan-out ───────────────────────────────────────────────────────
export const WAITLIST_NOTIFY_FANOUT = Number(
  process.env.WAITLIST_NOTIFY_FANOUT || 3
);

/**
 * Notify up to WAITLIST_NOTIFY_FANOUT patients when a slot is freed.
 * Each notified entry is marked status='notified' to prevent duplicate pings.
 */
export async function notifyWaitlistForFreedSlot(opts: {
  providerId: string;
  date: string;
  startTime: string;
  endTime: string;
}): Promise<number> {
  try {
    const off = await storage.isProviderOnTimeOff(opts.providerId, opts.date);
    if (off) return 0;
  } catch {
    /* non-fatal */
  }

  const matches = await storage.getActiveWaitlistEntries({
    providerId: opts.providerId,
    date: opts.date,
    slotStartTime: opts.startTime,
    limit: WAITLIST_NOTIFY_FANOUT,
  });
  if (!matches.length) return 0;

  const providerRow = await storage.getProvider(opts.providerId).catch(() => null);
  const providerName =
    (providerRow as any)?.businessName || "your preferred provider";

  let sent = 0;
  for (const entry of matches) {
    try {
      await dispatchNotification({
        userId: entry.patientId,
        eventKey: "waitlist.slot_available",
        title: `A slot just opened with ${providerName}`,
        body: `Good news — a slot you were waiting for is now available on ${opts.date} at ${opts.startTime}. Tap to book before someone else grabs it.`,
        data: {
          providerId: opts.providerId,
          date: opts.date,
          startTime: opts.startTime,
          endTime: opts.endTime,
          waitlistEntryId: entry.id,
        },
      });
      await storage.updateWaitlistEntry(entry.id, {
        status: "notified",
        notifiedAt: new Date(),
      } as any);
      sent++;
    } catch (e) {
      console.error("[waitlist] notify failed for entry", entry.id, e);
    }
  }

  if (sent > 0) {
    trackEvent({
      eventType: "waitlist_fulfilled",
      providerId: opts.providerId,
      metadata: { notified: sent, date: opts.date, startTime: opts.startTime },
    }).catch(() => {});
  }

  return sent;
}

// ── Admin notification helper ──────────────────────────────────────────────
// Fire-and-forget: inserts a row into admin_notifications without blocking
// the request. Wrapped in try/catch so transient DB issues never surface.
export async function fireAdminNotification(
  type: string,
  title: string,
  message: string,
  opts: {
    providerId?: string | null;
    providerName?: string | null;
    countryCode?: string | null;
    severity?: "info" | "warning" | "critical";
    actionType?: string;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO admin_notifications
         (type, severity, title, message, provider_id, provider_name, country_code, action_type, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        type,
        opts.severity ?? "info",
        title,
        message,
        opts.providerId ?? null,
        opts.providerName ?? null,
        opts.countryCode ?? null,
        opts.actionType ?? type,
        opts.metadata ? JSON.stringify(opts.metadata) : null,
      ]
    );
  } catch (err: any) {
    console.warn("[admin-notif]", err.message);
  }
}
