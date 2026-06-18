/**
 * Appointment routes
 * Routes: 16 | Owner: appointments | Auth: required (mostly) | Country isolation: enforced inline
 *
 * GET  /api/appointments/patient
 * GET  /api/appointments/provider
 * GET  /api/appointments/:id
 * PATCH /api/appointments/:id
 * POST /api/appointments
 * PATCH /api/appointments/:id/status
 * PATCH /api/appointments/:id/payment-status
 * POST /api/appointments/cleanup
 * POST /api/appointments/:id/action
 * GET  /api/appointments/:id/events
 * GET  /api/appointments/:id/action-quote
 * POST /api/waitlist
 * GET  /api/waitlist/me
 * DELETE /api/waitlist/:id
 * POST /api/slot-holds
 * DELETE /api/slot-holds/:holdId
 * POST /api/appointments/check-conflict
 */

import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { db, pool } from "../db";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import {
  reviews,
  appointments,
  walletTransactions,
} from "@shared/schema";
import {
  authenticateToken,
  type AuthRequest,
  invalidateAuthCache,
} from "../middleware/auth";
import { bookingLimiter, slotLimiter } from "../middleware/rateLimiter";
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
import { runRevenueEngine, type RevenueEngineResult } from "../lib/revenue-engine";
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
  PATIENT_CANCEL_REASON_CODES,
  PROVIDER_CANCEL_REASON_CODES,
  PARTIAL_REFUND_PERCENT,
  type AppointmentAction,
  type ActorRole,
  type RefundRule,
  hoursUntilStart,
  quoteRefundWithRule,
  checkAction,
} from "../lib/appointmentActions";
import { icsAttachment } from "../utils/ics";
import { generateInvoicePDF } from "../utils/invoice-gen";
import { createInvoiceForAppointment } from "../utils/invoice-helper";
import { sanitizeUser } from "../utils/sanitize";
import { getRates, fromUSDSync, toUSDSync, formatSync, formatLocal } from "../services/currency";
import { round2 } from "../lib/math";
import { checkHomeVisitCoverage, isValidCoordinates } from "../services/location.service";
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
import { localToUTC, getProviderTimezone } from "../lib/tzUtils";

// Appointment idempotency TTL: 10 minutes. Keys are stored in the DB
// (idempotency_keys table) so they survive restarts and work across instances.
import { registerAppointmentWaitlistRoutes } from "./appointment-waitlist.routes";
import { registerAppointmentResourcesRoutes } from "./appointment-resources.routes";
import { isProviderApproved } from "../lib/provider-visibility";
const APPT_IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

export function registerAppointmentRoutes(app: Express): void {
  app.get("/api/appointments/patient", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const appointments = await storage.getAppointmentsByPatient(req.user!.id);

      // Batch-load review existence in a single query to avoid N+1 / pool exhaustion.
      const aptIds = appointments.map(a => a.id);
      const reviewedSet = new Set<string>();
      if (aptIds.length > 0) {
        const reviewed = await db
          .select({ appointmentId: reviews.appointmentId })
          .from(reviews)
          .where(inArray(reviews.appointmentId, aptIds));
        for (const r of reviewed) {
          if (r.appointmentId) reviewedSet.add(r.appointmentId);
        }
      }
      const appointmentsWithReviewStatus = appointments.map(apt => ({
        ...apt,
        hasReview: reviewedSet.has(apt.id),
      }));

      res.json(appointmentsWithReviewStatus);
    } catch (error) {
      console.error("Get patient appointments error:", error);
      res.status(500).json({ message: "Failed to get appointments" });
    }
  });

  // Get provider appointments
  app.get("/api/appointments/provider", authenticateToken, async (req: AuthRequest, res: Response) => {
    const t0 = Date.now();
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      const t1 = Date.now();
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const appointments = await storage.getAppointmentsByProvider(provider.id);
      const t2 = Date.now();
      res.json(appointments);
      const t3 = Date.now();
      if (t3 - t0 > 1000) {
        console.warn(
          `[slow] /api/appointments/provider total=${t3 - t0}ms ` +
          `getProvider=${t1 - t0}ms getAppointments=${t2 - t1}ms ` +
          `serialize=${t3 - t2}ms rows=${appointments.length}`
        );
      }
    } catch (error) {
      console.error("Get provider appointments error:", error);
      res.status(500).json({ message: "Failed to get appointments" });
    }
  });

  // Get a single appointment with full details (patient owner / provider / admin only)
  app.get("/api/appointments/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const appointment = await storage.getAppointmentWithDetails(req.params.id);
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      const role = req.user?.role;
      // Tenancy + ownership: admins must be able to access the appointment's
      // country, patients must own it, providers must be the assigned one.
      // Cross-country / cross-tenant lookups return 404 (not 403) so we never
      // leak the existence of another tenant's appointment.
      if (isAdminRole(role)) {
        if (!canAccessCountry(req.user, (appointment as any).countryCode)) {
          return res.status(404).json({ message: "Appointment not found" });
        }
      } else if (role === "patient") {
        if (appointment.patientId !== req.user!.id) {
          return res.status(404).json({ message: "Appointment not found" });
        }
      } else if (role === "provider") {
        const prov = await storage.getProviderByUserId(req.user!.id);
        if (!prov || prov.id !== appointment.providerId) {
          return res.status(404).json({ message: "Appointment not found" });
        }
      } else {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Attach existing invoice id (if any) so the client can offer a download link
      let invoiceId: string | null = null;
      try {
        const inv = await storage.getInvoiceByAppointment(appointment.id);
        invoiceId = inv?.id ?? null;
      } catch {}

      // Has the patient already left a review? Lets the UI hide "Leave Review".
      let hasReview = false;
      try {
        const ex = await storage.getReviewByAppointment(appointment.id);
        hasReview = !!ex;
      } catch {}

      // Attach the sign-off code for in_progress appointments.
      // The patient needs to see their code; the provider needs to enter it.
      let signOffCode: string | null = null;
      if (appointment.status === "in_progress") {
        try {
          const codeRow = await pool.query(
            `SELECT sign_off_code FROM appointments WHERE id = $1 LIMIT 1`,
            [appointment.id],
          );
          signOffCode = codeRow.rows[0]?.sign_off_code ?? null;
        } catch { /* non-fatal */ }
      }

      // For providers: attach sanitised patient contact info so they can reach
      // the patient without exposing the full user record.
      let patientContact: Record<string, string | null> | null = null;
      if (role === "provider" || isAdminRole(role)) {
        const pat = (appointment as any).patient;
        if (pat) {
          patientContact = {
            firstName: pat.firstName ?? null,
            lastName: pat.lastName ?? null,
            mobileNumber: pat.mobileNumber ?? null,
            phone: pat.phone ?? null,
            emergencyContactName: pat.emergencyContactName ?? null,
            emergencyContactPhone: pat.emergencyContactPhone ?? null,
            emergencyContactRelation: pat.emergencyContactRelation ?? null,
          };
        }
      }

      res.json({
        ...appointment,
        invoiceId,
        hasReview,
        ...(signOffCode ? { signOffCode } : {}),
        ...(patientContact ? { patientContact } : {}),
      });
    } catch (error) {
      console.error("Get appointment by id error:", error);
      res.status(500).json({ message: "Failed to get appointment" });
    }
  });
  app.patch("/api/appointments/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const existing = await storage.getAppointment(req.params.id);
      if (!existing) return res.status(404).json({ message: "Appointment not found" });

      // Authorisation: admin OR provider owning the appointment
      if (!isAdminRole(req.user?.role)) {
        if (req.user?.role !== "provider") return res.status(403).json({ message: "Forbidden" });
        const provider = await storage.getProviderByUserId(req.user.id);
        if (!provider || provider.id !== existing.providerId) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }

      const { date, startTime, endTime, status, privateNote, notes } = req.body as any;
      if (date || startTime || endTime) {
        return res.status(400).json({
          message: "Date/time changes must use POST /api/appointments/:id/action with action=reschedule.",
        });
      }
      if (status) {
        return res.status(400).json({
          message: "Status changes must use PATCH /api/appointments/:id/status or POST /api/appointments/:id/action.",
        });
      }

      const allowed: any = {};
      if (typeof privateNote === "string") allowed.privateNote = privateNote;
      if (typeof notes === "string") allowed.notes = notes;

      if (Object.keys(allowed).length === 0) {
        return res.status(400).json({ message: "No editable fields supplied." });
      }

      const updated = await storage.updateAppointment(req.params.id, allowed);
      res.json(updated);
    } catch (error) {
      console.error("[PATCH /api/appointments/:id] error:", error);
      res.status(500).json({ message: "Failed to update appointment" });
    }
  });

  // Setup provider profile
  app.post("/api/appointments", authenticateToken, bookingLimiter, slotLimiter, async (req: AuthRequest, res: Response) => {
    const _bookingStart = Date.now(); // cold-start / slow-path timing
    try {
      const { providerId, serviceId, practitionerId, date, startTime, endTime, visitType, paymentMethod, notes, patientAddress, patientLatitude, patientLongitude, totalAmount, promoCode, giftCardCode, contactMobile, familyMemberId, intakeResponses, consentTerms, consentData } = req.body;
      // Multi-session bookings carry an array of additional slots; each one
      // becomes a child appointment that shares the parent's payment.
      const additionalSlotsRaw = Array.isArray((req.body as any).additionalSlots)
        ? (req.body as any).additionalSlots
        : [];
      const additionalSlots: Array<{ date: string; startTime: string; endTime: string }> = additionalSlotsRaw
        .map((s: any) => ({
          date: typeof s?.date === "string" ? s.date : "",
          startTime: typeof s?.startTime === "string" ? s.startTime : "",
          endTime: typeof s?.endTime === "string" ? s.endTime : "",
        }))
        .filter((s: any) => s.date && s.startTime && s.endTime);
      const userId = req.user?.id;

      // Idempotency: if the client retries with the same Idempotency-Key within
      // the TTL window, return the stored response instead of creating a duplicate.
      // DB-backed so it works across multiple server instances.
      const idemKey = req.header("Idempotency-Key") || req.header("idempotency-key");
      const idemCacheKey = idemKey && userId ? `${userId}:${idemKey}` : null;
      if (idemCacheKey) {
        const cached = await storage.checkIdempotencyKey(idemCacheKey, "appointment");
        if (cached) return res.status(cached.status).json(cached.body);
      }

      // Validate family member ownership if provided
      let validatedFamilyMemberId: string | null = null;
      if (familyMemberId) {
        const member = await storage.getFamilyMember(familyMemberId);
        if (!member || member.primaryUserId !== userId) {
          return res.status(403).json({ message: "Family member not found or not yours." });
        }
        validatedFamilyMemberId = member.id;
      }

      // Log appointment request for debugging but keep it concise to avoid large base64 strings
      console.log(`Received appointment request for provider ${providerId} on ${date}`);

      if (!userId) {
        console.log("Booking failed: User not authenticated");
        return res.status(401).json({ message: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user?.isEmailVerified) {
        console.log("Booking failed: Email not verified for user", userId);
        return res.status(403).json({ message: "Email verification required to book" });
      }

      // Server-side consent guard: patient must have accepted terms & privacy policy.
      // If the booking request carries consentTerms/consentData=true (checked in the
      // booking canvas), persist those records now so the check below passes.
      if (user.role === "patient") {
        if (consentTerms === true || consentTerms === "true") {
          await storage.createPatientConsent({
            userId,
            consentType: "terms",
            isAccepted: true,
            language: "en",
            consentTextVersion: "1.0",
            ipAddress: req.ip ?? null,
            userAgent: req.headers["user-agent"] ?? null,
          } as any).catch(() => {});
        }
        if (consentData === true || consentData === "true") {
          await storage.createPatientConsent({
            userId,
            consentType: "privacy",
            isAccepted: true,
            language: "en",
            consentTextVersion: "1.0",
            ipAddress: req.ip ?? null,
            userAgent: req.headers["user-agent"] ?? null,
          } as any).catch(() => {});
        }

        const consents = await storage.getPatientConsents(userId);
        const accepted = consents.filter(c => c.isAccepted).map(c => c.consentType);
        const missingTerms = !accepted.includes("terms");
        const missingPrivacy = !accepted.includes("privacy");
        if (missingTerms || missingPrivacy) {
          return res.status(403).json({
            message: "You must accept the Terms of Service and Privacy Policy before booking.",
            missingConsents: [...(missingTerms ? ["terms"] : []), ...(missingPrivacy ? ["privacy"] : [])],
          });
        }
      }

      // Reject malformed date/time (format-only validation — TZ-aware past check
      // runs below after the provider is loaded so we know their timezone).
      try {
        const slotDate = new Date(`${date}T${startTime || "00:00"}:00Z`);
        if (isNaN(slotDate.getTime())) {
          return res.status(400).json({ message: "Invalid date or time." });
        }
      } catch {
        return res.status(400).json({ message: "Invalid date or time." });
      }

      // Get provider to calculate fee if not provided
      const provider = await storage.getProvider(providerId);
      if (!provider) {
        console.log("Booking failed: Provider not found", providerId);
        return res.status(404).json({ message: "Provider not found" });
      }

      // TZ-aware past-slot guard: now that we have the provider we can convert
      // the requested slot wall-clock time to UTC for an authoritative comparison.
      try {
        const provTzEarly = await getProviderTimezone(providerId, (provider as any).userId);
        const slotUtcEarly = localToUTC(date, startTime || "00:00", provTzEarly);
        if (!isNaN(slotUtcEarly.getTime()) && slotUtcEarly.getTime() < Date.now() - 60_000) {
          return res.status(400).json({ message: "You cannot book an appointment in the past." });
        }
      } catch { /* non-fatal: format already validated above */ }

      // Country isolation: a patient can only book providers in their own
      // country. We deliberately use the same 404 message as "not found" to
      // avoid leaking the existence of cross-country providers.
      const providerCountry = (provider as any).countryCode as CountryCode | undefined;
      const patientCountry = req.user!.countryCode;
      if (!providerCountry || !patientCountry || providerCountry !== patientCountry) {
        console.log(`Booking refused: country mismatch patient=${patientCountry} provider=${providerCountry}`);
        return res.status(404).json({ message: "Provider not found" });
      }

      // Approval gate: only fully approved providers may receive new bookings.
      const providerStatus = (provider as any).status;
      if (providerStatus !== "approved" && providerStatus !== "active") {
        return res.status(400).json({ message: "This provider is not currently accepting appointments." });
      }

      // ── Payment method availability gate ──────────────────────────────────
      // Async payment methods (bank_transfer, etc.) must be explicitly enabled
      // in the payment_providers registry before a booking is accepted with them.
      // Card, wallet, and cash are first-party methods — always allowed.
      const FIRST_PARTY_METHODS = ["card", "wallet", "cash"];
      if (paymentMethod && !FIRST_PARTY_METHODS.includes(paymentMethod)) {
        try {
          const pmRes = await pool.query<{ is_enabled: boolean; country_codes: string[] | null }>(
            `SELECT is_enabled, country_codes FROM payment_providers WHERE provider_key = $1 LIMIT 1`,
            [paymentMethod],
          );
          const pm = pmRes.rows[0];
          if (!pm) {
            return res.status(400).json({
              message: `Payment method "${paymentMethod}" is not recognised. Please select a different payment method.`,
            });
          }
          if (!pm.is_enabled) {
            return res.status(400).json({
              message: `Payment method "${paymentMethod}" is currently disabled on this platform. Please select a different payment method.`,
            });
          }
          if (
            Array.isArray(pm.country_codes) &&
            pm.country_codes.length > 0 &&
            !pm.country_codes.includes(String(providerCountry))
          ) {
            return res.status(400).json({
              message: `Payment method "${paymentMethod}" is not available in this region. Please select a different payment method.`,
            });
          }
        } catch (pmErr: any) {
          console.warn("[booking] payment-method availability check failed:", pmErr?.message);
          // Non-fatal: allow booking to proceed; method will remain pending.
        }
      }

      // Vacation mode: refuse if the provider has an active time-off range
      // covering the requested date OR any of the additional session dates.
      try {
        const datesToCheck = [date, ...additionalSlots.map(s => s.date)];
        for (const d of datesToCheck) {
          const off = await storage.isProviderOnTimeOff(providerId, d);
          if (off) {
            const sameDay = off.startDate === off.endDate;
            const range = sameDay ? off.startDate : `${off.startDate} – ${off.endDate}`;
            return res.status(400).json({
              message: `This provider is unavailable on ${d} (time off ${range})${off.reason ? `: ${off.reason}` : ""}. Please pick another date.`,
            });
          }
        }
      } catch (offErr) {
        console.error("Time-off check failed (continuing):", offErr);
      }

      // Full conflict check: buffers + manual blocks + slot holds
      try {
        // Pull per-service buffers so the conflict window respects them.
        let svcBufBefore = 0;
        let svcBufAfter = 0;
        if (serviceId) {
          try {
            const svc = await storage.getService(serviceId);
            svcBufBefore = svc?.bufferBefore ?? 0;
            svcBufAfter = svc?.bufferAfter ?? 0;
          } catch { /* non-fatal */ }
        }
        const conflictReport = await checkConflict({
          providerId,
          practitionerId: practitionerId ?? null,
          date,
          startTime,
          endTime,
          visitType: visitType as "clinic" | "home" | "online",
          patientLatitude: patientLatitude ?? null,
          patientLongitude: patientLongitude ?? null,
          serviceBufferBefore: svcBufBefore,
          serviceBufferAfter: svcBufAfter,
          // A patient's own slot-hold must NEVER block their own booking.
          // The hold exists to prevent OTHER patients from taking the slot
          // while this patient is in checkout — not to block the holder.
          excludePatientId: userId,
        });
        if (conflictReport.result.hasConflict) {
          return res.status(409).json({
            message: conflictReport.result.message,
            conflictType: conflictReport.result.conflictType,
            effectiveStart: conflictReport.result.effectiveStart,
            effectiveEnd: conflictReport.result.effectiveEnd,
          });
        }
      } catch (conflictErr) {
        console.error("Conflict check failed (fail-closed):", conflictErr);
        return res.status(503).json({
          error: "Scheduling system conflict engine is temporarily busy. Please retry in a few moments.",
        });
      }

      // Prevent the same patient from booking themselves twice into the same slot.
      // Use a whitelist of ACTIVE statuses — cancelled/rejected/completed/no_show
      // appointments must NOT block re-booking the same slot.
      try {
        const patientAppointments = await storage.getAppointmentsByPatient(userId);
        const ACTIVE_STATUSES = new Set(["pending", "approved", "confirmed", "in_progress"]);
        const dup = patientAppointments.find(a =>
          a.providerId === providerId &&
          a.date === date &&
          a.startTime === startTime &&
          ACTIVE_STATUSES.has(a.status)
        );
        if (dup) {
          return res.status(409).json({ message: "You already have an appointment at this time." });
        }
      } catch (dupErr) {
        console.error("Duplicate check failed (continuing):", dupErr);
      }

      // Phase 8 — Daily booking limit.
      // If the provider has set max_daily_appointments, count active bookings for
      // this date and reject if the cap is already reached.
      try {
        const maxDaily = (provider as any).maxPatientsPerDay;
        if (maxDaily && maxDaily > 0) {
          const { rows: limitRows } = await pool.query(
            `SELECT COUNT(*) AS cnt FROM appointments
             WHERE provider_id = $1 AND date = $2
               AND status::text = ANY(ARRAY['pending','approved','confirmed','in_progress'])`,
            [providerId, date],
          );
          const todayCount = parseInt(limitRows[0]?.cnt ?? "0", 10);
          if (todayCount >= maxDaily) {
            return res.status(409).json({
              message: `This provider can only accept ${maxDaily} appointment${maxDaily === 1 ? "" : "s"} per day and is fully booked on ${date}. Please choose a different date.`,
              errorCode: "DAILY_LIMIT_REACHED",
              maxPatientsPerDay: maxDaily,
              date,
            });
          }
        }
      } catch (limitErr) {
        console.error("Daily limit check failed (continuing):", limitErr);
      }

      // Phase 8 — Minimum gap between appointments (burnout protection).
      // If the provider has set min_gap_minutes > 0, ensure no existing appointment
      // ends within min_gap_minutes before this slot starts, or starts within
      // min_gap_minutes after this slot ends.
      try {
        const minGap = (provider as any).minGapMinutes ?? 0;
        if (minGap > 0 && startTime && endTime) {
          const toMinsLocal = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
          const reqStart = toMinsLocal(startTime);
          const reqEnd = toMinsLocal(endTime);
          const { rows: gapRows } = await pool.query(
            `SELECT start_time, end_time FROM appointments
             WHERE provider_id = $1 AND date = $2
               AND status::text = ANY(ARRAY['pending','approved','confirmed','in_progress'])`,
            [providerId, date],
          );
          for (const r of gapRows) {
            const s = toMinsLocal(r.start_time);
            const e = toMinsLocal(r.end_time);
            if (Math.abs(reqStart - e) < minGap || Math.abs(s - reqEnd) < minGap) {
              return res.status(409).json({
                message: `This provider requires a minimum ${minGap}-minute gap between appointments. Please choose a different time.`,
                errorCode: "MIN_GAP_VIOLATION",
              });
            }
          }
        }
      } catch (gapErr) {
        console.error("Min-gap check failed (continuing):", gapErr);
      }

      // ── Pricing: use centralised computeFinalPrice() ──
      let svcRecord: any = null;
      let subRecord: any = null;
      let practitionerFee: number | null = null;
      let appliedPromoCode: string | null = null;
      // H-10: defer promo usedCount increment until AFTER appointment is saved
      let pendingPromoIncrement: { id: string; newCount: number } | null = null;

      // Practitioner is required when the service has at least one assigned
      // active AND approved practitioner. If none are assigned the booking
      // continues with no practitioner (legacy services that haven't onboarded
      // staff yet). Only admin-approved practitioners are bookable.
      if (serviceId) {
        const sps = await storage.getServicePractitioners(serviceId);
        const activeSps = sps.filter(p => p.isActive !== false && isProviderApproved((p.practitioner as any).status));
        if (activeSps.length > 0) {
          if (!practitionerId) {
            return res.status(400).json({ message: "Please choose a practitioner for this service." });
          }
          const sp = activeSps.find(p => p.practitionerId === practitionerId);
          if (!sp) {
            return res.status(400).json({ message: "Practitioner not assigned to this service" });
          }
          if (sp.fee) practitionerFee = Number(sp.fee);
        } else if (practitionerId) {
          return res.status(400).json({ message: "This service has no assigned practitioners" });
        }
      }

      // Fetch service + sub-service for full pricing data, AND enforce that
      // the service is one the admin has assigned to this provider and is
      // currently active. Booking is only allowed against assigned + active
      // services — never against another provider's row, an inactive row, or
      // an archived/soft-deleted row.
      try {
        if (serviceId) {
          svcRecord = await storage.getService(serviceId);
          if (!svcRecord) {
            return res.status(404).json({ message: "Service not found" });
          }
          if (svcRecord.providerId !== providerId) {
            return res.status(400).json({ message: "Selected service does not belong to this provider." });
          }
          // Defense-in-depth: explicit country tenancy check on the service
          // row. Provider tenancy was already validated above; this guards
          // against any future drift between provider.country_code and
          // services.country_code.
          if ((svcRecord as any).countryCode && (svcRecord as any).countryCode !== patientCountry) {
            return res.status(404).json({ message: "Service not found" });
          }
          if (svcRecord.deletedAt) {
            return res.status(400).json({ message: "This service is no longer offered." });
          }
          if (!svcRecord.isActive) {
            return res.status(400).json({ message: "This service is currently paused. Please pick a different one." });
          }
          // Provider has staged edits awaiting admin review — service is locked
          // for booking until the changes are approved or rejected. Without this
          // guard a patient could book at the old price right before the new
          // price is applied.
          if ((svcRecord as any).pendingChangeStatus === "pending") {
            return res.status(400).json({
              message: "This service is being updated by the provider and is temporarily unavailable. Please try again shortly.",
            });
          }
          if (svcRecord.subServiceId) {
            subRecord = await storage.getSubService(svcRecord.subServiceId);
          }

          // Enforce service.locationMode against the requested visit type.
          const svcLocMode = (svcRecord as any).locationMode || "both";
          const _clinicModes = new Set(["clinic_only", "clinic_online", "both", "all"]);
          const _homeModes   = new Set(["home_only",   "home_online",   "both", "all"]);
          const _onlineModes = new Set(["online_only", "clinic_online", "home_online", "all"]);
          if (visitType === "clinic" && !_clinicModes.has(svcLocMode)) {
            return res.status(400).json({ message: "This service is not available at the clinic." });
          }
          if (visitType === "home" && !_homeModes.has(svcLocMode)) {
            return res.status(400).json({ message: "This service is not available as a home visit." });
          }
          if (visitType === "online" && !_onlineModes.has(svcLocMode)) {
            return res.status(400).json({ message: "This service is not available online." });
          }
        }
      } catch (e) {
        console.error("[booking] service/sub lookup failed:", e);
      }

      // Mandatory clinic address: an in-clinic visit cannot be booked unless
      // the provider has set their primary clinic location. Surface a clear
      // message so the patient knows to pick a different visit type.
      if (visitType === "clinic" && !((provider as any).primaryServiceLocation || "").trim()) {
        return res.status(400).json({
          message: "This provider has not set a clinic address yet. Please choose a home or online visit, or pick another provider.",
        });
      }

      // Home visit coverage guard — enforce radius if provider has one set.
      // Only runs when: visit is home-type AND provider has a non-zero radius AND
      // both provider and patient coordinates are available.
      if (visitType === "home") {
        const provRadiusKm =
          parseInt((provider as any).maxTravelDistanceKm ?? "0") ||
          parseInt((provider as any).serviceRadiusKm ?? "0") ||
          0;
        const provLat = parseFloat((provider as any).latitude ?? "0");
        const provLng = parseFloat((provider as any).longitude ?? "0");
        const pLat = typeof patientLatitude === "number" ? patientLatitude : parseFloat(String(patientLatitude ?? "0"));
        const pLng = typeof patientLongitude === "number" ? patientLongitude : parseFloat(String(patientLongitude ?? "0"));

        if (
          provRadiusKm > 0 &&
          isValidCoordinates(provLat, provLng) &&
          isValidCoordinates(pLat, pLng)
        ) {
          const coverage = checkHomeVisitCoverage(
            { latitude: pLat, longitude: pLng },
            { latitude: provLat, longitude: provLng },
            provRadiusKm,
          );
          if (!coverage.isEligible) {
            return res.status(400).json({
              message: `Your address is outside this provider's home visit service area (${coverage.distanceKm?.toFixed(1) ?? "?"}km away, max ${coverage.providerRadiusKm}km). Please choose a provider closer to you or select a different visit type.`,
              errorCode: "COVERAGE_CHECK_FAILED",
              distanceKm: coverage.distanceKm,
              providerRadiusKm: coverage.providerRadiusKm,
            });
          }
        }
      }

      // Resolve promo discount
      let promoDiscountInput: { type: "percent" | "fixed"; value: number; code: string } | null = null;
      if (promoCode && typeof promoCode === "string" && promoCode.trim()) {
        try {
          const promo = await storage.getPromoCodeByCode(promoCode.trim().toUpperCase());
          if (promo && promo.isActive) {
            const now = new Date();
            const okWindow = new Date(promo.validFrom) <= now && new Date(promo.validUntil) >= now;
            const okUses = promo.maxUses == null || (promo.usedCount ?? 0) < promo.maxUses;
            const okProvider = !promo.applicableProviders || promo.applicableProviders.length === 0 || promo.applicableProviders.includes(providerId);
            if (okWindow && okUses && okProvider) {
              let promoValue = Number(promo.discountValue);
              const promoType: "percent" | "fixed" = promo.discountType === "percentage" ? "percent" : "fixed";
              // P-FINAL: Normalize fixed discounts to bookingCurrency so the discount
              // is applied in the same currency unit as the service price.
              // Percentage discounts are currency-agnostic — no conversion needed.
              if (promoType === "fixed") {
                const promoBaseCur = (promo as any).baseCurrency ?? "USD";
                const bookCur = countryCurrency(providerCountry as CountryCode);
                if (promoBaseCur !== bookCur) {
                  const promoRates = await getRates();
                  // promoBaseCur → USD → bookingCurrency
                  const inUSD = toUSDSync(promoValue, promoBaseCur, promoRates);
                  promoValue = fromUSDSync(inUSD, bookCur, promoRates);
                }
              }
              promoDiscountInput = {
                type: promoType,
                value: promoValue,
                code: promo.code,
              };
              appliedPromoCode = promo.code;
              // H-10: save for deferred increment — do NOT increment here (before appointment exists)
              pendingPromoIncrement = { id: promo.id, newCount: (promo.usedCount ?? 0) + 1 };
            }
          }
        } catch (promoErr) {
          console.error("[booking] promo apply failed:", promoErr);
        }
      }

      // ── Membership package discount + RX-02 benefits ─────────────────────────
      let membershipDiscountInput: {
        serviceDiscountPercent: number;
        platformFeeDiscount: number;
        label: string;
        userPackageId: string;
      } | null = null;
      let appliedUserPackageId: string | null = null;
      // RX-02: reduced_commission benefit — passed to RE to lower commission rate
      let membershipReducedCommission = 0;
      // RX-02: wallet_bonus benefit — credited to patient wallet after booking
      let pendingWalletBonus = 0;

      try {
        const activePackage = await storage.getActiveUserPackage(userId, providerCountry as string);
        if (activePackage) {
          const svcDiscBenefit     = activePackage.benefits.find(b => b.benefitKey === "service_discount_percent");
          const pfDiscBenefit      = activePackage.benefits.find(b => b.benefitKey === "platform_fee_discount");
          const reducedCommBenefit = activePackage.benefits.find(b => b.benefitKey === "reduced_commission");
          const walletBonusBenefit = activePackage.benefits.find(b => b.benefitKey === "wallet_bonus");

          const svcDiscPct = svcDiscBenefit ? Number(svcDiscBenefit.benefitValue) : 0;
          const pfDiscPct  = pfDiscBenefit  ? Number(pfDiscBenefit.benefitValue)  : 0;
          if (svcDiscPct > 0 || pfDiscPct > 0) {
            membershipDiscountInput = {
              serviceDiscountPercent: svcDiscPct,
              platformFeeDiscount: pfDiscPct,
              label: "Member discount",
              userPackageId: activePackage.id,
            };
            appliedUserPackageId = activePackage.id;
          }
          // RX-02: store extra benefit values for post-RE use
          if (reducedCommBenefit) membershipReducedCommission = Math.max(0, Number(reducedCommBenefit.benefitValue));
          if (walletBonusBenefit) pendingWalletBonus = Math.max(0, Number(walletBonusBenefit.benefitValue));
        }
      } catch (pkgErr) {
        console.error("[booking] package discount lookup failed:", pkgErr);
      }

      // Build effective service record: if practitioner has a custom fee, override service price
      const effectiveSvc = svcRecord
        ? { ...svcRecord, ...(practitionerFee !== null ? { price: practitionerFee.toFixed(2) } : {}) }
        : null;

      // Fallback price when no service record exists (e.g. direct provider booking).
      // Provider-level fee columns are deprecated — use 0 so the revenue engine
      // still runs and applies platform commission, promo codes, and tax correctly.
      const fallbackBase = 0;

      let fee: any;
      let platformFee = 0;
      let promoDiscount = 0;
      let taxAmountNum = 0;
      let pricingBreakdownSnapshot: RevenueEngineResult | null = null;
      let revenueEngineResult: RevenueEngineResult | null = null;

      // ── Pricing: RevenueEngine is the single source of truth ─────────────────
      // All booking paths (service, sub-service, and provider-level fallback)
      // MUST run through runRevenueEngine(). No legacy computeFinalPrice() calls
      // allowed at appointment creation time. Sprint RX-01.
      const _providerType = (provider as any).providerType ?? null;
      // serviceCategory: sub-services carry an explicit category slug (e.g. "physician").
      // Fall back to _providerType so category-specific commission rules still fire
      // for regular services that have no sub-service record attached.
      const _serviceCategory = (subRecord as any)?.category ?? _providerType ?? null;

      // P-FINAL Rules 1 & 2: Fetch exchange rates once for the entire booking flow.
      // bookingCurrency = provider's native currency (all amounts calculated in this currency).
      // _reRate = how many local units = 1 USD (e.g., 365 for HUF).
      const _reRates = await getRates();
      const _bookingCurrency = countryCurrency(providerCountry as CountryCode);
      const _reRate = _reRates[_bookingCurrency] ?? 1;
      let _feeUSD = 0; // patientPayable expressed in USD — computed from engine.finalTotalUsd

      if (effectiveSvc || subRecord) {
        // Platform VAT always wins: fetch the admin-set country rate first.
        // Service-level taxPercentage is only a fallback when no platform rate exists.
        let bookingTaxRate = 0;
        if (providerCountry) {
          const taxSetting = await storage.getTaxSettingByCountry(providerCountry as string).catch(() => null);
          if (taxSetting) bookingTaxRate = Number(taxSetting.taxRate);
        }
        if (bookingTaxRate === 0) bookingTaxRate = Number(subRecord?.taxPercentage ?? 0);

        const reResult = await runRevenueEngine({
          subService: subRecord ? {
            basePrice: subRecord.basePrice,
            platformFee: subRecord.platformFee,
            taxPercentage: subRecord.taxPercentage,
            pricingType: subRecord.pricingType,
            durationMinutes: subRecord.durationMinutes,
          } : null,
          service: effectiveSvc ? {
            price: effectiveSvc.price,
            duration: effectiveSvc.duration,
            platformFeeOverride: effectiveSvc.platformFeeOverride,
            homeVisitFee: effectiveSvc.homeVisitFee,
            clinicFee: effectiveSvc.clinicFee,
            telemedicineFee: effectiveSvc.telemedicineFee,
            emergencyFee: effectiveSvc.emergencyFee,
          } : null,
          visitType: (visitType || "clinic") as "online" | "home" | "clinic",
          sessions: 1,
          discount: promoDiscountInput,
          membershipDiscount: membershipDiscountInput,
          taxRatePercent: bookingTaxRate > 0 ? bookingTaxRate : undefined,
          paymentMethod: paymentMethod ?? "cash",
          countryCode: providerCountry ?? null,
          providerId,
          providerType: _providerType,
          serviceCategory: _serviceCategory,
          membershipReducedCommissionPercent: membershipReducedCommission > 0 ? membershipReducedCommission : undefined,
          // P-FINAL Rules 1, 2, 7: Supply currency context and rates
          bookingCurrency: _bookingCurrency,
          providerCurrency: (svcRecord as any)?.currency || _bookingCurrency,
          rates: _reRates,
        });
        fee = reResult.patientPayable;
        _feeUSD = reResult.finalTotalUsd;
        platformFee = reResult.platformFee;
        promoDiscount = reResult.discount;
        taxAmountNum = reResult.tax;
        pricingBreakdownSnapshot = reResult;
        revenueEngineResult = reResult;
      } else {
        // No service record: provider-level fallback, still run through RE
        const reResult = await runRevenueEngine({
          service: null,
          subService: null,
          visitType: (visitType || "clinic") as "online" | "home" | "clinic",
          packagePrice: fallbackBase,
          discount: promoDiscountInput,
          paymentMethod: paymentMethod ?? "cash",
          countryCode: providerCountry ?? null,
          providerId,
          providerType: _providerType,
          serviceCategory: _serviceCategory,
          membershipReducedCommissionPercent: membershipReducedCommission > 0 ? membershipReducedCommission : undefined,
          // P-FINAL Rules 1, 2, 7
          bookingCurrency: _bookingCurrency,
          providerCurrency: _bookingCurrency,
          rates: _reRates,
        });
        fee = reResult.patientPayable;
        _feeUSD = reResult.finalTotalUsd;
        platformFee = reResult.platformFee;
        promoDiscount = reResult.discount;
        pricingBreakdownSnapshot = reResult;
        revenueEngineResult = reResult;
      }

      // Create appointment
      console.log("Creating appointment with data:", {
        patientId: userId,
        providerId,
        serviceId,
        practitionerId,
        date,
        startTime,
        endTime,
        visitType,
        totalAmount: fee.toString()
      });

      // Reserve the time slot atomically (find-or-create then mark booked).
      // If another patient already reserved this exact slot we abort with 409.
      let reservedSlotId: string | null = null;
      try {
        const reserved = await storage.reserveTimeSlot(providerId, date, startTime, endTime);
        reservedSlotId = reserved.id;
      } catch (slotErr: any) {
        console.warn("Slot reservation failed:", slotErr?.message);
        return res.status(409).json({ message: slotErr?.message || "This time slot is no longer available." });
      }

      // Atomic: insert appointment row + first audit event ("book") in one tx
      // so we can never have a booking without its provenance record.
      const bookingResult = await storage.createAppointmentWithEvent(
        {
          patientId: userId,
          familyMemberId: validatedFamilyMemberId,
          providerId,
          serviceId: serviceId || null,
          practitionerId: practitionerId || null,
          timeSlotId: reservedSlotId,
          date,
          startTime,
          endTime,
          visitType: visitType || "online",
          status: "pending",
          notes: notes || null,
          patientAddress: patientAddress || null,
          patientLatitude: typeof patientLatitude === "number" ? patientLatitude : null,
          patientLongitude: typeof patientLongitude === "number" ? patientLongitude : null,
          totalAmount: fee.toString(),
          platformFeeAmount: platformFee.toFixed(2),
          // Lock the base service price at booking time — never changes after creation.
          servicePriceSnapshot: svcRecord ? Number(svcRecord.price || 0).toFixed(2) : null,
          promoCode: appliedPromoCode,
          promoDiscount: promoDiscount.toFixed(2),
          taxAmount: taxAmountNum.toFixed(2),
          // Full breakdown snapshot so the confirmation page shows exact figures
          // without reconstructing from (potentially stale) live service data.
          pricingBreakdown: pricingBreakdownSnapshot,
          countryCode: providerCountry,
          packageIdUsed: appliedUserPackageId ?? null,
          packageDiscountAmount: pricingBreakdownSnapshot?.membershipDiscount
            ? pricingBreakdownSnapshot.membershipDiscount.toFixed(2)
            : "0.00",
          displayCurrency: _bookingCurrency,
        } as any,
        {
          action: "book" as any,
          actorUserId: userId,
          actorRole: "patient" as any,
          fromStatus: null,
          toStatus: "pending" as any,
          reason: null,
          metadata: JSON.stringify({
            visitType: visitType || "online",
            serviceId: serviceId || null,
            paymentMethod: paymentMethod || "card",
          }),
        },
      );
      let appointment = bookingResult.appointment;

      // TZ Sprint — populate authoritative UTC scheduling timestamps (fire-and-forget).
      // Executed asynchronously so it never delays the booking response.
      (async () => {
        try {
          const provTz = await getProviderTimezone(providerId, (provider as any).userId);
          const startAtUtc = localToUTC(date, startTime, provTz);
          const endAtUtc   = localToUTC(date, endTime || startTime, provTz);
          if (!isNaN(startAtUtc.getTime())) {
            await pool.query(
              `UPDATE appointments SET provider_timezone = $1, start_at = $2, end_at = $3 WHERE id = $4`,
              [provTz, startAtUtc.toISOString(), endAtUtc.toISOString(), appointment.id],
            );
          }
        } catch (tzErr: any) {
          console.warn("[booking] TZ fields write failed (non-fatal):", tzErr?.message);
        }
      })();

      // C21.0 — Persist intake responses (JSONB column, not in Drizzle schema yet)
      if (intakeResponses && typeof intakeResponses === "object" && Object.keys(intakeResponses).length > 0) {
        try {
          await pool.query(
            `UPDATE appointments SET intake_responses = $1::jsonb WHERE id = $2`,
            [JSON.stringify(intakeResponses), appointment.id],
          );
        } catch (intakeErr: any) {
          console.warn("[booking] intake_responses write failed (non-fatal):", intakeErr?.message);
        }
      }

      // Sprint RX-01 — Persist RevenueEngine financial snapshot columns
      if (revenueEngineResult) {
        try {
          await pool.query(
            `UPDATE appointments SET
               commission_rate             = $1,
               commission_amount           = $2,
               provider_earnings_snapshot  = $3,
               payment_surcharge_amount    = $4,
               travel_fee_snapshot         = $5,
               platform_revenue_snapshot   = $6,
               re_applied_rules            = $7::jsonb
             WHERE id = $8`,
            [
              revenueEngineResult.commissionRate,
              revenueEngineResult.commissionAmount.toFixed(2),
              revenueEngineResult.providerEarnings.toFixed(2),
              revenueEngineResult.paymentSurcharge.toFixed(2),
              revenueEngineResult.engineTravelFee.toFixed(2),
              revenueEngineResult.platformRevenue.toFixed(2),
              JSON.stringify(revenueEngineResult.appliedRules),
              appointment.id,
            ],
          );
        } catch (reSnapshotErr: any) {
          console.warn("[booking] RE snapshot write failed (non-fatal):", reSnapshotErr?.message);
        }

        // Persist revenue shares to booking_revenue_shares table (fire-and-forget)
        if (revenueEngineResult.revenueShares.length > 0) {
          Promise.all(
            revenueEngineResult.revenueShares.map(share =>
              pool.query(
                `INSERT INTO booking_revenue_shares (appointment_id, participant_type, label, amount, percent)
                 VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
                [appointment.id, share.participantType, share.label, share.amount.toFixed(2), share.percent],
              ),
            ),
          ).catch((e: any) => console.warn("[booking] revenue share persist failed (non-fatal):", e?.message));
        }

        // P-FINAL Rule 6: Persist booking/provider/patient currency and USD reporting snapshot.
        pool.query(
          `UPDATE appointments SET
             booking_currency  = $1,
             provider_currency = $2,
             patient_currency  = $3,
             final_total_usd   = $4
           WHERE id = $5`,
          [
            revenueEngineResult.bookingCurrency,
            revenueEngineResult.providerCurrency,
            revenueEngineResult.bookingCurrency, // patient currency = booking currency (domestic)
            revenueEngineResult.finalTotalUsd.toFixed(2),
            appointment.id,
          ],
        ).catch((e: any) => console.warn("[booking] P-FINAL currency snapshot write failed (non-fatal):", e?.message));

        // RX-02: wallet_bonus membership benefit — credit patient wallet after booking (fire-and-forget)
        if (pendingWalletBonus > 0) {
          storage.topUpWallet(userId, pendingWalletBonus, {
            description: "Membership wallet bonus",
            referenceType: "appointment",
            referenceId: appointment.id,
            idempotencyKey: `appt:${appointment.id}:wallet_bonus`,
          }).catch((e: any) => console.warn("[booking] wallet_bonus credit failed (non-fatal):", e?.message));
        }

        // W1/W2: Log membership benefit usage for audit trail (fire-and-forget)
        if (appliedUserPackageId) {
          const benefitsToLog: Array<{ key: string; value: string; description: string }> = [];
          if (membershipDiscountInput && membershipDiscountInput.serviceDiscountPercent > 0) {
            benefitsToLog.push({ key: "service_discount_percent", value: String(membershipDiscountInput.serviceDiscountPercent), description: `${membershipDiscountInput.serviceDiscountPercent}% service discount applied` });
          }
          if (membershipDiscountInput && membershipDiscountInput.platformFeeDiscount > 0) {
            benefitsToLog.push({ key: "platform_fee_discount", value: String(membershipDiscountInput.platformFeeDiscount), description: `${membershipDiscountInput.platformFeeDiscount}% platform fee discount applied` });
          }
          if (membershipReducedCommission > 0) {
            benefitsToLog.push({ key: "reduced_commission", value: String(membershipReducedCommission), description: `Commission reduced by ${membershipReducedCommission}%` });
          }
          if (pendingWalletBonus > 0) {
            benefitsToLog.push({ key: "wallet_bonus", value: String(pendingWalletBonus), description: `${pendingWalletBonus} USD wallet bonus credited` });
          }
          for (const b of benefitsToLog) {
            storage.recordBenefitUsage({
              userPackageId: appliedUserPackageId,
              appointmentId: appointment.id,
              benefitKey: b.key as any,
              amountUsed: b.value,
              notes: b.description,
            } as any).catch((e: any) => console.warn("[booking] benefit usage log failed (non-fatal):", e?.message));
          }
        }
      }

      // Cold-start / slow-path timing checkpoint: DB round-trips complete
      const _bookingDbMs = Date.now() - _bookingStart;
      if (_bookingDbMs > 3000) {
        // Surface slow bookings so ops can correlate with cold-pool events
        slog("warn", "booking", "POST /api/appointments", `slow booking creation: ${_bookingDbMs}ms`, {
          durationMs: _bookingDbMs,
          metadata: { appointmentId: appointment.id, providerId, patientId: userId },
        });
      }

      // M-08 (Sprint 6): Cancel patient's active waitlist entries for this provider.
      // The patient just booked — they no longer need to wait. Best-effort / fire-and-forget.
      storage.cancelPatientActiveWaitlistEntries(userId, providerId)
        .catch((e: any) => console.warn("[booking] waitlist cleanup failed (non-fatal):", e?.message));

      // H-10: increment promo usedCount AFTER appointment is saved (atomic correctness)
      if (pendingPromoIncrement) {
        storage.updatePromoCode(pendingPromoIncrement.id, { usedCount: pendingPromoIncrement.newCount } as any)
          .catch((e: any) => console.warn("[booking] promo increment failed (non-fatal):", e?.message));
      }

      // ── Multi-session: create child appointments tied to this parent ──
      // Each child shares the same payment (totalAmount=0, paymentMethod
      // "bundled") and follows the parent's status. Children are created
      // BEFORE payment so an idempotent retry sees the full picture, but
      // any conflict on a child causes the whole booking to fail.
      const childAppointments: any[] = [];
      if (additionalSlots.length > 0) {
        try {
          for (const extra of additionalSlots) {
            // Re-validate each extra slot is in the future
            const t = new Date(`${extra.date}T${extra.startTime}:00`);
            if (isNaN(t.getTime()) || t.getTime() < Date.now() - 60_000) {
              throw new Error(`Session date/time is invalid or in the past: ${extra.date} ${extra.startTime}`);
            }
            // Full conflict check (appointments + manual blocks + slot holds)
            // using the same engine as the parent booking.  This closes the
            // TOCTOU window that the old getAppointmentsByProvider array scan
            // left open for concurrent multi-session bookings.
            const extraConflict = await checkConflict({
              providerId,
              practitionerId: (practitionerId as string | null) ?? null,
              date: extra.date,
              startTime: extra.startTime,
              endTime: extra.endTime,
              visitType: (visitType || "clinic") as "clinic" | "home" | "online",
              serviceBufferBefore: 0,
              serviceBufferAfter: 0,
              excludePatientId: userId,
            });
            if (extraConflict.result.hasConflict) {
              throw new Error(
                `Time slot ${extra.date} ${extra.startTime} is no longer available` +
                (extraConflict.result.message ? `: ${extraConflict.result.message}` : "."),
              );
            }
            const reservedExtra = await storage.reserveTimeSlot(providerId, extra.date, extra.startTime, extra.endTime);
            const childRes = await storage.createAppointmentWithEvent(
              {
                patientId: userId,
                familyMemberId: validatedFamilyMemberId,
                providerId,
                serviceId: serviceId || null,
                practitionerId: practitionerId || null,
                timeSlotId: reservedExtra.id,
                date: extra.date,
                startTime: extra.startTime,
                endTime: extra.endTime,
                visitType: visitType || "online",
                status: "pending",
                notes: notes || null,
                patientAddress: patientAddress || null,
                patientLatitude: typeof patientLatitude === "number" ? patientLatitude : null,
                patientLongitude: typeof patientLongitude === "number" ? patientLongitude : null,
                totalAmount: "0.00",
                platformFeeAmount: "0.00",
                promoCode: null,
                promoDiscount: "0.00",
                parentAppointmentId: appointment.id,
                countryCode: providerCountry,
              } as any,
              {
                action: "book" as any,
                actorUserId: userId,
                actorRole: "patient" as any,
                fromStatus: null,
                toStatus: "pending" as any,
                reason: null,
                metadata: JSON.stringify({
                  visitType: visitType || "online",
                  parent: appointment.id,
                  paymentMethod: "bundled",
                }),
              },
            );
            childAppointments.push(childRes.appointment);
          }
        } catch (multiErr: any) {
          // Roll back: cancel the parent + any successful children and
          // release their reserved slots so the patient is not left with a
          // partial booking.
          console.error("Multi-session booking failed, rolling back:", multiErr);
          try {
            for (const c of childAppointments) {
              await storage.updateAppointment(c.id, { status: "cancelled" } as any);
            }
            await storage.updateAppointment(appointment.id, { status: "cancelled" } as any);
          } catch (rbErr) {
            console.error("Rollback failed:", rbErr);
          }
          return res.status(409).json({ message: multiErr?.message || "Could not book all the sessions you picked." });
        }
      }

      // Optionally save the address to the patient's profile for next time.
      if (req.body.saveAddressToProfile === true && patientAddress) {
        try {
          await storage.updateUser(userId, {
            address: patientAddress,
            ...(typeof patientLatitude === "number" ? { savedLatitude: patientLatitude } : {}),
            ...(typeof patientLongitude === "number" ? { savedLongitude: patientLongitude } : {}),
          } as any);
        } catch (saveErr) {
          console.error("Failed to save address to profile:", saveErr);
        }
      }

      console.log("Appointment created:", appointment.id);

      // P-FINAL: Exchange rates were already fetched before the RE call (_reRates).
      // Reuse them here for payment record creation and Stripe checkout.
      const _bookingRates = _reRates;
      const _bookingSrcCurrency = _bookingCurrency;
      const _bookingRateVal = _reRate;
      // P-FINAL Rule 2: fee is in bookingCurrency (e.g., HUF); _feeUSD is its USD
      // equivalent computed by the engine for payment processing (Stripe, wallet).
      const _bookingFeeUSD = _feeUSD;
      const _bookingExchangeRate = parseFloat((1 / _bookingRateVal).toFixed(6));

      // Create payment record — always stored in USD; display fields hold local currency snapshot.
      const payment = await storage.createPayment({
        appointmentId: appointment.id,
        patientId: userId,
        amount: _bookingFeeUSD.toFixed(2),
        currency: "USD",
        paymentMethod: paymentMethod || "card",
        status: "pending",
        countryCode: providerCountry,
        displayCurrency: _bookingSrcCurrency,
        displayAmount: Number(fee).toFixed(2),
        exchangeRateUsed: _bookingExchangeRate.toString(),
      } as any);

      console.log("Payment record created:", payment.id);

      // ── W5/W9: Gift card partial payment ──────────────────────────────
      // If giftCardCode is provided, redeem up to the booking amount from the
      // gift card into the patient wallet so the normal wallet path handles it.
      if (giftCardCode && typeof giftCardCode === "string") {
        try {
          const gcRes = await pool.query(
            `SELECT * FROM gift_cards WHERE code = $1 FOR UPDATE`,
            [giftCardCode.toUpperCase().trim()],
          );
          const gc = gcRes.rows[0];
          if (gc && gc.is_active && Number(gc.balance) > 0 && (!gc.expires_at || new Date(gc.expires_at) > new Date())) {
            const gcAmountLocal = Math.min(Number(gc.balance), Number(fee));
            const gcAmountUSD = toUSDSync(gcAmountLocal, _bookingSrcCurrency, _bookingRates);
            if (gcAmountUSD > 0) {
              // Top up wallet with GC credit, then debit in the normal wallet block
              await storage.topUpWallet(userId, gcAmountUSD, {
                description: `Gift card applied — ${gc.code}`,
                referenceType: "gift_card",
                referenceId: gc.id,
                idempotencyKey: `gc:${gc.id}:appt:${appointment.id}`,
              });
              const newBalance = Math.max(0, Number(gc.balance) - gcAmountLocal);
              await pool.query(
                `UPDATE gift_cards SET balance = $1, is_active = $2, redeemed_by_user_id = COALESCE(redeemed_by_user_id, $3), redeemed_at = COALESCE(redeemed_at, NOW()) WHERE id = $4`,
                [newBalance.toFixed(2), newBalance <= 0 ? false : true, userId, gc.id],
              );
            }
          }
        } catch (gcErr: any) {
          console.warn("[booking] gift card apply failed (non-fatal):", gcErr?.message);
        }
      }

      // ── Wallet usage (partial or full) ────────────────────────────────
      // The client can pre-apply any portion of the wallet balance:
      //   • paymentMethod === "wallet"        → full wallet (back-compat)
      //   • walletAmountUsed > 0              → apply that exact amount
      //   • walletAmountUsed >= fee           → effectively full wallet
      //   • walletAmountUsed < fee            → remainder charged via the
      //     selected method (card → Stripe checkout for the diff; cash /
      //     bank_transfer → collected later, payment stays pending).
      // P-FINAL: feeNum = booking-currency amount (HUF/IRR/USD); _bookingFeeUSD = USD equivalent.
      // requestedWallet arrives from the frontend in LOCAL currency (Ft / IRR) and must
      // be converted to USD before being compared against _bookingFeeUSD.
      const feeNum = Number(fee); // booking currency (HUF/IRR/USD) — for display
      const requestedWalletLocal = Number(req.body.walletAmountUsed); // LOCAL currency from frontend
      let walletAppliedUSD = 0;
      // P-FINAL: wallet balance is held in USD; convert booking-currency amounts before debiting.
      if (paymentMethod === "wallet") {
        walletAppliedUSD = _bookingFeeUSD; // full fee in USD
      } else if (Number.isFinite(requestedWalletLocal) && requestedWalletLocal > 0) {
        // Frontend sends walletAmountUsed in LOCAL currency; convert to USD, cap at fee.
        const requestedWalletUSD = _bookingCurrency === "USD"
          ? requestedWalletLocal
          : round2(requestedWalletLocal / _bookingRateVal);
        walletAppliedUSD = Math.min(round2(requestedWalletUSD), round2(_bookingFeeUSD));
      }
      const walletApplied = walletAppliedUSD; // USD
      const remainderDue = Math.max(0, round2(_bookingFeeUSD - walletAppliedUSD)); // USD
      const remainderDueLocal = remainderDue;

      let walletPaid = false;
      if (walletApplied > 0) {
        try {
          const wallet = await storage.getOrCreateWallet(userId);
          if (wallet.isFrozen) {
            throw new Error("Wallet is frozen");
          }
          if (Number(wallet.balance) + 1e-6 < walletAppliedUSD) {
            throw new Error("Insufficient wallet balance");
          }
          await storage.debitWallet(userId, walletAppliedUSD, {
            description: remainderDueLocal === 0
              ? "Appointment payment"
              : `Appointment payment (partial — ${walletAppliedUSD.toFixed(2)} USD of ${_bookingFeeUSD.toFixed(2)} USD)`,
            referenceType: "appointment",
            referenceId: appointment.id,
            idempotencyKey: `appointment:${appointment.id}:wallet`,
          });
          if (remainderDue === 0) {
            // Fully paid via wallet — auto-confirm and mark payment completed.
            await storage.updatePayment(payment.id, {
              status: "completed",
              paymentMethod: "wallet",
            });
            const confirmRes = await storage.updateAppointmentWithEvent(
              appointment.id,
              // paymentStatus must be updated here so the booking response and
              // confirmation page reflect "completed" immediately — not just the
              // payments table row.
              { status: "confirmed", paymentStatus: "completed" } as any,
              {
                action: "confirm" as any,
                actorUserId: userId,
                actorRole: "patient" as any,
                fromStatus: appointment.status as any,
                toStatus: "confirmed" as any,
                reason: "Paid in full via wallet",
              },
            );
            if (confirmRes) appointment = confirmRes.appointment;
            walletPaid = true;
          }
          // Else: partial — payment row stays pending; remainder handled below.
        } catch (walletErr: any) {
          // Roll back: cancel appointment, free slot, mark payment failed so
          // the patient can retry with a different payment combination.
          try {
            await storage.updateAppointmentWithEvent(
              appointment.id,
              { status: "cancelled" } as any,
              {
                action: "cancel" as any,
                actorUserId: null,
                actorRole: null,
                fromStatus: appointment.status as any,
                toStatus: "cancelled" as any,
                reason: walletErr?.message || "Wallet payment failed during booking",
                reasonCode: "wallet_payment_failed",
              },
            );
            if (reservedSlotId) await storage.updateTimeSlot(reservedSlotId, { isBooked: false });
            await storage.updatePayment(payment.id, { status: "failed" });
          } catch {}
          logSystemEvent(
            "payment_failure",
            "error",
            "POST /api/appointments",
            `Wallet payment failed during booking: ${walletErr?.message || "unknown error"}`,
            { appointmentId: appointment?.id, patientId: req.user?.id, error: walletErr?.message },
            req.user?.countryCode ?? null,
          ).catch(() => {});
          const msg = walletErr?.message || "Wallet payment failed";
          return res.status(msg.toLowerCase().includes("insufficient") ? 402 : 400).json({ message: msg });
        }
      }

      // If paying by card AND Stripe is configured, create a Checkout Session
      // for the remaining amount (= fee - walletApplied).
      let checkoutUrl: string | null = null;
      const wantsCard = paymentMethod === "card" || (!paymentMethod && remainderDue > 0);
      if (!walletPaid && remainderDue > 0 && wantsCard && isStripeConfigured()) {
        try {
          const origin =
            (req.headers.origin as string) ||
            `${req.protocol}://${req.get("host")}`;
          const providerWithUser = await storage.getProviderWithUser(providerId);
          const providerName = providerWithUser
            ? `${providerWithUser.user.firstName} ${providerWithUser.user.lastName}`
            : "Provider";
          // remainderDue is already in USD (revenue engine output) — no conversion needed.
          const _amountUSD = remainderDue;
          const session = await createCheckoutSession({
            appointmentId: appointment.id,
            amount: _amountUSD,
            currency: "usd",
            description: walletApplied > 0
              ? `Appointment with ${providerName} on ${date} at ${startTime} (wallet credit ${walletApplied.toFixed(2)} applied)`
              : `Appointment with ${providerName} on ${date} at ${startTime}`,
            customerEmail: user.email,
            successUrl: `${origin}/booking/confirmation/${appointment.id}?stripe=success`,
            cancelUrl: `${origin}/booking?stripe=cancelled&appointment=${appointment.id}`,
            metadata: {
              patientId: userId,
              providerId,
              walletApplied: walletApplied.toFixed(2),
            },
          });
          checkoutUrl = session.url;
          await storage.updatePayment(payment.id, {
            stripeSessionId: session.sessionId,
          });
          console.log("Stripe checkout session created:", session.sessionId);
        } catch (stripeErr) {
          console.error("Stripe checkout creation failed:", stripeErr);
          // Free the reserved slot immediately so other patients aren't blocked
          // waiting for the hourly cron to clean up.
          if (reservedSlotId) {
            await storage.updateTimeSlot(reservedSlotId, { isBooked: false }).catch((slotErr: any) =>
              console.warn("[stripe-fail] slot free failed:", slotErr?.message),
            );
          }
          await storage.updateAppointment(appointment.id, { status: "cancelled" } as any).catch(() => {});
          return res.status(502).json({
            message: "Payment session could not be created. Your slot has been released — please try booking again.",
          });
        }
      }

      // Auto-create a chat conversation between patient and provider so they can message immediately
      try {
        const pwu = await storage.getProviderWithUser(providerId);
        if (pwu?.userId && pwu.userId !== userId) {
          await storage.getOrCreateRealtimeConversation(userId, pwu.userId);
        }
      } catch (chatErr) {
        console.error("[chat] auto-create conversation failed:", chatErr);
      }

      // Multi-channel dispatch (email/SMS/WhatsApp/push) for both parties
      try {
        const providerWithUser = await storage.getProviderWithUser(providerId);
        const service = serviceId ? await storage.getService(serviceId) : null;
        const provName = providerWithUser ? `${providerWithUser.user.firstName} ${providerWithUser.user.lastName}` : "your provider";
        notify.appointmentBooked(userId, {
          providerName: provName,
          date, time: startTime, service: service?.name,
          appointmentId: appointment.id,
        }).catch(err => console.error("[notify] appointmentBooked patient", err));
        // Format provider notification amounts in the provider's preferred currency.
        const _provNotifCurr = providerWithUser?.user?.preferredCurrency || _bookingSrcCurrency;
        // P-FINAL: platformFee/promoDiscount/taxAmountNum are in bookingCurrency (HUF/IRR/USD).
        // Convert to USD first, then format into provider's preferred display currency.
        const _fmtProv = (amountInBookingCurrency: number) => {
          const usd = _bookingSrcCurrency === "USD"
            ? amountInBookingCurrency
            : parseFloat((amountInBookingCurrency / _bookingRateVal).toFixed(2));
          return formatSync(usd, _provNotifCurr, _bookingRates);
        };
        if (providerWithUser?.userId) {
          dispatchNotification({
            userId: providerWithUser.userId,
            eventKey: "appointment.booked",
            title: "New booking received",
            body: `${user.firstName} ${user.lastName} booked ${date} at ${startTime}.`,
            email: {
              subject: "New booking - GoldenLife",
              headingKey: "appt.confirm.heading",
              intro: `${user.firstName} ${user.lastName} booked an appointment with you.`,
              details: [
                { label: "Date", value: date },
                { label: "Time", value: `${startTime} - ${endTime}` },
                ...(service ? [{ label: "Service", value: service.name }] : []),
                { label: "Visit Type", value: visitType === "home" ? "Home Visit" : visitType === "clinic" ? "Clinic Visit" : "Online Consultation" },
                { label: "Patient Name", value: `${user.firstName} ${user.lastName}` },
                ...(contactMobile ? [{ label: "Patient Phone", value: contactMobile }] : (user.mobileNumber || user.phone) ? [{ label: "Patient Phone", value: (user.mobileNumber || user.phone)! }] : []),
                ...(visitType === "home"
                  ? [{ label: "Patient Address", value: patientAddress || user.address || "Patient will provide address" }]
                  : visitType === "clinic"
                  ? [{ label: "Clinic Address", value: provider.primaryServiceLocation || provider.city || "Clinic" }]
                  : [{ label: "Address", value: "Online (link will be shared)" }]),
                ...(platformFee > 0 ? [{ label: "Platform Fee", value: _fmtProv(platformFee) }] : []),
                ...(promoDiscount > 0 ? [{ label: `Promo${appliedPromoCode ? ' (' + appliedPromoCode + ')' : ''}`, value: `-${_fmtProv(promoDiscount)}` }] : []),
                ...(taxAmountNum > 0 ? [{ label: "Tax", value: _fmtProv(taxAmountNum) }] : []),
                { label: "Total", value: formatSync(_bookingFeeUSD, _provNotifCurr, _bookingRates) },
              ],
            },
            data: { appointmentId: appointment.id },
            push: { url: `/provider/appointments/${appointment.id}` },
          }).catch(err => console.error("[notify] appointmentBooked provider", err));
        }
      } catch (e) {
        console.error("[notify] booking dispatch failed:", e);
      }

      // Send booking confirmation email
      if (resend) {
        try {
          const providerWithUser = await storage.getProviderWithUser(providerId);
          const service = serviceId ? await storage.getService(serviceId) : null;
          
          // PII: do not log email addresses
          
          const ics = icsAttachment(`appointment-${appointment.id}.ics`, {
            uid: appointment.id,
            title: `GoldenLife appointment with ${providerWithUser?.user.firstName} ${providerWithUser?.user.lastName}`,
            description: `${service ? service.name + " — " : ""}${visitType === "home" ? "Home visit" : "Online consultation"}`,
            location: visitType === "home" ? (patientAddress || "Patient address") : "Online",
            date,
            startTime,
            endTime,
            organizerName: "GoldenLife",
            organizerEmail: "no-reply@goldenlife.health",
          });

          const providerAddressLine = provider.primaryServiceLocation || provider.city || "";
          const patientAddressLine = patientAddress || user.address || "";
          // Format monetary amounts in the patient's preferred currency for the confirmation email.
          const _emailPatientCurr = (user as any).preferredCurrency || "USD";
          // P-FINAL: platformFee/promoDiscount/taxAmountNum are in bookingCurrency (HUF/IRR/USD).
          // Convert to USD first, then format into patient's preferred display currency.
          const _fmtEmailAmt = (amountInBookingCurrency: number) => {
            const usd = _bookingSrcCurrency === "USD"
              ? amountInBookingCurrency
              : parseFloat((amountInBookingCurrency / _bookingRateVal).toFixed(2));
            return formatSync(usd, _emailPatientCurr, _bookingRates);
          };
          const emailResult = await resend.emails.send({
            from: FROM_EMAIL,
            to: user.email,
            subject: `Booking Confirmed ${appointment.appointmentNumber ? '— ' + appointment.appointmentNumber : ''} - GoldenLife`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h2 style="color: #0f172a;">Booking Confirmed!</h2>
                <p>Hello ${user.firstName},</p>
                <p>Your appointment with <strong>${providerWithUser?.user.firstName} ${providerWithUser?.user.lastName}</strong> has been successfully booked.</p>
                ${appointment.appointmentNumber ? `
                <div style="background: linear-gradient(135deg, #0ea5e9, #6366f1); padding: 14px 18px; border-radius: 8px; margin: 16px 0; display: inline-block;">
                  <p style="margin:0; color:#fff; font-size:0.8rem; letter-spacing:0.08em; text-transform:uppercase;">Appointment Reference</p>
                  <p style="margin:4px 0 0; color:#fff; font-size:1.5rem; font-weight:700; letter-spacing:0.05em;">${appointment.appointmentNumber}</p>
                </div>` : ''}
                <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="margin-top: 0; color: #1e293b;">Appointment Details</h3>
                  ${appointment.appointmentNumber ? `<p style="margin: 5px 0;"><strong>Reference #:</strong> ${appointment.appointmentNumber}</p>` : ''}
                  <p style="margin: 5px 0;"><strong>Date:</strong> ${date}</p>
                  <p style="margin: 5px 0;"><strong>Time:</strong> ${startTime} - ${endTime}</p>
                  ${service ? `<p style="margin: 5px 0;"><strong>Service:</strong> ${service.name}</p>` : ''}
                  <p style="margin: 5px 0;"><strong>Visit Type:</strong> ${visitType === 'home' ? 'Home Visit' : visitType === 'clinic' ? 'Clinic Visit' : 'Online Consultation'}</p>
                  ${visitType === 'home' && patientAddressLine ? `<p style="margin: 5px 0;"><strong>Visit Address:</strong> ${patientAddressLine}</p>` : ''}
                  ${visitType === 'clinic' && providerAddressLine ? `<p style="margin: 5px 0;"><strong>Clinic Address:</strong> ${providerAddressLine}</p>` : ''}
                  ${platformFee > 0 ? `<p style="margin: 5px 0;"><strong>Platform Fee:</strong> ${_fmtEmailAmt(platformFee)}</p>` : ''}
                  ${promoDiscount > 0 ? `<p style="margin: 5px 0; color:#059669;"><strong>Promo Discount${appliedPromoCode ? ' (' + appliedPromoCode + ')' : ''}:</strong> -${_fmtEmailAmt(promoDiscount)}</p>` : ''}
                  ${taxAmountNum > 0 ? `<p style="margin: 5px 0;"><strong>Tax:</strong> ${_fmtEmailAmt(taxAmountNum)}</p>` : ''}
                  <p style="margin: 5px 0;"><strong>Total Amount:</strong> ${formatSync(_bookingFeeUSD, _emailPatientCurr, _bookingRates)}</p>
                </div>
                <p>A calendar invite (<code>.ics</code>) is attached — open it to add this appointment to your calendar.</p>
                <p>You can view and manage your appointment in your patient dashboard.</p>
                <p style="color: #64748b; font-size: 0.875rem; margin-top: 30px;">
                  Thank you for choosing GoldenLife.<br>
                  <em>This is an automated message, please do not reply.</em>
                </p>
              </div>
            `,
            attachments: [ics as any],
          });
          void emailResult; // consumed — do not log (contains delivery metadata / PII)
        } catch (emailError) {
          console.error("Failed to send booking confirmation email:", emailError);
        }
      }

      // Sprint C19.0 — Immutable consent audit footprint.
      // Both consent checkboxes are enforced by the frontend canAdvance() gate, so reaching
      // this point implies the user actively agreed. Capture IP + User-Agent as the
      // cryptographic binding evidence. Fire-and-forget; never blocks the booking response.
      if (appointment?.id && userId) {
        const consentIp =
          (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
          req.ip ??
          "unknown";
        const consentUa = (req.headers["user-agent"] as string | undefined) ?? "unknown";
        pool.query(
          `INSERT INTO appointment_consents
             (appointment_id, user_id, consent_type, ip_address, user_agent, signed_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [appointment.id, userId, "booking_terms_and_data_consent", consentIp, consentUa],
        ).catch((e: any) =>
          console.warn("[consent] audit log failed (non-fatal):", e?.message),
        );
      }

      const responseBody = { ...appointment, checkoutUrl };
      if (idemCacheKey && userId) {
        storage.setIdempotencyKey(idemCacheKey, "appointment", userId, 201, responseBody, Date.now() + APPT_IDEMPOTENCY_TTL_MS)
          .catch((e) => console.warn("[idem] failed to persist idempotency key:", e?.message));
      }
      res.status(201).json(responseBody);
    } catch (error) {
      console.error("Create appointment error:", error);
      res.status(500).json({ message: "Failed to create appointment" });
    }
  });
  app.patch("/api/appointments/:id/status", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { status } = req.body as { status: string };
      const lifecycleStatuses = [
        "pending", "approved", "confirmed", "in_progress", "completed", "rejected",
      ];
      const actionOnlyStatuses = [
        "cancelled", "cancelled_by_patient", "cancelled_by_provider",
        "no_show", "rescheduled", "reschedule_requested", "reschedule_proposed",
        "expired",
      ];
      if (actionOnlyStatuses.includes(status)) {
        return res.status(400).json({
          message: `Status '${status}' must be set through POST /api/appointments/:id/action.`,
        });
      }
      if (!lifecycleStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const existing = await storage.getAppointment(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Enforce state-machine: cannot move out of a terminal state, and the
      // requested transition must be a legal one. Admin may force any change.
      if (!isAdminRole(req.user?.role)) {
        if (isTerminalStatus(existing.status)) {
          return res.status(409).json({
            message: `Appointment is already ${existing.status} and cannot be changed.`,
          });
        }
        if (!canTransition(existing.status, status)) {
          return res.status(409).json({
            message: `Cannot move appointment from ${existing.status} to ${status}.`,
            allowed: nextStatusesFor(existing.status),
          });
        }

        // Chronological guard: cannot mark an appointment completed before its scheduled start time.
        // Prefer the authoritative UTC start_at column; fall back to text parse (legacy rows).
        if (status === "completed") {
          const startAtCol = (existing as any).startAt;
          const apptStartMs = startAtCol
            ? new Date(startAtCol).getTime()
            : new Date(`${existing.date}T${existing.startTime}:00`).getTime();
          if (Date.now() < apptStartMs) {
            return res.status(409).json({
              message: "Appointment cannot be marked complete before its scheduled start time.",
            });
          }
        }
      }

      // Authorisation: admin OR the provider who owns the appointment OR the patient (cancel-only)
      if (!isAdminRole(req.user?.role)) {
        if (req.user?.role === "provider") {
          const provider = await storage.getProviderByUserId(req.user!.id);
          if (!provider || provider.id !== existing.providerId) {
            return res.status(403).json({ message: "Access denied" });
          }
        } else if (req.user?.role === "patient") {
          // Patients cannot change appointment status directly. All patient-initiated
          // transitions (cancel, reschedule) must go through POST /api/appointments/:id/action.
          return res.status(403).json({
            message: "Patients cannot change appointment status directly. Use POST /api/appointments/:id/action.",
          });
        } else {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      // Block "completed" if payment hasn't been collected yet. Admins can override.
      // Card and wallet payments are pre-paid at booking — auto-complete them here
      // in case the Stripe webhook never fired or payment was processed off-platform.
      if (status === "completed" && !isAdminRole(req.user?.role)) {
        const existingPayment = await storage.getPaymentByAppointment(req.params.id);
        if (!existingPayment) {
          return res.status(400).json({
            message: "Payment must be marked as completed before this appointment can be closed.",
          });
        }
        if (existingPayment.status !== "completed") {
          const autoCompleteMethods = ["card", "wallet"];
          if (autoCompleteMethods.includes(existingPayment.paymentMethod ?? "")) {
            // Auto-mark pre-paid methods as completed so providers aren't blocked
            await storage.updatePayment(existingPayment.id, { status: "completed" });
          } else {
            return res.status(400).json({
              message: "Payment must be marked as completed before this appointment can be closed.",
            });
          }
        }
      }

      // ── Sign-off code validation (provider completing a session) ────────────
      // Providers must supply the patient's 4-digit sign-off code to mark an
      // appointment completed. Admins bypass this requirement.
      if (status === "completed" && req.user?.role === "provider") {
        const submittedCode = String(req.body?.signOffCode || "").trim();
        if (!submittedCode) {
          return res.status(400).json({ message: "Sign-off code is required to complete this session." });
        }
        // Fetch the stored code — use raw SQL to avoid Drizzle schema lag
        const codeRow = await pool.query(
          `SELECT sign_off_code FROM appointments WHERE id = $1 LIMIT 1`,
          [req.params.id],
        );
        const storedCode = codeRow.rows[0]?.sign_off_code ?? null;
        if (!storedCode) {
          return res.status(409).json({
            message: "This session has no active sign-off code. Please ask the patient to refresh their appointment page to generate one.",
          });
        }
        if (submittedCode !== String(storedCode)) {
          return res.status(422).json({ message: "Incorrect sign-off code. Please ask the patient to check their appointment page." });
        }
      }

      // Map lifecycle status → audit-log action verb
      const statusToAction: Record<string, string> = {
        approved: "approve",
        confirmed: "confirm",
        in_progress: "start",
        completed: "complete",
        rejected: "reject",
      };
      const actionVerb = statusToAction[status] || "confirm";
      const updateRes = await storage.updateAppointmentWithEvent(
        req.params.id,
        { status: status as any },
        {
          action: actionVerb as any,
          actorUserId: req.user?.id ?? null,
          actorRole: (req.user?.role ?? null) as any,
          fromStatus: existing.status as any,
          toStatus: status as any,
          reason: typeof req.body?.reason === "string" ? req.body.reason : null,
        },
      );
      const appointment = updateRes?.appointment;
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // ── Sign-off code generation (session starting) ──────────────────────────
      // Generate a random 4-digit code when the session moves to in_progress.
      // Store it on the appointment and send it to the patient immediately so
      // they have it ready to share with the provider at the end of the session.
      let generatedSignOffCode: string | null = null;
      if (status === "in_progress") {
        try {
          generatedSignOffCode = String(Math.floor(1000 + Math.random() * 9000));
          await pool.query(
            `UPDATE appointments SET sign_off_code = $1 WHERE id = $2`,
            [generatedSignOffCode, req.params.id],
          );
          // Notify the patient with the code — they must share it with the provider
          // at the end of the visit to confirm the session actually happened.
          const apptRef = appointment.appointmentNumber ? ` (${appointment.appointmentNumber})` : "";
          await storage.createUserNotification({
            userId: appointment.patientId,
            type: "appointment",
            title: `Your session sign-off code${apptRef}`,
            message: `Your appointment is now in progress. Your sign-off code is: ${generatedSignOffCode}. You will need to share this with your provider at the end of the session to formally confirm it was completed.`,
            isRead: false,
          } as any);
          console.log(`[appt] sign-off code ${generatedSignOffCode} generated for appointment ${req.params.id}`);
        } catch (codeErr) {
          console.error("[appt] sign-off code generation failed (non-fatal):", codeErr);
        }
      }

      // Free the reserved time slot whenever the appointment enters a terminal
      // state that no longer holds the slot (cancellations / rejection / expiry / no-show).
      const slotReleaseStatuses = new Set([
        "cancelled", "cancelled_by_patient", "cancelled_by_provider",
        "rejected", "expired", "no_show",
      ]);
      if (slotReleaseStatuses.has(status)) {
        try {
          if (appointment.timeSlotId) {
            await storage.updateTimeSlot(appointment.timeSlotId, { isBooked: false });
          } else if (appointment.providerId && appointment.date && appointment.startTime) {
            await pool.query(
              `UPDATE time_slots SET is_booked = false, version = version + 1
               WHERE provider_id = $1 AND date::date = $2::date AND start_time = $3 AND is_booked = true`,
              [appointment.providerId, appointment.date, appointment.startTime],
            );
          }
        } catch (e) {
          console.error("Failed to free time slot on terminal status:", e);
        }
      }

      // Auto-lock the linked care chat conversation on terminal appointment status
      if (isTerminalStatus(status)) {
        try {
          const linked = await storage.getConversationForAppointment(req.params.id);
          if (linked) {
            // completed → 48h follow-up window; other terminal states → 2h brief support window
            const followUpMs = status === "completed" ? 48 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
            await storage.lockConversation(linked.id, new Date(Date.now() + followUpMs));
          }
        } catch (lockErr) {
          console.warn("[appt] conversation auto-lock (non-fatal):", lockErr);
        }
      }

      // Auto-generate invoice when an appointment is completed (provider/admin path).
      let invoiceResult: { created: boolean; invoiceNumber?: string } | undefined;
      if (status === "completed") {
        try {
          invoiceResult = await createInvoiceForAppointment(req.params.id);
        } catch (invErr) {
          console.error("[routes] auto invoice generation failed:", invErr);
          logSystemEvent("failed_job", "error", "invoice-generation",
            `Invoice generation failed for appointment ${req.params.id}`,
            { appointmentId: req.params.id, error: (invErr as Error).message, status: "completed" },
          ).catch(() => {});
        }
        // Record provider earning (idempotent — unique on appointmentId)
        try {
          await storage.recordProviderEarning(req.params.id);
        } catch (earnErr) {
          console.error("[routes] earnings record failed:", earnErr);
          logSystemEvent("failed_job", "error", "provider-earnings",
            `Provider earnings record failed for appointment ${req.params.id}`,
            { appointmentId: req.params.id, error: (earnErr as Error).message },
          ).catch(() => {});
        }
        // Qualify referral (idempotent — guarded by status='pending' in storage).
        // Credits both wallets when this is the patient's first completed
        // appointment AND they signed up via someone's referral code.
        try {
          await maybeQualifyReferralForAppointment(appointment);
        } catch (refErr) {
          console.error("[routes] referral qualification failed:", refErr);
        }
      }

      // Create notification for patient about status change
      try {
        const patientId = appointment.patientId;
        const apptRef = appointment.appointmentNumber ? ` (${appointment.appointmentNumber})` : "";
        const statusMessages: Record<string, string> = {
          confirmed: `Great news! Your appointment${apptRef} has been approved and confirmed by the provider.`,
          approved: `Your appointment${apptRef} has been approved and is awaiting final confirmation.`,
          rejected: `Your appointment request${apptRef} has been declined by the provider. You may rebook with another provider.`,
          cancelled: `Your appointment${apptRef} has been cancelled.`,
          cancelled_by_provider: `Your appointment${apptRef} has been cancelled by the provider.`,
          cancelled_by_patient: `Your appointment${apptRef} has been cancelled.`,
          completed: invoiceResult?.created
            ? `Your appointment${apptRef} has been completed. Invoice ${invoiceResult.invoiceNumber} is now available in your dashboard.`
            : `Your appointment${apptRef} has been marked as completed. Please leave a review!`,
          rescheduled: `Your appointment${apptRef} has been rescheduled.`,
          reschedule_requested: `A reschedule has been requested for appointment${apptRef}.`,
          reschedule_proposed: `A new time has been proposed for appointment${apptRef}.`,
          no_show: `Appointment${apptRef} was marked as a no-show.`,
          in_progress: `Your appointment${apptRef} is now in progress.`,
        };

        if (statusMessages[status]) {
          await storage.createUserNotification({
            userId: patientId,
            type: "appointment",
            title: `Appointment ${status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
            message: statusMessages[status],
            isRead: false,
          });
        }

        // Multi-channel dispatch for "confirmed" status — in-app is already sent above;
        // this adds email/SMS/push so patients know their booking is confirmed.
        if (status === "confirmed") {
          try {
            const providerWithUser = await storage.getProviderWithUser(appointment.providerId);
            const provName = providerWithUser
              ? `${providerWithUser.user.firstName} ${providerWithUser.user.lastName}`
              : "your provider";
            const patient = await storage.getUser(patientId);
            const lang = ((patient as any)?.languagePreference || "en") as "en" | "hu" | "fa";
            notify.appointmentConfirmed(patientId, {
              providerName: provName,
              date: appointment.date,
              time: appointment.startTime,
              appointmentId: appointment.id,
              lang,
            }).catch(err => console.error("[notify] appointmentConfirmed", err));
          } catch (confErr) {
            console.error("[notify] appointmentConfirmed setup failed:", confErr);
          }
        }

        // Email the patient when their appointment is completed (review request)
        if (status === "completed") {
          const patient = await storage.getUser(patientId);
          const providerWithUser = await storage.getProviderWithUser(appointment.providerId);
          if (patient) {
            await sendAppointmentEmail({
              to: patient.email,
              subject: "How was your appointment? - GoldenLife",
              heading: "Your appointment is complete",
              intro: `Hello ${patient.firstName}, your appointment with ${providerWithUser?.user.firstName ?? ""} ${providerWithUser?.user.lastName ?? ""} on ${appointment.date} at ${appointment.startTime} has been marked as completed.`,
              details: [
                ...(appointment.appointmentNumber ? [{ label: "Reference #", value: appointment.appointmentNumber }] : []),
                { label: "Date", value: appointment.date },
                { label: "Time", value: `${appointment.startTime} - ${appointment.endTime}` },
                ...(invoiceResult?.invoiceNumber ? [{ label: "Invoice", value: invoiceResult.invoiceNumber }] : []),
              ],
              cta: "Please take a moment to leave a review for your provider — your feedback helps other patients choose the right care.",
            });
          }
        }
      } catch (notifyError) {
        console.error("Failed to create status update notification:", notifyError);
      }

      // Live push to the patient's open browser tab(s) for status changes they
      // care about. Fire-and-forget — never blocks the response.
      const tickerStatuses = ["approved", "confirmed", "in_progress", "completed", "rejected", "cancelled_by_provider"];
      if (tickerStatuses.includes(status)) {
        import("../chat/ws").then(({ pushToUser }) => {
          storage.getProviderWithUser(appointment.providerId).then((pwu) => {
            const provName = pwu ? `${pwu.user.firstName} ${pwu.user.lastName}` : "Your provider";
            pushToUser(appointment.patientId, {
              type: "appointment_status_update",
              data: {
                appointmentId: appointment.id,
                appointmentNumber: (appointment as any).appointmentNumber ?? null,
                status,
                providerName: provName,
                date: appointment.date,
                startTime: appointment.startTime,
              },
            });
          }).catch(() => {});
        }).catch(() => {});
      }

      res.json({ ...appointment, invoice: invoiceResult, ...(generatedSignOffCode ? { signOffCode: generatedSignOffCode } : {}) });
    } catch (error: any) {
      const cause = (error as any)?.cause;
      console.error(
        "[PATCH /api/appointments/:id/status] error:",
        error?.message ?? error,
        cause ? `| cause: ${cause?.message ?? cause}` : "",
        error?.stack ?? "",
      );
      res.status(500).json({ message: cause?.message || error?.message || "Failed to update appointment status" });
    }
  });

  // Mark a cash/bank-transfer payment as received (provider or admin only)
  app.patch("/api/appointments/:id/payment-status", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { status } = req.body as { status: "completed" | "pending" | "refunded" | "failed" };
      if (!["completed", "pending", "refunded", "failed"].includes(status)) {
        return res.status(400).json({ message: "Invalid payment status" });
      }

      const appointment = await storage.getAppointment(req.params.id);
      if (!appointment) return res.status(404).json({ message: "Appointment not found" });

      // Authorisation: admin OR the provider who owns the appointment
      if (!isAdminRole(req.user?.role)) {
        const provider = await storage.getProviderByUserId(req.user!.id);
        if (!provider || provider.id !== appointment.providerId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      const payment = await storage.getPaymentByAppointment(req.params.id);
      if (!payment) return res.status(404).json({ message: "Payment record not found" });

      const updated = await storage.updatePayment(payment.id, { status });

      // If we just marked it paid AND the appointment is already completed, regenerate / refresh the invoice status.
      if (status === "completed" && appointment.status === "completed" && !appointment.invoiceGenerated) {
        try {
          await createInvoiceForAppointment(appointment.id);
        } catch (invErr) {
          console.error("[routes] invoice generation after payment update failed:", invErr);
          logSystemEvent("failed_job", "error", "invoice-generation",
            `Invoice generation failed (payment update) for appointment ${appointment.id}`,
            { appointmentId: appointment.id, error: (invErr as Error).message, trigger: "payment_update" },
          ).catch(() => {});
        }
      }

      // Payment now successful & appointment completed → generate provider earning record (idempotent)
      if (status === "completed" && appointment.status === "completed") {
        try {
          await storage.recordProviderEarning(appointment.id);
        } catch (earnErr) {
          console.error("[routes] earnings record failed (payment update):", earnErr);
          logSystemEvent("failed_job", "error", "provider-earnings",
            `Provider earnings record failed (payment update) for appointment ${appointment.id}`,
            { appointmentId: appointment.id, error: (earnErr as Error).message, trigger: "payment_update" },
          ).catch(() => {});
        }
      }

      // Notify patient that payment was recorded
      if (status === "completed") {
        // Email payment receipt to the patient
        try {
          const patient = await storage.getUser(appointment.patientId);
          const providerWithUser = await storage.getProviderWithUser(appointment.providerId);
          const _receiptRates = await getRates();
          const _receiptCurr = (patient as any)?.preferredCurrency || countryCurrency((appointment as any).countryCode);
          const _fmtReceipt = (usdAmt: number) => formatSync(usdAmt, _receiptCurr, _receiptRates);
          if (patient) {
            await sendAppointmentEmail({
              to: patient.email,
              subject: "Payment receipt - GoldenLife",
              heading: "Payment received",
              intro: `Hello ${patient.firstName}, we've recorded your payment for your appointment with ${providerWithUser?.user.firstName ?? ""} ${providerWithUser?.user.lastName ?? ""}.`,
              details: [
                ...(appointment.appointmentNumber ? [{ label: "Reference #", value: appointment.appointmentNumber }] : []),
                { label: "Date", value: appointment.date },
                { label: "Time", value: `${appointment.startTime} - ${appointment.endTime}` },
                { label: "Amount", value: _fmtReceipt(Number(payment.amount)) },
                { label: "Method", value: payment.paymentMethod || "card" },
              ],
              cta: "An invoice for your records is available in your patient dashboard.",
            });
          }
          notify.paymentReceived(appointment.patientId, {
            amount: Number(payment.amount).toFixed(0),
            currency: _receiptCurr,
            formattedAmount: _fmtReceipt(Number(payment.amount)),
            appointmentId: appointment.id,
          }).catch(err => console.error("[notify] paymentReceived", err));
        } catch (e) {
          console.error("Payment receipt email failed:", e);
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Update payment status error:", error);
      res.status(500).json({ message: "Failed to update payment status" });
    }
  });

  // Auto-cancel past appointments
  // ============ MEDICAL RECORDS ROUTES ============

  // Get prescriptions for a patient
  app.post("/api/appointments/cleanup", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const appointments = await storage.getAppointmentsByPatient(req.user!.id);
      const now = new Date();
      let cancelledCount = 0;

      // Anything still 'pending' past its start time → cancelled (no-show / never confirmed)
      // Anything 'approved'/'confirmed'/'rescheduled' that is more than 24h past end time
      // and never marked completed → silently cancelled so it doesn't clutter dashboards.
      for (const apt of appointments) {
        const [hh, mm] = apt.startTime.split(':');
        const aptStart = new Date(apt.date);
        aptStart.setHours(parseInt(hh), parseInt(mm), 0, 0);

        const [eh, em] = (apt.endTime || apt.startTime).split(':');
        const aptEnd = new Date(apt.date);
        aptEnd.setHours(parseInt(eh), parseInt(em), 0, 0);
        const dayAfterEnd = new Date(aptEnd.getTime() + 24 * 60 * 60 * 1000);

        if (apt.status === 'pending' && aptStart < now) {
          await storage.updateAppointmentWithEvent(
            apt.id,
            { status: 'cancelled' } as any,
            {
              action: 'cancel' as any,
              actorUserId: null,
              actorRole: null,
              fromStatus: apt.status as any,
              toStatus: 'cancelled' as any,
              reason: '[AUTO] Pending appointment expired (start time passed without confirmation)',
              reasonCode: 'auto_expired_pending',
            },
          );
          cancelledCount++;
        } else if (
          ['approved', 'confirmed', 'rescheduled', 'reschedule_proposed'].includes(apt.status) &&
          dayAfterEnd < now
        ) {
          await storage.updateAppointmentWithEvent(
            apt.id,
            { status: 'cancelled' } as any,
            {
              action: 'cancel' as any,
              actorUserId: null,
              actorRole: null,
              fromStatus: apt.status as any,
              toStatus: 'cancelled' as any,
              reason: '[AUTO] Past-due appointment auto-cancelled (>24h after end, never completed)',
              reasonCode: 'auto_cancelled_stale',
            },
          );
          cancelledCount++;

          // Issue a refund for any paid stale appointment — mirrors cancelStaleConfirmed cron logic.
          // Runs best-effort so a refund failure never blocks the cleanup response.
          (async () => {
            try {
              const alreadyProcessed = (apt as any).refundStatus === 'processed';
              if (alreadyProcessed) return;

              // 1. Wallet debit refund
              const debits = await db
                .select()
                .from(walletTransactions)
                .where(and(
                  eq(walletTransactions.referenceType, 'appointment'),
                  eq(walletTransactions.referenceId, apt.id),
                  eq(walletTransactions.type, 'debit'),
                ));
              const totalDebited = debits.reduce((sum, d) => sum + Math.abs(Number(d.amount || 0)), 0);
              if (totalDebited > 0) {
                await storage.refundWallet(apt.patientId, totalDebited, {
                  description: `Refund for auto-cancelled appointment ${(apt as any).appointmentNumber || apt.id}`,
                  referenceType: 'appointment',
                  referenceId: apt.id,
                  idempotencyKey: `appointment:${apt.id}:cleanup-refund`,
                });
                await pool.query(
                  `UPDATE appointments SET refund_status = 'processed' WHERE id = $1`,
                  [apt.id],
                ).catch(() => {});
                await pool.query(
                  `UPDATE payments SET refunded_amount = COALESCE(refunded_amount,0) + $1 WHERE appointment_id = $2`,
                  [totalDebited, apt.id],
                ).catch(() => {});
                return;
              }

              // 2. Stripe card refund fallback
              const payment = await storage.getPaymentByAppointment(apt.id);
              const stripe = getStripe();
              if (
                stripe && payment &&
                payment.paymentMethod === 'card' &&
                payment.stripePaymentId &&
                payment.status === 'completed' &&
                !(payment as any).stripeRefundId
              ) {
                const refundAmt = Math.max(
                  0,
                  Number(payment.amount || 0) - Number((payment as any).refundedAmount || 0),
                );
                if (refundAmt > 0) {
                  const stripeRefund = await stripe.refunds.create(
                    { payment_intent: payment.stripePaymentId, amount: Math.round(refundAmt * 100) },
                    { idempotencyKey: `appointment:${apt.id}:cleanup-card-refund` },
                  );
                  await pool.query(
                    `UPDATE payments SET refunded_amount = COALESCE(refunded_amount,0) + $1, stripe_refund_id = $2 WHERE id = $3`,
                    [refundAmt, stripeRefund.id, payment.id],
                  ).catch(() => {});
                  await pool.query(
                    `UPDATE appointments SET refund_status = 'processed' WHERE id = $1`,
                    [apt.id],
                  ).catch(() => {});
                  console.log(`[cleanup] Stripe refund ${stripeRefund.id} ($${refundAmt}) for appt ${apt.id}`);
                }
              }
            } catch (refundErr) {
              console.error(`[cleanup] refund failed for appt ${apt.id}:`, refundErr);
            }
          })();
        }
      }
      res.json({ message: "Past appointments cleaned up", cancelledCount });
    } catch (error) {
      console.error("Cleanup error:", error);
      res.status(500).json({ message: "Failed to cleanup appointments" });
    }
  });

  // ============================================================
  // Unified appointment action endpoint — single source of truth
  // for CANCEL / RESCHEDULE / NO_SHOW. Replaces the old per-action
  // endpoints. Validates time rules, status transitions, refunds,
  // and writes an appointment_events audit row for every action.
  // ============================================================
  app.post("/api/appointments/:id/action", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const actionSchema = z.object({
        action: z.enum(["cancel", "reschedule", "no_show", "propose"]),
        reason: z.string().max(2000).optional(),
        reasonCode: z.string().max(64).optional(),
        // Reschedule-only:
        newDate: z.string().optional(),
        newStartTime: z.string().optional(),
        newEndTime: z.string().optional(),
      });
      const parsed = actionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
      }
      const { action, reason, reasonCode, newDate, newStartTime, newEndTime } = parsed.data;

      const existing = await storage.getAppointment(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      const role = (req.user?.role ?? "patient") as ActorRole;

      // Ownership check
      let ownsAppointment = false;
      if (isAdminRole(role)) {
        ownsAppointment = true;
      } else if (role === "patient") {
        ownsAppointment = existing.patientId === req.user!.id;
      } else if (role === "provider") {
        const provider = await storage.getProviderByUserId(req.user!.id);
        ownsAppointment = !!provider && provider.id === existing.providerId;
      }

      const hours = hoursUntilStart(existing.date, existing.startTime);

      // W1: Check free_cancellations membership benefit — allows late cancellations
      let hasFreeCancel = false;
      if (action === "cancel" && role === "patient") {
        try {
          const patientPkg = await storage.getActiveUserPackage(req.user!.id);
          if (patientPkg) {
            const fcBenefit = patientPkg.benefits.find(b => b.benefitKey === "free_cancellations");
            if (fcBenefit && Number(fcBenefit.benefitValue) > 0) {
              // Count how many free cancellations the patient has already used
              const { rows: usedRows } = await pool.query(
                `SELECT COUNT(*) AS cnt FROM membership_benefit_usage
                  WHERE user_package_id = $1 AND benefit_key = 'free_cancellations'`,
                [patientPkg.id],
              );
              const usedCount = Number(usedRows[0]?.cnt ?? 0);
              if (usedCount < Number(fcBenefit.benefitValue)) {
                hasFreeCancel = true;
                // Log this use of the free_cancellations benefit (fire-and-forget)
                storage.recordBenefitUsage({
                  userPackageId: patientPkg.id,
                  appointmentId: existing.id,
                  benefitKey: "free_cancellations" as any,
                  amountUsed: "1",
                  notes: "Late cancellation waived by free_cancellations benefit",
                } as any).catch(() => {});
              }
            }
          }
        } catch (fcErr) {
          console.warn("[action] free_cancellations check failed (non-fatal):", (fcErr as Error).message);
        }
      }

      const permit = checkAction({
        action: action as AppointmentAction,
        actorRole: role,
        currentStatus: existing.status,
        hoursBeforeStart: hours,
        ownsAppointment,
        bypassPatientCancelHours: hasFreeCancel,
      });
      if (!permit.ok) {
        return res.status(permit.status).json({ message: permit.message });
      }

      // Reschedule/propose must come with new date/time
      const updates: Partial<typeof existing> = { status: permit.toStatus as any };
      if (action === "reschedule" || action === "propose") {
        if (!newDate || !newStartTime || !newEndTime) {
          return res.status(400).json({ message: `${action === "propose" ? "Propose" : "Reschedule"} requires newDate, newStartTime, newEndTime.` });
        }
        const newHours = hoursUntilStart(newDate, newStartTime);
        if (newHours !== null && newHours < 0) {
          return res.status(400).json({ message: "New appointment time must be in the future." });
        }
        // For reschedule: apply the new time immediately.
        // For propose: keep original date/time; the proposed time is stored in event metadata only.
        if (action === "reschedule") {
          updates.date = newDate as any;
          updates.startTime = newStartTime as any;
          updates.endTime = newEndTime as any;
          updates.isRescheduled = true as any;
          // Preserve the original slot on the first reschedule only.
          if (!(existing as any).isRescheduled) {
            (updates as any).originalDate = existing.date;
            (updates as any).originalStartTime = existing.startTime;
            (updates as any).originalEndTime = existing.endTime;
          }
        }

        // Vacation / time-off check for the new date.
        try {
          const timeOff = await storage.isProviderOnTimeOff(existing.providerId, newDate);
          if (timeOff) {
            return res.status(400).json({
              message: `Provider is unavailable on ${newDate} (time off${(timeOff as any).reason ? `: ${(timeOff as any).reason}` : ""}). Please choose another date.`,
            });
          }
        } catch { /* non-fatal */ }

        // Single-date availability exception check.
        try {
          const { rows: excRows } = await pool.query(
            `SELECT date FROM availability_exceptions WHERE provider_id = $1 AND date = $2`,
            [existing.providerId, newDate],
          );
          if (excRows.length > 0) {
            return res.status(400).json({
              message: `Provider is not available on ${newDate}. Please choose another date.`,
            });
          }
        } catch { /* non-fatal */ }

        // Minimum-gap enforcement — mirrors the original booking constraint.
        try {
          const provRow = await storage.getProvider(existing.providerId);
          const minGap = Number((provRow as any)?.minGapMinutes ?? 0);
          if (minGap > 0) {
            const toMinsR = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
            const reqStart = toMinsR(newStartTime);
            const reqEnd   = toMinsR(newEndTime);
            const { rows: gapRows } = await pool.query(
              `SELECT start_time, end_time FROM appointments
               WHERE provider_id = $1 AND date = $2
                 AND status = ANY(ARRAY['pending','approved','confirmed','in_progress']::appointment_status[])
                 AND id != $3`,
              [existing.providerId, newDate, existing.id],
            );
            for (const r of gapRows) {
              const s = toMinsR(r.start_time);
              const e = toMinsR(r.end_time);
              if (Math.abs(reqStart - e) < minGap || Math.abs(s - reqEnd) < minGap) {
                return res.status(409).json({
                  message: `Provider requires a minimum ${minGap}-minute gap between appointments.`,
                  errorCode: "MIN_GAP_VIOLATION",
                });
              }
            }
          }
        } catch (gapErr) {
          console.error("[reschedule] min-gap check failed (continuing):", gapErr);
        }

        // Conflict check: ensure the new slot is free before committing.
        // excludeAppointmentId prevents the appointment from blocking itself.
        try {
          let svcBufBefore = 0;
          let svcBufAfter = 0;
          if ((existing as any).serviceId) {
            try {
              const svc = await storage.getService((existing as any).serviceId);
              svcBufBefore = Number(svc?.bufferBefore ?? 0);
              svcBufAfter  = Number(svc?.bufferAfter  ?? 0);
            } catch { /* non-fatal */ }
          }
          const reschedConflict = await checkConflict({
            providerId: existing.providerId,
            practitionerId: (existing as any).practitionerId ?? null,
            date: newDate,
            startTime: newStartTime,
            endTime: newEndTime,
            visitType: ((existing as any).visitType as "clinic" | "home" | "online") ?? "clinic",
            serviceBufferBefore: svcBufBefore,
            serviceBufferAfter:  svcBufAfter,
            excludeAppointmentId: existing.id,
          });
          if (reschedConflict.result.hasConflict) {
            return res.status(409).json({
              message: reschedConflict.result.message,
              conflictType: reschedConflict.result.conflictType,
              effectiveStart: reschedConflict.result.effectiveStart,
              effectiveEnd:   reschedConflict.result.effectiveEnd,
            });
          }
        } catch (conflictErr) {
          console.error("[reschedule] conflict check failed (fail-closed):", conflictErr);
          return res.status(503).json({
            error: "Scheduling system conflict engine is temporarily busy. Please retry in a few moments.",
          });
        }
      }

      // Compute refund quote (cancel only — reschedule/no_show return zero)
      // W4: Load DB-driven refund rule for this country (falls back to hardcoded defaults)
      const totalPaid = Number(existing.totalAmount || 0);
      let activeRefundRule: RefundRule | null = null;
      try {
        const apptCountry = (existing as any).countryCode ?? null;
        if (apptCountry) {
          const { rows: ruleRows } = await pool.query(
            `SELECT * FROM refund_rules
              WHERE is_active = true
                AND (country_code = $1 OR country_code = 'all')
              ORDER BY CASE WHEN country_code = $1 THEN 0 ELSE 1 END
              LIMIT 1`,
            [apptCountry],
          );
          if (ruleRows[0]) activeRefundRule = ruleRows[0];
        }
      } catch (ruleErr) {
        console.warn("[action] refund rule load failed (using defaults):", (ruleErr as Error).message);
      }
      const quote = quoteRefundWithRule({
        action: action as AppointmentAction,
        actorRole: role,
        totalPaid,
        hoursBeforeStart: hours,
      }, activeRefundRule);

      // Stamp cancellation metadata onto the appointment updates
      if (action === "cancel") {
        (updates as any).cancelledBy = role;
        (updates as any).cancelledAt = new Date();
        (updates as any).refundAmount = String(quote.amount);
        (updates as any).refundStatus = quote.amount > 0 ? "pending" : "none";
      }

      // Atomic: update appointment + write audit event in one transaction so
      // the status flip and the audit row are always consistent. We record
      // the policy-promised refund amount (quote.amount); the actual refund
      // is processed separately after the tx and tracked in wallet_transactions.
      const txRes = await storage.updateAppointmentWithEvent(
        existing.id,
        updates as any,
        {
          action: action as any,
          actorUserId: req.user?.id ?? null,
          actorRole: role as any,
          fromStatus: existing.status as any,
          toStatus: permit.toStatus as any,
          reason: reason || null,
          reasonCode: reasonCode || null,
          refundAmount: String(quote.amount) as any,
          metadata: action === "reschedule"
            ? JSON.stringify({ from: { date: existing.date, startTime: existing.startTime, endTime: existing.endTime }, to: { date: newDate, startTime: newStartTime, endTime: newEndTime } })
            : action === "propose"
            ? JSON.stringify({ proposed: { date: newDate, startTime: newStartTime, endTime: newEndTime }, original: { date: existing.date, startTime: existing.startTime, endTime: existing.endTime } })
            : null,
        },
      );
      if (!txRes) {
        return res.status(500).json({ message: "Failed to update appointment" });
      }
      const updated = txRes.appointment;
      const event = txRes.event;

      // TZ Sprint — when rescheduled to a new date/time, update UTC timestamps (fire-and-forget).
      if (action === "reschedule" && newDate && newStartTime) {
        (async () => {
          try {
            const prov = await storage.getProvider(existing.providerId);
            if (prov) {
              const provTz = await getProviderTimezone(existing.providerId, (prov as any).userId);
              const newStartUtc = localToUTC(newDate, newStartTime, provTz);
              const newEndUtc   = localToUTC(newDate, newEndTime || newStartTime, provTz);
              if (!isNaN(newStartUtc.getTime())) {
                await pool.query(
                  `UPDATE appointments SET provider_timezone=$1, start_at=$2, end_at=$3 WHERE id=$4`,
                  [provTz, newStartUtc.toISOString(), newEndUtc.toISOString(), updated.id],
                );
              }
            }
          } catch (e: any) { console.warn("[reschedule] TZ update failed (non-fatal):", e?.message); }
        })();
      }

      // Free the slot when terminal (cancel / no_show)
      const isTerminalNow = ["cancelled_by_patient", "cancelled_by_provider", "no_show"].includes(permit.toStatus!);
      if (isTerminalNow) {
        // Release the explicit time_slot row if one was reserved (published-slot bookings).
        // Fall back to freeing by coordinates for synthetic-slot bookings with no timeSlotId.
        try {
          if (updated.timeSlotId) {
            await storage.updateTimeSlot(updated.timeSlotId, { isBooked: false });
          } else if (updated.providerId && updated.date && updated.startTime) {
            await pool.query(
              `UPDATE time_slots SET is_booked = false, version = version + 1
               WHERE provider_id = $1 AND date::date = $2::date AND start_time = $3 AND is_booked = true`,
              [updated.providerId, updated.date, updated.startTime],
            );
          }
        } catch (e) {
          console.error("[action] failed to free slot:", e);
        }
        // Notify waitlisted patients that a slot just opened. Runs for ALL
        // terminal cancellations — including synthetic-slot bookings that have
        // no timeSlotId — so the waitlist is always drained. Best-effort: any
        // failure here must not block the cancellation response.
        notifyWaitlistForFreedSlot({
          providerId: updated.providerId,
          date: updated.date,
          startTime: updated.startTime,
          endTime: updated.endTime,
        }).catch((e) => console.error("[action] waitlist notify failed:", e));
      }

      // Process wallet refund for cancellations (post-tx; the wallet ledger
      // is the source of truth for what actually moved).
      // Safety: skip if already processed to prevent double-refunds.
      let refundedAmount = 0;
      const alreadyProcessed = (updated as any).refundStatus === "processed";
      if (action === "cancel" && quote.amount > 0 && !alreadyProcessed) {
        try {
          const debits = await db
            .select()
            .from(walletTransactions)
            .where(and(
              eq(walletTransactions.referenceType, "appointment"),
              eq(walletTransactions.referenceId, updated.id),
              eq(walletTransactions.type, "debit"),
            ));
          const totalDebited = debits.reduce(
            (sum, d) => sum + Math.abs(Number(d.amount || 0)),
            0,
          );
          // quote.amount is in LOCAL currency (HUF/EUR) while totalDebited is in
          // USD (wallet ledger is always USD). Use the policy percentage directly
          // on totalDebited so we never mix currencies in the Math.min comparison.
          let toRefund = 0;
          if (quote.policy === "full" || quote.policy === "provider_full") {
            toRefund = totalDebited;
          } else if (quote.policy === "partial") {
            const pct = activeRefundRule?.partial_refund_percent != null
              ? Number(activeRefundRule.partial_refund_percent) / 100
              : PARTIAL_REFUND_PERCENT;
            toRefund = Math.round(totalDebited * pct * 100) / 100;
          }
          // policy "none" → toRefund stays 0
          if (toRefund > 0) {
            await storage.refundWallet(updated.patientId, toRefund, {
              description: `Refund for cancelled appointment ${updated.appointmentNumber || updated.id}`,
              referenceType: "appointment",
              referenceId: updated.id,
              idempotencyKey: `appointment:${updated.id}:cancel-refund`,
            });
            refundedAmount = toRefund;

            // Mark refund as processed and tally on payment row
            await db
              .update(appointments)
              .set({ refundStatus: "processed" } as any)
              .where(eq(appointments.id, updated.id));

            // Update payments.refunded_amount for audit trail (best-effort)
            try {
              await pool.query(
                `UPDATE payments SET refunded_amount = COALESCE(refunded_amount,0) + $1 WHERE appointment_id = $2`,
                [toRefund, updated.id],
              );
            } catch (payErr) {
              console.error("[action] payments.refunded_amount update failed:", payErr);
            }
          } else {
            // No wallet debit found — check for a Stripe card payment and
            // issue a refund directly through the API. This covers bookings
            // paid by card that never touched the internal wallet.
            try {
              const payment = await storage.getPaymentByAppointment(updated.id);
              const stripe = getStripe();
              if (
                stripe &&
                payment &&
                payment.paymentMethod === "card" &&
                payment.stripePaymentId &&
                payment.status === "completed" &&
                !payment.stripeRefundId  // guard: skip if a Stripe refund is already recorded (prevents duplicate refund on replay)
              ) {
                const refundAmt = Math.min(
                  quote.amount,
                  Number(payment.amount || 0) - Number(payment.refundedAmount || 0),
                );
                if (refundAmt > 0) {
                  const stripeRefund = await stripe.refunds.create(
                    {
                      payment_intent: payment.stripePaymentId,
                      amount: Math.round(refundAmt * 100),
                    },
                    { idempotencyKey: `appointment:${updated.id}:card-refund` },
                  );
                  refundedAmount = refundAmt;
                  // Persist refund ID + running total on the payment row
                  await pool.query(
                    `UPDATE payments
                     SET refunded_amount = COALESCE(refunded_amount, 0) + $1,
                         stripe_refund_id = $2
                     WHERE id = $3`,
                    [refundAmt, stripeRefund.id, payment.id],
                  );
                  await db
                    .update(appointments)
                    .set({ refundStatus: "processed" } as any)
                    .where(eq(appointments.id, updated.id));
                  console.log(
                    `[action] Stripe card refund issued: ${stripeRefund.id} ($${refundAmt}) for appointment ${updated.id}`,
                  );
                } else {
                  await db
                    .update(appointments)
                    .set({ refundStatus: "none" } as any)
                    .where(eq(appointments.id, updated.id));
                }
              } else {
                await db
                  .update(appointments)
                  .set({ refundStatus: "none" } as any)
                  .where(eq(appointments.id, updated.id));
              }
            } catch (cardRefundErr) {
              console.error("[action] Stripe card refund failed:", cardRefundErr);
              await db
                .update(appointments)
                .set({ refundStatus: "failed" } as any)
                .where(eq(appointments.id, updated.id));
            }
          }
        } catch (refundErr) {
          console.error("[action] wallet refund failed:", refundErr);
        }
      }

      // Notify counter-party + dispatch
      try {
        const providerWithUser = await storage.getProviderWithUser(updated.providerId);
        const patient = await storage.getUser(updated.patientId);
        const apptRef = updated.appointmentNumber ? ` (${updated.appointmentNumber})` : "";
        const actorLabel = role === "patient" ? "patient" : role === "provider" ? "provider" : "admin";

        // Direct in-app notify for no_show only.
        // cancel + reschedule are covered by notify.appointmentCancelled / appointmentRescheduled
        // below, which also fan out to email/SMS/push — sending both would duplicate in-app.
        if (action === "no_show") {
          const recipientUserIds: string[] = [];
          if (role === "patient") {
            if (providerWithUser?.userId) recipientUserIds.push(providerWithUser.userId);
          } else if (role === "provider") {
            recipientUserIds.push(updated.patientId);
          } else {
            // admin — notify both patient and provider
            recipientUserIds.push(updated.patientId);
            if (providerWithUser?.userId) recipientUserIds.push(providerWithUser.userId);
          }
          for (const uid of recipientUserIds) {
            await storage.createUserNotification({
              userId: uid,
              type: "appointment",
              title: "No-show recorded",
              message: `Appointment${apptRef} on ${updated.date} was marked as a no-show.`,
              isRead: false,
            });
          }
        }

        if (action === "cancel" && patient) {
          const _cancelRates = await getRates();
          const _cancelCurr = (patient as any).preferredCurrency || countryCurrency((existing as any).countryCode);
          await sendAppointmentEmail({
            to: patient.email,
            subject: "Appointment cancelled - GoldenLife",
            heading: "Appointment cancelled",
            intro: `Hello ${patient.firstName}, your appointment with ${providerWithUser?.user.firstName ?? ""} ${providerWithUser?.user.lastName ?? ""} has been cancelled.`,
            details: [
              { label: "Date", value: existing.date },
              { label: "Time", value: `${existing.startTime} - ${existing.endTime}` },
              { label: "Cancelled by", value: actorLabel },
              ...(refundedAmount > 0 ? [{ label: "Refund", value: formatSync(refundedAmount, _cancelCurr, _cancelRates) }] : []),
            ],
            cta: actorLabel === "patient" ? undefined : "If this was unexpected, you can rebook from your dashboard.",
          });
        }

        // Multi-channel dispatch (existing helper supports cancel only)
        if (action === "cancel") {
          notify.appointmentCancelled(updated.patientId, {
            date: existing.date, time: existing.startTime, appointmentId: updated.id,
          }).catch(err => console.error("[notify] cancel patient", err));
          if (providerWithUser?.userId) {
            notify.appointmentCancelled(providerWithUser.userId, {
              date: existing.date, time: existing.startTime, appointmentId: updated.id,
            }).catch(err => console.error("[notify] cancel provider", err));
          }
        }
        if (action === "reschedule") {
          notify.appointmentRescheduled(updated.patientId, {
            date: updated.date, time: updated.startTime, appointmentId: updated.id,
          }).catch(err => console.error("[notify] reschedule patient", err));
          if (providerWithUser?.userId) {
            notify.appointmentRescheduled(providerWithUser.userId, {
              date: updated.date, time: updated.startTime, appointmentId: updated.id,
            }).catch(err => console.error("[notify] reschedule provider", err));
          }
        }
        if (action === "propose") {
          // Notify the patient that a new time has been proposed — they need to accept or reject.
          notify.appointmentRescheduled(updated.patientId, {
            date: newDate!, time: newStartTime!, appointmentId: updated.id,
          }).catch(err => console.error("[notify] propose patient", err));
        }
      } catch (e) {
        console.error("[action] notification dispatch failed:", e);
      }

      // Reflect processed refund status in the returned appointment object so
      // the client immediately sees "processed" rather than the stale "pending"
      // that was written before the wallet credit ran.
      if (refundedAmount > 0) {
        (updated as any).refundStatus = "processed";
        (updated as any).refundAmount = String(refundedAmount);
      }
      res.json({ appointment: updated, event, refund: { amount: refundedAmount, quote } });
    } catch (error) {
      console.error("[POST /api/appointments/:id/action] error:", error);
      res.status(500).json({ message: "Failed to process appointment action" });
    }
  });

  // Read-only audit trail of every action taken on an appointment.
  app.get("/api/appointments/:id/events", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const existing = await storage.getAppointment(req.params.id);
      if (!existing) return res.status(404).json({ message: "Appointment not found" });
      if (!isAdminRole(req.user?.role)) {
        let allowed = false;
        if (req.user?.role === "patient") allowed = existing.patientId === req.user.id;
        if (req.user?.role === "provider") {
          const provider = await storage.getProviderByUserId(req.user.id);
          allowed = !!provider && provider.id === existing.providerId;
        }
        if (!allowed) return res.status(403).json({ message: "Access denied" });
      }
      const events = await storage.getAppointmentEvents(existing.id);
      res.json(events);
    } catch (error) {
      console.error("[GET /api/appointments/:id/events] error:", error);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  // Quote endpoint: returns refund preview without performing the action.
  // Used by the action dialog to show the patient/provider what will happen.
  app.get("/api/appointments/:id/action-quote", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const action = String(req.query.action || "") as AppointmentAction;
      if (!APPOINTMENT_ACTIONS.includes(action)) {
        return res.status(400).json({ message: "Unknown action" });
      }
      const existing = await storage.getAppointment(req.params.id);
      if (!existing) return res.status(404).json({ message: "Appointment not found" });

      const role = (req.user?.role ?? "patient") as ActorRole;
      let ownsAppointment = false;
      if (isAdminRole(role)) ownsAppointment = true;
      else if (role === "patient") ownsAppointment = existing.patientId === req.user!.id;
      else if (role === "provider") {
        const provider = await storage.getProviderByUserId(req.user!.id);
        ownsAppointment = !!provider && provider.id === existing.providerId;
      }

      const hours = hoursUntilStart(existing.date, existing.startTime);
      const permit = checkAction({
        action,
        actorRole: role,
        currentStatus: existing.status,
        hoursBeforeStart: hours,
        ownsAppointment,
      });
      const quote = quoteRefundWithRule({
        action,
        actorRole: role,
        totalPaid: Number(existing.totalAmount || 0),
        hoursBeforeStart: hours,
      });
      // Return role-appropriate cancel reasons so providers never see
      // patient-centric codes (feeling_better, financial, etc.) and vice-versa.
      const reasonCodes = (() => {
        if (action === "cancel") {
          if (role === "provider" || role === "admin") return PROVIDER_CANCEL_REASON_CODES;
          return PATIENT_CANCEL_REASON_CODES;
        }
        return REASON_CODES[action];
      })();
      res.json({
        canPerform: permit.ok,
        reason: permit.ok ? undefined : permit.message,
        toStatus: permit.toStatus,
        hoursBeforeStart: hours,
        refund: quote,
        reasonCodes,
        // The refund.amount is denominated in the booking currency so the UI
        // can format it correctly without a USD conversion.
        displayCurrency: (existing as any).displayCurrency ?? "USD",
      });
    } catch (error) {
      console.error("[GET /api/appointments/:id/action-quote] error:", error);
      res.status(500).json({ message: "Failed to compute quote" });
    }
  });

  // ── Follow-up recommendation (provider → patient) ────────────────────────────
  // Provider can flag a completed appointment as "follow-up recommended", which
  // sends the patient a notification with a rebook CTA. Idempotent: a second
  // call on the same appointment just returns 200 without re-notifying.
  app.post("/api/appointments/:id/recommend-followup", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const appt = await storage.getAppointment(req.params.id);
      if (!appt) return res.status(404).json({ message: "Appointment not found" });

      // Only the owning provider or an admin can recommend follow-ups
      if (!isAdminRole(req.user?.role)) {
        if (req.user?.role !== "provider") {
          return res.status(403).json({ message: "Only providers can recommend follow-ups" });
        }
        const provider = await storage.getProviderByUserId(req.user!.id);
        if (!provider || provider.id !== appt.providerId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      if (appt.status !== "completed") {
        return res.status(400).json({ message: "Follow-ups can only be recommended for completed appointments" });
      }

      const { note } = req.body as { note?: string };
      const apptRef = appt.appointmentNumber ? ` (${appt.appointmentNumber})` : "";
      const message = note
        ? `Your provider recommends a follow-up after your appointment${apptRef}: "${note}". Book your next visit when you're ready.`
        : `Your provider recommends scheduling a follow-up visit after your appointment${apptRef}. Click to book at your convenience.`;

      // Record the timestamp and flag on the appointment
      const pool2 = (await import("../db")).pool;
      await pool2.query(
        `UPDATE appointments SET follow_up_recommended_at = NOW(), follow_up_recommended = TRUE, updated_at = NOW() WHERE id = $1`,
        [appt.id],
      ).catch(() => {});

      await storage.createUserNotification({
        userId: appt.patientId,
        type: "appointment",
        title: "Follow-up recommended by your provider",
        message,
        isRead: false,
      } as any);

      // Track analytics (fire-and-forget)
      const { trackEvent } = await import("../services/analyticsTracker");
      trackEvent({
        eventType: "followup_scheduled",
        userId: appt.patientId,
        providerId: appt.providerId,
        metadata: { appointmentId: appt.id, triggeredBy: "provider", hasNote: !!note },
      }).catch(() => {});

      return res.json({ success: true, message: "Follow-up recommendation sent to patient", followUpRecommendedAt: new Date().toISOString() });
    } catch (err: any) {
      console.error("[recommend-followup] error:", err?.message);
      return res.status(500).json({ message: err?.message || "Failed to send follow-up recommendation" });
    }
  });

  // ── Patient: Accept or reject a provider's reschedule proposal ──────────────
  // Provider uses action=propose → reschedule_proposed status, proposed time in event metadata.
  // Patient calls this endpoint to accept (→ rescheduled) or reject (→ confirmed).
  app.post("/api/appointments/:id/reschedule-response", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const bodySchema = z.object({
        accept: z.boolean(),
        reason: z.string().max(2000).optional(),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
      }
      const { accept, reason } = parsed.data;

      const existing = await storage.getAppointment(req.params.id);
      if (!existing) return res.status(404).json({ message: "Appointment not found" });

      // Only patient or admin can respond to a proposal
      const role = (req.user?.role ?? "patient") as string;
      let allowed = isAdminRole(role);
      if (!allowed && role === "patient") allowed = existing.patientId === req.user!.id;
      if (!allowed) return res.status(403).json({ message: "Only the patient or admin can respond to a reschedule proposal." });

      if (existing.status !== "reschedule_proposed") {
        return res.status(409).json({ message: "This appointment does not have a pending reschedule proposal." });
      }

      // Find the latest "propose" event to get the proposed time from its metadata
      const events = await storage.getAppointmentEvents(existing.id);
      const proposeEvent = [...events].reverse().find((e: any) => e.action === "propose");

      let proposedTime: { date: string; startTime: string; endTime: string } | null = null;
      if (proposeEvent?.metadata) {
        try {
          const meta = JSON.parse(proposeEvent.metadata as string);
          if (meta.proposed?.date) proposedTime = meta.proposed;
        } catch { /* malformed metadata */ }
      }

      const updatesAppt: Record<string, any> = {};
      let toStatus: string;

      if (accept) {
        if (!proposedTime) {
          return res.status(422).json({ message: "Proposed time not found in appointment history. Please contact support." });
        }
        toStatus = "rescheduled";
        updatesAppt.date = proposedTime.date;
        updatesAppt.startTime = proposedTime.startTime;
        updatesAppt.endTime = proposedTime.endTime;
        updatesAppt.isRescheduled = true;
        // Preserve the original date/time on the first-ever reschedule
        if (!(existing as any).isRescheduled) {
          updatesAppt.originalDate = existing.date;
          updatesAppt.originalStartTime = existing.startTime;
          updatesAppt.originalEndTime = existing.endTime;
        }
      } else {
        // Patient rejected the proposal → auto-cancel with full refund.
        // Provider initiated the disruption so the cancel is attributed to them.
        toStatus = "cancelled_by_provider";
        updatesAppt.cancelledBy = "provider";
        updatesAppt.cancelledAt = new Date();
        updatesAppt.refundStatus = "pending";
        updatesAppt.refundAmount = String(Number(existing.totalAmount ?? 0));
      }

      updatesAppt.status = toStatus;

      const txRes = await storage.updateAppointmentWithEvent(
        existing.id,
        updatesAppt as any,
        {
          action: "reschedule_response" as any,
          actorUserId: req.user?.id ?? null,
          actorRole: role as any,
          fromStatus: "reschedule_proposed" as any,
          toStatus: toStatus as any,
          reason: reason || (accept ? "Patient accepted reschedule proposal." : "Patient rejected reschedule proposal — appointment auto-cancelled with full refund."),
          reasonCode: accept ? "accepted" : "rejected",
          refundAmount: accept ? "0" : String(Number(existing.totalAmount ?? 0)),
          metadata: accept && proposedTime
            ? JSON.stringify({ accepted: true, appliedTime: proposedTime })
            : JSON.stringify({ accepted: false, autoCancel: true }),
        },
      );

      if (!txRes) return res.status(500).json({ message: "Failed to update appointment" });

      const updated = txRes.appointment;

      // TZ Sprint — when accept applies the proposed time, update UTC timestamps (fire-and-forget).
      if (accept && proposedTime) {
        (async () => {
          try {
            const propDate  = proposedTime.date;
            const propStart = proposedTime.startTime;
            const propEnd   = proposedTime.endTime;
            if (propDate && propStart) {
              const prov = await storage.getProvider(existing.providerId);
              if (prov) {
                const provTz = await getProviderTimezone(existing.providerId, (prov as any).userId);
                const newStartUtc = localToUTC(propDate, propStart, provTz);
                const newEndUtc   = localToUTC(propDate, propEnd || propStart, provTz);
                if (!isNaN(newStartUtc.getTime())) {
                  await pool.query(
                    `UPDATE appointments SET provider_timezone=$1, start_at=$2, end_at=$3 WHERE id=$4`,
                    [provTz, newStartUtc.toISOString(), newEndUtc.toISOString(), updated.id],
                  );
                }
              }
            }
          } catch (e: any) { console.warn("[reschedule-response] TZ update failed (non-fatal):", e?.message); }
        })();
      }

      const providerWithUser = await storage.getProviderWithUser(existing.providerId).catch(() => null);

      // When rejected: issue full refund to patient wallet (same logic as provider cancel)
      let refundedAmount = 0;
      if (!accept) {
        try {
          const debits = await db
            .select()
            .from(walletTransactions)
            .where(and(
              eq(walletTransactions.referenceType, "appointment"),
              eq(walletTransactions.referenceId, existing.id),
              eq(walletTransactions.type, "debit"),
            ));
          const totalDebited = debits.reduce(
            (sum, d) => sum + Math.abs(Number(d.amount ?? 0)),
            0,
          );
          if (totalDebited > 0) {
            await storage.refundWallet(existing.patientId, totalDebited, {
              description: `Full refund — reschedule rejected, appointment ${(existing as any).appointmentNumber || existing.id} cancelled`,
              referenceType: "appointment",
              referenceId: existing.id,
              idempotencyKey: `appointment:${existing.id}:reject-reschedule-refund`,
            });
            refundedAmount = totalDebited;
            await db
              .update(appointments)
              .set({ refundStatus: "processed" } as any)
              .where(eq(appointments.id, existing.id));
          } else {
            // No wallet debit → check for Stripe card payment and refund directly
            try {
              const payment = await storage.getPaymentByAppointment(existing.id);
              const stripe = getStripe();
              if (stripe && payment?.paymentMethod === "card" && payment?.stripePaymentId && payment?.status === "completed") {
                const refundAmt = Number(payment.amount ?? 0);
                if (refundAmt > 0) {
                  const stripeRefund = await stripe.refunds.create(
                    { payment_intent: payment.stripePaymentId, amount: Math.round(refundAmt * 100) },
                    { idempotencyKey: `appointment:${existing.id}:reject-card-refund` },
                  );
                  refundedAmount = refundAmt;
                  await pool.query(
                    `UPDATE payments SET refunded_amount = COALESCE(refunded_amount,0) + $1, stripe_refund_id = $2 WHERE id = $3`,
                    [refundAmt, stripeRefund.id, payment.id],
                  );
                  await db.update(appointments).set({ refundStatus: "processed" } as any).where(eq(appointments.id, existing.id));
                }
              }
            } catch (cardRefundErr) {
              console.error("[reschedule-response] Stripe card refund failed:", cardRefundErr);
            }
          }
          // Free the time slot — try by ID first, fall back to coordinates.
          if (updated.timeSlotId) {
            storage.updateTimeSlot(updated.timeSlotId, { isBooked: false }).catch((e: any) =>
              console.error("[reschedule-response] slot free by id failed:", e?.message),
            );
          } else if (updated.providerId && updated.date && updated.startTime) {
            pool.query(
              `UPDATE time_slots SET is_booked = false, version = version + 1
               WHERE provider_id = $1 AND date::date = $2::date AND start_time = $3 AND is_booked = true`,
              [updated.providerId, updated.date, updated.startTime],
            ).catch((e: any) =>
              console.error("[reschedule-response] slot free by coords failed:", e?.message),
            );
          }
          notifyWaitlistForFreedSlot({
            providerId: updated.providerId,
            date: updated.date,
            startTime: updated.startTime,
            endTime: updated.endTime,
          }).catch((e: any) => console.error("[reschedule-response] waitlist notify failed:", e));
        } catch (refundErr) {
          console.error("[reschedule-response] refund processing failed:", refundErr);
        }
      }

      // Multi-channel dispatch — notify.appointmentRescheduled/Cancelled already creates
      // the in-app notification via dispatchNotification. Direct createUserNotification
      // calls here would duplicate the in-app entry for both parties.
      // Multi-channel dispatch
      if (accept && proposedTime) {
        notify.appointmentRescheduled(updated.patientId, {
          date: proposedTime.date, time: proposedTime.startTime, appointmentId: updated.id,
        }).catch(err => console.error("[notify] reschedule-accepted patient", err));
        if (providerWithUser?.userId) {
          notify.appointmentRescheduled(providerWithUser.userId, {
            date: proposedTime.date, time: proposedTime.startTime, appointmentId: updated.id,
          }).catch(err => console.error("[notify] reschedule-accepted provider", err));
        }
      } else if (!accept) {
        notify.appointmentCancelled(existing.patientId, {
          date: existing.date, time: existing.startTime ?? "", appointmentId: existing.id,
        }).catch(err => console.error("[notify] reschedule-rejected cancel patient", err));
        if (providerWithUser?.userId) {
          notify.appointmentCancelled(providerWithUser.userId, {
            date: existing.date, time: existing.startTime ?? "", appointmentId: existing.id,
          }).catch(err => console.error("[notify] reschedule-rejected cancel provider", err));
        }
      }

      return res.json({ appointment: updated, event: txRes.event, accepted: accept, refund: { amount: refundedAmount } });
    } catch (err: any) {
      console.error("[POST /api/appointments/:id/reschedule-response] error:", err);
      return res.status(500).json({ message: "Failed to process reschedule response" });
    }
  });

  // ── Admin: Retry failed invoice + earnings for a completed appointment ───────
  // Idempotent — both operations are guarded against double-execution.
  app.post("/api/admin/appointments/:id/retry-completion", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const appt = await storage.getAppointment(req.params.id);
      if (!appt) return res.status(404).json({ message: "Appointment not found" });
      if (appt.status !== "completed") {
        return res.status(400).json({ message: "Only completed appointments can have invoice/earnings retried." });
      }
      const results: { invoice: string; earnings: string } = { invoice: "", earnings: "" };
      try {
        const inv = await createInvoiceForAppointment(req.params.id);
        results.invoice = inv.created ? `Created ${inv.invoiceNumber}` : "Already exists";
      } catch (invErr: any) {
        results.invoice = `Failed: ${invErr.message}`;
      }
      try {
        await storage.recordProviderEarning(req.params.id);
        results.earnings = "Recorded (idempotent)";
      } catch (earnErr: any) {
        results.earnings = `Failed: ${earnErr.message}`;
      }
      return res.json({ success: true, appointmentId: req.params.id, results });
    } catch (err: any) {
      console.error("[POST /api/admin/appointments/:id/retry-completion] error:", err);
      return res.status(500).json({ message: "Failed to retry completion" });
    }
  });

  // ============ WALLET ROUTES ============

  // Admin: list all wallets with the owning user.
  // Country admins only see wallets whose owner belongs to their country.
  registerAppointmentWaitlistRoutes(app);
  registerAppointmentResourcesRoutes(app);
}
