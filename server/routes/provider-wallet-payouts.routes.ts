/**
 * Provider Wallet & Payouts — earnings, payout requests, wallet ledger
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

export function registerProviderWalletPayoutsRoutes(app: Express): void {
  app.get("/api/provider/earnings", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider") {
        return res.status(403).json({ message: "Provider account required" });
      }
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });

      const [richResult, summary] = await Promise.all([
        pool.query(`
          SELECT
            pe.id,
            pe.provider_id                                        AS "providerId",
            pe.appointment_id                                     AS "appointmentId",
            pe.total_amount                                       AS "totalAmount",
            pe.platform_fee                                       AS "platformFee",
            pe.provider_earning                                   AS "providerEarning",
            pe.status,
            pe.paid_at                                            AS "paidAt",
            pe.paid_by_user_id                                    AS "paidByUserId",
            pe.payout_reference                                   AS "payoutReference",
            pe.display_currency                                   AS "displayCurrency",
            pe.display_amount                                     AS "displayAmount",
            pe.exchange_rate_used                                 AS "exchangeRateUsed",
            pe.created_at                                         AS "createdAt",
            -- appointment context
            a.date                                                AS "appointmentDate",
            a.start_time                                          AS "startTime",
            a.visit_type                                          AS "visitType",
            a.appointment_number                                  AS "appointmentNumber",
            a.status                                              AS "appointmentStatus",
            a.payment_status                                      AS "paymentStatus",
            a.promo_code                                          AS "promoCode",
            a.promo_discount                                      AS "promoDiscount",
            a.tax_amount                                          AS "taxAmount",
            a.refund_status                                       AS "refundStatus",
            a.refund_amount                                       AS "refundAmount",
            a.cancelled_by                                        AS "cancelledBy",
            a.cancelled_at                                        AS "cancelledAt",
            a.service_price_snapshot                              AS "servicePriceSnapshot",
            a.pricing_breakdown                                   AS "pricingBreakdown",
            a.country_code                                        AS "countryCode",
            a.platform_fee_amount                                 AS "appointmentPlatformFee",
            -- service info
            s.name                                                AS "serviceName",
            -- patient info (first name only for privacy)
            u.first_name                                          AS "patientFirstName",
            u.last_name                                           AS "patientLastName"
          FROM provider_earnings pe
          LEFT JOIN appointments a  ON a.id  = pe.appointment_id
          LEFT JOIN services     s  ON s.id  = a.service_id
          LEFT JOIN users        u  ON u.id  = a.patient_id
          WHERE pe.provider_id = $1
          ORDER BY pe.created_at DESC
        `, [provider.id]),
        storage.getEarningsSummary(provider.id),
      ]);

      res.json({ earnings: richResult.rows, summary });
    } catch (error) {
      console.error("[GET /api/provider/earnings] error:", error);
      res.status(500).json({ message: "Failed to fetch earnings" });
    }
  });

  // ── GET /api/provider/earnings/export  — CSV download ───────────────────
  app.get("/api/provider/earnings/export", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider account required" });
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });

      const result = await pool.query(`
        SELECT
          pe.created_at,
          a.appointment_number,
          a.date                    AS appointment_date,
          a.start_time,
          a.visit_type,
          s.name                    AS service_name,
          CONCAT(u.first_name, ' ', u.last_name) AS patient_name,
          a.service_price_snapshot  AS service_price,
          a.promo_discount,
          a.tax_amount,
          pe.total_amount           AS patient_paid,
          pe.platform_fee,
          pe.provider_earning       AS net_earning,
          COALESCE(pe.display_currency, 'USD') AS currency,
          pe.status,
          pe.paid_at,
          a.refund_status,
          a.refund_amount,
          a.payment_status
        FROM provider_earnings pe
        LEFT JOIN appointments a ON a.id  = pe.appointment_id
        LEFT JOIN services     s ON s.id  = a.service_id
        LEFT JOIN users        u ON u.id  = a.patient_id
        WHERE pe.provider_id = $1
        ORDER BY pe.created_at DESC
      `, [provider.id]);

      const headers = [
        "Date","Appointment #","Appointment Date","Time","Visit Type","Service",
        "Patient","Service Price","Promo Discount","Tax","Patient Paid",
        "Platform Fee","Net Earning","Currency","Status","Paid On",
        "Refund Status","Refund Amount","Payment Status",
      ];

      const rows = result.rows.map((r: any) => [
        r.created_at ? new Date(r.created_at).toISOString().slice(0,10) : "",
        r.appointment_number ?? "",
        r.appointment_date ?? "",
        r.start_time ?? "",
        r.visit_type ?? "",
        r.service_name ?? "",
        r.patient_name?.trim() ?? "",
        r.service_price ?? "0",
        r.promo_discount ?? "0",
        r.tax_amount ?? "0",
        r.patient_paid ?? "0",
        r.platform_fee ?? "0",
        r.net_earning ?? "0",
        r.currency ?? "USD",
        r.status ?? "",
        r.paid_at ? new Date(r.paid_at).toISOString().slice(0,10) : "",
        r.refund_status ?? "",
        r.refund_amount ?? "0",
        r.payment_status ?? "",
      ]);

      const escape = (v: unknown) => {
        const s = String(v ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");

      const filename = `earnings_${provider.id.slice(0,8)}_${new Date().toISOString().slice(0,10)}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error("[GET /api/provider/earnings/export] error:", error);
      res.status(500).json({ message: "Failed to export earnings" });
    }
  });

  app.get("/api/provider/payout-summary", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider account required" });
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });

      const result = await pool.query(`
        SELECT
          COALESCE(pw.available_balance, 0) AS wallet_balance,
          COALESCE((
            SELECT SUM(pr.amount) FROM payout_requests pr
            WHERE pr.provider_id = $1 AND pr.status IN ('pending','approved')
          ), 0) AS in_flight_amount,
          COALESCE((
            SELECT SUM(pr.amount) FROM payout_requests pr
            WHERE pr.provider_id = $1 AND pr.status = 'paid'
          ), 0) AS lifetime_paid_out,
          COALESCE((
            SELECT SUM(pe.provider_earning) FROM provider_earnings pe
            WHERE pe.provider_id = $1 AND pe.status = 'paid'
          ), 0) AS total_paid_earnings
        FROM provider_wallets pw
        WHERE pw.provider_id = $1
      `, [provider.id]);

      const row = result.rows[0] || {};
      const walletBalance = Number(row.wallet_balance || 0);
      const inFlight      = Number(row.in_flight_amount || 0);
      const availableBalance = Math.max(0, walletBalance);
      const localCurrency = countryCurrency(provider.countryCode as CountryCode | undefined);
      res.json({
        availableBalance,
        pendingPayouts:  inFlight,
        lifetimePaidOut: Number(row.lifetime_paid_out   || 0),
        lifetimePaidEarnings: Number(row.total_paid_earnings || 0),
        currency: localCurrency,
      });
    } catch (e: any) {
      console.error("[GET /api/provider/payout-summary]", e);
      res.status(500).json({ message: "Failed to load payout summary" });
    }
  });

  // Create a payout request — wrapped in a serialisable transaction with a
  // FOR UPDATE lock on provider_wallets to prevent concurrent double-spend.
  app.post("/api/provider/payout-requests", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider account required" });
    const provider = await storage.getProviderByUserId(req.user!.id);
    if (!provider) return res.status(404).json({ message: "Provider not found" });

    const { amount, method, bankName, accountHolder, accountNumberMasked, notes } = req.body;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ message: "A positive amount is required" });
    }

    // Convert to USD before entering the transaction — getRates() is a cache lookup,
    // not a DB write, so it is safe to call outside the serialised block.
    const _prRates = await getRates();
    const _prLocalCurrency = countryCurrency(provider.countryCode as CountryCode | undefined);
    const _prAmtUSD = toUSDSync(Number(amount), _prLocalCurrency, _prRates);
    const _prRate = _prRates[_prLocalCurrency] ?? 1;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // ── Row-level lock — prevents two concurrent payout requests from both
      // passing the balance check before either inserts its payout_request row.
      // INSERT … ON CONFLICT DO NOTHING ensures a wallet row always exists.
      await client.query(`
        INSERT INTO provider_wallets (provider_id, available_balance, held_balance, country_code)
        VALUES ($1, 0, 0, $2) ON CONFLICT (provider_id) DO NOTHING
      `, [provider.id, provider.countryCode || "HU"]);
      const walletLock = await client.query(
        `SELECT is_frozen, frozen_reason, available_balance FROM provider_wallets WHERE provider_id = $1 FOR UPDATE`,
        [provider.id],
      );

      const walletRow = walletLock.rows[0];
      if (walletRow?.is_frozen) {
        await client.query("ROLLBACK");
        client.release();
        return res.status(403).json({ message: "Withdrawals are restricted while your wallet is under review." });
      }

      // ── Balance check (inside lock) ────────────────────────────────────────
      const summaryRes = await client.query(`
        SELECT
          COALESCE(SUM(pe.provider_earning) FILTER (WHERE pe.status = 'pending'), 0) AS total_pending,
          COALESCE((SELECT SUM(pr.amount) FROM payout_requests pr
                    WHERE pr.provider_id = $1 AND pr.status IN ('pending','approved')), 0) AS in_flight
        FROM provider_earnings pe WHERE pe.provider_id = $1
      `, [provider.id]);
      const totalPending = Number(summaryRes.rows[0]?.total_pending || 0);
      const inFlight     = Number(summaryRes.rows[0]?.in_flight     || 0);
      const available    = Math.max(0, totalPending - inFlight);
      if (_prAmtUSD > available + 0.001) {
        await client.query("ROLLBACK");
        client.release();
        return res.status(400).json({ message: `Requested amount exceeds available balance (${formatSync(available, _prLocalCurrency, _prRates)})` });
      }

      // ── Disallow duplicate open requests (inside lock) ─────────────────────
      const openReq = await client.query(`
        SELECT id FROM payout_requests WHERE provider_id = $1 AND status IN ('pending','approved') LIMIT 1
      `, [provider.id]);
      if (openReq.rows.length > 0) {
        await client.query("ROLLBACK");
        client.release();
        return res.status(400).json({ message: "You already have an open payout request. Please wait for it to be processed." });
      }

      // ── Insert payout request ──────────────────────────────────────────────
      const result = await client.query(`
        INSERT INTO payout_requests
          (provider_id, amount, currency, display_currency, display_amount, exchange_rate_used,
           method, bank_name, account_holder, account_number_masked, notes)
        VALUES ($1, $2, $8, $9, $10, $11, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        provider.id,
        _prAmtUSD.toFixed(2),
        method || "bank_transfer",
        bankName || null,
        accountHolder || null,
        accountNumberMasked || null,
        notes || null,
        "USD",
        _prLocalCurrency,
        Number(amount).toFixed(2),
        _prRate.toFixed(6),
      ]);

      const newRequest = result.rows[0];
      if (!newRequest) throw new Error("Payout request INSERT returned no row");

      // ── Wallet: move requested amount from available → held (inside lock) ──
      await client.query(`
        INSERT INTO provider_wallets (provider_id, available_balance, held_balance, country_code)
        VALUES ($1, -$2, $2, $3)
        ON CONFLICT (provider_id) DO UPDATE SET
          available_balance = GREATEST(0, provider_wallets.available_balance - $2),
          held_balance = provider_wallets.held_balance + $2,
          updated_at = NOW()
      `, [provider.id, _prAmtUSD, provider.countryCode || "HU"]);

      const walletAfter = await client.query(
        `SELECT available_balance FROM provider_wallets WHERE provider_id = $1`,
        [provider.id],
      );
      const balAfter = Number(walletAfter.rows[0]?.available_balance ?? 0);

      await client.query(`
        INSERT INTO provider_ledger
          (provider_id, amount, entry_type, reference_id, description, actor_id, balance_after, country_code)
        VALUES ($1, $2, 'payout_held', $3, $4, $5, $6, $7)
      `, [
        provider.id, -_prAmtUSD, newRequest.id,
        `Payout request created — ${_prAmtUSD.toFixed(2)} USD held`,
        req.user!.id, balAfter, provider.countryCode || "HU",
      ]);

      await client.query("COMMIT");
      client.release();

      // ── Notify admins (best-effort, outside transaction) ──────────────────
      pool.query(`SELECT id FROM users WHERE role IN ('admin','global_admin') LIMIT 5`)
        .then(async (admins) => {
          for (const a of admins.rows) {
            await storage.createUserNotification({
              userId: a.id, type: "payment",
              title: "New payout request",
              message: `A provider has requested a payout of ${formatSync(_prAmtUSD, _prLocalCurrency, _prRates)}.`,
              isRead: false,
            });
          }
        })
        .catch((notifyErr: any) => {
          console.error("[PAYOUT_ERROR] Core wallet adjustment operations encountered an update failure:", notifyErr);
        });

      res.status(201).json(newRequest);
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
      console.error("[POST /api/provider/payout-requests]", e);
      res.status(500).json({ message: "Failed to create payout request" });
    }
  });

  // Provider: list own payout requests
  app.get("/api/provider/payout-requests", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider account required" });
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });

      const result = await pool.query(`
        SELECT pr.*,
               u.first_name || ' ' || u.last_name AS reviewed_by_name
        FROM payout_requests pr
        LEFT JOIN users u ON u.id = pr.reviewed_by
        WHERE pr.provider_id = $1
        ORDER BY pr.created_at DESC
      `, [provider.id]);
      res.json(result.rows);
    } catch (e: any) {
      res.status(500).json({ message: "Failed to load payout requests" });
    }
  });

  // Admin: list payout requests (all or filtered by status)
  app.get("/api/provider/wallet", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider account required" });
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const wallet = await storage.getOrCreateProviderWallet(provider.id);
      res.json(wallet);
    } catch (e: any) {
      console.error("[GET /api/provider/wallet]", e);
      res.status(500).json({ message: "Failed to load wallet" });
    }
  });

  // Provider: get own ledger
  app.get("/api/provider/wallet/ledger", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider account required" });
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;
      const entries = await storage.getProviderLedger(provider.id, limit, offset);
      res.json(entries);
    } catch (e: any) {
      res.status(500).json({ message: "Failed to load ledger" });
    }
  });

  // Provider: monthly earnings for chart (last 12 months)
  app.get("/api/provider/wallet/monthly", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider account required" });
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });

      const result = await pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
          SUM(CASE WHEN amount > 0 AND entry_type = 'booking_income' THEN amount ELSE 0 END) AS gross_income,
          SUM(CASE WHEN amount < 0 AND entry_type IN ('payout_deduction','payout_held') THEN ABS(amount) ELSE 0 END) AS payouts,
          COUNT(*) FILTER (WHERE entry_type = 'booking_income') AS booking_count
        FROM provider_ledger
        WHERE provider_id = $1
          AND created_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY DATE_TRUNC('month', created_at) ASC
      `, [provider.id]);
      res.json(result.rows);
    } catch (e: any) {
      res.status(500).json({ message: "Failed to load monthly earnings" });
    }
  });

  // Provider: tax/commission breakdown for current period
  app.get("/api/provider/wallet/breakdown", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider account required" });
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });

      const result = await pool.query(`
        SELECT
          SUM(CASE WHEN entry_type = 'booking_income' THEN amount ELSE 0 END) AS net_income,
          ABS(SUM(CASE WHEN entry_type = 'platform_fee_deduction' THEN amount ELSE 0 END)) AS platform_fees,
          ABS(SUM(CASE WHEN entry_type = 'tax_deduction' THEN amount ELSE 0 END)) AS tax_withheld,
          ABS(SUM(CASE WHEN entry_type = 'commission_deduction' THEN amount ELSE 0 END)) AS commission,
          COUNT(*) FILTER (WHERE entry_type = 'booking_income') AS total_bookings
        FROM provider_ledger
        WHERE provider_id = $1
          AND created_at >= DATE_TRUNC('month', NOW())
      `, [provider.id]);
      res.json(result.rows[0] || {});
    } catch (e: any) {
      res.status(500).json({ message: "Failed to load breakdown" });
    }
  });

  // Provider: cancel a pending payout request — fully atomic
  app.delete("/api/provider/payout-requests/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider account required" });
    const provider = await storage.getProviderByUserId(req.user.id);
    if (!provider) return res.status(404).json({ message: "Provider not found" });

    const { id } = req.params;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Lock the payout request row so concurrent cancels can't race
      const existing = await client.query(
        `SELECT * FROM payout_requests WHERE id = $1 AND provider_id = $2 FOR UPDATE`,
        [id, provider.id],
      );
      if (!existing.rows[0]) {
        await client.query("ROLLBACK");
        client.release();
        return res.status(404).json({ message: "Payout request not found" });
      }
      if (existing.rows[0].status !== "pending") {
        await client.query("ROLLBACK");
        client.release();
        return res.status(400).json({ message: "Only pending requests can be cancelled" });
      }

      const reqAmount = Number(existing.rows[0].amount || 0);

      // Cancel the request
      await client.query(
        `UPDATE payout_requests SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
        [id],
      );

      // Return held amount to available balance (atomic with the status update)
      await client.query(`
        UPDATE provider_wallets SET
          available_balance = available_balance + $2,
          held_balance      = GREATEST(0, held_balance - $2),
          updated_at        = NOW()
        WHERE provider_id = $1
      `, [provider.id, reqAmount]);

      const wBal = await client.query(
        `SELECT available_balance FROM provider_wallets WHERE provider_id = $1`,
        [provider.id],
      );

      await client.query(`
        INSERT INTO provider_ledger
          (provider_id, amount, entry_type, reference_id, description, actor_id, balance_after, country_code)
        VALUES ($1, $2, 'payout_returned', $3, $4, $5, $6, $7)
      `, [
        provider.id, reqAmount, id,
        "Payout request cancelled by provider — amount returned to wallet",
        req.user!.id, wBal.rows[0]?.available_balance ?? 0, provider.countryCode || "HU",
      ]);

      await client.query("COMMIT");
      client.release();

      res.json({ message: "Payout request cancelled" });
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
      console.error("[DELETE /api/provider/payout-requests/:id]", e);
      res.status(500).json({ message: "Failed to cancel payout request" });
    }
  });

  // ── Admin Wallet Routes ───────────────────────────────────────────────────────

  // Admin: list all provider wallets

}
