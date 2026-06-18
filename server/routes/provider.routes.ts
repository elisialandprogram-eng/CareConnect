/**
 * Provider routes
 * Routes: 70+ | Owner: providers | Auth: mixed (optionalAuth / authenticateToken / public)
 *
 * Covers: provider listing, profile, services, practitioners, availability,
 * group sessions, documents, credentials, gallery, earnings, payouts, wallet,
 * office-hours, blocks, buffer-settings, match-score, title-request.
 */

import { registerProviderAvailabilityRoutes } from "./provider-availability.routes";
import { registerProviderMediaRoutes } from "./provider-media.routes";
import { registerProviderWalletPayoutsRoutes } from "./provider-wallet-payouts.routes";
import { registerProviderScheduleAdminRoutes } from "./provider-schedule-admin.routes";
import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { db, pool } from "../db";
import { z } from "zod";
import { eq, and, desc, or, inArray, gte, lte } from "drizzle-orm";
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
import { assertNativeCurrency, ServiceCurrencyError } from "../lib/service-currency-guard";

// ── Slot regeneration helper (Part 1: Instant forward-sync) ──────────────────
// After a provider saves a schedule template, this runs fire-and-forget to
// purge stale unbooked/unheld slots and re-generate fresh intervals for the
// next 30 calendar days that match the updated day-of-week template.
const _pad = (n: number) => String(n).padStart(2, "0");
const _fmt = (mins: number) => `${_pad(Math.floor(mins / 60))}:${_pad(mins % 60)}`;
const _toMins = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

// After saving schedule templates via the batch endpoint, rebuild the
// provider_office_hours.weeklySchedule JSONB from all null-modality templates
// so the fallback slot synthesizer returns correct results for future dates
// that haven't yet been covered by the rolling cron.
const DOW_KEYS_SHORT = ["sun","mon","tue","wed","thu","fri","sat"] as const;
async function syncTemplatesToOfficeHours(providerId: string, userId: string): Promise<void> {
  const { rows } = await pool.query<{ day_of_week: number; start_time: string; end_time: string }>(
    `SELECT day_of_week, start_time, end_time
       FROM provider_schedule_templates
      WHERE provider_id = $1 AND modality IS NULL AND is_active = TRUE
      ORDER BY day_of_week, start_time`,
    [providerId],
  );
  const weekly: Record<string, { enabled: boolean; start: string; end: string; windows: { start: string; end: string }[] }> = {};
  for (let dow = 0; dow < 7; dow++) {
    const key = DOW_KEYS_SHORT[dow];
    const dayRows = rows.filter(r => r.day_of_week === dow);
    if (dayRows.length === 0) {
      weekly[key] = { enabled: false, start: "09:00", end: "17:00", windows: [] };
    } else {
      const windows = dayRows.map(r => ({ start: r.start_time, end: r.end_time }));
      weekly[key] = { enabled: true, start: windows[0].start, end: windows[windows.length - 1].end, windows };
    }
  }
  await storage.upsertProviderOfficeHours(userId, { weeklySchedule: JSON.stringify(weekly) });
}

async function regenerateSlotsForDayOfWeek(
  providerId: string,
  dayOfWeek: number,
  tmpl: { startTime: string; endTime: string; slotDurationMins: number; bufferBeforeMins: number; bufferAfterMins: number },
): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const step = tmpl.slotDurationMins + tmpl.bufferBeforeMins + tmpl.bufferAfterMins;
  const startMins = _toMins(tmpl.startTime);
  const endMins   = _toMins(tmpl.endTime);

  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    if (d.getDay() !== dayOfWeek) continue;
    const ds = `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`;

    // Purge existing unbooked/unheld slots for this provider+date
    await pool.query(
      `DELETE FROM time_slots
        WHERE provider_id = $1 AND date = $2 AND is_booked = FALSE
          AND id NOT IN (
            SELECT DISTINCT ts.id FROM time_slots ts
            INNER JOIN appointment_slot_holds ash
              ON  ash.provider_id = ts.provider_id
              AND ash.date        = ts.date
              AND ash.start_time  = ts.start_time
              AND ash.end_time    = ts.end_time
              AND ash.expires_at  > NOW()
          )`,
      [providerId, ds],
    );

    // Insert fresh slots
    for (let t = startMins; t + tmpl.slotDurationMins <= endMins; t += step) {
      await pool.query(
        `INSERT INTO time_slots (id, provider_id, date, start_time, end_time, is_booked, is_blocked)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, FALSE, FALSE)
         ON CONFLICT DO NOTHING`,
        [providerId, ds, _fmt(t), _fmt(t + tmpl.slotDurationMins)],
      );
    }
  }
}

// ── Multer upload instances ───────────────────────────────────────────────────
// Note: avatarUpload, galleryUpload, docUpload are defined inside the function
// (inline from routes.ts) at the appropriate points.

export function registerProviderRoutes(app: Express): void {
  app.get("/api/providers/:providerId/practitioners", async (req, res) => {
    try {
      const practitioners = await storage.getPractitionersByProvider(req.params.providerId);
      res.json(practitioners);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch practitioners" });
    }
  });

  app.post("/api/providers/:providerId/practitioners", authenticateToken, async (req: AuthRequest, res) => {
    try {
      // Ownership check: only the provider that owns this account, or an admin, can add practitioners.
      const provider = await storage.getProvider(req.params.providerId);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      if (!isAdminRole(req.user?.role) && provider.userId !== req.user?.id) {
        return res.status(403).json({ message: "You can only manage your own provider's practitioners" });
      }
      const practitioner = await storage.createPractitioner({
        ...req.body,
        providerId: req.params.providerId
      });
      res.status(201).json(practitioner);
    } catch (error) {
      res.status(400).json({ message: "Invalid practitioner data" });
    }
  });

  app.get("/api/providers/:providerId/services/:serviceId/practitioners", async (req, res) => {
    try {
      const practitioners = await storage.getServicePractitioners(req.params.serviceId);
      res.json(practitioners);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch service practitioners" });
    }
  });

  app.get("/api/providers/:id/with-fees", async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderWithServices(req.params.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      
      const subServices = await storage.getAllSubServices();
      const enrichedServices = provider.services.map(service => {
        const providerType = (provider as any).providerType;
        const matched = subServices.find(ss => ss.name === service.name && ss.category === providerType);
        return {
          ...service,
          platformFee: matched ? matched.platformFee : "0.00"
        };
      });

      res.json({
        ...provider,
        services: enrichedServices
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get provider details" });
    }
  });

  // Get patient appointments
  const avatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error("Unsupported format. Use jpg, png, or webp"));
    },
  });

  app.post("/api/upload", authenticateToken, avatarUpload.single("file"), async (req: AuthRequest, res: Response) => {
    try {
      const callerRole = req.user?.role;
      if (!callerRole || !["provider", "admin", "global_admin", "country_admin", "patient"].includes(callerRole)) {
        return res.status(403).json({ message: "Upload not allowed for this account type" });
      }
      if (req.file) {
        if (isCloudinaryConfigured()) {
          const result = await uploadAvatarImage(req.file.buffer, req.file.mimetype);
          return res.json({ url: result.secureUrl });
        }
        // Local-disk fallback when Cloudinary is not configured
        const fsModule = await import("fs");
        const pathModule = await import("path");
        const uploadsDir = pathModule.join(process.cwd(), "uploads", "avatars");
        fsModule.mkdirSync(uploadsDir, { recursive: true });
        const ext = (req.file.mimetype.split("/")[1] || "jpg").replace("jpeg", "jpg");
        const filename = `${req.user!.id}-${Date.now()}.${ext}`;
        fsModule.writeFileSync(pathModule.join(uploadsDir, filename), req.file.buffer);
        return res.json({ url: `/uploads/avatars/${filename}` });
      }
      // Legacy base64 fallback (dev only)
      const { image } = req.body;
      if (!image) return res.status(400).json({ message: "No image provided" });
      res.json({ url: image });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Upload failed" });
    }
  });

  app.get("/api/providers", optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const type = typeof req.query.type === "string" ? req.query.type.trim() : "";
      const city = typeof req.query.city === "string"
        ? req.query.city.trim()
        : (typeof req.query.location === "string" ? req.query.location.trim() : "");
      const verifiedOnly = req.query.verifiedOnly === "true" || req.query.verifiedOnly === "1";
      const subServiceId = typeof req.query.subServiceId === "string" ? req.query.subServiceId.trim() : "";

      // Pagination params: page is 1-indexed; default page size is 12
      const pageSize = Math.min(Math.max(parseInt(String(req.query.limit ?? "12"), 10) || 12, 1), 100);
      const page = Math.max(parseInt(String(req.query.page ?? "1"), 10) || 1, 1);
      const offset = (page - 1) * pageSize;

      // Country isolation: authenticated callers see only their country (global
      // admins may opt into a specific country via ?country=HU/IR or ALL).
      // Unauthenticated visitors get HU by default and can override via ?country.
      let countryFilter: CountryCode | null;
      if (req.user) {
        countryFilter = listingCountryFilter(req.user, req.query as any);
      } else {
        const qc = typeof req.query.country === "string" ? req.query.country.toUpperCase() : "";
        countryFilter = isCountryCode(qc) ? qc : "HU";
      }

      // If filtering by sub-service, find all providers who offer it
      if (subServiceId) {
        const svcWhere = countryFilter
          ? and(eq(services.subServiceId, subServiceId), eq(services.isActive, true), eq(services.countryCode, countryFilter))
          : and(eq(services.subServiceId, subServiceId), eq(services.isActive, true));
        const svcRows = await db.select().from(services).where(svcWhere);
        const providerIds = [...new Set(svcRows.map((s: any) => s.providerId))];
        if (providerIds.length === 0) return res.json({ providers: [], total: 0, page, limit: pageSize, totalPages: 0 });
        const allProviders = await storage.getAllProviders({ countryCode: countryFilter });
        const filtered = allProviders.filter(p => providerIds.includes(p.id) && (["approved","active"].includes((p as any).status)));
        const pageSlice = filtered.slice(offset, offset + pageSize);
        return res.set("Cache-Control", "no-store").json({
          providers: pageSlice.map(p => sanitizeProviderListItem(p)),
          total: filtered.length,
          page,
          limit: pageSize,
          totalPages: Math.ceil(filtered.length / pageSize),
        });
      }

      const useSearch = !!(q || type || city || verifiedOnly);

      // ── Cache key (country-isolated) ────────────────────────────────────────
      const cacheKey = useSearch
        ? `search:${countryFilter}:${q}:${type}:${city}:${verifiedOnly}:${page}:${pageSize}`
        : `list:${countryFilter}:${page}:${pageSize}`;

      // Try in-process cache first (search cache for queries, list cache for unfiltered)
      const cached = useSearch
        ? providerSearchCache.get(cacheKey)
        : providerListCache.get(cacheKey);
      if (cached) {
        res.set("Cache-Control", useSearch ? "no-store" : "private, max-age=30");
        return res.json(cached);
      }

      let pageRows: ReturnType<typeof sanitizeProviderListItem>[] = [];
      let total = 0;

      if (useSearch) {
        const { rows, total: t } = await storage.searchProviders({
          q: q || undefined, type: type || undefined, city: city || undefined,
          verifiedOnly, countryCode: countryFilter,
          approvedOnly: true,
          limit: pageSize, offset,
        });
        pageRows = rows.map(p => sanitizeProviderListItem(p));
        total = t;
      } else {
        const allProviders = await storage.getAllProviders({ countryCode: countryFilter });
        const approvedProviders = allProviders.filter(p => ["approved","active"].includes((p as any).status));
        total = approvedProviders.length;
        const slice = approvedProviders.slice(offset, offset + pageSize);
        pageRows = slice.map(p => sanitizeProviderListItem(p));
      }

      // ── Batch aggregate enrichment (eliminates N+1 per-card queries) ──────────
      // Computes minServicePrice, serviceCount, and avgResponseMinutes for the
      // current page in two SQL queries instead of one per ProviderCard render.
      let enriched: any[] = pageRows;
      if (pageRows.length > 0) {
        const providerIds = pageRows.map((p: any) => p.id);
        const [svcAggs, respAggs] = await Promise.all([
          pool.query(
            `SELECT provider_id,
                    MIN(price::numeric) FILTER (WHERE is_active = true)  AS min_price,
                    COUNT(*)            FILTER (WHERE is_active = true)   AS service_count
               FROM services
              WHERE provider_id = ANY($1)
              GROUP BY provider_id`,
            [providerIds]
          ),
          pool.query(
            `SELECT a.provider_id,
                    ROUND(AVG(
                      EXTRACT(EPOCH FROM (a.updated_at - a.created_at)) / 60
                    ))::int AS avg_response_minutes
               FROM appointments a
              WHERE a.provider_id = ANY($1)
                AND a.status <> 'pending'
                AND a.updated_at > a.created_at
                AND a.created_at > NOW() - INTERVAL '90 days'
              GROUP BY a.provider_id`,
            [providerIds]
          ),
        ]);
        const svcMap = new Map(svcAggs.rows.map((r: any) => [r.provider_id, r]));
        const respMap = new Map(respAggs.rows.map((r: any) => [r.provider_id, r]));
        enriched = pageRows.map((p: any) => ({
          ...p,
          minServicePrice:    svcMap.get(p.id)?.min_price  ?? null,
          serviceCount:       parseInt(svcMap.get(p.id)?.service_count ?? "0", 10),
          avgResponseMinutes: respMap.get(p.id)?.avg_response_minutes ?? null,
        }));
      }

      const response = { providers: enriched, total, page, limit: pageSize, totalPages: Math.ceil(total / pageSize) };

      // Store in appropriate cache
      if (useSearch) {
        providerSearchCache.set(cacheKey, response);
      } else {
        providerListCache.set(cacheKey, response);
      }

      // Country-aware caches must not be shared across countries.
      res.set("Cache-Control", useSearch ? "no-store" : "private, max-age=30");
      res.json(response);
    } catch (error) {
      console.error("Get providers error:", error);
      res.status(500).json({ message: "Failed to get providers" });
    }
  });

  // ── Smart Provider Recommendations ──────────────────────────────────────
  // Returns providers scored by multi-factor weighted matching against the
  // requesting patient's profile. Country-isolated — always requires auth
  // so we know which country's pool to score against.
  app.get("/api/providers/recommended", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { category, subServiceId, budget, limit: limitStr } = req.query as Record<string, string>;
      const limit = Math.min(parseInt(limitStr ?? "10", 10) || 10, 50);
      const countryCode = req.user!.countryCode ?? "HU";
      const userId = req.user!.id;

      // Only meaningful for patients
      if (req.user!.role !== "patient") {
        return res.json({ providers: [], fallbackUsed: false });
      }

      // Fetch patient profile (city, language preference)
      const patient = await storage.getUser(userId);

      // Fetch past appointment provider IDs for this patient (last 90 days)
      const pastAppts = await pool.query<{ provider_id: string }>(
        `SELECT DISTINCT provider_id FROM appointments
          WHERE patient_id = $1
            AND created_at > NOW() - INTERVAL '90 days'
            AND status NOT IN ('cancelled','cancelled_by_patient','cancelled_by_provider','rejected')`,
        [userId]
      );
      const pastProviderIds = pastAppts.rows.map(r => r.provider_id);

      // Build patient context
      const ctx: PatientContext = {
        countryCode,
        city: patient?.city ?? null,
        preferredLanguage: patient?.languagePreference ?? null,
        budgetHint: budget ? parseFloat(budget) : null,
        desiredCategory: category || null,
        desiredSubServiceId: subServiceId || null,
        pastProviderIds,
      };

      // Fetch candidate pool (country-filtered, active providers)
      const allProviders = await storage.getAllProviders({ countryCode });
      const activeProviders = allProviders.filter(
        p => (p as any).status === "approved" || (p as any).isVerified
      );

      // Fetch sub-service IDs and min service price per provider in one batch
      let providerSubSvcMap: Map<string, string[]> = new Map();
      let providerMinPriceMap: Map<string, string> = new Map();
      if (activeProviders.length > 0) {
        const ids = activeProviders.map(p => p.id);
        const [svcRows, priceRows] = await Promise.all([
          pool.query<{ provider_id: string; sub_service_id: string }>(
            `SELECT provider_id, sub_service_id FROM services
              WHERE provider_id = ANY($1)
                AND is_active = true
                AND sub_service_id IS NOT NULL`,
            [ids]
          ),
          pool.query<{ provider_id: string; min_price: string }>(
            `SELECT provider_id, MIN(price::numeric) AS min_price
               FROM services
              WHERE provider_id = ANY($1) AND is_active = true
              GROUP BY provider_id`,
            [ids]
          ),
        ]);
        for (const row of svcRows.rows) {
          if (!providerSubSvcMap.has(row.provider_id)) providerSubSvcMap.set(row.provider_id, []);
          providerSubSvcMap.get(row.provider_id)!.push(row.sub_service_id);
        }
        for (const row of priceRows.rows) {
          providerMinPriceMap.set(row.provider_id, row.min_price);
        }
      }

      // Build candidate objects for the scorer
      const candidates: ProviderCandidate[] = activeProviders.map(p => ({
        id: p.id,
        countryCode: p.countryCode,
        city: p.city ?? (p as any).user?.city ?? null,
        languages: p.languages ?? [],
        rating: p.rating,
        minServicePrice: providerMinPriceMap.get(p.id) ?? null,
        providerType: p.providerType,
        subServiceIds: providerSubSvcMap.get(p.id) ?? [],
        isVerified: p.isVerified,
        totalReviews: p.totalReviews,
      }));

      const { providers: ranked, fallbackUsed } = rankProviders(ctx, candidates, { minResults: 3, minScore: 5 });

      // Enrich with full provider+user data
      const providerMap = new Map(activeProviders.map(p => [p.id, p]));
      const topN = ranked.slice(0, limit);

      // Batch-enrich with minServicePrice and serviceCount
      const topIds = topN.map(r => r.id);
      let svcAggMap: Map<string, { min_price: string; service_count: string }> = new Map();
      if (topIds.length > 0) {
        const agg = await pool.query(
          `SELECT provider_id,
                  MIN(price::numeric) FILTER (WHERE is_active = true) AS min_price,
                  COUNT(*)           FILTER (WHERE is_active = true)  AS service_count
             FROM services WHERE provider_id = ANY($1) GROUP BY provider_id`,
          [topIds]
        );
        svcAggMap = new Map(agg.rows.map((r: any) => [r.provider_id, r]));
      }

      const result = topN.map(r => {
        const p = providerMap.get(r.id);
        if (!p) return null;
        return {
          ...sanitizeProviderListItem(p),
          matchScore: r.score,
          matchReasons: r.reasons,
          minServicePrice: svcAggMap.get(r.id)?.min_price ?? null,
          serviceCount: parseInt(svcAggMap.get(r.id)?.service_count ?? "0", 10),
        };
      }).filter(Boolean);

      res.set("Cache-Control", "no-store");
      res.json({ providers: result, fallbackUsed });
    } catch (error) {
      console.error("[recommendations] error:", error);
      res.status(500).json({ message: "Failed to get recommendations" });
    }
  });

  // ── /api/providers/me alias ───────────────────────────────────────────────
  // Several frontend pages (provider-dashboard.tsx) use the plural form
  // /api/providers/me while the canonical route is /api/provider/me (singular).
  // This alias must be registered BEFORE /api/providers/:id so Express doesn't
  // try to look up a provider with id="me".
  // ALL DB access goes through storage → server/db.ts → SUPABASE_DATABASE_URL.
  // Alias kept for backward-compat; all internal fetches should prefer /api/provider/me
  app.get("/api/providers/me", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const provider = await storage.getProviderByUserId(userId);
      if (!provider) return res.status(404).json({ message: "Provider profile not found" });
      const providerWithServices = await storage.getProviderWithServices(provider.id);
      res.json(providerWithServices || provider);
    } catch (error) {
      console.error("Error fetching providers/me:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Canonical provider-me endpoint — use this in preference to /api/providers/me

  // Get provider by ID
  app.get("/api/providers/:id", optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderWithServices(req.params.id);
      if (!provider) {
        return res.status(404).json({ message: "Provider not found" });
      }
      // Country isolation: a non-global-admin user from country X cannot view a
      // provider in country Y. Anonymous visitors only see HU providers (the
      // default tenant) unless they pass a valid ?country override.
      const provCountry = (provider as any).countryCode as CountryCode | undefined;
      if (req.user) {
        if (!canAccessCountry(req.user, provCountry)) {
          return res.status(404).json({ message: "Provider not found" });
        }
      } else {
        const q = typeof req.query.country === "string" ? req.query.country.toUpperCase() : "HU";
        const want = isCountryCode(q) ? q : "HU";
        if (provCountry && provCountry !== want) {
          return res.status(404).json({ message: "Provider not found" });
        }
      }
      res.json(sanitizeProviderWithUser(provider));
    } catch (error) {
      console.error("Get provider error:", error);
      res.status(500).json({ message: "Failed to get provider" });
    }
  });

  // Get provider reviews
  app.get("/api/providers/:id/reviews", async (req: Request, res: Response) => {
    try {
      const reviews = await storage.getReviewsByProvider(req.params.id);
      res.json(reviews);
    } catch (error) {
      res.status(500).json({ message: "Failed to get reviews" });
    }
  });

  // Get provider's average response time (minutes)
  app.get("/api/providers/:id/response-time", async (req: Request, res: Response) => {
    try {
      const minutes = await storage.getProviderResponseTimeMinutes(req.params.id);
      res.json({ minutes });
    } catch (error) {
      console.error("Response time error:", error);
      res.status(500).json({ message: "Failed to get response time" });
    }
  });

  registerProviderAvailabilityRoutes(app);
  app.get("/api/saved-providers", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "patient") {
        return res.status(403).json({ message: "Patient access required" });
      }
      const list = await storage.listSavedProviders(req.user.id);
      res.json(list);
    } catch (error) {
      console.error("List saved providers error:", error);
      res.status(500).json({ message: "Failed to list saved providers" });
    }
  });

  app.get("/api/saved-providers/:providerId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "patient") return res.json({ saved: false });
      const saved = await storage.isProviderSaved(req.user.id, req.params.providerId);
      res.json({ saved });
    } catch (error) {
      console.error("Check saved provider error:", error);
      res.status(500).json({ message: "Failed to check saved status" });
    }
  });

  app.post("/api/saved-providers/:providerId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "patient") {
        return res.status(403).json({ message: "Patient access required" });
      }
      const provider = await storage.getProvider(req.params.providerId);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const saved = await storage.addSavedProvider(req.user.id, req.params.providerId);
      res.status(201).json(saved);
    } catch (error) {
      console.error("Add saved provider error:", error);
      res.status(500).json({ message: "Failed to save provider" });
    }
  });

  app.delete("/api/saved-providers/:providerId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "patient") {
        return res.status(403).json({ message: "Patient access required" });
      }
      await storage.removeSavedProvider(req.user.id, req.params.providerId);
      res.status(204).end();
    } catch (error) {
      console.error("Remove saved provider error:", error);
      res.status(500).json({ message: "Failed to remove saved provider" });
    }
  });

  // ─── Group sessions ────────────────────────────────────────────────────────
  // Provider creates a group session for their own practice. Country is forced
  // to the provider's country so a logged-in HU provider can never publish into
  // IR by tampering with the body.
  app.post("/api/provider/group-sessions", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile required" });
      const parsed = insertGroupSessionSchema.parse({
        ...req.body,
        providerId: provider.id,
        countryCode: provider.countryCode,
      });
      const created = await storage.createGroupSession(parsed as any);
      res.status(201).json(created);
    } catch (e: any) {
      if (e?.issues) return res.status(400).json({ message: "Validation failed", errors: e.issues });
      res.status(400).json({ message: e?.message || "Failed to create group session" });
    }
  });

  // Provider's own list (any status, sorted newest start first).
  app.get("/api/provider/group-sessions", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile required" });
      const list = await storage.listGroupSessionsByProvider(provider.id);
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Failed to list group sessions" });
    }
  });

  // Provider sees the participants for one of their sessions (with attendance).
  app.get("/api/provider/group-sessions/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile required" });
      const detail = await storage.getGroupSessionWithParticipants(req.params.id);
      if (!detail) return res.status(404).json({ message: "Not found" });
      if (detail.session.providerId !== provider.id) return res.status(403).json({ message: "Forbidden" });
      res.json(detail);
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Failed to load session" });
    }
  });

  // Provider edits a non-cancelled session. Status / countryCode / providerId
  // cannot be changed via this route — those go through dedicated flows.
  app.patch("/api/provider/group-sessions/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile required" });
      const existing = await storage.getGroupSession(req.params.id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (existing.providerId !== provider.id) return res.status(403).json({ message: "Forbidden" });
      const { providerId: _p, countryCode: _c, status: _s, id: _i, createdAt: _ca, updatedAt: _ua, ...rest } = req.body || {};
      const updated = await storage.updateGroupSession(req.params.id, rest);
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ message: e?.message || "Failed to update session" });
    }
  });

  // Provider cancels and refunds every paid participant via wallet.
  app.post("/api/provider/group-sessions/:id/cancel", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile required" });
      const existing = await storage.getGroupSession(req.params.id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (existing.providerId !== provider.id) return res.status(403).json({ message: "Forbidden" });
      const result = await storage.cancelGroupSessionAndRefund(req.params.id, req.user!.id);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ message: e?.message || "Failed to cancel session" });
    }
  });

  // Provider marks attendance for one participant in their own session.
  app.patch("/api/provider/group-sessions/:id/participants/:participantId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile required" });
      const status = String(req.body?.attendanceStatus);
      if (!["registered", "joined", "no_show"].includes(status)) {
        return res.status(400).json({ message: "Invalid attendanceStatus" });
      }
      const updated = await storage.markGroupParticipantAttendance(req.params.participantId, status as any, req.user!.id);
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ message: e?.message || "Failed to update attendance" });
    }
  });

  app.get("/api/provider/me", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const provider = await storage.getProviderByUserId(userId);
      if (!provider) return res.status(404).json({ message: "Provider profile not found" });
      
      const providerWithServices = await storage.getProviderWithServices(provider.id);
      const base = providerWithServices || provider;

      // Supplement with Phase-14/15 columns not yet in the Drizzle schema
      const { rows: extRows } = await pool.query(
        `SELECT pending_provider_type, type_change_reason, type_change_requested_at,
                pending_provider_category, pending_provider_subcategory,
                pending_specialization, pending_display_title,
                category_change_reason, category_change_requested_at
         FROM providers WHERE id = $1`,
        [(provider as any).id],
      ).catch(() => ({ rows: [{}] }));
      const extRow = extRows[0] ?? {};

      res.json({
        ...base,
        pendingProviderType: extRow.pending_provider_type ?? null,
        typeChangeReason: extRow.type_change_reason ?? null,
        typeChangeRequestedAt: extRow.type_change_requested_at ?? null,
        pendingProviderCategory: extRow.pending_provider_category ?? null,
        pendingProviderSubcategory: extRow.pending_provider_subcategory ?? null,
        pendingSpecialization: extRow.pending_specialization ?? null,
        pendingDisplayTitle: extRow.pending_display_title ?? null,
        categoryChangeReason: extRow.category_change_reason ?? null,
        categoryChangeRequestedAt: extRow.category_change_requested_at ?? null,
      });
    } catch (error) {
      console.error("Error fetching provider/me:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── PATCH /api/provider/preferences ─────────────────────────────────────
  // Updates day-to-day preference fields (currency, payment methods, address,
  // titles) for the authenticated provider.  This endpoint deliberately does
  // NOT apply the "hard-lock" check that /api/provider/setup uses, because
  // these fields are operational preferences, not compliance-gated credentials.
  // Approved / verified providers must still be able to change them.
  app.patch("/api/provider/preferences", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const provider = await storage.getProviderByUserId(userId);
      if (!provider) return res.status(404).json({ message: "Provider profile not found" });

      const ALLOWED_CURRENCIES = ["USD", "HUF", "IRR", "GBP", "EUR"] as const;
      type AllowedCurrency = (typeof ALLOWED_CURRENCIES)[number];

      // Fields that go onto the providers table
      const PROVIDER_FIELDS = [
        "paymentMethods",
        "preferredContactMethod",
        "onCallAvailability",
        "maxPatientsPerDay",
        "emergencyContact",
        "permanentAddressLine1",
        "permanentAddressLine2",
        "permanentCity",
        "permanentStateRegion",
        "permanentPostalCode",
        "permanentCountry",
        "displayTitle",
      ] as const;

      const providerUpdate: Record<string, unknown> = {};
      for (const field of PROVIDER_FIELDS) {
        if (req.body[field] !== undefined) {
          providerUpdate[field] = req.body[field];
        }
      }

      if (Object.keys(providerUpdate).length > 0) {
        await storage.updateProvider(provider.id, providerUpdate as any);
      }

      // currency → users.preferred_currency
      if (req.body.currency !== undefined) {
        const currency = req.body.currency as string;
        if (!ALLOWED_CURRENCIES.includes(currency as AllowedCurrency)) {
          return res.status(400).json({
            message: `Invalid currency "${currency}". Allowed: ${ALLOWED_CURRENCIES.join(", ")}`,
          });
        }
        await storage.updateUser(userId, { preferredCurrency: currency } as any);
      }

      const updated = await storage.getProviderByUserId(userId);
      res.json(updated);
    } catch (error: any) {
      console.error("[provider/preferences] error:", error);
      res.status(500).json({ message: error.message || "Failed to save preferences" });
    }
  });

  // ── Provider Scheduling Suggestions ─────────────────────────────────────
  // Analyses the provider's recent booking history to surface insights:
  //   - busiest days / hours
  //   - under-used time windows
  //   - recommended schedule changes
  app.get("/api/provider/scheduling-suggestions", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const provider = await storage.getProviderByUserId(userId);
      if (!provider) return res.status(404).json({ message: "Provider profile not found" });

      // Pull last 90 days of confirmed/completed appointments for this provider.
      // date is text (YYYY-MM-DD); start_time is text (HH:MM) — cast both.
      const { rows: apptRows } = await pool.query<{
        dow: number; hour: number; cnt: string;
      }>(
        `SELECT
           EXTRACT(DOW FROM date::date)::int           AS dow,
           EXTRACT(HOUR FROM start_time::time)::int    AS hour,
           COUNT(*)                                     AS cnt
         FROM appointments
         WHERE provider_id = $1
           AND created_at > NOW() - INTERVAL '90 days'
           AND status IN ('completed','confirmed','in_progress','approved')
         GROUP BY dow, hour
         ORDER BY dow, hour`,
        [provider.id]
      );

      // Day-level aggregates
      const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dayTotals = Array(7).fill(0);
      for (const r of apptRows) dayTotals[r.dow] += parseInt(r.cnt, 10);
      const maxDay = Math.max(...dayTotals, 1);

      const busyDays = DAY_NAMES
        .map((name, i) => ({ day: name, bookings: dayTotals[i] }))
        .filter(d => d.bookings > 0)
        .sort((a, b) => b.bookings - a.bookings);

      // Hour-level aggregates
      const hourTotals: Record<number, number> = {};
      for (const r of apptRows) {
        hourTotals[r.hour] = (hourTotals[r.hour] ?? 0) + parseInt(r.cnt, 10);
      }
      const peakHours = Object.entries(hourTotals)
        .map(([h, cnt]) => ({ hour: parseInt(h, 10), bookings: cnt }))
        .sort((a, b) => b.bookings - a.bookings)
        .slice(0, 5);

      // Detect under-used optimal windows (09-11 and 14-16) vs busiest hour
      const optimalWindowsUsage = [
        { label: "Morning (09:00-11:00)", hours: [9, 10] },
        { label: "Afternoon (14:00-16:00)", hours: [14, 15] },
      ].map(win => ({
        label: win.label,
        bookings: win.hours.reduce((s, h) => s + (hourTotals[h] ?? 0), 0),
      }));
      const maxPeak = Math.max(...Object.values(hourTotals), 1);
      const suggestions: string[] = [];

      for (const win of optimalWindowsUsage) {
        const usage = win.bookings / maxPeak;
        if (usage < 0.5) {
          suggestions.push(
            `${win.label} is under-used (${win.bookings} bookings). Consider promoting these slots.`
          );
        }
      }

      if (busyDays.length > 0 && dayTotals[0] > 0 && dayTotals[6] > 0) {
        suggestions.push("You receive bookings on weekends. Ensure your weekend schedule is up to date.");
      }
      if (busyDays.length === 0) {
        suggestions.push("No confirmed bookings in the last 90 days. Make sure your profile is active and visible.");
      }
      if (peakHours.length > 0) {
        const top = peakHours[0];
        suggestions.push(
          `Your peak booking hour is ${String(top.hour).padStart(2, "0")}:00 with ${top.bookings} appointments. Consider adding buffer time here.`
        );
      }

      res.json({
        busyDays,
        peakHours,
        optimalWindowsUsage,
        suggestions,
        periodDays: 90,
      });
    } catch (error) {
      console.error("[scheduling-suggestions] error:", error);
      res.status(500).json({ message: "Failed to get scheduling suggestions" });
    }
  });

  // ── Provider Insights ─────────────────────────────────────────────────────
  // Single-request analytics payload for the Insights tab in the provider
  // dashboard. Runs 6 SQL queries in parallel for speed.
  app.get("/api/provider/insights", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.id) return res.status(401).json({ message: "Not authenticated" });
      if (req.user.role !== "provider") return res.status(403).json({ message: "Provider only" });
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider profile not found" });
      const pid = provider.id;

      // Single pg client — sequential queries to avoid pool exhaustion (pool.max=12)
      const _ic = await pool.connect();
      let weekRevRows: any, heatRows: any, kpiRows: any, svcRows: any, repeatRows: any, lostRows: any;
      try {
        // 1. Revenue per ISO week, last 12 weeks (completed only)
        weekRevRows = await _ic.query<{ week_start: string; revenue: string; count: string }>(
          `SELECT DATE_TRUNC('week', date::date)::date AS week_start,
                  COALESCE(SUM(total_amount::numeric), 0) AS revenue,
                  COUNT(*) AS count
           FROM appointments
           WHERE provider_id = $1 AND status = 'completed'
             AND date::date >= CURRENT_DATE - INTERVAL '12 weeks'
           GROUP BY week_start ORDER BY week_start`,
          [pid],
        );
        // 2. Busy-period heatmap — DOW × hour of completed appts, last 6 months
        heatRows = await _ic.query<{ dow: string; hour: string; cnt: string }>(
          `SELECT EXTRACT(DOW FROM date::date)::int AS dow,
                  EXTRACT(HOUR FROM start_time::time)::int AS hour,
                  COUNT(*) AS cnt
           FROM appointments
           WHERE provider_id = $1 AND status = 'completed'
             AND date::date >= CURRENT_DATE - INTERVAL '6 months'
           GROUP BY dow, hour`,
          [pid],
        );
        // 3. Overall KPI counters — last 12 months
        kpiRows = await _ic.query<{ completed: string; cancelled: string; total: string; unique_patients: string }>(
          `SELECT COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                  COUNT(*) FILTER (WHERE status IN ('cancelled','cancelled_by_patient','cancelled_by_provider','rejected','expired')) AS cancelled,
                  COUNT(*) AS total,
                  COUNT(DISTINCT patient_id) FILTER (WHERE status = 'completed') AS unique_patients
           FROM appointments
           WHERE provider_id = $1 AND date::date >= CURRENT_DATE - INTERVAL '12 months'`,
          [pid],
        );
        // 4. Popular services by completed booking count — last 12 months
        svcRows = await _ic.query<{ service_name: string; booking_count: string }>(
          `SELECT COALESCE(s.name, 'Other') AS service_name, COUNT(*) AS booking_count
           FROM appointments a
           LEFT JOIN services s ON s.id = a.service_id
           WHERE a.provider_id = $1 AND a.status = 'completed'
             AND a.date::date >= CURRENT_DATE - INTERVAL '12 months'
           GROUP BY service_name ORDER BY booking_count DESC LIMIT 8`,
          [pid],
        );
        // 5. Repeat patients (≥ 2 completed appointments, all time)
        repeatRows = await _ic.query<{ patient_id: string; visit_count: string; last_visit: string; total_spend: string; first_name: string; last_name: string }>(
          `SELECT a.patient_id, COUNT(*) AS visit_count, MAX(a.date) AS last_visit,
                  COALESCE(SUM(a.total_amount::numeric), 0) AS total_spend,
                  MAX(u.first_name) AS first_name, MAX(u.last_name) AS last_name
           FROM appointments a
           JOIN users u ON u.id = a.patient_id
           WHERE a.provider_id = $1 AND a.status = 'completed'
           GROUP BY a.patient_id HAVING COUNT(*) >= 2
           ORDER BY last_visit DESC LIMIT 20`,
          [pid],
        );
        // 6. Lost bookings count — last 12 months
        lostRows = await _ic.query<{ cnt: string }>(
          `SELECT COUNT(*) AS cnt FROM appointments
           WHERE provider_id = $1
             AND status IN ('cancelled','cancelled_by_patient','cancelled_by_provider','rejected','expired')
             AND date::date >= CURRENT_DATE - INTERVAL '12 months'`,
          [pid],
        );
      } finally {
        _ic.release();
      }

      // Build 12-week series filling gaps with 0 (ISO Monday-based)
      const revMap = new Map<string, { revenue: number; count: number }>();
      for (const r of weekRevRows.rows) {
        revMap.set(String(r.week_start).slice(0, 10), { revenue: Number(r.revenue), count: Number(r.count) });
      }
      const weeklyRevenue: { week: string; revenue: number; count: number }[] = [];
      for (let w = 11; w >= 0; w--) {
        const d = new Date();
        d.setDate(d.getDate() - w * 7);
        const diff = (d.getDay() + 6) % 7; // days since Monday
        const mon = new Date(d);
        mon.setDate(d.getDate() - diff);
        const key = mon.toISOString().slice(0, 10);
        const label = mon.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const found = revMap.get(key);
        weeklyRevenue.push({ week: label, revenue: found?.revenue ?? 0, count: found?.count ?? 0 });
      }

      // Heatmap matrix [dow 0-6][hour 0-23]
      const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
      for (const r of heatRows.rows) {
        const dow = Number(r.dow);
        const hour = Number(r.hour);
        if (dow >= 0 && dow < 7 && hour >= 0 && hour < 24) heatmap[dow][hour] = Number(r.cnt);
      }

      const kpi = kpiRows.rows[0] ?? { completed: "0", cancelled: "0", total: "0", unique_patients: "0" };
      const totalBookings = Number(kpi.total) || 0;
      const completedCnt = Number(kpi.completed) || 0;
      const cancelledCnt = Number(kpi.cancelled) || 0;
      const uniquePatients = Number(kpi.unique_patients) || 0;
      const repeatPatients = repeatRows.rows.map((r) => ({
        patientId: r.patient_id,
        name: `${r.first_name} ${r.last_name}`,
        visitCount: Number(r.visit_count),
        lastVisit: String(r.last_visit).slice(0, 10),
        totalSpend: Number(r.total_spend),
      }));

      const insightsCancellationRate = totalBookings > 0 ? Math.round((cancelledCnt / totalBookings) * 100) : 0;
      const insightsUtilizationPct   = totalBookings > 0 ? Math.round((completedCnt / totalBookings) * 100) : 0;
      const insightsRepeatPct        = uniquePatients > 0 ? Math.round((repeatPatients.length / uniquePatients) * 100) : 0;
      const insightsLostBookings     = Number(lostRows.rows[0]?.cnt ?? 0);

      const growthTips: string[] = [];
      if (insightsCancellationRate > 20) {
        growthTips.push("Your cancellation rate is above 20%. Sending reminders 24–48 h before sessions can reduce no-shows.");
      }
      if (insightsRepeatPct < 30 && totalBookings >= 5) {
        growthTips.push("Fewer than 30% of your patients return. A service package can encourage long-term engagement.");
      }
      if (insightsUtilizationPct < 50 && totalBookings >= 3) {
        growthTips.push("Your completion rate is under 50%. Review your scheduling and follow up with patients who cancel.");
      }
      if (insightsLostBookings > 5) {
        growthTips.push(`${insightsLostBookings} bookings were lost to cancellations or no-shows. A clear cancellation policy can help.`);
      }
      if (repeatPatients.length === 0 && totalBookings >= 5) {
        growthTips.push("Build long-term relationships by recommending follow-up visits at the end of each session.");
      }
      if (growthTips.length === 0 && totalBookings > 0) {
        growthTips.push("You're on track! Keep your profile updated and availability open to maximise bookings.");
      }

      res.json({
        canonical_currency: "USD",
        weeklyRevenue,
        heatmap,
        kpi: {
          cancellationRate: insightsCancellationRate,
          utilizationPct: insightsUtilizationPct,
          bookingConversionRate: insightsUtilizationPct,
          repeatPatientPct: insightsRepeatPct,
          lostBookings: insightsLostBookings,
          totalCompleted: completedCnt,
          totalBookings,
        },
        popularServices: svcRows.rows.map((r) => ({
          name: r.service_name,
          count: Number(r.booking_count),
        })),
        repeatPatients,
        growthTips,
      });
    } catch (error) {
      console.error("[provider/insights] error:", error);
      res.status(500).json({ message: "Failed to load insights" });
    }
  });

  // ── Provider Analytics (richer data — service breakdown, rating dist, monthly trend, referral stats)
  app.get("/api/provider/analytics", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.id) return res.status(401).json({ message: "Not authenticated" });
      if (req.user.role !== "provider") return res.status(403).json({ message: "Provider only" });
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider profile not found" });
      const pid = provider.id;
      const uid = req.user.id;

      // Single pg client — sequential queries to avoid pool exhaustion (pool.max=12)
      const _ac = await pool.connect();
      let svcRows: any, ratingRows: any, monthRows: any, referralRows: any, scheduleRows: any, pkgRows: any;
      try {
        // 1. Service performance breakdown — last 12 months
        svcRows = await _ac.query<{ service_name: string; bookings: string; revenue: string; avg_rating: string }>(
          `SELECT COALESCE(s.name, 'Other') AS service_name,
                  COUNT(*) AS bookings,
                  COALESCE(SUM(a.total_amount::numeric), 0) AS revenue,
                  COALESCE(AVG(r.rating), 0) AS avg_rating
           FROM appointments a
           LEFT JOIN services s ON s.id = a.service_id
           LEFT JOIN reviews r ON r.appointment_id = a.id
           WHERE a.provider_id = $1 AND a.status = 'completed'
             AND a.date::date >= CURRENT_DATE - INTERVAL '12 months'
           GROUP BY service_name ORDER BY bookings DESC LIMIT 10`,
          [pid],
        );
        // 2. Rating distribution
        ratingRows = await _ac.query<{ rating: string; cnt: string }>(
          `SELECT rating::text, COUNT(*) AS cnt
           FROM reviews
           WHERE provider_id = $1
           GROUP BY rating ORDER BY rating`,
          [pid],
        );
        // 3. Monthly trend — last 12 months (completed + cancelled + no_show)
        monthRows = await _ac.query<{ month: string; revenue: string; bookings: string; cancellations: string; no_shows: string }>(
          `SELECT TO_CHAR(DATE_TRUNC('month', date::date), 'Mon YY') AS month,
                  COALESCE(SUM(total_amount::numeric) FILTER (WHERE status = 'completed'), 0) AS revenue,
                  COUNT(*) FILTER (WHERE status = 'completed') AS bookings,
                  COUNT(*) FILTER (WHERE status IN ('cancelled','cancelled_by_patient','cancelled_by_provider','rejected','expired')) AS cancellations,
                  COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows
           FROM appointments
           WHERE provider_id = $1
             AND date::date >= CURRENT_DATE - INTERVAL '12 months'
           GROUP BY DATE_TRUNC('month', date::date)
           ORDER BY DATE_TRUNC('month', date::date)`,
          [pid],
        );
        // 4. Referral stats — this provider referred patients (best-effort)
        referralRows = await _ac.query<{ total: string; converted: string; total_earned: string }>(
          `SELECT COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE status = 'converted') AS converted,
                  COALESCE(SUM(reward_amount::numeric), 0) AS total_earned
           FROM referrals
           WHERE referrer_id = $1`,
          [uid],
        ).catch(() => ({ rows: [] as any[] }));
        // 5. Schedule utilization from appointments (authoritative source; time_slots.is_booked can be stale)
        scheduleRows = await _ac.query<{ total_slots: string; booked_slots: string }>(
          `SELECT COUNT(*) AS total_slots,
                  COUNT(*) FILTER (WHERE status = 'completed') AS booked_slots
           FROM appointments
           WHERE provider_id = $1
             AND date::date >= CURRENT_DATE - INTERVAL '30 days'
             AND date::date <= CURRENT_DATE`,
          [pid],
        );
        // 6. Package/membership usage performance — best-effort
        pkgRows = await _ac.query<{ package_name: string; bookings_used: string; total_discount: string }>(
          `SELECT COALESCE(sp.name, 'Unknown Package') AS package_name,
                  COUNT(*) AS bookings_used,
                  COALESCE(SUM(a.package_discount_amount::numeric), 0) AS total_discount
           FROM appointments a
           JOIN service_packages sp ON sp.id = a.package_id_used
           WHERE a.provider_id = $1
             AND a.package_id_used IS NOT NULL
             AND a.date::date >= CURRENT_DATE - INTERVAL '12 months'
           GROUP BY sp.name ORDER BY bookings_used DESC LIMIT 10`,
          [pid],
        ).catch(() => ({ rows: [] as any[] }));
      } finally {
        _ac.release();
      }

      // Service breakdown
      const serviceBreakdown = svcRows.rows.map((r) => ({
        name: r.service_name,
        bookings: Number(r.bookings),
        revenue: Number(r.revenue),
        avgRating: Number(r.avg_rating) > 0 ? Number(Number(r.avg_rating).toFixed(1)) : null,
      }));

      // Rating distribution
      const ratingDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      let totalReviews = 0;
      let ratingSum = 0;
      for (const r of ratingRows.rows) {
        const star = Number(r.rating);
        const cnt = Number(r.cnt);
        if (star >= 1 && star <= 5) {
          ratingDist[star] = cnt;
          totalReviews += cnt;
          ratingSum += star * cnt;
        }
      }
      const avgRating = totalReviews > 0 ? Number((ratingSum / totalReviews).toFixed(2)) : 0;

      // Monthly trend
      const monthlyTrend = monthRows.rows.map((r) => ({
        month: r.month,
        revenue: Number(r.revenue),
        bookings: Number(r.bookings),
        cancellations: Number(r.cancellations),
        noShows: Number(r.no_shows),
      }));

      // Referral stats
      const refRow = referralRows.rows[0];
      const referralStats = {
        total: Number(refRow?.total ?? 0),
        converted: Number(refRow?.converted ?? 0),
        totalEarned: Number(refRow?.total_earned ?? 0),
      };

      // Schedule utilization
      const schedRow = scheduleRows.rows[0];
      const totalSlots = Number(schedRow?.total_slots ?? 0);
      const bookedSlots = Number(schedRow?.booked_slots ?? 0);
      const utilizationPct = totalSlots > 0 ? Math.round((bookedSlots / totalSlots) * 100) : 0;

      const packagePerformance = pkgRows.rows.map((r) => ({
        name: r.package_name,
        bookingsUsed: Number(r.bookings_used),
        totalDiscount: Number(r.total_discount),
      }));

      res.json({
        canonical_currency: "USD",
        serviceBreakdown,
        ratingDistribution: { dist: ratingDist, total: totalReviews, avg: avgRating },
        monthlyTrend,
        referralStats,
        scheduleHealth: { totalSlots, bookedSlots, utilizationPct },
        packagePerformance,
      });
    } catch (error) {
      console.error("[provider/analytics] error:", error);
      res.status(500).json({ message: "Failed to load analytics" });
    }
  });

  // The 7 canonical category slugs — only values allowed in providers.provider_type
  const CANONICAL_SLUGS = new Set([
    "physician", "mental_health", "nutrition", "rehabilitation",
    "dental", "alternative_medicine", "nursing",
  ]);

  // GET /api/provider/my-categories — allowed categories for the logged-in provider
  app.get("/api/provider/my-categories", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });

      const allCategories = await storage.getAllCategories();
      const perms = await storage.getProviderCategoryPermissions(provider.id);

      let allowed: typeof allCategories;
      if (perms.length > 0) {
        // Admin override: use only the explicitly enabled categories
        const enabledIds = new Set(perms.filter(p => p.enabled).map(p => p.categoryId));
        allowed = allCategories.filter(c => enabledIds.has(c.id));
      } else {
        const rawType = (provider as any).providerType ?? "";
        if (CANONICAL_SLUGS.has(rawType)) {
          allowed = allCategories.filter(cat => cat.slug === rawType);
        } else {
          allowed = [];
        }
      }

      res.json({ categories: allowed, hasAdminOverride: perms.length > 0 });
    } catch (err) {
      console.error("[GET /api/provider/my-categories]", err);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  registerProviderMediaRoutes(app);
  // Service sort-order reorder — must be registered BEFORE /api/services/:id to avoid "reorder" being matched as an :id param.
  app.patch("/api/services/reorder", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { updates } = req.body as { updates: { id: string; sortOrder: number }[] };
      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ message: "Updates required" });
      }
      if (!isAdminRole(req.user?.role)) {
        const provider = await storage.getProviderByUserId(req.user!.id);
        if (!provider) return res.status(403).json({ message: "Forbidden" });
        for (const u of updates) {
          const s = await storage.getService(u.id);
          if (!s || s.providerId !== provider.id) {
            return res.status(403).json({ message: "Not your service" });
          }
        }
      }
      await storage.reorderServices(updates);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to reorder" });
    }
  });

  app.patch("/api/services/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      // Ownership check: admins can edit any service; providers can only edit services
      // they were assigned (services.providerId = their provider record).
      const svc = await storage.getService(req.params.id);
      if (!svc) return res.status(404).json({ message: "Service not found" });
      if (!isAdminRole(req.user?.role)) {
        const provider = await storage.getProviderByUserId(req.user!.id);
        if (!provider || provider.id !== svc.providerId) {
          return res.status(403).json({ message: "You can only edit services assigned to you" });
        }
        const provStatus = (provider as any).status;
        if (provStatus !== "approved" && provStatus !== "active") {
          return res.status(403).json({
            message: "Your provider profile must be approved before you can manage services.",
          });
        }
        // Admin-assigned services (linked to a catalog sub-service) are partially locked.
        // Providers may update instance-level settings (price, duration, buffers, fees,
        // availability, description) but MUST NOT touch catalog fields (name, subServiceId, etc.).
        if ((svc as any).subServiceId) {
          const LOCKED_INSTANCE_FIELDS = new Set([
            "isActive",
            "price", "duration",
            "bufferBefore", "bufferAfter",
            "homeVisitFee", "clinicFee", "telemedicineFee", "emergencyFee",
            "availabilityHours", "locationMode", "timeSlotLength",
            "depositAmount", "enableDeposit",
            "description",
            "hidePrice", "hideDuration",
          ]);
          const submittedKeys = Object.keys(req.body || {});
          const disallowed = submittedKeys.filter((k) => !LOCKED_INSTANCE_FIELDS.has(k));
          if (disallowed.length > 0) {
            return res.status(403).json({
              message: `Cannot modify catalog field(s): ${disallowed.join(", ")}. Service name, category, and catalog mapping are admin-managed.`,
            });
          }
        }
      }
      const bufParse = updateServiceSchema.safeParse(req.body);
      if (!bufParse.success) {
        return res.status(400).json({ message: bufParse.error.errors[0]?.message || "Invalid payload" });
      }
      // Guard: reject USD-labelled prices and USD-scale amounts for this provider's country.
      if (req.body?.price !== undefined || req.body?.currency !== undefined) {
        const guardProvider = isAdminRole(req.user?.role)
          ? await storage.getProvider((svc as any).providerId)
          : await storage.getProviderByUserId(req.user!.id);
        const guardCountry = (guardProvider as any)?.countryCode;
        try {
          assertNativeCurrency(req.body?.currency, req.body?.price, guardCountry);
        } catch (e) {
          if (e instanceof ServiceCurrencyError) {
            return res.status(422).json({ message: e.message });
          }
          throw e;
        }
      }
      const service = await storage.updateService(req.params.id, req.body, { changedBy: req.user?.id });
      res.json(service);
    } catch (error) {
      res.status(400).json({ message: "Failed to update service" });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Provider-staged service edits: a provider proposes changes that go into a
  // pending state on the same row (services.pending_changes JSONB). The admin
  // then approves (merges into the live row) or rejects (clears the staging
  // fields). While pendingChangeStatus = 'pending' the service cannot be booked.
  // Whitelist of fields a provider is allowed to stage. We keep this short on
  // purpose — anything broader (provider_id, country_code, deleted_at) must
  // remain admin-only.
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

  app.post("/api/provider/services/:id/submit-changes", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const svc: any = await storage.getService(req.params.id);
      if (!svc) return res.status(404).json({ message: "Service not found" });
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider || provider.id !== svc.providerId) {
        return res.status(403).json({ message: "You can only edit services assigned to you" });
      }

      const incoming = (req.body && typeof req.body === "object") ? req.body : {};
      const reason: string | null = typeof incoming.reason === "string" ? incoming.reason : null;
      const staged: Record<string, any> = {};
      for (const [k, v] of Object.entries(incoming)) {
        if (k === "reason") continue;
        if (PROVIDER_EDITABLE_SERVICE_FIELDS.has(k)) staged[k] = v;
      }
      if (Object.keys(staged).length === 0) {
        return res.status(400).json({ message: "No editable fields submitted." });
      }

      // Defense-in-depth: if the provider tries to assign a sub-service that
      // belongs to another country we reject. Sub-services already inherit a
      // country from the catalog, so this preserves tenancy isolation.
      if (staged.subServiceId) {
        const sub: any = await storage.getSubService(staged.subServiceId);
        if (!sub) return res.status(400).json({ message: "Selected category does not exist." });
        if ((sub as any).countryCode && (svc as any).countryCode && (sub as any).countryCode !== (svc as any).countryCode) {
          return res.status(400).json({ message: "Selected category is not available in this country." });
        }
      }

      await pool.query(
        `UPDATE services
         SET pending_changes = $1::jsonb,
             pending_change_status = 'pending',
             pending_change_submitted_by = $2,
             pending_change_submitted_at = NOW(),
             pending_change_reviewed_by = NULL,
             pending_change_reviewed_at = NULL,
             pending_change_reason = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [JSON.stringify(staged), req.user!.id, reason, req.params.id],
      );
      const updated = await storage.getService(req.params.id);
      res.json(updated);
    } catch (error) {
      console.error("[POST /api/provider/services/:id/submit-changes] error:", error);
      res.status(500).json({ message: "Failed to submit changes" });
    }
  });

  app.delete("/api/services/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const force = req.query.force === "true" && isAdminRole(req.user?.role);
      const existing = await storage.getService(req.params.id);
      if (!existing) return res.status(404).json({ message: "Service not found" });
      // Ownership check: admins can delete any service; providers only their own.
      if (!isAdminRole(req.user?.role)) {
        const provider = await storage.getProviderByUserId(req.user!.id);
        if (!provider || provider.id !== existing.providerId) {
          return res.status(403).json({ message: "You can only delete services assigned to you" });
        }
        const provStatus = (provider as any).status;
        if (provStatus !== "approved" && provStatus !== "active") {
          return res.status(403).json({
            message: "Your provider profile must be approved before you can manage services.",
          });
        }
        if ((existing as any).subServiceId) {
          return res.status(403).json({
            message: "This service is managed by Admin and cannot be deleted. You can pause it instead.",
          });
        }
      }
      const result = await storage.deleteService(req.params.id, { force });
      if ("soft" in result && result.soft) {
        return res.json({ ok: true, archived: true, message: existing ? `"${existing.name}" archived because past bookings reference it. Pricing history preserved.` : "Archived." });
      }
      res.status(204).end();
    } catch (error) {
      console.error("Delete service error:", error);
      res.status(400).json({ message: "Failed to delete service" });
    }
  });

  app.post("/api/services/:id/restore", authenticateToken, async (req: AuthRequest, res: Response) => {
    const svc = await storage.getService(req.params.id);
    if (!svc) return res.status(404).json({ message: "Not found" });
    if (!isAdminRole(req.user?.role)) {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider || provider.id !== svc.providerId) return res.status(403).json({ message: "Forbidden" });
    }
    const restored = await storage.restoreService(req.params.id);
    res.json(restored);
  });

  app.get("/api/services/:id/price-history", authenticateToken, async (req: AuthRequest, res: Response) => {
    const svc = await storage.getService(req.params.id);
    if (!svc) return res.status(404).json({ message: "Not found" });
    if (!isAdminRole(req.user?.role)) {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider || provider.id !== svc.providerId) return res.status(403).json({ message: "Forbidden" });
    }
    const history = await storage.getServicePriceHistory(req.params.id);
    res.json(history);
  });

  app.patch("/api/practitioners/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const existing = await db.select().from(practitioners).where(eq(practitioners.id, req.params.id)).limit(1);
      if (!existing.length) return res.status(404).json({ message: "Practitioner not found" });
      const prac = existing[0];
      const isAdmin = isAdminRole(req.user?.role);

      // Status changes (approve / reject) are admin-only.
      if ("status" in req.body && !isAdmin) {
        return res.status(403).json({ message: "Only admins can change practitioner status" });
      }

      // Non-admins can only update practitioners belonging to their own provider.
      if (!isAdmin) {
        const ownProvider = await storage.getProviderByUserId(req.user!.id);
        if (!ownProvider || prac.providerId !== ownProvider.id) {
          return res.status(403).json({ message: "You can only manage your own provider's practitioners" });
        }
      }

      const practitioner = await storage.updatePractitioner(req.params.id, req.body);
      res.json(practitioner);
    } catch (error) {
      res.status(400).json({ message: "Failed to update practitioner" });
    }
  });

  app.delete("/api/practitioners/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const existing = await db.select().from(practitioners).where(eq(practitioners.id, req.params.id)).limit(1);
      if (!existing.length) return res.status(404).json({ message: "Practitioner not found" });
      const prac = existing[0];
      const isAdmin = isAdminRole(req.user?.role);
      if (!isAdmin) {
        const ownProvider = await storage.getProviderByUserId(req.user!.id);
        if (!ownProvider || prac.providerId !== ownProvider.id) {
          return res.status(403).json({ message: "You can only manage your own provider's practitioners" });
        }
      }
      await storage.deletePractitioner(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(400).json({ message: "Failed to delete practitioner" });
    }
  });

  app.patch("/api/service-practitioners/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const guard = await assertOwnsServicePractitioner(req.params.id, req.user);
      if (!guard.ok) return res.status(guard.status!).json({ message: guard.message });
      const updates: any = {};
      if (req.body.fee !== undefined) updates.fee = req.body.fee;
      if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
      
      let sp;
      if (updates.fee !== undefined) {
        sp = await storage.updateServicePractitionerFee(req.params.id, updates.fee);
      }
      
      if (updates.isActive !== undefined) {
        const [updated] = await db.update(servicePractitioners)
          .set({ isActive: updates.isActive })
          .where(eq(servicePractitioners.id, req.params.id))
          .returning();
        sp = updated;
      }
      
      res.json(sp);
    } catch (error) {
      res.status(400).json({ message: "Failed to update assignment" });
    }
  });

  app.delete("/api/service-practitioners/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const guard = await assertOwnsServicePractitioner(req.params.id, req.user);
      if (!guard.ok) return res.status(guard.status!).json({ message: guard.message });
      await storage.removePractitionerFromService(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(400).json({ message: "Failed to remove assignment" });
    }
  });

  // Provider's own reviews list
  app.get("/api/reviews/provider/me", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider only" });
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const list = await storage.getReviewsByProvider(provider.id);
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "Failed to load reviews" });
    }
  });

  // Reply to a review
  app.patch("/api/reviews/:id/reply", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { reply } = req.body as { reply?: string };
      if (!reply || !reply.trim()) return res.status(400).json({ message: "Reply text required" });
      const review = await storage.getReview(req.params.id);
      if (!review) return res.status(404).json({ message: "Review not found" });
      if (!isAdminRole(req.user?.role)) {
        if (req.user?.role !== "provider") return res.status(403).json({ message: "Forbidden" });
        const provider = await storage.getProviderByUserId(req.user.id);
        if (!provider || provider.id !== review.providerId) {
          return res.status(403).json({ message: "Not your review" });
        }
      }
      const updated = await storage.replyToReview(req.params.id, reply.trim());
      // notify the patient via dispatcher (multi-channel + delivery logging)
      try {
        const provWithUser = await storage.getProviderWithUser(review.providerId);
        const provName = provWithUser ? `${provWithUser.user.firstName} ${provWithUser.user.lastName}` : "Your provider";
        notify.reviewReplied(review.patientId, {
          providerName: provName,
          reviewId: review.id,
        }).catch(err => console.error("[notify] reviewReplied", err));
      } catch (e) { console.error("[notify] reviewReplied dispatch failed:", e); }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to reply" });
    }
  });

  // Duplicate service — admin only (creates a brand-new service row).
  app.post("/api/services/:id/duplicate", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const src = await storage.getService(req.params.id);
      if (!src) return res.status(404).json({ message: "Service not found" });
      // Admins can duplicate any service; providers only their own.
      if (!isAdminRole(req.user?.role)) {
        const provider = await storage.getProviderByUserId(req.user!.id);
        if (!provider || provider.id !== src.providerId) {
          return res.status(403).json({ message: "You can only duplicate your own services" });
        }
      }
      const copy = await storage.duplicateService(req.params.id);
      res.status(201).json(copy);
    } catch (error) {
      res.status(500).json({ message: "Failed to duplicate service" });
    }
  });

  // ── GET /api/provider/week-slots-summary ────────────────────────────────────
  // Returns per-day slot counts (total / booked / available) for a given week.
  // Used by the week navigator badge display in the provider availability UI.
  app.get("/api/provider/week-slots-summary", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: "Provider only" });
      }
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });

      const { weekStart } = req.query as { weekStart?: string };
      if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
        return res.status(400).json({ message: "weekStart (YYYY-MM-DD) required" });
      }
      // Compute Sunday of that week
      const ws = new Date(weekStart + "T00:00:00");
      ws.setDate(ws.getDate() + 6);
      const weekEnd = `${ws.getFullYear()}-${String(ws.getMonth() + 1).padStart(2, "0")}-${String(ws.getDate()).padStart(2, "0")}`;

      const { rows } = await pool.query<{
        date: string; total: string; booked: string; available: string;
      }>(
        `SELECT
           date::text                                                    AS date,
           COUNT(*)::text                                                AS total,
           COUNT(*) FILTER (WHERE is_booked = true)::text               AS booked,
           COUNT(*) FILTER (WHERE is_booked = false AND is_blocked = false)::text AS available
         FROM time_slots
        WHERE provider_id = $1
          AND date::date >= $2::date
          AND date::date <= $3::date
        GROUP BY date
        ORDER BY date`,
        [provider.id, weekStart, weekEnd],
      );

      const dayKeyMap: Record<number, string> = { 0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat" };
      const days = rows.map((r) => ({
        date: r.date,
        dayKey: dayKeyMap[new Date(r.date + "T00:00:00").getDay()] ?? "mon",
        total: Number(r.total),
        booked: Number(r.booked),
        available: Number(r.available),
      }));

      res.json({
        weekStart,
        weekEnd,
        totalSlots:     rows.reduce((s, r) => s + Number(r.total), 0),
        bookedSlots:    rows.reduce((s, r) => s + Number(r.booked), 0),
        availableSlots: rows.reduce((s, r) => s + Number(r.available), 0),
        days,
      });
    } catch (error) {
      console.error("[week-slots-summary] error:", error);
      res.status(500).json({ message: "Failed to get week summary" });
    }
  });

  // ── DELETE /api/availability/range ─────────────────────────────────────────
  // Safe range purge: removes only unbooked, unheld slots. Booked or actively-
  // held slots are preserved. Must be registered BEFORE bulk/* catch-alls.
  app.delete("/api/availability/range", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: "Provider only" });
      }
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });

      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
      if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        return res.status(400).json({ message: "startDate and endDate (YYYY-MM-DD) required" });
      }
      if (startDate > endDate) {
        return res.status(400).json({ message: "startDate must be <= endDate" });
      }

      const result = await storage.deleteSlotsByRange(provider.id, startDate, endDate);
      res.json(result);
    } catch (error) {
      console.error("[DELETE /api/availability/range] error:", error);
      res.status(500).json({ message: "Failed to delete slots" });
    }
  });

  // ── POST /api/availability/clone ────────────────────────────────────────────
  // Clone all unbooked/unheld slot structures from a source week to a target
  // week. Applies the Safe Override primitive: clears unprotected target slots
  // first, then bulk-inserts the shifted copies with ON CONFLICT DO NOTHING so
  // booked/held target slots are never disturbed.
  app.post("/api/availability/clone", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: "Provider only" });
      }
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });

      const { sourceWeekStartDate, targetWeekStartDate } = req.body as {
        sourceWeekStartDate?: string;
        targetWeekStartDate?: string;
      };
      if (
        !sourceWeekStartDate || !targetWeekStartDate ||
        !/^\d{4}-\d{2}-\d{2}$/.test(sourceWeekStartDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(targetWeekStartDate)
      ) {
        return res.status(400).json({ message: "sourceWeekStartDate and targetWeekStartDate (YYYY-MM-DD) required" });
      }
      if (sourceWeekStartDate === targetWeekStartDate) {
        return res.status(400).json({ message: "Source and target weeks must differ" });
      }

      const providerId = provider.id;

      // Compute start/end of source week (7 days)
      const srcStart = sourceWeekStartDate;
      const srcEnd = (() => {
        const d = new Date(sourceWeekStartDate);
        d.setDate(d.getDate() + 6);
        return d.toISOString().slice(0, 10);
      })();

      // Compute target week end
      const tgtStart = targetWeekStartDate;
      const tgtEnd = (() => {
        const d = new Date(targetWeekStartDate);
        d.setDate(d.getDate() + 6);
        return d.toISOString().slice(0, 10);
      })();

      // Day delta (in calendar days) between the two week starts
      const srcMs = new Date(sourceWeekStartDate).getTime();
      const tgtMs = new Date(targetWeekStartDate).getTime();
      const deltaDays = Math.round((tgtMs - srcMs) / 86_400_000);

      // Fetch source week unbooked, unheld slot structures.
      // appointment_slot_holds has no time_slot_id — match by date+time.
      const { rows: sourceRows } = await pool.query<{
        date: string; startTime: string; endTime: string;
      }>(
        `SELECT date::text, start_time AS "startTime", end_time AS "endTime"
           FROM time_slots
          WHERE provider_id = $1
            AND date::date >= $2::date
            AND date::date <= $3::date
            AND is_booked = false
            AND NOT EXISTS (
              SELECT 1 FROM appointment_slot_holds ash
              WHERE  ash.provider_id = time_slots.provider_id
                AND  ash.date        = time_slots.date
                AND  ash.start_time  = time_slots.start_time
                AND  ash.end_time    = time_slots.end_time
                AND  ash.expires_at  > NOW()
            )`,
        [providerId, srcStart, srcEnd],
      );

      if (sourceRows.length === 0) {
        return res.json({ clonedCount: 0, skippedCount: 0, clearedCount: 0 });
      }

      // Step 1 — Safe-purge target week (preserve booked/held slots)
      const clearResult = await storage.deleteSlotsByRange(providerId, tgtStart, tgtEnd);

      // Step 2 — Shift source dates by deltaDays and bulk-insert
      const toInsert = sourceRows.map((r) => {
        const d = new Date(r.date);
        d.setDate(d.getDate() + deltaDays);
        const newDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        return {
          providerId,
          date: newDate,
          startTime: r.startTime,
          endTime: r.endTime,
          isBooked: false,
          isBlocked: false,
        };
      });

      const inserted = await storage.bulkCreateTimeSlots(toInsert as any);

      res.status(201).json({
        clonedCount: inserted.length,
        skippedCount: toInsert.length - inserted.length,
        clearedCount: clearResult.deletedCount,
        preservedInTarget: clearResult.preservedCount,
      });
    } catch (error) {
      console.error("[POST /api/availability/clone] error:", error);
      res.status(500).json({ message: "Failed to clone week" });
    }
  });

  // Slot-conflict preview — must be registered BEFORE /api/availability/bulk (Express first-match)
  app.post("/api/availability/bulk/preview", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: "Provider only" });
      }
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider && !isAdminRole(req.user?.role)) {
        return res.status(404).json({ message: "Provider not found" });
      }
      const { dates, slots } = req.body as {
        dates: string[];
        slots: { startTime: string; endTime: string }[];
      };
      if (!Array.isArray(dates) || dates.length === 0 || !Array.isArray(slots) || slots.length === 0) {
        return res.status(400).json({ message: "dates and slots required" });
      }
      const providerId = provider!.id;
      const { rows } = await pool.query<{ date: string; count: string }>(
        `SELECT date::text, COUNT(*)::text AS count
           FROM time_slots
          WHERE provider_id = $1
            AND date::date = ANY($2::date[])
            AND is_blocked = false
          GROUP BY date`,
        [providerId, dates],
      );
      const existingByDate: Record<string, number> = {};
      for (const row of rows) {
        existingByDate[row.date] = Number(row.count);
      }
      const summary = dates.map((date) => ({
        date,
        existingCount: existingByDate[date] ?? 0,
        newSlotsCount: slots.length,
        hasConflict: (existingByDate[date] ?? 0) > 0,
      }));
      res.json({
        summary,
        totalConflicts: summary.filter((s) => s.hasConflict).length,
        totalDates: dates.length,
        totalNewSlots: dates.length * slots.length,
      });
    } catch (error) {
      console.error("[availability/bulk/preview] error:", error);
      res.status(500).json({ message: "Failed to preview slots" });
    }
  });

  // Bulk availability (weekly slot generator)
  app.post("/api/availability/bulk", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: "Provider only" });
      }
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider && !isAdminRole(req.user?.role)) {
        return res.status(404).json({ message: "Provider not found" });
      }
      const { dates, slots, replaceExisting } = req.body as {
        dates: string[];
        slots: { startTime: string; endTime: string }[];
        replaceExisting?: boolean;
      };
      if (!Array.isArray(dates) || dates.length === 0 || !Array.isArray(slots) || slots.length === 0) {
        return res.status(400).json({ message: "dates and slots required" });
      }
      const providerId = provider!.id;
      if (replaceExisting) {
        // Safe Override: clear only unbooked/unheld slots in the requested dates
        // so that any active bookings or holds survive the override.
        const minDate = dates.slice().sort()[0];
        const maxDate = dates.slice().sort().reverse()[0];
        await storage.deleteSlotsByRange(providerId, minDate, maxDate);
      }
      // ── Generative matrix slicer ────────────────────────────────────────────
      // Each incoming slot is a time *window* (e.g. 08:00–22:00).  Instead of
      // inserting the whole window as one marathon row we walk through it in
      // 30-minute steps and emit one independent bookable row per chunk.
      // This is the fix for the "Timeline Marathon Bug".
      const SLOT_STEP_MINS = 30;
      const minsToTime = (m: number) =>
        `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const timeToMins = (t: string) => {
        const [h, min] = t.split(":").map(Number);
        return (h ?? 0) * 60 + (min ?? 0);
      };

      const toCreate = dates.flatMap((rawDate) => {
        // Local-date normalisation — parse YYYY-MM-DD with local calendar
        // parameters so UTC midnight never shifts the date back one day.
        const [fy, fm, fd] = rawDate.split("-").map(Number);
        const d = new Date(fy!, (fm! - 1), fd!);
        const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

        return slots.flatMap((s) => {
          const endMins = timeToMins(s.endTime);
          const chunks: { providerId: string; date: string; startTime: string; endTime: string; isBooked: boolean; isBlocked: boolean }[] = [];
          let cursor = timeToMins(s.startTime);
          while (cursor + SLOT_STEP_MINS <= endMins) {
            chunks.push({
              providerId,
              date,
              startTime: minsToTime(cursor),
              endTime: minsToTime(cursor + SLOT_STEP_MINS),
              isBooked: false,
              isBlocked: false,
            });
            cursor += SLOT_STEP_MINS;
          }
          return chunks;
        });
      });
      const created = await storage.bulkCreateTimeSlots(toCreate as any);
      res.status(201).json({ count: created.length });
    } catch (error) {
      console.error("[availability/bulk] error:", error);
      res.status(500).json({ message: "Failed to create slots" });
    }
  });

  // Edit non-lifecycle appointment fields (notes / privateNote only).
  // Lifecycle changes (date/time, status) MUST go through:
  //   POST /api/appointments/:id/action       (cancel / reschedule / no_show)
  //   PATCH /api/appointments/:id/status      (approve / confirm / start / complete)
  // ── POST /api/provider/submit-review ─────────────────────────────────────
  // Strict compliance gate: validates required clinical fields then advances
  // status to pending_approval. Separate from /setup so providers can save
  // drafts freely before committing to admin review.
  app.post("/api/provider/submit-review", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider") {
        return res.status(403).json({ message: "Provider access required" });
      }
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) {
        return res.status(404).json({ message: "Provider profile not found. Complete the setup form first." });
      }

      // Merge existing row + submitted body for validation — allows partial submissions
      // that build on already-saved draft data.
      const merged = { ...provider, ...req.body };

      const submitSchema = z.object({
        providerCategory: z.string().min(1, "Provider category is required — select one in Profile → Professional Info"),
        specialization: z.string().min(1, "Specialization is required — select one in Profile → Professional Info"),
        licensingAuthority: z.string().min(1, "Licensing authority is required"),
        licenseNumber: z.string().min(1, "License number is required"),
        bio: z.string().min(20, "Bio must be at least 20 characters"),
        providerAgreementAccepted: z.literal(true, {
          errorMap: () => ({ message: "Provider agreement must be accepted" }),
        }),
        dataProcessingAgreementAccepted: z.literal(true, {
          errorMap: () => ({ message: "Data processing agreement must be accepted" }),
        }),
      });

      const parsed = submitSchema.safeParse(merged);
      if (!parsed.success) {
        const fieldErrors = parsed.error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        }));
        return res.status(400).json({
          message: "Some required fields are missing: " + fieldErrors.map((e) => e.message).join("; "),
          errors: fieldErrors,
        });
      }

      // ── KYC gate: all 4 mandatory documents must be uploaded before review ──
      const kycDocs = await storage.getProviderDocuments(provider.id);
      const uploadedTypes = kycDocs.map((d) => d.documentType);
      const requiredKyc = [
        { type: "medical_license", label: "Medical / Professional Practising Licence" },
        { type: "degree",          label: "Primary Medical Degree / Professional Qualification" },
        { type: "id_card",         label: "Government-Issued Photo Identification" },
        { type: "address_proof",   label: "Proof of Residential Address" },
      ];
      const missingKyc = requiredKyc.filter((d) => !uploadedTypes.includes(d.type));
      if (missingKyc.length > 0) {
        return res.status(400).json({
          message: "Required KYC documents missing — please upload them before submitting for review.",
          errors: missingKyc.map((d) => ({
            field: `kyc.${d.type}`,
            message: `${d.label} must be uploaded`,
          })),
          missingDocuments: missingKyc.map((d) => d.type),
        });
      }

      // ── Currency gate — provider must explicitly set their practice currency ─
      const submittingUser = await storage.getUser(req.user.id);
      if (!submittingUser?.preferredCurrency) {
        return res.status(400).json({
          message: "Practice currency must be set before submitting for review.",
          errors: [{ field: "preferredCurrency", message: "Select your practice currency in Profile → Professional Information before submitting" }],
        });
      }

      // ── Mobile number gate (WS1) ──────────────────────────────────────────
      // A valid mobile number on the user account is required before submission.
      if (!submittingUser?.mobileNumber || submittingUser.mobileNumber.trim().length < 7) {
        return res.status(400).json({
          message: "A valid mobile number is required before submitting for review.",
          errors: [{ field: "mobileNumber", message: "Add a mobile number in the Credential Verification section before submitting" }],
        });
      }

      // ── Workplace gate (WS2) — required when clinic_visit is enabled ───────
      if (Array.isArray(merged.serviceModes) && merged.serviceModes.includes("clinic_visit")) {
        const missingWorkplace: Array<{ field: string; message: string }> = [];
        if (!merged.primaryServiceLocation && !merged.clinicFormattedAddress) {
          missingWorkplace.push({ field: "primaryServiceLocation", message: "Workplace / clinic address is required for clinic visit providers (set in Practice Logistics)" });
        }
        if (!merged.city) {
          missingWorkplace.push({ field: "city", message: "City is required for clinic visit providers" });
        }
        if (!merged.country) {
          missingWorkplace.push({ field: "country", message: "Country is required for clinic visit providers" });
        }
        if (missingWorkplace.length > 0) {
          return res.status(400).json({
            message: "Clinic visit providers must complete their workplace details before submitting for review.",
            errors: missingWorkplace,
          });
        }
      }

      // Save any body fields that arrived alongside the submission, then flip status.
      // licenseExpiryDate arrives as a string from the form — coerce to Date so
      // Drizzle's PgTimestamp.mapToDriverValue can call .toISOString() on it.
      const { ...bodyData } = req.body;
      if (bodyData.licenseExpiryDate instanceof Date) {
        if (isNaN(bodyData.licenseExpiryDate.getTime())) {
          delete bodyData.licenseExpiryDate;
        }
      } else if (typeof bodyData.licenseExpiryDate === "string" && bodyData.licenseExpiryDate.trim() !== "") {
        const parsed = new Date(bodyData.licenseExpiryDate);
        if (!isNaN(parsed.getTime())) {
          bodyData.licenseExpiryDate = parsed;
        } else {
          delete bodyData.licenseExpiryDate;
        }
      } else {
        delete bodyData.licenseExpiryDate;
      }
      const isResubmission = ["submitted", "pending_approval", "action_required"].includes(provider.status ?? "");
      await storage.updateProvider(provider.id, {
        ...bodyData,
        status: "submitted",
        rejectionReason: null,
        profileUpdatedAfterSubmission: false,
        ...(isResubmission
          ? { lastResubmittedAt: new Date() }
          : { submittedAt: new Date() }),
      } as any);

      providerListCache.clear();
      providerSearchCache.clear();
      invalidateAuthCache(req.user.id);

      res.json({ message: "Profile submitted for review successfully", status: "submitted" });
    } catch (error: any) {
      console.error("[POST /api/provider/submit-review] error:", error);
      res.status(500).json({ message: error.message || "Failed to submit for review" });
    }
  });

  // ── POST /api/provider/verify-mobile/send ────────────────────────────────
  // Stubs OTP dispatch for mobile number verification.
  // Responds with 503 until a real SMS provider (Twilio) is configured.
  app.post("/api/provider/verify-mobile/send", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider") {
        return res.status(403).json({ message: "Provider access required" });
      }
      const { mobileNumber } = req.body;
      if (!mobileNumber || typeof mobileNumber !== "string" || mobileNumber.trim().length < 7) {
        return res.status(400).json({ message: "A valid mobile number is required" });
      }

      const hasTwilio =
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_FROM_NUMBER;

      if (!hasTwilio) {
        return res.status(503).json({
          message: "SMS verification is not yet configured on this server. Your number has been saved and will be verified when this feature is enabled.",
          smsConfigured: false,
        });
      }

      // When Twilio is configured: generate and dispatch an OTP here.
      // (Implementation pending SMS provider integration)
      return res.status(503).json({ message: "SMS verification not yet active", smsConfigured: false });
    } catch (error: any) {
      console.error("[POST /api/provider/verify-mobile/send] error:", error);
      res.status(500).json({ message: "Failed to send verification code" });
    }
  });

  // ── POST /api/provider/verify-mobile/confirm ─────────────────────────────
  // Stubs OTP confirmation. Returns 503 until SMS provider is live.
  app.post("/api/provider/verify-mobile/confirm", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider") {
        return res.status(403).json({ message: "Provider access required" });
      }
      return res.status(503).json({
        message: "SMS verification is not yet configured. This endpoint will become active once an SMS provider is connected.",
        smsConfigured: false,
      });
    } catch (error: any) {
      console.error("[POST /api/provider/verify-mobile/confirm] error:", error);
      res.status(500).json({ message: "Failed to confirm verification code" });
    }
  });

  app.post("/api/provider/setup", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { practitioners, ...providerData } = req.body;
      const userId = req.user!.id;

      // The form sends `type` for provider classification but the DB column is
      // `providerType`. Map it here so Drizzle's `.set()` picks it up correctly.
      if (providerData.type !== undefined) {
        providerData.providerType = providerData.type;
        delete providerData.type;
      }

      // ── Provider type change gate for approved providers ──────────────────
      // Once a provider is approved/active, changing providerType requires going
      // through POST /api/provider/request-type-change for admin approval.
      // Pre-approval states (draft, pending_approval, action_required, etc.)
      // can freely change their type through the normal setup flow.
      const APPROVED_STATES = ["approved", "active"];
      const existingForTypeCheck = await storage.getProviderByUserId(userId).catch(() => null);
      if (
        providerData.providerType !== undefined &&
        existingForTypeCheck &&
        APPROVED_STATES.includes((existingForTypeCheck as any).status ?? "") &&
        providerData.providerType !== (existingForTypeCheck as any).providerType
      ) {
        return res.status(400).json({
          message: "Your provider type cannot be changed directly after approval. Please use the 'Request Type Change' option in your Professional profile — an admin will review and approve your request.",
          code: "TYPE_CHANGE_REQUIRES_APPROVAL",
        });
      }

      // ── Category / specialization change gate for approved providers ───────
      // providerCategory / providerSubcategory / specialization are locked once
      // the provider is in an approved/active/suspended/deactivated state.
      // Changes require going through POST /api/provider/request-category-change
      // for admin review.
      const CATEGORY_LOCKED_STATES = ["approved", "active", "suspended", "deactivated"];
      if (
        existingForTypeCheck &&
        CATEGORY_LOCKED_STATES.includes((existingForTypeCheck as any).status ?? "")
      ) {
        if (providerData.providerCategory !== undefined || providerData.providerSubcategory !== undefined) {
          return res.status(400).json({
            message: "Your category cannot be changed directly after approval. Use 'Request Category Change' in your profile — an admin will review your request.",
            code: "CATEGORY_CHANGE_REQUIRES_APPROVAL",
          });
        }
        if (
          providerData.specialization !== undefined &&
          providerData.specialization !== (existingForTypeCheck as any).specialization
        ) {
          return res.status(400).json({
            message: "Your specialization cannot be changed directly after approval. Use 'Request Category Change' in your profile to request a specialization update.",
            code: "SPECIALIZATION_CHANGE_REQUIRES_APPROVAL",
          });
        }
      }

      // Auto-derive providerType slug from providerCategory display name.
      // This keeps provider_type (slug) authoritative and in sync whenever the
      // provider saves their category during onboarding or profile editing.
      // Only runs for pre-approval providers; post-approval changes must go
      // through POST /api/provider/request-category-change.
      const CATEGORY_NAME_TO_SLUG: Record<string, string> = {
        "Medical Doctors & Specialists":               "physician",
        "Mental Health & Behavioral Professionals":    "mental_health",
        "Nutrition, Dietetics & Metabolic Wellness":   "nutrition",
        "Physical Therapy & Rehabilitation":           "rehabilitation",
        "Dental Care Professionals":                   "dental",
        "Alternative, Holistic & Integrative Medicine":"alternative_medicine",
        "Maternal, Nursing & Allied Health Support":   "nursing",
      };
      if (
        providerData.providerCategory !== undefined &&
        providerData.providerType === undefined &&
        !APPROVED_STATES.includes((existingForTypeCheck as any)?.status ?? "")
      ) {
        const derivedSlug = CATEGORY_NAME_TO_SLUG[providerData.providerCategory as string];
        if (derivedSlug) {
          providerData.providerType = derivedSlug;
        }
      }

      // The licenseExpiryDate column is a Drizzle pg `timestamp`, which expects
      // a JS Date instance — Drizzle calls .toISOString() on it. Coerce strings
      // (from the form) into Date objects, and drop empty / invalid values.
      if (providerData.licenseExpiryDate instanceof Date) {
        if (isNaN(providerData.licenseExpiryDate.getTime())) {
          delete providerData.licenseExpiryDate;
        }
      } else if (
        typeof providerData.licenseExpiryDate === "string" &&
        providerData.licenseExpiryDate.trim() !== ""
      ) {
        const parsed = new Date(providerData.licenseExpiryDate);
        if (!isNaN(parsed.getTime())) {
          providerData.licenseExpiryDate = parsed;
        } else {
          delete providerData.licenseExpiryDate;
        }
      } else {
        delete providerData.licenseExpiryDate;
      }

      const existingProvider = await storage.getProviderByUserId(userId);

      // Block editing only for suspended/deactivated providers.
      // Approved providers can freely update their profile info.
      // pending_approval, action_required, and rejected also allow edits so
      // providers can correct issues and resubmit without contacting support.
      const currentStatus = (existingProvider as any)?.status ?? "draft";
      const hardLocked = existingProvider && ["suspended", "deactivated"].includes(currentStatus);
      if (hardLocked) {
        return res.status(403).json({
          message: "Your profile is locked in its current state. Contact support if you need to make changes.",
          code: "PROFILE_LOCKED",
        });
      }
      // Track that provider edited while under review — admin will see the flag
      const wasUnderReview = existingProvider && ["submitted", "pending_approval", "under_review", "action_required"].includes(currentStatus);

      let provider;
      if (existingProvider) {
        // Save draft data — status is NOT advanced automatically here.
        // Providers explicitly call POST /api/provider/submit-review to move to
        // pending_approval once they are ready for compliance review.
        provider = await storage.updateProvider(existingProvider.id, {
          ...providerData,
          userId,
          ...(wasUnderReview ? { profileUpdatedAfterSubmission: true } : {}),
        } as any);
      } else {
        // Create new provider profile in draft state.
        // The /verify-email hook auto-seeds this row so this branch is only
        // reached if the user somehow arrived here without a row.
        provider = await storage.createProvider({
          ...providerData,
          userId,
          status: "draft",
          isVerified: false,
          isActive: true,
          countryCode: req.user!.countryCode || "HU",
        } as any);
      }

      // Only upgrade role on first-time setup to avoid redundant writes on
      // every subsequent "Save" press from the provider dashboard.
      if (req.user!.role !== "provider") {
        await storage.updateUser(userId, { role: "provider" });
      }
      // If a timezone was submitted via the setup form, store it on the user
      // row (single authority) rather than on providers.timezone (deprecated).
      if (providerData.timezone !== undefined) {
        await storage.updateUser(userId, { timezone: providerData.timezone });
      }
      invalidateAuthCache(userId);
      // Invalidate provider list/search caches so the new/updated provider appears
      providerListCache.clear();
      providerSearchCache.clear();

      // Write practitioners to the primary `practitioners` table
      // (replacing the legacy medical_practitioners path).
      if (practitioners && Array.isArray(practitioners)) {
        for (const p of practitioners) {
          if (p.name && p.name.trim() !== "") {
            await storage.createPractitioner({
              name: p.name,
              title: p.title || null,
              specialization: p.specialization || "",
              bio: p.bio || null,
              photoUrl: p.photoUrl || null,
              yearsExperience: p.yearsExperience ?? p.experience ?? 0,
              languages: Array.isArray(p.languages) ? p.languages : [],
              providerId: provider!.id,
              status: "pending",
              isVerified: false,
            } as any);
          }
        }
      }

      // ── Sync medical_license → provider_documents (canonical verification record) ──
      // The onboarding wizard uploads the license to provider_credentials and saves the
      // URL to providers.license_document_url.  We mirror it into provider_documents so
      // the admin document queue, verification state machine, Provider 360, and Provider
      // KYC dashboard all read from the same canonical source of truth.
      if (providerData.licenseDocumentUrl && typeof providerData.licenseDocumentUrl === "string") {
        try {
          const licenseUrl = providerData.licenseDocumentUrl as string;
          const providerId = (provider as any).id;
          const { rows: existing } = await pool.query<{ id: string; verification_status: string }>(
            `SELECT id, verification_status FROM provider_documents
              WHERE provider_id = $1 AND document_type = 'medical_license'
              ORDER BY created_at DESC LIMIT 1`,
            [providerId],
          );
          if (existing.length === 0) {
            // First upload — create the canonical document record
            await pool.query(
              `INSERT INTO provider_documents
                 (id, provider_id, document_type, document_url, verification_status, document_criticality, expiry_required, created_at)
               VALUES (gen_random_uuid()::text, $1, 'medical_license', $2, 'pending', 'mandatory', true, NOW())`,
              [providerId, licenseUrl],
            );
          } else if (!["approved", "under_review"].includes(existing[0].verification_status)) {
            // Re-upload: update the URL but do NOT overwrite a positive admin decision
            await pool.query(
              `UPDATE provider_documents SET document_url = $1 WHERE id = $2`,
              [licenseUrl, existing[0].id],
            );
          }
        } catch (docSyncErr: any) {
          // Non-fatal — log and continue; the license URL is already on providers table
          console.warn("[provider/setup] medical_license doc sync:", docSyncErr.message);
        }
      }

      res.status(200).json(provider);
    } catch (error: any) {
      console.error("Provider setup error:", error);
      res.status(500).json({ message: error.message || "Failed to setup provider profile" });
    }
  });

  // ============ PROVIDER SERVICES & PRACTITIONERS ============
  app.get("/api/providers/:providerId/services", async (req, res) => {
    try {
      const providerServices = await storage.getServicesByProvider(req.params.providerId);
      res.json(providerServices);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch services" });
    }
  });

  app.get("/api/services/:serviceId/practitioners", async (req, res) => {
    try {
      const servicePractitioners = await storage.getServicePractitioners(req.params.serviceId);
      res.json(servicePractitioners);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch service practitioners" });
    }
  });

  app.post("/api/practitioners", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      const data = insertPractitionerSchema.parse({ ...req.body, providerId: provider.id });
      const practitioner = await storage.createPractitioner(data);
      res.status(201).json(practitioner);
    } catch (error) {
      res.status(400).json({ message: "Invalid practitioner data" });
    }
  });

  app.post("/api/service-practitioners", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const data = insertServicePractitionerSchema.parse(req.body);

      // Ownership: the service AND the practitioner must both belong to the
      // requesting provider (or the caller must be admin).
      if (!isAdminRole(req.user?.role)) {
        const provider = await storage.getProviderByUserId(req.user!.id);
        if (!provider) return res.status(403).json({ message: "Unauthorized" });

        const svc = await storage.getService(data.serviceId);
        if (!svc) return res.status(404).json({ message: "Service not found" });
        if (svc.providerId !== provider.id) {
          return res.status(403).json({ message: "You can only assign practitioners to your own services" });
        }
        const pract = await storage.getPractitioner(data.practitionerId);
        if (!pract) return res.status(404).json({ message: "Practitioner not found" });
        if (pract.providerId !== provider.id) {
          return res.status(403).json({ message: "You can only assign your own practitioners" });
        }
      }

      const result = await storage.addPractitionerToService(data);
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ message: "Invalid assignment data" });
    }
  });

  // Helper: confirm the requesting user owns the service that a service-practitioner row belongs to.
  async function assertOwnsServicePractitioner(spId: string, user: AuthRequest["user"]): Promise<{ ok: boolean; status?: number; message?: string }> {
    if (isAdminRole(user?.role)) return { ok: true };
    const rows = await db.select().from(servicePractitioners).where(eq(servicePractitioners.id, spId)).limit(1);
    if (rows.length === 0) return { ok: false, status: 404, message: "Assignment not found" };
    const svc = await storage.getService(rows[0].serviceId);
    if (!svc) return { ok: false, status: 404, message: "Service not found" };
    const provider = await storage.getProvider(svc.providerId);
    if (!provider || provider.userId !== user?.id) {
      return { ok: false, status: 403, message: "You can only manage assignments for your own services" };
    }
    return { ok: true };
  }

  // Fetch service assignments for a practitioner (with service details)
  app.get("/api/practitioners/:id/services", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const assignments = await storage.getPractitionerServices(req.params.id);
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch practitioner services" });
    }
  });

  // ── Practitioner Schedule: GET/PUT ─────────────────────────────────────────
  // Returns the active weekly schedule for a practitioner (null if none set).
  app.get("/api/practitioners/:id/schedule", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const practitioner = await storage.getPractitioner(req.params.id);
      if (!practitioner) return res.status(404).json({ message: "Practitioner not found" });
      const schedule = await storage.getPractitionerSchedule(req.params.id);
      res.json(schedule ?? null);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch practitioner schedule" });
    }
  });

  // Upserts the active weekly schedule for a practitioner.
  // Provider can only update their own practitioners; admins can update any.
  app.put("/api/practitioners/:id/schedule", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const practitioner = await storage.getPractitioner(req.params.id);
      if (!practitioner) return res.status(404).json({ message: "Practitioner not found" });
      if (!isAdminRole(req.user?.role)) {
        const myProvider = await storage.getProviderByUserId(req.user!.id);
        if (!myProvider || myProvider.id !== practitioner.providerId) {
          return res.status(403).json({ message: "You can only manage your own practitioners" });
        }
      }
      const { weeklySchedule } = req.body;
      if (!weeklySchedule || typeof weeklySchedule !== "object") {
        return res.status(400).json({ message: "weeklySchedule is required" });
      }
      const saved = await storage.upsertPractitionerSchedule(req.params.id, weeklySchedule);
      res.json(saved);
    } catch (error) {
      console.error("[practitioner-schedule] PUT error:", error);
      res.status(500).json({ message: "Failed to save practitioner schedule" });
    }
  });

  // ── Practitioner Blocks: POST ──────────────────────────────────────────────
  // Creates a provider_block row scoped to a specific practitioner (leave/break).
  app.post("/api/practitioners/:id/blocks", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const practitioner = await storage.getPractitioner(req.params.id);
      if (!practitioner) return res.status(404).json({ message: "Practitioner not found" });
      if (!isAdminRole(req.user?.role)) {
        const myProvider = await storage.getProviderByUserId(req.user!.id);
        if (!myProvider || myProvider.id !== practitioner.providerId) {
          return res.status(403).json({ message: "You can only manage your own practitioners" });
        }
      }
      const { startDatetime, endDatetime, blockType, reason } = req.body;
      if (!startDatetime || !endDatetime) {
        return res.status(400).json({ message: "startDatetime and endDatetime are required" });
      }
      const result = await pool.query(
        `INSERT INTO provider_blocks (provider_id, practitioner_id, block_type, reason, start_datetime, end_datetime)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [practitioner.providerId, req.params.id, blockType ?? "leave", reason ?? null, startDatetime, endDatetime],
      );
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("[practitioner-blocks] POST error:", error);
      res.status(500).json({ message: "Failed to create practitioner block" });
    }
  });

  // List blocks scoped to a practitioner.
  app.get("/api/practitioners/:id/blocks", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const practitioner = await storage.getPractitioner(req.params.id);
      if (!practitioner) return res.status(404).json({ message: "Practitioner not found" });
      if (!isAdminRole(req.user?.role)) {
        const myProvider = await storage.getProviderByUserId(req.user!.id);
        if (!myProvider || myProvider.id !== practitioner.providerId) {
          return res.status(403).json({ message: "You can only view your own practitioners" });
        }
      }
      const result = await pool.query(
        `SELECT * FROM provider_blocks WHERE practitioner_id = $1 ORDER BY start_datetime DESC`,
        [req.params.id],
      );
      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch practitioner blocks" });
    }
  });

  // ── Practitioner Utilization ───────────────────────────────────────────────
  // Returns appointment counts per practitioner for a provider.
  app.get("/api/providers/:id/practitioner-utilization", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!isAdminRole(req.user?.role)) {
        const myProvider = await storage.getProviderByUserId(req.user!.id);
        if (!myProvider || myProvider.id !== req.params.id) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      const { from, to } = req.query as { from?: string; to?: string };
      const fromDate = from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const toDate = to ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result = await pool.query(
        `SELECT
           p.id            AS practitioner_id,
           p.name          AS practitioner_name,
           p.specialization,
           p.photo_url,
           p.status,
           COUNT(a.id)     AS total_appointments,
           COUNT(a.id) FILTER (WHERE a.status IN ('pending','approved','confirmed'))  AS upcoming,
           COUNT(a.id) FILTER (WHERE a.status = 'completed')                         AS completed
         FROM practitioners p
         LEFT JOIN appointments a
           ON a.practitioner_id = p.id
           AND a.date BETWEEN $2 AND $3
         WHERE p.provider_id = $1
         GROUP BY p.id, p.name, p.specialization, p.photo_url, p.status
         ORDER BY p.name`,
        [req.params.id, fromDate, toDate],
      );
      res.json(result.rows);
    } catch (error) {
      console.error("[practitioner-utilization] error:", error);
      res.status(500).json({ message: "Failed to fetch utilization" });
    }
  });

  // Authenticated provider: fetch own practitioners
  app.get("/api/provider/practitioners", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider access required" });
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const list = await storage.getPractitionersByProvider(provider.id);
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch practitioners" });
    }
  });

  // Services — providers can create their own; admins can create for any provider.
  app.post("/api/services", authenticateToken, async (req: AuthRequest, res) => {
    try {
      let provider: any;
      if (isAdminRole(req.user?.role)) {
        // Admin path: providerId must be supplied in the body.
        const pid = req.body?.providerId;
        if (!pid) return res.status(400).json({ message: "providerId is required" });
        provider = await storage.getProvider(pid);
        if (!provider) return res.status(404).json({ message: "Provider not found" });
        const provCountry = (provider as any).countryCode as CountryCode | undefined;
        if (!canAccessCountry(req.user!, provCountry)) {
          return res.status(404).json({ message: "Provider not found" });
        }
      } else {
        // Provider path: inject their own providerId automatically.
        provider = await storage.getProviderByUserId(req.user!.id);
        if (!provider) return res.status(403).json({ message: "Provider profile not found" });
        // Only approved providers may create services.
        const provStatus = (provider as any).status;
        if (provStatus !== "approved" && provStatus !== "active") {
          return res.status(403).json({
            message: "Your provider profile must be approved before you can manage services. Complete your onboarding and submit for review.",
          });
        }
      }
      const provCountry = (provider as any).countryCode as CountryCode | undefined;
      // Prevent duplicate services: same provider + same name (case-insensitive) + not deleted
      if (!isAdminRole(req.user?.role)) {
        const serviceName = req.body?.name;
        if (serviceName) {
          const dupSvc = await pool.query(
            `SELECT id FROM services WHERE provider_id = $1 AND LOWER(name) = LOWER($2) AND deleted_at IS NULL LIMIT 1`,
            [provider.id, String(serviceName).slice(0, 200)]
          );
          if (dupSvc.rows[0]) {
            return res.status(409).json({ message: "You already have a service with this name. Please edit the existing service or choose a different name." });
          }
        }
      }
      const body = { ...req.body, providerId: provider.id };
      // Guard: reject USD-labelled prices and USD-scale amounts for HU/IR providers.
      try {
        assertNativeCurrency(req.body?.currency, req.body?.price, provCountry);
      } catch (e) {
        if (e instanceof ServiceCurrencyError) {
          return res.status(422).json({ message: e.message });
        }
        throw e;
      }
      const data = insertServiceSchema.parse(body);
      // Inline the native currency so there is no window where currency = 'USD'.
      const _svcCurrency = provCountry === 'HU' ? 'HUF' : provCountry === 'IR' ? 'IRR' : 'USD';
      const service = await storage.createService({ ...data, countryCode: provCountry, currency: _svcCurrency } as any);
      (service as any).currency = _svcCurrency;
      // Provider-created services require admin approval before going live.
      // Admins bypass this — their services are immediately active.
      if (!isAdminRole(req.user?.role)) {
        await pool.query(
          `UPDATE services
           SET is_active = false,
               pending_change_status = 'pending',
               pending_change_submitted_by = $1,
               pending_change_submitted_at = NOW()
           WHERE id = $2`,
          [req.user!.id, service.id],
        );
        (service as any).isActive = false;
        (service as any).pendingChangeStatus = "pending";
        // Notify admins that a new service is pending approval
        fireAdminNotification(
          "service_added",
          `Service added: ${service.name}`,
          `A provider added a new service "${service.name}" pending admin approval.`,
          {
            providerId:  provider.id,
            countryCode: (provider as any).countryCode ?? null,
            severity:    "info",
            actionType:  "service_added",
            metadata:    { serviceId: service.id, serviceName: service.name },
          }
        );
      }
      res.status(201).json(service);
    } catch (error) {
      console.error("[POST /api/services] error:", error);
      res.status(400).json({ message: "Invalid service data" });
    }
  });
  // Provider: submit a new service proposal
  app.post("/api/service-requests", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider access required" });
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider profile not found" });
      const { category, serviceName, subServiceName, description, suggestedPrice, durationMinutes, locationMode } = req.body || {};
      if (!category || !serviceName) return res.status(400).json({ message: "category and serviceName are required" });
      // Prevent duplicate pending requests for the same service from the same provider
      const dupReq = await pool.query(
        `SELECT id FROM service_requests WHERE provider_id = $1 AND LOWER(service_name) = LOWER($2) AND status = 'pending_review' LIMIT 1`,
        [provider.id, String(serviceName).slice(0, 200)]
      );
      if (dupReq.rows[0]) {
        return res.status(409).json({ message: "You already have a pending request for this service. Please wait for admin review or choose a different name." });
      }
      const r = await pool.query(
        `INSERT INTO service_requests
           (provider_id, category, service_name, sub_service_name, description, suggested_price,
            location_mode, status, country_code, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending_review',$8,NOW(),NOW())
         RETURNING *`,
        [
          provider.id,
          String(category).slice(0, 100),
          String(serviceName).slice(0, 200),
          subServiceName ? String(subServiceName).slice(0, 200) : null,
          description ? String(description).slice(0, 2000) : null,
          suggestedPrice ? Number(suggestedPrice) : null,
          locationMode ?? "both",
          (provider as any).countryCode ?? "HU",
        ]
      );
      fireAdminNotification(
        "service_request",
        `New service request: ${serviceName}`,
        `Provider requested a new service "${serviceName}" (${category}) — pending review.`,
        {
          providerId: provider.id,
          countryCode: (provider as any).countryCode ?? null,
          severity: "info",
          actionType: "service_request",
          metadata: { requestId: r.rows[0].id },
        }
      );
      res.status(201).json(r.rows[0]);
    } catch (err) {
      console.error("[POST /api/service-requests]", err);
      res.status(500).json({ message: "Failed to submit service request" });
    }
  });

  // Provider: get own service requests
  app.get("/api/service-requests", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider access required" });
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider profile not found" });
      const r = await pool.query(
        `SELECT * FROM service_requests WHERE provider_id = $1 ORDER BY created_at DESC`,
        [provider.id]
      );
      res.json(r.rows);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch service requests" });
    }
  });
  app.get("/api/provider/time-off", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider access required" });
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const items = await storage.listProviderTimeOff(provider.id);
      res.json(items);
    } catch (error) {
      console.error("Error listing provider time-off:", error);
      res.status(500).json({ message: "Failed to load time-off list" });
    }
  });

  // Provider adds a new time-off block.
  app.post("/api/provider/time-off", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider access required" });
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const parsed = insertProviderTimeOffSchema.parse({
        providerId: provider.id,
        startDate: String(req.body?.startDate || ""),
        endDate: String(req.body?.endDate || ""),
        reason: req.body?.reason ? String(req.body.reason).slice(0, 200) : null,
      });
      // Date format check (YYYY-MM-DD) and ordering.
      const dRe = /^\d{4}-\d{2}-\d{2}$/;
      if (!dRe.test(parsed.startDate) || !dRe.test(parsed.endDate)) {
        return res.status(400).json({ message: "Please pick a valid start and end date." });
      }
      if (parsed.endDate < parsed.startDate) {
        return res.status(400).json({ message: "End date must be on or after the start date." });
      }
      const today = new Date().toISOString().slice(0, 10);
      if (parsed.endDate < today) {
        return res.status(400).json({ message: "Time-off cannot end in the past." });
      }
      const created = await storage.createProviderTimeOff(parsed);
      res.json(created);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Please fill in all required fields.", errors: error.errors });
      }
      console.error("Error creating provider time-off:", error);
      res.status(500).json({ message: "Failed to add time-off" });
    }
  });

  // Provider deletes a time-off block (must be the owner).
  app.delete("/api/provider/time-off/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider access required" });
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const ok = await storage.deleteProviderTimeOff(req.params.id, provider.id);
      if (!ok) return res.status(404).json({ message: "Time-off block not found" });
      res.json({ ok: true });
    } catch (error) {
      console.error("Error deleting provider time-off:", error);
      res.status(500).json({ message: "Failed to delete time-off" });
    }
  });

  // ========== SERVICE PACKAGES ==========
  // Public: list active packages for a provider (used on provider profile)
  app.get("/api/providers/:providerId/packages", async (req: Request, res: Response) => {
    try {
      const packages = await storage.getPackagesByProvider(req.params.providerId, { activeOnly: true });
      res.json(packages);
    } catch (error) {
      console.error("Error fetching provider packages:", error);
      res.status(500).json({ message: "Failed to fetch packages" });
    }
  });

  // Provider: list own packages (active + inactive)
  app.get("/api/provider/packages", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider access required" });
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const packages = await storage.getPackagesByProvider(provider.id);
      res.json(packages);
    } catch (error) {
      console.error("Error fetching packages:", error);
      res.status(500).json({ message: "Failed to fetch packages" });
    }
  });

  // Provider: create a new package
  app.post("/api/provider/packages", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider access required" });
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      // Clinics cannot author services or service packages — admins assign services to them.
      if ((provider as any).accountType === "clinic") {
        return res.status(403).json({ message: "Clinics cannot create service packages. Services and packages are assigned by an administrator." });
      }
      const { serviceIds, ...rest } = req.body as { serviceIds?: string[]; [k: string]: any };
      if (!Array.isArray(serviceIds) || serviceIds.length < 2) {
        return res.status(400).json({ message: "A package must include at least 2 services" });
      }
      // Verify all services belong to this provider
      const providerServices = await storage.getServicesByProvider(provider.id);
      const ownedIds = new Set(providerServices.map(s => s.id));
      if (!serviceIds.every(id => ownedIds.has(id))) {
        return res.status(400).json({ message: "All services must belong to your account" });
      }
      const data = insertServicePackageSchema.parse({ ...rest, providerId: provider.id });
      const pkg = await storage.createServicePackage(data, serviceIds);
      res.status(201).json(pkg);
    } catch (error: any) {
      console.error("Error creating package:", error);
      res.status(400).json({ message: error?.message || "Invalid package data" });
    }
  });

  // Provider: update a package
  app.patch("/api/provider/packages/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider access required" });
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const existing = await storage.getServicePackage(req.params.id);
      if (!existing || existing.providerId !== provider.id) {
        return res.status(404).json({ message: "Package not found" });
      }
      const { serviceIds, providerId: _ignored, ...rest } = req.body as { serviceIds?: string[]; providerId?: string; [k: string]: any };
      if (serviceIds !== undefined) {
        if (!Array.isArray(serviceIds) || serviceIds.length < 2) {
          return res.status(400).json({ message: "A package must include at least 2 services" });
        }
        const providerServices = await storage.getServicesByProvider(provider.id);
        const ownedIds = new Set(providerServices.map(s => s.id));
        if (!serviceIds.every(id => ownedIds.has(id))) {
          return res.status(400).json({ message: "All services must belong to your account" });
        }
      }
      const updated = await storage.updateServicePackage(req.params.id, rest, serviceIds);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating package:", error);
      res.status(400).json({ message: error?.message || "Invalid package data" });
    }
  });

  // Provider: delete a package
  app.delete("/api/provider/packages/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider access required" });
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const existing = await storage.getServicePackage(req.params.id);
      if (!existing || existing.providerId !== provider.id) {
        return res.status(404).json({ message: "Package not found" });
      }
      await storage.deleteServicePackage(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting package:", error);
      res.status(500).json({ message: "Failed to delete package" });
    }
  });

  // Pricing quote — computes the full price breakdown for a service/visit-type combo.
  // Used by the booking flow to show patients what they'll be charged before they confirm.
  // Public endpoint: current USD-based exchange rates, updated hourly from open.er-api.com.
  registerProviderWalletPayoutsRoutes(app);
  registerProviderScheduleAdminRoutes(app);
  app.get("/api/provider/patient/:patientId/documents", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(403).json({ message: "Provider profile required" });

      // Verify the provider has at least one appointment with this patient.
      const sharedAppts = await storage.getAppointmentsByProvider(provider.id);
      const hasRelationship = sharedAppts.some(a => a.patientId === req.params.patientId);
      if (!hasRelationship) return res.status(403).json({ message: "No appointment relationship with this patient" });

      const docs = await storage.getPatientDocumentsSharedWithProvider(req.params.patientId, provider.id);
      res.json(docs);
    } catch (err) {
      console.error("[provider/patient/documents]", err);
      res.status(500).json({ message: "Failed to load documents" });
    }
  });
  app.get("/api/providers/:id/match-score", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user || req.user.role !== "patient") {
        return res.status(403).json({ message: "Patient access only" });
      }
      const provider = await storage.getProvider(req.params.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      if ((provider as any).countryCode !== req.user.countryCode) {
        return res.status(403).json({ message: "Cross-country access denied" });
      }
      const patient = await storage.getUser(req.user.id);
      const pastAppts = await pool.query<{ provider_id: string }>(
        `SELECT DISTINCT provider_id FROM appointments WHERE patient_id = $1 AND status NOT IN ('cancelled','rejected') AND created_at > NOW() - INTERVAL '90 days'`,
        [req.user.id],
      );
      const svcRows = await pool.query<{ sub_service_id: string }>(
        `SELECT sub_service_id FROM services WHERE provider_id = $1 AND is_active = true AND sub_service_id IS NOT NULL`,
        [provider.id],
      );
      const minPriceRow = await pool.query<{ min_price: string }>(
        `SELECT MIN(price::numeric) AS min_price FROM services WHERE provider_id = $1 AND is_active = true`,
        [provider.id]
      );
      const candidate: ProviderCandidate = {
        id: provider.id,
        countryCode: (provider as any).countryCode ?? req.user.countryCode,
        city: provider.city ?? null,
        languages: provider.languages ?? [],
        rating: provider.rating,
        minServicePrice: minPriceRow.rows[0]?.min_price ?? null,
        providerType: provider.providerType,
        subServiceIds: svcRows.rows.map(r => r.sub_service_id).filter(Boolean),
        isVerified: provider.isVerified,
        totalReviews: provider.totalReviews,
      };
      const ctx: PatientContext = {
        countryCode: req.user.countryCode ?? "HU",
        city: patient?.city ?? null,
        preferredLanguage: patient?.languagePreference ?? null,
        desiredMode: String(req.query.mode ?? "") || null,
        pastProviderIds: pastAppts.rows.map(r => r.provider_id),
      };
      const { score, reasons } = scoreProvider(ctx, candidate);
      res.json({ providerId: provider.id, score, reasons });
    } catch (error) {
      console.error("[providers/match-score]", error);
      res.status(500).json({ message: "Match score calculation failed" });
    }
  });

  // ── POST /api/provider/request-category-change ────────────────────────────
  // Approved providers use this to request a category/subcategory change.
  // Stored as pending_provider_category until an admin approves/rejects via
  // POST /api/admin/providers/:id/approve-category-change.
  app.post("/api/provider/request-category-change", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { requestedCategory, requestedSubcategory, requestedSpecialization, requestedDisplayTitle, reason } = req.body;

      // At least one field must be provided
      if (!requestedCategory?.trim() && !requestedSubcategory?.trim() && !requestedSpecialization?.trim() && !requestedDisplayTitle?.trim()) {
        return res.status(400).json({ message: "At least one field (category, sub-category, specialization, or display title) must be provided." });
      }

      const provider = await storage.getProviderByUserId(userId);
      if (!provider) return res.status(404).json({ message: "Provider profile not found" });

      const CATEGORY_LOCKED_STATES = ["approved", "active", "suspended", "deactivated"];
      if (!CATEGORY_LOCKED_STATES.includes((provider as any).status ?? "")) {
        return res.status(400).json({ message: "Category change requests are only for approved providers. You can edit your category directly in the setup form." });
      }

      // Clear any previous pending request and store the new one
      await pool.query(
        `UPDATE providers SET
           pending_provider_category    = $1,
           pending_provider_subcategory = $2,
           pending_specialization       = $3,
           pending_display_title        = $4,
           category_change_reason       = $5,
           category_change_requested_at = NOW()
         WHERE id = $6`,
        [
          requestedCategory?.trim() || null,
          requestedSubcategory?.trim() || null,
          requestedSpecialization?.trim() || null,
          requestedDisplayTitle?.trim() || null,
          reason?.trim() || null,
          provider.id,
        ],
      );

      // Build a human-readable summary of what changed for the admin notification
      const changeParts: string[] = [];
      if (requestedCategory?.trim())      changeParts.push(`Category → "${requestedCategory}"`);
      if (requestedSubcategory?.trim())   changeParts.push(`Sub-category → "${requestedSubcategory}"`);
      if (requestedSpecialization?.trim()) changeParts.push(`Specialization → "${requestedSpecialization}"`);
      if (requestedDisplayTitle?.trim())  changeParts.push(`Display Title → "${requestedDisplayTitle}"`);

      // Notify admins
      await pool.query(
        `INSERT INTO admin_notifications (type, severity, title, message, provider_id, provider_name, action_type, metadata)
         SELECT 'category_change_request', 'info', $1, $2, $3, u.first_name || ' ' || u.last_name, 'review_category_change', $4::jsonb
         FROM users u WHERE u.id = $5`,
        [
          "Provider Profile Change Request",
          `${changeParts.join("; ")}. Reason: ${reason || "Not provided"}`,
          provider.id,
          JSON.stringify({
            currentCategory: (provider as any).providerCategory,
            requestedCategory, requestedSubcategory, requestedSpecialization, requestedDisplayTitle, reason,
          }),
          userId,
        ],
      ).catch(() => {}); // non-fatal

      res.json({ message: "Change request submitted. An admin will review and respond within 1–3 business days." });
    } catch (err: any) {
      console.error("[request-category-change]", err);
      res.status(500).json({ message: err.message || "Failed to submit category change request" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 1 — SCHEDULE TEMPLATE CRUD
  // provider_schedule_templates: the provider's weekly base template that the
  // rolling-schedule cron reads to auto-publish time_slots 30 days ahead.
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/provider/schedule-templates — list all templates for the current provider
  // Query param: ?modality=all|clinic|home_visit|video  (omit or "all" = return everything)
  app.get("/api/provider/schedule-templates", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: "Provider only" });
      }
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });

      const modality = req.query.modality as string | undefined;
      let sql: string;
      let params: any[];
      if (!modality || modality === "all") {
        sql = `SELECT id, provider_id, day_of_week, start_time, end_time,
                      slot_duration_mins, buffer_before_mins, buffer_after_mins, is_active, modality,
                      created_at, updated_at
                 FROM provider_schedule_templates
                WHERE provider_id = $1
                ORDER BY day_of_week, start_time`;
        params = [provider.id];
      } else if (modality === "none") {
        sql = `SELECT id, provider_id, day_of_week, start_time, end_time,
                      slot_duration_mins, buffer_before_mins, buffer_after_mins, is_active, modality,
                      created_at, updated_at
                 FROM provider_schedule_templates
                WHERE provider_id = $1 AND modality IS NULL
                ORDER BY day_of_week, start_time`;
        params = [provider.id];
      } else {
        sql = `SELECT id, provider_id, day_of_week, start_time, end_time,
                      slot_duration_mins, buffer_before_mins, buffer_after_mins, is_active, modality,
                      created_at, updated_at
                 FROM provider_schedule_templates
                WHERE provider_id = $1 AND modality = $2
                ORDER BY day_of_week, start_time`;
        params = [provider.id, modality];
      }
      const { rows } = await pool.query(sql, params);
      return res.json(rows);
    } catch (err: any) {
      console.error("[GET /api/provider/schedule-templates]", err);
      return res.status(500).json({ message: err.message });
    }
  });

  // POST /api/provider/schedule-templates/batch — replace all windows for a day in one call
  // Body: { dayOfWeek, modality?, windows: [{ startTime, endTime, slotDurationMins?, bufferBeforeMins?, bufferAfterMins? }] }
  // Must be registered BEFORE /:id and day/:dow routes (Express first-match)
  app.post("/api/provider/schedule-templates/batch", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: "Provider only" });
      }
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });

      const schema = z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        modality: z.string().nullable().optional(),
        windows: z.array(z.object({
          startTime: z.string().regex(/^\d{2}:\d{2}$/),
          endTime:   z.string().regex(/^\d{2}:\d{2}$/),
          slotDurationMins:  z.number().int().min(5).max(480).default(30),
          bufferBeforeMins:  z.number().int().min(0).max(120).default(0),
          bufferAfterMins:   z.number().int().min(0).max(120).default(0),
        })).min(0),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message });
      const { dayOfWeek, modality, windows } = parsed.data;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Clear existing templates for this day+modality
        if (modality) {
          await client.query(
            `DELETE FROM provider_schedule_templates WHERE provider_id = $1 AND day_of_week = $2 AND modality = $3`,
            [provider.id, dayOfWeek, modality],
          );
        } else {
          await client.query(
            `DELETE FROM provider_schedule_templates WHERE provider_id = $1 AND day_of_week = $2 AND modality IS NULL`,
            [provider.id, dayOfWeek],
          );
        }
        const inserted: any[] = [];
        for (const w of windows) {
          const { rows } = await client.query(
            `INSERT INTO provider_schedule_templates
               (id, provider_id, day_of_week, start_time, end_time,
                slot_duration_mins, buffer_before_mins, buffer_after_mins, is_active, modality)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, TRUE, $8)
             RETURNING *`,
            [provider.id, dayOfWeek, w.startTime, w.endTime, w.slotDurationMins, w.bufferBeforeMins, w.bufferAfterMins, modality ?? null],
          );
          inserted.push(rows[0]);
        }
        await client.query("COMMIT");
        // Fire-and-forget slot regeneration for this day
        for (const w of windows) {
          regenerateSlotsForDayOfWeek(provider.id, dayOfWeek, {
            startTime: w.startTime, endTime: w.endTime,
            slotDurationMins: w.slotDurationMins, bufferBeforeMins: w.bufferBeforeMins, bufferAfterMins: w.bufferAfterMins,
          }).catch((e: Error) => console.warn(`[regenerateSlotsForDayOfWeek] batch provider=${provider.id} dow=${dayOfWeek}: ${e.message}`));
        }
        // Fire-and-forget: sync null-modality templates → provider_office_hours.weeklySchedule
        // so the fallback slot synthesizer works for dates beyond the 90-day rolling cron window.
        if (!modality) {
          syncTemplatesToOfficeHours(provider.id, req.user!.id).catch((e: Error) =>
            console.warn(`[syncTemplatesToOfficeHours] provider=${provider.id}: ${e.message}`),
          );
        }
        return res.status(201).json(inserted);
      } catch (txErr) {
        await client.query("ROLLBACK");
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error("[POST /api/provider/schedule-templates/batch]", err);
      return res.status(500).json({ message: err.message });
    }
  });

  // POST /api/provider/schedule-templates — upsert (replace) templates for a day-of-week
  // Body: { dayOfWeek: 0-6, startTime, endTime, slotDurationMins?, bufferBeforeMins?, bufferAfterMins? }
  app.post("/api/provider/schedule-templates", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: "Provider only" });
      }
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });

      const schema = z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
        slotDurationMins: z.number().int().min(5).max(480).default(30),
        bufferBeforeMins: z.number().int().min(0).max(120).default(0),
        bufferAfterMins: z.number().int().min(0).max(120).default(0),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message });
      const d = parsed.data;

      // Delete existing templates for this provider+day, then insert fresh
      await pool.query(
        `DELETE FROM provider_schedule_templates WHERE provider_id = $1 AND day_of_week = $2`,
        [provider.id, d.dayOfWeek],
      );
      const { rows } = await pool.query(
        `INSERT INTO provider_schedule_templates
           (id, provider_id, day_of_week, start_time, end_time,
            slot_duration_mins, buffer_before_mins, buffer_after_mins, is_active)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, TRUE)
         RETURNING *`,
        [provider.id, d.dayOfWeek, d.startTime, d.endTime, d.slotDurationMins, d.bufferBeforeMins, d.bufferAfterMins],
      );

      // ── Part 1: Instant forward-sync ───────────────────────────────────────
      // Fire-and-forget: immediately regenerate the next 30 days for this
      // provider+dayOfWeek so the booking wizard shows the updated slots at
      // once, without waiting for the nightly rolling-schedule cron.
      regenerateSlotsForDayOfWeek(provider.id, d.dayOfWeek, {
        startTime: d.startTime,
        endTime: d.endTime,
        slotDurationMins: d.slotDurationMins,
        bufferBeforeMins: d.bufferBeforeMins,
        bufferAfterMins: d.bufferAfterMins,
      }).catch((e: Error) =>
        console.warn(`[regenerateSlotsForDayOfWeek] provider=${provider.id} dow=${d.dayOfWeek}: ${e.message}`),
      );

      return res.status(201).json(rows[0]);
    } catch (err: any) {
      console.error("[POST /api/provider/schedule-templates]", err);
      return res.status(500).json({ message: err.message });
    }
  });

  // DELETE /api/provider/schedule-templates/:id — remove a specific template row
  app.delete("/api/provider/schedule-templates/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: "Provider only" });
      }
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });

      const { rowCount } = await pool.query(
        `DELETE FROM provider_schedule_templates WHERE id = $1 AND provider_id = $2`,
        [req.params.id, provider.id],
      );
      if (!rowCount) return res.status(404).json({ message: "Template not found" });
      return res.status(204).end();
    } catch (err: any) {
      console.error("[DELETE /api/provider/schedule-templates/:id]", err);
      return res.status(500).json({ message: err.message });
    }
  });

  // DELETE /api/provider/schedule-templates/day/:dow — clear all templates for a day-of-week
  app.delete("/api/provider/schedule-templates/day/:dow", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: "Provider only" });
      }
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });

      const dow = parseInt(req.params.dow, 10);
      if (isNaN(dow) || dow < 0 || dow > 6) return res.status(400).json({ message: "dow must be 0-6" });
      const modality = req.query.modality as string | undefined;
      if (!modality || modality === "all") {
        await pool.query(
          `DELETE FROM provider_schedule_templates WHERE provider_id = $1 AND day_of_week = $2`,
          [provider.id, dow],
        );
      } else if (modality === "none") {
        await pool.query(
          `DELETE FROM provider_schedule_templates WHERE provider_id = $1 AND day_of_week = $2 AND modality IS NULL`,
          [provider.id, dow],
        );
      } else {
        await pool.query(
          `DELETE FROM provider_schedule_templates WHERE provider_id = $1 AND day_of_week = $2 AND modality = $3`,
          [provider.id, dow, modality],
        );
      }
      return res.status(204).end();
    } catch (err: any) {
      console.error("[DELETE /api/provider/schedule-templates/day/:dow]", err);
      return res.status(500).json({ message: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 2 — ATOMIC FORCE-PUBLISH (Custom Schedule Rewrite)
  // Purges unbooked/unheld slots for a date, then inserts caller-supplied slots.
  // Active checkout leases (appointment_slot_holds) and booked slots are
  // preserved — the DELETE strictly seals them from deletion.
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /api/provider/schedules/force-publish
  // Body: { date: "YYYY-MM-DD", slots: [{ startTime, endTime }] }
  app.post("/api/provider/schedules/force-publish", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && !isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: "Provider only" });
      }
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });

      const schema = z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        slots: z.array(z.object({
          startTime: z.string().regex(/^\d{2}:\d{2}$/),
          endTime: z.string().regex(/^\d{2}:\d{2}$/),
        })).min(0).max(200),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message });
      const { date, slots } = parsed.data;

      const client = await pool.connect();
      let deletedCount = 0;
      let insertedCount = 0;
      try {
        await client.query("BEGIN");

        // Atomic DELETE: purge open slots that are not booked and not under an active hold.
        const delRes = await client.query(
          `DELETE FROM time_slots
            WHERE provider_id = $1
              AND date = $2
              AND is_booked = FALSE
              AND id NOT IN (
                SELECT DISTINCT ts.id FROM time_slots ts
                INNER JOIN appointment_slot_holds ash
                  ON  ash.provider_id = ts.provider_id
                  AND ash.date        = ts.date
                  AND ash.start_time  = ts.start_time
                  AND ash.end_time    = ts.end_time
                  AND ash.expires_at  > NOW()
              )`,
          [provider.id, date],
        );
        deletedCount = delRes.rowCount ?? 0;

        // Insert new slots with ON CONFLICT DO NOTHING (idempotent on same start/end)
        for (const s of slots) {
          const ins = await client.query(
            `INSERT INTO time_slots (id, provider_id, date, start_time, end_time, is_booked, is_blocked)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, FALSE, FALSE)
             ON CONFLICT DO NOTHING`,
            [provider.id, date, s.startTime, s.endTime],
          );
          insertedCount += ins.rowCount ?? 0;
        }

        await client.query("COMMIT");
      } catch (txErr) {
        await client.query("ROLLBACK").catch(() => null);
        throw txErr;
      } finally {
        client.release();
      }

      return res.status(201).json({ date, deletedCount, insertedCount, slotsRequested: slots.length });
    } catch (err: any) {
      console.error("[POST /api/provider/schedules/force-publish]", err);
      return res.status(500).json({ message: err.message });
    }
  });
}
