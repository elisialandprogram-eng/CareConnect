/**
 * Full Reconciliation Route — Workstream 4 (P1 Launch Blockers)
 *
 * GET /api/admin/financial/reconciliation/full
 *   — Runs all 7 financial integrity checks and returns structured findings.
 *   — Read-only. Does NOT mutate any data.
 *   — Auth: global_admin + PAYMENTS_VIEW permission
 */

import type { Express, Response } from "express";
import { authenticateToken, requireGlobalAdmin, type AuthRequest } from "../../middleware/auth";
import { requirePermission, PERMISSIONS } from "../../middleware/rbac";
import { runFullReconciliation } from "../../services/financial-reconciliation-full.service";

export function registerFullReconciliationRoute(app: Express): void {
  app.get(
    "/api/admin/financial/reconciliation/full",
    authenticateToken,
    requireGlobalAdmin,
    requirePermission(PERMISSIONS.PAYMENTS_VIEW),
    async (_req: AuthRequest, res: Response) => {
      try {
        const report = await runFullReconciliation();
        res.json(report);
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    }
  );
}
