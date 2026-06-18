/**
 * Admin Content routes — extracted from server/routes.ts
 *
 * Covers: browse/services (public), sub-services, categories, catalog-services,
 * service-requests, FAQs, announcements, support-tickets.
 */

import type { Express, Request, Response } from "express";
import { storage } from "../../storage";
import { pool } from "../../db";
import { z } from "zod";
import {
  insertSubServiceSchema,
  insertCategorySchema,
  insertCatalogServiceSchema,
} from "@shared/schema";
import {
  authenticateToken,
  requireAdmin,
  AuthRequest,
} from "../../middleware/auth";
import { requirePermission, PERMISSIONS } from "../../middleware/rbac";
import {
  canAccessCountry,
  listingCountryFilter,
} from "../../middleware/country";
import { categoriesCache, publicServicesCache } from "../../lib/cache";
import { sendAppointmentEmail } from "../shared/helpers";
import { notify } from "../../services/notification-dispatcher";

export function registerAdminContentRoutes(app: Express): void {

  // ── Admin sub-services CRUD ───────────────────────────────────────────────
  // NOTE: Public routes (GET /api/sub-services, POST, PATCH, DELETE, /restore,
  //        GET /api/browse/services, GET /api/categories, GET /api/catalog-services)
  //        are owned by catalog.routes.ts which registers first. Only /api/admin/*
  //        routes live here.
  app.get("/api/admin/sub-services", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          id, category, catalog_service_id AS "catalogServiceId",
          name, description,
          platform_fee AS "platformFee", base_price AS "basePrice",
          duration_minutes AS "durationMinutes",
          buffer_before AS "bufferBefore", buffer_after AS "bufferAfter",
          tax_percentage AS "taxPercentage", pricing_type AS "pricingType",
          is_active AS "isActive", deleted_at AS "deletedAt", created_at AS "createdAt",
          status, sub_group AS "subGroup",
          provider_category_name AS "providerCategoryName",
          name_en AS "nameEn", name_hu AS "nameHu", name_fa AS "nameFa",
          description_en AS "descriptionEn", description_hu AS "descriptionHu", description_fa AS "descriptionFa",
          min_price AS "minPrice", max_price AS "maxPrice",
          suggested_min_price AS "suggestedMinPrice", suggested_max_price AS "suggestedMaxPrice",
          requirements
        FROM sub_services
        ORDER BY category, name
      `);
      res.json(rows);
    } catch (err: any) {
      console.error("[admin/sub-services GET]", err);
      res.status(500).json({ message: "Failed to fetch sub-services" });
    }
  });

  app.post("/api/admin/sub-services", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const b = req.body;
      if (!b.name?.trim()) return res.status(400).json({ message: "name is required" });
      if (!b.category)     return res.status(400).json({ message: "category is required" });

      // Prevent duplicate catalogue entries: same name + same category
      const dupCheck = await pool.query(
        `SELECT id FROM sub_services WHERE LOWER(name) = LOWER($1) AND category::text = $2::text AND deleted_at IS NULL LIMIT 1`,
        [b.name.trim(), b.category]
      );
      if (dupCheck.rows[0]) {
        return res.status(409).json({ message: "A service with this name already exists in this category." });
      }

      const { rows } = await pool.query(`
        INSERT INTO sub_services (
          name, category, catalog_service_id, description,
          platform_fee, base_price, duration_minutes,
          buffer_before, buffer_after, tax_percentage, pricing_type,
          is_active, status, provider_category_name, sub_group,
          name_en, name_hu, name_fa,
          description_en, description_hu, description_fa,
          min_price, max_price, suggested_min_price, suggested_max_price,
          requirements, created_at
        ) VALUES (
          $1,  $2,  $3,  $4,
          $5,  $6,  $7,
          $8,  $9,  $10, $11,
          $12, $13, $14, $15,
          $16, $17, $18,
          $19, $20, $21,
          $22, $23, $24, $25,
          $26, NOW()
        )
        RETURNING
          id, category, catalog_service_id AS "catalogServiceId",
          name, description,
          platform_fee AS "platformFee", base_price AS "basePrice",
          duration_minutes AS "durationMinutes",
          buffer_before AS "bufferBefore", buffer_after AS "bufferAfter",
          tax_percentage AS "taxPercentage", pricing_type AS "pricingType",
          is_active AS "isActive", deleted_at AS "deletedAt", created_at AS "createdAt",
          status, sub_group AS "subGroup",
          provider_category_name AS "providerCategoryName",
          name_en AS "nameEn", name_hu AS "nameHu", name_fa AS "nameFa",
          description_en AS "descriptionEn", description_hu AS "descriptionHu", description_fa AS "descriptionFa",
          min_price AS "minPrice", max_price AS "maxPrice",
          suggested_min_price AS "suggestedMinPrice", suggested_max_price AS "suggestedMaxPrice",
          requirements
      `, [
        b.name?.trim(),
        b.category,
        b.catalogServiceId  || null,
        b.description       || null,
        b.platformFee       || "0.00",
        b.basePrice         || "0.00",
        b.durationMinutes   ?? 30,
        b.bufferBefore      ?? 0,
        b.bufferAfter       ?? 0,
        b.taxPercentage     || "0.00",
        b.pricingType       || "fixed",
        b.isActive          !== false,
        b.status            || "active",
        b.providerCategoryName || null,
        b.subGroup          || null,
        b.nameEn            || null,
        b.nameHu            || null,
        b.nameFa            || null,
        b.descriptionEn     || null,
        b.descriptionHu     || null,
        b.descriptionFa     || null,
        b.minPrice          ? String(b.minPrice)          : null,
        b.maxPrice          ? String(b.maxPrice)          : null,
        b.suggestedMinPrice ? String(b.suggestedMinPrice) : null,
        b.suggestedMaxPrice ? String(b.suggestedMaxPrice) : null,
        b.requirements      ? JSON.stringify(b.requirements) : null,
      ]);
      res.status(201).json(rows[0]);
    } catch (err: any) {
      console.error("[admin/sub-services POST]", err);
      const msg = err?.code === "23505"
        ? "A sub-service with this name already exists in that category"
        : err?.message || "Failed to create sub-service";
      res.status(400).json({ message: msg });
    }
  });

  app.patch("/api/admin/sub-services/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const b   = req.body;
      const id  = req.params.id;
      const colMap: Record<string, any> = {
        name:                 b.name?.trim(),
        category:             b.category,
        catalog_service_id:   b.catalogServiceId,
        description:          b.description,
        platform_fee:         b.platformFee,
        base_price:           b.basePrice,
        duration_minutes:     b.durationMinutes,
        buffer_before:        b.bufferBefore,
        buffer_after:         b.bufferAfter,
        tax_percentage:       b.taxPercentage,
        pricing_type:         b.pricingType,
        is_active:            b.isActive,
        status:               b.status,
        provider_category_name: b.providerCategoryName,
        sub_group:            b.subGroup,
        name_en:              b.nameEn,
        name_hu:              b.nameHu,
        name_fa:              b.nameFa,
        description_en:       b.descriptionEn,
        description_hu:       b.descriptionHu,
        description_fa:       b.descriptionFa,
        min_price:            b.minPrice    ? String(b.minPrice)    : undefined,
        max_price:            b.maxPrice    ? String(b.maxPrice)    : undefined,
        suggested_min_price:  b.suggestedMinPrice ? String(b.suggestedMinPrice) : undefined,
        suggested_max_price:  b.suggestedMaxPrice ? String(b.suggestedMaxPrice) : undefined,
        requirements:         b.requirements !== undefined ? JSON.stringify(b.requirements) : undefined,
      };

      const setClauses: string[] = [];
      const vals: any[]          = [];
      let   idx = 1;

      for (const [col, val] of Object.entries(colMap)) {
        if (val === undefined) continue;
        setClauses.push(`${col} = $${idx++}`);
        vals.push(val === "" ? null : val);
      }

      if (setClauses.length === 0) return res.status(400).json({ message: "No fields to update" });
      vals.push(id);

      const { rows } = await pool.query(`
        UPDATE sub_services
        SET    ${setClauses.join(", ")}
        WHERE  id = $${idx}
        RETURNING
          id, category, catalog_service_id AS "catalogServiceId",
          name, description,
          platform_fee AS "platformFee", base_price AS "basePrice",
          duration_minutes AS "durationMinutes",
          buffer_before AS "bufferBefore", buffer_after AS "bufferAfter",
          tax_percentage AS "taxPercentage", pricing_type AS "pricingType",
          is_active AS "isActive", deleted_at AS "deletedAt", created_at AS "createdAt",
          status, sub_group AS "subGroup",
          provider_category_name AS "providerCategoryName",
          name_en AS "nameEn", name_hu AS "nameHu", name_fa AS "nameFa",
          description_en AS "descriptionEn", description_hu AS "descriptionHu", description_fa AS "descriptionFa",
          min_price AS "minPrice", max_price AS "maxPrice",
          suggested_min_price AS "suggestedMinPrice", suggested_max_price AS "suggestedMaxPrice",
          requirements
      `, vals);

      if (!rows[0]) return res.status(404).json({ message: "Sub-service not found" });
      res.json(rows[0]);
    } catch (err: any) {
      console.error("[admin/sub-services PATCH]", err);
      res.status(500).json({ message: err?.message || "Failed to update sub-service" });
    }
  });

  app.delete("/api/admin/sub-services/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    const existing = await storage.getSubService(req.params.id);
    const force = req.query.force === "true";
    const result = await storage.deleteSubService(req.params.id, { force });
    if ("soft" in result && result.soft) {
      return res.json({ ok: true, archived: true, message: existing ? `"${existing.name}" archived (in use). Existing data preserved.` : "Archived." });
    }
    res.status(204).end();
  });

  // ── Categories (admin CRUD only — public GET /api/categories is in catalog.routes.ts) ──
  app.get("/api/admin/categories", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    res.json(await storage.getAllCategories(true));
  });

  app.post("/api/admin/categories", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const body = { ...req.body };
      if (!body.slug && typeof body.name === "string") {
        body.slug = body.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      }
      const data = insertCategorySchema.parse(body);
      const existing = await storage.getCategoryBySlug(data.slug);
      if (existing) return res.status(409).json({ message: `A category with slug "${data.slug}" already exists.` });
      const created = await storage.createCategory(data);
      categoriesCache.delete("public:all");
      res.json(created);
    } catch (error: any) {
      res.status(400).json({ message: error?.message || "Invalid category data" });
    }
  });

  app.patch("/api/admin/categories/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const updated = await storage.updateCategory(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Category not found" });
      categoriesCache.delete("public:all");
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error?.message || "Failed to update category" });
    }
  });

  app.delete("/api/admin/categories/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    const cat = await storage.getCategory(req.params.id);
    if (!cat) return res.status(404).json({ message: "Category not found" });
    const force = req.query.force === "true";
    const result = await storage.deleteCategory(req.params.id, { force });
    categoriesCache.delete("public:all");
    if ("soft" in result && result.soft) {
      return res.json({ ok: true, archived: true, message: `"${cat.name}" archived. Existing sub-services and bookings preserved.` });
    }
    res.status(204).end();
  });

  app.post("/api/admin/categories/:id/restore", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    const c = await storage.restoreCategory(req.params.id);
    if (!c) return res.status(404).json({ message: "Not found" });
    categoriesCache.delete("public:all");
    res.json(c);
  });

  // ── Catalog Services (admin CRUD only — public GET /api/catalog-services is in catalog.routes.ts) ──
  app.get("/api/admin/catalog-services", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    const all = await storage.getAllCatalogServices(true);
    res.json(all);
  });

  app.post("/api/admin/catalog-services", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const data = insertCatalogServiceSchema.parse(req.body);
      const cs = await storage.createCatalogService(data);
      publicServicesCache.clear();
      res.status(201).json(cs);
    } catch (e: any) {
      res.status(400).json({ message: e?.errors?.[0]?.message || e?.message || "Invalid data" });
    }
  });

  app.patch("/api/admin/catalog-services/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    const cs = await storage.updateCatalogService(req.params.id, req.body);
    if (!cs) return res.status(404).json({ message: "Not found" });
    publicServicesCache.clear();
    res.json(cs);
  });

  app.delete("/api/admin/catalog-services/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    await storage.deleteCatalogService(req.params.id);
    publicServicesCache.clear();
    res.json({ ok: true });
  });

  // ── Admin: add practitioner to service ───────────────────────────────────
  app.post("/api/admin/services/:serviceId/practitioners", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const sp = await storage.addPractitionerToService({
        ...req.body,
        serviceId: req.params.serviceId,
      });
      res.status(201).json(sp);
    } catch (error) {
      res.status(400).json({ message: "Failed to add practitioner to service" });
    }
  });

  // ── Service requests ──────────────────────────────────────────────────────
  app.get("/api/admin/service-requests", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const params: any[] = [];
      let where = "WHERE 1=1";
      if (countryFilter) { params.push(countryFilter); where += ` AND sr.country_code = $${params.length}`; }
      const result = await pool.query(
        `SELECT sr.*,
                p.id AS provider_db_id,
                p.account_type, p.clinic_name,
                p.provider_type, p.provider_category, p.provider_subcategory,
                COALESCE(p.clinic_name, '') AS business_name,
                u.first_name AS user_first_name, u.last_name AS user_last_name, u.email AS user_email
         FROM service_requests sr
         JOIN providers p ON p.id = sr.provider_id
         JOIN users u ON u.id = p.user_id
         ${where}
         ORDER BY CASE WHEN sr.status = 'pending_review' THEN 0 ELSE 1 END, sr.created_at DESC`,
        params
      );
      const rows = result.rows.map((r: any) => ({
        id: r.id,
        status: r.status,
        category: r.category,
        serviceName: r.service_name,
        subServiceName: r.sub_service_name,
        description: r.description,
        suggestedPrice: r.suggested_price,
        currency: r.currency ?? "USD",
        durationMinutes: r.duration_minutes,
        locationMode: r.location_mode,
        adminNotes: r.admin_notes,
        rejectionReason: r.rejection_reason,
        countryCode: r.country_code,
        createdAt: r.created_at,
        reviewedAt: r.reviewed_at,
        provider: {
          id: r.provider_db_id,
          accountType: r.account_type,
          clinicName: r.clinic_name,
          businessName: r.business_name,
          providerType: r.provider_type,
          providerCategory: r.provider_category,
          providerSubcategory: r.provider_subcategory,
          user: {
            name: `${r.user_first_name || ""} ${r.user_last_name || ""}`.trim() || r.user_email,
            email: r.user_email,
          },
        },
      }));
      res.json(rows);
    } catch (err) {
      console.error("[GET /api/admin/service-requests]", err);
      res.status(500).json({ message: "Failed to load service requests" });
    }
  });

  app.patch("/api/admin/service-requests/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const colMap: Record<string, string> = {
        category: "category",
        serviceName: "service_name",
        subServiceName: "sub_service_name",
        suggestedPrice: "suggested_price",
        description: "description",
        adminNotes: "admin_notes",
        locationMode: "location_mode",
      };
      const updates: Record<string, any> = {};
      for (const [k, col] of Object.entries(colMap)) {
        if (req.body[k] !== undefined) updates[col] = req.body[k];
      }
      if (Object.keys(updates).length === 0) return res.status(400).json({ message: "No fields to update" });
      const setClauses = Object.keys(updates).map((col, i) => `${col} = $${i + 2}`).join(", ");
      const vals = [req.params.id, ...Object.values(updates)];
      await pool.query(`UPDATE service_requests SET ${setClauses}, updated_at = NOW() WHERE id = $1`, vals);
      const r = await pool.query(`SELECT * FROM service_requests WHERE id = $1`, [req.params.id]);
      if (!r.rows[0]) return res.status(404).json({ message: "Request not found" });
      res.json(r.rows[0]);
    } catch (err) {
      console.error("[PATCH /api/admin/service-requests]", err);
      res.status(500).json({ message: "Failed to update request" });
    }
  });

  app.post("/api/admin/service-requests/:id/approve", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const rq = await pool.query(
        `SELECT sr.*, p.id AS pid, p.provider_type, p.country_code AS pcountry,
                u.id AS uid, u.email AS uemail, u.first_name AS ufirst
         FROM service_requests sr
         JOIN providers p ON p.id = sr.provider_id
         JOIN users u ON u.id = p.user_id
         WHERE sr.id = $1`,
        [req.params.id]
      );
      if (!rq.rows[0]) return res.status(404).json({ message: "Request not found" });
      const row = rq.rows[0];
      if (row.status !== "pending_review") return res.status(400).json({ message: "Request is not pending review" });

      const durationMins = Number(req.body?.duration) || row.duration_minutes || 30;
      const price = String(req.body?.finalPrice || row.suggested_price || "0.00");
      const bufBefore = Math.min(240, Math.max(0, Number(req.body?.bufferBefore ?? 0)));
      const bufAfter  = Math.min(240, Math.max(0, Number(req.body?.bufferAfter  ?? 0)));

      let subSvc = await pool.query(
        `SELECT id FROM sub_services WHERE LOWER(name) = LOWER($1) AND category = $2 AND deleted_at IS NULL LIMIT 1`,
        [row.service_name, row.category]
      );
      let subServiceId: string;
      if (subSvc.rows[0]) {
        subServiceId = subSvc.rows[0].id;
      } else {
        const ns = await pool.query(
          `INSERT INTO sub_services (name, category, description, base_price, duration_minutes, is_active, created_at)
           VALUES ($1,$2,$3,$4,$5,true,NOW()) RETURNING id`,
          [row.service_name, row.category, row.description ?? null, price, durationMins]
        );
        if (!ns.rows[0]?.id) throw new Error("Failed to create sub-service record");
        subServiceId = ns.rows[0].id;
      }

      const svc = await pool.query(
        `INSERT INTO services
           (provider_id, sub_service_id, name, description, duration, price, location_mode, buffer_before, buffer_after, is_active, country_code, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,NOW(),NOW())
         RETURNING id`,
        [row.pid, subServiceId, row.service_name, row.description ?? null, durationMins, price, row.location_mode ?? "both", bufBefore, bufAfter, row.pcountry ?? "HU"]
      );

      await pool.query(
        `UPDATE service_requests SET status='approved', reviewed_by=$1, reviewed_at=NOW(), updated_at=NOW() WHERE id=$2`,
        [req.user!.id, req.params.id]
      );

      await storage.createNotification({
        userId: row.uid,
        type: "service_approved",
        subject: "Service request approved",
        body: `Your request for "${row.service_name}" has been approved and is now live on your profile.`,
      });
      await sendAppointmentEmail({
        to: row.uemail,
        subject: "Service request approved — GoldenLife",
        heading: "Your service is live!",
        intro: `Hi ${row.ufirst || "there"}, great news — your request for "${row.service_name}" has been approved and added to your profile.`,
        details: [
          { label: "Service", value: row.service_name },
          { label: "Duration", value: `${durationMins} min` },
          { label: "Price", value: `$${price}` },
        ],
        cta: "Patients can now discover and book this service on your profile.",
      });

      if (!svc.rows[0]?.id) throw new Error("Failed to create service record");
      res.json({ ok: true, serviceId: svc.rows[0].id, subServiceId });
    } catch (err) {
      console.error("[POST /api/admin/service-requests/:id/approve]", err);
      res.status(500).json({ message: "Failed to approve request" });
    }
  });

  app.post("/api/admin/service-requests/:id/reject", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const rq = await pool.query(
        `SELECT sr.*, u.id AS uid, u.email AS uemail, u.first_name AS ufirst
         FROM service_requests sr
         JOIN providers p ON p.id = sr.provider_id
         JOIN users u ON u.id = p.user_id
         WHERE sr.id = $1`,
        [req.params.id]
      );
      if (!rq.rows[0]) return res.status(404).json({ message: "Request not found" });
      const row = rq.rows[0];
      if (row.status !== "pending_review") return res.status(400).json({ message: "Request is not pending review" });
      const reason = String(req.body?.rejectionReason || req.body?.reason || "").slice(0, 2000);
      await pool.query(
        `UPDATE service_requests SET status='rejected', rejection_reason=$1, reviewed_by=$2, reviewed_at=NOW(), updated_at=NOW() WHERE id=$3`,
        [reason || null, req.user!.id, req.params.id]
      );
      await storage.createNotification({
        userId: row.uid,
        type: "service_rejected",
        subject: "Service request not approved",
        body: `Your request for "${row.service_name}" was not approved.${reason ? ` Reason: ${reason}` : ""}`,
      });
      await sendAppointmentEmail({
        to: row.uemail,
        subject: "Service request update — GoldenLife",
        heading: "Service request not approved",
        intro: `Hi ${row.ufirst || "there"}, unfortunately your request for "${row.service_name}" could not be approved at this time.`,
        details: reason ? [{ label: "Reason", value: reason }] : [],
        cta: "If you have questions, please contact our support team.",
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("[POST /api/admin/service-requests/:id/reject]", err);
      res.status(500).json({ message: "Failed to reject request" });
    }
  });

  // ── FAQs ──────────────────────────────────────────────────────────────────
  app.get("/api/admin/faqs", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const faqs = await storage.getAllFaqs();
      res.json(faqs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get FAQs" });
    }
  });

  app.post("/api/admin/faqs", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const faq = await storage.createFaq(req.body);
      res.status(201).json(faq);
    } catch (error) {
      res.status(500).json({ message: "Failed to create FAQ" });
    }
  });

  app.delete("/api/admin/faqs/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteFaq(req.params.id);
      res.json({ message: "FAQ deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete FAQ" });
    }
  });

  // ── Announcements ─────────────────────────────────────────────────────────
  app.get("/api/admin/announcements", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const announcements = await storage.getAllAnnouncements(countryFilter ? { countryCode: countryFilter } : undefined);
      res.json(announcements);
    } catch (error) {
      res.status(500).json({ message: "Failed to get announcements" });
    }
  });

  app.post("/api/admin/announcements", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const announcement = await storage.createAnnouncement(req.body);
      res.status(201).json(announcement);
    } catch (error) {
      res.status(500).json({ message: "Failed to create announcement" });
    }
  });

  app.delete("/api/admin/announcements/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteAnnouncement(req.params.id);
      res.json({ message: "Announcement deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete announcement" });
    }
  });

  // ── Support Tickets ───────────────────────────────────────────────────────
  app.get("/api/admin/support-tickets", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tickets = await storage.getAllSupportTickets();
      const neededIds = [...new Set([
        ...tickets.map((t: any) => t.userId).filter(Boolean),
        ...tickets.map((t: any) => t.assignedTo).filter(Boolean),
      ])] as string[];
      const ticketUsers = await storage.getUsersByIds(neededIds);
      const userMap = new Map(ticketUsers.map((u: any) => [u.id, u]));
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const statusFilter = req.query.status as string | undefined;
      const search = (req.query.search as string | undefined)?.trim().toLowerCase();
      const enriched = tickets
        .filter((t: any) => {
          if (countryFilter) {
            if (!t.userId) return false;
            const creator = userMap.get(t.userId);
            if (creator?.countryCode !== countryFilter) return false;
          }
          if (statusFilter && t.status !== statusFilter) return false;
          if (search) {
            const u = t.userId ? userMap.get(t.userId) : null;
            const haystack = `${t.subject ?? ""} ${u?.firstName ?? ""} ${u?.lastName ?? ""} ${u?.email ?? ""}`.toLowerCase();
            if (!haystack.includes(search)) return false;
          }
          return true;
        })
        .map((t: any) => {
          const u = t.userId ? userMap.get(t.userId) : null;
          const a = t.assignedTo ? userMap.get(t.assignedTo) : null;
          return {
            ...t,
            creator: u ? { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, role: u.role } : null,
            assignee: a ? { id: a.id, firstName: a.firstName, lastName: a.lastName } : null,
          };
        });
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ message: "Failed to get support tickets" });
    }
  });

  app.get("/api/admin/support-tickets/:id/messages", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const ticket = await storage.getSupportTicket(req.params.id);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (ticket.userId) {
        const ticketOwner = await storage.getUser(ticket.userId);
        if (ticketOwner && !canAccessCountry(req.user!, ticketOwner.countryCode as any)) {
          return res.status(403).json({ message: "Cross-country access denied" });
        }
      }
      const messages = await storage.getTicketMessages(req.params.id);
      const senderIds = [...new Set(messages.map((m: any) => m.userId).filter(Boolean))] as string[];
      const senders = await storage.getUsersByIds(senderIds);
      const userMap = new Map(senders.map((u: any) => [u.id, u]));
      const enriched = messages.map((m: any) => {
        const u = userMap.get(m.userId);
        return {
          ...m,
          sender: u ? { id: u.id, firstName: u.firstName, lastName: u.lastName, role: u.role } : null,
        };
      });
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ message: "Failed to get ticket messages" });
    }
  });

  app.patch("/api/admin/support-tickets/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const existing = await storage.getSupportTicket(req.params.id);
      if (!existing) return res.status(404).json({ message: "Ticket not found" });
      if (existing.userId) {
        const ticketOwner = await storage.getUser(existing.userId);
        if (ticketOwner && !canAccessCountry(req.user!, ticketOwner.countryCode as any)) {
          return res.status(403).json({ message: "Cross-country access denied" });
        }
      }
      const ticket = await storage.updateSupportTicket(req.params.id, req.body);
      res.json(ticket);
    } catch (error) {
      res.status(500).json({ message: "Failed to update ticket" });
    }
  });

  app.post("/api/admin/support-tickets/:id/messages", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const ticket = await storage.getSupportTicket(req.params.id);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (ticket.userId) {
        const ticketOwner = await storage.getUser(ticket.userId);
        if (ticketOwner && !canAccessCountry(req.user!, ticketOwner.countryCode as any)) {
          return res.status(403).json({ message: "Cross-country access denied" });
        }
      }
      if (!req.body?.message) return res.status(400).json({ message: "Message required" });
      const isInternal = !!req.body.isInternal;
      const message = await storage.createTicketMessage({
        ticketId: req.params.id,
        userId: req.user!.id,
        message: req.body.message,
        isInternal,
      });
      if (!isInternal && ticket.status === "open") {
        await storage.updateSupportTicket(ticket.id, { status: "in_progress" });
      }
      if (!isInternal && ticket.userId) {
        notify.ticketReplied(ticket.userId, { ticketId: ticket.id, subject: ticket.subject }).catch(() => {});
      }
      res.status(201).json(message);
    } catch (error) {
      res.status(500).json({ message: "Failed to send message" });
    }
  });
}
