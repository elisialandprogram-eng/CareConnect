/**
 * Admin Providers routes — extracted from server/routes.ts
 *
 * Covers: provider-documents, credentials, category-permissions, create-provider,
 * providers-list, services-overview, practitioners, services CRUD, revenue,
 * console, actions, office-hours, bulk-availability, title-requests.
 */

import type { Express, Response } from "express";
import { storage } from "../../storage";
import { db, pool } from "../../db";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import {
  providers,
  users,
  practitioners,
  providerDocuments,
  auditLogs,
  updateServiceSchema,
} from "@shared/schema";
import bcrypt from "bcrypt";
import {
  authenticateToken,
  requireAdmin,
  requireGlobalAdmin,
  AuthRequest,
  invalidateAuthCache,
} from "../../middleware/auth";
import {
  requirePermission,
  PERMISSIONS,
} from "../../middleware/rbac";
import {
  normalizeDocStatus,
  recomputeProviderVerificationState,
} from "../../lib/verification";
import {
  isAdminRole,
  isGlobalAdmin,
  canAccessCountry,
  listingCountryFilter,
  isCountryCode,
  CountryCode,
} from "../../middleware/country";
import { providerListCache, providerSearchCache } from "../../lib/cache";
import { dispatchNotification } from "../../services/notification-dispatcher";
import { sendAppointmentEmail } from "../shared/helpers";

export function registerAdminProvidersRoutes(app: Express): void {

  // ── Provider documents ────────────────────────────────────────────────────
  app.get("/api/admin/provider-documents", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.DOCUMENTS_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const filters: { status?: string; countryCode?: string } = {};
      if (status) filters.status = status;
      if (countryFilter) filters.countryCode = countryFilter;
      const docs = await storage.getAllProviderDocuments(Object.keys(filters).length ? filters : undefined);
      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address, country_code)
         VALUES ($1, 'view', 'provider_documents', 'list', $2, $3, $4)`,
        [req.user!.id, JSON.stringify({ filters, count: docs.length }), req.ip ?? null, req.user!.countryCode ?? null]
      ).catch(() => {});
      res.json(docs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.get("/api/admin/providers/:id/documents", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const prov = await storage.getProvider(req.params.id);
      if (!prov) return res.status(404).json({ message: "Provider not found" });
      if (!canAccessCountry(req.user!, (prov as any).countryCode)) {
        return res.status(403).json({ message: "Cross-country access denied" });
      }
      const docs = await storage.getProviderDocuments(req.params.id);
      res.json(docs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch provider documents" });
    }
  });

  app.get("/api/admin/providers/:id/credentials", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const prov = await storage.getProvider(req.params.id);
      if (!prov) return res.status(404).json({ message: "Provider not found" });
      if (!canAccessCountry(req.user!, (prov as any).countryCode)) {
        return res.status(403).json({ message: "Cross-country access denied" });
      }
      const creds = await storage.getProviderCredentials(req.params.id);
      res.json(creds);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch provider credentials" });
    }
  });

  app.patch("/api/admin/provider-documents/:id/status", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { status, adminNote } = req.body;
      // Only canonical values are accepted; normalizeDocStatus() is a safety net for edge-case stragglers
      const acceptedStatuses = ["approved", "rejected", "reupload_required", "under_review", "pending", "expiring_soon", "expired"];
      if (!status || !acceptedStatuses.includes(status)) return res.status(400).json({ message: "Invalid status" });
      const canonicalStatus = normalizeDocStatus(status);
      const doc = await storage.updateProviderDocumentStatus(req.params.id, canonicalStatus, adminNote, req.user?.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });

      if (["approved", "rejected", "reupload_required"].includes(canonicalStatus)) {
        const prov = await storage.getProvider((doc as any).providerId).catch(() => null);
        if (prov) {
          const msgMap: Record<string, string> = {
            approved:          `Your ${(doc as any).documentType?.replace(/_/g, " ") ?? "document"} has been approved.`,
            rejected:          `Your ${(doc as any).documentType?.replace(/_/g, " ") ?? "document"} was rejected.${adminNote ? ` Reason: ${adminNote}` : ""}`,
            reupload_required: `Please re-upload your ${(doc as any).documentType?.replace(/_/g, " ") ?? "document"}.${adminNote ? ` Note: ${adminNote}` : ""}`,
          };
          storage.createUserNotification({
            userId:  prov.userId,
            title:   canonicalStatus === "approved" ? "Document Approved ✓" : canonicalStatus === "rejected" ? "Document Rejected" : "Re-upload Required",
            message: msgMap[canonicalStatus] ?? `Document status updated to ${canonicalStatus}`,
            type:    "document_status",
            data:    JSON.stringify({ docId: (doc as any).id, documentType: (doc as any).documentType, status: canonicalStatus }),
          }).catch(() => {});
        }
      }

      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
         VALUES ($1, 'document_verify', 'provider_document', $2, $3, $4)`,
        [req.user!.id, (doc as any).id, JSON.stringify({ status: canonicalStatus, adminNote: adminNote || null, documentType: (doc as any).documentType }), (doc as any).countryCode ?? null]
      ).catch(() => {});

      // Recompute provider aggregate verification state on EVERY doc status change.
      // This is the single approval propagation path — do not add inline logic here.
      if ((doc as any).providerId) {
        recomputeProviderVerificationState(
          (doc as any).providerId,
          req.user!.id,
          (doc as any).countryCode ?? null,
        ).catch((autoErr) => {
          console.warn("[provider-recompute] error (non-fatal):", (autoErr as Error).message);
        });
      }

      res.json(doc);
    } catch (err) {
      res.status(500).json({ message: "Failed to update document status" });
    }
  });

  app.get("/api/admin/document-queue", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const isGlobal = req.user?.role === "global_admin";
      const countryCode = isGlobal
        ? (req.query.country as string | undefined)
        : req.user?.countryCode;
      const params: any[] = countryCode ? [countryCode] : [];
      const cWhere = countryCode ? "AND p.country_code::text = $1" : "";

      const base = `
        SELECT pd.id, pd.provider_id, pd.document_type, pd.document_url, pd.file_name,
               pd.verification_status, pd.document_criticality, pd.expiry_date, pd.expiry_required,
               pd.admin_note, pd.verified_by, pd.verified_at, pd.created_at,
               u.first_name, u.last_name, u.email, u.avatar_url,
               p.country_code, p.provider_type, p.is_verified
        FROM provider_documents pd
        JOIN providers p ON p.id = pd.provider_id
        JOIN users u ON u.id = p.user_id
      `;

      const [pendingR, expiringR, rejectedR, reuploadR, missingR] = await Promise.all([
        pool.query(`${base} WHERE pd.verification_status IN ('pending', 'under_review') ${cWhere} ORDER BY pd.created_at ASC LIMIT 100`, params),
        pool.query(`${base} WHERE pd.verification_status = 'expiring_soon' ${cWhere} ORDER BY pd.expiry_date ASC LIMIT 100`, params),
        pool.query(`${base} WHERE pd.verification_status = 'rejected' ${cWhere} ORDER BY pd.created_at DESC LIMIT 100`, params),
        pool.query(`${base} WHERE pd.verification_status = 'reupload_required' ${cWhere} ORDER BY pd.created_at DESC LIMIT 100`, params),
        pool.query(`
          WITH
          mandatory(doc_type) AS (VALUES ('medical_license'), ('degree'), ('id_card'), ('address_proof')),
          have AS (
            SELECT DISTINCT pd2.provider_id, pd2.document_type
            FROM provider_documents pd2
            WHERE pd2.verification_status NOT IN ('rejected','expired','missing')
          )
          SELECT p.id AS provider_id, p.id AS id,
                 u.first_name, u.last_name, u.email, u.avatar_url,
                 p.country_code, p.provider_type, p.is_verified,
                 m.doc_type AS document_type,
                 'missing' AS verification_status,
                 'critical' AS document_criticality,
                 NULL::timestamp AS created_at, NULL::timestamp AS expiry_date,
                 NULL::text AS document_url, NULL::text AS file_name,
                 NULL::text AS admin_note, NULL::timestamp AS verified_at,
                 NULL::text AS verified_by, false AS expiry_required
          FROM providers p
          JOIN users u ON u.id = p.user_id
          CROSS JOIN mandatory m
          WHERE p.status NOT IN ('rejected','suspended')
            ${countryCode ? "AND p.country_code::text = $1" : ""}
            AND NOT EXISTS (
              SELECT 1 FROM have h WHERE h.provider_id = p.id AND h.document_type = m.doc_type
            )
          ORDER BY u.first_name, m.doc_type
          LIMIT 150
        `, params),
      ]);

      res.json({
        pending:  pendingR.rows,
        expiring: expiringR.rows,
        rejected: rejectedR.rows,
        reupload: reuploadR.rows,
        missing:  missingR.rows,
      });
    } catch (err: any) {
      console.error("[admin/document-queue]", err);
      res.status(500).json({ message: "Failed to load document queue" });
    }
  });

  // ── GET /api/admin/document-expiry ───────────────────────────────────────
  // Returns all provider_documents that have an expiry_date set, grouped into
  // urgency tiers.  Only active (non-rejected / non-deactivated) providers included.
  app.get("/api/admin/document-expiry", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.DOCUMENTS_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const countryCode = listingCountryFilter(req.user!, req.query as any);
      const cWhere = countryCode ? `AND p.country_code::text = $1` : "";
      const params: string[] = countryCode ? [countryCode] : [];

      const { rows } = await pool.query(`
        SELECT
          pd.id, pd.provider_id, pd.document_type, pd.document_url, pd.file_name,
          pd.verification_status, pd.expiry_date, pd.document_criticality, pd.admin_note,
          u.first_name, u.last_name, u.email, u.avatar_url,
          p.country_code, p.provider_type, p.is_verified,
          (pd.expiry_date::date - CURRENT_DATE)::integer AS days_left
        FROM provider_documents pd
        JOIN providers p ON p.id = pd.provider_id
        JOIN users u ON u.id = p.user_id
        WHERE pd.expiry_date IS NOT NULL
          AND p.status NOT IN ('rejected', 'suspended', 'deactivated')
          ${cWhere}
        ORDER BY pd.expiry_date::date ASC
        LIMIT 500
      `, params);

      const toInt = (v: unknown) => parseInt(v as string, 10);
      const overdue  = rows.filter(r => toInt(r.days_left) < 0);
      const critical = rows.filter(r => toInt(r.days_left) >= 0 && toInt(r.days_left) <= 14);
      const warning  = rows.filter(r => toInt(r.days_left) > 14 && toInt(r.days_left) <= 30);
      const notice   = rows.filter(r => toInt(r.days_left) > 30 && toInt(r.days_left) <= 60);
      const upcoming = rows.filter(r => toInt(r.days_left) > 60 && toInt(r.days_left) <= 90);

      res.json({ overdue, critical, warning, notice, upcoming });
    } catch (err: any) {
      console.error("[admin/document-expiry]", err);
      res.status(500).json({ message: "Failed to load document expiry data" });
    }
  });

  // ── POST /api/admin/document-expiry/bulk-reupload ────────────────────────
  // Sets multiple documents to reupload_required in one call, sending a
  // provider notification for each.  Used by the Expiry Monitor bulk action.
  app.post("/api/admin/document-expiry/bulk-reupload", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.DOCUMENTS_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const { documentIds, adminNote } = req.body as { documentIds: string[]; adminNote?: string };
      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ message: "documentIds array is required" });
      }

      let updated = 0;
      for (const docId of documentIds) {
        try {
          const doc = await storage.updateProviderDocumentStatus(docId, "reupload_required", adminNote ?? "Document expiring — please re-upload an up-to-date version.", req.user?.id);
          if (doc) {
            const prov = await storage.getProvider((doc as any).providerId).catch(() => null);
            if (prov) {
              storage.createUserNotification({
                userId:  prov.userId,
                title:   "Re-upload Required",
                message: `Your ${((doc as any).documentType ?? "document").replace(/_/g, " ")} is expiring or has expired. Please upload a current version.`,
                type:    "document_status",
                data:    JSON.stringify({ documentId: docId, documentType: (doc as any).documentType }),
              }).catch(() => {});
            }
            updated++;
          }
        } catch (_e) { /* skip individual errors */ }
      }

      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
         VALUES ($1, 'bulk_reupload_requested', 'provider_document', 'bulk', $2, $3)`,
        [req.user!.id, JSON.stringify({ count: updated, documentIds }), req.user!.countryCode ?? null],
      ).catch(() => {});

      res.json({ message: `Flagged ${updated} document(s) for re-upload`, updated });
    } catch (err: any) {
      console.error("[admin/document-expiry/bulk-reupload]", err);
      res.status(500).json({ message: "Failed to bulk-flag documents" });
    }
  });

  app.get("/api/admin/provider-credentials", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.DOCUMENTS_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const verified = req.query.verified === "true" ? true : req.query.verified === "false" ? false : undefined;
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const filters: { verified?: boolean; countryCode?: string } = {};
      if (verified !== undefined) filters.verified = verified;
      if (countryFilter) filters.countryCode = countryFilter;
      const creds = await storage.getAllProviderCredentials(Object.keys(filters).length ? filters : undefined);
      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address, country_code)
         VALUES ($1, 'view', 'provider_credentials', 'list', $2, $3, $4)`,
        [req.user!.id, JSON.stringify({ filters, count: creds.length }), req.ip ?? null, req.user!.countryCode ?? null]
      ).catch(() => {});
      res.json(creds);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch credentials" });
    }
  });

  app.patch("/api/admin/provider-credentials/:id/verify", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.DOCUMENTS_VERIFY), async (req: AuthRequest, res: Response) => {
    try {
      const { verified, adminNote } = req.body;
      if (typeof verified !== "boolean") return res.status(400).json({ message: "verified (boolean) is required" });
      const cred = await storage.verifyProviderCredential(req.params.id, verified, adminNote);
      if (!cred) return res.status(404).json({ message: "Credential not found" });
      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
         VALUES ($1, 'credential_verify', 'provider_credential', $2, $3, $4)`,
        [req.user!.id, req.params.id, JSON.stringify({ verified, adminNote: adminNote || null }), req.user!.countryCode ?? null]
      ).catch(() => {});
      res.json(cred);
    } catch (err) {
      res.status(500).json({ message: "Failed to update credential verification" });
    }
  });

  // ── Category permissions ──────────────────────────────────────────────────
  // The provider_category_permissions.category column stores provider_type enum values,
  // not UUID-based category IDs. Return provider_type slugs as the "all options" list
  // so the frontend draft keys align with what the DB column accepts.
  const PROVIDER_TYPE_OPTIONS = [
    { id: "physician",            name: "Physician",            slug: "physician"            },
    { id: "mental_health",        name: "Mental Health",        slug: "mental_health"        },
    { id: "nutrition",            name: "Nutrition",            slug: "nutrition"            },
    { id: "rehabilitation",       name: "Rehabilitation",       slug: "rehabilitation"       },
    { id: "dental",               name: "Dental",               slug: "dental"               },
    { id: "alternative_medicine", name: "Alternative Medicine", slug: "alternative_medicine" },
    { id: "nursing",              name: "Nursing",              slug: "nursing"              },
  ];

  app.get("/api/admin/providers/:id/category-permissions", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const perms = await storage.getProviderCategoryPermissions(req.params.id);
      res.json({ permissions: perms, allCategories: PROVIDER_TYPE_OPTIONS });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch permissions" });
    }
  });

  app.put("/api/admin/providers/:id/category-permissions", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { permissions } = req.body;
      if (!Array.isArray(permissions)) return res.status(400).json({ message: "permissions array required" });
      const result = await storage.setProviderCategoryPermissions(req.params.id, permissions);
      res.json(result);
    } catch (err: any) {
      const pgMsg = err?.cause?.message ?? err?.message ?? String(err);
      console.error("[category-permissions PUT]", pgMsg);
      res.status(500).json({ message: "Failed to save permissions" });
    }
  });

  app.delete("/api/admin/providers/:id/category-permissions", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.clearProviderCategoryPermissions(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to clear permissions" });
    }
  });

  // ── Create provider ───────────────────────────────────────────────────────
  app.post("/api/admin/providers", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { email, password, firstName, lastName, phone, countryCode: rawCountry, ...providerData } = req.body;

      let countryCode: CountryCode = req.user!.countryCode || "HU";
      if (isCountryCode(rawCountry)) {
        if (isGlobalAdmin(req.user!.role)) countryCode = rawCountry;
        else if (rawCountry !== req.user!.countryCode) {
          return res.status(403).json({ message: "Cannot create providers outside your country" });
        } else countryCode = rawCountry;
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        email, password: hashedPassword, firstName, lastName,
        phone: phone || "", role: "provider", isEmailVerified: true, countryCode,
      } as any);

      const provider = await storage.createProvider({
        ...providerData,
        userId: user.id,
        isVerified: true, isActive: true, countryCode,
      } as any);

      res.status(201).json(provider);
    } catch (error: any) {
      console.error("Admin provider creation error:", error);
      res.status(500).json({ message: error.message || "Failed to create provider" });
    }
  });

  // ── Providers list ────────────────────────────────────────────────────────
  app.get("/api/admin/providers", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const limit  = Math.min(Number(req.query.limit)  || 50, 200);
      const offset = Math.max(Number(req.query.offset) || 0,  0);
      const search = (req.query.search as string) || (req.query.q as string) || "";
      const { rows, total } = await storage.searchProviders({
        q: search,
        countryCode: countryFilter,
        approvedOnly: false,
        limit,
        offset,
      });
      res.json({ providers: rows, total, page: Math.floor(offset / limit) + 1, limit });
    } catch (error) {
      res.status(500).json({ message: "Failed to get providers" });
    }
  });

  app.get("/api/admin/services-overview", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const cc = countryFilter ?? null;
      const result = await pool.query(`
        SELECT s.*,
               COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), '—') AS "providerName",
               p.city AS "providerCity"
        FROM services s
        LEFT JOIN providers p ON p.id = s.provider_id
        LEFT JOIN users u ON u.id = p.user_id
        WHERE ($1::text IS NULL OR s.country_code::text = $1)
        ORDER BY s.created_at DESC
      `, [cc]);
      res.json(result.rows);
    } catch (error) {
      console.error("services-overview error", error);
      res.status(500).json({ message: "Failed to fetch services overview" });
    }
  });

  app.get("/api/admin/practitioners", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const statusFilter = (req.query.status as string) || null;
      const result = await pool.query(`
        SELECT pt.*,
               COALESCE(NULLIF(p.clinic_name, ''),
                 NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), '—') AS "providerName"
        FROM practitioners pt
        LEFT JOIN providers p ON p.id = pt.provider_id
        LEFT JOIN users u ON u.id = p.user_id
        WHERE ($1::text IS NULL OR pt.status = $1)
        ORDER BY pt.created_at DESC
      `, [statusFilter]);
      res.json(result.rows);
    } catch (error) {
      console.error("practitioners list error", error);
      res.status(500).json({ message: "Failed to fetch practitioners" });
    }
  });

  app.get("/api/admin/providers/:id/services", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const services = await storage.getServicesByProvider(req.params.id);
      res.json(services);
    } catch (error) {
      res.status(500).json({ message: "Failed to get provider services" });
    }
  });

  app.post("/api/admin/providers/:id/services", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const service = await storage.createService({ ...req.body, providerId: req.params.id });
      res.status(201).json(service);
    } catch (error) {
      console.error("[POST /api/admin/providers/:id/services]", error);
      res.status(500).json({ message: "Failed to create service" });
    }
  });

  app.post("/api/admin/providers/:id/assign-services", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({ subServiceIds: z.array(z.string().uuid()).min(1).max(200) });
      const { subServiceIds } = schema.parse(req.body);
      const provider = await storage.getProvider(req.params.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const result = await storage.assignSubServicesToProvider(provider.id, subServiceIds);
      res.status(201).json({
        assignedCount: result.assigned.length,
        skippedCount:  result.skipped.length,
        assigned: result.assigned,
        skipped:  result.skipped,
      });
    } catch (e: any) {
      if (e?.name === "ZodError") return res.status(400).json({ message: e.errors?.[0]?.message || "Invalid payload" });
      console.error("assign-services error", e);
      res.status(500).json({ message: "Failed to assign services" });
    }
  });

  app.patch("/api/admin/services/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const bufParse = updateServiceSchema.safeParse(req.body);
      if (!bufParse.success) {
        return res.status(400).json({ message: bufParse.error.errors[0]?.message || "Invalid payload" });
      }
      const service = await storage.updateService(req.params.id, req.body);
      if (!service) return res.status(404).json({ message: "Service not found" });
      res.json(service);
    } catch (error) {
      res.status(500).json({ message: "Failed to update service" });
    }
  });

  app.delete("/api/admin/services/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const force = req.query.force === "true";
      const existing = await storage.getService(req.params.id);
      const result = await storage.deleteService(req.params.id, { force });
      if ("soft" in result && result.soft) {
        return res.json({ ok: true, archived: true, message: existing ? `"${existing.name}" archived (in use). Pricing history preserved.` : "Archived." });
      }
      res.status(204).end();
    } catch (error) {
      console.error("Admin delete service error:", error);
      res.status(500).json({ message: "Failed to delete service" });
    }
  });

  app.get("/api/admin/providers/:id/revenue", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const totalRevenue = await storage.getProviderRevenueTotal(req.params.id);
      res.json({ totalRevenue: Math.round(totalRevenue * 100) / 100 });
    } catch (error) {
      res.status(500).json({ message: "Failed to calculate revenue" });
    }
  });

  // ── Provider Schedule (admin read-only view) ──────────────────────────────
  app.get("/api/admin/providers/:id/schedule", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const [officeHoursRes, templatesRes, timeOffRes, exceptionsRes] = await Promise.all([
        pool.query(
          `SELECT * FROM provider_office_hours WHERE provider_id = $1 LIMIT 1`,
          [id],
        ),
        pool.query(
          `SELECT id, provider_id, day_of_week, start_time, end_time, is_active, modality,
                  slot_duration_mins, buffer_before_mins, buffer_after_mins,
                  created_at, updated_at
             FROM provider_schedule_templates
            WHERE provider_id = $1
            ORDER BY day_of_week, start_time`,
          [id],
        ),
        pool.query(
          `SELECT id, provider_id, start_date, end_date, reason, created_at
             FROM provider_time_off
            WHERE provider_id = $1
            ORDER BY start_date DESC LIMIT 30`,
          [id],
        ),
        pool.query(
          `SELECT id, provider_id, date, reason, created_at
             FROM availability_exceptions
            WHERE provider_id = $1
            ORDER BY date DESC LIMIT 30`,
          [id],
        ),
      ]);
      res.json({
        officeHours: officeHoursRes.rows[0] ?? null,
        scheduleTemplates: templatesRes.rows,
        timeOff: timeOffRes.rows,
        exceptions: exceptionsRes.rows,
      });
    } catch (err) {
      console.error("Provider schedule fetch error:", err);
      res.status(500).json({ message: "Failed to load schedule" });
    }
  });

  // ── Provider Operations Console ───────────────────────────────────────────
  app.get("/api/admin/providers/:id/console", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const [
        providerRows,
        providerServices,
        providerPractitioners,
        providerDocs,
        appointments,
        walletRows,
        auditRows,
        earningsUsdRes,
      ] = await Promise.all([
        db.select().from(providers).leftJoin(users, eq(providers.userId, users.id)).where(eq(providers.id, id)).limit(1),
        storage.getServicesByProvider(id),
        db.select().from(practitioners).where(eq(practitioners.providerId, id)),
        storage.getProviderDocuments(id),
        storage.getAppointmentsByProvider(id),
        pool.query(
          `SELECT w.id, w.user_id, w.balance, w.currency, w.is_frozen
           FROM wallets w
           JOIN providers p ON p.user_id = w.user_id
           WHERE p.id = $1 LIMIT 1`, [id]
        ),
        db.select().from(auditLogs).where(eq(auditLogs.entityId, id)).orderBy(desc(auditLogs.createdAt)).limit(50),
        // P4 FIX: provider_earnings.provider_earning is stored in USD (canonical)
        pool.query<{ total: string }>(
          `SELECT COALESCE(SUM(provider_earning::numeric), 0)::text AS total
             FROM provider_earnings
            WHERE provider_id = $1`,
          [id],
        ),
      ]);

      if (!providerRows.length) return res.status(404).json({ message: "Provider not found" });
      const { providers: prov, users: usr } = providerRows[0] as any;
      const completedAppts = appointments.filter((a: any) => a.status === "completed");
      const cancelledAppts = appointments.filter((a: any) =>
        ["cancelled", "cancelled_by_patient", "cancelled_by_provider"].includes(a.status));
      const activeAppts = appointments.filter((a: any) =>
        ["confirmed", "in_progress", "approved"].includes(a.status));
      const totalDocs = (providerDocs as any[]).length;
      const approvedDocs = (providerDocs as any[]).filter((d: any) => d.verificationStatus === "approved").length;
      const verificationPct = totalDocs > 0 ? Math.round((approvedDocs / totalDocs) * 100) : 0;
      const expiredDocs = (providerDocs as any[]).filter((d: any) => d.verificationStatus === "expired").length;
      const pendingDocs = (providerDocs as any[]).filter((d: any) => d.verificationStatus === "pending").length;
      const cancellationRate = appointments.length > 0 ? cancelledAppts.length / appointments.length : 0;
      const computedRisk = Math.min(100,
        expiredDocs * 15 + pendingDocs * 5 + Math.round(cancellationRate * 40) +
        (!(prov as any).isVerified ? 10 : 0) +
        ((prov as any).status !== "approved" && (prov as any).status !== "active" ? 20 : 0)
      );

      // P4: revenueUsd is from provider_earnings (USD storage) — safe to display as USD
      const revenueUsd = earningsUsdRes.rows[0]?.total ?? "0";

      res.json({
        provider: prov,
        user: usr,
        services: providerServices,
        practitioners: providerPractitioners,
        documents: providerDocs,
        appointments: {
          total: appointments.length,
          completed: completedAppts.length,
          cancelled: cancelledAppts.length,
          active: activeAppts.length,
          recent: appointments.slice(0, 20),
          cancellationRate: Math.round(cancellationRate * 100),
        },
        financials: {
          revenueUsd,
          walletBalance: (walletRows as any).rows?.length > 0
            ? Math.round(Number(((walletRows as any).rows[0]).balance || 0) * 100) / 100
            : 0,
          walletCurrency: (walletRows as any).rows?.length > 0
            ? (walletRows as any).rows[0].currency || "USD"
            : "USD",
        },
        metrics: { servicesCount: (providerServices as any[]).length, staffCount: (providerPractitioners as any[]).length, pendingDocs, approvedDocs, totalDocs, verificationPct, computedRisk },
        timeline: auditRows,
      });
    } catch (error) {
      console.error("console aggregated data error:", error);
      res.status(500).json({ message: "Failed to load provider console" });
    }
  });

  app.post("/api/admin/providers/:id/actions", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PROVIDERS_APPROVE), async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { action, reason, riskScore, notificationTitle, notificationBody } = req.body;
      const prov = await storage.getProvider(id);
      if (!prov) return res.status(404).json({ message: "Provider not found" });
      let result: any = {};

      switch (action) {
        case "approve": {
          // Check provider_documents (canonical table) for a medical_license record.
          // Fall back to providers.license_document_url for providers that pre-date the
          // doc-sync fix (the startup backfill will cover them on next boot).
          const { rows: licRows } = await pool.query<{ id: string }>(
            `SELECT id FROM provider_documents
              WHERE provider_id = $1 AND document_type = 'medical_license'
                AND document_url IS NOT NULL
              LIMIT 1`,
            [id],
          );
          const hasLicenseDoc = licRows.length > 0 || !!prov.licenseDocumentUrl;
          if (!hasLicenseDoc) {
            return res.status(400).json({ error: "Cannot approve provider profile: Mandatory credential license documentation is missing." });
          }
          await storage.updateProvider(id, { status: "approved", isVerified: true });
          providerListCache.clear();
          result = { message: "Provider approved" };
          break;
        }
        case "reject":
          await storage.updateProvider(id, { status: "rejected", rejectionReason: reason || "Rejected by admin" });
          providerListCache.clear();
          result = { message: "Provider rejected" };
          break;
        case "suspend":
          await storage.updateUser(prov.userId, { isSuspended: true, suspensionReason: reason || "Suspended by admin" });
          invalidateAuthCache(prov.userId);
          result = { message: "Provider suspended" };
          break;
        case "unsuspend":
          await storage.updateUser(prov.userId, { isSuspended: false, suspensionReason: null });
          invalidateAuthCache(prov.userId);
          result = { message: "Provider unsuspended" };
          break;
        case "enable_bookings":
          await storage.updateProvider(id, { bookingsEnabled: true } as any);
          result = { message: "Bookings enabled" };
          break;
        case "disable_bookings":
          await storage.updateProvider(id, { bookingsEnabled: false } as any);
          result = { message: "Bookings disabled" };
          break;
        case "update_risk":
          await storage.updateProvider(id, { riskScore: Number(riskScore) || 0 } as any);
          result = { message: "Risk score updated" };
          break;
        case "send_notification":
          await dispatchNotification({
            userId: prov.userId,
            title: notificationTitle || "Message from Admin",
            body: notificationBody || "",
            type: "admin_message",
          } as any);
          result = { message: "Notification sent" };
          break;

        case "deactivate":
          await storage.updateProvider(id, { status: "deactivated" } as any);
          await storage.updateUser(prov.userId, { isSuspended: true, suspensionReason: reason || "Account deactivated by admin" });
          invalidateAuthCache(prov.userId);
          providerListCache.clear();
          storage.createUserNotification({
            userId: prov.userId,
            title: "Account Deactivated",
            message: reason ? `Your account has been deactivated. Reason: ${reason}` : "Your account has been deactivated by an administrator.",
            type: "admin_message",
            data: JSON.stringify({ action: "deactivate" }),
          } as any).catch(() => {});
          result = { message: "Provider deactivated" };
          break;

        case "reactivate":
          await storage.updateProvider(id, { status: "approved" } as any);
          await storage.updateUser(prov.userId, { isSuspended: false, suspensionReason: null });
          invalidateAuthCache(prov.userId);
          providerListCache.clear();
          storage.createUserNotification({
            userId: prov.userId,
            title: "Account Reactivated ✓",
            message: "Your provider account has been reactivated. You can now accept patient bookings.",
            type: "admin_message",
            data: JSON.stringify({ action: "reactivate" }),
          } as any).catch(() => {});
          result = { message: "Provider reactivated" };
          break;

        case "request_changes": {
          await storage.updateProvider(id, { status: "action_required", rejectionReason: reason || "Changes requested by admin" } as any);
          providerListCache.clear();
          storage.createUserNotification({
            userId: prov.userId,
            title: "Profile Changes Requested",
            message: reason
              ? `An admin has requested changes to your profile: ${reason}`
              : "An admin has requested changes to your profile. Please log in to review and update.",
            type: "document_status",
            data: JSON.stringify({ action: "request_changes" }),
          } as any).catch(() => {});
          result = { message: "Changes requested — provider moved to action_required" };
          break;
        }

        case "reset_verification":
          await storage.updateProvider(id, { status: "submitted", isVerified: false, rejectionReason: null } as any);
          await pool.query(
            `UPDATE provider_documents SET verification_status = 'pending', verified_by = NULL, verified_at = NULL WHERE provider_id = $1`,
            [id],
          );
          providerListCache.clear();
          storage.createUserNotification({
            userId: prov.userId,
            title: "Verification Reset",
            message: "Your verification has been reset. All documents will be reviewed again.",
            type: "document_status",
            data: JSON.stringify({ action: "reset_verification" }),
          } as any).catch(() => {});
          result = { message: "Verification reset — all documents returned to pending" };
          break;

        case "request_documents": {
          const { documentTypes } = req.body;
          await storage.updateProvider(id, { status: "action_required", rejectionReason: reason || "Additional documents required" } as any);
          providerListCache.clear();

          // Mark each specified existing document as reupload_required with the admin note
          // so the provider sees exactly which documents need attention and why.
          if (Array.isArray(documentTypes) && documentTypes.length > 0) {
            const adminNote = reason || "Please re-upload this document.";
            for (const docType of documentTypes) {
              await pool.query(
                `UPDATE provider_documents
                 SET verification_status = 'reupload_required',
                     admin_note = $1
                 WHERE provider_id = $2
                   AND document_type = $3
                   AND deleted_at IS NULL`,
                [adminNote, id, docType],
              ).catch(() => {});
            }
          }

          const docList = Array.isArray(documentTypes) && documentTypes.length > 0
            ? documentTypes.map((t: string) => t.replace(/_/g, " ")).join(", ")
            : "additional documents";
          storage.createUserNotification({
            userId: prov.userId,
            title: "Documents Required",
            message: reason
              ? `${reason} Please re-upload: ${docList}.`
              : `Please re-upload the following documents to continue: ${docList}.`,
            type: "document_status",
            data: JSON.stringify({ action: "request_documents", documentTypes: documentTypes ?? [] }),
          } as any).catch(() => {});
          result = { message: "Document request sent — provider moved to action_required" };
          break;
        }

        default:
          return res.status(400).json({ message: "Unknown action" });
      }

      try {
        await storage.createAuditLog({
          userId: req.user!.id,
          action: action === "approve" ? "approve" : action === "reject" ? "reject" : "update",
          entityType: "provider",
          entityId: id,
          details: JSON.stringify({ action, reason, performedBy: req.user!.id }),
          ipAddress: req.ip || null,
          userAgent: req.get("user-agent") || null,
        } as any);
      } catch (_) {
        console.warn("[AUDIT_LOG_ERROR] Provider status adjustment audit log insertion failed:", _);
      }

      res.json(result);
    } catch (error) {
      console.error("provider action error:", error);
      res.status(500).json({ message: "Failed to perform action" });
    }
  });

  app.patch("/api/admin/provider-documents/:id/extended", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.DOCUMENTS_VERIFY), async (req: AuthRequest, res: Response) => {
    try {
      const { expiryDate, expiryRequired, documentCriticality, reminderDaysBefore, adminNote, verificationStatus } = req.body;
      const updates: any = {};
      if (expiryDate !== undefined) updates.expiryDate = expiryDate;
      if (expiryRequired !== undefined) updates.expiryRequired = expiryRequired;
      if (documentCriticality !== undefined) updates.documentCriticality = documentCriticality;
      if (reminderDaysBefore !== undefined) updates.reminderDaysBefore = reminderDaysBefore;
      if (adminNote !== undefined) updates.adminNote = adminNote;
      if (verificationStatus !== undefined) {
        updates.verificationStatus = verificationStatus;
        if (verificationStatus === "approved") { updates.verifiedBy = req.user!.id; updates.verifiedAt = new Date(); }
        if (verificationStatus === "expired") { updates.expiredAt = new Date(); }
      }
      const [doc] = await db.update(providerDocuments).set(updates).where(eq(providerDocuments.id, req.params.id)).returning();
      if (!doc) return res.status(404).json({ message: "Document not found" });
      res.json(doc);
    } catch (err) {
      console.error("doc extended update error:", err);
      res.status(500).json({ message: "Failed to update document" });
    }
  });

  // ── Office hours ──────────────────────────────────────────────────────────
  app.get("/api/admin/providers/:providerId/office-hours", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProvider(req.params.providerId);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const cfg = await storage.getProviderOfficeHours(provider.userId);
      res.json(cfg || null);
    } catch { res.status(500).json({ message: "Failed" }); }
  });

  app.patch("/api/admin/providers/:providerId/office-hours", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProvider(req.params.providerId);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const allowed = ["weeklySchedule", "timezone", "autoReplyEnabled", "autoReplyMessage", "emergencyContact"];
      const patch: Record<string, any> = {};
      for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
      const updated = await storage.upsertProviderOfficeHours(provider.userId, patch);

      const scheduleConstraints: Record<string, any> = {};
      const scheduleChanged = req.body.weeklySchedule !== undefined;
      if (req.body.minimumNoticeMinutes !== undefined) {
        scheduleConstraints.minimumNoticeMinutes = Math.max(0, Number(req.body.minimumNoticeMinutes) || 0);
      }
      if (req.body.maximumBookingDays !== undefined) {
        scheduleConstraints.maximumBookingDays = Math.max(1, Number(req.body.maximumBookingDays) || 1);
      }
      if (Object.keys(scheduleConstraints).length > 0 || scheduleChanged) {
        const currentVersion: number = (provider as any).availabilityVersion ?? 1;
        await storage.updateProvider(provider.id, {
          ...scheduleConstraints,
          availabilityVersion: currentVersion + 1,
        } as any);
      }
      res.json(updated);
    } catch { res.status(500).json({ message: "Failed to save" }); }
  });

  // ── Bulk availability publish ─────────────────────────────────────────────
  app.post("/api/admin/providers/:id/availability/bulk", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        slots: z.array(z.object({
          date: z.string(),
          startTime: z.string(),
          endTime: z.string(),
          isAvailable: z.boolean().default(true),
        })).min(1).max(500),
      });
      const { slots } = schema.parse(req.body);
      const provider = await storage.getProvider(req.params.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const created = await storage.bulkCreateTimeSlots(
        slots.map(s => ({
          providerId: provider.id,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          isBlocked: !s.isAvailable,
        }))
      );
      res.status(201).json({ created: created.length, slots: created });
    } catch (e: any) {
      if (e?.name === "ZodError") return res.status(400).json({ message: e.errors?.[0]?.message || "Invalid payload" });
      res.status(500).json({ message: "Failed to create availability slots" });
    }
  });

  // ── Category Change Requests ──────────────────────────────────────────────
  // GET /api/admin/category-requests — lists providers with a pending category change
  app.get("/api/admin/category-requests", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query(`
        SELECT p.id AS provider_id, p.provider_category, p.provider_subcategory,
               p.specialization, p.display_title,
               p.pending_provider_category, p.pending_provider_subcategory,
               p.pending_specialization, p.pending_display_title,
               p.category_change_reason, p.category_change_requested_at,
               p.status, p.country_code,
               u.first_name, u.last_name, u.email, u.avatar_url
        FROM providers p
        JOIN users u ON u.id = p.user_id
        WHERE p.pending_provider_category IS NOT NULL
           OR p.pending_specialization IS NOT NULL
           OR p.pending_display_title IS NOT NULL
        ORDER BY p.category_change_requested_at ASC NULLS LAST
      `);
      res.json(rows);
    } catch (err: any) {
      console.error("[admin/category-requests]", err);
      res.status(500).json({ message: err.message || "Failed to fetch category change requests" });
    }
  });

  // POST /api/admin/providers/:id/approve-category-change — approve or reject
  app.post("/api/admin/providers/:id/approve-category-change", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const providerId = req.params.id;
      const { decision, reason } = req.body; // decision: "approve" | "reject"
      if (!["approve", "reject"].includes(decision)) {
        return res.status(400).json({ message: "decision must be 'approve' or 'reject'" });
      }

      const { rows } = await pool.query(
        `SELECT p.id, p.pending_provider_category, p.pending_provider_subcategory,
                p.pending_specialization, p.pending_display_title,
                p.provider_category, p.provider_subcategory,
                p.specialization, p.display_title, p.user_id, p.country_code,
                u.first_name, u.last_name, u.email
         FROM providers p JOIN users u ON u.id = p.user_id
         WHERE p.id = $1`,
        [providerId],
      );
      const row = rows[0];
      if (!row) return res.status(404).json({ message: "Provider not found" });
      if (!canAccessCountry(req.user!, row.country_code)) {
        return res.status(403).json({ message: "Access denied: provider is in a different country." });
      }
      if (!row.pending_provider_category && !row.pending_specialization && !row.pending_display_title) {
        return res.status(400).json({ message: "This provider has no pending change request." });
      }

      const providerFirstName = row.first_name ?? "Provider";

      // Build a summary of approved changes for notifications
      const approvedChanges: { label: string; value: string }[] = [];
      if (row.pending_provider_category)  approvedChanges.push({ label: "Category",      value: row.pending_provider_category });
      if (row.pending_provider_subcategory) approvedChanges.push({ label: "Sub-Category", value: row.pending_provider_subcategory });
      if (row.pending_specialization)     approvedChanges.push({ label: "Specialization", value: row.pending_specialization });
      if (row.pending_display_title)      approvedChanges.push({ label: "Display Title",  value: row.pending_display_title });

      if (decision === "approve") {
        await pool.query(
          `UPDATE providers SET
             provider_category    = COALESCE(pending_provider_category, provider_category),
             provider_subcategory = COALESCE(pending_provider_subcategory, provider_subcategory),
             specialization       = COALESCE(pending_specialization, specialization),
             display_title        = COALESCE(pending_display_title, display_title),
             provider_type        = CASE COALESCE(pending_provider_category, provider_category)
               WHEN 'Medical Doctors & Specialists'               THEN 'physician'
               WHEN 'Mental Health & Behavioral Professionals'    THEN 'mental_health'
               WHEN 'Nutrition, Dietetics & Metabolic Wellness'   THEN 'nutrition'
               WHEN 'Physical Therapy & Rehabilitation'           THEN 'rehabilitation'
               WHEN 'Dental Care Professionals'                   THEN 'dental'
               WHEN 'Alternative, Holistic & Integrative Medicine' THEN 'alternative_medicine'
               WHEN 'Maternal, Nursing & Allied Health Support'   THEN 'nursing'
               ELSE provider_type
             END,
             pending_provider_category    = NULL,
             pending_provider_subcategory = NULL,
             pending_specialization       = NULL,
             pending_display_title        = NULL,
             category_change_reason       = NULL,
             category_change_requested_at = NULL
           WHERE id = $1`,
          [providerId],
        );
        // In-app notification
        const approvedSummary = approvedChanges.map(d => `${d.label}: ${d.value}`).join(", ");
        await storage.createUserNotification({
          userId: row.user_id,
          type: "account",
          title: "Profile Change Approved ✓",
          message: `Your profile change request has been approved and is now active: ${approvedSummary}.`,
          isRead: false,
          data: JSON.stringify({ approvedChanges }),
        } as any).catch(() => {});
        // Email notification
        if (row.email) {
          sendAppointmentEmail({
            to: row.email,
            subject: "Your profile change has been approved — GoldenLife",
            heading: `Profile Change Approved, ${providerFirstName}!`,
            intro: `Great news! Your profile change request has been reviewed and approved. The following updates are now live on your profile.`,
            details: approvedChanges,
            cta: "Log in to your provider dashboard to review your updated profile.",
          }).catch(() => {});
        }
      } else {
        await pool.query(
          `UPDATE providers SET
             pending_provider_category    = NULL,
             pending_provider_subcategory = NULL,
             pending_specialization       = NULL,
             pending_display_title        = NULL,
             category_change_reason       = NULL,
             category_change_requested_at = NULL
           WHERE id = $1`,
          [providerId],
        );
        const requestedSummary = approvedChanges.map(d => `${d.label}: ${d.value}`).join(", ");
        // In-app notification
        await storage.createUserNotification({
          userId: row.user_id,
          type: "account",
          title: "Profile Change Request Not Approved",
          message: `Your profile change request was not approved.${reason ? ` Reason: ${reason}` : ""} Requested: ${requestedSummary}.`,
          isRead: false,
          data: JSON.stringify({ requestedChanges: approvedChanges, reason }),
        } as any).catch(() => {});
        // Email notification
        if (row.email) {
          sendAppointmentEmail({
            to: row.email,
            subject: "Update on your profile change request — GoldenLife",
            heading: `Profile Change Not Approved`,
            intro: `We've reviewed your profile change request. Unfortunately, we were unable to approve this change at this time.`,
            details: [
              ...approvedChanges.map(d => ({ label: `Requested ${d.label}`, value: d.value })),
              ...(reason ? [{ label: "Reason", value: reason }] : []),
            ],
            cta: `If you have questions or would like to submit a new request, please contact our support team or submit another request from your provider dashboard.`,
          }).catch(() => {});
        }
      }

      res.json({ ok: true, decision, providerId });
    } catch (err: any) {
      console.error("[approve-category-change]", err);
      res.status(500).json({ message: err.message || "Failed to process category change decision" });
    }
  });

  // ── Service pending-change approval workflow ────────────────────────────────
  // Whitelist of fields a provider is allowed to stage via submit-changes.
  const PROVIDER_EDITABLE_SERVICE_FIELDS = new Set([
    "subServiceId",
    "name",
    "description",
    "duration",
    "price",
    "homeVisitFee",
    "clinicFee",
    "telemedicineFee",
    "emergencyFee",
    "depositAmount",
    "enableDeposit",
    "locationMode",
    "bufferBefore",
    "bufferAfter",
    "availabilityHours",
    "timeSlotLength",
    "hidePrice",
    "hideDuration",
  ]);

  app.get("/api/admin/services/pending-changes", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const params: any[] = [];
      let where = `WHERE s.pending_change_status = 'pending'`;
      if (countryFilter) {
        params.push(countryFilter);
        where += ` AND s.country_code = $${params.length}`;
      }
      const result = await pool.query(
        `SELECT s.*,
                p.id AS provider_db_id,
                p.clinic_name AS provider_clinic_name,
                p.provider_type, p.provider_category,
                u.id AS provider_user_id,
                u.first_name AS provider_first_name,
                u.last_name AS provider_last_name,
                u.email AS provider_email
         FROM services s
         LEFT JOIN providers p ON p.id = s.provider_id
         LEFT JOIN users u ON u.id = p.user_id
         ${where}
         ORDER BY CASE WHEN s.pending_change_status = 'pending' THEN 0 ELSE 1 END,
                  s.pending_change_submitted_at DESC NULLS LAST`,
        params,
      );
      res.json(result.rows);
    } catch (error) {
      console.error("[GET /api/admin/services/pending-changes] error:", error);
      res.status(500).json({ message: "Failed to load pending changes" });
    }
  });

  app.post("/api/admin/services/:id/approve-changes", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const svc: any = await storage.getService(req.params.id);
      if (!svc) return res.status(404).json({ message: "Service not found" });
      if (!canAccessCountry(req.user!, svc.countryCode)) {
        return res.status(404).json({ message: "Service not found" });
      }
      if (svc.pendingChangeStatus !== "pending") {
        return res.status(400).json({ message: "No pending changes to approve." });
      }
      const ownerQ = await pool.query(
        `SELECT u.id AS user_id, u.email, u.first_name
         FROM services s
         JOIN providers p ON p.id = s.provider_id
         JOIN users u ON u.id = p.user_id
         WHERE s.id = $1`,
        [req.params.id],
      );
      const owner = ownerQ.rows[0] as { user_id: string; email: string; first_name: string } | undefined;

      if (!svc.pendingChanges) {
        await pool.query(
          `UPDATE services
           SET is_active = true,
               pending_change_status = NULL,
               pending_change_reviewed_by = $1,
               pending_change_reviewed_at = NOW(),
               pending_change_reason = NULL
           WHERE id = $2`,
          [req.user!.id, req.params.id],
        );
        const activated = await storage.getService(req.params.id);
        if (owner) {
          await storage.createNotification({
            userId: owner.user_id,
            type: "service_approved",
            subject: "Service approved",
            body: `Your service "${svc.name}" has been approved and is now live for bookings.`,
          });
          await sendAppointmentEmail({
            to: owner.email,
            subject: "Your service is now live — GoldenLife",
            heading: "Service approved",
            intro: `Hi ${owner.first_name || "there"}, great news — your service has been approved and is now visible to patients.`,
            details: [{ label: "Service", value: svc.name }],
            cta: "Patients can now discover and book this service on your profile.",
          });
        }
        return res.json(activated);
      }
      const staged: Record<string, any> = svc.pendingChanges || {};
      const safe: Record<string, any> = {};
      for (const [k, v] of Object.entries(staged)) {
        if (PROVIDER_EDITABLE_SERVICE_FIELDS.has(k)) safe[k] = v;
      }
      await storage.updateService(req.params.id, safe, { changedBy: req.user?.id });
      await pool.query(
        `UPDATE services
         SET pending_changes = NULL,
             pending_change_status = NULL,
             pending_change_reviewed_by = $1,
             pending_change_reviewed_at = NOW(),
             pending_change_reason = NULL
         WHERE id = $2`,
        [req.user!.id, req.params.id],
      );
      const updated = await storage.getService(req.params.id);
      if (owner) {
        await storage.createNotification({
          userId: owner.user_id,
          type: "service_edit_approved",
          subject: "Service edit approved",
          body: `Your requested edits to "${svc.name}" have been approved and are now live.`,
        });
        await sendAppointmentEmail({
          to: owner.email,
          subject: "Service edit approved — GoldenLife",
          heading: "Service edits approved",
          intro: `Hi ${owner.first_name || "there"}, your requested changes to "${svc.name}" have been approved and applied.`,
          details: Object.entries(safe).map(([k, v]) => ({
            label: k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()),
            value: String(v ?? "—"),
          })),
          cta: "Your updated service is now live on your profile.",
        });
      }
      res.json(updated);
    } catch (error) {
      console.error("[POST /api/admin/services/:id/approve-changes] error:", error);
      res.status(500).json({ message: "Failed to approve changes" });
    }
  });

  app.post("/api/admin/services/:id/reject-changes", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const svc: any = await storage.getService(req.params.id);
      if (!svc) return res.status(404).json({ message: "Service not found" });
      if (!canAccessCountry(req.user!, svc.countryCode)) {
        return res.status(404).json({ message: "Service not found" });
      }
      if (svc.pendingChangeStatus !== "pending") {
        return res.status(400).json({ message: "No pending changes to reject." });
      }
      const note: string | null = typeof req.body?.reason === "string" ? req.body.reason : null;
      const isNewService = !svc.pendingChanges;
      const newStatus = isNewService ? "rejected" : null;
      await pool.query(
        `UPDATE services
         SET pending_changes = NULL,
             pending_change_status = $1,
             pending_change_reviewed_by = $2,
             pending_change_reviewed_at = NOW(),
             pending_change_reason = $3
         WHERE id = $4`,
        [newStatus, req.user!.id, note, req.params.id],
      );
      const updated = await storage.getService(req.params.id);

      const ownerQ = await pool.query(
        `SELECT u.id AS user_id, u.email, u.first_name
         FROM services s
         JOIN providers p ON p.id = s.provider_id
         JOIN users u ON u.id = p.user_id
         WHERE s.id = $1`,
        [req.params.id],
      );
      const owner = ownerQ.rows[0] as { user_id: string; email: string; first_name: string } | undefined;
      if (owner) {
        const notifBody = isNewService
          ? `Your service "${svc.name}" was not approved.${note ? ` Reason: ${note}` : ""}`
          : `Your edit request for "${svc.name}" was rejected.${note ? ` Reason: ${note}` : ""}`;
        await storage.createNotification({
          userId: owner.user_id,
          type: isNewService ? "service_rejected" : "service_edit_rejected",
          subject: isNewService ? "Service not approved" : "Service edit rejected",
          body: notifBody,
        });
        await sendAppointmentEmail({
          to: owner.email,
          subject: isNewService
            ? "Service submission not approved — GoldenLife"
            : "Service edit request rejected — GoldenLife",
          heading: isNewService ? "Service not approved" : "Edit request rejected",
          intro: `Hi ${owner.first_name || "there"}, unfortunately ${
            isNewService
              ? `your service "${svc.name}" could not be approved at this time.`
              : `your requested edits to "${svc.name}" have been rejected.`
          }`,
          details: note ? [{ label: "Reason", value: note }] : [],
          cta: "If you have questions, please contact our support team.",
        });
      }

      res.json(updated);
    } catch (error) {
      console.error("[POST /api/admin/services/:id/reject-changes] error:", error);
      res.status(500).json({ message: "Failed to reject changes" });
    }
  });

  // ── KYC Verification Queue ────────────────────────────────────────────────
  app.get("/api/admin/verification-queue", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const isGlobal = req.user?.role === "global_admin";
      const countryCode = isGlobal
        ? (req.query.country as string | undefined)
        : req.user?.countryCode;
      const params: unknown[] = [];
      const cWhere = countryCode ? `AND p.country_code::text = $${params.push(countryCode)}` : "";

      const { rows } = await pool.query(
        `SELECT
           p.id, p.status, p.provider_type, p.country_code,
           p.rejection_reason, p.is_verified,
           COALESCE(p.display_title, p.professional_title, pr.title) AS professional_title,
           p.specialization, p.provider_category, p.provider_subcategory, p.clinic_name,
           p.license_number, p.licensing_authority, p.license_expiry_date,
           COALESCE(
             p.license_document_url,
             (SELECT pd.document_url FROM provider_documents pd
              WHERE pd.provider_id = p.id AND pd.document_type = 'medical_license'
              ORDER BY pd.created_at DESC LIMIT 1)
           ) AS license_document_url,
           p.national_provider_id, p.bio,
           p.provider_agreement_accepted, p.data_processing_agreement_accepted,
           p.updated_at, p.submitted_at, p.last_resubmitted_at, p.profile_updated_after_submission,
           u.first_name, u.last_name, u.email, u.avatar_url,
           (
             SELECT json_agg(json_build_object(
               'id', pd.id,
               'documentType', pd.document_type,
               'documentUrl', pd.document_url,
               'fileName', pd.file_name,
               'verificationStatus', pd.verification_status,
               'adminNote', pd.admin_note,
               'createdAt', pd.created_at
             ) ORDER BY pd.created_at DESC)
             FROM provider_documents pd
             WHERE pd.provider_id = p.id
           ) AS documents
         FROM providers p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN practitioners pr ON pr.provider_id = p.id
         WHERE p.status IN ('draft', 'submitted', 'under_review', 'action_required', 'pending_approval', 'documents_verified') ${cWhere}
         ORDER BY
           CASE p.status
             WHEN 'submitted'          THEN 1
             WHEN 'pending_approval'   THEN 1
             WHEN 'under_review'       THEN 2
             WHEN 'documents_verified' THEN 2
             WHEN 'action_required'    THEN 3
             WHEN 'draft'              THEN 4
             ELSE 5
           END,
           p.updated_at ASC
         LIMIT 200`,
        params,
      );
      res.json(rows);
    } catch (err) {
      console.error("[verification-queue]", err);
      res.status(500).json({ message: "Failed to load verification queue" });
    }
  });

  app.patch("/api/admin/providers/:id/verify-document", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PROVIDERS_APPROVE), async (req: AuthRequest, res: Response) => {
    try {
      const { documentId, status, adminNote } = req.body;
      const allowed = ["approved", "rejected", "reupload_required"];
      if (!documentId || !status || !allowed.includes(status)) {
        return res.status(400).json({ message: "documentId and valid status (approved|rejected|reupload_required) are required" });
      }

      const canonicalDocStatus = normalizeDocStatus(status);
      const doc = await storage.updateProviderDocumentStatus(documentId, canonicalDocStatus, adminNote ?? null, req.user?.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });

      // Notify the provider about this specific document decision
      const prov = await storage.getProvider(req.params.id).catch(() => null);
      if (prov) {
        const docTypeName = (doc as any).documentType?.replace(/_/g, " ") ?? "document";
        storage.createUserNotification({
          userId:  prov.userId,
          title:   canonicalDocStatus === "approved" ? "Document Approved ✓" : "Document Requires Attention",
          message: canonicalDocStatus === "approved"
            ? `Your ${docTypeName} has been approved.`
            : `Your ${docTypeName} was ${canonicalDocStatus === "rejected" ? "rejected" : "flagged for re-upload"}.${adminNote ? ` Reason: ${adminNote}` : ""}`,
          type:    "document_status",
          data:    JSON.stringify({ docId: documentId, status: canonicalDocStatus, adminNote: adminNote ?? null }),
        }).catch(() => {});
      }

      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
         VALUES ($1, 'document_verify', 'provider_document', $2, $3, $4)`,
        [req.user!.id, documentId, JSON.stringify({ status: canonicalDocStatus, adminNote: adminNote ?? null }), (prov as any)?.countryCode ?? null],
      ).catch(() => {});

      // Recompute aggregate provider verification state — single propagation path
      recomputeProviderVerificationState(
        req.params.id,
        req.user!.id,
        (prov as any)?.countryCode ?? null,
      ).catch(() => {});

      res.json({ ok: true, doc });
    } catch (err) {
      console.error("[verify-document]", err);
      res.status(500).json({ message: "Failed to update document" });
    }
  });

  app.post("/api/admin/providers/:id/finalize-verification", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PROVIDERS_APPROVE), async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { decision, reason } = req.body;
      if (!decision || !["approve", "reject"].includes(decision)) {
        return res.status(400).json({ message: "decision must be 'approve' or 'reject'" });
      }

      const prov = await storage.getProvider(id);
      if (!prov) return res.status(404).json({ message: "Provider not found" });

      if (decision === "approve") {
        await storage.updateProvider(id, { status: "approved", isVerified: true } as any);
        providerListCache.clear();
        storage.createUserNotification({
          userId:  prov.userId,
          title:   "Application Approved ✓",
          message: "Congratulations! Your provider application has been approved. You can now publish services and accept patient bookings.",
          type:    "provider_approved",
          data:    JSON.stringify({ providerId: id }),
        }).catch(() => {});
      } else {
        await storage.updateProvider(id, { status: "rejected", rejectionReason: reason || "Rejected by admin" } as any);
        providerListCache.clear();
        storage.createUserNotification({
          userId:  prov.userId,
          title:   "Application Not Approved",
          message: `Your provider application was not approved.${reason ? ` Reason: ${reason}` : ""}`,
          type:    "provider_rejected",
          data:    JSON.stringify({ providerId: id, reason: reason ?? null }),
        }).catch(() => {});
      }

      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
         VALUES ($1, $2, 'provider', $3, $4, $5)`,
        [
          req.user!.id,
          decision === "approve" ? "provider_approved" : "provider_rejected",
          id,
          JSON.stringify({ decision, reason: reason ?? null }),
          (prov as any).countryCode ?? null,
        ],
      ).catch(() => {});

      res.json({ ok: true, decision });
    } catch (err) {
      console.error("[finalize-verification]", err);
      res.status(500).json({ message: "Failed to finalize verification" });
    }
  });

  // ── Provider appointment stats (admin view) ────────────────────────────────
  app.get("/api/admin/providers/:id/stats", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.ANALYTICS_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const providerId = req.params.id;
      const { rows } = await pool.query(`
        SELECT
          COUNT(*)                                                                             AS total,
          COUNT(*) FILTER (WHERE status = 'pending')                                          AS pending,
          COUNT(*) FILTER (WHERE status = 'confirmed')                                        AS confirmed,
          COUNT(*) FILTER (WHERE status = 'completed')                                        AS completed,
          COUNT(*) FILTER (WHERE status IN ('cancelled','cancelled_by_patient','cancelled_by_provider')) AS cancelled,
          COALESCE(SUM(total_amount::numeric) FILTER (WHERE payment_status = 'completed'), 0) AS total_revenue
        FROM appointments
        WHERE provider_id = $1
      `, [providerId]);
      const r = rows[0] ?? {};
      res.json({
        total:        Number(r.total ?? 0),
        pending:      Number(r.pending ?? 0),
        confirmed:    Number(r.confirmed ?? 0),
        completed:    Number(r.completed ?? 0),
        cancelled:    Number(r.cancelled ?? 0),
        totalRevenue: parseFloat(r.total_revenue ?? "0"),
        bookings: [],
      });
    } catch (error) {
      console.error("[admin/providers/:id/stats]", error);
      res.status(500).json({ message: "Failed to get provider statistics" });
    }
  });

  // ── Admin Internal Notes ────────────────────────────────────────────────────
  // GET /api/admin/providers/:id/notes
  // NOTE: Supabase table has column "note" (NOT NULL), not "content". COALESCE handles both.
  app.get("/api/admin/providers/:id/notes", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query(`
        SELECT n.id,
               COALESCE(n.note, n.content) AS note_text,
               n.is_pinned, n.created_at, n.updated_at,
               u.first_name, u.last_name, u.role
        FROM provider_admin_notes n
        LEFT JOIN users u ON u.id = n.admin_id
        WHERE n.provider_id = $1
        ORDER BY n.is_pinned DESC, n.created_at DESC
        LIMIT 100
      `, [req.params.id]);
      res.json(rows.map(r => ({
        id: r.id,
        content: r.note_text,
        isPinned: r.is_pinned,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        adminName: r.first_name ? `${r.first_name} ${r.last_name}`.trim() : "Admin",
        adminRole: r.role,
      })));
    } catch (error: any) {
      console.error("[notes GET]", error?.cause?.message ?? error?.message ?? error);
      res.status(500).json({ message: "Failed to load notes" });
    }
  });

  // POST /api/admin/providers/:id/notes
  app.post("/api/admin/providers/:id/notes", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: "Note content is required" });
    try {
      const { rows } = await pool.query(`
        INSERT INTO provider_admin_notes (provider_id, admin_id, note)
        VALUES ($1, $2, $3)
        RETURNING id, note AS note_text, is_pinned, created_at, updated_at
      `, [req.params.id, req.user!.id, content.trim()]);
      // Audit log
      await pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user!.id, "provider.note_added", "provider", req.params.id, JSON.stringify({ preview: content.trim().slice(0, 80) })]
      ).catch(() => {});
      const r = rows[0];
      res.json({ id: r.id, content: r.note_text, isPinned: r.is_pinned, createdAt: r.created_at, updatedAt: r.updated_at, adminName: "You", adminRole: req.user!.role });
    } catch (error: any) {
      console.error("[notes POST]", error?.cause?.message ?? error?.message ?? error);
      res.status(500).json({ message: "Failed to create note" });
    }
  });

  // PATCH /api/admin/providers/:id/notes/:noteId
  app.patch("/api/admin/providers/:id/notes/:noteId", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    const { content, isPinned } = req.body;
    try {
      const params: any[] = [req.params.noteId, req.params.id];
      const sets: string[] = ["updated_at = NOW()"];
      // Use "note" (the actual Supabase column name)
      if (content !== undefined) { sets.push(`note = $${params.length + 1}`); params.push(content.trim()); }
      if (isPinned !== undefined) { sets.push(`is_pinned = $${params.length + 1}`); params.push(isPinned); }
      if (sets.length === 1) return res.status(400).json({ message: "Nothing to update" });
      const { rows } = await pool.query(
        `UPDATE provider_admin_notes SET ${sets.join(", ")} WHERE id = $1 AND provider_id = $2 RETURNING id, note AS note_text, is_pinned, created_at`,
        params
      );
      if (!rows[0]) return res.status(404).json({ message: "Note not found" });
      res.json({ id: rows[0].id, content: rows[0].note_text, isPinned: rows[0].is_pinned, createdAt: rows[0].created_at });
    } catch (error: any) {
      console.error("[notes PATCH]", error?.cause?.message ?? error?.message ?? error);
      res.status(500).json({ message: "Failed to update note" });
    }
  });

  // DELETE /api/admin/providers/:id/notes/:noteId
  app.delete("/api/admin/providers/:id/notes/:noteId", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM provider_admin_notes WHERE id = $1 AND provider_id = $2`,
        [req.params.noteId, req.params.id]
      );
      if (!rowCount) return res.status(404).json({ message: "Note not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete note" });
    }
  });
}
