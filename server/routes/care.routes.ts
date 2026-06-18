/**
 * Care routes — extracted from server/routes.ts (Sprint C5, Phase 2)
 *
 * Covers: prescriptions, medical history, health metrics (CRUD),
 * medications (CRUD), medication logs (CRUD).
 * Clinical Workspace additions: provider prescription write,
 * provider medical-history write, appointment outcome save.
 * P3 additions: SOAP notes, diagnoses, treatment plans, PDF prescriptions,
 * clinical attachments, clinical search, provider clinical dashboard.
 */

import type { Express, Response } from "express";
import { createRequire } from "module";
import { storage } from "../storage";
import { pool } from "../db";
import { z } from "zod";
import {
  authenticateToken,
  AuthRequest,
} from "../middleware/auth";
import { isAdminRole } from "../middleware/country";
import {
  insertHealthMetricSchema,
  insertMedicationSchema,
  insertMedicationLogSchema,
  insertPrescriptionSchema,
  insertMedicalHistorySchema,
} from "@shared/schema";

// pdfkit must be loaded via CommonJS require().
// createRequire(process.argv[1]) works in both tsx (dev/ESM) and node dist/index.cjs (prod/CJS).
// We intentionally avoid import.meta here so the CJS esbuild output has no warnings.
const _require = createRequire(process.argv[1]);
const PDFDocument = _require("pdfkit") as new (opts?: Record<string, unknown>) => PdfDoc;
interface PdfDoc extends NodeJS.ReadableStream {
  pipe<T extends NodeJS.WritableStream>(dest: T): T;
  fontSize(size: number): this;
  font(name: string): this;
  text(text: string, opts?: Record<string, unknown>): this;
  moveDown(lines?: number): this;
  moveTo(x: number, y: number): this;
  lineTo(x: number, y: number): this;
  stroke(color?: string): this;
  fillColor(color: string): this;
  end(): void;
  y: number;
}

export function registerCareRoutes(app: Express): void {

  // ── Prescriptions ─────────────────────────────────────────────────────────
  app.get("/api/prescriptions/patient/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const prescriptions = await storage.getPrescriptionsByPatient(req.params.id);
      res.json(prescriptions);
    } catch (error) {
      console.error("Get prescriptions error:", error);
      res.status(500).json({ message: "Failed to get prescriptions" });
    }
  });

  // ── Provider: Create Prescription (Section D + E + F) ────────────────────
  app.post("/api/provider/prescriptions", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: "Only providers can create prescriptions" });
      }
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      const schema = insertPrescriptionSchema.extend({
        appointmentId: z.string().min(1),
        patientId: z.string().min(1),
      });
      const parsed = schema.parse({ ...req.body, providerId: provider.id });

      // Verify the appointment belongs to this provider
      const appt = await storage.getAppointment(parsed.appointmentId);
      if (!appt) return res.status(404).json({ message: "Appointment not found" });
      if (appt.providerId !== provider.id) return res.status(403).json({ message: "Access denied" });
      if (appt.patientId !== parsed.patientId) return res.status(400).json({ message: "Patient mismatch" });

      // ── Section E: Allergy Safety Check ────────────────────────────────────
      // Query allergy entries from medical_history AND user's known_allergies field.
      // Warning only — never blocks prescription creation.
      const allergyWarnings: string[] = [];
      try {
        const medLower = parsed.medicationName.toLowerCase();

        const [allergyHistory, userRow] = await Promise.all([
          pool.query<{ title: string; description: string | null }>(
            `SELECT title, description FROM medical_history
             WHERE patient_id = $1 AND type = 'allergy' AND is_active = true`,
            [parsed.patientId],
          ),
          pool.query<{ known_allergies: string | null }>(
            `SELECT known_allergies FROM users WHERE id = $1`,
            [parsed.patientId],
          ),
        ]);

        for (const allergy of allergyHistory.rows) {
          const allergyText = `${allergy.title} ${allergy.description ?? ""}`.toLowerCase();
          const allergyWords = allergyText.split(/\W+/).filter((w) => w.length > 3);
          if (allergyWords.some((word) => medLower.includes(word))) {
            allergyWarnings.push(`Patient has documented allergy: ${allergy.title}`);
          }
        }

        const knownAllergies = userRow.rows[0]?.known_allergies ?? "";
        if (knownAllergies) {
          const terms = knownAllergies
            .toLowerCase()
            .split(/[,;]+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 3);
          for (const term of terms) {
            if (medLower.includes(term)) {
              allergyWarnings.push(`Patient reports allergy to: ${term}`);
            }
          }
        }
      } catch {
        // Allergy check failure must never block prescription creation
      }

      const prescription = await storage.createPrescription(parsed);

      // Audit log
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "create",
        entityType: "prescription",
        entityId: prescription.id,
        details: JSON.stringify({
          appointmentId: parsed.appointmentId,
          patientId: parsed.patientId,
          medication: parsed.medicationName,
          allergyWarningsCount: allergyWarnings.length,
        }),
      } as any).catch(() => {});

      // ── Section F: Prescription → Medication Auto-Sync ──────────────────────
      // Idempotent: skip if a medication row already links to this prescription.
      await pool.query(
        `INSERT INTO medications (user_id, name, dosage, frequency, prescription_id, reminder_enabled, is_active)
         SELECT $1, $2, $3, $4, $5, true, true
         WHERE NOT EXISTS (
           SELECT 1 FROM medications WHERE prescription_id = $5 AND user_id = $1
         )`,
        [
          parsed.patientId,
          parsed.medicationName,
          parsed.dosage,
          parsed.frequency,
          prescription.id,
        ],
      ).catch(() => {});

      return res.status(201).json({ ...prescription, allergyWarnings });
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid prescription data", errors: error.errors });
      }
      console.error("Create prescription error:", error);
      return res.status(500).json({ message: "Failed to create prescription" });
    }
  });

  // ── Provider: Activate / Deactivate Prescription (Section D lifecycle) ─────
  // Must be before GET /api/provider/patients/:patientId/prescriptions to avoid
  // param-route shadowing (this path doesn't share a prefix with that one).
  app.patch("/api/provider/prescriptions/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: "Only providers can manage prescriptions" });
      }
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      const schema = z.object({ isActive: z.boolean() });
      const { isActive } = schema.parse(req.body);

      // Verify provider ownership
      const { rows: existing } = await pool.query(
        `SELECT id, patient_id, medication_name, is_active FROM prescriptions
         WHERE id = $1 AND provider_id = $2`,
        [req.params.id, provider.id],
      );
      if (!existing[0]) return res.status(404).json({ message: "Prescription not found" });

      const { rows } = await pool.query(
        `UPDATE prescriptions SET is_active = $1 WHERE id = $2 RETURNING *`,
        [isActive, req.params.id],
      );

      // Audit log
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "update",
        entityType: "prescription",
        entityId: req.params.id,
        details: JSON.stringify({
          providerId: provider.id,
          patientId: existing[0].patient_id,
          medication: existing[0].medication_name,
          previousIsActive: existing[0].is_active,
          newIsActive: isActive,
          action: isActive ? "reactivated" : "deactivated",
          timestamp: new Date().toISOString(),
        }),
      } as any).catch(() => {});

      return res.json(rows[0]);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "isActive (boolean) required" });
      console.error("Update prescription error:", error);
      return res.status(500).json({ message: "Failed to update prescription" });
    }
  });

  // Provider: list prescriptions for a patient (provider-facing)
  app.get("/api/provider/patients/:patientId/prescriptions", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Provider profile not found" });

      const { rows } = await pool.query(
        `SELECT p.* FROM prescriptions p
         WHERE p.patient_id = $1 AND p.provider_id = $2
         ORDER BY p.issued_at DESC`,
        [req.params.patientId, provider?.id],
      );
      return res.json(rows);
    } catch (error) {
      console.error("Get provider prescriptions error:", error);
      return res.status(500).json({ message: "Failed to get prescriptions" });
    }
  });

  // ── Provider: Write Medical History Entry (Section G) ─────────────────────
  app.post("/api/provider/medical-history", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: "Only providers can write medical history" });
      }
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      const schema = insertMedicalHistorySchema.extend({
        patientId: z.string().min(1),
        appointmentId: z.string().optional(),
      });
      const parsed = schema.parse({ ...req.body, providerId: provider.id });

      // Verify provider has had an appointment with this patient
      const { rows: apptCheck } = await pool.query(
        `SELECT id FROM appointments WHERE provider_id = $1 AND patient_id = $2 LIMIT 1`,
        [provider.id, parsed.patientId],
      );
      if (apptCheck.length === 0) {
        return res.status(403).json({ message: "You can only add medical history for your own patients" });
      }

      const entry = await storage.createMedicalHistory(parsed);

      // Audit log
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "create",
        entityType: "medical_history",
        entityId: entry.id,
        details: JSON.stringify({ patientId: parsed.patientId, type: parsed.type, title: parsed.title }),
      } as any).catch(() => {});

      return res.status(201).json(entry);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid medical history data", errors: error.errors });
      }
      console.error("Create medical history error:", error);
      return res.status(500).json({ message: "Failed to create medical history entry" });
    }
  });

  // Provider: list medical history for a patient (provider-facing)
  app.get("/api/provider/patients/:patientId/medical-history", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Provider profile not found" });

      const { rows: apptCheck } = await pool.query(
        `SELECT id FROM appointments WHERE provider_id = $1 AND patient_id = $2 LIMIT 1`,
        [provider?.id, req.params.patientId],
      );
      if (apptCheck.length === 0 && !isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const history = await storage.getMedicalHistoryByPatient(req.params.patientId);
      return res.json(history);
    } catch (error) {
      console.error("Get medical history (provider) error:", error);
      return res.status(500).json({ message: "Failed to get medical history" });
    }
  });

  // ── Appointment Outcome (Section E) ───────────────────────────────────────
  app.patch("/api/appointments/:id/outcome", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const appt = await storage.getAppointment(req.params.id);
      if (!appt) return res.status(404).json({ message: "Appointment not found" });

      // Only owning provider or admin
      if (!isAdminRole(req.user?.role)) {
        if (req.user?.role !== "provider") return res.status(403).json({ message: "Forbidden" });
        const provider = await storage.getProviderByUserId(req.user!.id);
        if (!provider || provider.id !== appt.providerId) return res.status(403).json({ message: "Access denied" });
      }

      const schema = z.object({
        outcomeNote: z.string().max(4000).optional(),
        followUpRecommended: z.boolean().optional(),
        referralNeeded: z.boolean().optional(),
      });
      const parsed = schema.parse(req.body);

      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;
      if (parsed.outcomeNote !== undefined) { updates.push(`outcome_note = $${idx++}`); values.push(parsed.outcomeNote); }
      if (parsed.followUpRecommended !== undefined) { updates.push(`follow_up_recommended = $${idx++}`); values.push(parsed.followUpRecommended); }
      if (parsed.referralNeeded !== undefined) { updates.push(`referral_needed = $${idx++}`); values.push(parsed.referralNeeded); }

      if (updates.length === 0) return res.status(400).json({ message: "No fields to update" });

      updates.push(`updated_at = NOW()`);
      values.push(req.params.id);

      // Fetch previous values for the event record before updating
      const { rows: prevRows } = await pool.query(
        `SELECT outcome_note, follow_up_recommended, referral_needed FROM appointments WHERE id = $1`,
        [req.params.id],
      );
      const prev = prevRows[0] ?? {};

      const { rows } = await pool.query(
        `UPDATE appointments SET ${updates.join(", ")} WHERE id = $${idx} RETURNING id, outcome_note, follow_up_recommended, referral_needed, updated_at`,
        values,
      );

      if (!rows[0]) return res.status(404).json({ message: "Appointment not found" });

      // Audit log
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "update",
        entityType: "appointment",
        entityId: req.params.id,
        details: JSON.stringify({ field: "outcome", ...parsed }),
      } as any).catch(() => {});

      // Append-only event record in appointment_events (outcome_updated action)
      await pool.query(
        `INSERT INTO appointment_events (appointment_id, action, actor_user_id, actor_role, metadata)
         VALUES ($1, 'outcome_updated', $2, $3::user_role, $4)`,
        [
          req.params.id,
          req.user!.id,
          req.user!.role,
          JSON.stringify({
            previous: {
              outcomeNote: prev.outcome_note ?? null,
              followUpRecommended: prev.follow_up_recommended ?? null,
              referralNeeded: prev.referral_needed ?? null,
            },
            updated: parsed,
            timestamp: new Date().toISOString(),
          }),
        ],
      ).catch(() => {});  // Never block outcome save if enum migration not yet applied

      return res.json(rows[0]);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid outcome data", errors: error.errors });
      console.error("Save outcome error:", error);
      return res.status(500).json({ message: "Failed to save outcome" });
    }
  });

  // ── Medical History ───────────────────────────────────────────────────────
  app.get("/api/medical-history/patient/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const history = await storage.getMedicalHistoryByPatient(req.params.id);
      res.json(history);
    } catch (error) {
      console.error("Get medical history error:", error);
      res.status(500).json({ message: "Failed to get medical history" });
    }
  });

  // ── Medications ───────────────────────────────────────────────────────────
  app.get("/api/medications", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const meds = await storage.getMedicationsByUser(req.user!.id);
      res.json(meds);
    } catch (error) {
      console.error("Get medications error:", error);
      res.status(500).json({ message: "Failed to load medications" });
    }
  });

  app.post("/api/medications", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = insertMedicationSchema.parse(req.body);
      if (parsed.familyMemberId) {
        const fm = await storage.getFamilyMember(parsed.familyMemberId);
        if (!fm || fm.primaryUserId !== req.user!.id) {
          return res.status(403).json({ message: "Family member not found or not yours." });
        }
      }
      const med = await storage.createMedication(req.user!.id, parsed);
      res.status(201).json(med);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid medication data", errors: error.errors });
      }
      console.error("Create medication error:", error);
      res.status(500).json({ message: "Failed to add medication" });
    }
  });

  app.patch("/api/medications/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = insertMedicationSchema.partial().parse(req.body);
      if (parsed.familyMemberId) {
        const fm = await storage.getFamilyMember(parsed.familyMemberId);
        if (!fm || fm.primaryUserId !== req.user!.id) {
          return res.status(403).json({ message: "Family member not found or not yours." });
        }
      }
      const updated = await storage.updateMedication(req.params.id, req.user!.id, parsed);
      if (!updated) return res.status(404).json({ message: "Medication not found" });
      res.json(updated);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid medication data", errors: error.errors });
      }
      console.error("Update medication error:", error);
      res.status(500).json({ message: "Failed to update medication" });
    }
  });

  app.delete("/api/medications/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const deleted = await storage.deleteMedication(req.params.id, req.user!.id);
      if (!deleted) return res.status(404).json({ message: "Medication not found" });
      res.json({ ok: true });
    } catch (error) {
      console.error("Delete medication error:", error);
      res.status(500).json({ message: "Failed to remove medication" });
    }
  });

  // ── Medication Logs ───────────────────────────────────────────────────────
  app.get("/api/medication-logs", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { medicationId, from, to } = req.query as Record<string, string | undefined>;
      const logs = await storage.getMedicationLogs(req.user!.id, { medicationId, from, to });
      res.json(logs);
    } catch (error) {
      console.error("Get medication logs error:", error);
      res.status(500).json({ message: "Failed to load medication logs" });
    }
  });

  app.post("/api/medication-logs", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = insertMedicationLogSchema.parse(req.body);
      const med = await storage.getMedication(parsed.medicationId);
      if (!med || med.userId !== req.user!.id) {
        return res.status(404).json({ message: "Medication not found" });
      }
      const log = await storage.logMedicationDose(req.user!.id, parsed);
      res.status(201).json(log);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid log data", errors: error.errors });
      }
      console.error("Log dose error:", error);
      res.status(500).json({ message: "Failed to log dose" });
    }
  });

  app.delete("/api/medication-logs/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const deleted = await storage.deleteMedicationLog(req.params.id, req.user!.id);
      if (!deleted) return res.status(404).json({ message: "Log not found" });
      res.json({ ok: true });
    } catch (error) {
      console.error("Delete log error:", error);
      res.status(500).json({ message: "Failed to delete log" });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // P3 CLINICAL WORKSPACE — SOAP NOTES
  // ══════════════════════════════════════════════════════════════════════════════

  // GET /api/provider/patients/:patientId/soap-notes
  app.get("/api/provider/patients/:patientId/soap-notes", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Provider profile not found" });

      // Verify relationship
      const { rows: check } = await pool.query(
        `SELECT id FROM appointments WHERE provider_id = $1 AND patient_id = $2 LIMIT 1`,
        [provider?.id, req.params.patientId],
      );
      if (check.length === 0 && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Access denied" });

      const { rows } = await pool.query(
        `SELECT sn.*, u.first_name || ' ' || u.last_name AS provider_name
         FROM soap_notes sn
         LEFT JOIN users u ON u.id = sn.provider_id::text
         WHERE sn.patient_id = $1
         ORDER BY sn.created_at DESC`,
        [req.params.patientId],
      );
      return res.json(rows);
    } catch (error: any) {
      const pgCode = error?.code ?? error?.cause?.code;
      if (pgCode === "42P01") return res.json([]); // table not yet created
      console.error("Get SOAP notes error:", error);
      return res.status(500).json({ message: "Failed to get SOAP notes" });
    }
  });

  // POST /api/provider/soap-notes
  app.post("/api/provider/soap-notes", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Only providers can write SOAP notes" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      const schema = z.object({
        patientId: z.string().min(1),
        appointmentId: z.string().optional(),
        subjective: z.string().max(5000).optional(),
        objective: z.string().max(5000).optional(),
        assessment: z.string().max(5000).optional(),
        plan: z.string().max(5000).optional(),
      });
      const parsed = schema.parse(req.body);

      // Verify relationship
      const { rows: check } = await pool.query(
        `SELECT id FROM appointments WHERE provider_id = $1 AND patient_id = $2 LIMIT 1`,
        [provider.id, parsed.patientId],
      );
      if (check.length === 0) return res.status(403).json({ message: "You can only write SOAP notes for your own patients" });

      // If appointmentId given, check for existing SOAP note for same appointment
      if (parsed.appointmentId) {
        const { rows: existing } = await pool.query(
          `SELECT id FROM soap_notes WHERE appointment_id = $1 AND provider_id = $2`,
          [parsed.appointmentId, provider.id],
        );
        if (existing.length > 0) {
          // Update existing note with version bump
          const prev = await pool.query(`SELECT * FROM soap_notes WHERE id = $1`, [existing[0].id]);
          const prevNote = prev.rows[0];
          await pool.query(
            `INSERT INTO soap_note_versions (soap_note_id, version, subjective, objective, assessment, plan, edited_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [prevNote.id, prevNote.version, prevNote.subjective, prevNote.objective, prevNote.assessment, prevNote.plan, req.user!.id],
          );
          const { rows: updated } = await pool.query(
            `UPDATE soap_notes SET subjective=$1, objective=$2, assessment=$3, plan=$4,
             version=version+1, updated_at=NOW()
             WHERE id=$5 RETURNING *`,
            [parsed.subjective ?? null, parsed.objective ?? null, parsed.assessment ?? null, parsed.plan ?? null, prevNote.id],
          );
          return res.status(200).json({ ...updated[0], updated: true });
        }
      }

      const { rows } = await pool.query(
        `INSERT INTO soap_notes (provider_id, patient_id, appointment_id, subjective, objective, assessment, plan)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [provider.id, parsed.patientId, parsed.appointmentId ?? null, parsed.subjective ?? null, parsed.objective ?? null, parsed.assessment ?? null, parsed.plan ?? null],
      );
      await storage.createAuditLog({ userId: req.user!.id, action: "create", entityType: "soap_note", entityId: rows[0].id, details: JSON.stringify({ patientId: parsed.patientId }) } as any).catch(() => {});
      return res.status(201).json(rows[0]);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid SOAP note data", errors: error.errors });
      const pgCode = error?.code ?? error?.cause?.code;
      if (pgCode === "42P01") return res.status(503).json({ message: "Database not ready. Please try again." });
      console.error("Create SOAP note error:", error);
      return res.status(500).json({ message: "Failed to create SOAP note" });
    }
  });

  // PATCH /api/provider/soap-notes/:id
  app.patch("/api/provider/soap-notes/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      const { rows: existing } = await pool.query(`SELECT * FROM soap_notes WHERE id=$1 AND provider_id=$2`, [req.params.id, provider.id]);
      if (!existing[0]) return res.status(404).json({ message: "SOAP note not found" });

      const schema = z.object({
        subjective: z.string().max(5000).optional(),
        objective: z.string().max(5000).optional(),
        assessment: z.string().max(5000).optional(),
        plan: z.string().max(5000).optional(),
      });
      const parsed = schema.parse(req.body);

      // Save version before update
      const note = existing[0];
      await pool.query(
        `INSERT INTO soap_note_versions (soap_note_id, version, subjective, objective, assessment, plan, edited_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [note.id, note.version, note.subjective, note.objective, note.assessment, note.plan, req.user!.id],
      );

      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;
      if (parsed.subjective !== undefined) { updates.push(`subjective=$${idx++}`); values.push(parsed.subjective); }
      if (parsed.objective  !== undefined) { updates.push(`objective=$${idx++}`);  values.push(parsed.objective);  }
      if (parsed.assessment !== undefined) { updates.push(`assessment=$${idx++}`); values.push(parsed.assessment); }
      if (parsed.plan       !== undefined) { updates.push(`plan=$${idx++}`);       values.push(parsed.plan);       }
      if (updates.length === 0) return res.status(400).json({ message: "No fields to update" });

      updates.push(`version=version+1`, `updated_at=NOW()`);
      values.push(note.id);
      const { rows } = await pool.query(`UPDATE soap_notes SET ${updates.join(",")} WHERE id=$${idx} RETURNING *`, values);
      return res.json(rows[0]);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: error.errors });
      console.error("Update SOAP note error:", error);
      return res.status(500).json({ message: "Failed to update SOAP note" });
    }
  });

  // GET /api/provider/soap-notes/:id/versions
  app.get("/api/provider/soap-notes/:id/versions", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      const { rows: noteCheck } = await pool.query(`SELECT id FROM soap_notes WHERE id=$1 AND provider_id=$2`, [req.params.id, provider.id]);
      if (!noteCheck[0] && !isAdminRole(req.user?.role)) return res.status(404).json({ message: "Note not found" });

      const { rows } = await pool.query(
        `SELECT v.*, u.first_name || ' ' || u.last_name AS editor_name
         FROM soap_note_versions v
         LEFT JOIN users u ON u.id = v.edited_by
         WHERE v.soap_note_id = $1 ORDER BY v.version DESC`,
        [req.params.id],
      );
      return res.json(rows);
    } catch (error: any) {
      const pgCode = error?.code ?? error?.cause?.code;
      if (pgCode === "42P01") return res.json([]);
      console.error("Get SOAP versions error:", error);
      return res.status(500).json({ message: "Failed to get note history" });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // P3 CLINICAL WORKSPACE — DIAGNOSES
  // ══════════════════════════════════════════════════════════════════════════════

  // GET /api/provider/patients/:patientId/diagnoses
  app.get("/api/provider/patients/:patientId/diagnoses", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Provider profile not found" });

      const { rows: check } = await pool.query(
        `SELECT id FROM appointments WHERE provider_id=$1 AND patient_id=$2 LIMIT 1`,
        [provider?.id, req.params.patientId],
      );
      if (check.length === 0 && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Access denied" });

      const { rows } = await pool.query(
        `SELECT d.*, p.clinic_name AS provider_name
         FROM diagnoses d
         LEFT JOIN providers p ON p.id = d.provider_id
         WHERE d.patient_id = $1
         ORDER BY d.diagnosed_at DESC`,
        [req.params.patientId],
      );
      return res.json(rows);
    } catch (error: any) {
      const pgCode = error?.code ?? error?.cause?.code;
      if (pgCode === "42P01") return res.json([]);
      console.error("Get diagnoses error:", error);
      return res.status(500).json({ message: "Failed to get diagnoses" });
    }
  });

  // POST /api/provider/diagnoses
  app.post("/api/provider/diagnoses", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Only providers can create diagnoses" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      const schema = z.object({
        patientId: z.string().min(1),
        appointmentId: z.string().optional(),
        code: z.string().max(20).optional(),
        title: z.string().min(1).max(500),
        description: z.string().max(2000).optional(),
        category: z.enum(["primary", "secondary", "chronic", "resolved"]).default("primary"),
        status: z.enum(["active", "resolved", "monitoring"]).default("active"),
        diagnosedAt: z.string().optional(),
      });
      const parsed = schema.parse(req.body);

      const { rows: check } = await pool.query(
        `SELECT id FROM appointments WHERE provider_id=$1 AND patient_id=$2 LIMIT 1`,
        [provider.id, parsed.patientId],
      );
      if (check.length === 0) return res.status(403).json({ message: "You can only diagnose your own patients" });

      const { rows } = await pool.query(
        `INSERT INTO diagnoses (patient_id, provider_id, appointment_id, code, title, description, category, status, diagnosed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          parsed.patientId, provider.id, parsed.appointmentId ?? null,
          parsed.code ?? null, parsed.title, parsed.description ?? null,
          parsed.category, parsed.status,
          parsed.diagnosedAt ? new Date(parsed.diagnosedAt) : new Date(),
        ],
      );
      await storage.createAuditLog({ userId: req.user!.id, action: "create", entityType: "diagnosis", entityId: rows[0].id, details: JSON.stringify({ patientId: parsed.patientId, title: parsed.title }) } as any).catch(() => {});
      return res.status(201).json(rows[0]);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid diagnosis data", errors: error.errors });
      const pgCode = error?.code ?? error?.cause?.code;
      if (pgCode === "42P01") return res.status(503).json({ message: "Database not ready. Please try again." });
      console.error("Create diagnosis error:", error);
      return res.status(500).json({ message: "Failed to create diagnosis" });
    }
  });

  // PATCH /api/provider/diagnoses/:id
  app.patch("/api/provider/diagnoses/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      const { rows: existing } = await pool.query(`SELECT id FROM diagnoses WHERE id=$1 AND provider_id=$2`, [req.params.id, provider.id]);
      if (!existing[0]) return res.status(404).json({ message: "Diagnosis not found" });

      const schema = z.object({
        code: z.string().max(20).optional(),
        title: z.string().min(1).max(500).optional(),
        description: z.string().max(2000).optional(),
        category: z.enum(["primary", "secondary", "chronic", "resolved"]).optional(),
        status: z.enum(["active", "resolved", "monitoring"]).optional(),
        resolvedAt: z.string().nullable().optional(),
      });
      const parsed = schema.parse(req.body);

      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;
      if (parsed.code        !== undefined) { updates.push(`code=$${idx++}`);        values.push(parsed.code); }
      if (parsed.title       !== undefined) { updates.push(`title=$${idx++}`);       values.push(parsed.title); }
      if (parsed.description !== undefined) { updates.push(`description=$${idx++}`); values.push(parsed.description); }
      if (parsed.category    !== undefined) { updates.push(`category=$${idx++}`);    values.push(parsed.category); }
      if (parsed.status      !== undefined) { updates.push(`status=$${idx++}`);      values.push(parsed.status); }
      if (parsed.resolvedAt  !== undefined) { updates.push(`resolved_at=$${idx++}`); values.push(parsed.resolvedAt ? new Date(parsed.resolvedAt) : null); }
      if (updates.length === 0) return res.status(400).json({ message: "No fields to update" });

      updates.push(`updated_at=NOW()`);
      values.push(req.params.id);
      const { rows } = await pool.query(`UPDATE diagnoses SET ${updates.join(",")} WHERE id=$${idx} RETURNING *`, values);
      return res.json(rows[0]);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: error.errors });
      console.error("Update diagnosis error:", error);
      return res.status(500).json({ message: "Failed to update diagnosis" });
    }
  });

  // DELETE /api/provider/diagnoses/:id
  app.delete("/api/provider/diagnoses/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      const { rowCount } = await pool.query(`DELETE FROM diagnoses WHERE id=$1 AND provider_id=$2`, [req.params.id, provider.id]);
      if (!rowCount) return res.status(404).json({ message: "Diagnosis not found" });
      return res.json({ ok: true });
    } catch (error) {
      console.error("Delete diagnosis error:", error);
      return res.status(500).json({ message: "Failed to delete diagnosis" });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // P3 CLINICAL WORKSPACE — TREATMENT PLANS
  // ══════════════════════════════════════════════════════════════════════════════

  // GET /api/provider/patients/:patientId/treatment-plans
  app.get("/api/provider/patients/:patientId/treatment-plans", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Provider profile not found" });

      const { rows: check } = await pool.query(
        `SELECT id FROM appointments WHERE provider_id=$1 AND patient_id=$2 LIMIT 1`,
        [provider?.id, req.params.patientId],
      );
      if (check.length === 0 && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Access denied" });

      const { rows: plans } = await pool.query(
        `SELECT tp.*, (SELECT json_agg(t ORDER BY t.created_at ASC) FROM treatment_tasks t WHERE t.plan_id = tp.id) AS tasks
         FROM treatment_plans tp WHERE tp.patient_id = $1 ORDER BY tp.created_at DESC`,
        [req.params.patientId],
      );
      return res.json(plans.map((p) => ({ ...p, tasks: p.tasks ?? [] })));
    } catch (error: any) {
      const pgCode = error?.code ?? error?.cause?.code;
      if (pgCode === "42P01") return res.json([]);
      console.error("Get treatment plans error:", error);
      return res.status(500).json({ message: "Failed to get treatment plans" });
    }
  });

  // POST /api/provider/treatment-plans
  app.post("/api/provider/treatment-plans", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Only providers can create treatment plans" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      const schema = z.object({
        patientId: z.string().min(1),
        appointmentId: z.string().optional(),
        title: z.string().min(1).max(500),
        description: z.string().max(3000).optional(),
        goals: z.string().max(3000).optional(),
        recommendations: z.string().max(3000).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        tasks: z.array(z.object({ title: z.string().min(1), description: z.string().optional(), dueDate: z.string().optional() })).optional(),
      });
      const parsed = schema.parse(req.body);

      const { rows: check } = await pool.query(
        `SELECT id FROM appointments WHERE provider_id=$1 AND patient_id=$2 LIMIT 1`,
        [provider.id, parsed.patientId],
      );
      if (check.length === 0) return res.status(403).json({ message: "You can only create treatment plans for your own patients" });

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows: [plan] } = await client.query(
          `INSERT INTO treatment_plans (patient_id, provider_id, appointment_id, title, description, goals, recommendations, start_date, end_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [parsed.patientId, provider.id, parsed.appointmentId ?? null, parsed.title, parsed.description ?? null, parsed.goals ?? null, parsed.recommendations ?? null, parsed.startDate ?? null, parsed.endDate ?? null],
        );
        const tasks: unknown[] = [];
        for (const task of parsed.tasks ?? []) {
          const { rows: [t] } = await client.query(
            `INSERT INTO treatment_tasks (plan_id, title, description, due_date) VALUES ($1,$2,$3,$4) RETURNING *`,
            [plan.id, task.title, task.description ?? null, task.dueDate ?? null],
          );
          tasks.push(t);
        }
        await client.query("COMMIT");
        return res.status(201).json({ ...plan, tasks });
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid treatment plan data", errors: error.errors });
      const pgCode = error?.code ?? error?.cause?.code;
      if (pgCode === "42P01") return res.status(503).json({ message: "Database not ready. Please try again." });
      console.error("Create treatment plan error:", error);
      return res.status(500).json({ message: "Failed to create treatment plan" });
    }
  });

  // PATCH /api/provider/treatment-plans/:id
  app.patch("/api/provider/treatment-plans/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      const { rows: existing } = await pool.query(`SELECT id FROM treatment_plans WHERE id=$1 AND provider_id=$2`, [req.params.id, provider.id]);
      if (!existing[0]) return res.status(404).json({ message: "Treatment plan not found" });

      const schema = z.object({
        title: z.string().min(1).max(500).optional(),
        description: z.string().max(3000).optional(),
        goals: z.string().max(3000).optional(),
        recommendations: z.string().max(3000).optional(),
        status: z.enum(["active", "completed", "on_hold", "cancelled"]).optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
      });
      const parsed = schema.parse(req.body);

      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;
      if (parsed.title           !== undefined) { updates.push(`title=$${idx++}`);           values.push(parsed.title); }
      if (parsed.description     !== undefined) { updates.push(`description=$${idx++}`);     values.push(parsed.description); }
      if (parsed.goals           !== undefined) { updates.push(`goals=$${idx++}`);           values.push(parsed.goals); }
      if (parsed.recommendations !== undefined) { updates.push(`recommendations=$${idx++}`); values.push(parsed.recommendations); }
      if (parsed.status          !== undefined) { updates.push(`status=$${idx++}`);          values.push(parsed.status); }
      if (parsed.startDate       !== undefined) { updates.push(`start_date=$${idx++}`);      values.push(parsed.startDate); }
      if (parsed.endDate         !== undefined) { updates.push(`end_date=$${idx++}`);        values.push(parsed.endDate); }
      if (updates.length === 0) return res.status(400).json({ message: "No fields to update" });

      updates.push(`updated_at=NOW()`);
      values.push(req.params.id);
      const { rows } = await pool.query(`UPDATE treatment_plans SET ${updates.join(",")} WHERE id=$${idx} RETURNING *`, values);
      return res.json(rows[0]);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: error.errors });
      console.error("Update treatment plan error:", error);
      return res.status(500).json({ message: "Failed to update treatment plan" });
    }
  });

  // POST /api/provider/treatment-plans/:planId/tasks
  app.post("/api/provider/treatment-plans/:planId/tasks", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      const { rows: planCheck } = await pool.query(`SELECT id FROM treatment_plans WHERE id=$1 AND provider_id=$2`, [req.params.planId, provider.id]);
      if (!planCheck[0]) return res.status(404).json({ message: "Treatment plan not found" });

      const schema = z.object({ title: z.string().min(1).max(500), description: z.string().max(2000).optional(), dueDate: z.string().optional() });
      const parsed = schema.parse(req.body);

      const { rows } = await pool.query(
        `INSERT INTO treatment_tasks (plan_id, title, description, due_date) VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.params.planId, parsed.title, parsed.description ?? null, parsed.dueDate ?? null],
      );
      return res.status(201).json(rows[0]);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid task data", errors: error.errors });
      console.error("Create task error:", error);
      return res.status(500).json({ message: "Failed to create task" });
    }
  });

  // PATCH /api/provider/treatment-tasks/:taskId
  app.patch("/api/provider/treatment-tasks/:taskId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      const { rows: taskCheck } = await pool.query(
        `SELECT t.id FROM treatment_tasks t JOIN treatment_plans p ON p.id = t.plan_id WHERE t.id=$1 AND p.provider_id=$2`,
        [req.params.taskId, provider.id],
      );
      if (!taskCheck[0]) return res.status(404).json({ message: "Task not found" });

      const schema = z.object({
        title: z.string().min(1).max(500).optional(),
        description: z.string().max(2000).optional(),
        status: z.enum(["pending", "in_progress", "completed", "skipped"]).optional(),
        dueDate: z.string().nullable().optional(),
      });
      const parsed = schema.parse(req.body);

      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;
      if (parsed.title       !== undefined) { updates.push(`title=$${idx++}`);       values.push(parsed.title); }
      if (parsed.description !== undefined) { updates.push(`description=$${idx++}`); values.push(parsed.description); }
      if (parsed.status      !== undefined) {
        updates.push(`status=$${idx++}`);      values.push(parsed.status);
        if (parsed.status === "completed") { updates.push(`completed_at=NOW()`); }
        else                               { updates.push(`completed_at=NULL`); }
      }
      if (parsed.dueDate !== undefined) { updates.push(`due_date=$${idx++}`); values.push(parsed.dueDate); }
      if (updates.length === 0) return res.status(400).json({ message: "No fields to update" });

      values.push(req.params.taskId);
      const { rows } = await pool.query(`UPDATE treatment_tasks SET ${updates.join(",")} WHERE id=$${idx} RETURNING *`, values);
      return res.json(rows[0]);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: error.errors });
      console.error("Update task error:", error);
      return res.status(500).json({ message: "Failed to update task" });
    }
  });

  // DELETE /api/provider/treatment-tasks/:taskId
  app.delete("/api/provider/treatment-tasks/:taskId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      const { rowCount } = await pool.query(
        `DELETE FROM treatment_tasks t USING treatment_plans p WHERE t.id=$1 AND t.plan_id=p.id AND p.provider_id=$2`,
        [req.params.taskId, provider.id],
      );
      if (!rowCount) return res.status(404).json({ message: "Task not found" });
      return res.json({ ok: true });
    } catch (error) {
      console.error("Delete task error:", error);
      return res.status(500).json({ message: "Failed to delete task" });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // P3 CLINICAL WORKSPACE — PRESCRIPTION LIFECYCLE
  // ══════════════════════════════════════════════════════════════════════════════

  // PATCH /api/provider/prescriptions/:id/status  (lifecycle transition)
  app.patch("/api/provider/prescriptions/:id/status", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      const VALID_STATUSES = ["draft", "issued", "active", "completed", "cancelled", "expired", "refilled"] as const;
      const schema = z.object({ status: z.enum(VALID_STATUSES) });
      const { status } = schema.parse(req.body);

      const { rows: existing } = await pool.query(
        `SELECT id, patient_id, medication_name, status FROM prescriptions WHERE id=$1 AND provider_id=$2`,
        [req.params.id, provider.id],
      );
      if (!existing[0]) return res.status(404).json({ message: "Prescription not found" });

      const { rows } = await pool.query(`UPDATE prescriptions SET status=$1, is_active=$2 WHERE id=$3 RETURNING *`, [
        status,
        status === "active" || status === "issued",
        req.params.id,
      ]);

      await storage.createAuditLog({ userId: req.user!.id, action: "update", entityType: "prescription", entityId: req.params.id, details: JSON.stringify({ previousStatus: existing[0].status, newStatus: status }) } as any).catch(() => {});
      return res.json(rows[0]);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid status", errors: error.errors });
      console.error("Update prescription status error:", error);
      return res.status(500).json({ message: "Failed to update prescription status" });
    }
  });

  // POST /api/provider/prescriptions/:id/refill  (create refill copy)
  app.post("/api/provider/prescriptions/:id/refill", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      const { rows: existing } = await pool.query(
        `SELECT * FROM prescriptions WHERE id=$1 AND provider_id=$2`,
        [req.params.id, provider.id],
      );
      if (!existing[0]) return res.status(404).json({ message: "Prescription not found" });
      const orig = existing[0];

      // Mark original as refilled
      await pool.query(`UPDATE prescriptions SET status='refilled', is_active=false WHERE id=$1`, [orig.id]);

      // Create new active prescription linked to original
      const { rows } = await pool.query(
        `INSERT INTO prescriptions (appointment_id, patient_id, provider_id, medication_name, dosage, frequency, duration, instructions, status, refill_of, refill_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$10) RETURNING *`,
        [orig.appointment_id, orig.patient_id, orig.provider_id, orig.medication_name, orig.dosage, orig.frequency, orig.duration, orig.instructions, orig.id, (orig.refill_count ?? 0) + 1],
      );
      return res.status(201).json(rows[0]);
    } catch (error: any) {
      const pgCode = error?.code ?? error?.cause?.code;
      if (pgCode === "42P01") return res.status(503).json({ message: "Database not ready." });
      console.error("Refill prescription error:", error);
      return res.status(500).json({ message: "Failed to refill prescription" });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // P3 CLINICAL WORKSPACE — PDF PRESCRIPTION GENERATION
  // ══════════════════════════════════════════════════════════════════════════════

  // GET /api/provider/prescriptions/:id/pdf
  app.get("/api/provider/prescriptions/:id/pdf", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      const { rows } = await pool.query(
        `SELECT rx.*,
                u.first_name || ' ' || u.last_name AS patient_name,
                u.date_of_birth AS patient_dob,
                u.phone AS patient_phone,
                pu.first_name || ' ' || pu.last_name AS provider_full_name,
                p.license_number,
                p.clinic_name,
                p.clinic_address
         FROM prescriptions rx
         JOIN users u  ON u.id  = rx.patient_id
         JOIN providers p ON p.id = rx.provider_id
         JOIN users pu ON pu.id = p.user_id
         WHERE rx.id = $1 AND rx.provider_id = $2`,
        [req.params.id, provider.id],
      );
      if (!rows[0]) return res.status(404).json({ message: "Prescription not found" });

      const rx = rows[0];

      const doc = new PDFDocument({ margin: 50, size: "A4" });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="prescription-${rx.id.slice(0, 8)}.pdf"`);
      doc.pipe(res);

      // ── Header ─────────────────────────────────────────────────────────────
      doc.fontSize(20).font("Helvetica-Bold").text("PRESCRIPTION", { align: "center" });
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica").fillColor("#666").text("GoldenLife Health Platform", { align: "center" });
      doc.moveDown(1);

      // ── Provider Info ──────────────────────────────────────────────────────
      doc.fillColor("#000").fontSize(12).font("Helvetica-Bold").text("Prescribing Provider");
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#ddd");
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica");
      doc.text(`Name: ${rx.provider_full_name ?? "—"}`);
      if (rx.clinic_name) doc.text(`Clinic: ${rx.clinic_name}`);
      if (rx.license_number) doc.text(`License No: ${rx.license_number}`);
      if (rx.clinic_address) doc.text(`Address: ${rx.clinic_address}`);
      doc.moveDown(1);

      // ── Patient Info ───────────────────────────────────────────────────────
      doc.fontSize(12).font("Helvetica-Bold").text("Patient Information");
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#ddd");
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica");
      doc.text(`Name: ${rx.patient_name ?? "—"}`);
      if (rx.patient_dob) doc.text(`Date of Birth: ${new Date(rx.patient_dob).toISOString().slice(0, 10)}`);
      if (rx.patient_phone) doc.text(`Phone: ${rx.patient_phone}`);
      doc.moveDown(1);

      // ── Medication ─────────────────────────────────────────────────────────
      doc.fontSize(12).font("Helvetica-Bold").text("Medication Details");
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#ddd");
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica");
      doc.font("Helvetica-Bold").text(`${rx.medication_name}`, { continued: true }).font("Helvetica").text(rx.dosage ? ` — ${rx.dosage}` : "");
      doc.text(`Frequency: ${rx.frequency ?? "—"}`);
      doc.text(`Duration: ${rx.duration ?? "—"}`);
      if (rx.instructions) doc.text(`Instructions: ${rx.instructions}`);
      doc.moveDown(1);

      // ── Dates & Reference ─────────────────────────────────────────────────
      doc.fontSize(12).font("Helvetica-Bold").text("Prescription Details");
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#ddd");
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica");
      doc.text(`Prescription ID: ${rx.id}`);
      doc.text(`Issue Date: ${rx.issued_at ? new Date(rx.issued_at).toISOString().slice(0, 10) : "—"}`);
      if (rx.expires_at) doc.text(`Expiry Date: ${new Date(rx.expires_at).toISOString().slice(0, 10)}`);
      doc.text(`Status: ${(rx.status ?? "active").toUpperCase()}`);
      if ((rx.refill_count ?? 0) > 0) doc.text(`Refill Number: ${rx.refill_count}`);
      doc.moveDown(2);

      // ── Signature line ─────────────────────────────────────────────────────
      doc.moveTo(350, doc.y).lineTo(545, doc.y).stroke("#000");
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor("#666").text("Provider Signature / Stamp", { align: "right" });
      doc.moveDown(0.5);
      doc.fontSize(8).text(`Generated: ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC  |  GoldenLife Health`, { align: "center" });

      doc.end();
    } catch (error: any) {
      if (!res.headersSent) {
        const pgCode = error?.code ?? error?.cause?.code;
        if (pgCode === "42P01") return res.status(503).json({ message: "Database not ready." });
        console.error("Generate PDF prescription error:", error);
        return res.status(500).json({ message: "Failed to generate PDF" });
      }
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // P3 CLINICAL WORKSPACE — CLINICAL ATTACHMENTS
  // ══════════════════════════════════════════════════════════════════════════════

  // GET /api/provider/patients/:patientId/attachments
  app.get("/api/provider/patients/:patientId/attachments", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Provider profile not found" });

      const { rows: check } = await pool.query(
        `SELECT id FROM appointments WHERE provider_id=$1 AND patient_id=$2 LIMIT 1`,
        [provider?.id, req.params.patientId],
      );
      if (check.length === 0 && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Access denied" });

      const { rows } = await pool.query(
        `SELECT ca.*, u.first_name || ' ' || u.last_name AS uploaded_by_name
         FROM clinical_attachments ca
         LEFT JOIN users u ON u.id = ca.uploaded_by
         WHERE ca.patient_id = $1 ORDER BY ca.created_at DESC`,
        [req.params.patientId],
      );
      return res.json(rows);
    } catch (error: any) {
      const pgCode = error?.code ?? error?.cause?.code;
      if (pgCode === "42P01") return res.json([]);
      console.error("Get attachments error:", error);
      return res.status(500).json({ message: "Failed to get attachments" });
    }
  });

  // POST /api/provider/attachments
  app.post("/api/provider/attachments", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      const schema = z.object({
        patientId: z.string().min(1),
        appointmentId: z.string().optional(),
        category: z.enum(["general", "lab_result", "imaging", "report", "prescription_scan", "referral"]).default("general"),
        title: z.string().min(1).max(500),
        fileUrl: z.string().url().min(1),
        fileType: z.string().max(100).optional(),
        fileSize: z.number().int().positive().optional(),
        notes: z.string().max(2000).optional(),
      });
      const parsed = schema.parse(req.body);

      const { rows: check } = await pool.query(
        `SELECT id FROM appointments WHERE provider_id=$1 AND patient_id=$2 LIMIT 1`,
        [provider.id, parsed.patientId],
      );
      if (check.length === 0) return res.status(403).json({ message: "You can only attach files for your own patients" });

      const { rows } = await pool.query(
        `INSERT INTO clinical_attachments (patient_id, provider_id, appointment_id, category, title, file_url, file_type, file_size, notes, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [parsed.patientId, provider.id, parsed.appointmentId ?? null, parsed.category, parsed.title, parsed.fileUrl, parsed.fileType ?? null, parsed.fileSize ?? null, parsed.notes ?? null, req.user!.id],
      );
      return res.status(201).json(rows[0]);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid attachment data", errors: error.errors });
      const pgCode = error?.code ?? error?.cause?.code;
      if (pgCode === "42P01") return res.status(503).json({ message: "Database not ready." });
      console.error("Create attachment error:", error);
      return res.status(500).json({ message: "Failed to create attachment" });
    }
  });

  // DELETE /api/provider/attachments/:id
  app.delete("/api/provider/attachments/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      const { rowCount } = await pool.query(`DELETE FROM clinical_attachments WHERE id=$1 AND provider_id=$2`, [req.params.id, provider.id]);
      if (!rowCount) return res.status(404).json({ message: "Attachment not found" });
      return res.json({ ok: true });
    } catch (error) {
      console.error("Delete attachment error:", error);
      return res.status(500).json({ message: "Failed to delete attachment" });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // P3 CLINICAL WORKSPACE — CLINICAL SEARCH
  // ══════════════════════════════════════════════════════════════════════════════

  // GET /api/provider/clinical-search?q=&type=
  app.get("/api/provider/clinical-search", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      const q = String(req.query.q ?? "").trim();
      const type = String(req.query.type ?? "all");
      if (!q || q.length < 2) return res.json({ results: [] });

      const likeQ = `%${q.toLowerCase()}%`;
      const results: unknown[] = [];

      if (type === "all" || type === "patients") {
        const { rows } = await pool.query(
          `SELECT DISTINCT u.id, 'patient' AS result_type, u.first_name || ' ' || u.last_name AS title,
                  u.email AS subtitle, u.created_at AS date
           FROM users u
           JOIN appointments a ON a.patient_id = u.id AND a.provider_id = $1
           WHERE LOWER(u.first_name || ' ' || u.last_name) LIKE $2 OR LOWER(u.email) LIKE $2
           LIMIT 10`,
          [provider.id, likeQ],
        );
        results.push(...rows);
      }

      if (type === "all" || type === "prescriptions") {
        const { rows } = await pool.query(
          `SELECT rx.id, 'prescription' AS result_type, rx.medication_name AS title,
                  u.first_name || ' ' || u.last_name AS subtitle, rx.issued_at AS date
           FROM prescriptions rx
           JOIN users u ON u.id = rx.patient_id
           WHERE rx.provider_id = $1 AND LOWER(rx.medication_name) LIKE $2
           ORDER BY rx.issued_at DESC LIMIT 10`,
          [provider.id, likeQ],
        );
        results.push(...rows);
      }

      if (type === "all" || type === "diagnoses") {
        const { rows } = await pool.query(
          `SELECT d.id, 'diagnosis' AS result_type, d.title,
                  u.first_name || ' ' || u.last_name AS subtitle, d.diagnosed_at AS date
           FROM diagnoses d
           JOIN users u ON u.id = d.patient_id
           WHERE d.provider_id = $1 AND (LOWER(d.title) LIKE $2 OR LOWER(d.code) LIKE $2)
           ORDER BY d.diagnosed_at DESC LIMIT 10`,
          [provider.id, likeQ],
        ).catch(() => ({ rows: [] as unknown[] }));
        results.push(...rows);
      }

      if (type === "all" || type === "notes") {
        const { rows } = await pool.query(
          `SELECT pn.id, 'note' AS result_type, LEFT(pn.content, 100) AS title,
                  u.first_name || ' ' || u.last_name AS subtitle, pn.created_at AS date
           FROM patient_notes pn
           JOIN users u ON u.id = pn.patient_id
           WHERE pn.provider_id = $1 AND LOWER(pn.content) LIKE $2
           ORDER BY pn.created_at DESC LIMIT 10`,
          [provider.id, likeQ],
        );
        results.push(...rows);
      }

      if (type === "all" || type === "treatment_plans") {
        const { rows } = await pool.query(
          `SELECT tp.id, 'treatment_plan' AS result_type, tp.title,
                  u.first_name || ' ' || u.last_name AS subtitle, tp.created_at AS date
           FROM treatment_plans tp
           JOIN users u ON u.id = tp.patient_id
           WHERE tp.provider_id = $1 AND (LOWER(tp.title) LIKE $2 OR LOWER(tp.description) LIKE $2)
           ORDER BY tp.created_at DESC LIMIT 10`,
          [provider.id, likeQ],
        ).catch(() => ({ rows: [] as unknown[] }));
        results.push(...rows);
      }

      // Sort all results by date desc
      (results as Array<{ date?: string }>).sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db2 = b.date ? new Date(b.date).getTime() : 0;
        return db2 - da;
      });

      return res.json({ results: results.slice(0, 20) });
    } catch (error) {
      console.error("Clinical search error:", error);
      return res.status(500).json({ message: "Search failed" });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // P3 CLINICAL WORKSPACE — PROVIDER CLINICAL DASHBOARD
  // ══════════════════════════════════════════════════════════════════════════════

  // GET /api/provider/clinical-dashboard
  app.get("/api/provider/clinical-dashboard", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) return res.status(403).json({ message: "Forbidden" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });

      const client = await pool.connect();
      try {
        const [
          activePatients,
          pendingFollowUps,
          activePrescriptions,
          recentDiagnoses,
          activePlans,
          recentNotes,
          upcomingAppts,
        ] = await Promise.all([
          // Active patients (had appt in last 90 days)
          client.query<{ count: string }>(
            `SELECT COUNT(DISTINCT patient_id)::text AS count FROM appointments
             WHERE provider_id=$1 AND start_at > NOW()-INTERVAL '90 days'`,
            [provider.id],
          ),
          // Pending follow-ups
          client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM appointments
             WHERE provider_id=$1 AND follow_up_recommended=true AND status='completed'
             AND id NOT IN (SELECT DISTINCT follow_up_of FROM appointments WHERE follow_up_of IS NOT NULL AND provider_id=$1)`,
            [provider.id],
          ).catch(() => ({ rows: [{ count: "0" }] })),
          // Active prescriptions
          client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM prescriptions WHERE provider_id=$1 AND is_active=true`,
            [provider.id],
          ),
          // Recent diagnoses (last 30 days)
          client.query(
            `SELECT d.*, u.first_name || ' ' || u.last_name AS patient_name
             FROM diagnoses d JOIN users u ON u.id=d.patient_id
             WHERE d.provider_id=$1 AND d.created_at > NOW()-INTERVAL '30 days'
             ORDER BY d.created_at DESC LIMIT 5`,
            [provider.id],
          ).catch(() => ({ rows: [] })),
          // Active treatment plans
          client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM treatment_plans WHERE provider_id=$1 AND status='active'`,
            [provider.id],
          ).catch(() => ({ rows: [{ count: "0" }] })),
          // Recent notes (last 7 days)
          client.query(
            `SELECT pn.id, pn.content, pn.created_at, u.first_name || ' ' || u.last_name AS patient_name
             FROM patient_notes pn JOIN users u ON u.id=pn.patient_id
             WHERE pn.provider_id=$1 AND pn.created_at > NOW()-INTERVAL '7 days'
             ORDER BY pn.created_at DESC LIMIT 5`,
            [provider.id],
          ),
          // Upcoming appointments (next 7 days)
          client.query(
            `SELECT a.id, a.start_at, a.status,
                    u.first_name || ' ' || u.last_name AS patient_name,
                    s.name AS service_name
             FROM appointments a
             JOIN users u ON u.id=a.patient_id
             LEFT JOIN services s ON s.id=a.service_id
             WHERE a.provider_id=$1 AND a.start_at BETWEEN NOW() AND NOW()+INTERVAL '7 days'
               AND a.status NOT IN ('cancelled','no_show')
             ORDER BY a.start_at ASC LIMIT 10`,
            [provider.id],
          ),
        ]);

        return res.json({
          stats: {
            activePatients: parseInt(activePatients.rows[0]?.count ?? "0"),
            pendingFollowUps: parseInt(pendingFollowUps.rows[0]?.count ?? "0"),
            activePrescriptions: parseInt(activePrescriptions.rows[0]?.count ?? "0"),
            activeTreatmentPlans: parseInt(activePlans.rows[0]?.count ?? "0"),
          },
          recentDiagnoses: recentDiagnoses.rows,
          recentNotes: recentNotes.rows,
          upcomingAppointments: upcomingAppts.rows,
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Clinical dashboard error:", error);
      return res.status(500).json({ message: "Failed to load clinical dashboard" });
    }
  });

}
