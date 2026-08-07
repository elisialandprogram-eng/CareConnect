/**
 * Financial compatibility routes.
 *
 * RevenueEngine + provider_earnings + provider_wallets/provider_ledger are
 * the canonical settlement path. marketplace_ledger remains readable for
 * historical reconciliation, but no request may create or settle new
 * appointment money through it.
 */

import type { Express, Response } from "express";
import { pool } from "../db";
import { authenticateToken, type AuthRequest } from "../middleware/auth";

export function registerFinancialsRoutes(app: Express): void {
  // These endpoints previously accepted client-supplied amounts and treated
  // booking-currency values as USD cents. Keep the paths for old clients, but
  // make the unsafe parallel settlement authority impossible to invoke.
  app.post(
    "/api/financials/capture-escrow",
    authenticateToken,
    (_req: AuthRequest, res: Response) => {
      res.status(410).json({
        message: "Marketplace escrow is retired. Payment capture is created by the booking payment flow.",
        code: "LEGACY_FINANCIAL_PATH",
      });
    },
  );

  app.post(
    "/api/financials/settle-appointment",
    authenticateToken,
    (_req: AuthRequest, res: Response) => {
      res.status(410).json({
        message: "Marketplace settlement is retired. Completed appointments settle through provider earnings.",
        code: "LEGACY_FINANCIAL_PATH",
      });
    },
  );

  // Provider wallet dashboard. The response keeps the legacy keys for
  // compatibility, but every balance is now derived from the canonical USD
  // provider wallet and the append-only provider ledger.
  app.get("/api/provider/wallet-summary", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user || req.user.role !== "provider") {
        return res.status(403).json({ message: "Provider access required" });
      }

      const provRes = await pool.query(
        `SELECT id FROM providers WHERE user_id = $1 LIMIT 1`,
        [req.user.id],
      );
      if (!provRes.rows.length) return res.status(404).json({ message: "Provider profile not found" });
      const providerId: string = provRes.rows[0].id;

      const [walletRes, ledgerRes] = await Promise.all([
        pool.query(
          `SELECT available_balance, pending_balance, held_balance, lifetime_earnings, currency
             FROM provider_wallets
            WHERE provider_id = $1
            LIMIT 1`,
          [providerId],
        ),
        pool.query(
          `SELECT id, created_at, amount, amount_usd, currency, entry_type,
                  reference_id, description, balance_after
             FROM provider_ledger
            WHERE provider_id = $1
            ORDER BY created_at DESC
            LIMIT 50`,
          [providerId],
        ),
      ]);

      const wallet = walletRes.rows[0] ?? {
        available_balance: "0",
        pending_balance: "0",
        held_balance: "0",
        lifetime_earnings: "0",
        currency: "USD",
      };

      res.json({
        currency: wallet.currency || "USD",
        // Legacy fields are cents, now explicitly cents of canonical USD.
        withdrawable_balance_cents: Math.round(Number(wallet.available_balance) * 100),
        pending_escrow_cents: Math.round(
          (Number(wallet.pending_balance) + Number(wallet.held_balance)) * 100,
        ),
        available_balance_usd: Number(wallet.available_balance),
        pending_balance_usd: Number(wallet.pending_balance),
        held_balance_usd: Number(wallet.held_balance),
        lifetime_earnings_usd: Number(wallet.lifetime_earnings),
        ledger: ledgerRes.rows,
      });
    } catch (err: any) {
      console.error("[GET /api/provider/wallet-summary]", err.message);
      res.status(500).json({ message: "Failed to fetch wallet summary" });
    }
  });
}