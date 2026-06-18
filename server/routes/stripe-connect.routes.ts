/**
 * Stripe Connect Routes — Workstream 2 (P1 Launch Blockers)
 *
 * Provider onboarding and payout architecture via Stripe Express Connected Accounts.
 *
 * POST /api/provider/stripe-connect/onboard          — create account + get onboarding URL
 * GET  /api/provider/stripe-connect/status           — sync + return account status
 * GET  /api/provider/stripe-connect/dashboard-link   — get express dashboard URL
 * GET  /api/admin/stripe-connect/overview            — admin: all connected accounts
 * POST /api/admin/stripe-connect/:providerId/sync    — admin: force sync from Stripe
 * GET  /api/admin/stripe-connect/health              — payout health summary
 */

import type { Express, Response } from "express";
import { pool } from "../db";
import { authenticateToken, requireAdmin, requireGlobalAdmin, type AuthRequest } from "../middleware/auth";
import {
  createConnectedAccount, syncAccountStatus, getDashboardLink,
  getConnectedAccountsOverview,
} from "../services/stripe-connect.service";

const PLATFORM_URL = process.env.PLATFORM_URL ?? `https://${process.env.REPL_SLUG ?? "goldenlife"}.${process.env.REPL_OWNER ?? "replit"}.app`;

export function registerStripeConnectRoutes(app: Express): void {

  // ── POST /api/provider/stripe-connect/onboard ─────────────────────────────
  app.post("/api/provider/stripe-connect/onboard", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { rows: provRows } = await pool.query<{ id: string; country_code: string }>(
        `SELECT id, country_code FROM providers WHERE user_id = $1 LIMIT 1`, [userId]
      );
      if (!provRows[0]) return res.status(404).json({ error: "Provider profile not found. Complete onboarding first." });

      const returnUrl = `${PLATFORM_URL}/provider/dashboard?stripe_return=1`;
      const refreshUrl = `${PLATFORM_URL}/provider/dashboard?stripe_refresh=1`;

      const result = await createConnectedAccount(
        provRows[0].id,
        req.user!.email,
        provRows[0].country_code ?? "GB",
        returnUrl,
        refreshUrl
      );

      res.json({ accountId: result.accountId, onboardingUrl: result.onboardingUrl });
    } catch (err) {
      const msg = (err as Error).message;
      res.status(500).json({ error: msg });
    }
  });

  // ── GET /api/provider/stripe-connect/status ───────────────────────────────
  app.get("/api/provider/stripe-connect/status", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query<{ id: string }>(
        `SELECT id FROM providers WHERE user_id = $1 LIMIT 1`, [req.user!.id]
      );
      if (!rows[0]) return res.status(404).json({ error: "Provider not found" });
      const status = await syncAccountStatus(rows[0].id);
      res.json(status);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // ── GET /api/provider/stripe-connect/dashboard-link ──────────────────────
  app.get("/api/provider/stripe-connect/dashboard-link", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query<{ id: string }>(
        `SELECT id FROM providers WHERE user_id = $1 LIMIT 1`, [req.user!.id]
      );
      if (!rows[0]) return res.status(404).json({ error: "Provider not found" });
      const url = await getDashboardLink(rows[0].id);
      res.json({ url });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // ── GET /api/admin/stripe-connect/overview ────────────────────────────────
  app.get("/api/admin/stripe-connect/overview", authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const overview = await getConnectedAccountsOverview();
      res.json(overview);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // ── POST /api/admin/stripe-connect/:providerId/sync ───────────────────────
  app.post("/api/admin/stripe-connect/:providerId/sync", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { providerId } = req.params;
      const status = await syncAccountStatus(providerId);
      res.json(status);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // ── GET /api/admin/stripe-connect/health ──────────────────────────────────
  app.get("/api/admin/stripe-connect/health", authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE onboarding_complete = true) AS complete,
          COUNT(*) FILTER (WHERE charges_enabled = true) AS charges_enabled,
          COUNT(*) FILTER (WHERE payouts_enabled = true) AS payouts_enabled,
          COUNT(*) FILTER (WHERE requirements_due IS NOT NULL AND requirements_due != '[]'::jsonb) AS needs_attention,
          COUNT(*) AS total
        FROM provider_stripe_accounts
      `);
      const { rows: provTotal } = await pool.query(`SELECT COUNT(*) AS total FROM providers WHERE status = 'active'`);
      res.json({
        ...rows[0],
        totalActiveProviders: parseInt(provTotal[0].total, 10),
        notOnboarded: parseInt(provTotal[0].total, 10) - parseInt(rows[0].total, 10),
      });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
}
