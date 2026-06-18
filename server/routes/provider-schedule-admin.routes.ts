/**
 * Provider Schedule Admin — office-hours, availability-exceptions, blocks, patient-notes, buffer-settings
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

export function registerProviderScheduleAdminRoutes(app: Express): void {
  app.get("/api/provider/office-hours", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const cfg = await storage.getProviderOfficeHours(req.user!.id);
      res.json(cfg || null);
    } catch { res.status(500).json({ message: "Failed" }); }
  });
  app.patch("/api/provider/office-hours", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user!.role !== "provider" && !isAdminRole(req.user!.role)) {
        return res.status(403).json({ message: "Provider only" });
      }
      const allowed = ["weeklySchedule", "timezone", "autoReplyEnabled", "autoReplyMessage", "emergencyContact"];
      const patch: Record<string, any> = {};
      for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
      const updated = await storage.upsertProviderOfficeHours(req.user!.id, patch);

      // Provider scheduling constraint fields are stored directly on the
      // providers row. Accept them here so the frontend only needs one PATCH call.
      const scheduleConstraints: Record<string, any> = {};
      const scheduleChanged = req.body.weeklySchedule !== undefined;
      if (req.body.minimumNoticeMinutes !== undefined) {
        scheduleConstraints.minimumNoticeMinutes = Math.max(0, Number(req.body.minimumNoticeMinutes) || 0);
      }
      if (req.body.maximumBookingDays !== undefined) {
        scheduleConstraints.maximumBookingDays = Math.max(1, Number(req.body.maximumBookingDays) || 1);
      }
      // Phase 8 — workload controls (accept both field names for backward compat)
      const rawMaxDaily = req.body.maxPatientsPerDay ?? req.body.maxDailyAppointments;
      if (rawMaxDaily !== undefined) {
        const v = rawMaxDaily;
        scheduleConstraints.maxPatientsPerDay = (v === null || v === "" || Number(v) <= 0) ? null : Math.min(100, Math.max(1, Number(v)));
      }
      if (req.body.minGapMinutes !== undefined) {
        scheduleConstraints.minGapMinutes = Math.min(120, Math.max(0, Number(req.body.minGapMinutes) || 0));
      }
      // Phase 5 — waitlist config
      if (req.body.waitlistEnabled !== undefined) {
        scheduleConstraints.waitlistEnabled = Boolean(req.body.waitlistEnabled);
      }
      if (req.body.waitlistMaxSize !== undefined) {
        scheduleConstraints.waitlistMaxSize = Math.min(500, Math.max(1, Number(req.body.waitlistMaxSize) || 10));
      }
      // Phase 7 — provider timezone
      if (req.body.timezone !== undefined) {
        scheduleConstraints.timezone = String(req.body.timezone).trim() || "UTC";
      }
      if (Object.keys(scheduleConstraints).length > 0 || scheduleChanged) {
        const provider = await storage.getProviderByUserId(req.user!.id);
        if (provider) {
          const currentVersion: number = (provider as any).availabilityVersion ?? 1;
          await storage.updateProvider(provider.id, {
            ...scheduleConstraints,
            availabilityVersion: currentVersion + 1,
          } as any);
        }
      }

      res.json(updated);
    } catch { res.status(500).json({ message: "Failed to save" }); }
  });
  app.get("/api/provider/availability-exceptions", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });
      const result = await pool.query(
        `SELECT id, provider_id, date, reason, created_at FROM availability_exceptions WHERE provider_id = $1 ORDER BY date ASC`,
        [provider.id],
      );
      res.json(result.rows);
    } catch (e) { res.status(500).json({ message: "Failed" }); }
  });

  app.post("/api/provider/availability-exceptions", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });
      const { date, reason } = req.body;
      if (!date) return res.status(400).json({ message: "date is required" });
      const result = await pool.query(
        `INSERT INTO availability_exceptions (provider_id, date, reason) VALUES ($1, $2, $3) RETURNING *`,
        [provider.id, date, reason || null],
      );
      res.status(201).json(result.rows[0]);
    } catch (e: any) {
      if ((e?.code ?? e?.cause?.code) === "23505") return res.status(409).json({ message: "Date already blocked" });
      res.status(500).json({ message: "Failed" });
    }
  });

  app.delete("/api/provider/availability-exceptions/:date", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });
      await pool.query(
        `DELETE FROM availability_exceptions WHERE provider_id = $1 AND date = $2`,
        [provider.id, req.params.date],
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: "Failed" }); }
  });

  // Public: check if a date is blocked for a provider
  app.get("/api/providers/:id/availability-exceptions", async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT date FROM availability_exceptions WHERE provider_id = $1`,
        [req.params.id],
      );
      res.json(result.rows.map((r: any) => r.date));
    } catch (e) { res.status(500).json({ message: "Failed" }); }
  });

  // =====================================================================
  // PATIENT TIMELINE — Aggregate clinical history for a patient (Section F)
  // =====================================================================
  app.get("/api/provider/patients/:patientId/timeline", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      const patientId = req.params.patientId;

      // Verify this provider has at least one appointment with this patient
      const { rows: apptCheck } = await pool.query(
        `SELECT id FROM appointments WHERE provider_id = $1 AND patient_id = $2 LIMIT 1`,
        [provider.id, patientId],
      );
      if (apptCheck.length === 0) return res.status(403).json({ message: "Access denied: no appointments with this patient" });

      // Fetch all data in parallel
      const [apptRows, noteRows, prescRows, histRows, patientRows] = await Promise.all([
        pool.query(
          `SELECT a.id, a.date, a.start_time, a.end_time, a.visit_type, a.status,
                  a.notes, a.private_note, a.outcome_note, a.follow_up_recommended,
                  a.referral_needed, a.follow_up_recommended_at, a.intake_responses,
                  a.total_amount, a.appointment_number, a.created_at,
                  s.name AS service_name
           FROM appointments a
           LEFT JOIN services s ON s.id = a.service_id
           WHERE a.provider_id = $1 AND a.patient_id = $2
           ORDER BY a.date DESC, a.start_time DESC`,
          [provider.id, patientId],
        ),
        pool.query(
          `SELECT id, provider_id, patient_id, appointment_id, content, created_at, updated_at FROM patient_notes WHERE provider_id = $1 AND patient_id = $2 ORDER BY created_at DESC`,
          [provider.id, patientId],
        ),
        pool.query(
          `SELECT id, appointment_id, patient_id, provider_id, medication_name, dosage, frequency, duration, instructions, issued_at, expires_at, is_active FROM prescriptions WHERE provider_id = $1 AND patient_id = $2 ORDER BY issued_at DESC`,
          [provider.id, patientId],
        ),
        pool.query(
          `SELECT id, patient_id, provider_id, type, title, description, date, attachments, created_at FROM medical_history WHERE patient_id = $1 ORDER BY date DESC`,
          [patientId],
        ),
        pool.query(
          `SELECT id, first_name, last_name, email, phone, date_of_birth, gender FROM users WHERE id = $1`,
          [patientId],
        ),
      ]);

      // Build chronological timeline events
      type TimelineEvent = {
        id: string;
        type: "appointment" | "note" | "prescription" | "medical_history";
        date: string;
        title: string;
        summary: string;
        data: Record<string, unknown>;
      };

      const events: TimelineEvent[] = [];

      for (const r of apptRows.rows) {
        events.push({
          id: `appt-${r.id}`,
          type: "appointment",
          date: r.date,
          title: r.service_name ? `Appointment: ${r.service_name}` : "Appointment",
          summary: r.outcome_note || r.status,
          data: r,
        });
      }
      for (const r of noteRows.rows) {
        events.push({
          id: `note-${r.id}`,
          type: "note",
          date: (r.created_at as Date).toISOString().slice(0, 10),
          title: "Clinical Note",
          summary: (r.content as string).slice(0, 120),
          data: r,
        });
      }
      for (const r of prescRows.rows) {
        events.push({
          id: `rx-${r.id}`,
          type: "prescription",
          date: (r.issued_at as Date).toISOString().slice(0, 10),
          title: `Prescription: ${r.medication_name}`,
          summary: `${r.dosage} · ${r.frequency} · ${r.duration}`,
          data: r,
        });
      }
      for (const r of histRows.rows) {
        events.push({
          id: `hist-${r.id}`,
          type: "medical_history",
          date: (r.date as Date).toISOString().slice(0, 10),
          title: `${r.type.charAt(0).toUpperCase() + r.type.slice(1).replace("_", " ")}: ${r.title}`,
          summary: r.description || "",
          data: r,
        });
      }

      // Sort descending by date
      events.sort((a, b) => b.date.localeCompare(a.date));

      return res.json({
        patient: patientRows.rows[0] ?? null,
        events,
        stats: {
          totalAppointments: apptRows.rows.length,
          completedAppointments: apptRows.rows.filter((r: any) => r.status === "completed").length,
          totalNotes: noteRows.rows.length,
          totalPrescriptions: prescRows.rows.length,
          totalMedicalHistory: histRows.rows.length,
        },
      });
    } catch (e: any) {
      console.error("[provider-timeline] error:", e?.message);
      return res.status(500).json({ message: "Failed to load timeline" });
    }
  });

  // =====================================================================
  // PATIENT NOTES — Provider private notes per patient
  // =====================================================================
  app.get("/api/provider/patient-notes/:patientId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });
      const result = await pool.query(
        `SELECT * FROM patient_notes WHERE provider_id = $1 AND patient_id = $2 ORDER BY created_at DESC`,
        [provider.id, req.params.patientId],
      );
      res.json(result.rows);
    } catch (e) { res.status(500).json({ message: "Failed" }); }
  });

  app.post("/api/provider/patient-notes", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });
      const { patientId, content, appointmentId } = req.body;
      if (!patientId || !content) return res.status(400).json({ message: "patientId and content required" });
      const result = await pool.query(
        `INSERT INTO patient_notes (provider_id, patient_id, appointment_id, content) VALUES ($1, $2, $3, $4) RETURNING *`,
        [provider.id, patientId, appointmentId || null, content],
      );
      res.status(201).json(result.rows[0]);
    } catch (e) { res.status(500).json({ message: "Failed" }); }
  });

  app.patch("/api/provider/patient-notes/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });
      const { content } = req.body;
      if (!content) return res.status(400).json({ message: "content required" });

      // Fetch existing note for audit trail (previous state)
      const existing = await pool.query(
        `SELECT * FROM patient_notes WHERE id = $1 AND provider_id = $2`,
        [req.params.id, provider.id],
      );
      if (!existing.rows[0]) return res.status(404).json({ message: "Note not found" });

      const result = await pool.query(
        `UPDATE patient_notes SET content = $1, updated_at = NOW() WHERE id = $2 AND provider_id = $3 RETURNING *`,
        [content, req.params.id, provider.id],
      );

      // Audit: record note edit with previous content
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "update",
        entityType: "patient_note",
        entityId: req.params.id,
        details: JSON.stringify({
          providerId: provider.id,
          patientId: existing.rows[0].patient_id,
          appointmentId: existing.rows[0].appointment_id,
          previousContent: existing.rows[0].content,
          newContent: content,
          timestamp: new Date().toISOString(),
        }),
      } as any).catch(() => {});

      res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ message: "Failed" }); }
  });

  app.delete("/api/provider/patient-notes/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      // Fetch note before deleting so we can audit it
      const existing = await pool.query(
        `SELECT * FROM patient_notes WHERE id = $1 AND provider_id = $2`,
        [req.params.id, provider.id],
      );
      if (!existing.rows[0]) return res.status(404).json({ message: "Note not found" });

      await pool.query(
        `DELETE FROM patient_notes WHERE id = $1 AND provider_id = $2`,
        [req.params.id, provider.id],
      );

      // Audit: record note deletion with full content snapshot
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "delete",
        entityType: "patient_note",
        entityId: req.params.id,
        details: JSON.stringify({
          providerId: provider.id,
          patientId: existing.rows[0].patient_id,
          appointmentId: existing.rows[0].appointment_id,
          deletedContent: existing.rows[0].content,
          timestamp: new Date().toISOString(),
        }),
      } as any).catch(() => {});

      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: "Failed" }); }
  });

  // =====================================================================
  // CANCELLATION POLICY — Provider sets their own policy
  // =====================================================================
  app.patch("/api/provider/cancellation-policy", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });
      const schema = z.object({
        cancellationPolicyHours: z.number().int().min(0).max(168),
        cancellationFeePercent: z.number().min(0).max(100),
      });
      const { cancellationPolicyHours, cancellationFeePercent } = schema.parse(req.body);
      await pool.query(
        `UPDATE providers SET cancellation_policy_hours = $1, cancellation_fee_percent = $2 WHERE id = $3`,
        [cancellationPolicyHours, cancellationFeePercent, provider.id],
      );
      res.json({ cancellationPolicyHours, cancellationFeePercent });
    } catch (e: any) {
      if (e?.name === "ZodError") return res.status(400).json({ message: "Invalid input" });
      res.status(500).json({ message: "Failed" });
    }
  });

  app.get("/api/providers/:id/buffer-settings", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const practitionerId = typeof req.query.practitionerId === "string" ? req.query.practitionerId : null;
      const settings = await storage.getProviderBufferSettings(id, practitionerId);
      if (!settings) {
        return res.json({
          providerId: id,
          practitionerId: practitionerId ?? null,
          clinicBufferBefore: 0,
          clinicBufferAfter: 0,
          homeBufferBefore: 15,
          homeBufferAfter: 15,
          onlineBufferBefore: 0,
          onlineBufferAfter: 0,
          travelRadiusKm: "0.00",
        });
      }
      return res.json(settings);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/providers/:id/buffer-settings", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const user = req.user!;
      const practitionerId = typeof req.query.practitionerId === "string" ? req.query.practitionerId : null;

      // Only the provider or admin can update buffer settings
      if (user.role !== "admin" && user.role !== "global_admin" && user.role !== "country_admin") {
        const prov = await storage.getProvider(id);
        if (!prov || prov.userId !== user.id) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }

      const schema = z.object({
        clinicBufferBefore: z.number().int().min(0).max(120).optional(),
        clinicBufferAfter: z.number().int().min(0).max(120).optional(),
        homeBufferBefore: z.number().int().min(0).max(120).optional(),
        homeBufferAfter: z.number().int().min(0).max(120).optional(),
        onlineBufferBefore: z.number().int().min(0).max(120).optional(),
        onlineBufferAfter: z.number().int().min(0).max(120).optional(),
        travelRadiusKm: z.union([z.number().min(0), z.string()]).optional().transform(v => v !== undefined ? String(v) : undefined),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message });

      const settings = await storage.upsertProviderBufferSettings(id, parsed.data as any, practitionerId);
      return res.json(settings);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // ── Provider Blocks ───────────────────────────────────────────────────────────

  app.get("/api/providers/:id/blocks", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const practitionerId = typeof req.query.practitionerId === "string" ? req.query.practitionerId : null;
      const blocks = await storage.getProviderBlocks(id, practitionerId);
      return res.json(blocks);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/providers/:id/blocks", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const user = req.user!;

      if (user.role !== "admin" && user.role !== "global_admin" && user.role !== "country_admin") {
        const prov = await storage.getProvider(id);
        if (!prov || prov.userId !== user.id) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }

      const schema = z.object({
        practitionerId: z.string().optional().nullable(),
        blockType: z.enum(["vacation", "leave", "break", "other"]).default("other"),
        startDatetime: z.coerce.date(),
        endDatetime: z.coerce.date(),
        reason: z.string().optional(),
      }).refine(d => d.endDatetime > d.startDatetime, { message: "End must be after start" });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message });

      const block = await storage.createProviderBlock({
        providerId: id,
        practitionerId: parsed.data.practitionerId ?? null,
        blockType: parsed.data.blockType,
        startDatetime: parsed.data.startDatetime,
        endDatetime: parsed.data.endDatetime,
        reason: parsed.data.reason ?? null,
        createdBy: user.id,
        countryCode: (user.countryCode ?? "HU") as "HU" | "IR",
      });
      return res.status(201).json(block);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/provider-blocks/:blockId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { blockId } = req.params;
      const user = req.user!;
      const existing = await storage.getProviderBlock(blockId);
      if (!existing) return res.status(404).json({ message: "Block not found" });

      if (user.role !== "admin" && user.role !== "global_admin" && user.role !== "country_admin") {
        const prov = await storage.getProvider(existing.providerId);
        if (!prov || prov.userId !== user.id) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }

      const schema = z.object({
        blockType: z.enum(["vacation", "leave", "break", "other"]).optional(),
        startDatetime: z.coerce.date().optional(),
        endDatetime: z.coerce.date().optional(),
        reason: z.string().optional().nullable(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message });

      const updated = await storage.updateProviderBlock(blockId, parsed.data as any);
      return res.json(updated);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/provider-blocks/:blockId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { blockId } = req.params;
      const user = req.user!;
      const existing = await storage.getProviderBlock(blockId);
      if (!existing) return res.status(404).json({ message: "Block not found" });

      if (user.role !== "admin" && user.role !== "global_admin" && user.role !== "country_admin") {
        const prov = await storage.getProvider(existing.providerId);
        if (!prov || prov.userId !== user.id) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }

      await storage.deleteProviderBlock(blockId);
      return res.status(204).send();
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

}
