/**
 * Catalog routes — extracted from server/routes.ts (Sprint C5, Phase 5)
 *
 * Covers: browse/services, sub-services (CRUD), categories (public),
 * catalog-services (public), reviews (POST), exchange rates, pricing
 * quotes, and auto-practitioner assignment.
 */

import type { Express, Request, Response } from "express";
import { db, pool } from "../db";
import { storage } from "../storage";
import {
  authenticateToken,
  optionalAuth,
  requireAdmin,
  AuthRequest,
} from "../middleware/auth";
import { isAdminRole } from "../middleware/country";
import {
  calculatePrePromoSubtotal,
  runRevenueEngine,
} from "../lib/revenue-engine";
import { getRates, fromUSDSync, toUSDSync } from "../services/currency";
import { countryCurrency, type CountryCode } from "../middleware/country";
import { categoriesCache, publicServicesCache, subServicesCache } from "../lib/cache";
import {
  insertSubServiceSchema,
  appointments,
  services,
} from "@shared/schema";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { isProviderApproved } from "../lib/provider-visibility";
import { resolvePaymentMethod } from "../lib/payment-method";
import { haversineDistance, isValidCoordinates } from "../services/location.service";
import { roundBookingAmount } from "../lib/math";

export function registerCatalogRoutes(app: Express): void {

  // ── Exchange rates ─────────────────────────────────────────────────────────
  app.get("/api/exchange-rates", async (_req: Request, res: Response) => {
    try {
      const rates = await getRates();
      res.json({ rates, base: "USD", fetchedAt: Date.now() });
    } catch {
      res.status(500).json({ message: "Failed to fetch exchange rates" });
    }
  });

  // ── Browse services — hierarchical public catalog ─────────────────────────
  app.get("/api/browse/services", async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
      const [cats, subs, allProviders, allSvcs] = await Promise.all([
        storage.getAllCategories(false),
        storage.getAllSubServices(),
        storage.getAllProviders(),
        db.select().from(services).where(eq(services.isActive, true)),
      ]);
      const activeProviderIds = new Set(allProviders.filter((p: any) => p.isActive !== false && p.isVerified !== false).map((p: any) => p.id));
      const liveSvcs = allSvcs.filter((s: any) => !s.deletedAt && activeProviderIds.has(s.providerId));
      const bySub = new Map<string, any[]>();
      for (const s of liveSvcs) {
        if (!s.subServiceId) continue;
        const arr = bySub.get(s.subServiceId) || [];
        arr.push(s);
        bySub.set(s.subServiceId, arr);
      }
      const subsActive = subs.filter((s: any) => s.isActive !== false && !s.deletedAt);
      const filteredSubs = q
        ? subsActive.filter((s: any) =>
            s.name?.toLowerCase().includes(q) ||
            (s.description || "").toLowerCase().includes(q)
          )
        : subsActive;
      // Build catalogService id→name map for sub-category grouping
      let catalogServiceMap: Map<string, string> = new Map();
      try {
        const { rows: csRows } = await pool.query(`SELECT id, name FROM catalog_services WHERE deleted_at IS NULL`);
        for (const r of csRows) catalogServiceMap.set(r.id, r.name);
      } catch { /* table may not exist on first boot */ }

      const result = cats
        .filter((c: any) => c.isActive !== false && !c.deletedAt)
        .map((c: any) => {
          const childSubs = filteredSubs
            .filter((s: any) => s.category === c.slug)
            .map((s: any) => {
              const offered = bySub.get(s.id) || [];
              const providerIds = new Set(offered.map((o: any) => o.providerId));
              const priceEntries = offered
                .map((o: any) => ({ price: Number(o.price), currency: (o.currency as string | undefined) ?? "USD" }))
                .filter((e: { price: number; currency: string }) => Number.isFinite(e.price) && e.price > 0);
              const minEntry = priceEntries.length
                ? priceEntries.reduce((min, cur) => cur.price < min.price ? cur : min)
                : null;
              const startingPrice = minEntry ? minEntry.price : Number(s.basePrice ?? 0) || null;
              const startingPriceCurrency: string = minEntry ? minEntry.currency : "USD";
              const catalogServiceId = s.catalog_service_id ?? s.catalogServiceId ?? null;
              return {
                id: s.id,
                name: s.name,
                description: s.description ?? null,
                durationMinutes: s.durationMinutes ?? s.duration_minutes ?? null,
                providerCount: providerIds.size,
                startingPrice,
                startingPriceCurrency,
                basePrice: Number(s.basePrice ?? s.base_price ?? 0) || null,
                subcategoryId: catalogServiceId,
                subcategoryName: catalogServiceId ? (catalogServiceMap.get(catalogServiceId) ?? null) : null,
              };
            })
            .sort((a: any, b: any) => b.providerCount - a.providerCount || a.name.localeCompare(b.name));
          const totalProviders = new Set<string>();
          childSubs.forEach((cs: any) => {
            const offered = bySub.get(cs.id) || [];
            offered.forEach((o: any) => totalProviders.add(o.providerId));
          });
          // Build grouped subcategories for richer UI display
          const subcategoryGroups: Record<string, { id: string; name: string; services: any[] }> = {};
          for (const ss of childSubs) {
            const key = ss.subcategoryId ?? "__ungrouped";
            if (!subcategoryGroups[key]) {
              subcategoryGroups[key] = { id: key, name: ss.subcategoryName ?? "Other", services: [] };
            }
            subcategoryGroups[key].services.push(ss);
          }
          return {
            id: c.id,
            slug: c.slug,
            name: c.name,
            description: c.description ?? null,
            icon: c.icon ?? null,
            subServiceCount: childSubs.length,
            providerCount: totalProviders.size,
            subServices: childSubs,
            subcategories: Object.values(subcategoryGroups),
          };
        })
        .filter((c: any) => !q || c.subServices.length > 0);
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json(result);
    } catch (error) {
      console.error("Browse services error:", error);
      res.status(500).json({ message: "Failed to load services" });
    }
  });

  // ── Sub-services (admin CRUD + public GET) ────────────────────────────────
  app.get("/api/sub-services", async (req: Request, res: Response) => {
    try {
      const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
      const providerCategory = typeof req.query.providerCategory === "string" ? req.query.providerCategory.trim() : "";
      const cacheKey = providerCategory ? `pc:${providerCategory}` : category ? `cat:${category}` : "all";
      const cached = subServicesCache.get(cacheKey);
      if (cached) {
        res.setHeader("Cache-Control", "private, max-age=600");
        return res.json(cached);
      }
      let result: any[];
      if (providerCategory) {
        const { rows } = await pool.query(
          `SELECT * FROM sub_services
           WHERE category::text = $1::text
             AND deleted_at IS NULL AND is_active = true
           ORDER BY name`,
          [providerCategory],
        );
        result = rows;
      } else if (category) {
        result = await storage.getSubServicesByCategory(category);
      } else {
        result = await storage.getAllSubServices();
      }
      subServicesCache.set(cacheKey, result);
      res.setHeader("Cache-Control", "private, max-age=600");
      res.json(result);
    } catch (error) {
      console.error("Sub-services fetch error:", error);
      res.status(500).json({ message: "Failed to fetch sub-services" });
    }
  });

  app.post("/api/sub-services", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      // taxPercentage is a legacy field. Tax is configured through the
      // canonical country-specific tax-rule endpoints instead.
      const { taxPercentage: _legacyTaxPercentage, ...canonicalBody } = req.body ?? {};
      const data = insertSubServiceSchema.parse(canonicalBody);
      const existing = await storage.getAllSubServices();
      const collision = existing.find(
        (s) => s.name.trim().toLowerCase() === String(data.name).trim().toLowerCase() && s.category === data.category,
      );
      if (collision) {
        return res.status(409).json({ message: `Category "${data.name}" already exists for ${data.category}.` });
      }
      const subService = await storage.createSubService(data);
      subServicesCache.clear();
      res.status(201).json(subService);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: error.errors?.[0]?.message || "Invalid sub-service data" });
      }
      console.error("Create sub-service error:", error);
      res.status(500).json({ message: "Failed to create sub-service" });
    }
  });

  app.patch("/api/sub-services/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params.id;
      const existing = await storage.getSubService(id);
      if (!existing) return res.status(404).json({ message: "Category not found" });

      const allowed: Record<string, any> = {};
      if (typeof req.body?.name === "string") allowed.name = req.body.name.trim();
      if (typeof req.body?.category === "string") allowed.category = req.body.category;
      if (typeof req.body?.description === "string") allowed.description = req.body.description;
      if (typeof req.body?.isActive === "boolean") allowed.isActive = req.body.isActive;
      if (typeof req.body?.status === "string") allowed.status = req.body.status;
      if (typeof req.body?.nameEn === "string") allowed.nameEn = req.body.nameEn;
      if (typeof req.body?.nameHu === "string") allowed.nameHu = req.body.nameHu;
      if (typeof req.body?.nameFa === "string") allowed.nameFa = req.body.nameFa;
      if (typeof req.body?.descriptionEn === "string") allowed.descriptionEn = req.body.descriptionEn;
      if (typeof req.body?.descriptionHu === "string") allowed.descriptionHu = req.body.descriptionHu;
      if (typeof req.body?.descriptionFa === "string") allowed.descriptionFa = req.body.descriptionFa;
      if (req.body?.minPrice !== undefined) allowed.minPrice = req.body.minPrice === "" ? null : Number(req.body.minPrice) || null;
      if (req.body?.maxPrice !== undefined) allowed.maxPrice = req.body.maxPrice === "" ? null : Number(req.body.maxPrice) || null;
      if (req.body?.suggestedMinPrice !== undefined) allowed.suggestedMinPrice = req.body.suggestedMinPrice === "" ? null : Number(req.body.suggestedMinPrice) || null;
      if (req.body?.suggestedMaxPrice !== undefined) allowed.suggestedMaxPrice = req.body.suggestedMaxPrice === "" ? null : Number(req.body.suggestedMaxPrice) || null;
      if (req.body?.requirements !== undefined) allowed.requirements = req.body.requirements;
      if (req.body?.basePrice !== undefined) allowed.basePrice = String(req.body.basePrice);
      if (req.body?.platformFee !== undefined) allowed.platformFee = String(req.body.platformFee);
      if (req.body?.durationMinutes !== undefined) allowed.durationMinutes = Number(req.body.durationMinutes) || 0;
      if (typeof req.body?.pricingType === "string") allowed.pricingType = req.body.pricingType;

      if (allowed.name !== undefined && !allowed.name) {
        return res.status(400).json({ message: "Name cannot be empty" });
      }

      if (allowed.name || allowed.category) {
        const all = await storage.getAllSubServices();
        const newName = (allowed.name ?? existing.name).toString().trim().toLowerCase();
        const newCategory = allowed.category ?? existing.category;
        const collision = all.find(
          (s) => s.id !== id && s.name.trim().toLowerCase() === newName && s.category === newCategory,
        );
        if (collision) {
          return res.status(409).json({ message: `Category "${allowed.name ?? existing.name}" already exists for ${newCategory}.` });
        }
      }

      const updated = await storage.updateSubService(id, allowed);
      subServicesCache.clear();
      res.json(updated);
    } catch (error: any) {
      console.error("Update sub-service error:", error);
      res.status(500).json({ message: "Failed to update category" });
    }
  });

  app.delete("/api/sub-services/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params.id;
      const existing = await storage.getSubService(id);
      if (!existing) return res.status(404).json({ message: "Category not found" });
      const force = req.query.force === "true" && isAdminRole(req.user?.role);
      const result = await storage.deleteSubService(id, { force });
      subServicesCache.clear();
      if ("soft" in result && result.soft) {
        return res.json({ ok: true, archived: true, message: `"${existing.name}" archived (in use). Provider services and existing bookings preserved.` });
      }
      res.status(204).end();
    } catch (error: any) {
      console.error("Delete sub-service error:", error);
      res.status(500).json({ message: "Failed to delete category" });
    }
  });

  app.post("/api/sub-services/:id/restore", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (!isAdminRole(req.user?.role)) return res.status(403).json({ message: "Admin access required" });
    const restored = await storage.restoreSubService(req.params.id);
    if (!restored) return res.status(404).json({ message: "Not found" });
    res.json(restored);
  });

  // ── Categories — public list ───────────────────────────────────────────────
  app.get("/api/categories", async (_req: Request, res: Response) => {
    try {
      const CACHE_KEY = "public:all";
      const cached = categoriesCache.get(CACHE_KEY);
      if (cached) {
        res.set("Cache-Control", "private, max-age=300");
        return res.json(cached);
      }
      const cats = await storage.getAllCategories(false);
      categoriesCache.set(CACHE_KEY, cats);
      res.set("Cache-Control", "private, max-age=300");
      res.json(cats);
    } catch (error) {
      console.error("Categories fetch error:", error);
      res.status(500).json({ message: "Failed to load categories" });
    }
  });

  // ── Catalog services — public list (cached 5 min) ─────────────────────────
  // Accepts: ?category=<slug>  (canonical — resolves slug→UUID)
  //          ?categoryId=<uuid> (legacy UUID-based — kept for compat)
  app.get("/api/catalog-services", async (req: Request, res: Response) => {
    try {
      const categorySlug = typeof req.query.category === "string" ? req.query.category.trim() : undefined;
      const categoryIdParam = typeof req.query.categoryId === "string" ? req.query.categoryId.trim() : undefined;

      let resolvedCategoryId: string | undefined = categoryIdParam;

      // Resolve slug → UUID when slug param is used
      if (categorySlug && !resolvedCategoryId) {
        const cat = await storage.getCategoryBySlug(categorySlug);
        if (!cat) {
          return res.status(404).json({ message: `Category "${categorySlug}" not found` });
        }
        resolvedCategoryId = cat.id;
      }

      const cacheKey = resolvedCategoryId ? `cat:${resolvedCategoryId}` : "all";
      const cached = publicServicesCache.get(cacheKey);
      if (cached) {
        res.set("Cache-Control", "private, max-age=300");
        return res.json(cached);
      }
      const items = resolvedCategoryId
        ? await storage.getCatalogServicesByCategory(resolvedCategoryId)
        : await storage.getAllCatalogServices(false);
      publicServicesCache.set(cacheKey, items);
      res.set("Cache-Control", "private, max-age=300");
      res.json(items);
    } catch (error) {
      console.error("Catalog services fetch error:", error);
      res.status(500).json({ message: "Failed to fetch catalog services" });
    }
  });

  // ── Reviews ───────────────────────────────────────────────────────────────
  app.post("/api/reviews", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "patient") {
        return res.status(403).json({ message: "Only patients can submit reviews" });
      }

      const { appointmentId, rating: rawRating, comment } = req.body as {
        appointmentId?: string; rating?: unknown; comment?: unknown;
      };

      if (typeof appointmentId !== "string" || !appointmentId) {
        return res.status(400).json({ message: "appointmentId is required" });
      }

      const rating = Number(rawRating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Rating must be an integer between 1 and 5" });
      }

      const commentText = typeof comment === "string" ? comment.trim().slice(0, 2000) : null;

      const appointment = await storage.getAppointment(appointmentId);
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      if (appointment.patientId !== req.user!.id) {
        return res.status(403).json({ message: "You can only review your own appointments" });
      }
      if (appointment.status !== "completed") {
        return res.status(400).json({ message: "Can only review completed appointments" });
      }

      const existingReview = await storage.getReviewByAppointment(appointmentId);
      if (existingReview) {
        return res.status(409).json({ message: "Review already exists for this appointment" });
      }

      let review;
      try {
        review = await storage.createReview({
          appointmentId,
          patientId: req.user!.id,
          providerId: appointment.providerId,
          rating,
          comment: commentText,
           status: "pending",
        });
      } catch (err: any) {
        const pgCode = err?.code ?? err?.cause?.code;
        if (pgCode === "23505") {
          return res.status(409).json({ message: "Review already exists for this appointment" });
        }
        if (pgCode === "23514") {
          return res.status(400).json({ message: "Rating must be an integer between 1 and 5" });
        }
        throw err;
      }

      res.status(201).json(review);
    } catch (error) {
      console.error("Create review error:", error);
      res.status(500).json({ message: "Failed to create review" });
    }
  });

  // ── Patient review history ─────────────────────────────────────────────────
  app.get("/api/reviews/mine", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "patient") {
        return res.status(403).json({ message: "Only patients can view their reviews" });
      }
      const { rows } = await pool.query<{
        id: string; appointment_id: string; provider_id: string;
         rating: number; comment: string | null; reply: string | null; status: string; created_at: string;
         scheduled_at: string; start_time: string; visit_type: string;
        provider_first_name: string; provider_last_name: string;
        clinic_name: string | null; provider_type: string;
      }>(
        `SELECT
           r.id, r.appointment_id, r.provider_id,
           r.rating, r.comment, r.provider_reply AS reply, r.status, r.created_at,
           a.date AS scheduled_at, a.start_time, a.visit_type,
           u.first_name AS provider_first_name,
           u.last_name  AS provider_last_name,
           p.clinic_name, p.provider_type::text AS provider_type
         FROM reviews r
         JOIN appointments a ON a.id = r.appointment_id
         JOIN providers   p ON p.id = r.provider_id
         JOIN users       u ON u.id = p.user_id
         WHERE r.patient_id = $1
         ORDER BY r.created_at DESC`,
        [req.user!.id],
      );
      return res.json(rows);
    } catch (error) {
      console.error("GET /api/reviews/mine error:", error);
      return res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });

  // ── Pricing quote ─────────────────────────────────────────────────────────
  app.post("/api/pricing/quote", optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const {
        serviceId,
        subServiceId,
        practitionerId,
        providerId,
        visitType,
        sessions,
        promoCode,
        isEmergency,
        surgeMultiplier,
        packagePrice,
        paymentMethod,
        patientLatitude,
        patientLongitude,
      } = req.body as {
        serviceId?: string;
        subServiceId?: string;
        practitionerId?: string;
        providerId?: string;
        visitType?: "online" | "home" | "clinic";
        sessions?: number;
        promoCode?: string;
        isEmergency?: boolean;
        surgeMultiplier?: number;
        packagePrice?: number;
        paymentMethod?: "card" | "wallet" | "cash" | "bank_transfer";
        patientLatitude?: number;
        patientLongitude?: number;
      };

      if (!visitType || !["online", "home", "clinic"].includes(visitType)) {
        return res.status(400).json({ message: "visitType is required (online | home | clinic)" });
      }

      const svcRaw = serviceId ? await storage.getService(serviceId) : null;
      const subId = subServiceId || (svcRaw?.subServiceId ?? null);
      const sub = subId ? await storage.getSubService(subId) : null;

      if (!svcRaw && !sub) {
        return res.status(400).json({ message: "Provide serviceId or subServiceId" });
      }

      let svc = svcRaw;
      if (svcRaw && serviceId && practitionerId) {
        const sps = await storage.getServicePractitioners(serviceId);
        const sp = sps.find((p: any) => p.practitionerId === practitionerId);
        if (sp?.fee) {
          svc = { ...svcRaw, price: Number(sp.fee).toFixed(2) } as any;
        }
      }

      const quoteProviderId = (svcRaw as any)?.providerId ?? providerId ?? null;
      const quoteProvider = quoteProviderId
        ? await storage.getProvider(quoteProviderId).catch(() => null)
        : null;
      // Provider tenancy is the only authoritative booking country. A quote
      // without a provider cannot be finalized consistently and is rejected
      // instead of silently falling back to a service row's country.
      const quoteCountryCode = (quoteProvider as any)?.countryCode ?? null;
      if (!quoteProviderId || !quoteCountryCode) {
        return res.status(400).json({ message: "A provider is required to calculate booking pricing." });
      }
      const quoteCurrency = quoteCountryCode
        ? countryCurrency(quoteCountryCode as CountryCode)
        : "USD";
      const quoteRates = await getRates();
      let discount: { type: "percent" | "fixed"; value: number; code?: string } | null = null;

      let membershipDiscountInput: import("../lib/pricing").MembershipDiscountInput | null = null;
      if (req.user?.id) {
        try {
          const activePackage = await storage.getActiveUserPackage(req.user.id, quoteCountryCode);
          if (activePackage) {
            const svcDiscBenefit = activePackage.benefits.find(b => b.benefitKey === "service_discount_percent");
            const pfDiscBenefit  = activePackage.benefits.find(b => b.benefitKey === "platform_fee_discount");
            const svcDiscPct = svcDiscBenefit ? Number(svcDiscBenefit.benefitValue) : 0;
            const pfDiscPct  = pfDiscBenefit  ? Number(pfDiscBenefit.benefitValue)  : 0;
            if (svcDiscPct > 0 || pfDiscPct > 0) {
              membershipDiscountInput = {
                serviceDiscountPercent: svcDiscPct,
                platformFeeDiscount: pfDiscPct,
                label: "Member discount",
                userPackageId: activePackage.id,
              };
            }
          }
        } catch (pkgErr) {
          console.error("[pricing/quote] package lookup failed:", pkgErr);
        }
      }

      // Resolve promo eligibility against the same pre-promo taxable subtotal
      // used by the booking route. This includes practitioner pricing, visit
      // and platform fees, membership adjustments, and package pricing, while
      // excluding tax and payment-method adjustments.
      if (promoCode) {
        const promo = await storage.getPromoCodeByCode(String(promoCode).trim().toUpperCase());
        if (promo && promo.isActive) {
          const now = new Date();
          const inWindow = new Date(promo.validFrom) <= now && new Date(promo.validUntil) >= now;
          const underLimit = promo.maxUses == null || (promo.usedCount ?? 0) < promo.maxUses;
          const providerAllowed =
            !promo.applicableProviders ||
            promo.applicableProviders.length === 0 ||
            !svcRaw?.providerId ||
            promo.applicableProviders.includes(svcRaw.providerId);
          const promoBaseCurrency = String(promo.baseCurrency ?? "USD").toUpperCase();
          const minimumAmount = promo.minAmount == null
            ? 0
            : promoBaseCurrency === quoteCurrency
              ? Number(promo.minAmount)
              : fromUSDSync(
                  toUSDSync(Number(promo.minAmount), promoBaseCurrency, quoteRates),
                  quoteCurrency,
                  quoteRates,
                );
          const prePromoSubtotal = await calculatePrePromoSubtotal({
            service: svc ?? null,
            subService: sub ?? null,
            visitType,
            sessions,
            packagePrice: packagePrice ?? null,
            membershipDiscount: membershipDiscountInput,
            discount: null,
            currency: quoteCurrency,
            paymentMethod: resolvePaymentMethod(paymentMethod),
            countryCode: quoteCountryCode,
            providerId: (svcRaw as any)?.providerId ?? null,
            providerType: null,
            serviceCategory: (sub as any)?.category ?? null,
            bookingCurrency: quoteCurrency,
            providerCurrency: quoteCurrency,
            rates: quoteRates,
          });

          if (inWindow && underLimit && providerAllowed && prePromoSubtotal >= minimumAmount) {
            let promoValue = Number(promo.discountValue);
            if (promo.discountType !== "percentage" && promoBaseCurrency !== quoteCurrency) {
              promoValue = fromUSDSync(
                toUSDSync(promoValue, promoBaseCurrency, quoteRates),
                quoteCurrency,
                quoteRates,
              );
            }
            if (promo.discountType !== "percentage") {
              promoValue = roundBookingAmount(promoValue, quoteCurrency);
            }
            discount = {
              type: promo.discountType === "percentage" ? "percent" : "fixed",
              value: promoValue,
              code: promo.code,
            };
          }
        }
      }

      // Resolve provider context so the revenue engine can apply admin-configured
      // platform fee rules (country-scoped, provider-type-scoped, etc.).
      const quoteProviderType = (quoteProvider as any)?.providerType ?? null;
      const quoteServiceCategory = (sub as any)?.category ?? quoteProviderType ?? null;
      const quoteTravelDistanceKm =
        visitType === "home" &&
        isValidCoordinates(Number(patientLatitude), Number(patientLongitude)) &&
        isValidCoordinates(Number((quoteProvider as any)?.latitude), Number((quoteProvider as any)?.longitude))
          ? haversineDistance(
              { latitude: Number(patientLatitude), longitude: Number(patientLongitude) },
              { latitude: Number((quoteProvider as any).latitude), longitude: Number((quoteProvider as any).longitude) },
            )
          : null;

      const breakdown = await runRevenueEngine({
        subService: sub ?? null,
        service: svc ?? null,
        visitType,
        sessions,
        isEmergency,
        surgeMultiplier,
        packagePrice: packagePrice ?? null,
        discount,
        paymentMethod: resolvePaymentMethod(paymentMethod),
        membershipDiscount: membershipDiscountInput,
          // Tax is resolved exclusively by the canonical tax engine.
          subServiceId: sub?.id ?? null,
        countryCode: quoteCountryCode,
        providerId: quoteProviderId,
        providerType: quoteProviderType,
        serviceCategory: quoteServiceCategory,
        bookingCurrency: quoteCurrency,
        providerCurrency: quoteCurrency,
        rates: quoteRates,
        travelDistanceKm: quoteTravelDistanceKm,
      });

      res.json({ ...breakdown, membershipApplied: membershipDiscountInput !== null });
    } catch (e: any) {
      console.error("Pricing quote error:", e);
      if (e?.code === "TAX_CONFIGURATION_MISSING") {
        return res.status(422).json({ code: e.code, message: e.message, missingDomains: e.missingDomains });
      }
      res.status(500).json({ message: "Failed to compute pricing quote" });
    }
  });

  // ── Auto-assign best practitioner for a service ───────────────────────────
  app.get("/api/services/:serviceId/auto-practitioner", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const sps = await storage.getServicePractitioners(req.params.serviceId);
      const active = sps.filter(p => p.isActive !== false && p.practitioner && isProviderApproved((p.practitioner as any).status));
      if (active.length === 0) {
        return res.status(404).json({ message: "No practitioners are assigned to this service yet." });
      }

      const today = new Date().toISOString().slice(0, 10);
      const inAWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const practIds = active.map(p => p.practitionerId);

      const upcoming = practIds.length
        ? await db.select({ practitionerId: appointments.practitionerId })
            .from(appointments)
            .where(and(
              inArray(appointments.practitionerId, practIds),
              gte(appointments.date, today),
              lte(appointments.date, inAWeek),
              inArray(appointments.status, ["pending", "approved", "confirmed", "rescheduled"]),
            ))
        : [];

      const loadByPract = new Map<string, number>(practIds.map(id => [id, 0]));
      for (const u of upcoming) {
        if (!u.practitionerId) continue;
        loadByPract.set(u.practitionerId, (loadByPract.get(u.practitionerId) || 0) + 1);
      }

      const ranked = [...active].sort((a, b) => {
        const loadA = loadByPract.get(a.practitionerId) || 0;
        const loadB = loadByPract.get(b.practitionerId) || 0;
        if (loadA !== loadB) return loadA - loadB;
        return (b.practitioner?.yearsExperience || 0) - (a.practitioner?.yearsExperience || 0);
      });

      const winner = ranked[0];
      res.json({
        practitioner: winner.practitioner,
        fee: winner.fee,
        currentLoad: loadByPract.get(winner.practitionerId) || 0,
      });
    } catch (error) {
      console.error("[auto-practitioner] error:", error);
      res.status(500).json({ message: "Failed to auto-assign a practitioner." });
    }
  });
}
