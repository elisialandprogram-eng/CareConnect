/**
 * Appointment Waitlist, Slot Holds & Conflict Check
 * Extracted from appointment.routes.ts
 */

import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { db, pool } from "../db";
import { z } from "zod";
import { eq, and, desc, or, inArray } from "drizzle-orm";
import {
  insertAppointmentSchema,
  reviews,
  appointments,
  walletTransactions,
} from "@shared/schema";
import {
  authenticateToken,
  type AuthRequest,
  invalidateAuthCache,
} from "../middleware/auth";
import {
  type CountryCode,
  isAdminRole,
  isGlobalAdmin,
  isCountryCode,
  canAccessCountry,
  countryCurrency,
} from "../middleware/country";
import {
  checkConflict,
  getBufferSettings,
  BLOCKING_STATUSES,
} from "../conflictEngine";
import { dispatchNotification, notify } from "../services/notification-dispatcher";
import { trackEvent } from "../services/analyticsTracker";
import { broadcastSlotMutation } from "../lib/slotEvents";
import {
  getStripe,
  isStripeConfigured,
  createCheckoutSession,
} from "../stripe";
import {
  canTransition,
  isTerminalStatus,
  nextStatusesFor,
} from "../lib/appointmentStatus";
import {
  APPOINTMENT_ACTIONS,
  REASON_CODES,
  type AppointmentAction,
  type ActorRole,
  hoursUntilStart,
  checkAction,
} from "../lib/appointmentActions";
import { icsAttachment } from "../utils/ics";
import { generateInvoicePDF } from "../utils/invoice-gen";
import { createInvoiceForAppointment } from "../utils/invoice-helper";
import { sanitizeUser } from "../utils/sanitize";
import { getRates, fromUSDSync, toUSDSync, formatSync, formatLocal } from "../services/currency";
import { getOrCreateVideoSession } from "../services/video";
import { slog } from "../lib/logger";
import { pushToUser, isUserOnline } from "../chat/ws";
import {
  sendAppointmentEmail,
  resend,
  FROM_EMAIL,
  maybeQualifyReferralForAppointment,
  notifyWaitlistForFreedSlot,
  REFERRAL_REFERRER_REWARD,
  REFERRAL_REFERRED_REWARD,
  REFERRAL_REWARD_CURRENCY,
  WAITLIST_NOTIFY_FANOUT,
  fireAdminNotification,
} from "./shared/helpers";
import { logSystemEvent } from "../middleware/monitoring";

export function registerAppointmentWaitlistRoutes(app: Express): void {
  app.post("/api/waitlist", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        providerId: z.string().min(1),
        serviceId: z.string().optional(),
        preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        preferredStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        preferredEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        notes: z.string().max(500).optional(),
      });
      const data = schema.parse(req.body);
      // Soft-dedupe: if the same patient already has an active entry for this
      // provider+date, return the existing one instead of stacking duplicates.
      const existing = await storage.getWaitlistEntriesByPatient(req.user!.id);
      const dup = existing.find(e =>
        e.providerId === data.providerId &&
        e.status === "active" &&
        (e.preferredDate || null) === (data.preferredDate || null),
      );
      if (dup) return res.status(200).json(dup);
      const entry = await storage.createWaitlistEntry({
        patientId: req.user!.id,
        ...data,
      } as any);
      // Module 7: track event
      trackEvent({
        eventType: "waitlist_joined",
        userId: req.user!.id,
        countryCode: req.user!.countryCode ?? null,
        providerId: data.providerId,
        metadata: { preferredDate: data.preferredDate ?? null },
      });
      // Confirm to the patient that they've been added to the waitlist
      try {
        const providerWithUser = await storage.getProviderWithUser(data.providerId);
        const providerName = providerWithUser
          ? `${providerWithUser.user.firstName} ${providerWithUser.user.lastName}`.trim()
          : "your selected provider";
        notify.waitlistJoined(req.user!.id, {
          providerName,
          preferredDate: data.preferredDate,
        }).catch(e => console.error("[waitlist] join notification failed:", e));
      } catch (notifyErr) {
        console.error("[waitlist] join notification lookup failed:", notifyErr);
      }
      res.status(201).json(entry);
    } catch (error: any) {
      if (error?.issues) return res.status(400).json({ message: "Invalid waitlist entry", issues: error.issues });
      console.error("[waitlist] create failed:", error);
      res.status(500).json({ message: "Failed to join waitlist" });
    }
  });

  // Patient lists their own waitlist entries (active + history). Hydrated with
  // provider name and service name so the frontend doesn't need extra roundtrips.
  app.get("/api/waitlist/me", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const entries = await storage.getWaitlistEntriesByPatient(req.user!.id);
      const providerIds = Array.from(new Set(entries.map(e => e.providerId)));
      const serviceIds = Array.from(new Set(entries.map(e => e.serviceId).filter(Boolean))) as string[];
      const [providers, serviceRows] = await Promise.all([
        providerIds.length ? Promise.all(providerIds.map(id => storage.getProvider(id))) : Promise.resolve([]),
        serviceIds.length ? Promise.all(serviceIds.map(id => storage.getService(id))) : Promise.resolve([]),
      ]);
      const provMap = new Map(providers.filter(Boolean).map(p => [p!.id, p!]));
      const svcMap = new Map(serviceRows.filter(Boolean).map(s => [s!.id, s!]));
      res.json(entries.map(e => ({
        ...e,
        provider: provMap.get(e.providerId)
          ? { id: provMap.get(e.providerId)!.id, businessName: (provMap.get(e.providerId) as any)?.businessName ?? null }
          : null,
        service: e.serviceId && svcMap.get(e.serviceId)
          ? { id: svcMap.get(e.serviceId)!.id, name: svcMap.get(e.serviceId)!.name }
          : null,
      })));
    } catch (error) {
      console.error("[waitlist/me] failed:", error);
      res.status(500).json({ message: "Failed to load waitlist" });
    }
  });

  // Patient (or admin) removes themselves from the waitlist.
  app.delete("/api/waitlist/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const entry = await storage.getWaitlistEntry(req.params.id);
      if (!entry) return res.status(404).json({ message: "Entry not found" });
      if (entry.patientId !== req.user!.id && !isAdminRole(req.user!.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.updateWaitlistEntry(req.params.id, { status: "cancelled" } as any);
      res.json({ ok: true });
    } catch (error) {
      console.error("[waitlist/delete] failed:", error);
      res.status(500).json({ message: "Failed to leave waitlist" });
    }
  });

  // Lightweight endpoint used by the registration page to validate a referral
  // code (entered manually or via ?ref=) before submitting the signup form,
  // so the user gets immediate feedback like "Referred by Jane D. ✓".
  app.post("/api/slot-holds", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const schema = z.object({
        providerId: z.string(),
        practitionerId: z.string().optional().nullable(),
        serviceId: z.string().optional().nullable(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
        visitType: z.enum(["clinic", "home", "online"]).default("clinic"),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message });

      // Load service-level buffer settings so the hold respects service padding.
      let holdSvcBufBefore = 0;
      let holdSvcBufAfter = 0;
      if (parsed.data.serviceId) {
        try {
          const svc = await storage.getService(parsed.data.serviceId);
          holdSvcBufBefore = svc?.bufferBefore ?? 0;
          holdSvcBufAfter  = svc?.bufferAfter  ?? 0;
        } catch { /* non-fatal; fall back to 0 */ }
      }

      // Part 1 (M-07): Validate against all conflict sources BEFORE creating hold.
      // This prevents double-booking before payment — we check appointments,
      // manual blocks, and any existing active slot holds simultaneously.
      // Now also passes service-level buffers so holds cannot land inside padding windows.
      const preConflict = await checkConflict({
        providerId: parsed.data.providerId,
        practitionerId: parsed.data.practitionerId,
        date: parsed.data.date,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        visitType: parsed.data.visitType,
        serviceBufferBefore: holdSvcBufBefore,
        serviceBufferAfter:  holdSvcBufAfter,
        // If this patient already has an active hold on this exact slot (e.g.
        // they navigated back and re-selected it), their own hold must not
        // block them from re-claiming it.
        excludePatientId: userId,
      });
      if (preConflict.result.hasConflict) {
        return res.status(409).json({
          message: preConflict.result.message,
          conflictType: preConflict.result.conflictType,
          conflictId: preConflict.result.conflictId,
        });
      }

      // C21.0 — Admin schedule block-out override check.
      // If an admin has blocked any time window covering this slot, reject immediately.
      try {
        const slotStart = new Date(`${parsed.data.date}T${parsed.data.startTime}:00`);
        const slotEnd   = new Date(`${parsed.data.date}T${parsed.data.endTime}:00`);
        const overrideRes = await pool.query(
          `SELECT id, override_reason FROM provider_schedule_overrides
           WHERE provider_id = $1
             AND start_time < $3
             AND end_time   > $2
           LIMIT 1`,
          [parsed.data.providerId, slotStart.toISOString(), slotEnd.toISOString()],
        );
        if (overrideRes.rows.length > 0) {
          const reason = overrideRes.rows[0].override_reason ?? "administrative block-out";
          return res.status(409).json({
            message: `This time slot is blocked by an administrative schedule override: ${reason}`,
            conflictType: "schedule_override",
            conflictId: overrideRes.rows[0].id,
          });
        }
      } catch (ovErr: any) {
        console.warn("[slot-holds] override check failed (non-fatal):", ovErr?.message);
      }

      // L-07: Per-user active hold limit — prevents slot hoarding / abuse.
      // Configurable via MAX_ACTIVE_HOLDS_PER_USER env var (default 3).
      const MAX_ACTIVE_HOLDS = parseInt(process.env.MAX_ACTIVE_HOLDS_PER_USER ?? "3", 10);
      const activeHoldsRes = await pool.query(
        `SELECT COUNT(*) FROM appointment_slot_holds WHERE patient_id = $1 AND expires_at > NOW()`,
        [userId],
      );
      const activeHoldCount = parseInt(activeHoldsRes.rows[0]?.count ?? "0", 10);
      if (activeHoldCount >= MAX_ACTIVE_HOLDS) {
        return res.status(429).json({
          message: `You can hold at most ${MAX_ACTIVE_HOLDS} appointment slot${MAX_ACTIVE_HOLDS === 1 ? "" : "s"} at a time. Please complete or cancel an existing hold before creating a new one.`,
          activeHolds: activeHoldCount,
          maxAllowed: MAX_ACTIVE_HOLDS,
        });
      }

      // Part 4: Clean up any expired holds for this exact slot so the unique
      // index (idx_slot_holds_unique_slot) doesn't block new valid requests.
      await pool.query(
        `DELETE FROM appointment_slot_holds
         WHERE provider_id = $1
           AND COALESCE(practitioner_id, '') = $2
           AND date = $3
           AND start_time = $4
           AND end_time = $5
           AND expires_at < NOW()`,
        [
          parsed.data.providerId,
          parsed.data.practitionerId ?? "",
          parsed.data.date,
          parsed.data.startTime,
          parsed.data.endTime,
        ],
      );

      // Release any previous holds this patient has on the same provider+date
      await storage.deletePatientSlotHolds(userId, parsed.data.providerId, parsed.data.date);

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      let hold: any;
      try {
        hold = await storage.createSlotHold({
          providerId: parsed.data.providerId,
          practitionerId: parsed.data.practitionerId ?? null,
          patientId: userId,
          date: parsed.data.date,
          startTime: parsed.data.startTime,
          endTime: parsed.data.endTime,
          visitType: parsed.data.visitType as "clinic" | "home" | "online",
          expiresAt,
        });
      } catch (insertErr: any) {
        // Unique index violation means another patient just took this slot.
        // Drizzle ORM wraps the underlying pg error, so check both the direct
        // code and the nested cause (pg error is at insertErr.cause when Drizzle wraps it).
        const pgCode = insertErr?.code ?? insertErr?.cause?.code;
        if (pgCode === "23505") {
          return res.status(409).json({
            message: "This slot was just reserved by another patient. Please choose a different time.",
            conflictType: "slot_hold",
          });
        }
        throw insertErr;
      }
      // Broadcast to all /ws/slots clients: this slot is now held
      broadcastSlotMutation(parsed.data.providerId, parsed.data.date, parsed.data.startTime, false);
      return res.status(201).json(hold);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/slot-holds/:holdId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { holdId } = req.params;
      const hold = await storage.getSlotHold(holdId);
      if (!hold) return res.status(404).json({ message: "Hold not found" });
      if (hold.patientId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.deleteSlotHold(holdId);
      // Broadcast to all /ws/slots clients: this slot is now available again
      broadcastSlotMutation(hold.providerId, hold.date, hold.startTime, true);
      return res.status(204).send();
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // ── Explicit Hold Lease Release (Part 2) ─────────────────────────────────────
  // Immediately deletes an active appointment_slot_holds row so the slot
  // returns to the public marketplace.  Accepts both DELETE (explicit call from
  // the Back / Cancel buttons) and POST (navigator.sendBeacon on page unload —
  // browsers cannot send arbitrary DELETE requests via sendBeacon).
  //
  // DELETE /api/appointments/release-hold?holdId=<id>
  // POST   /api/appointments/release-hold  { holdId }

  async function handleReleaseHold(holdId: string, userId: string, res: Response) {
    try {
      const hold = await storage.getSlotHold(holdId);
      if (!hold) return res.status(404).json({ message: "Hold not found" });
      if (hold.patientId !== userId) return res.status(403).json({ message: "Forbidden" });
      await storage.deleteSlotHold(holdId);
      broadcastSlotMutation(hold.providerId, hold.date, hold.startTime, true);
      return res.status(204).send();
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  }

  app.delete("/api/appointments/release-hold", authenticateToken, async (req: AuthRequest, res: Response) => {
    const holdId = (req.query.holdId ?? req.body?.holdId) as string | undefined;
    if (!holdId) return res.status(400).json({ message: "holdId required" });
    return handleReleaseHold(holdId, req.user!.id, res);
  });

  app.post("/api/appointments/release-hold", authenticateToken, async (req: AuthRequest, res: Response) => {
    const holdId = (req.body?.holdId ?? req.query.holdId) as string | undefined;
    if (!holdId) return res.status(400).json({ message: "holdId required" });
    return handleReleaseHold(holdId, req.user!.id, res);
  });

  // ── Conflict Check endpoint ───────────────────────────────────────────────────
  // Allows the booking UI to pre-validate a slot before showing the payment page.

  app.post("/api/appointments/check-conflict", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        providerId: z.string(),
        practitionerId: z.string().optional().nullable(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
        visitType: z.enum(["clinic", "home", "online"]),
        patientLatitude: z.number().optional().nullable(),
        patientLongitude: z.number().optional().nullable(),
        excludeAppointmentId: z.string().optional(),
        excludeHoldId: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message });

      const report = await checkConflict(parsed.data as any);
      return res.json(report);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });


}
