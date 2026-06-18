/**
 * Provider Availability — /api/providers/:id/available-slots
 * Extracted from provider.routes.ts
 */

import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { db, pool } from "../db";
import { z } from "zod";
import { eq, and, desc, or, inArray, gte, lte, asc } from "drizzle-orm";
import {
  insertServiceSchema,
  updateServiceSchema,
  insertPractitionerSchema,
  insertServicePractitionerSchema,
  insertGroupSessionSchema,
  insertProviderTimeOffSchema,
  insertServicePackageSchema,
  services,
  practitioners,
  servicePractitioners,
  reviews,
  providers,
  users,
  providerDocuments,
} from "@shared/schema";
import {
  authenticateToken,
  optionalAuth,
  requireAdmin,
  requireGlobalAdmin,
  type AuthRequest,
  invalidateAuthCache,
} from "../middleware/auth";
import {
  type CountryCode,
  SUPPORTED_COUNTRIES,
  isCountryCode,
  isAdminRole,
  isGlobalAdmin,
  adminScopeFor,
  canAccessCountry,
  listingCountryFilter,
  countryCurrency,
} from "../middleware/country";
import { dispatchNotification } from "../services/notification-dispatcher";
import { trackEvent } from "../services/analyticsTracker";
import { getRates, fromUSDSync, toUSDSync, formatSync } from "../services/currency";
import { localToUTC, getProviderTimezone } from "../lib/tzUtils";
import {
  uploadAvatarImage,
  uploadGalleryImage,
  deleteCloudinaryImage,
  deleteCloudinaryFile,
  isCloudinaryConfigured,
  uploadDocumentFile,
  uploadCredentialFile,
  generateSignedDocumentUrl,
} from "../services/cloudinary";
import {
  scoreProvider,
  rankProviders,
  type PatientContext,
  type ProviderCandidate,
} from "../services/providerMatcher";
import { providerListCache, providerSearchCache } from "../lib/cache";
import {
  sanitizeUser,
  sanitizeProviderWithUser,
  sanitizeProviderListItem,
} from "../utils/sanitize";
import { slog } from "../lib/logger";
import { requirePermission, PERMISSIONS } from "../middleware/rbac";
import {
  fireAdminNotification,
  sendAppointmentEmail,
} from "./shared/helpers";
import { checkConflict, getBufferSettings, BLOCKING_STATUSES } from "../conflictEngine";
import multer from "multer";
import { notify } from "../services/notification-dispatcher";

export function registerProviderAvailabilityRoutes(app: Express): void {
  // Get available time slots for a provider on a given date.
  // Combines the provider's published slots with their existing appointments
  // so the booking UI can disable already-booked times.
  // When practitionerId is given, the practitioner's own schedule is intersected
  // with the provider's schedule so only mutually-available slots are shown.
  app.get("/api/providers/:id/available-slots", async (req: Request, res: Response) => {
    try {
      const { date, serviceId, visitType: qVisitType, practitionerId: qPractitionerId } = req.query as {
        date?: string; serviceId?: string; visitType?: string; practitionerId?: string;
      };
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: "date query param required (YYYY-MM-DD)" });
      }

      // Vacation mode: if the provider has an active time-off range covering
      // this date, return zero slots so patients can't pick the day.
      try {
        const off = await storage.isProviderOnTimeOff(req.params.id, date);
        if (off) return res.json([]);
      } catch (offErr) {
        console.error("Time-off lookup failed (continuing):", offErr);
      }

      // Fetch provider, time slots, booked windows, provider blocks, availability exceptions, and active slot holds in parallel.
      const [provider, slots, bookedWindows, provBlocksRes, availExRes, holdsRes] = await Promise.all([
        storage.getProvider(req.params.id),
        storage.getTimeSlotsByProvider(req.params.id, date),
        storage.getProviderBookedWindows(req.params.id, date),
        pool.query(
          `SELECT start_datetime::text, end_datetime::text FROM provider_blocks
           WHERE provider_id = $1
             AND start_datetime < ($2::date + INTERVAL '1 day')
             AND end_datetime > $2::date`,
          [req.params.id, date],
        ),
        pool.query(
          `SELECT date FROM availability_exceptions WHERE provider_id = $1 AND date = $2`,
          [req.params.id, date],
        ),
        pool.query(
          `SELECT start_time, end_time, patient_id FROM appointment_slot_holds
           WHERE provider_id = $1 AND date = $2 AND expires_at > NOW()`,
          [req.params.id, date],
        ),
      ]);
      if (!provider) return res.json([]);

      // Specific date exception: provider has marked this day as unavailable.
      if (availExRes.rows.length > 0) return res.json([]);

      // Part 4 — Build hold map for HELD status resolution.
      // Key: "HH:MM|HH:MM" → patient_id of the holding patient.
      const holdMap = new Map<string, string>();
      for (const row of (holdsRes as any).rows) {
        holdMap.set(`${row.start_time}|${row.end_time}`, row.patient_id);
      }

      // Part 5 — Burnout ceiling: if provider's max daily booking limit is reached, hide all slots.
      const maxDaily = (provider as any).maxPatientsPerDay;
      if (maxDaily) {
        try {
          const { rows: countRows } = await pool.query(
            `SELECT COUNT(*) FROM appointments
              WHERE provider_id = $1
                AND date = $2
                AND status IN ('pending','approved','confirmed','in_progress')`,
            [req.params.id, date],
          );
          const booked = parseInt(countRows[0]?.count ?? "0", 10);
          if (booked >= maxDaily) return res.json([]);
        } catch (ceilErr: any) {
          console.warn("[available-slots] burnout ceiling check failed (continuing):", ceilErr.message);
        }
      }

      // Build a set of blocked start times (used for explicit-slot isBooked flag).
      const blockedTimes = new Set((bookedWindows as Array<{startTime: string}>).map(w => w.startTime));

      // Resolve optional service for slot-length and availability-hours override.
      let service: any | null = null;
      if (serviceId) {
        try {
          service = await storage.getService(serviceId);
        } catch { /* ignore — fall back to defaults */ }
      }

      // Minimum notice: reject dates too close to now.
      const minNotice: number = (provider as any).minimumNoticeMinutes ?? 60;
      const maxBookingDays: number = (provider as any).maximumBookingDays ?? 90;

      // Phase 7 — Timezone-aware "now" (TZ Hardening Sprint).
      // providerTz comes from users.timezone — the single source of truth set by the
      // provider's setup form. Falls back through office_hours → "UTC".
      // providerLocalNowMs() returns the current instant expressed as if it were
      // the provider's local wall-clock time, so all slot comparisons below are
      // in the provider's frame of reference.
      const providerTz = await getProviderTimezone(
        (provider as any).id,
        (provider as any).userId,
      );

      const [dy, dm, dd] = date.split("-").map(Number);
      // Day boundary in the provider's timezone — used only for the max-booking-days guard.
      // We compare UTC instants so the check is TZ-accurate regardless of server locale.
      const provDayStartUtc = localToUTC(date, "00:00", providerTz).getTime();
      const provDayEndUtc   = localToUTC(date, "23:59", providerTz).getTime() + 60_000;
      const nowUtcMs = Date.now();

      // If the entire day is within the minimum-notice window, return nothing.
      if (provDayEndUtc <= nowUtcMs + minNotice * 60_000) return res.json([]);

      // If the day is beyond the maximum booking window, return nothing.
      const daysFromNow = (provDayStartUtc - nowUtcMs) / (24 * 60 * 60 * 1000);
      if (daysFromNow > maxBookingDays) return res.json([]);

      const toMins = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        return (h || 0) * 60 + (m || 0);
      };
      const pad = (n: number) => String(n).padStart(2, "0");
      const fmt = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

      // Per-service availability hours: { clinic?, home?, online? } each { start, end }
      // Fetched once and shared by both the published-slots and synthetic paths.
      const visitTypeKey = qVisitType ?? "clinic";
      const svcWindow = (service?.availabilityHours as any)?.[visitTypeKey] as
        | { start?: string; end?: string }
        | null
        | undefined;

      // ── Buffer helpers (shared by both the explicit-slot and synthetic paths) ──
      // Service-level buffers from the requested service.
      const svcBufBefore = Number(service?.bufferBefore ?? 0);
      const svcBufAfter  = Number(service?.bufferAfter  ?? 0);

      // Provider-level buffer settings — fetched once.
      const bufSettings = await getBufferSettings(req.params.id, qPractitionerId ?? undefined);
      const provBufBefore =
        visitTypeKey === "home"   ? bufSettings.homeBufferBefore
          : visitTypeKey === "online" ? bufSettings.onlineBufferBefore
          : bufSettings.clinicBufferBefore;
      const provBufAfter =
        visitTypeKey === "home"   ? bufSettings.homeBufferAfter
          : visitTypeKey === "online" ? bufSettings.onlineBufferAfter
          : bufSettings.clinicBufferAfter;
      // Effective buffer = max(provider-level, service-level) — mirrors conflict engine.
      const effBufBefore = Math.max(provBufBefore, svcBufBefore);
      const effBufAfter  = Math.max(provBufAfter,  svcBufAfter);

      // Returns true if [slotStartMins, slotEndMins] overlaps any booking's effective window.
      const isBookedByAppt = (slotStartMins: number, slotEndMins: number): boolean => {
        for (const w of bookedWindows as Array<{startTime: string; endTime: string}>) {
          const bStart = toMins(w.startTime);
          const bEnd   = toMins(w.endTime);
          if ((slotStartMins - effBufBefore) < (bEnd   + provBufAfter) &&
              (slotEndMins   + effBufAfter)  > (bStart - provBufBefore)) {
            return true;
          }
        }
        return false;
      };

      // Returns true if [slotStartMins, slotEndMins] overlaps any manual provider block.
      // Uses localToUTC to convert slot wall-clock times to UTC for correct block comparison —
      // blocks are stored as TIMESTAMPTZ (UTC), so we must compare apples to apples.
      const isBlockedByBlock = (slotStartMins: number, slotEndMins: number): boolean => {
        const slotStartMs = localToUTC(date, fmt(slotStartMins), providerTz).getTime();
        const slotEndMs   = localToUTC(date, fmt(slotEndMins), providerTz).getTime();
        if (!Number.isFinite(slotStartMs) || !Number.isFinite(slotEndMs)) return false;
        for (const block of (provBlocksRes as any).rows) {
          const bStart = new Date(block.start_datetime).getTime();
          const bEnd   = new Date(block.end_datetime).getTime();
          if (slotStartMs < bEnd && slotEndMs > bStart) return true;
        }
        return false;
      };

      // If the provider has explicitly published slots for this date, use them.
      // All checks — booking overlap, provider blocks, and service window — now apply.
      if (slots.length > 0) {
        const noticeMs = minNotice * 60 * 1000;
        const svcStartMins = svcWindow?.start ? toMins(svcWindow.start) : null;
        const svcEndMins   = svcWindow?.end   ? toMins(svcWindow.end)   : null;
        const result = slots
          .filter(s => {
            // Convert provider wall-clock slot time → UTC for accurate past-slot check
            const slotUtcMs = localToUTC(s.date, s.startTime, providerTz).getTime();
            if (!Number.isFinite(slotUtcMs) || slotUtcMs <= Date.now() + noticeMs) return false;
            if (svcStartMins !== null && toMins(s.startTime) < svcStartMins) return false;
            if (svcEndMins   !== null && toMins(s.endTime)   > svcEndMins)   return false;
            return true;
          })
          .map(s => {
            const startMinsVal = toMins(s.startTime);
            const endMinsVal   = toMins(s.endTime);
            const optimal = (startMinsVal >= 540 && startMinsVal < 660) || (startMinsVal >= 840 && startMinsVal < 960);
            const bufferMinutes = visitTypeKey === "home" ? 15 : 0;
            // Trust appointment status as the authoritative "booked" signal.
            // is_booked flag on time_slots can be stale if a cancel's slot-release
            // failed silently — using only isBookedByAppt() auto-heals those cases
            // without requiring a DB repair job.
            const isBookedFinal = isBookedByAppt(startMinsVal, endMinsVal);
            const holdKey = `${s.startTime}|${s.endTime}`;
            const status: "BOOKED" | "HELD" | "AVAILABLE" =
              isBookedFinal ? "BOOKED"
              : holdMap.has(holdKey) ? "HELD"
              : "AVAILABLE";
            // Add authoritative UTC instant so the frontend can compute urgency
            // and past-slot checks without relying on browser-local time parsing.
            const slotUtcForMap = localToUTC(s.date, s.startTime, providerTz).getTime();
            return {
              id: s.id,
              date: s.date,
              startTime: s.startTime,
              endTime: s.endTime,
              startAtUtc: Number.isFinite(slotUtcForMap) ? new Date(slotUtcForMap).toISOString() : undefined,
              isBooked: isBookedFinal,
              isBlocked: s.isBlocked || isBlockedByBlock(startMinsVal, endMinsVal),
              status,
              optimal,
              bufferMinutes,
              groupCapacity: null,
            };
          });
        // Only return slots that are truly available for booking.
        // BOOKED/HELD slots and provider-blocked times must never appear
        // in the patient-facing picker.
        return res.json(result.filter(s => s.status === "AVAILABLE" && !s.isBlocked));
      }

      // ── Fallback: synthesize slots from office hours ────────────────────────
      const officeHours = await storage.getProviderOfficeHours(provider.userId);
      if (!officeHours?.weeklySchedule) return res.json([]);

      // Provider's weekly schedule always controls which days are open.
      let weekly: Record<string, { start: string; end: string; enabled: boolean }> = {};
      try {
        weekly = JSON.parse(officeHours.weeklySchedule);
      } catch { return res.json([]); }

      const dayKey = (() => {
        const dt = new Date(dy, (dm || 1) - 1, dd || 1);
        return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][dt.getDay()];
      })();
      const day = weekly[dayKey];
      if (!day?.enabled || !day.start || !day.end) return res.json([]);

      // Slot interval: service.timeSlotLength > service.duration > 30 min default.
      const SLOT_MIN = service?.timeSlotLength
        ? Number(service.timeSlotLength)
        : service?.duration
          ? Number(service.duration)
          : 30;

      // Buffer-aware step: bufferBefore + duration + bufferAfter.
      // svcBufBefore/svcBufAfter are hoisted above so both paths share them.
      const SLOT_STEP = SLOT_MIN + svcBufBefore + svcBufAfter;

      // Support multiple time windows per day (break gaps between windows are skipped).
      // Falls back to single start→end when no windows array is present.
      const dayWindows: { start: string; end: string }[] = (day as any).windows;
      // Use let so we can intersect with practitioner schedule below.
      let windowsToProcess: { start: string; end: string }[] =
        Array.isArray(dayWindows) && dayWindows.length > 0
          ? dayWindows
          : [{ start: day.start, end: day.end }];

      // ── Practitioner schedule intersection ──────────────────────────────────
      // When a practitionerId is provided and they have an active schedule,
      // restrict windows to the intersection of provider AND practitioner hours.
      // This ensures patients only see slots when BOTH are available.
      if (qPractitionerId) {
        try {
          const practSched = await storage.getPractitionerSchedule(qPractitionerId);
          if (practSched?.weeklySchedule) {
            const practWeekly = practSched.weeklySchedule as Record<string, any>;
            const practDay = practWeekly[dayKey];
            if (!practDay?.enabled) {
              // Practitioner not working this day.
              return res.json([]);
            }
            const practWindows: { start: string; end: string }[] =
              Array.isArray(practDay.windows) && practDay.windows.length > 0
                ? practDay.windows
                : [{ start: practDay.start, end: practDay.end }];
            // Compute all intersecting sub-windows.
            const intersected: { start: string; end: string }[] = [];
            for (const pWin of practWindows) {
              for (const provWin of windowsToProcess) {
                const s = Math.max(toMins(pWin.start), toMins(provWin.start));
                const e = Math.min(toMins(pWin.end), toMins(provWin.end));
                if (s < e) intersected.push({ start: fmt(s), end: fmt(e) });
              }
            }
            if (intersected.length === 0) return res.json([]);
            windowsToProcess = intersected;
          }
        } catch (practErr) {
          console.warn("[available-slots] practitioner schedule lookup failed:", practErr);
          // Non-fatal: fall through and use provider-only windows.
        }
      }

      const noticeMs = minNotice * 60 * 1000;
      const bufferMinutes = visitTypeKey === "home" ? 15 : 0;

      // Part 3 — Build sorted booked-window list for buffer squeezer.
      // The squeezer uses this to snap the walking pointer past booked blocks
      // instead of leaving un-bookable gaps between appointments.
      const sortedBooked = (bookedWindows as Array<{startTime: string; endTime: string}>)
        .map(w => ({ startMins: toMins(w.startTime), endMins: toMins(w.endTime) }))
        .sort((a, b) => a.startMins - b.startMins);

      const synthetic: Array<{
        id: string; date: string; startTime: string; endTime: string;
        isBooked: boolean; isBlocked: boolean; isOptimal: boolean; bufferMinutes: number;
        status: "AVAILABLE" | "HELD" | "BOOKED";
      }> = [];

      for (const win of windowsToProcess) {
        // True intersection of each provider window with the service window.
        const provStartMins = toMins(win.start);
        const provEndMins = toMins(win.end);
        const startMins = svcWindow?.start
          ? Math.max(provStartMins, toMins(svcWindow.start))
          : provStartMins;
        const endMins = svcWindow?.end
          ? Math.min(provEndMins, toMins(svcWindow.end))
          : provEndMins;
        if (startMins >= endMins) continue; // no overlap in this window — skip

        let t = startMins;
        while (t + SLOT_MIN <= endMins) {
          const startTime = fmt(t);
          // Convert provider wall-clock time → UTC for accurate past-slot filter
          const slotUtcMs = localToUTC(date, startTime, providerTz).getTime();

          // Part 3 — Buffer Squeezer: if the slot's own range is conflict-free,
          // check whether SLOT_STEP would land inside a booked window. If so,
          // skip the walking pointer past the booked block (bookedEnd + effBufBefore)
          // instead of silently leaving an un-bookable gap.
          const nextT = t + SLOT_STEP;
          if (nextT < endMins) {
            const bookedBlock = sortedBooked.find(
              b => b.startMins < nextT + SLOT_MIN && b.endMins > nextT,
            );
            if (bookedBlock) {
              // Snap past the booked block so the next iteration starts cleanly.
              const snapTo = bookedBlock.endMins + effBufBefore;
              if (Number.isFinite(slotUtcMs) && slotUtcMs > Date.now() + noticeMs && !isBookedByAppt(t, t + SLOT_MIN)) {
                // Emit this slot before snapping
                const optimal = (t >= 540 && t < 660) || (t >= 840 && t < 960);
                const holdKey = `${startTime}|${fmt(t + SLOT_MIN)}`;
                const isBooked = isBookedByAppt(t, t + SLOT_MIN);
                const status: "AVAILABLE" | "HELD" | "BOOKED" =
                  isBooked ? "BOOKED" : holdMap.has(holdKey) ? "HELD" : "AVAILABLE";
                synthetic.push({
                  id: `virtual-${date}-${startTime}`,
                  date,
                  startTime,
                  endTime: fmt(t + SLOT_MIN),
                  startAtUtc: new Date(slotUtcMs).toISOString(),
                  isBooked,
                  isBlocked: isBlockedByBlock(t, t + SLOT_MIN),
                  isOptimal: optimal,
                  bufferMinutes,
                  status,
                });
              }
              t = snapTo;
              continue;
            }
          }

          if (!Number.isFinite(slotUtcMs) || slotUtcMs <= Date.now() + noticeMs) { t += SLOT_STEP; continue; }
          // 09:00-11:00 and 14:00-16:00 are the optimal booking windows
          const optimal = (t >= 540 && t < 660) || (t >= 840 && t < 960);
          const holdKey = `${startTime}|${fmt(t + SLOT_MIN)}`;
          const isBooked = isBookedByAppt(t, t + SLOT_MIN);
          const status: "AVAILABLE" | "HELD" | "BOOKED" =
            isBooked ? "BOOKED" : holdMap.has(holdKey) ? "HELD" : "AVAILABLE";
          synthetic.push({
            id: `virtual-${date}-${startTime}`,
            date,
            startTime,
            endTime: fmt(t + SLOT_MIN),
            startAtUtc: new Date(slotUtcMs).toISOString(),
            isBooked,
            isBlocked: isBlockedByBlock(t, t + SLOT_MIN),
            isOptimal: optimal,
            bufferMinutes,
            status,
          });
          t += SLOT_STEP;
        }
      }
      // Filter out BOOKED/HELD and provider-blocked synthetic slots.
      res.json(synthetic.filter(s => s.status === "AVAILABLE" && !s.isBlocked));
    } catch (error) {
      console.error("Available slots error:", error);
      res.status(500).json({ message: "Failed to get available slots" });
    }
  });

  // ============ SAVED PROVIDERS (favourites) ============

}
