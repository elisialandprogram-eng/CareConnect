/**
 * Admin Financial routes — extracted from server/routes.ts
 *
 * Covers: wallets, wallet-transactions, wallet-adjust, invoices,
 * financial-overview/detail/mark-paid/export/reconciliation,
 * provider-earnings/payout-requests/provider-wallets,
 * pricing-overrides, promo-codes, invoice-template, overdue-invoices,
 * invoices/send-reminder, refunds/refund-rules, CSV exports.
 */

import type { Express, Response } from "express";
import { storage } from "../../storage";
import { pool } from "../../db";
import { z } from "zod";
import {
  authenticateToken,
  requireAdmin,
  AuthRequest,
} from "../../middleware/auth";
import {
  requirePermission,
  PERMISSIONS,
} from "../../middleware/rbac";
import {
  isAdminRole,
  canAccessCountry,
  listingCountryFilter,
  type CountryCode,
} from "../../middleware/country";
import { getRates, formatSync, formatLocal } from "../../services/currency";
import { countryCurrency } from "../../middleware/country";
import { getStripe } from "../../stripe";
import { createInvoiceForAppointment } from "../../utils/invoice-helper";

import { round2, roundToCents } from "../../lib/math";

function toCsv(rows: any[], cols: string[]): string {
  const header = cols.join(",");
  const lines = rows.map(r =>
    cols.map(c => {
      const v = r[c] ?? "";
      const s = String(v).replace(/"/g, '""');
      return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
    }).join(",")
  );
  return [header, ...lines].join("\n");
}

export function registerAdminFinancialRoutes(app: Express): void {

  // ── Wallets ───────────────────────────────────────────────────────────────
  app.get("/api/admin/wallets", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PAYMENTS_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const search = (req.query.search as string | undefined)?.toLowerCase();
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const allWallets = await storage.getAllWallets();
      const wallets = allWallets.filter(w => {
        if (countryFilter && (w as any).countryCode !== countryFilter && (w.user as any)?.countryCode !== countryFilter) return false;
        if (search) {
          return (w.user as any)?.email?.toLowerCase().includes(search) ||
                 (w.user as any)?.firstName?.toLowerCase().includes(search) ||
                 (w.user as any)?.lastName?.toLowerCase().includes(search);
        }
        return true;
      });
      res.json(wallets);
    } catch (error) {
      res.status(500).json({ message: "Failed to get wallets" });
    }
  });

  app.get("/api/admin/wallets/:userId/transactions", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PAYMENTS_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const wallet = await storage.getWalletByUserId(req.params.userId);
      if (!wallet) return res.status(404).json({ message: "Wallet not found" });
      if (!canAccessCountry(req.user!, (wallet as any).countryCode)) {
        return res.status(403).json({ message: "Cross-country access denied" });
      }
      const transactions = await storage.getWalletTransactions(req.params.userId);
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ message: "Failed to get transactions" });
    }
  });

  app.post("/api/admin/wallets/:userId/adjust", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PAYMENTS_MANAGE), async (req: AuthRequest, res: Response) => {
    try {
      const { amount, description, type } = req.body;
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount === 0) {
        return res.status(400).json({ message: "Valid non-zero amount required" });
      }
      if (!["credit", "debit", "adjustment", "admin_adjust"].includes(type || "adjustment")) {
        return res.status(400).json({ message: "Invalid adjustment type" });
      }

      const wallet = await storage.getWalletByUserId(req.params.userId);
      if (!wallet) return res.status(404).json({ message: "Wallet not found" });

      if (!canAccessCountry(req.user!, (wallet as any).countryCode)) {
        return res.status(403).json({ message: "Cross-country wallet adjustment denied" });
      }

      const currentBalance = round2(parseFloat(String(wallet.balance || "0")));
      const adjustmentAmountUSD = round2(parsedAmount);

      if (adjustmentAmountUSD < 0 && Math.abs(adjustmentAmountUSD) > currentBalance + 0.01) {
        return res.status(400).json({
          message: `Debit of $${Math.abs(adjustmentAmountUSD).toFixed(2)} exceeds balance of $${currentBalance.toFixed(2)}`,
        });
      }

      if (adjustmentAmountUSD > 0) {
        await storage.topUpWallet(req.params.userId, adjustmentAmountUSD, {
          description: description || "Admin adjustment",
          referenceType: type || "admin_adjust",
          createdById: req.user!.id,
        });
      } else {
        await storage.debitWallet(req.params.userId, Math.abs(adjustmentAmountUSD), {
          description: description || "Admin adjustment",
          referenceType: type || "admin_adjust",
        });
      }

      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address, country_code)
         VALUES ($1, 'wallet_adjust', 'wallet', $2, $3, $4, $5)`,
        [
          req.user!.id,
          req.params.userId,
          JSON.stringify({ amount: adjustmentAmountUSD, type: type || "admin_adjust", description, prevBalance: currentBalance }),
          req.ip ?? null,
          req.user!.countryCode ?? null,
        ]
      ).catch(() => {});

      res.json({ success: true, newBalance: round2(currentBalance + adjustmentAmountUSD) });
    } catch (error) {
      console.error("Wallet adjustment error:", error);
      res.status(500).json({ message: "Failed to adjust wallet" });
    }
  });

  // ── Invoices ──────────────────────────────────────────────────────────────
  app.get("/api/admin/invoices", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const allInvoices = await storage.getAllInvoices();
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const invoices = countryFilter
        ? allInvoices.filter((i: any) => i.countryCode === countryFilter)
        : allInvoices;
      res.json(invoices);
    } catch (error) {
      res.status(500).json({ message: "Failed to get invoices" });
    }
  });

  // ── Financial overview ────────────────────────────────────────────────────
  app.get("/api/admin/financial/providers-overview", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PAYMENTS_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const cc = countryFilter ?? null;
      const page  = Math.max(1, parseInt((req.query.page  as string) || "1",  10));
      const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) || "50", 10)));
      const offset = (page - 1) * limit;

      const [{ rows }, { rows: countRows }] = await Promise.all([
        pool.query(`
        SELECT
          p.id AS provider_id,
          COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), p.clinic_name, 'Unknown') AS provider_name,
          u.email AS provider_email,
          p.country_code AS country_code,
          p.provider_type AS provider_type,
          COALESCE(SUM(CASE WHEN a.payment_status = 'completed' THEN a.total_amount::numeric ELSE 0 END), 0) AS gross_revenue,
          COALESCE(SUM(CASE WHEN a.payment_status = 'completed' THEN COALESCE(a.platform_fee_amount::numeric, 0) ELSE 0 END), 0) AS total_platform_fees,
          COALESCE(SUM(CASE WHEN a.payment_status = 'completed' THEN COALESCE(a.refund_amount::numeric, 0) ELSE 0 END), 0) AS total_refunds,
          0 AS total_promo_discount,
          COALESCE(SUM(CASE WHEN a.payment_status = 'completed'
            THEN a.total_amount::numeric - COALESCE(a.platform_fee_amount::numeric, 0) - COALESCE(a.refund_amount::numeric, 0)
            ELSE 0 END), 0) AS net_earnings,
          COUNT(CASE WHEN a.payment_status = 'completed' THEN 1 END) AS completed_appointments,
          COUNT(CASE WHEN a.status IN ('cancelled', 'no_show') THEN 1 END) AS cancelled_appointments,
          COUNT(a.id) AS total_appointments,
          MAX(a.date) AS last_appointment_date,
          COALESCE(pw.available_balance::numeric, 0) AS pending_payout,
          COALESCE((SELECT COALESCE(SUM(pr2.amount::numeric), 0) FROM payout_requests pr2 WHERE pr2.provider_id = p.id AND pr2.status = 'paid'), 0) AS paid_payout
        FROM providers p
        JOIN users u ON u.id = p.user_id
        LEFT JOIN appointments a ON a.provider_id = p.id
        LEFT JOIN provider_wallets pw ON pw.provider_id = p.id
        WHERE ($1::text IS NULL OR p.country_code::text = $1)
        GROUP BY p.id, u.first_name, u.last_name, u.email, p.clinic_name, p.country_code, p.provider_type, pw.available_balance
        ORDER BY gross_revenue DESC
        LIMIT $2 OFFSET $3
      `, [cc, limit, offset]),
        pool.query<{ total: string }>(
          `SELECT COUNT(DISTINCT p.id) AS total
           FROM providers p
           WHERE ($1::text IS NULL OR p.country_code::text = $1)`,
          [cc],
        ),
      ]);
      const total = Number(countRows[0]?.total ?? 0);
      const currency_note = "All monetary values are stored and returned in USD (canonical currency). Use /api/currency/rates to convert for display.";
      res.json({ providers: rows, total, page, limit, totalPages: Math.ceil(total / limit), currency_note });
    } catch (err) {
      console.error("financial-overview error:", err);
      res.status(500).json({ message: "Failed to fetch financial overview" });
    }
  });

  app.get("/api/admin/financial/providers/:providerId/detail", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PAYMENTS_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const { providerId } = req.params;

      const [providerRow, summaryRow, monthlyRows, visitTypeRows, earningRows, walletRow, paidPayoutRow] = await Promise.all([
        // Provider + user info via JOIN
        pool.query(`
          SELECT p.id, u.first_name, u.last_name, u.email, u.phone,
                 COALESCE(u.profile_image_url, u.avatar_url) AS avatar_url,
                 p.provider_type, p.country_code::text AS country_code,
                 p.status
          FROM providers p
          JOIN users u ON u.id = p.user_id
          WHERE p.id = $1
          LIMIT 1
        `, [providerId]),

        // Summary aggregates
        pool.query(`
          SELECT
            COUNT(CASE WHEN a.status = 'completed' THEN 1 END)::text AS completed_count,
            COUNT(CASE WHEN a.status IN ('cancelled','no_show') THEN 1 END)::text AS cancelled_count,
            COUNT(CASE WHEN a.status IN ('confirmed','pending','in_progress') THEN 1 END)::text AS active_count,
            COALESCE(SUM(CASE WHEN a.payment_status = 'completed' THEN a.total_amount::numeric ELSE 0 END), 0)::text AS gross_revenue,
            COALESCE(SUM(CASE WHEN a.payment_status = 'completed' THEN COALESCE(a.platform_fee_amount::numeric,0) ELSE 0 END), 0)::text AS platform_fees,
            COALESCE(SUM(CASE WHEN a.payment_status = 'completed' THEN COALESCE(a.promo_discount::numeric,0) ELSE 0 END), 0)::text AS promo_discounts,
            COALESCE(SUM(CASE WHEN a.payment_status = 'completed' THEN COALESCE(a.tax_amount::numeric,0) ELSE 0 END), 0)::text AS tax_collected,
            COALESCE(SUM(CASE WHEN a.payment_status = 'refunded' THEN COALESCE(a.refund_amount::numeric,0) ELSE 0 END), 0)::text AS refunds_issued,
            COALESCE(SUM(CASE WHEN a.payment_status = 'completed'
              THEN a.total_amount::numeric - COALESCE(a.platform_fee_amount::numeric,0)
              ELSE 0 END), 0)::text AS net_earnings,
            COUNT(CASE WHEN a.payment_status = 'completed' THEN 1 END)::text AS pending_records
          FROM appointments a
          WHERE a.provider_id = $1
        `, [providerId]),

        // Monthly breakdown (last 13 months)
        pool.query(`
          SELECT
            TO_CHAR(a.date::date, 'YYYY-MM') AS month,
            COUNT(CASE WHEN a.status = 'completed' THEN 1 END)::text AS completed,
            COUNT(CASE WHEN a.status IN ('cancelled','no_show') THEN 1 END)::text AS cancelled,
            COALESCE(SUM(CASE WHEN a.payment_status = 'completed' THEN a.total_amount::numeric ELSE 0 END), 0)::text AS gross_revenue,
            COALESCE(SUM(CASE WHEN a.payment_status = 'completed' THEN COALESCE(a.platform_fee_amount::numeric,0) ELSE 0 END), 0)::text AS platform_fees,
            COALESCE(SUM(CASE WHEN a.payment_status = 'completed'
              THEN a.total_amount::numeric - COALESCE(a.platform_fee_amount::numeric,0)
              ELSE 0 END), 0)::text AS net_earnings
          FROM appointments a
          WHERE a.provider_id = $1
            AND a.date::date >= (CURRENT_DATE - INTERVAL '13 months')
          GROUP BY TO_CHAR(a.date::date, 'YYYY-MM')
          ORDER BY month ASC
        `, [providerId]),

        // By visit type
        pool.query(`
          SELECT
            a.visit_type,
            COUNT(CASE WHEN a.status = 'completed' THEN 1 END)::text AS completed,
            COALESCE(SUM(CASE WHEN a.payment_status = 'completed' THEN a.total_amount::numeric ELSE 0 END), 0)::text AS revenue
          FROM appointments a
          WHERE a.provider_id = $1
          GROUP BY a.visit_type
          ORDER BY revenue DESC
        `, [providerId]),

        // Earnings records (completed appointments treated as earnings)
        pool.query(`
          SELECT
            a.id,
            'pending' AS status,
            (a.total_amount::numeric - COALESCE(a.platform_fee_amount::numeric,0))::text AS provider_earning,
            COALESCE(a.platform_fee_amount, '0')::text AS platform_fee,
            COALESCE(a.total_amount, '0')::text AS total_amount,
            a.created_at,
            NULL::timestamptz AS paid_at,
            NULL::text AS payout_reference,
            a.appointment_number,
            a.date AS appointment_date,
            COALESCE(a.visit_type, 'online') AS visit_type,
            s.name AS service_name,
            COALESCE(a.promo_discount, '0')::text AS promo_discount,
            COALESCE(a.tax_amount, '0')::text AS tax_amount
          FROM appointments a
          LEFT JOIN services s ON s.id = a.service_id
          WHERE a.provider_id = $1
            AND a.payment_status = 'completed'
          ORDER BY a.date DESC
          LIMIT 200
        `, [providerId]),

        // Wallet balance
        pool.query(`
          SELECT COALESCE(pw.available_balance, '0')::text AS pending_payout
          FROM provider_wallets pw WHERE pw.provider_id = $1 LIMIT 1
        `, [providerId]),

        // Paid payouts total
        pool.query(`
          SELECT
            COALESCE(SUM(pr.amount::numeric), 0)::text AS paid_payout,
            COUNT(*)::text AS paid_records
          FROM payout_requests pr
          WHERE pr.provider_id = $1 AND pr.status = 'paid'
        `, [providerId]),
      ]);

      if (!providerRow.rows[0]) {
        return res.status(404).json({ message: "Provider not found" });
      }

      if (!canAccessCountry(req.user!, providerRow.rows[0].country_code)) {
        return res.status(404).json({ message: "Provider not found" });
      }

      const p = providerRow.rows[0];
      const s = summaryRow.rows[0] ?? {};
      const wallet = walletRow.rows[0];
      const paidPayout = paidPayoutRow.rows[0];

      res.json({
        provider: {
          id:            p.id,
          first_name:    p.first_name ?? "",
          last_name:     p.last_name ?? "",
          email:         p.email ?? "",
          phone:         p.phone ?? null,
          avatar_url:    p.avatar_url ?? null,
          provider_type: p.provider_type ?? "",
          country_code:  p.country_code ?? null,
          is_verified:   p.status === "approved" || p.status === "active",
        },
        summary: {
          completed_count:  s.completed_count  ?? "0",
          cancelled_count:  s.cancelled_count  ?? "0",
          active_count:     s.active_count     ?? "0",
          gross_revenue:    s.gross_revenue    ?? "0",
          platform_fees:    s.platform_fees    ?? "0",
          promo_discounts:  s.promo_discounts  ?? "0",
          tax_collected:    s.tax_collected    ?? "0",
          refunds_issued:   s.refunds_issued   ?? "0",
          net_earnings:     s.net_earnings     ?? "0",
          pending_payout:   wallet?.pending_payout  ?? "0",
          paid_payout:      paidPayout?.paid_payout ?? "0",
          pending_records:  s.pending_records  ?? "0",
          paid_records:     paidPayout?.paid_records ?? "0",
        },
        monthly:     monthlyRows.rows,
        byVisitType: visitTypeRows.rows,
        earnings:    earningRows.rows,
      });
    } catch (err) {
      console.error("financial-detail error:", err);
      res.status(500).json({ message: "Failed to fetch provider financial detail" });
    }
  });

  app.post("/api/admin/financial/providers/:providerId/mark-paid", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PAYMENTS_MANAGE), async (req: AuthRequest, res: Response) => {
    try {
      const { providerId } = req.params;
      const { payoutRequestId, paymentReference, notes } = req.body || {};
      if (!payoutRequestId) return res.status(400).json({ message: "payoutRequestId required" });
      const { rows } = await pool.query(
        `SELECT * FROM payout_requests WHERE id = $1 AND provider_id = $2`, [payoutRequestId, providerId]
      );
      if (!rows[0]) return res.status(404).json({ message: "Payout request not found" });
      if (rows[0].status === "paid") return res.status(409).json({ message: "Already marked paid" });
      await pool.query(
        `UPDATE payout_requests SET status = 'paid', paid_at = NOW(), payment_reference = $1, notes = COALESCE($2, notes), updated_at = NOW() WHERE id = $3`,
        [paymentReference || null, notes || null, payoutRequestId]
      );
      await pool.query(
        `UPDATE provider_wallets SET last_payout_date = NOW(), available_balance = GREATEST(0, available_balance - $1) WHERE provider_id = $2`,
        [rows[0].amount, providerId]
      );
      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
         VALUES ($1, 'payout_marked_paid', 'payout_request', $2, $3, $4)`,
        [req.user!.id, payoutRequestId, JSON.stringify({ providerId, amount: rows[0].amount, paymentReference }), req.user!.countryCode ?? null]
      ).catch(() => {});
      res.json({ ok: true });
    } catch (err: any) {
      console.error("mark-paid error:", err);
      res.status(500).json({ message: "Failed to mark paid" });
    }
  });

  app.get("/api/admin/financial/export-csv", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const cc = countryFilter ?? null;
      const { rows } = await pool.query(`
        SELECT
          p.id AS provider_id,
          COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), p.clinic_name, 'Unknown') AS provider_name,
          p.country_code,
          SUM(CASE WHEN a.payment_status = 'completed' THEN a.total_amount::numeric ELSE 0 END) AS gross_revenue,
          SUM(CASE WHEN a.payment_status = 'completed' THEN COALESCE(a.platform_fee_amount::numeric, 0) ELSE 0 END) AS platform_fees,
          SUM(CASE WHEN a.payment_status = 'completed' THEN COALESCE(a.refund_amount::numeric, 0) ELSE 0 END) AS total_refunds,
          COUNT(CASE WHEN a.payment_status = 'completed' THEN 1 END) AS completed_appointments
        FROM providers p
        JOIN users u ON u.id = p.user_id
        LEFT JOIN appointments a ON a.provider_id = p.id
        WHERE ($1::text IS NULL OR p.country_code::text = $1)
        GROUP BY p.id, u.first_name, u.last_name, p.clinic_name, p.country_code
        ORDER BY gross_revenue DESC
      `, [cc]);

      const csv = toCsv(rows, ["provider_id","provider_name","country_code","gross_revenue","platform_fees","total_refunds","completed_appointments"]);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=financial-overview.csv");
      res.send("# All amounts in USD (canonical currency)\n" + csv);
    } catch (err) {
      console.error("export-csv error:", err);
      res.status(500).json({ message: "Failed to export" });
    }
  });

  app.get("/api/admin/financial/reconciliation", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const cc = countryFilter ?? null;
      const [revRow, feeRow, refundRow, payoutRow, pendPayoutRow, walletRow] = await Promise.all([
        pool.query(`SELECT COALESCE(SUM(total_amount::numeric), 0) AS v FROM appointments WHERE (payment_status='completed' OR status='completed') AND payment_status NOT IN ('refunded','failed') AND ($1::text IS NULL OR country_code::text=$1)`, [cc]),
        pool.query(`SELECT COALESCE(SUM(platform_fee_amount::numeric), 0) AS v FROM appointments WHERE (payment_status='completed' OR status='completed') AND payment_status NOT IN ('refunded','failed') AND ($1::text IS NULL OR country_code::text=$1)`, [cc]),
        pool.query(`SELECT COALESCE(SUM(refund_amount::numeric), 0) AS v FROM appointments WHERE payment_status='refunded' AND ($1::text IS NULL OR country_code::text=$1)`, [cc]),
        pool.query(`SELECT COALESCE(SUM(pr.amount::numeric), 0) AS v FROM payout_requests pr JOIN providers p ON p.id=pr.provider_id WHERE pr.status='paid' AND ($1::text IS NULL OR p.country_code::text=$1)`, [cc]),
        pool.query(`SELECT COALESCE(SUM(pr.amount::numeric), 0) AS v FROM payout_requests pr JOIN providers p ON p.id=pr.provider_id WHERE pr.status IN ('pending','approved') AND ($1::text IS NULL OR p.country_code::text=$1)`, [cc]),
        pool.query(`SELECT COALESCE(SUM(w.balance::numeric), 0) AS v FROM wallets w JOIN users u ON u.id=w.user_id WHERE u.role='patient' AND ($1::text IS NULL OR u.country_code::text=$1)`, [cc]),
      ]);
      const grossRevenue     = Number(revRow.rows[0].v);
      const platformFees     = Number(feeRow.rows[0].v);
      const totalRefunds     = Number(refundRow.rows[0].v);
      const paidPayouts      = Number(payoutRow.rows[0].v);
      const pendingPayouts   = Number(pendPayoutRow.rows[0].v);
      const patientWallets   = Number(walletRow.rows[0].v);

      res.json({
        grossRevenue:    round2(grossRevenue),
        platformFees:    round2(platformFees),
        netRevenue:      round2(grossRevenue - platformFees),
        totalRefunds:    round2(totalRefunds),
        netAfterRefunds: round2(grossRevenue - platformFees - totalRefunds),
        paidPayouts:     round2(paidPayouts),
        pendingPayouts:  round2(pendingPayouts),
        patientWallets:  round2(patientWallets),
        retainedRevenue: round2(platformFees - paidPayouts),
        currency_note:   "All values are in USD (canonical storage currency).",
      });
    } catch (err) {
      console.error("reconciliation error:", err);
      res.status(500).json({ message: "Failed to compute reconciliation" });
    }
  });

  // ── Provider earnings / payout requests ───────────────────────────────────
  app.get("/api/admin/earnings", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const params: any[] = countryFilter ? [countryFilter] : [];
      const { rows } = await pool.query(`
        SELECT pe.*,
               u.first_name, u.last_name, u.email,
               p.provider_type, p.country_code
        FROM provider_earnings pe
        JOIN providers p ON p.id = pe.provider_id
        JOIN users u ON u.id = p.user_id
        ${countryFilter ? "WHERE p.country_code::text = $1" : ""}
        ORDER BY pe.created_at DESC LIMIT 500
      `, params);
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/admin/payout-requests", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const conds: string[] = [];
      const params: any[] = [];
      let pi = 1;
      if (status) { conds.push(`pr.status = $${pi++}`); params.push(status); }
      if (countryFilter) { conds.push(`p.country_code::text = $${pi++}`); params.push(countryFilter); }
      const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
      const { rows } = await pool.query(`
        SELECT pr.*,
               u.first_name, u.last_name, u.email,
               p.provider_type, p.country_code
        FROM payout_requests pr
        JOIN providers p ON p.id = pr.provider_id
        JOIN users u ON u.id = p.user_id
        ${where}
        ORDER BY pr.created_at DESC LIMIT 200
      `, params);
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/admin/payout-requests/:id", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PAYMENTS_MANAGE), async (req: AuthRequest, res: Response) => {
    const { status, paymentReference, notes } = req.body as { status: string; paymentReference?: string; notes?: string };
    const validStatuses = ["approved", "paid", "rejected", "on_hold"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "status must be one of: approved, paid, rejected, on_hold" });
    }
    try {
      const { rows } = await pool.query(`SELECT * FROM payout_requests WHERE id = $1`, [req.params.id]);
      if (!rows[0]) return res.status(404).json({ message: "Payout request not found" });
      const payout = rows[0];
      if (!canAccessCountry(req.user!, payout.country_code)) {
        return res.status(404).json({ message: "Payout request not found" });
      }

      const updates: string[] = ["status = $1", "updated_at = NOW()"];
      const params: any[] = [status];
      let pi = 2;
      if (paymentReference !== undefined) { updates.push(`payment_reference = $${pi++}`); params.push(paymentReference); }
      if (notes !== undefined) { updates.push(`notes = $${pi++}`); params.push(notes); }
      if (status === "paid") { updates.push(`paid_at = NOW()`); }
      params.push(req.params.id);
      const updated = await pool.query(
        `UPDATE payout_requests SET ${updates.join(", ")} WHERE id = $${pi} RETURNING *`, params
      );

      if (status === "paid" && payout.status !== "paid") {
        await pool.query(
          `UPDATE provider_wallets SET last_payout_date = NOW() WHERE provider_id = $1`,
          [payout.provider_id]
        );
      }

      // Bridge approved/paid payout into the double-entry marketplace ledger.
      if ((status === "approved" || status === "paid") && payout.status !== status) {
        const _ledgerCurrency = countryCurrency(payout.country_code as any) ?? "USD";
        const _ledgerTxType = status === "paid" ? "PROVIDER_WITHDRAWAL" : "PROVIDER_WITHDRAWAL_APPROVED";
        const _ledgerStatus = status === "paid" ? "SETTLED" : "PENDING";
        pool.query(
          `INSERT INTO marketplace_ledger
             (source_account, destination_account, amount_cents,
              transaction_type, status, currency_iso, country_code)
           VALUES ('PROVIDER_WITHDRAWABLE', 'EXTERNAL_BANK', $1, $2, $3, $4, $5)`,
          [
            roundToCents(parseFloat(payout.amount) || 0),
            _ledgerTxType,
            _ledgerStatus,
            _ledgerCurrency,
            payout.country_code ?? "HU",
          ],
        ).catch((e: Error) =>
          console.warn("[ledger] payout insert failed:", e.message)
        );
      }

      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
         VALUES ($1, 'payout_status_update', 'payout_request', $2, $3, $4)`,
        [req.user!.id, req.params.id, JSON.stringify({ status, paymentReference, prevStatus: payout.status }), payout.country_code]
      ).catch(() => {});

      // Notify the provider via all channels (in-app + email + push) when payout status changes.
      if (payout.status !== status && ["approved", "paid", "rejected"].includes(status)) {
        const eventKey = status === "approved" ? "payout.approved"
          : status === "paid" ? "payout.paid"
          : "payout.rejected" as const;
        const notifTitle = status === "approved" ? "Payout request approved"
          : status === "paid" ? "Payout sent"
          : "Payout request rejected";
        // Format the payout amount in the provider's country currency so the
        // notification body shows a proper symbol, not a raw USD decimal.
        const _payoutCurr = countryCurrency(payout.country_code as any) ?? "USD";
        let _fmtPayoutAmt = String(payout.amount ?? "");
        try {
          const _payoutRates = await getRates();
          _fmtPayoutAmt = formatSync(Number(payout.amount), _payoutCurr, _payoutRates);
        } catch {}
        const notifMsg = status === "approved"
          ? `Your payout request for ${_fmtPayoutAmt} has been approved and will be processed soon.`
          : status === "paid"
          ? `Your payout of ${_fmtPayoutAmt} has been sent successfully.`
          : notes ? `Your payout request was not approved: ${notes}` : "Your payout request was not approved.";
        pool.query(`SELECT user_id FROM providers WHERE id = $1`, [payout.provider_id])
          .then(async ({ rows }) => {
            if (!rows[0]) return;
            const { dispatchNotification } = await import("../../services/notification-dispatcher");
            return dispatchNotification({
              userId: rows[0].user_id,
              eventKey,
              title: notifTitle,
              body: notifMsg,
            });
          })
          .catch((e: Error) => console.warn("[payout-notify] failed:", e.message));
      }

      res.json(updated.rows[0]);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/provider-wallets", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const search = (req.query.search as string || "").trim();
      const params: any[] = [];
      const conditions: string[] = [];
      if (countryFilter) {
        params.push(countryFilter);
        conditions.push(`p.country_code::text = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        conditions.push(`(u.first_name ILIKE $${params.length} OR u.last_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
      }
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const { rows } = await pool.query(`
        SELECT pw.*,
               CONCAT(u.first_name, ' ', u.last_name) AS provider_name,
               u.email AS provider_email,
               p.provider_type
        FROM provider_wallets pw
        JOIN providers p ON p.id = pw.provider_id
        JOIN users u ON u.id = p.user_id
        ${whereClause}
        ORDER BY pw.available_balance DESC
        LIMIT 100
      `, params);
      res.json({ wallets: rows, total: rows.length, currency_note: "All wallet balances are stored in USD." });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Provider wallet ledger history ───────────────────────────────────────
  app.get("/api/admin/provider-wallets/:providerId/ledger", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { providerId } = req.params;
      const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
      const offset = parseInt(String(req.query.offset ?? "0")) || 0;

      // Country gate
      const { rows: provRows } = await pool.query(
        `SELECT country_code FROM providers WHERE id = $1`, [providerId],
      );
      if (!provRows.length) return res.status(404).json({ message: "Provider not found" });
      if (!canAccessCountry(req.user!, provRows[0].country_code)) {
        return res.status(403).json({ message: "Cross-country access denied" });
      }

      const { rows } = await pool.query(`
        SELECT
          pl.id, pl.entry_type, pl.amount, pl.description,
          pl.reference_id, pl.balance_after, pl.currency,
          pl.created_at,
          u.first_name AS actor_first_name,
          u.last_name  AS actor_last_name,
          u.role       AS actor_role
        FROM provider_ledger pl
        LEFT JOIN users u ON u.id = pl.actor_id
        WHERE pl.provider_id = $1
        ORDER BY pl.created_at DESC
        LIMIT $2 OFFSET $3
      `, [providerId, limit, offset]);

      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*) AS total FROM provider_ledger WHERE provider_id = $1`, [providerId],
      );

      res.json({
        entries: rows.map(r => ({
          id:          r.id,
          entryType:   r.entry_type,
          amount:      r.amount,
          description: r.description,
          referenceId: r.reference_id,
          balanceAfter: r.balance_after,
          currency:    r.currency ?? "USD",
          createdAt:   r.created_at,
          actorName:   r.actor_first_name
            ? `${r.actor_first_name} ${r.actor_last_name}`.trim()
            : null,
          actorRole: r.actor_role ?? null,
        })),
        total:  parseInt(countRows[0]?.total ?? "0"),
        limit,
        offset,
      });
    } catch (err: any) {
      console.error("[GET /api/admin/provider-wallets/:providerId/ledger]", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ── Provider wallet manual adjustment ────────────────────────────────────
  app.post("/api/admin/provider-wallets/:providerId/adjust", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PAYMENTS_MANAGE), async (req: AuthRequest, res: Response) => {
    try {
      const { providerId } = req.params;
      const { amount, description, entryType } = req.body as { amount: number; description: string; entryType?: string };

      const parsedAmount = parseFloat(String(amount));
      if (isNaN(parsedAmount) || parsedAmount === 0) {
        return res.status(400).json({ message: "Valid non-zero amount required" });
      }
      if (!description?.trim()) {
        return res.status(400).json({ message: "Description is required" });
      }

      const { rows: walletRows } = await pool.query(
        `SELECT pw.*, p.user_id, p.country_code FROM provider_wallets pw JOIN providers p ON p.id = pw.provider_id WHERE pw.provider_id = $1`,
        [providerId],
      );
      if (!walletRows.length) {
        return res.status(404).json({ message: "Provider wallet not found" });
      }
      const wallet = walletRows[0];

      if (!canAccessCountry(req.user!, wallet.country_code)) {
        return res.status(403).json({ message: "Cross-country wallet adjustment denied" });
      }

      const currentBalance = round2(parseFloat(String(wallet.available_balance || "0")));
      const adjustmentUSD = round2(parsedAmount);

      if (adjustmentUSD < 0 && Math.abs(adjustmentUSD) > currentBalance + 0.01) {
        return res.status(400).json({
          message: `Debit of $${Math.abs(adjustmentUSD).toFixed(2)} exceeds available balance of $${currentBalance.toFixed(2)}`,
        });
      }

      const newBalance = round2(currentBalance + adjustmentUSD);
      await pool.query(
        `UPDATE provider_wallets SET available_balance = $1, updated_at = NOW() WHERE provider_id = $2`,
        [String(newBalance), providerId],
      );

      const ledgerType = entryType ?? (adjustmentUSD > 0 ? "admin_credit" : "admin_debit");
      await pool.query(
        `INSERT INTO provider_ledger (provider_id, entry_type, amount, description, actor_id, balance_after)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [providerId, ledgerType, String(Math.abs(adjustmentUSD)), description.trim(), req.user!.id, String(newBalance)],
      ).catch(() => {});

      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES ($1, 'wallet_adjust', 'provider_wallet', $2, $3)`,
        [req.user!.id, providerId, JSON.stringify({ amount: adjustmentUSD, entryType: ledgerType, description, prevBalance: currentBalance, newBalance })],
      ).catch(() => {});

      res.json({ success: true, newBalance });
    } catch (err: any) {
      console.error("[POST /api/admin/provider-wallets/:providerId/adjust]", err);
      res.status(500).json({ message: err.message || "Failed to adjust provider wallet" });
    }
  });

  // ── Provider wallet freeze / unfreeze ────────────────────────────────────
  app.patch("/api/admin/provider-wallets/:providerId/freeze", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PAYMENTS_MANAGE), async (req: AuthRequest, res: Response) => {
    try {
      const { providerId } = req.params;
      const { frozen, reason } = req.body as { frozen: boolean; reason?: string };
      if (typeof frozen !== "boolean") {
        return res.status(400).json({ message: "'frozen' (boolean) is required." });
      }
      const updated = await storage.freezeProviderWallet(providerId, frozen, reason);
      if (!updated) return res.status(404).json({ message: "Provider wallet not found." });
      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'provider_wallet', $3, $4)`,
        [
          req.user!.id,
          frozen ? "wallet_frozen" : "wallet_unfrozen",
          providerId,
          JSON.stringify({ frozen, reason: reason ?? null }),
        ],
      ).catch(() => {});
      res.json({ success: true, wallet: updated });
    } catch (err: any) {
      console.error("[PATCH /api/admin/provider-wallets/:providerId/freeze]", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ── Promo codes ───────────────────────────────────────────────────────────
  app.get("/api/admin/promo-codes", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.SETTINGS_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const allCodes = await storage.getAllPromoCodes();
      const codes = countryFilter ? allCodes.filter((c: any) => c.countryCode === countryFilter) : allCodes;
      res.json(codes);
    } catch (error) {
      res.status(500).json({ message: "Failed to get promo codes" });
    }
  });

  app.post("/api/admin/promo-codes", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.SETTINGS_EDIT), async (req: AuthRequest, res: Response) => {
    try {
      const targetCountry = req.body.countryCode ?? req.user!.countryCode ?? "HU";
      if (!canAccessCountry(req.user!, targetCountry)) {
        return res.status(403).json({ message: "Cannot create promo codes for another country" });
      }
      const insertSchema = z.object({
        code: z.string().min(3).max(32).transform(s => s.toUpperCase()),
        discountType: z.enum(["percentage", "fixed"]),
        discountValue: z.number().min(0.01),
        maxUsages: z.number().int().min(1).optional().nullable(),
        expiresAt: z.string().datetime({ offset: true }).optional().nullable(),
        minOrderAmount: z.number().min(0).optional().nullable(),
        description: z.string().optional().nullable(),
        applicableProviderIds: z.array(z.string()).optional().nullable(),
        applicableServiceIds: z.array(z.string()).optional().nullable(),
        singleUsePerUser: z.boolean().default(false),
        countryCode: z.string().optional(),
      });
      const data = insertSchema.parse(req.body);
      const code = await storage.createPromoCode({
        code: data.code,
        discountType: data.discountType,
        discountValue: String(data.discountValue),
        description: data.description ?? null,
        maxUses: data.maxUsages ?? null,
        validFrom: new Date(),
        validUntil: data.expiresAt ? new Date(data.expiresAt) : new Date(Date.now() + 365 * 86_400_000),
        minAmount: data.minOrderAmount != null ? String(data.minOrderAmount) : null,
        applicableProviders: data.applicableProviderIds ?? null,
        isActive: true,
      } as any);
      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address, country_code)
         VALUES ($1, 'create', 'promo_code', $2, $3, $4, $5)`,
        [req.user!.id, code.id, JSON.stringify({ code: data.code, discountType: data.discountType, discountValue: data.discountValue }), req.ip ?? null, targetCountry]
      ).catch(() => {});
      res.status(201).json(code);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: error.errors[0]?.message });
      res.status(500).json({ message: "Failed to create promo code" });
    }
  });

  app.patch("/api/admin/promo-codes/:id", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.SETTINGS_EDIT), async (req: AuthRequest, res: Response) => {
    try {
      const allowed = ["discountType", "discountValue", "maxUsages", "expiresAt", "minOrderAmount", "description", "isActive", "applicableProviderIds", "applicableServiceIds", "singleUsePerUser"];
      const patch: Record<string, any> = {};
      for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
      if (!Object.keys(patch).length) return res.status(400).json({ message: "No valid fields to update" });
      const code = await storage.updatePromoCode(req.params.id, patch);
      if (!code) return res.status(404).json({ message: "Promo code not found" });
      res.json(code);
    } catch (error) {
      res.status(500).json({ message: "Failed to update promo code" });
    }
  });

  app.delete("/api/admin/promo-codes/:id", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.SETTINGS_EDIT), async (req: AuthRequest, res: Response) => {
    try {
      await storage.deletePromoCode(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete promo code" });
    }
  });

  // ── Invoice template ──────────────────────────────────────────────────────
  app.get("/api/admin/invoice-template", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const countryCode = (req.query.countryCode as string) ?? req.user!.countryCode ?? "HU";
      const { rows } = await pool.query(
        `SELECT * FROM invoice_templates WHERE country_code = $1 ORDER BY is_default DESC LIMIT 1`,
        [countryCode]
      );
      res.json(rows[0] || null);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put("/api/admin/invoice-template", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const targetCountry = req.body.countryCode ?? req.user!.countryCode ?? "HU";
      if (!canAccessCountry(req.user!, targetCountry)) {
        return res.status(403).json({ message: "Cross-country template modification denied" });
      }
      const schema = z.object({
        logoUrl: z.string().url().optional().nullable(),
        companyName: z.string().optional().nullable(),
        companyAddress: z.string().optional().nullable(),
        taxId: z.string().optional().nullable(),
        footerText: z.string().optional().nullable(),
        colorScheme: z.record(z.string()).optional().nullable(),
        isDefault: z.boolean().default(true),
        countryCode: z.string().optional(),
      });
      const data = schema.parse(req.body);
      const { rows } = await pool.query(
        `INSERT INTO invoice_templates (country_code, logo_url, company_name, company_address, tax_id, footer_text, color_scheme, is_default, updated_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
         ON CONFLICT (country_code, is_default) DO UPDATE
           SET logo_url=$2, company_name=$3, company_address=$4, tax_id=$5,
               footer_text=$6, color_scheme=$7, is_default=$8, updated_by=$9, updated_at=NOW()
         RETURNING *`,
        [targetCountry, data.logoUrl ?? null, data.companyName ?? null, data.companyAddress ?? null, data.taxId ?? null, data.footerText ?? null, data.colorScheme ? JSON.stringify(data.colorScheme) : null, data.isDefault, req.user!.id]
      );
      res.json(rows[0]);
    } catch (e: any) {
      if (e?.name === "ZodError") return res.status(400).json({ message: e.errors?.[0]?.message || "Invalid payload" });
      res.status(500).json({ message: e.message });
    }
  });

  // ── Invoice template preview ──────────────────────────────────────────────
  app.post("/api/admin/invoice-template/preview", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tpl = req.body || {};
      const brandColor = tpl.brandColorHex || tpl.color_scheme?.primary || "#2563eb";
      const accentColor = tpl.accentColorHex || tpl.color_scheme?.accent || "#f59e0b";
      const companyName = tpl.companyName || tpl.company_name || "Golden Life Health Care";
      const tagline = tpl.tagline || "";
      const addressLine1 = tpl.addressLine1 || tpl.company_address || "";
      const addressLine2 = tpl.addressLine2 || "";
      const city = tpl.city || "";
      const country = tpl.country || "";
      const email = tpl.email || "";
      const phone = tpl.phone || "";
      const website = tpl.website || "";
      const taxId = tpl.taxId || tpl.tax_id || "";
      const footerText = tpl.footerText || tpl.footer_text || "Thank you for choosing our services.";
      const paymentInstructions = tpl.paymentInstructions || "";
      const termsText = tpl.termsText || "Payment is due within 7 days of invoice date.";
      const logoUrl = tpl.logoUrl || tpl.logo_url || "";
      const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Invoice Preview — ${companyName}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#f3f4f6;color:#111827;padding:24px}
    .page{max-width:760px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10)}
    .header{background:${brandColor};color:#fff;padding:36px 40px;display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap}
    .header-left h1{font-size:26px;font-weight:700;margin-bottom:2px}
    .header-left p{font-size:13px;opacity:.85}
    .header-right{text-align:right}
    .header-right .inv-num{font-size:22px;font-weight:700;letter-spacing:.5px}
    .header-right .inv-date{font-size:13px;opacity:.85;margin-top:4px}
    .logo{height:52px;width:auto;border-radius:6px;background:#fff;padding:4px;object-fit:contain}
    .body{padding:36px 40px}
    .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px}
    .box h3{font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:#6b7280;margin-bottom:8px}
    .box p{font-size:14px;color:#111827;line-height:1.6}
    table{width:100%;border-collapse:collapse;margin-bottom:24px}
    th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.6px;color:#6b7280;border-bottom:2px solid ${brandColor};padding:8px 0}
    td{padding:12px 0;font-size:14px;border-bottom:1px solid #f3f4f6}
    .amount{text-align:right}
    .totals{display:flex;flex-direction:column;align-items:flex-end;gap:6px;margin-bottom:28px}
    .total-row{display:flex;gap:32px;justify-content:flex-end;font-size:14px}
    .total-row.grand{font-size:17px;font-weight:700;color:${brandColor};margin-top:8px;padding-top:8px;border-top:2px solid ${brandColor}}
    .badge{display:inline-block;background:${accentColor};color:#fff;border-radius:20px;padding:3px 14px;font-size:12px;font-weight:600;margin-bottom:16px}
    .section{margin-bottom:20px}
    .section h4{font-size:12px;text-transform:uppercase;letter-spacing:.7px;color:#6b7280;margin-bottom:6px}
    .section p{font-size:13px;color:#374151;line-height:1.55}
    .footer{background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;font-size:12px;color:#6b7280}
    .preview-banner{background:${accentColor}22;border:1.5px dashed ${accentColor};border-radius:8px;padding:8px 16px;text-align:center;font-size:12px;font-weight:600;color:${accentColor};margin-bottom:24px}
  </style>
</head>
<body>
  <div class="preview-banner">⚠ Preview — sample data only. Actual invoices will use real appointment details.</div>
  <div class="page">
    <div class="header">
      <div class="header-left">
        ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="logo" style="margin-bottom:10px"/>` : ""}
        <h1>${companyName}</h1>
        ${tagline ? `<p>${tagline}</p>` : ""}
        ${addressLine1 ? `<p style="margin-top:6px;font-size:12px;opacity:.75">${[addressLine1, addressLine2, city, country].filter(Boolean).join(", ")}</p>` : ""}
        ${taxId ? `<p style="font-size:12px;opacity:.75;margin-top:2px">Tax ID: ${taxId}</p>` : ""}
      </div>
      <div class="header-right">
        <div class="inv-num">INVOICE #GL-2024-0001</div>
        <div class="inv-date">Issued: ${today}</div>
        <div class="inv-date">Due: ${new Date(Date.now() + 7*864e5).toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})}</div>
        <div style="margin-top:10px"><span class="badge">SAMPLE</span></div>
      </div>
    </div>
    <div class="body">
      <div class="grid-2">
        <div class="box">
          <h3>Bill To</h3>
          <p><strong>Jane Client</strong><br/>123 Sample Street<br/>Budapest, Hungary<br/>jane@example.com</p>
        </div>
        <div class="box">
          <h3>Provider</h3>
          <p><strong>Dr. Sample Provider</strong><br/>Physiotherapy</p>
        </div>
      </div>
      <table>
        <thead><tr><th>Description</th><th>Visit Type</th><th>Date</th><th class="amount">Amount</th></tr></thead>
        <tbody>
          <tr><td>Physiotherapy session</td><td>In-clinic</td><td>${today}</td><td class="amount">$65.00</td></tr>
          <tr><td>Home visit nursing</td><td>Home visit</td><td>${today}</td><td class="amount">$45.00</td></tr>
          <tr><td>Platform service fee</td><td>—</td><td>—</td><td class="amount">$5.50</td></tr>
        </tbody>
      </table>
      <div class="totals">
        <div class="total-row"><span>Subtotal</span><span>$110.00</span></div>
        <div class="total-row"><span>Platform fee</span><span>$5.50</span></div>
        <div class="total-row"><span>Tax (5%)</span><span>$5.50</span></div>
        <div class="total-row grand"><span>Total</span><span>$121.00</span></div>
      </div>
      ${paymentInstructions ? `<div class="section"><h4>Payment Instructions</h4><p>${paymentInstructions}</p></div>` : ""}
      ${termsText ? `<div class="section"><h4>Terms</h4><p>${termsText}</p></div>` : ""}
      ${email || phone || website ? `<div class="section"><h4>Contact</h4><p>${[email, phone, website].filter(Boolean).join(" · ")}</p></div>` : ""}
    </div>
    <div class="footer">${footerText}</div>
  </div>
</body>
</html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", "inline; filename=invoice-preview.html");
      res.send(html);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Overdue invoices ──────────────────────────────────────────────────────
  app.get("/api/admin/overdue-invoices", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const dueDays = Math.max(0, Number(req.query.dueDays || 0));
      const params: any[] = [new Date(Date.now() - dueDays * 86_400_000)];
      let where = "WHERE i.status NOT IN ('paid','cancelled') AND i.due_date < $1";
      if (countryFilter) { params.push(countryFilter); where += ` AND i.country_code = $${params.length}`; }
      const { rows } = await pool.query(`
        SELECT i.id, i.invoice_number, i.due_date, i.total_amount AS amount, 'USD' AS currency, i.status,
               i.country_code, i.created_at,
               u.first_name, u.last_name, u.email
        FROM invoices i
        JOIN users u ON u.id = i.patient_id
        ${where}
        ORDER BY i.due_date ASC LIMIT 200
      `, params);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/invoices/:id/send-reminder", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const inv = await storage.getInvoice(req.params.id);
      if (!inv) return res.status(404).json({ message: "Invoice not found" });
      if (!canAccessCountry(req.user!, (inv as any).countryCode)) {
        return res.status(403).json({ message: "Cross-country access denied" });
      }
      await storage.createNotification({
        userId: (inv as any).patientId,
        type: "payment_reminder",
        subject: `Payment reminder: Invoice ${(inv as any).invoiceNumber}`,
        body: `Your invoice ${(inv as any).invoiceNumber} for ${formatLocal(Number((inv as any).amount), (inv as any).currency ?? "USD")} is overdue. Please settle it to avoid service disruption.`,
      });
      await pool.query(
        `UPDATE invoices SET last_reminder_at = NOW(), reminder_count = COALESCE(reminder_count, 0) + 1 WHERE id = $1`,
        [req.params.id]
      );
      res.json({ ok: true, invoiceId: req.params.id });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── Refunds & refund rules ────────────────────────────────────────────────
  app.get("/api/admin/refunds", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    const { status = "pending", q, page = "1" } = req.query as Record<string, string>;
    const offset = (Math.max(1, parseInt(page)) - 1) * 50;
    try {
      // Country boundary: non-global admins are locked to their own country.
      // Global admins may pass ?country=HU|IR to opt into one country; omit for all.
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      // If the caller passed an explicit country param that violates their boundary, reject.
      const requestedCountry = (req.query.country as string | undefined)?.toUpperCase();
      if (requestedCountry && requestedCountry !== "ALL" && countryFilter && requestedCountry !== countryFilter) {
        return res.status(403).json({ message: "Cross-country access denied" });
      }

      const params: any[] = [];
      let pi = 1;
      const conds: string[] = [];
      if (status !== "all") { conds.push(`a.refund_status = $${pi++}`); params.push(status); }
      if (countryFilter) { conds.push(`a.country_code::text = $${pi++}`); params.push(countryFilter); }
      if (q?.trim()) {
        conds.push(`(a.appointment_number ILIKE $${pi} OR u.email ILIKE $${pi} OR CONCAT(u.first_name,' ',u.last_name) ILIKE $${pi} OR p.clinic_name ILIKE $${pi})`);
        params.push(`%${q.trim()}%`); pi++;
      }
      const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

      const { rows } = await pool.query(`
        SELECT a.id, a.appointment_number, a.date, a.start_time, a.end_time,
          a.total_amount, a.refund_amount, a.refund_status, a.refund_notes,
          a.cancelled_by, a.cancelled_at, a.status AS appt_status,
          a.country_code, a.payment_status, a.visit_type,
          a.display_currency,
          u.id AS patient_id, u.first_name AS patient_first, u.last_name AS patient_last, u.email AS patient_email,
          p.clinic_name AS provider_name, p.id AS provider_id,
          s.name AS service_name
        FROM appointments a
        LEFT JOIN users u ON u.id = a.patient_id
        LEFT JOIN providers p ON p.id = a.provider_id
        LEFT JOIN services s ON s.id = a.service_id
        ${where}
        ORDER BY a.cancelled_at DESC NULLS LAST, a.created_at DESC
        LIMIT 50 OFFSET $${pi}
      `, [...params, offset]);

      const countRes = await pool.query(
        `SELECT COUNT(*) FROM appointments a LEFT JOIN users u ON u.id = a.patient_id LEFT JOIN providers p ON p.id = a.provider_id ${where}`,
        params
      );
      res.json({ refunds: rows, total: parseInt(countRes.rows[0].count) });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/refunds/:id/process", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PAYMENTS_REFUND), async (req: AuthRequest, res: Response) => {
    const { action, amount, note } = req.body as { action: string; amount?: number; note?: string };
    if (!["approve", "reject", "partial", "manual"].includes(action)) {
      return res.status(400).json({ message: "action must be approve|reject|partial|manual" });
    }
    try {
      const { rows } = await pool.query("SELECT * FROM appointments WHERE id = $1", [req.params.id]);
      if (!rows[0]) return res.status(404).json({ message: "Appointment not found" });
      const appt = rows[0];
      if (appt.refund_status === "processed") return res.status(409).json({ message: "Refund already processed" });

      const totalPaid = Number(appt.total_amount || 0);
      let refundAmt = 0;
      if (action === "approve") refundAmt = Math.max(0, Number(appt.refund_amount || totalPaid));
      else if (action === "partial" || action === "manual") refundAmt = Math.min(Number(amount ?? 0), totalPaid);

      const newStatus = action === "reject" ? "none" : (refundAmt > 0 ? "processed" : "none");

      if (refundAmt > 0) {
        try {
          await storage.refundWallet(appt.patient_id, refundAmt, {
            description: `Admin ${action} refund — appt ${appt.appointment_number || appt.id}`,
            referenceType: "appointment",
            referenceId: appt.id,
            idempotencyKey: `admin-refund:${appt.id}:${action}:${req.user!.id}`,
          });
          pool.query(
            "UPDATE payments SET refunded_amount = COALESCE(refunded_amount, 0) + $1 WHERE appointment_id = $2",
            [refundAmt, appt.id]
          ).catch(() => {});
        } catch (err: any) {
          return res.status(500).json({ message: `Wallet refund failed: ${err.message}` });
        }
      }

      await pool.query(
        "UPDATE appointments SET refund_status = $1, refund_amount = $2, refund_notes = COALESCE($3, refund_notes), updated_at = NOW() WHERE id = $4",
        [newStatus, String(refundAmt), note ?? null, appt.id]
      );

      if (appt.patient_id) {
        const notifMsg = action === "reject"
          ? `Your refund request for appointment ${appt.appointment_number || "#" + appt.id.slice(0, 8)} was reviewed and declined.`
          : `A refund of ${refundAmt} has been issued to your wallet for appointment ${appt.appointment_number || "#" + appt.id.slice(0, 8)}.`;
        storage.createNotification({ userId: appt.patient_id, title: action === "reject" ? "Refund declined" : "Refund processed", message: notifMsg, type: "refund" } as any).catch(() => {});
      }

      res.json({ ok: true, action, refundAmt, newStatus });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/admin/refund-rules", authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query("SELECT * FROM refund_rules ORDER BY scenario, country_code LIMIT 100");
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put("/api/admin/refund-rules/:id", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PAYMENTS_MANAGE), async (req: AuthRequest, res: Response) => {
    const { full_refund_hours, partial_refund_hours, partial_refund_percent, is_active, description } = req.body;
    try {
      const { rows } = await pool.query(
        `UPDATE refund_rules SET
          full_refund_hours      = COALESCE($1, full_refund_hours),
          partial_refund_hours   = COALESCE($2, partial_refund_hours),
          partial_refund_percent = COALESCE($3, partial_refund_percent),
          is_active              = COALESCE($4, is_active),
          description            = COALESCE($5, description),
          updated_by_id          = $6,
          updated_at             = NOW()
        WHERE id = $7 RETURNING *`,
        [full_refund_hours ?? null, partial_refund_hours ?? null, partial_refund_percent ?? null, is_active ?? null, description ?? null, req.user!.id, req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ message: "Rule not found" });
      res.json(rows[0]);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── CSV bulk exports ──────────────────────────────────────────────────────
  app.get("/api/admin/export/appointments.csv", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const params: any[] = [];
      let where = "WHERE 1=1";
      if (countryFilter) { params.push(countryFilter); where += ` AND a.country_code = $${params.length}`; }
      const result = await pool.query(
        `SELECT a.appointment_number, a.date, a.start_time, a.end_time, a.status, a.visit_type,
                a.total_amount, a.payment_status, a.country_code,
                u.email AS patient_email, u.first_name AS patient_first,
                pu.email AS provider_email, pu.first_name AS provider_first, pu.last_name AS provider_last,
                s.name AS service_name, a.created_at
         FROM appointments a
         LEFT JOIN users u ON u.id = a.patient_id
         LEFT JOIN providers p ON p.id = a.provider_id
         LEFT JOIN users pu ON pu.id = p.user_id
         LEFT JOIN services s ON s.id = a.service_id
         ${where} ORDER BY a.date DESC`, params,
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=appointments.csv");
      res.send(toCsv(result.rows, [
        "appointment_number","date","start_time","end_time","status","visit_type",
        "total_amount","payment_status","patient_email","patient_first",
        "provider_email","provider_first","provider_last","service_name","country_code","created_at",
      ]));
    } catch (e) { res.status(500).json({ message: "Failed" }); }
  });

  app.get("/api/admin/export/users.csv", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const params: any[] = [];
      let where = "WHERE is_deleted = false";
      if (countryFilter) { params.push(countryFilter); where += ` AND country_code = $${params.length}`; }
      const result = await pool.query(
        `SELECT id, email, first_name, last_name, role, phone, country_code, is_email_verified, created_at
         FROM users ${where} ORDER BY created_at DESC`, params,
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=users.csv");
      res.send(toCsv(result.rows, ["id","email","first_name","last_name","role","phone","country_code","is_email_verified","created_at"]));
    } catch (e) { res.status(500).json({ message: "Failed" }); }
  });

  app.get("/api/admin/export/revenue.csv", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const params: any[] = [];
      let where = "WHERE a.payment_status = 'completed'";
      if (countryFilter) { params.push(countryFilter); where += ` AND a.country_code = $${params.length}`; }
      const result = await pool.query(
        `SELECT a.date, a.appointment_number, a.total_amount, a.platform_fee_amount,
                a.tax_amount, a.promo_discount, a.refund_amount, a.refund_status,
                a.country_code, a.visit_type,
                s.name AS service, u.email AS patient_email,
                pu.email AS provider_email,
                COALESCE(ts.tax_name, '') AS tax_name,
                COALESCE(ts.tax_rate, 0) AS tax_rate_percent
         FROM appointments a
         LEFT JOIN services s ON s.id = a.service_id
         LEFT JOIN users u ON u.id = a.patient_id
         LEFT JOIN providers p ON p.id = a.provider_id
         LEFT JOIN users pu ON pu.id = p.user_id
         LEFT JOIN tax_settings ts
           ON ts.country = a.country_code::text
           AND ts.year = EXTRACT(YEAR FROM a.date::date)::int
         ${where} ORDER BY a.date DESC`, params,
      );
      const currencyMeta = [["currency_note","All monetary amounts are in USD (canonical storage currency)."]];
      const dataRows = toCsv(result.rows, [
        "date","appointment_number","visit_type","service","total_amount","platform_fee_amount",
        "tax_amount","tax_rate_percent","tax_name","promo_discount",
        "refund_amount","refund_status","patient_email","provider_email","country_code",
      ]);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=revenue.csv");
      res.send(currencyMeta.map(r => r.join(",")).join("\n") + "\n" + dataRows);
    } catch (e) { res.status(500).json({ message: "Failed" }); }
  });

  app.get("/api/admin/export/payouts.csv", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const params: any[] = [];
      let where = "WHERE 1=1";
      if (countryFilter) { params.push(countryFilter); where += ` AND p.country_code = $${params.length}`; }
      const result = await pool.query(
        `SELECT pr.id, pr.amount, pr.currency, pr.status, pr.created_at, pr.paid_at,
                pr.method, pr.payment_reference, pr.notes,
                u.email AS provider_email, u.first_name, u.last_name,
                p.provider_type, p.country_code
         FROM payout_requests pr
         JOIN providers p ON p.id = pr.provider_id
         JOIN users u ON u.id = p.user_id
         ${where} ORDER BY pr.created_at DESC`, params,
      );
      const currencyMeta = [["currency_note","All amounts are in USD (canonical storage currency)."]];
      const dataRows = toCsv(result.rows, [
        "id","provider_email","first_name","last_name","provider_type",
        "amount","currency","status","method","payment_reference",
        "notes","country_code","created_at","paid_at",
      ]);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=payouts.csv");
      res.send(currencyMeta.map(r => r.join(",")).join("\n") + "\n" + dataRows);
    } catch (e) { res.status(500).json({ message: "Failed" }); }
  });

  // ── Tax Settings ──────────────────────────────────────────────────────────
  app.get("/api/admin/tax-settings", authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const settings = await storage.getAllTaxSettings();
      res.json(settings || []);
    } catch (error) {
      console.error("Failed to fetch tax settings:", error);
      res.status(500).json({ message: "Failed to get tax settings" });
    }
  });

  app.post("/api/admin/tax-settings", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.SETTINGS_EDIT), async (req: AuthRequest, res: Response) => {
    try {
      const { insertTaxSettingSchema } = await import("@shared/schema");
      const data = {
        ...req.body,
        isActive: req.body.isActive ?? true,
        taxName: req.body.taxName || "Sales Tax",
        taxRate: req.body.taxRate !== undefined ? String(req.body.taxRate) : req.body.taxRate,
        year: req.body.year !== undefined ? Number(req.body.year) : req.body.year,
      };
      const validated = insertTaxSettingSchema.parse(data);
      const setting = await storage.createTaxSetting(validated);
      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address, country_code)
         VALUES ($1, 'create', 'tax_setting', $2, $3, $4, $5)`,
        [req.user!.id, setting.id, JSON.stringify({ country: setting.country, taxName: setting.taxName, taxRate: setting.taxRate, year: setting.year }), req.ip ?? null, req.user!.countryCode ?? null]
      ).catch(() => {});
      res.json(setting);
    } catch (error) {
      console.error("Tax creation error:", error);
      res.status(400).json({ message: "Invalid tax setting data" });
    }
  });

  app.patch("/api/admin/tax-settings/:id", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.SETTINGS_EDIT), async (req: AuthRequest, res: Response) => {
    try {
      const setting = await storage.updateTaxSetting(req.params.id, req.body);
      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address, country_code)
         VALUES ($1, 'update', 'tax_setting', $2, $3, $4, $5)`,
        [req.user!.id, req.params.id, JSON.stringify(req.body), req.ip ?? null, req.user!.countryCode ?? null]
      ).catch(() => {});
      res.json(setting);
    } catch (error) {
      res.status(500).json({ message: "Failed to update tax setting" });
    }
  });

  app.delete("/api/admin/tax-settings/:id", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.SETTINGS_EDIT), async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteTaxSetting(req.params.id);
      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address, country_code)
         VALUES ($1, 'delete', 'tax_setting', $2, $3, $4, $5)`,
        [req.user!.id, req.params.id, JSON.stringify({}), req.ip ?? null, req.user!.countryCode ?? null]
      ).catch(() => {});
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete tax setting" });
    }
  });

  // ── Stripe config status ──────────────────────────────────────────────────
  app.get("/api/admin/stripe/status", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      if (!isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { isStripeConfigured, getStripeMode } = await import("../../stripe");
      res.json({
        configured: isStripeConfigured(),
        mode: getStripeMode(),
        webhookSecretConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
        publishableKeyConfigured: Boolean(process.env.VITE_STRIPE_PUBLISHABLE_KEY),
      });
    } catch (error) {
      console.error("Stripe status error:", error);
      res.status(500).json({ message: "Failed to get Stripe status" });
    }
  });

  // ── Earnings data-repair endpoint ─────────────────────────────────────────
  // The original recordProviderEarning() contained a double-conversion bug:
  // it called toUSDSync(total_amount, "HUF", rates) even though total_amount
  // is already stored in USD. For a $13.70 booking this wrote 0.04 to
  // provider_earnings and provider_wallets (13.70 ÷ 365 HUF rate).
  //
  // GET  ?preview=true  — shows affected rows and correction amounts (safe)
  // POST               — applies the correction (global_admin only)
  // ──────────────────────────────────────────────────────────────────────────
  app.get("/api/admin/financial/repair-earnings/preview", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      if (!isAdminRole(req.user!.role)) {
        return res.status(403).json({ message: "Global admin required" });
      }
      const { rows } = await pool.query(`
        SELECT
          pe.id,
          pe.provider_id,
          pe.appointment_id,
          pe.provider_earning::numeric             AS stored_earning,
          pe.total_amount::numeric                 AS stored_total,
          a.total_amount::numeric                  AS correct_total,
          a.platform_fee_amount::numeric           AS correct_fee,
          GREATEST(0,
            a.total_amount::numeric -
            COALESCE(a.platform_fee_amount::numeric, 0)
          )                                        AS correct_earning,
          ABS(
            pe.provider_earning::numeric -
            GREATEST(0,
              a.total_amount::numeric -
              COALESCE(a.platform_fee_amount::numeric, 0)
            )
          )                                        AS delta,
          p.country_code::text                     AS country_code
        FROM provider_earnings pe
        JOIN appointments a  ON a.id  = pe.appointment_id
        JOIN providers p     ON p.id  = pe.provider_id
        WHERE a.payment_status = 'completed'
          AND ABS(
                pe.provider_earning::numeric -
                GREATEST(0,
                  a.total_amount::numeric -
                  COALESCE(a.platform_fee_amount::numeric, 0)
                )
              ) > 0.001
        ORDER BY delta DESC
        LIMIT 500
      `);
      res.json({
        affected_rows: rows.length,
        rows,
        note: "POST /api/admin/financial/repair-earnings/apply to apply corrections.",
      });
    } catch (err: any) {
      console.error("repair-earnings preview error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ── Circuit Breaker (Global Platform Panic Switch) ────────────────────────

  app.get("/api/admin/system/circuit-breaker", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT value FROM platform_settings WHERE key = 'platform_circuit_breaker' LIMIT 1`
      );
      if (!rows.length) {
        return res.json({ frozen: false, reason: null, frozenAt: null, frozenBy: null, frozenByName: null });
      }
      let state: any = {};
      try { state = JSON.parse(rows[0].value); } catch {}
      return res.json({
        frozen: state.frozen === true,
        reason: state.reason ?? null,
        frozenAt: state.frozenAt ?? null,
        frozenBy: state.frozenBy ?? null,
        frozenByName: state.frozenByName ?? null,
      });
    } catch (err) {
      console.error("[circuit-breaker GET]", err);
      res.status(500).json({ message: "Failed to read circuit breaker state" });
    }
  });

  app.post("/api/admin/system/circuit-breaker", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.SETTINGS_EDIT), async (req: AuthRequest, res: Response) => {
    try {
      const { frozen, reason } = req.body as { frozen: boolean; reason?: string };
      if (typeof frozen !== "boolean") {
        return res.status(400).json({ message: "frozen must be a boolean" });
      }
      if (frozen && !reason?.trim()) {
        return res.status(400).json({ message: "A reason is required to freeze the platform" });
      }

      const adminUser = req.user!;
      const adminName = `${(adminUser as any).firstName ?? ""} ${(adminUser as any).lastName ?? ""}`.trim() || adminUser.email;

      const state = {
        frozen,
        reason: reason?.trim() ?? null,
        frozenAt: frozen ? new Date().toISOString() : null,
        frozenBy: adminUser.id,
        frozenByName: frozen ? adminName : null,
      };

      await pool.query(
        `INSERT INTO platform_settings (key, value, category, description)
         VALUES ('platform_circuit_breaker', $1, 'system', 'Global platform circuit breaker state')
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify(state)]
      );

      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address, country_code)
         VALUES ($1, 'circuit_breaker', 'platform_settings', 'platform_circuit_breaker', $2, $3, $4)`,
        [
          adminUser.id,
          JSON.stringify({ frozen, reason: reason?.trim() ?? null, adminName }),
          req.ip ?? null,
          adminUser.countryCode ?? null,
        ]
      ).catch(() => {});

      res.json({ success: true, frozen, message: frozen ? "Platform frozen" : "Platform restored" });
    } catch (err) {
      console.error("[circuit-breaker POST]", err);
      res.status(500).json({ message: "Failed to update circuit breaker" });
    }
  });

  // ── Escrow Pending (stuck payment appointments) ───────────────────────────

  app.get("/api/admin/financial/escrow-pending", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PAYMENTS_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const countryFilter = listingCountryFilter(req.user!, req.query as any);
      const { rows } = await pool.query(`
        SELECT
          a.id,
          a.appointment_number,
          COALESCE(NULLIF(TRIM(COALESCE(pu.first_name,'') || ' ' || COALESCE(pu.last_name,'')), ''), pu.email) AS patient_name,
          COALESCE(NULLIF(TRIM(COALESCE(vu.first_name,'') || ' ' || COALESCE(vu.last_name,'')), ''), p.clinic_name, 'Unknown') AS provider_name,
          a.date,
          a.total_amount::text,
          a.payment_status,
          a.visit_type,
          a.country_code::text,
          a.created_at
        FROM appointments a
        JOIN users pu ON pu.id = a.patient_id
        JOIN providers p ON p.id = a.provider_id
        JOIN users vu ON vu.id = p.user_id
        WHERE a.payment_status IN ('pending', 'failed')
          AND ($1::text IS NULL OR a.country_code::text = $1)
        ORDER BY a.created_at DESC
        LIMIT 200
      `, [countryFilter ?? null]);
      res.json(rows);
    } catch (err) {
      console.error("[escrow-pending]", err);
      res.status(500).json({ message: "Failed to fetch escrow-pending appointments" });
    }
  });

  // ── Ledger Override History ───────────────────────────────────────────────

  app.get("/api/admin/financial/ledger-overrides", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PAYMENTS_VIEW), async (req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          al.id,
          COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.email, 'Unknown') AS admin_name,
          al.action,
          al.entity_id AS appointment_id,
          COALESCE((al.details::jsonb->>'amount')::text, '0') AS amount,
          COALESCE(al.details::jsonb->>'reason', '') AS reason,
          al.created_at,
          al.country_code
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        WHERE al.action = 'ledger_override'
        ORDER BY al.created_at DESC
        LIMIT 100
      `);
      res.json(rows);
    } catch (err) {
      console.error("[ledger-overrides GET]", err);
      res.status(500).json({ message: "Failed to fetch ledger overrides" });
    }
  });

  // ── Ledger Override Apply ─────────────────────────────────────────────────

  app.post("/api/admin/financial/ledger-override", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PAYMENTS_MANAGE), async (req: AuthRequest, res: Response) => {
    try {
      const { appointmentId, action, amount, reason } = req.body as {
        appointmentId: string;
        action: string;
        amount: number | null;
        reason: string;
      };

      if (!appointmentId) return res.status(400).json({ message: "appointmentId is required" });
      if (!reason?.trim()) return res.status(400).json({ message: "A reason is required for every ledger override" });

      const validActions = ["release_escrow", "refund_patient", "partial_refund", "fee_split_adjust", "void_charge"];
      if (!validActions.includes(action)) return res.status(400).json({ message: "Invalid override action" });

      const apptResult = await pool.query(
        `SELECT id, appointment_number, payment_status, total_amount, country_code FROM appointments WHERE id = $1 LIMIT 1`,
        [appointmentId]
      );
      if (!apptResult.rows.length) return res.status(404).json({ message: "Appointment not found" });
      const appt = apptResult.rows[0];

      if (!canAccessCountry(req.user!, appt.country_code)) {
        return res.status(403).json({ message: "Cross-country override denied" });
      }

      let newPaymentStatus: string | null = null;
      if (action === "release_escrow") newPaymentStatus = "completed";
      else if (action === "refund_patient" || action === "partial_refund") newPaymentStatus = "refunded";
      else if (action === "void_charge") newPaymentStatus = "voided";

      if (newPaymentStatus) {
        await pool.query(
          `UPDATE appointments SET payment_status = $1 WHERE id = $2`,
          [newPaymentStatus, appointmentId]
        );
      }

      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address, country_code)
         VALUES ($1, 'ledger_override', 'appointment', $2, $3, $4, $5)`,
        [
          req.user!.id,
          appointmentId,
          JSON.stringify({ action, amount: amount ?? null, reason: reason.trim(), appointmentNumber: appt.appointment_number, previousStatus: appt.payment_status }),
          req.ip ?? null,
          req.user!.countryCode ?? null,
        ]
      ).catch(() => {});

      res.json({ success: true, message: `Override '${action}' applied to appointment ${appt.appointment_number}` });
    } catch (err) {
      console.error("[ledger-override POST]", err);
      res.status(500).json({ message: "Failed to apply ledger override" });
    }
  });

  // ── Regional Revenue Summary ──────────────────────────────────────────────

  app.get("/api/admin/financial/regional-summary", authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PAYMENTS_VIEW), async (_req: AuthRequest, res: Response) => {
    try {
      const rates = await getRates();
      const hufRate = rates["HUF"] ?? 365;
      const irrRate = rates["IRR"] ?? 42000;

      const { rows } = await pool.query(`
        SELECT
          a.country_code::text                                              AS country_code,
          COUNT(CASE WHEN a.payment_status = 'completed' THEN 1 END)       AS completed_count,
          COUNT(a.id)                                                       AS total_count,
          COALESCE(SUM(CASE WHEN a.payment_status = 'completed' THEN a.total_amount::numeric ELSE 0 END), 0)                   AS gross_usd,
          COALESCE(SUM(CASE WHEN a.payment_status = 'completed' THEN COALESCE(a.platform_fee_amount::numeric, 0) ELSE 0 END), 0) AS fees_usd,
          COALESCE(SUM(CASE WHEN a.payment_status = 'completed' THEN COALESCE(a.refund_amount::numeric, 0) ELSE 0 END), 0)      AS refunds_usd
        FROM appointments a
        GROUP BY a.country_code
        ORDER BY gross_usd DESC
      `);

      const enriched = rows.map((r: any) => {
        const grossUsd  = parseFloat(r.gross_usd);
        const feesUsd   = parseFloat(r.fees_usd);
        const refundsUsd = parseFloat(r.refunds_usd);
        const netUsd = grossUsd - feesUsd;

        const cc = (r.country_code ?? "").toUpperCase();
        const localCurrency = cc === "HU" ? "HUF" : cc === "IR" ? "IRR" : "USD";
        const localRate     = cc === "HU" ? hufRate : cc === "IR" ? irrRate : 1;

        return {
          country_code:     r.country_code,
          currency:         localCurrency,
          completed_count:  Number(r.completed_count),
          total_count:      Number(r.total_count),
          gross_usd:        grossUsd,
          fees_usd:         feesUsd,
          refunds_usd:      refundsUsd,
          net_usd:          netUsd,
          gross_local:      Math.round(grossUsd * localRate),
          fees_local:       Math.round(feesUsd * localRate),
          net_local:        Math.round(netUsd * localRate),
        };
      });

      res.json({ regions: enriched });
    } catch (err) {
      console.error("[regional-summary]", err);
      res.status(500).json({ message: "Failed to fetch regional summary" });
    }
  });

  app.post("/api/admin/financial/repair-earnings/apply", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      if (!isAdminRole(req.user!.role)) {
        return res.status(403).json({ message: "Global admin required" });
      }
      const client = await pool.connect();
      let earningsFixed = 0;
      let walletsFixed = 0;
      try {
        await client.query("BEGIN");

        // Step 1: Correct provider_earnings rows where stored value differs from source
        const earningsResult = await client.query(`
          UPDATE provider_earnings pe
          SET
            total_amount     = a.total_amount,
            platform_fee     = COALESCE(a.platform_fee_amount, '0'),
            provider_earning = GREATEST(0,
                                 a.total_amount::numeric -
                                 COALESCE(a.platform_fee_amount::numeric, 0)
                               )::text,
            updated_at       = NOW()
          FROM appointments a
          WHERE a.id = pe.appointment_id
            AND a.payment_status = 'completed'
            AND ABS(
                  pe.provider_earning::numeric -
                  GREATEST(0,
                    a.total_amount::numeric -
                    COALESCE(a.platform_fee_amount::numeric, 0)
                  )
                ) > 0.001
          RETURNING pe.id
        `);
        earningsFixed = earningsResult.rowCount ?? 0;

        // Step 2: Recalculate provider_wallets from corrected provider_earnings.
        // available_balance = sum of unpaid earnings (status != 'paid')
        // lifetime_earnings = sum of all earnings regardless of status
        const walletsResult = await client.query(`
          UPDATE provider_wallets pw
          SET
            lifetime_earnings = COALESCE((
              SELECT SUM(pe.provider_earning::numeric)
              FROM provider_earnings pe
              WHERE pe.provider_id = pw.provider_id
            ), 0),
            available_balance = COALESCE((
              SELECT SUM(pe.provider_earning::numeric)
              FROM provider_earnings pe
              WHERE pe.provider_id = pw.provider_id
                AND pe.status != 'paid'
            ), 0) - COALESCE((
              SELECT SUM(pr.amount::numeric)
              FROM payout_requests pr
              WHERE pr.provider_id = pw.provider_id
                AND pr.status = 'paid'
            ), 0),
            updated_at = NOW()
          WHERE EXISTS (
            SELECT 1 FROM provider_earnings pe
            WHERE pe.provider_id = pw.provider_id
          )
          RETURNING pw.provider_id
        `);
        walletsFixed = walletsResult.rowCount ?? 0;

        await client.query("COMMIT");

        pool.query(
          `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, country_code)
           VALUES ($1, 'repair_earnings', 'provider_earnings', 'bulk', $2, 'HU')`,
          [req.user!.id, JSON.stringify({ earningsFixed, walletsFixed })]
        ).catch(() => {});

        res.json({
          success: true,
          earningsFixed,
          walletsFixed,
          message: `Corrected ${earningsFixed} earnings records and ${walletsFixed} wallet balances.`,
        });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error("repair-earnings apply error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ── GET /api/admin/financial/alerts ────────────────────────────────────────
  // Section F — financial anomaly alerts list
  app.get(
    "/api/admin/financial/alerts",
    authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PAYMENTS_VIEW),
    async (req: AuthRequest, res: Response) => {
      try {
        const status      = req.query.status      as string | undefined;
        const severity    = req.query.severity    as string | undefined;
        const countryCode = listingCountryFilter(req.user!, req.query as any);
        const page        = Math.max(1, parseInt((req.query.page  as string) || "1",  10));
        const limit       = Math.min(100, parseInt((req.query.limit as string) || "50", 10));
        const offset      = (page - 1) * limit;

        const conditions: string[] = [];
        const params: unknown[] = [];
        let p = 1;

        if (status)      { conditions.push(`status = $${p++}`);       params.push(status); }
        if (severity)    { conditions.push(`severity = $${p++}`);     params.push(severity); }
        if (countryCode) { conditions.push(`country_code = $${p++}`); params.push(countryCode); }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const [{ rows: alerts }, { rows: countRows }] = await Promise.all([
          pool.query(
            `SELECT id, check_type, severity, entity_type, entity_id, message, details,
                    country_code, status, source_reconciliation_id,
                    acknowledged_at, acknowledged_by, resolved_at, created_at
             FROM financial_alerts ${where}
             ORDER BY
               CASE severity WHEN 'critical' THEN 0 WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
               created_at DESC
             LIMIT $${p} OFFSET $${p + 1}`,
            [...params, limit, offset],
          ),
          pool.query(
            `SELECT COUNT(*) AS cnt FROM financial_alerts ${where}`,
            params,
          ),
        ]);

        res.json({
          alerts,
          total: parseInt(countRows[0]?.cnt ?? "0", 10),
          page,
          limit,
        });
      } catch (err: any) {
        console.error("financial-alerts list error:", err);
        res.status(500).json({ message: "Failed to load financial alerts" });
      }
    },
  );

  // ── PATCH /api/admin/financial/alerts/:id ──────────────────────────────────
  // Section F — acknowledge or resolve an alert
  app.patch(
    "/api/admin/financial/alerts/:id",
    authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PAYMENTS_VIEW),
    async (req: AuthRequest, res: Response) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        if (!["acknowledged", "resolved"].includes(status)) {
          return res.status(400).json({ message: "status must be 'acknowledged' or 'resolved'" });
        }

        const now = new Date().toISOString();
        const updates: string[] = ["status = $1"];
        const params: unknown[] = [status];
        let p = 2;

        if (status === "acknowledged") {
          updates.push(`acknowledged_at = $${p++}`, `acknowledged_by = $${p++}`);
          params.push(now, req.user!.id);
        } else if (status === "resolved") {
          updates.push(`resolved_at = $${p++}`, `acknowledged_by = $${p++}`);
          params.push(now, req.user!.id);
        }

        params.push(id);
        const { rows } = await pool.query(
          `UPDATE financial_alerts SET ${updates.join(", ")} WHERE id = $${p} RETURNING *`,
          params,
        );

        if (!rows[0]) return res.status(404).json({ message: "Alert not found" });
        res.json({ alert: rows[0] });
      } catch (err: any) {
        console.error("financial-alerts update error:", err);
        res.status(500).json({ message: "Failed to update alert" });
      }
    },
  );

  // ── POST /api/admin/financial/alerts/generate ──────────────────────────────
  // Section F — manually trigger alert generation from reconciliation results
  app.post(
    "/api/admin/financial/alerts/generate",
    authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PAYMENTS_VIEW),
    async (_req: AuthRequest, res: Response) => {
      try {
        const { generateFinancialAlerts } = await import("../../lib/financial-alerting");
        const count = await generateFinancialAlerts(pool);
        res.json({ generated: count, message: `${count} new financial alert(s) created` });
      } catch (err: any) {
        console.error("financial-alerts generate error:", err);
        res.status(500).json({ message: "Failed to generate alerts" });
      }
    },
  );

  // ── GET /api/admin/financial/revenue-trends ────────────────────────────────
  // Phase C — 12-month monthly revenue time-series with country breakdown
  app.get(
    "/api/admin/financial/revenue-trends",
    authenticateToken, requireAdmin, requirePermission(PERMISSIONS.ANALYTICS_VIEW),
    async (req: AuthRequest, res: Response) => {
      try {
        const months = Math.min(24, Math.max(1, parseInt(String(req.query.months ?? "12"), 10)));
        const countryCode = listingCountryFilter(req.user!, req.query as any);

        const countryFilter = countryCode ? `AND a.country_code::text = $2` : "";
        const params: unknown[] = [months];
        if (countryCode) params.push(countryCode);

        const { rows } = await pool.query(
          `SELECT
             TO_CHAR(DATE_TRUNC('month', a.created_at), 'YYYY-MM') AS month,
             a.country_code::text                                   AS country_code,
             COUNT(*)                                               AS total_appointments,
             COUNT(CASE WHEN a.payment_status = 'completed' THEN 1 END)  AS completed_count,
             COUNT(CASE WHEN a.status IN ('cancelled','no_show') THEN 1 END) AS cancelled_count,
             COALESCE(SUM(CASE WHEN a.payment_status = 'completed' THEN a.total_amount::numeric ELSE 0 END), 0)                        AS gross_usd,
             COALESCE(SUM(CASE WHEN a.payment_status = 'completed' THEN COALESCE(a.platform_fee_amount::numeric, 0) ELSE 0 END), 0)    AS fees_usd,
             COALESCE(SUM(CASE WHEN a.payment_status = 'completed' THEN COALESCE(a.refund_amount::numeric, 0) ELSE 0 END), 0)          AS refunds_usd
           FROM appointments a
           WHERE a.created_at >= DATE_TRUNC('month', NOW() - ($1::int || ' months')::interval)
             ${countryFilter}
           GROUP BY DATE_TRUNC('month', a.created_at), a.country_code
           ORDER BY month ASC`,
          params,
        );

        // Fill in any missing months so the chart always has a continuous series
        const filled: Record<string, any> = {};
        for (let i = months - 1; i >= 0; i--) {
          const d = new Date();
          d.setDate(1);
          d.setMonth(d.getMonth() - i);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          filled[key] = { month: key, total_appointments: 0, completed_count: 0, cancelled_count: 0, gross_usd: 0, fees_usd: 0, refunds_usd: 0, net_usd: 0 };
        }
        for (const r of rows) {
          const key = r.month as string;
          filled[key] = {
            ...filled[key],
            month: key,
            country_code: r.country_code,
            total_appointments: Number(r.total_appointments),
            completed_count: Number(r.completed_count),
            cancelled_count: Number(r.cancelled_count),
            gross_usd: parseFloat(r.gross_usd),
            fees_usd: parseFloat(r.fees_usd),
            refunds_usd: parseFloat(r.refunds_usd),
            net_usd: parseFloat(r.gross_usd) - parseFloat(r.fees_usd),
          };
        }

        res.json({ trends: Object.values(filled), months });
      } catch (err: any) {
        console.error("[revenue-trends]", err);
        res.status(500).json({ message: "Failed to load revenue trends" });
      }
    },
  );

  // ── GET /api/admin/analytics/commercial ───────────────────────────────────
  // Phase C — promo code effectiveness, package/membership conversion,
  //           referral conversion, gift card stats, waitlist conversion
  app.get(
    "/api/admin/analytics/commercial",
    authenticateToken, requireAdmin, requirePermission(PERMISSIONS.ANALYTICS_VIEW),
    async (req: AuthRequest, res: Response) => {
      try {
        const countryCode = listingCountryFilter(req.user!, req.query as any);
        const ccFilter = countryCode ? `AND country_code::text = $1` : "";
        const ccFilterNoAlias = countryCode ? `AND a.country_code::text = $1` : "";
        const params: unknown[] = countryCode ? [countryCode] : [];

        const client = await pool.connect();
        try {
          const [promoRows, packageRows, referralRows, waitlistRows, giftCardRows] = await Promise.all([
            // Promo code effectiveness
            client.query(
              `SELECT
                 pc.code,
                 pc.discount_type,
                 pc.discount_value,
                 COUNT(a.id)                                                         AS usage_count,
                 COALESCE(SUM(a.total_amount::numeric), 0)                           AS gross_revenue_usd,
                 COALESCE(SUM(COALESCE(a.promo_discount::numeric, 0)), 0)            AS total_discount_usd
               FROM promo_codes pc
               LEFT JOIN appointments a ON a.promo_code = pc.code
                 AND a.payment_status = 'completed'
                 ${countryCode ? "AND a.country_code::text = $1" : ""}
               GROUP BY pc.id, pc.code, pc.discount_type, pc.discount_value
               ORDER BY usage_count DESC
               LIMIT 20`,
              params,
            ),
            // Package conversion
            client.query(
              `SELECT
                 mp.name                                                              AS package_name,
                 mp.price                                                             AS price_native,
                 COUNT(up.id)                                                         AS purchases,
                 COUNT(CASE WHEN up.status = 'active' THEN 1 END)                   AS active_count,
                 COUNT(CASE WHEN up.status = 'expired' THEN 1 END)                  AS expired_count,
                 COALESCE(SUM(mp.price::numeric), 0)                                AS total_price_native
               FROM packages mp
               LEFT JOIN user_packages up ON up.package_id = mp.id
               GROUP BY mp.id, mp.name, mp.price
               ORDER BY purchases DESC`,
              [],
            ),
            // Referral conversion
            client.query(
              `SELECT
                 COUNT(*) FILTER (WHERE status = 'pending')   AS pending,
                 COUNT(*) FILTER (WHERE status = 'qualified') AS qualified,
                 COUNT(*) FILTER (WHERE status = 'rewarded')  AS rewarded,
                 COUNT(*)                                      AS total,
                 CASE WHEN COUNT(*) > 0
                   THEN ROUND(COUNT(*) FILTER (WHERE status IN ('qualified','rewarded')) * 100.0 / COUNT(*), 1)
                   ELSE 0 END                                  AS conversion_rate_pct
               FROM referrals`,
              [],
            ),
            // Waitlist conversion
            client.query(
              `SELECT
                 COUNT(*) FILTER (WHERE status = 'active')    AS active,
                 COUNT(*) FILTER (WHERE status = 'fulfilled') AS fulfilled,
                 COUNT(*) FILTER (WHERE status = 'expired')   AS expired,
                 COUNT(*)                                      AS total,
                 CASE WHEN COUNT(*) > 0
                   THEN ROUND(COUNT(*) FILTER (WHERE status = 'fulfilled') * 100.0 / COUNT(*), 1)
                   ELSE 0 END                                  AS fulfillment_rate_pct
               FROM waitlist_entries`,
              [],
            ),
            // Gift card stats (uses is_active / redeemed_at / expires_at — no status enum)
            client.query(
              `SELECT
                 COUNT(*) FILTER (WHERE is_active AND redeemed_at IS NULL AND (expires_at IS NULL OR expires_at > NOW()))  AS active_cards,
                 COUNT(*) FILTER (WHERE redeemed_at IS NOT NULL)                                                          AS redeemed_cards,
                 COUNT(*) FILTER (WHERE is_active AND expires_at IS NOT NULL AND expires_at <= NOW() AND redeemed_at IS NULL) AS expired_cards,
                 COUNT(*)                                                                                                  AS total_issued,
                 COALESCE(SUM(initial_amount::numeric), 0)                                                                AS total_value_usd,
                 COALESCE(SUM(CASE WHEN redeemed_at IS NOT NULL THEN initial_amount::numeric ELSE 0 END), 0)              AS redeemed_value_usd
               FROM gift_cards`,
              [],
            ),
          ]);

          res.json({
            promoEffectiveness: promoRows.rows.map((r: any) => ({
              code: r.code,
              discountType: r.discount_type,
              discountValue: parseFloat(r.discount_value),
              usageCount: Number(r.usage_count),
              grossRevenueUsd: parseFloat(r.gross_revenue_usd),
              totalDiscountUsd: parseFloat(r.total_discount_usd),
            })),
            packageConversion: packageRows.rows.map((r: any) => ({
              packageName: r.package_name,
              priceNative: parseFloat(r.price_native ?? "0"),
              purchases: Number(r.purchases),
              activeCount: Number(r.active_count),
              expiredCount: Number(r.expired_count),
              totalPriceNative: parseFloat(r.total_price_native),
            })),
            referralConversion: referralRows.rows[0] ? {
              pending: Number(referralRows.rows[0].pending),
              qualified: Number(referralRows.rows[0].qualified),
              rewarded: Number(referralRows.rows[0].rewarded),
              total: Number(referralRows.rows[0].total),
              conversionRatePct: parseFloat(referralRows.rows[0].conversion_rate_pct),
            } : null,
            waitlistConversion: waitlistRows.rows[0] ? {
              active: Number(waitlistRows.rows[0].active),
              fulfilled: Number(waitlistRows.rows[0].fulfilled),
              expired: Number(waitlistRows.rows[0].expired),
              total: Number(waitlistRows.rows[0].total),
              fulfillmentRatePct: parseFloat(waitlistRows.rows[0].fulfillment_rate_pct),
            } : null,
            giftCards: giftCardRows.rows[0] ? {
              activeCards: Number(giftCardRows.rows[0].active_cards),
              redeemedCards: Number(giftCardRows.rows[0].redeemed_cards),
              expiredCards: Number(giftCardRows.rows[0].expired_cards),
              totalIssued: Number(giftCardRows.rows[0].total_issued),
              totalValueUsd: parseFloat(giftCardRows.rows[0].total_value_usd),
              redeemedValueUsd: parseFloat(giftCardRows.rows[0].redeemed_value_usd),
            } : null,
          });
        } finally {
          client.release();
        }
      } catch (err: any) {
        console.error("[commercial-analytics]", err);
        res.status(500).json({ message: "Failed to load commercial analytics" });
      }
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // FINANCIAL MASTER REPORT — single source of truth for every booking/payment
  // ─────────────────────────────────────────────────────────────────────────────

  const mw = [authenticateToken, requireAdmin, requirePermission(PERMISSIONS.PAYMENTS_VIEW)];

  // Shared query builder — returns { sql, params }
  function buildMasterWhere(q: Record<string, any>, countryFilter: string | null) {
    const conditions: string[] = ["1=1"];
    const params: any[] = [];
    let idx = 1;

    if (countryFilter) {
      conditions.push(`a.country_code::text = $${idx++}`);
      params.push(countryFilter);
    }
    if (q.dateFrom) {
      conditions.push(`a.created_at >= $${idx++}::timestamptz`);
      params.push(q.dateFrom);
    }
    if (q.dateTo) {
      conditions.push(`a.created_at < ($${idx++}::date + INTERVAL '1 day')::timestamptz`);
      params.push(q.dateTo);
    }
    if (q.status && q.status !== "all") {
      conditions.push(`a.status::text = $${idx++}`);
      params.push(q.status);
    }
    if (q.paymentStatus && q.paymentStatus !== "all") {
      conditions.push(`a.payment_status::text = $${idx++}`);
      params.push(q.paymentStatus);
    }
    if (q.visitType && q.visitType !== "all") {
      conditions.push(`a.visit_type::text = $${idx++}`);
      params.push(q.visitType);
    }
    if (q.refundStatus && q.refundStatus !== "all") {
      conditions.push(`a.refund_status = $${idx++}`);
      params.push(q.refundStatus);
    }
    if (q.search) {
      const s = `%${q.search}%`;
      conditions.push(`(
        a.appointment_number ILIKE $${idx} OR
        pu.first_name ILIKE $${idx} OR pu.last_name ILIKE $${idx} OR pu.email ILIKE $${idx} OR
        pru.first_name ILIKE $${idx} OR pru.last_name ILIKE $${idx} OR pru.email ILIKE $${idx} OR
        svc.name ILIKE $${idx} OR
        a.promo_code ILIKE $${idx} OR
        pay.stripe_payment_id ILIKE $${idx} OR
        CAST(a.id AS text) ILIKE $${idx}
      )`);
      params.push(s);
      idx++;
    }

    return { where: conditions.join(" AND "), params, nextIdx: idx };
  }

  const MASTER_JOIN = `
    FROM appointments a
    JOIN users pu  ON pu.id  = a.patient_id
    JOIN providers prov ON prov.id = a.provider_id
    JOIN users pru ON pru.id = prov.user_id
    LEFT JOIN services svc  ON svc.id  = a.service_id
    LEFT JOIN payments pay  ON pay.appointment_id = a.id
    LEFT JOIN provider_earnings pe ON pe.appointment_id = a.id
    LEFT JOIN invoices inv ON inv.appointment_id = a.id
  `;

  // GET /api/admin/financial/master-report — paginated rows
  app.get(
    "/api/admin/financial/master-report",
    ...mw,
    async (req: AuthRequest, res: Response) => {
      try {
        const q = req.query as Record<string, any>;
        const countryFilter = listingCountryFilter(req.user!, q);
        const page  = Math.max(1, parseInt(q.page  || "1", 10));
        const limit = Math.min(200, Math.max(1, parseInt(q.limit || "50", 10)));
        const offset = (page - 1) * limit;
        const sortBy  = ["created_at","total_amount","start_at","status"].includes(q.sortBy) ? q.sortBy : "created_at";
        const sortDir = q.sortDir === "asc" ? "ASC" : "DESC";

        const { where, params, nextIdx } = buildMasterWhere(q, countryFilter);

        const countSql = `SELECT COUNT(*) AS total ${MASTER_JOIN} WHERE ${where}`;
        const dataSql = `
          SELECT
            a.id,
            a.appointment_number,
            a.status,
            a.payment_status,
            a.visit_type,
            svc.location_mode,
            a.created_at,
            a.updated_at,
            a.start_at,
            a.end_at,
            a.provider_timezone,
            a.country_code,
            a.total_amount,
            a.final_total_usd,
            a.display_currency,
            a.display_amount,
            a.exchange_rate_used,
            a.platform_fee_amount,
            a.promo_code,
            a.promo_discount,
            a.tax_amount,
            a.refund_amount,
            a.refund_status,
            a.service_price_snapshot,
            a.payment_method AS appt_payment_method,
            -- Patient
            pu.id          AS patient_id,
            pu.first_name  AS patient_first_name,
            pu.last_name   AS patient_last_name,
            pu.email       AS patient_email,
            pu.country_code::text AS patient_country,
            pu.city        AS patient_city,
            -- Provider
            prov.id        AS provider_id,
            pru.first_name AS provider_first_name,
            pru.last_name  AS provider_last_name,
            pru.email      AS provider_email,
            prov.provider_type::text AS provider_category,
            prov.country_code::text  AS provider_country,
            prov.city      AS provider_city,
            prov.clinic_name,
            -- Service
            svc.id         AS service_id,
            svc.name       AS service_name,
            svc.duration   AS service_duration,
            prov.provider_type::text AS service_category,
            -- Payment
            pay.id                    AS payment_id,
            pay.payment_method        AS payment_method,
            pay.stripe_payment_id     AS stripe_payment_id,
            pay.amount                AS payment_amount,
            pay.status                AS payment_record_status,
            pay.refund_status         AS payment_refund_status,
            pay.refunded_amount       AS payment_refunded_amount,
            -- Provider earnings
            pe.id               AS earning_id,
            pe.provider_earning AS provider_earning,
            pe.platform_fee     AS earning_platform_fee,
            pe.total_amount     AS earning_total_amount,
            pe.status           AS earning_status,
            pe.payout_reference AS payout_reference,
            pe.paid_at          AS earning_paid_at,
            -- Invoice
            inv.id             AS invoice_id,
            inv.invoice_number AS invoice_number,
            inv.status         AS invoice_status
          ${MASTER_JOIN}
          WHERE ${where}
          ORDER BY a.${sortBy} ${sortDir}
          LIMIT $${nextIdx} OFFSET $${nextIdx + 1}
        `;

        const [countRes, dataRes] = await Promise.all([
          pool.query(countSql, params),
          pool.query(dataSql, [...params, limit, offset]),
        ]);

        const total = Number(countRes.rows[0].total);
        res.json({
          rows: dataRes.rows,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        });
      } catch (err: any) {
        console.error("[master-report]", err);
        res.status(500).json({ message: err.message });
      }
    },
  );

  // GET /api/admin/financial/master-report/summary — KPI cards
  app.get(
    "/api/admin/financial/master-report/summary",
    ...mw,
    async (req: AuthRequest, res: Response) => {
      try {
        const q = req.query as Record<string, any>;
        const countryFilter = listingCountryFilter(req.user!, q);
        const { where, params } = buildMasterWhere(q, countryFilter);

        // Use final_total_usd (USD-normalized) when available; fall back to total_amount
        // for rows created before the column was added. This gives correct USD platform totals
        // even when bookings were made in HUF or IRR.
        const sql = `
          SELECT
            COUNT(*)                                                      AS total_bookings,
            COUNT(*) FILTER (WHERE a.status = 'completed')               AS completed_count,
            COUNT(*) FILTER (WHERE a.status IN ('cancelled','no_show','cancelled_by_patient','cancelled_by_provider'))   AS cancelled_count,
            COUNT(*) FILTER (WHERE a.refund_status = 'processed')        AS refunded_count,
            COALESCE(SUM(CASE WHEN a.payment_status='completed' THEN COALESCE(a.final_total_usd, a.total_amount)::numeric ELSE 0 END), 0)        AS gross_revenue,
            COALESCE(SUM(CASE WHEN a.payment_status='completed' THEN a.platform_fee_amount::numeric ELSE 0 END), 0)                              AS platform_revenue,
            COALESCE(SUM(CASE WHEN a.payment_status='completed' THEN pe.provider_earning::numeric ELSE 0 END), 0)                                AS provider_earnings,
            COALESCE(SUM(CASE WHEN a.refund_status='processed' THEN a.refund_amount::numeric ELSE 0 END), 0)                                     AS total_refunds,
            COALESCE(SUM(CASE WHEN a.payment_status='completed' THEN a.tax_amount::numeric ELSE 0 END), 0)                                       AS taxes_collected,
            COALESCE(SUM(CASE WHEN a.payment_status='completed' THEN a.promo_discount::numeric ELSE 0 END), 0)                                   AS promo_discounts,
            COALESCE(SUM(CASE WHEN pe.status='pending' THEN pe.provider_earning::numeric ELSE 0 END), 0)                                         AS pending_payouts
          ${MASTER_JOIN}
          WHERE ${where}
        `;
        const result = await pool.query(sql, params);
        const r = result.rows[0];
        res.json({
          totalBookings:    Number(r.total_bookings),
          completedCount:   Number(r.completed_count),
          cancelledCount:   Number(r.cancelled_count),
          refundedCount:    Number(r.refunded_count),
          grossRevenue:     parseFloat(r.gross_revenue),
          platformRevenue:  parseFloat(r.platform_revenue),
          providerEarnings: parseFloat(r.provider_earnings),
          totalRefunds:     parseFloat(r.total_refunds),
          taxesCollected:   parseFloat(r.taxes_collected),
          promoDiscounts:   parseFloat(r.promo_discounts),
          pendingPayouts:   parseFloat(r.pending_payouts),
        });
      } catch (err: any) {
        console.error("[master-report-summary]", err);
        res.status(500).json({ message: err.message });
      }
    },
  );

  // GET /api/admin/financial/master-report/:id/events — lifecycle timeline
  app.get(
    "/api/admin/financial/master-report/:id/events",
    ...mw,
    async (req: AuthRequest, res: Response) => {
      try {
        const { id } = req.params;
        const result = await pool.query(`
          SELECT ae.*,
                 u.first_name AS actor_first_name,
                 u.last_name  AS actor_last_name,
                 u.email      AS actor_email
          FROM appointment_events ae
          LEFT JOIN users u ON u.id = ae.actor_user_id
          WHERE ae.appointment_id = $1
          ORDER BY ae.created_at ASC
        `, [id]);
        res.json(result.rows);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // GET /api/admin/financial/master-report/export/csv — streaming CSV
  app.get(
    "/api/admin/financial/master-report/export/csv",
    ...mw,
    async (req: AuthRequest, res: Response) => {
      try {
        const q = req.query as Record<string, any>;
        const countryFilter = listingCountryFilter(req.user!, q);
        const { where, params, nextIdx } = buildMasterWhere(q, countryFilter);

        const limit = Math.min(100000, parseInt(q.limit || "100000", 10));
        const sql = `
          SELECT
            -- Section A: Booking
            a.appointment_number                        AS "Booking Ref",
            a.id                                        AS "Appointment ID",
            a.status                                    AS "Appointment Status",
            a.payment_status                            AS "Payment Status",
            TO_CHAR(a.created_at,'YYYY-MM-DD HH24:MI') AS "Created At",
            TO_CHAR(a.start_at,'YYYY-MM-DD HH24:MI')   AS "Appointment Date",
            TO_CHAR(a.end_at,'YYYY-MM-DD HH24:MI')     AS "Completion Date",
            TO_CHAR(a.updated_at,'YYYY-MM-DD HH24:MI') AS "Last Updated",
            a.visit_type                                AS "Visit Type",
            COALESCE(svc.location_mode, a.visit_type)  AS "Location Type",
            a.country_code                              AS "Country",
            -- Section B: Patient
            pu.id                                       AS "Patient ID",
            pu.first_name || ' ' || pu.last_name       AS "Patient Name",
            pu.email                                    AS "Patient Email",
            pu.city                                     AS "Patient City",
            -- Section C: Provider
            prov.id                                     AS "Provider ID",
            pru.first_name || ' ' || pru.last_name     AS "Provider Name",
            pru.email                                   AS "Provider Email",
            prov.provider_type                          AS "Provider Category",
            prov.city                                   AS "Provider City",
            prov.clinic_name                            AS "Clinic Name",
            -- Section D: Service
            svc.id                                      AS "Service ID",
            svc.name                                    AS "Service Name",
            prov.provider_type::text                    AS "Service Category",
            svc.duration                                AS "Duration (min)",
            -- Section E: Financial
            a.display_currency                          AS "Booking Currency",
            a.total_amount                              AS "Booking Amount",
            COALESCE(a.final_total_usd, a.total_amount) AS "Normalized USD Amount",
            a.platform_fee_amount                       AS "Platform Fee (USD)",
            pe.provider_earning                         AS "Provider Gross (USD)",
            (pe.provider_earning::numeric - COALESCE(pe.platform_fee::numeric,0)) AS "Provider Net (USD)",
            a.promo_discount                            AS "Promo Discount",
            a.promo_code                                AS "Promo Code",
            a.tax_amount                                AS "Tax",
            a.refund_amount                             AS "Refund Amount",
            a.refund_status                             AS "Refund Status",
            -- Section F: Payment
            pay.payment_method                          AS "Payment Method",
            pay.status                                  AS "Payment Gateway Status",
            pay.stripe_payment_id                       AS "Stripe Payment Intent ID",
            -- Section G: Payout
            pe.status                                   AS "Provider Earnings Status",
            pe.payout_reference                         AS "Payout Reference",
            TO_CHAR(pe.paid_at,'YYYY-MM-DD')            AS "Payout Date",
            -- Section H: Audit
            inv.invoice_number                          AS "Invoice Number",
            inv.status                                  AS "Invoice Status",
            a.id                                        AS "Audit Reference"
          ${MASTER_JOIN}
          WHERE ${where}
          ORDER BY a.created_at DESC
          LIMIT $${nextIdx}
        `;
        const result = await pool.query(sql, [...params, limit]);
        const cols = Object.keys(result.rows[0] || {});
        const csv = toCsv(result.rows, cols);

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="financial-master-report-${new Date().toISOString().slice(0,10)}.csv"`);
        res.send(csv);
      } catch (err: any) {
        console.error("[master-report-csv]", err);
        res.status(500).json({ message: err.message });
      }
    },
  );

  // ── GET /api/admin/analytics/memberships ─────────────────────────────────
  app.get(
    "/api/admin/analytics/memberships",
    authenticateToken,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      const countryFilter = listingCountryFilter(req);
      const client = await pool.connect();
      try {
        const countryClause = countryFilter ? `AND up.country_code::text = $1` : "";
        const params: any[] = countryFilter ? [countryFilter] : [];

        const summaryRes = await client.query(
          `SELECT
             COUNT(DISTINCT up.id)                                                          AS total_purchases,
             COUNT(DISTINCT up.id) FILTER (WHERE up.status = 'active')                     AS active_count,
             COUNT(DISTINCT up.id) FILTER (WHERE up.status IN ('expired','renewed'))        AS completed_count,
             COUNT(DISTINCT up.id) FILTER (WHERE up.status = 'cancelled')                   AS cancelled_count,
             COALESCE(SUM(up.price_paid) FILTER (WHERE up.status != 'cancelled'), 0)        AS total_revenue_usd,
             COUNT(DISTINCT up.user_id)                                                     AS unique_subscribers,
             COUNT(DISTINCT up.package_id)                                                  AS unique_packages
           FROM user_packages up
           WHERE 1=1 ${countryClause}`,
          params,
        );

        const idx = params.length + 1;
        const trendRes = await client.query(
          `SELECT
             TO_CHAR(DATE_TRUNC('month', up.created_at), 'Mon YYYY') AS month,
             DATE_TRUNC('month', up.created_at)                       AS month_ts,
             COUNT(*)                                                  AS purchases,
             COALESCE(SUM(up.price_paid), 0)                           AS revenue_usd
           FROM user_packages up
           WHERE up.created_at >= NOW() - INTERVAL '12 months'
             ${countryFilter ? `AND up.country_code::text = $1` : ""}
           GROUP BY DATE_TRUNC('month', up.created_at)
           ORDER BY month_ts`,
          params,
        );

        const packagesRes = await client.query(
          `SELECT
             p.name,
             p.currency,
             p.price,
             COUNT(up.id)                                              AS total_sales,
             COUNT(up.id) FILTER (WHERE up.status = 'active')         AS active_sales,
             COALESCE(SUM(up.price_paid) FILTER (WHERE up.status != 'cancelled'), 0) AS revenue_usd
           FROM packages p
           LEFT JOIN user_packages up ON up.package_id = p.id
             ${countryFilter ? `AND up.country_code::text = $1` : ""}
           WHERE p.is_active = true
             ${countryFilter ? `AND p.country_code::text = $1` : ""}
           GROUP BY p.id, p.name, p.currency, p.price
           ORDER BY total_sales DESC
           LIMIT 20`,
          params,
        );

        const summary = summaryRes.rows[0] || {};
        res.json({
          canonical_currency: "USD",
          summary: {
            totalPurchases: Number(summary.total_purchases ?? 0),
            activeCount: Number(summary.active_count ?? 0),
            completedCount: Number(summary.completed_count ?? 0),
            cancelledCount: Number(summary.cancelled_count ?? 0),
            totalRevenueUsd: Number(summary.total_revenue_usd ?? 0),
            uniqueSubscribers: Number(summary.unique_subscribers ?? 0),
            uniquePackages: Number(summary.unique_packages ?? 0),
          },
          trend: trendRes.rows.map((r: any) => ({
            month: r.month,
            purchases: Number(r.purchases),
            revenueUsd: Number(r.revenue_usd),
          })),
          packages: packagesRes.rows.map((r: any) => ({
            name: r.name,
            currency: r.currency,
            price: Number(r.price),
            totalSales: Number(r.total_sales),
            activeSales: Number(r.active_sales),
            revenueUsd: Number(r.revenue_usd),
          })),
        });
      } catch (err: any) {
        console.error("[memberships-analytics]", err);
        res.status(500).json({ message: "Failed to load membership analytics" });
      } finally {
        client.release();
      }
    },
  );

  // ── GET /api/admin/analytics/compliance ──────────────────────────────────
  app.get(
    "/api/admin/analytics/compliance",
    authenticateToken,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      const countryFilter = listingCountryFilter(req);
      const client = await pool.connect();
      try {
        const cc = countryFilter ? `AND country_code::text = $1` : "";
        const params: any[] = countryFilter ? [countryFilter] : [];

        const providerStatusRes = await client.query(
          `SELECT
             status::text,
             COUNT(*) AS cnt
           FROM providers
           WHERE 1=1 ${cc}
           GROUP BY status::text`,
          params,
        );

        const docStatusRes = await client.query(
          `SELECT
             pd.document_type,
             pd.verification_status::text,
             COUNT(*) AS cnt
           FROM provider_documents pd
           JOIN providers p ON p.id = pd.provider_id
           WHERE 1=1 ${countryFilter ? `AND p.country_code::text = $1` : ""}
           GROUP BY pd.document_type, pd.verification_status::text`,
          params,
        );

        const expiryRes = await client.query(
          `SELECT
             pd.document_type,
             COUNT(*) FILTER (WHERE pd.expires_at BETWEEN NOW() AND NOW() + INTERVAL '30 days') AS expiring_30d,
             COUNT(*) FILTER (WHERE pd.expires_at BETWEEN NOW() AND NOW() + INTERVAL '60 days') AS expiring_60d,
             COUNT(*) FILTER (WHERE pd.expires_at BETWEEN NOW() AND NOW() + INTERVAL '90 days') AS expiring_90d,
             COUNT(*) FILTER (WHERE pd.expires_at < NOW())                                        AS already_expired
           FROM provider_documents pd
           JOIN providers p ON p.id = pd.provider_id
           WHERE pd.expires_at IS NOT NULL
             ${countryFilter ? `AND p.country_code::text = $1` : ""}
           GROUP BY pd.document_type`,
          params,
        );

        const pendingKycRes = await client.query(
          `SELECT COUNT(*) AS cnt FROM providers WHERE status IN ('pending_approval','submitted','under_review') ${cc}`,
          params,
        );

        const recentAuditRes = await client.query(
          `SELECT action::text, entity_type, COUNT(*) AS cnt, MAX(created_at) AS last_at
           FROM audit_logs
           WHERE created_at >= NOW() - INTERVAL '7 days'
           GROUP BY action::text, entity_type
           ORDER BY cnt DESC
           LIMIT 20`,
        );

        res.json({
          providerStatusBreakdown: providerStatusRes.rows.map((r: any) => ({
            status: r.status,
            count: Number(r.cnt),
          })),
          documentStatusBreakdown: docStatusRes.rows.map((r: any) => ({
            documentType: r.document_type,
            verificationStatus: r.verification_status,
            count: Number(r.cnt),
          })),
          documentExpiry: expiryRes.rows.map((r: any) => ({
            documentType: r.document_type,
            expiring30d: Number(r.expiring_30d),
            expiring60d: Number(r.expiring_60d),
            expiring90d: Number(r.expiring_90d),
            alreadyExpired: Number(r.already_expired),
          })),
          pendingKycCount: Number(pendingKycRes.rows[0]?.cnt ?? 0),
          recentAuditActivity: recentAuditRes.rows.map((r: any) => ({
            action: r.action,
            entityType: r.entity_type,
            count: Number(r.cnt),
            lastAt: r.last_at,
          })),
        });
      } catch (err: any) {
        console.error("[compliance-analytics]", err);
        res.status(500).json({ message: "Failed to load compliance analytics" });
      } finally {
        client.release();
      }
    },
  );
}
