/**
 * Payout Automation Routes — Workstream 3 (P1 Launch Blockers)
 *
 * Provider schedule management + admin batch payout operations.
 *
 * GET  /api/provider/payouts/schedule         — provider: get my payout schedule
 * POST /api/provider/payouts/schedule         — provider: set payout schedule
 * GET  /api/admin/payouts/automation/health   — admin: payout health dashboard
 * POST /api/admin/payouts/automation/batch    — admin: run immediate batch payout
 * GET  /api/admin/payouts/automation/eligible — admin: list currently eligible providers
 * POST /api/admin/payouts/:id/retry           — admin: retry failed payout
 * GET  /api/admin/payouts/automation/history  — admin: batch payout audit log
 */

import type { Express, Response } from "express";
import { z } from "zod";
import { pool } from "../../db";
import { authenticateToken, requireAdmin, requireGlobalAdmin, type AuthRequest } from "../../middleware/auth";
import {
  getPayoutSchedule, setPayoutSchedule, runBatchPayout,
  retryFailedPayout, getPayoutHealthSummary,
} from "../../services/payout-automation.service";

const scheduleSchema = z.object({
  scheduleType: z.enum(["weekly", "monthly", "manual"]),
  minimumAmountUsd: z.number().min(1).max(10000).default(25),
  holdDays: z.number().min(0).max(60).default(3),
  enabled: z.boolean().default(true),
});

export function registerPayoutAutomationRoutes(app: Express): void {

  // ── GET /api/provider/payouts/schedule ──────────────────────────────────────
  app.get("/api/provider/payouts/schedule", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query<{ id: string }>(
        `SELECT id FROM providers WHERE user_id = $1 LIMIT 1`, [req.user!.id]
      );
      if (!rows[0]) return res.status(404).json({ error: "Provider not found" });
      const schedule = await getPayoutSchedule(rows[0].id);
      res.json({ schedule: schedule ?? null, hasSchedule: !!schedule });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // ── POST /api/provider/payouts/schedule ─────────────────────────────────────
  app.post("/api/provider/payouts/schedule", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query<{ id: string }>(
        `SELECT id FROM providers WHERE user_id = $1 LIMIT 1`, [req.user!.id]
      );
      if (!rows[0]) return res.status(404).json({ error: "Provider not found" });
      const parsed = scheduleSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
      const schedule = await setPayoutSchedule(
        rows[0].id, parsed.data.scheduleType, parsed.data.minimumAmountUsd,
        parsed.data.holdDays, parsed.data.enabled
      );
      res.json({ schedule });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // ── GET /api/admin/payouts/automation/health ─────────────────────────────────
  app.get("/api/admin/payouts/automation/health", authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const health = await getPayoutHealthSummary();
      res.json(health);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // ── POST /api/admin/payouts/automation/batch ─────────────────────────────────
  app.post("/api/admin/payouts/automation/batch", authenticateToken, requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { scheduleType, confirm } = req.body as { scheduleType?: string; confirm?: boolean };
      if (!confirm) return res.status(400).json({ error: "confirm: true required" });
      const result = await runBatchPayout(req.user!.id, scheduleType ?? "any");
      res.json(result);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // ── GET /api/admin/payouts/automation/eligible ───────────────────────────────
  app.get("/api/admin/payouts/automation/eligible", authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          ps.provider_id,
          ps.schedule_type,
          ps.minimum_amount_usd,
          ps.hold_days,
          ps.next_payout_at,
          ps.last_payout_at,
          pw.available_balance,
          COALESCE(p.clinic_name, u.first_name || ' ' || u.last_name) AS provider_name,
          COALESCE(psa.payouts_enabled, false) AS stripe_payouts_enabled,
          psa.stripe_account_id
        FROM payout_schedules ps
        JOIN provider_wallets pw ON pw.provider_id = ps.provider_id
        LEFT JOIN providers p ON p.id = ps.provider_id
        LEFT JOIN users u ON u.id = p.user_id
        LEFT JOIN provider_stripe_accounts psa ON psa.provider_id = ps.provider_id
        WHERE ps.enabled = true
          AND pw.is_frozen = false
          AND pw.available_balance >= ps.minimum_amount_usd
          AND (ps.next_payout_at IS NULL OR ps.next_payout_at <= NOW())
        ORDER BY pw.available_balance DESC
      `);
      res.json({ count: rows.length, providers: rows });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // ── POST /api/admin/payouts/:id/retry ────────────────────────────────────────
  app.post("/api/admin/payouts/:id/retry", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const result = await retryFailedPayout(req.params.id, req.user!.id);
      if (!result.success) return res.status(400).json({ error: result.error });
      res.json({ success: true, transferId: result.transferId });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // ── GET /api/admin/payouts/automation/history ────────────────────────────────
  app.get("/api/admin/payouts/automation/history", authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query(`
        SELECT al.id, al.action, al.details, al.created_at,
               u.first_name, u.last_name, u.email
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        WHERE al.entity_type = 'payout_batch'
        ORDER BY al.created_at DESC
        LIMIT 30
      `);
      res.json({ history: rows });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
}
