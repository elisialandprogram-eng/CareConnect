/**
 * Appointment Resources — intake schema, schedule overrides, rooms, fee-split
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

export function registerAppointmentResourcesRoutes(app: Express): void {
  // ── C21.0: Dynamic Intake Schema ────────────────────────────────────────────

  app.get("/api/services/:serviceId/intake-schema", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const svc = await storage.getService(req.params.serviceId);
      if (!svc) return res.status(404).json({ message: "Service not found" });
      let schema: any[] = [];
      if (svc.subServiceId) {
        const subSvc = await storage.getSubService(svc.subServiceId);
        schema = (subSvc as any)?.intakeSchema ?? (subSvc as any)?.intake_schema ?? [];
        if (!Array.isArray(schema)) schema = [];
      }
      return res.json({ schema });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // Admin: manage sub-service intake schema (who can edit the intake form fields)
  app.patch("/api/admin/sub-services/:id/intake-schema", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const { schema } = req.body;
      if (!Array.isArray(schema)) return res.status(400).json({ message: "schema must be an array of field descriptors" });
      await pool.query(
        `UPDATE sub_services SET intake_schema = $1::jsonb WHERE id = $2`,
        [JSON.stringify(schema), req.params.id],
      );
      return res.json({ ok: true, schema });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // ── C21.0: Administrative Provider Schedule Block-Out Overrides ─────────────

  app.get("/api/admin/providers/:providerId/schedule-overrides", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const { rows } = await pool.query(
        `SELECT o.*, u.first_name || ' ' || u.last_name AS created_by_name
         FROM provider_schedule_overrides o
         LEFT JOIN users u ON u.id = o.created_by
         WHERE o.provider_id = $1
         ORDER BY o.start_time DESC`,
        [req.params.providerId],
      );
      return res.json(rows);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/providers/:providerId/schedule-overrides", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const schema = z.object({
        startTime: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
        endTime: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
        overrideReason: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message });
      if (new Date(parsed.data.endTime) <= new Date(parsed.data.startTime)) {
        return res.status(400).json({ message: "end_time must be after start_time" });
      }
      const provider = await storage.getProvider(req.params.providerId);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      if (!canAccessCountry(req.user!, (provider as any).countryCode)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { rows } = await pool.query(
        `INSERT INTO provider_schedule_overrides (provider_id, start_time, end_time, override_reason, created_by, country_code)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [req.params.providerId, parsed.data.startTime, parsed.data.endTime, parsed.data.overrideReason ?? null, req.user!.id, (provider as any).countryCode ?? null],
      );
      return res.status(201).json(rows[0]);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/admin/schedule-overrides/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const { rowCount } = await pool.query(
        `DELETE FROM provider_schedule_overrides WHERE id = $1 RETURNING id`,
        [req.params.id],
      );
      if (!rowCount) return res.status(404).json({ message: "Override not found" });
      return res.status(204).send();
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // ── C21.0: Multi-Location Room / Asset Allocation ───────────────────────────

  app.get("/api/providers/:providerId/rooms", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProvider(req.params.providerId);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      if (!canAccessCountry(req.user!, (provider as any).countryCode)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { rows } = await pool.query(
        `SELECT r.*, (
           SELECT COUNT(*) FROM room_reservations rr
           WHERE rr.room_id = r.id AND rr.end_time > NOW()
         ) AS active_reservations
         FROM clinic_rooms r
         WHERE r.provider_id = $1 AND r.is_active = true
         ORDER BY r.name`,
        [req.params.providerId],
      );
      return res.json(rows);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/providers/:providerId/rooms", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const isAdmin = isAdminRole(req.user?.role);
      const provider = await storage.getProvider(req.params.providerId);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      if (!isAdmin) {
        const ownProvider = await storage.getProviderByUserId(req.user!.id);
        if (!ownProvider || ownProvider.id !== req.params.providerId) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }
      const schema = z.object({
        name: z.string().min(1),
        location: z.string().optional(),
        capacity: z.number().int().min(1).default(1),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message });
      const { rows } = await pool.query(
        `INSERT INTO clinic_rooms (provider_id, name, location, capacity)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [req.params.providerId, parsed.data.name, parsed.data.location ?? null, parsed.data.capacity],
      );
      return res.status(201).json(rows[0]);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/appointments/:id/allocate-room", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const appointment = await storage.getAppointment(req.params.id);
      if (!appointment) return res.status(404).json({ message: "Appointment not found" });
      const isAdmin = isAdminRole(req.user?.role);
      if (!isAdmin) {
        const prov = await storage.getProviderByUserId(req.user!.id);
        if (!prov || prov.id !== appointment.providerId) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }
      const schema = z.object({
        roomId: z.string(),
        startTime: z.string(),
        endTime: z.string(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message });

      // Prevent double-booking the same room for overlapping times
      const conflict = await pool.query(
        `SELECT id FROM room_reservations
         WHERE room_id = $1
           AND start_time < $3::timestamptz
           AND end_time   > $2::timestamptz`,
        [parsed.data.roomId, parsed.data.startTime, parsed.data.endTime],
      );
      if (conflict.rows.length > 0) {
        return res.status(409).json({ message: "Room is already reserved for the requested time window." });
      }

      const { rows } = await pool.query(
        `INSERT INTO room_reservations (room_id, appointment_id, start_time, end_time)
         VALUES ($1, $2, $3::timestamptz, $4::timestamptz)
         RETURNING *`,
        [parsed.data.roomId, appointment.id, parsed.data.startTime, parsed.data.endTime],
      );
      return res.status(201).json(rows[0]);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // Provider fee split ratio management (admin only)
  app.patch("/api/admin/providers/:id/fee-split", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const { feeSplitRatio } = req.body;
      const ratio = parseFloat(feeSplitRatio);
      if (isNaN(ratio) || ratio < 0 || ratio > 1) {
        return res.status(400).json({ message: "feeSplitRatio must be a number between 0 and 1" });
      }
      await pool.query(
        `UPDATE providers SET fee_split_ratio = $1 WHERE id = $2`,
        [ratio.toFixed(4), req.params.id],
      );
      return res.json({ ok: true, feeSplitRatio: ratio });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });
}
