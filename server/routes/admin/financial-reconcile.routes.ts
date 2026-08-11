/**
 * Financial Reconciliation Engine
 *
 * POST /api/admin/financial/reconcile
 *   — Dry-run (default): scan provider_earnings for rows where the stored
 *     canonical USD net snapshot diverges from the immutable appointment
 *     provider-net snapshot, and return a JSON matrix of discrepancies.
 *   — Apply (?apply=true): wrap all corrections in a single Drizzle
 *     db.transaction; insert an audit_logs row for every mutated record
 *     before committing.  Any individual failure rolls back the entire batch.
 *
 * Canonical formula:
 *   canonical USD net = appointment.provider_net_earnings_snapshot
 *                       × provider_earnings.exchange_rate_used
 *
 * Auth: admin role + PAYMENTS_VIEW permission required.
 */

import type { Express, Response } from "express";
import { db, pool } from "../../db";
import { sql } from "drizzle-orm";
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

import { round2 } from "../../lib/math";

interface EarningDiscrepancy {
  id: string;
  providerId: string;
  appointmentId: string;
  providerName: string;
  status: string;
  createdAt: Date;
  storedEarning: number;
  canonicalAmount: number;
  delta: number;
}

export function registerFinancialReconcileRoutes(app: Express): void {
  app.post(
    "/api/admin/financial/reconcile",
    authenticateToken,
    requireAdmin,
    requirePermission(PERMISSIONS.PAYMENTS_VIEW),
    async (req: AuthRequest, res: Response) => {
      try {
        const apply = req.query.apply === "true";

        const bodySchema = z.object({
          fromDate: z.string().optional(),
          toDate: z.string().optional(),
        });
        const parsed = bodySchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid request body" });
        }
        const { fromDate, toDate } = parsed.data;

        const from = fromDate
          ? new Date(fromDate)
          : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const to = toDate ? new Date(toDate) : new Date();

        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
          return res.status(400).json({ message: "Invalid date range" });
        }

        const { rows } = await pool.query<{
          id: string;
          provider_id: string;
          appointment_id: string;
          total_amount: string;
          platform_fee: string;
          stored_earning: string;
  canonical_net_usd: string;
          provider_name: string;
          status: string;
          created_at: Date;
        }>(
          `SELECT
             pe.id,
             pe.provider_id,
             pe.appointment_id,
             pe.total_amount::text         AS total_amount,
             pe.platform_fee::text         AS platform_fee,
             pe.provider_net_earnings_amount_usd::text AS stored_earning,
             ROUND(
               COALESCE(a.provider_net_earnings_snapshot::numeric, 0)
               * COALESCE(NULLIF(pe.exchange_rate_used::numeric, 0), 1),
               2
             )::text AS canonical_net_usd,
             pe.status,
             pe.created_at,
             u.first_name || ' ' || u.last_name AS provider_name
           FROM provider_earnings pe
           JOIN providers p ON p.id = pe.provider_id
           JOIN users    u ON u.id = p.user_id
           JOIN appointments a ON a.id = pe.appointment_id
           WHERE pe.created_at >= $1
             AND pe.created_at <= $2
           ORDER BY pe.created_at DESC`,
          [from, to],
        );

        const discrepancies: EarningDiscrepancy[] = [];

        for (const row of rows) {
          const storedEarning = parseFloat(row.stored_earning);
          const canonicalAmount = round2(parseFloat(row.canonical_net_usd));
          const delta = round2(canonicalAmount - round2(storedEarning));

          if (Math.abs(delta) > 0.005) {
            discrepancies.push({
              id:              row.id,
              providerId:      row.provider_id,
              appointmentId:   row.appointment_id,
              providerName:    row.provider_name,
              status:          row.status,
              createdAt:       row.created_at,
              storedEarning:   round2(storedEarning),
              canonicalAmount,
              delta,
            });
          }
        }

        if (!apply) {
          return res.json({
            applied:          false,
            scannedCount:     rows.length,
            discrepancyCount: discrepancies.length,
            discrepancies,
          });
        }

        const correctedIds: string[] = [];
        const adminId = req.user!.id;

        if (discrepancies.length > 0) {
          await db.transaction(async (tx) => {
            for (const row of discrepancies) {
              const newAmountStr = row.canonicalAmount.toFixed(2);
              const auditDetail  = JSON.stringify({
                prevAmount:    row.storedEarning,
                newAmount:     row.canonicalAmount,
                delta:         row.delta,
                providerId:    row.providerId,
                appointmentId: row.appointmentId,
                timestamp:     new Date().toISOString(),
              });

              await tx.execute(
                sql`UPDATE provider_earnings
                    SET provider_net_earnings_amount_usd = ${newAmountStr}::numeric,
                        gross_provider_payout_usd = GREATEST(
                          provider_gross_earnings_amount_usd,
                          ${newAmountStr}::numeric
                        )
                    WHERE id = ${row.id}`,
              );

              await tx.execute(
                sql`INSERT INTO audit_logs
                      (user_id, action, entity_type, entity_id, details)
                    VALUES (
                      ${adminId},
                      'reconcile_earnings'::audit_action,
                      'provider_earnings',
                      ${row.id},
                      ${auditDetail}::jsonb
                    )`,
              );

              correctedIds.push(row.id);
            }
          });
        }

        return res.json({
          applied:          true,
          scannedCount:     rows.length,
          discrepancyCount: discrepancies.length,
          correctedCount:   correctedIds.length,
          correctedIds,
          discrepancies,
        });
      } catch (err: any) {
        console.error("[POST /api/admin/financial/reconcile] error:", err);
        res.status(500).json({ message: err.message || "Reconciliation failed" });
      }
    },
  );
}
