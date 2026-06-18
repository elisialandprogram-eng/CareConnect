/**
 * Patient routes — extracted from server/routes.ts
 *
 * Covers: packages (public + admin CRUD), user-packages lifecycle,
 * patient documents (upload/list/delete/share), data-export, privacy-requests.
 */

import type { Express, Response } from "express";
import multer from "multer";
import { storage } from "../storage";
import { pool } from "../db";
import {
  authenticateToken,
  optionalAuth,
  requireAdmin,
  requireGlobalAdmin,
  AuthRequest,
} from "../middleware/auth";
import { requirePermission, PERMISSIONS } from "../middleware/rbac";
import {
  isAdminRole,
  canAccessCountry,
  type CountryCode,
} from "../middleware/country";
import { getRates, toUSDSync } from "../services/currency";
import { packagesCache } from "../lib/cache";
import { countryCurrency } from "../middleware/country";
import { createCheckoutSession, isStripeConfigured } from "../stripe";
import {
  isCloudinaryConfigured,
  deleteCloudinaryFile,
  uploadDocumentFile,
  uploadGalleryImage,
  deleteCloudinaryImage,
} from "../services/cloudinary";

const PATIENT_DOC_TYPES = ["medical_report","test_result","referral","prescription","insurance","other"] as const;

const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowed = ["image/jpeg","image/png","image/webp","application/pdf","image/gif"];
    cb(null, allowed.includes(file.mimetype));
  },
});

const galleryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    cb(null, ["image/jpeg","image/png","image/webp","image/gif"].includes(file.mimetype));
  },
});

export function registerPatientRoutes(app: Express): void {

  // ── Packages — public ─────────────────────────────────────────────────────
  app.get("/api/packages", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const countryCode = (req.query.countryCode as string) || req.user?.countryCode || "HU";
      const role = req.user?.role;
      let targetUserType: string;
      if (isAdminRole(role)) {
        targetUserType = (req.query.targetUserType as string) || "patient";
      } else if (role === "provider") {
        targetUserType = "provider";
      } else {
        targetUserType = "patient";
      }
      const cacheKey = `${countryCode}:${targetUserType}`;
      const cached = packagesCache.get(cacheKey);
      if (cached) {
        res.setHeader("Cache-Control", "private, max-age=600");
        return res.json(cached);
      }
      const pkgs = await storage.getPackages({ countryCode, isActive: true, targetUserType });
      packagesCache.set(cacheKey, pkgs);
      res.setHeader("Cache-Control", "private, max-age=600");
      return res.json(pkgs);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.get("/api/packages/my", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const pkgs = await storage.getUserPackages(req.user!.id, status);
      return res.json(pkgs);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // Lightweight dashboard summary of the patient's active packages.
  // Returns each active package with days remaining, sessions total (if defined
  // via benefit_key='sessions_total'), and sessions used (completed appointments
  // that used this user_package).
  app.get("/api/patient/package-summary", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query<{
        id: string; package_id: string; package_name: string;
        expires_at: string | null; sessions_used: string;
        benefits: Array<{ key: string; value: string }> | null;
      }>(
        `SELECT up.id,
                up.package_id,
                COALESCE(p.name, 'Membership Package') AS package_name,
                up.expires_at::text,
                COUNT(a.id) FILTER (WHERE a.status = 'completed') AS sessions_used,
                COALESCE(
                  json_agg(
                    json_build_object('key', pb.benefit_key::text, 'value', pb.benefit_value::text)
                    ORDER BY pb.benefit_key
                  ) FILTER (WHERE pb.benefit_key IS NOT NULL),
                  '[]'
                ) AS benefits
           FROM user_packages up
           JOIN packages p ON p.id = up.package_id
           LEFT JOIN package_benefits pb ON pb.package_id = up.package_id
           LEFT JOIN appointments a
             ON a.package_id_used = up.id
            AND a.patient_id = up.user_id
          WHERE up.user_id = $1
            AND up.status = 'active'
          GROUP BY up.id, up.package_id, p.name, up.expires_at
          ORDER BY up.expires_at ASC NULLS LAST`,
        [req.user!.id],
      );

      const now = Date.now();
      const summary = rows.map((r) => {
        const expiresAt = r.expires_at ? new Date(r.expires_at) : null;
        const daysRemaining = expiresAt
          ? Math.max(0, Math.ceil((expiresAt.getTime() - now) / (24 * 60 * 60 * 1000)))
          : null;
        const benefits: Array<{ key: string; value: string }> = Array.isArray(r.benefits) ? r.benefits : [];
        const sessionsBenefit = benefits.find(b => b.key === "sessions_total");
        return {
          id: r.id,
          packageId: r.package_id,
          packageName: r.package_name,
          expiresAt: r.expires_at,
          daysRemaining,
          sessionsTotal: sessionsBenefit ? Number(sessionsBenefit.value) : null,
          sessionsUsed: Number(r.sessions_used ?? 0),
          benefits: benefits.filter(b => b.key !== "sessions_total"),
        };
      });

      return res.json(summary);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/packages/:id/purchase", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const pkg = await storage.getPackage(req.params.id);
      if (!pkg) return res.status(404).json({ message: "Package not found" });
      if (!pkg.isActive) return res.status(400).json({ message: "Package is no longer available" });

      const buyerRole = req.user?.role ?? "patient";
      if (!isAdminRole(buyerRole)) {
        const pkgTarget = pkg.targetUserType;
        if (pkgTarget !== "both") {
          const expectedRole = pkgTarget === "provider" ? "provider" : "patient";
          if (buyerRole !== expectedRole) {
            return res.status(403).json({ message: `This package is only available to ${expectedRole}s.` });
          }
        }
      }

      if (pkg.maxPurchases != null) {
        const existing = await storage.getPackagePurchaseCount(pkg.id);
        if (existing >= pkg.maxPurchases) {
          return res.status(400).json({ message: "This package has reached its purchase limit" });
        }
      }

      const userCountry = req.user!.countryCode ?? "HU";
      if (pkg.countryCode && pkg.countryCode !== userCountry) {
        return res.status(400).json({ message: "This package is not available in your country" });
      }

      // P-FINAL Rules 8 & 9: Use fixed local price from localPrices JSONB if configured.
      // This eliminates exchange-rate sensitivity for package pricing.
      // Falls back to packages.price (assumed USD) with toUSDSync conversion.
      const userCurrency = countryCurrency(userCountry as CountryCode);
      const _pkgLocalPrices: Record<string, number> =
        typeof (pkg as any).localPrices === 'object' && (pkg as any).localPrices
          ? (pkg as any).localPrices
          : {};
      const hasLocalPrice = _pkgLocalPrices[userCurrency] != null;
      const price = hasLocalPrice
        ? Number(_pkgLocalPrices[userCurrency])
        : Number(pkg.price);
      const _pkgPriceCurrency = hasLocalPrice ? userCurrency : ((pkg as any).currency || 'USD');

      // W8: Apply VAT/tax at package purchase time
      let taxRate = 0;
      try {
        const taxSetting = await storage.getTaxSettingByCountry(userCountry).catch(() => null);
        if (taxSetting) taxRate = Number(taxSetting.taxRate ?? 0);
      } catch { /* non-fatal */ }
      const taxMultiplier = 1 + (taxRate / 100);
      const priceWithTax = price * taxMultiplier;

      if (price === 0) {
        const up = await storage.createUserPackage({
          userId: req.user!.id,
          packageId: pkg.id,
          status: "pending",
          pricePaid: "0.00",
          countryCode: userCountry as any,
        } as any);
        const activated = await storage.activateUserPackage(up.id);
        return res.status(201).json({ userPackage: activated, paymentRequired: false });
      }

      const _pkgWalletRates = await getRates();
      // Use the resolved price currency (local fixed price currency or package.currency)
      const _pkgWalletCurrency = _pkgPriceCurrency;
      const priceUSD = toUSDSync(priceWithTax, _pkgWalletCurrency, _pkgWalletRates);

      const { paymentMethod } = req.body;
      if (paymentMethod === "wallet") {
        const wallet = await storage.getWalletByUserId(req.user!.id);
        const balance = wallet ? Number(wallet.balance) : 0;
        if (balance >= priceUSD) {
          const up = await storage.createUserPackage({
            userId: req.user!.id,
            packageId: pkg.id,
            status: "pending",
            pricePaid: String(Math.round(priceUSD * 100) / 100),
            countryCode: userCountry as any,
          } as any);
          await storage.debitWallet(req.user!.id, priceUSD, {
            description: `Package purchase: ${pkg.name}`,
            referenceType: "package_purchase",
            referenceId: up.id,
            idempotencyKey: `pkg-purchase-${up.id}`,
          });
          const activated = await storage.activateUserPackage(up.id);
          return res.status(201).json({ userPackage: activated, paymentRequired: false });
        }
        return res.status(400).json({ message: "Insufficient wallet balance" });
      }

      if (!isStripeConfigured()) {
        return res.status(503).json({ message: "Payment gateway not configured" });
      }

      const up = await storage.createUserPackage({
        userId: req.user!.id,
        packageId: pkg.id,
        status: "pending",
        pricePaid: priceUSD.toFixed(2),
        countryCode: userCountry as any,
      } as any);

      const origin = (req.headers.origin as string) || `${req.protocol}://${req.get("host")}`;
      const user = await storage.getUser(req.user!.id);
      const session = await createCheckoutSession({
        appointmentId: `package:${up.id}`,
        amount: priceUSD,
        currency: "usd",
        description: `Package: ${pkg.name}`,
        customerEmail: user?.email,
        successUrl: `${origin}/packages?activated=${up.id}`,
        cancelUrl: `${origin}/packages?cancelled=1`,
        metadata: { userPackageId: up.id, userId: req.user!.id, type: "package_purchase" },
      });

      await pool.query(`UPDATE user_packages SET payment_id = $1 WHERE id = $2`, [session.sessionId, up.id]);

      return res.status(201).json({ userPackage: up, paymentRequired: true, checkoutUrl: session.url });
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.post("/api/user-packages/:id/activate", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const up = await storage.getUserPackage(req.params.id);
      if (!up) return res.status(404).json({ message: "User package not found" });
      if (up.userId !== req.user!.id && !isAdminRole(req.user!.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const activated = await storage.activateUserPackage(req.params.id);
      return res.json(activated);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.post("/api/user-packages/:id/pause", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const up = await storage.getUserPackage(req.params.id);
      if (!up) return res.status(404).json({ message: "User package not found" });
      if (up.userId !== req.user!.id) return res.status(403).json({ message: "Forbidden" });
      if (up.status !== "active") return res.status(400).json({ message: "Only active packages can be paused" });
      const paused = await storage.pauseUserPackage(req.params.id, req.user!.id);
      return res.json(paused);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.post("/api/user-packages/:id/resume", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const up = await storage.getUserPackage(req.params.id);
      if (!up) return res.status(404).json({ message: "User package not found" });
      if (up.userId !== req.user!.id) return res.status(403).json({ message: "Forbidden" });
      if (up.status !== "paused") return res.status(400).json({ message: "Only paused packages can be resumed" });
      const resumed = await storage.resumeUserPackage(req.params.id, req.user!.id);
      return res.json(resumed);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.post("/api/user-packages/:id/cancel-renewal", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const up = await storage.getUserPackage(req.params.id);
      if (!up) return res.status(404).json({ message: "User package not found" });
      if (up.userId !== req.user!.id) return res.status(403).json({ message: "Forbidden" });
      const cancelled = await storage.cancelUserPackageRenewal(req.params.id, req.user!.id);
      return res.json(cancelled);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/user-packages/:id/auto-renew", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const up = await storage.getUserPackage(req.params.id);
      if (!up) return res.status(404).json({ message: "User package not found" });
      if (up.userId !== req.user!.id) return res.status(403).json({ message: "Forbidden" });
      const { autoRenew } = req.body;
      if (typeof autoRenew !== "boolean") return res.status(400).json({ message: "autoRenew (boolean) required" });
      const updated = await storage.toggleAutoRenew(req.params.id, req.user!.id, autoRenew);
      return res.json(updated);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.get("/api/user-packages/:id/usage", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const up = await storage.getUserPackage(req.params.id);
      if (!up) return res.status(404).json({ message: "User package not found" });
      if (up.userId !== req.user!.id && !isAdminRole(req.user!.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const usage = await storage.getBenefitUsage(req.params.id);
      return res.json(usage);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // ── Packages — Admin CRUD ─────────────────────────────────────────────────
  app.get("/api/admin/packages", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const filters: any = {};
      if (req.query.countryCode) filters.countryCode = req.query.countryCode;
      if (req.query.isActive !== undefined) filters.isActive = req.query.isActive === "true";
      if (req.query.targetUserType) filters.targetUserType = req.query.targetUserType;
      const pkgs = await storage.getPackages(filters);
      const countsMap = await storage.getPackagePurchaseCounts(pkgs.map(p => p.id));
      const withCounts = pkgs.map(p => ({ ...p, purchaseCount: countsMap.get(p.id) ?? 0 }));
      return res.json(withCounts);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/packages", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.SETTINGS_EDIT), async (req: AuthRequest, res: Response) => {
    try {
      const {
        name, description, countryCode, durationDays, price, currency,
        targetUserType, isActive, maxPurchases, sortOrder, benefits = [],
      } = req.body;
      if (!name) return res.status(400).json({ message: "name is required" });
      const pkg = await storage.createPackage(
        {
          name, description: description ?? null,
          countryCode: countryCode ?? null,
          durationDays: durationDays ?? 30,
          price: String(Math.round(Number(price ?? 0) * 100) / 100),
          currency: currency ?? "USD",
          targetUserType: targetUserType ?? "patient",
          isActive: isActive ?? true,
          maxPurchases: maxPurchases ?? null,
          sortOrder: sortOrder ?? 0,
          createdBy: req.user!.id,
        } as any,
        benefits,
      );
      packagesCache.clear();
      return res.status(201).json(pkg);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // Must be registered BEFORE /:id to avoid Express matching "disable-all-active" as a param
  app.post("/api/admin/packages/disable-all-active", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.SETTINGS_EDIT), async (req: AuthRequest, res: Response) => {
    try {
      const result = await pool.query(
        `UPDATE packages SET is_active = false WHERE is_active = true RETURNING id`
      );
      packagesCache.clear();
      return res.json({ disabled: result.rowCount ?? 0 });
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/admin/packages/:id", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.SETTINGS_EDIT), async (req: AuthRequest, res: Response) => {
    try {
      const { benefits, ...data } = req.body;
      const updated = await storage.updatePackage(req.params.id, data as any, benefits);
      if (!updated) return res.status(404).json({ message: "Package not found" });
      packagesCache.clear();
      return res.json(updated);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/admin/packages/:id", authenticateToken, requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deletePackage(req.params.id);
      packagesCache.clear();
      return res.status(204).send();
    } catch (e: any) {
      if (e.message?.startsWith("SUBSCRIBERS:")) {
        const n = e.message.split(":")[1];
        return res.status(409).json({
          message: `This package has ${n} purchase(s). Archive it to remove it from the catalog while keeping existing users' access.`,
          subscribers: Number(n),
        });
      }
      return res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/packages/:id/clone", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.SETTINGS_EDIT), async (req: AuthRequest, res: Response) => {
    try {
      const cloned = await storage.clonePackage(req.params.id, req.body ?? {});
      packagesCache.clear();
      return res.status(201).json(cloned);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.get("/api/admin/user-packages", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const limit  = Math.min(Number(req.query.limit)  || 50, 200);
      const offset = Number(req.query.offset) || 0;
      const status = req.query.status as string | undefined;
      const pkgId  = req.query.packageId as string | undefined;
      const userId = req.query.userId as string | undefined;

      let where = "WHERE 1=1";
      const params: any[] = [];
      if (status) { params.push(status); where += ` AND up.status = $${params.length}`; }
      if (pkgId)  { params.push(pkgId);  where += ` AND up.package_id = $${params.length}`; }
      if (userId) { params.push(userId); where += ` AND up.user_id = $${params.length}`; }

      const rows = await pool.query(
        `SELECT up.*, p.name AS package_name, p.price AS package_price,
                u.email, u.first_name || ' ' || u.last_name AS user_name
         FROM user_packages up
         JOIN packages p ON p.id = up.package_id
         JOIN users u ON u.id = up.user_id
         ${where}
         ORDER BY up.created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params,
      );
      const cnt = await pool.query(`SELECT COUNT(*) FROM user_packages up ${where}`, params);
      return res.json({ purchases: rows.rows, total: Number(cnt.rows[0]?.count ?? 0) });
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/user-packages/:id/activate", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const activated = await storage.activateUserPackage(req.params.id);
      if (!activated) return res.status(404).json({ message: "User package not found" });
      return res.json(activated);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/admin/user-packages/:id/disable", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const up = await storage.getUserPackage(req.params.id);
      if (!up) return res.status(404).json({ message: "User package not found" });
      if (!["active", "pending", "paused"].includes(up.status)) {
        return res.status(400).json({ message: `Package is already ${up.status}` });
      }
      const updated = await storage.updateUserPackage(req.params.id, {
        status: "cancelled",
        cancelledAt: new Date(),
        autoRenew: false,
      } as any);
      return res.json(updated);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // ── Patient documents ─────────────────────────────────────────────────────
  app.post("/api/patient/documents/upload", authenticateToken, docUpload.single("file"), async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file provided" });
      if (!isCloudinaryConfigured()) return res.status(503).json({ message: "File storage not configured" });

      const { title, documentType, appointmentId } = req.body;
      if (!title?.trim()) return res.status(400).json({ message: "title is required" });
      const docType = PATIENT_DOC_TYPES.includes(documentType) ? documentType : "other";

      const uploaded = await uploadDocumentFile(req.file.buffer, req.file.mimetype);
      const doc = await storage.createPatientDocument({
        patientId: req.user!.id,
        appointmentId: appointmentId || null,
        documentType: docType,
        title: title.trim(),
        fileUrl: uploaded.secureUrl,
        cloudinaryPublicId: uploaded.publicId,
        mimeType: req.file.mimetype,
        fileSizeBytes: req.file.size,
        visibility: "private",
        sharedWithProviderIds: [],
        countryCode: (req.user as any).countryCode || "HU",
      });
      res.status(201).json(doc);
    } catch (err: any) {
      console.error("[patient/documents/upload]", err);
      res.status(500).json({ message: "Upload failed" });
    }
  });

  app.get("/api/patient/documents", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const type = typeof req.query.type === "string" ? req.query.type : undefined;
      const docs = await storage.getPatientDocuments(req.user!.id, type);
      res.json(docs);
    } catch (err) {
      console.error("[patient/documents]", err);
      res.status(500).json({ message: "Failed to load documents" });
    }
  });

  app.delete("/api/patient/documents/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const doc = await storage.getPatientDocument(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (doc.patientId !== req.user!.id && !isAdminRole(req.user!.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (doc.cloudinaryPublicId) {
        try { await deleteCloudinaryFile(doc.cloudinaryPublicId); } catch {}
      }
      await storage.deletePatientDocument(doc.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[patient/documents/delete]", err);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  app.patch("/api/patient/documents/:id/share", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const doc = await storage.getPatientDocument(req.params.id);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (doc.patientId !== req.user!.id) return res.status(403).json({ message: "Forbidden" });

      const { providerId, shared } = req.body as { providerId: string; shared: boolean };
      if (!providerId) return res.status(400).json({ message: "providerId required" });

      const current: string[] = doc.sharedWithProviderIds ?? [];
      const next = shared
        ? Array.from(new Set([...current, providerId]))
        : current.filter((id: string) => id !== providerId);

      const updated = await storage.updatePatientDocument(doc.id, {
        sharedWithProviderIds: next,
        visibility: next.length > 0 ? "shared_with_providers" : "private",
      });
      res.json(updated);
    } catch (err) {
      console.error("[patient/documents/share]", err);
      res.status(500).json({ message: "Failed to update sharing" });
    }
  });

  // ── Data export ───────────────────────────────────────────────────────────
  app.get("/api/patient/me/data-export", authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const countryCode = req.user!.countryCode;

    try {
      const recentExports = await pool.query(
        `SELECT COUNT(*) FROM audit_logs
         WHERE user_id = $1 AND action = 'export'
         AND created_at > NOW() - INTERVAL '24 hours'`,
        [userId],
      );
      if (parseInt(recentExports.rows[0].count, 10) >= 3) {
        return res.status(429).json({
          message: "Export rate limit reached. You may request your data at most 3 times per 24 hours.",
        });
      }

      const [
        profileRow, appointmentsR, documentsR, walletRow, walletTxns,
        consents, notifications, referral, familyMembers, privacyRequests,
      ] = await Promise.all([
        pool.query(
          `SELECT id, email, first_name, last_name, phone, date_of_birth, gender,
                  address, city, country_code, language_preference, role, is_email_verified,
                  created_at
           FROM users WHERE id = $1 AND is_deleted = false`,
          [userId],
        ),
        pool.query(
          `SELECT a.id, a.appointment_number, a.date, a.start_time, a.end_time,
                  a.status, a.visit_type, a.total_amount, a.payment_status,
                  a.notes, a.country_code, a.created_at,
                  s.name AS service_name,
                  pu.first_name AS provider_first, pu.last_name AS provider_last
           FROM appointments a
           LEFT JOIN services s ON s.id = a.service_id
           LEFT JOIN providers p ON p.id = a.provider_id
           LEFT JOIN users pu ON pu.id = p.user_id
           WHERE a.patient_id = $1
           ORDER BY a.date DESC LIMIT 500`,
          [userId],
        ),
        pool.query(
          `SELECT id, document_type, title AS file_name, file_url, visibility AS status, created_at
           FROM patient_documents WHERE patient_id = $1
           ORDER BY created_at DESC`,
          [userId],
        ).catch(() => ({ rows: [] })),
        pool.query(`SELECT balance, currency, created_at FROM wallets WHERE user_id = $1`, [userId]),
        pool.query(
          `SELECT id, type, amount, currency, reference_type, reference_id,
                  description, created_at
           FROM wallet_transactions WHERE user_id = $1
           ORDER BY created_at DESC LIMIT 500`,
          [userId],
        ),
        pool.query(
          `SELECT id, consent_type, is_accepted, accepted_at, ip_address,
                  consent_version, created_at
           FROM patient_consents WHERE user_id = $1
           ORDER BY created_at DESC`,
          [userId],
        ),
        pool.query(
          `SELECT id, type, title, message, is_read, created_at
           FROM user_notifications WHERE user_id = $1
           ORDER BY created_at DESC LIMIT 200`,
          [userId],
        ),
        pool.query(
          `SELECT id, status, referred_user_id,
                  reward_amount, qualified_at, created_at
           FROM referrals WHERE referrer_user_id = $1
           ORDER BY created_at DESC LIMIT 100`,
          [userId],
        ),
        pool.query(
          `SELECT id, first_name, last_name, date_of_birth, gender, relationship,
                  created_at
           FROM family_members WHERE primary_user_id = $1`,
          [userId],
        ),
        pool.query(
          `SELECT id, request_type, status, notes, created_at, completed_at
           FROM privacy_requests WHERE user_id = $1
           ORDER BY created_at DESC`,
          [userId],
        ),
      ]);

      if (!profileRow.rows[0]) {
        return res.status(404).json({ message: "User not found" });
      }

      await pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
         VALUES ($1, 'export', 'user', $1, '{"source":"patient_self_export"}', $2)`,
        [userId, countryCode],
      );

      const exportPayload = {
        export_metadata: {
          generated_at: new Date().toISOString(),
          requested_by_user_id: userId,
          country_code: countryCode,
          schema_version: "1.0",
          note: "This export contains all personal data held by GoldenLife for your account. Financial records (payments, invoices) are retained for legal compliance and cannot be deleted. All monetary amounts are in USD.",
        },
        profile: profileRow.rows[0] ?? null,
        appointments: appointmentsR.rows,
        documents_metadata: documentsR.rows,
        wallet: { current: walletRow.rows[0] ?? null, transactions: walletTxns.rows },
        consents: consents.rows,
        notifications: notifications.rows,
        referrals: referral.rows,
        family_members: familyMembers.rows,
        privacy_requests: privacyRequests.rows,
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=goldenlife-data-export-${userId}-${new Date().toISOString().slice(0, 10)}.json`,
      );
      return res.json(exportPayload);
    } catch (err: any) {
      console.error("[data-export] error:", err.message);
      return res.status(500).json({ message: "Failed to generate data export" });
    }
  });

  // ── Privacy requests ──────────────────────────────────────────────────────
  app.post("/api/privacy/requests", authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const countryCode = req.user!.countryCode;
    const { requestType, notes } = req.body as { requestType: string; notes?: string };

    const validTypes = ["export", "deletion", "access"];
    if (!validTypes.includes(requestType)) {
      return res.status(400).json({ message: "requestType must be one of: export, deletion, access" });
    }

    try {
      const existing = await pool.query(
        `SELECT id FROM privacy_requests
         WHERE user_id = $1 AND request_type = $2 AND status IN ('pending','processing')`,
        [userId, requestType],
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({
          message: `You already have an open ${requestType} request. Please wait for it to be processed before submitting another.`,
          existingRequestId: existing.rows[0].id,
        });
      }

      const result = await pool.query(
        `INSERT INTO privacy_requests (user_id, request_type, status, notes, country_code)
         VALUES ($1, $2, 'pending', $3, $4) RETURNING *`,
        [userId, requestType, notes ?? null, countryCode],
      );

      await pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
         VALUES ($1, 'create', 'privacy_request', $2, $3, $4)`,
        [userId, result.rows[0].id, JSON.stringify({ requestType, userId }), countryCode],
      );

      return res.status(201).json({
        message: "Privacy request submitted. Our team will respond within 30 days.",
        request: result.rows[0],
      });
    } catch (err: any) {
      console.error("[privacy-requests] POST error:", err.message);
      return res.status(500).json({ message: "Failed to submit privacy request" });
    }
  });

  app.get("/api/privacy/requests", authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    try {
      const result = await pool.query(
        `SELECT id, request_type, status, notes, admin_notes,
                completed_at, created_at
         FROM privacy_requests
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId],
      );
      return res.json(result.rows);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to fetch privacy requests" });
    }
  });

  // ── Patient Consents ──────────────────────────────────────────────────────
  app.post("/api/consents", optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { insertPatientConsentSchema } = await import("@shared/schema");
      const effectiveUserId = req.user?.id ?? req.body.userId;
      if (!effectiveUserId) {
        return res.status(400).json({ message: "User ID is required for consent" });
      }
      if (req.user && !isAdminRole(req.user.role)) {
        if (req.body.userId && req.body.userId !== req.user.id) {
          return res.status(403).json({ message: "Cannot record consent for another user" });
        }
        if (req.body.patientId && req.body.patientId !== req.user.id) {
          return res.status(403).json({ message: "Cannot record consent for another patient" });
        }
      }
      const data = insertPatientConsentSchema.parse({
        ...req.body,
        consentType: req.body.consentType || "general",
        isAccepted: req.body.isAccepted ?? true,
        userId: effectiveUserId,
        language: req.body.language || "en",
        consentTextVersion: req.body.consentTextVersion || "1.0",
        ipAddress: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
        userAgent: req.headers["user-agent"],
      });
      const consent = await storage.createPatientConsent(data);
      res.status(201).json(consent);
    } catch (error) {
      console.error("Consent submission error:", error);
      res.status(400).json({ message: "Invalid consent data" });
    }
  });

  app.get("/api/consents", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const consents = await storage.getPatientConsents(req.user!.id);
      res.json(consents);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch consents" });
    }
  });

  // ── Patient Gallery ───────────────────────────────────────────────────────
  app.get("/api/patient/gallery", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const rows = await pool.query(
        `SELECT id, user_id, image_url, public_id, caption, file_type, created_at FROM patient_gallery WHERE user_id = $1 ORDER BY created_at DESC`,
        [req.user!.id]
      );
      res.json(rows.rows);
    } catch {
      res.status(500).json({ message: "Failed to fetch gallery" });
    }
  });

  app.post(
    "/api/patient/gallery/upload",
    authenticateToken,
    galleryUpload.single("image"),
    async (req: AuthRequest, res: Response) => {
      try {
        if (!isCloudinaryConfigured()) {
          return res.status(503).json({ message: "Image storage not configured" });
        }
        if (!req.file) return res.status(400).json({ message: "No image provided" });
        const existing = await pool.query(
          `SELECT id FROM patient_gallery WHERE user_id = $1`,
          [req.user!.id]
        );
        if (existing.rows.length >= 20) {
          return res.status(400).json({ message: "Gallery limit is 20 images" });
        }
        const caption = typeof req.body.caption === "string" ? req.body.caption.trim() : null;
        const uploaded = await uploadGalleryImage(
          req.file.buffer,
          req.file.mimetype,
          `patient_gallery/${req.user!.id}`
        );
        const result = await pool.query(
          `INSERT INTO patient_gallery (user_id, image_url, public_id, caption, file_type)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [req.user!.id, uploaded.secureUrl, uploaded.publicId, caption, req.file.mimetype]
        );
        res.status(201).json(result.rows[0]);
      } catch (err: any) {
        console.error("[patient gallery upload]", err);
        res.status(400).json({ message: err?.message ?? "Upload failed" });
      }
    }
  );

  app.patch("/api/patient/gallery/:imageId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { caption } = req.body;
      const result = await pool.query(
        `UPDATE patient_gallery SET caption = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
        [caption, req.params.imageId, req.user!.id]
      );
      if (!result.rows.length) return res.status(404).json({ message: "Image not found" });
      res.json(result.rows[0]);
    } catch {
      res.status(500).json({ message: "Failed to update caption" });
    }
  });

  app.delete("/api/patient/gallery/:imageId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const result = await pool.query(
        `DELETE FROM patient_gallery WHERE id = $1 AND user_id = $2 RETURNING *`,
        [req.params.imageId, req.user!.id]
      );
      if (!result.rows.length) return res.status(404).json({ message: "Image not found" });
      const img = result.rows[0];
      if (img.public_id) {
        await deleteCloudinaryImage(img.public_id).catch(() => {});
      }
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Failed to delete image" });
    }
  });

  app.get("/api/admin/patients/:userId/gallery", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const rows = await pool.query(
        `SELECT id, user_id, image_url, public_id, caption, file_type, created_at FROM patient_gallery WHERE user_id = $1 ORDER BY created_at DESC`,
        [req.params.userId]
      );
      res.json(rows.rows);
    } catch {
      res.status(500).json({ message: "Failed to fetch patient gallery" });
    }
  });

  // ── Patient self-service analytics ───────────────────────────────────────
  app.get("/api/patient/analytics", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.id) return res.status(401).json({ message: "Not authenticated" });
      const userId = req.user.id;
      const client = await pool.connect();
      let statsRows: any, monthRows: any, providerRows: any, packageRows: any;
      try {
        statsRows = await client.query(`
          SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed,
            COUNT(*) FILTER (WHERE status IN ('cancelled','cancelled_by_patient','cancelled_by_provider')) AS cancelled,
            COUNT(*) FILTER (WHERE status IN ('pending','confirmed')) AS upcoming,
            COALESCE(SUM(total_amount::numeric) FILTER (WHERE payment_status = 'completed'), 0) AS total_spend,
            COALESCE(SUM(total_amount::numeric) FILTER (WHERE payment_status = 'completed' AND date::date >= CURRENT_DATE - INTERVAL '30 days'), 0) AS spend_30d,
            COALESCE(SUM(total_amount::numeric) FILTER (WHERE payment_status = 'completed' AND date::date >= DATE_TRUNC('month', NOW())), 0) AS spend_this_month
          FROM appointments
          WHERE patient_id = $1
        `, [userId]);
        monthRows = await client.query(`
          SELECT TO_CHAR(DATE_TRUNC('month', date::date), 'Mon ''YY') AS month,
                 COALESCE(SUM(total_amount::numeric) FILTER (WHERE payment_status = 'completed'), 0) AS spend,
                 COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                 COUNT(*) FILTER (WHERE status IN ('cancelled','cancelled_by_patient','cancelled_by_provider')) AS cancelled
          FROM appointments
          WHERE patient_id = $1
            AND date::date >= CURRENT_DATE - INTERVAL '12 months'
          GROUP BY DATE_TRUNC('month', date::date)
          ORDER BY DATE_TRUNC('month', date::date)
        `, [userId]);
        providerRows = await client.query(`
          SELECT p.id AS provider_id,
                 COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), p.clinic_name, 'Provider') AS provider_name,
                 p.provider_type,
                 COUNT(*) AS visit_count,
                 MAX(a.date) AS last_visit,
                 COALESCE(SUM(a.total_amount::numeric) FILTER (WHERE a.payment_status = 'completed'), 0) AS total_spent
          FROM appointments a
          JOIN providers p ON p.id = a.provider_id
          JOIN users u ON u.id = p.user_id
          WHERE a.patient_id = $1 AND a.status = 'completed'
          GROUP BY p.id, u.first_name, u.last_name, p.clinic_name, p.provider_type
          ORDER BY visit_count DESC LIMIT 5
        `, [userId]);
        packageRows = await client.query(`
          SELECT pk.name AS package_name,
                 up.status,
                 up.purchased_at,
                 up.expires_at,
                 pk.price::numeric AS price_native,
                 COALESCE(up.used_sessions, 0) AS used_sessions,
                 pk.session_count AS total_sessions
          FROM user_packages up
          JOIN packages pk ON pk.id = up.package_id
          WHERE up.user_id = $1
          ORDER BY up.purchased_at DESC LIMIT 10
        `, [userId]);
      } finally {
        client.release();
      }
      const s = statsRows.rows[0];
      res.json({
        stats: {
          total: Number(s.total),
          completed: Number(s.completed),
          cancelled: Number(s.cancelled),
          upcoming: Number(s.upcoming),
          totalSpend: parseFloat(s.total_spend),
          spend30d: parseFloat(s.spend_30d),
          spendThisMonth: parseFloat(s.spend_this_month),
        },
        monthlySpend: monthRows.rows.map((r: any) => ({
          month: r.month,
          spend: parseFloat(r.spend),
          completed: Number(r.completed),
          cancelled: Number(r.cancelled),
        })),
        topProviders: providerRows.rows.map((r: any) => ({
          providerId: r.provider_id,
          name: r.provider_name,
          type: r.provider_type,
          visitCount: Number(r.visit_count),
          lastVisit: String(r.last_visit).slice(0, 10),
          totalSpent: parseFloat(r.total_spent),
        })),
        packages: packageRows.rows.map((r: any) => ({
          name: r.package_name,
          status: r.status,
          purchasedAt: r.purchased_at,
          expiresAt: r.expires_at,
          priceNative: parseFloat(r.price_native),
          usedSessions: Number(r.used_sessions),
          totalSessions: r.total_sessions ? Number(r.total_sessions) : null,
        })),
      });
    } catch (error) {
      console.error("[patient/analytics]", error);
      res.status(500).json({ message: "Failed to load patient analytics" });
    }
  });

  // ── GET /api/patient/prescriptions ─────────────────────────────────────────
  // Self-serve: patient fetches their own prescriptions for the Documents tab.
  app.get("/api/patient/prescriptions", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "patient") return res.status(403).json({ message: "Patient account required" });
      const prescriptions = await storage.getPrescriptionsByPatient(req.user.id);
      res.json(prescriptions ?? []);
    } catch (err: any) {
      console.error("[GET /api/patient/prescriptions]", err);
      res.status(500).json({ message: "Failed to load prescriptions" });
    }
  });
}
