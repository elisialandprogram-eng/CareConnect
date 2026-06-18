/**
 * Marketplace Ledger — Double-Entry Financial Engine
 * Routes: 3 | Owner: finance | Auth: required
 *
 * POST /api/financials/capture-escrow       — hold funds on booking
 * POST /api/financials/settle-appointment   — atomic split on completion (admin)
 * GET  /api/provider/wallet-summary         — provider ledger dashboard
 *
 * Removed (Sprint RX-03):
 *   GET  /api/admin/financials/platform-summary  — legacy; superseded by revenue engine data
 *   GET  /api/admin/financials/commission-rate   — legacy; commission_rules is source of truth
 *   PUT  /api/admin/financials/commission-rate   — legacy; commission_rules is source of truth
 */

import type { Express, Response } from "express";
import { pool } from "../db";
import { authenticateToken, requireAdmin, type AuthRequest } from "../middleware/auth";
import { bookingLimiter } from "../middleware/rateLimiter";

// Legacy fallback: used ONLY by settle-appointment for appointments booked before Sprint RX-01.
// Do not expose this as an API endpoint; commission_rules is the source of truth.
async function getCommissionRate(): Promise<number> {
  try {
    const { rows: ruleRows } = await pool.query(
      `SELECT commission_percent FROM commission_rules WHERE commission_type = 'global' AND enabled = true ORDER BY priority ASC LIMIT 1`
    );
    if (ruleRows.length) return Math.min(0.3, Math.max(0, parseFloat(ruleRows[0].commission_percent) / 100));
  } catch {}
  try {
    const { rows } = await pool.query(
      `SELECT value FROM platform_settings WHERE key = 'marketplace_commission_rate' LIMIT 1`
    );
    if (rows.length) return Math.min(0.3, Math.max(0, parseFloat(rows[0].value) || 0.10));
  } catch {}
  return 0.10;
}

export function registerFinancialsRoutes(app: Express): void {

  // ── POST /api/financials/capture-escrow ─────────────────────────────────
  app.post("/api/financials/capture-escrow", authenticateToken, bookingLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const { appointment_id, amount_cents } = req.body as { appointment_id: unknown; amount_cents: unknown };
      if (!appointment_id) return res.status(400).json({ message: "appointment_id is required" });
      const cents = Number(amount_cents);
      if (!Number.isInteger(cents) || cents <= 0) {
        return res.status(400).json({ message: "amount_cents must be a positive integer" });
      }

      const { rows } = await pool.query(
        `INSERT INTO marketplace_ledger
           (appointment_id, source_account, destination_account, amount_cents, transaction_type, status)
         VALUES ($1, 'CLIENT_FUNDING', 'PLATFORM_ESCROW', $2, 'ESCROW_HOLD', 'PENDING')
         RETURNING *`,
        [appointment_id, cents]
      );

      res.status(201).json({ ledger: rows[0] });
    } catch (err: any) {
      console.error("[POST /api/financials/capture-escrow]", err.message);
      res.status(500).json({ message: "Failed to capture escrow" });
    }
  });

  // ── POST /api/financials/settle-appointment ─────────────────────────────
  app.post("/api/financials/settle-appointment", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    const client = await pool.connect();
    try {
      const { appointment_id } = req.body as { appointment_id: unknown };
      if (!appointment_id) return res.status(400).json({ message: "appointment_id is required" });

      await client.query("BEGIN");

      const apptRes = await client.query(
        `SELECT total_amount, commission_amount FROM appointments WHERE id = $1`,
        [appointment_id]
      );
      if (!apptRes.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Appointment not found" });
      }

      const totalCents = Math.round(parseFloat(apptRes.rows[0].total_amount || "0") * 100);
      // Sprint RX-01: Use stored RevenueEngine commission snapshot if available.
      // Falls back to getCommissionRate() for legacy appointments booked before RX-01.
      const storedCommissionAmount = apptRes.rows[0].commission_amount;

      const escrowCheck = await client.query(
        `SELECT id FROM marketplace_ledger
         WHERE appointment_id = $1 AND transaction_type = 'ESCROW_HOLD' AND status = 'PENDING'
         LIMIT 1`,
        [appointment_id]
      );
      if (!escrowCheck.rows.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "No pending escrow found for this appointment" });
      }

      let platformCutCents: number;
      let commissionRate: number;
      if (storedCommissionAmount !== null && storedCommissionAmount !== undefined) {
        platformCutCents = Math.round(parseFloat(storedCommissionAmount) * 100);
        commissionRate = totalCents > 0 ? platformCutCents / totalCents : 0;
      } else {
        commissionRate = await getCommissionRate();
        platformCutCents = Math.round(totalCents * commissionRate);
      }
      const providerShareCents = totalCents - platformCutCents;

      await client.query(
        `UPDATE marketplace_ledger
         SET status = 'SETTLED'
         WHERE appointment_id = $1 AND transaction_type = 'ESCROW_HOLD'`,
        [appointment_id]
      );

      await client.query(
        `INSERT INTO marketplace_ledger
           (appointment_id, source_account, destination_account, amount_cents, transaction_type, status)
         VALUES ($1, 'PLATFORM_ESCROW', 'PROVIDER_WITHDRAWABLE', $2, 'SESSION_COMPLETED_SPLIT', 'SETTLED')`,
        [appointment_id, providerShareCents]
      );

      await client.query(
        `INSERT INTO marketplace_ledger
           (appointment_id, source_account, destination_account, amount_cents, transaction_type, status)
         VALUES ($1, 'PLATFORM_ESCROW', 'PLATFORM_REVENUE', $2, 'SESSION_COMPLETED_SPLIT', 'SETTLED')`,
        [appointment_id, platformCutCents]
      );

      await client.query("COMMIT");

      res.json({
        settled: true,
        total_cents: totalCents,
        platform_cut_cents: platformCutCents,
        provider_share_cents: providerShareCents,
        commission_rate: commissionRate,
      });
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("[POST /api/financials/settle-appointment]", err.message);
      res.status(500).json({ message: "Failed to settle appointment" });
    } finally {
      client.release();
    }
  });

  // ── GET /api/provider/wallet-summary ────────────────────────────────────
  app.get("/api/provider/wallet-summary", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user || req.user.role !== "provider") {
        return res.status(403).json({ message: "Provider access required" });
      }

      const provRes = await pool.query(
        `SELECT id FROM providers WHERE user_id = $1 LIMIT 1`,
        [req.user.id]
      );
      if (!provRes.rows.length) return res.status(404).json({ message: "Provider profile not found" });
      const providerId: string = provRes.rows[0].id;

      const [withdrawableRes, escrowRes, ledgerRes] = await Promise.all([
        pool.query(
          `SELECT COALESCE(SUM(
             CASE WHEN ml.destination_account = 'PROVIDER_WITHDRAWABLE' THEN ml.amount_cents
                  WHEN ml.source_account      = 'PROVIDER_WITHDRAWABLE' THEN -ml.amount_cents
                  ELSE 0 END
           ), 0) AS balance_cents
           FROM marketplace_ledger ml
           JOIN appointments a ON a.id = ml.appointment_id
           WHERE a.provider_id = $1 AND ml.status = 'SETTLED'`,
          [providerId]
        ),
        pool.query(
          `SELECT COALESCE(SUM(ml.amount_cents), 0) AS escrow_cents
           FROM marketplace_ledger ml
           JOIN appointments a ON a.id = ml.appointment_id
           WHERE a.provider_id = $1
             AND ml.destination_account = 'PLATFORM_ESCROW'
             AND ml.status = 'PENDING'`,
          [providerId]
        ),
        pool.query(
          `SELECT ml.id, ml.created_at, ml.amount_cents, ml.transaction_type, ml.status,
                  a.date, a.start_time, a.visit_type,
                  s.name AS service_name
           FROM marketplace_ledger ml
           JOIN appointments a  ON a.id  = ml.appointment_id
           LEFT JOIN services s ON s.id  = a.service_id
           WHERE a.provider_id = $1
             AND ml.destination_account = 'PROVIDER_WITHDRAWABLE'
           ORDER BY ml.created_at DESC
           LIMIT 50`,
          [providerId]
        ),
      ]);

      res.json({
        withdrawable_balance_cents: parseInt(withdrawableRes.rows[0].balance_cents, 10),
        pending_escrow_cents:       parseInt(escrowRes.rows[0].escrow_cents, 10),
        ledger: ledgerRes.rows,
      });
    } catch (err: any) {
      console.error("[GET /api/provider/wallet-summary]", err.message);
      res.status(500).json({ message: "Failed to fetch wallet summary" });
    }
  });
}
