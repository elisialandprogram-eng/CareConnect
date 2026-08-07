/**
 * Operational Health Dashboard APIs — Section F
 *
 * Backend-only endpoints consumed by future admin dashboard panels.
 * No frontend UI built here.
 *
 * Routes:
 *   GET /api/admin/health/scheduler        — job registry + state
 *   GET /api/admin/health/rate-limiting    — active rate-limit counters
 *   GET /api/admin/health/security         — login lockout + failure trends
 *   GET /api/admin/health/financial        — recon summary + unresolved alerts
 */

import type { Express, Response } from "express";
import { pool } from "../../db";
import {
  authenticateToken,
  requireAdmin,
  AuthRequest,
} from "../../middleware/auth";
import {
  requirePermission,
  PERMISSIONS,
} from "../../middleware/rbac";
import { getJobStates, countFailingJobs } from "../../lib/cronState";
import { getMetricsSummary } from "../../lib/requestMetrics";

export function registerAdminHealthRoutes(app: Express): void {

  // ── GET /api/admin/health/database ──────────────────────────────────────────
  // Connection pool counters + pg_stat_activity + table bloat + cache hit rates.
  app.get(
    "/api/admin/health/database",
    authenticateToken, requireAdmin, requirePermission(PERMISSIONS.MONITORING_VIEW),
    async (_req: AuthRequest, res: Response) => {
      const client = await pool.connect();
      try {
        const [activeConns, tableStats, cacheHit] = await Promise.all([
          client.query<{ state: string | null; count: string; wait_event_type: string | null }>(
            `SELECT state, COUNT(*) AS count, wait_event_type
             FROM pg_stat_activity
             WHERE datname = current_database()
             GROUP BY state, wait_event_type
             ORDER BY count DESC`,
          ),
          client.query<{
            relname: string; n_live_tup: string; n_dead_tup: string;
            last_autovacuum: string | null; last_analyze: string | null;
          }>(
            `SELECT relname, n_live_tup, n_dead_tup, last_autovacuum, last_analyze
             FROM pg_stat_user_tables
             ORDER BY n_live_tup DESC LIMIT 20`,
          ),
          client.query<{ heap_hit_rate: string | null; idx_hit_rate: string | null }>(
            `SELECT
               ROUND(100.0 * SUM(heap_blks_hit)
                 / NULLIF(SUM(heap_blks_hit) + SUM(heap_blks_read), 0), 2) AS heap_hit_rate,
               ROUND(100.0 * SUM(idx_blks_hit)
                 / NULLIF(SUM(idx_blks_hit)  + SUM(idx_blks_read),  0), 2) AS idx_hit_rate
             FROM pg_statio_user_tables`,
          ),
        ]);

        res.json({
          pool: {
            total:   pool.totalCount,
            idle:    pool.idleCount,
            waiting: pool.waitingCount,
            max:     5,
          },
          connections: {
            byState: activeConns.rows.map((r) => ({
              state:         r.state ?? "unknown",
              count:         parseInt(r.count, 10),
              waitEventType: r.wait_event_type,
            })),
          },
          topTables: tableStats.rows.map((r) => ({
            table:          r.relname,
            liveRows:       parseInt(r.n_live_tup,  10),
            deadRows:       parseInt(r.n_dead_tup,  10),
            lastAutovacuum: r.last_autovacuum,
            lastAnalyze:    r.last_analyze,
          })),
          cacheHitRate: {
            heap:  parseFloat(cacheHit.rows[0]?.heap_hit_rate ?? "0"),
            index: parseFloat(cacheHit.rows[0]?.idx_hit_rate  ?? "0"),
          },
        });
      } catch (err: any) {
        console.error("[health/database]", err);
        res.status(500).json({ message: "Failed to load database health" });
      } finally {
        client.release();
      }
    },
  );

  // ── GET /api/admin/health/scheduler ─────────────────────────────────────────
  // Returns per-job health state (last run, consecutive failures, next approx run).
  app.get(
    "/api/admin/health/scheduler",
    authenticateToken, requireAdmin, requirePermission(PERMISSIONS.MONITORING_VIEW),
    async (_req: AuthRequest, res: Response) => {
      try {
        const jobs    = getJobStates();
        const failing = countFailingJobs();
        res.json({
          summary: {
            totalJobs:         jobs.length,
            failingJobs:       failing,
            healthyJobs:       jobs.filter((j) => j.status === "ok").length,
            idleJobs:          jobs.filter((j) => j.status === "idle").length,
          },
          jobs: jobs.map((j) => ({
            name:                 j.jobName,
            status:               j.status,
            lastRunAt:            j.lastRunAt,
            lastDurationMs:       j.lastDurationMs,
            consecutiveFailures:  j.consecutiveFailures,
            totalRuns:            j.totalRuns,
            totalFailures:        j.totalFailures,
            lastError:            j.lastError,
            lastItemCount:        j.lastItemCount,
          })),
        });
      } catch (err: any) {
        console.error("[health/scheduler]", err);
        res.status(500).json({ message: "Failed to load scheduler health" });
      }
    },
  );

  // ── GET /api/admin/health/rate-limiting ─────────────────────────────────────
  // Active rate-limit counters, blocked routes, top offenders.
  app.get(
    "/api/admin/health/rate-limiting",
    authenticateToken, requireAdmin, requirePermission(PERMISSIONS.MONITORING_VIEW),
    async (_req: AuthRequest, res: Response) => {
      try {
        const [activeRows, topRoutes, blockedRows] = await Promise.all([
          pool.query<{ cnt: string }>(
            `SELECT COUNT(*) AS cnt FROM rate_limit_hits WHERE reset_at > NOW()`,
          ),
          pool.query<{ key: string; hits: number; reset_at: string }>(
            `SELECT key, hits, reset_at
             FROM rate_limit_hits
             WHERE reset_at > NOW()
             ORDER BY hits DESC
             LIMIT 20`,
          ),
          pool.query<{ tier: string; blocked_count: string }>(
            `SELECT
               SPLIT_PART(key, ':', 1) AS tier,
               COUNT(*) AS blocked_count
             FROM rate_limit_hits
             WHERE reset_at > NOW() AND hits >= 5
             GROUP BY tier
             ORDER BY blocked_count DESC`,
          ),
        ]);

        res.json({
          activeCounters:     parseInt(activeRows.rows[0]?.cnt ?? "0", 10),
          topOffenders:       topRoutes.rows,
          blockedByTier:      blockedRows.rows,
          inProcessMetrics:   {
            uptime:    getMetricsSummary().uptimeMs,
            requests:  getMetricsSummary().totals.requests,
            errors5xx: getMetricsSummary().totals.errors5xx,
          },
        });
      } catch (err: any) {
        console.error("[health/rate-limiting]", err);
        res.status(500).json({ message: "Failed to load rate-limit health" });
      }
    },
  );

  // ── GET /api/admin/health/security ──────────────────────────────────────────
  // Login lockout status, failed-login trends, suspicious activity counts.
  app.get(
    "/api/admin/health/security",
    authenticateToken, requireAdmin, requirePermission(PERMISSIONS.MONITORING_VIEW),
    async (_req: AuthRequest, res: Response) => {
      const client = await pool.connect();
      try {
        const recentFailures = await client.query<{ cnt: string }>(
          `SELECT COUNT(*) AS cnt FROM login_attempts
           WHERE success = false AND created_at > NOW() - INTERVAL '1 hour'`,
        );
        const hardLockedEmails = await client.query<{ email: string; cnt: string }>(
          `SELECT email, COUNT(*) AS cnt
           FROM login_attempts
           WHERE success = false AND created_at > NOW() - INTERVAL '1 hour'
           GROUP BY email
           HAVING COUNT(*) >= 15
           ORDER BY cnt DESC
           LIMIT 10`,
        );
        const softLockedEmails = await client.query<{ email: string; cnt: string }>(
          `SELECT email, COUNT(*) AS cnt
           FROM login_attempts
           WHERE success = false AND created_at > NOW() - INTERVAL '15 minutes'
           GROUP BY email
           HAVING COUNT(*) >= 5
           ORDER BY cnt DESC
           LIMIT 10`,
        );
        const dailyTrend = await client.query<{ day: string; failures: string; successes: string }>(
          `SELECT
             DATE_TRUNC('day', created_at)::date AS day,
             COUNT(*) FILTER (WHERE success = false) AS failures,
             COUNT(*) FILTER (WHERE success = true)  AS successes
           FROM login_attempts
           WHERE created_at > NOW() - INTERVAL '7 days'
           GROUP BY day ORDER BY day DESC`,
        );
        const authEvents = await client.query<{ cnt: string }>(
          `SELECT COUNT(*) AS cnt FROM system_events
           WHERE event_type = 'auth_failure'
             AND created_at > NOW() - INTERVAL '24 hours'`,
        );

        res.json({
          summary: {
            failedLoginsLastHour:   parseInt(recentFailures.rows[0]?.cnt ?? "0", 10),
            hardLockedEmails:       hardLockedEmails.rows.length,
            softLockedEmails:       softLockedEmails.rows.length,
            authFailureEvents24h:   parseInt(authEvents.rows[0]?.cnt ?? "0", 10),
          },
          hardLocked:  hardLockedEmails.rows,
          softLocked:  softLockedEmails.rows,
          dailyTrend:  dailyTrend.rows,
        });
      } catch (err: any) {
        console.error("[health/security]", err);
        res.status(500).json({ message: "Failed to load security health" });
      } finally {
        client.release();
      }
    },
  );

  // ── GET /api/admin/health/financial ─────────────────────────────────────────
  // Reconciliation summary, unresolved financial alerts, ledger drift counts.
  app.get(
    "/api/admin/health/financial",
    authenticateToken, requireAdmin, requirePermission(PERMISSIONS.MONITORING_VIEW),
    async (_req: AuthRequest, res: Response) => {
      const client = await pool.connect();
      try {
        const reconSummary = await client.query<{ total: string; errors: string; criticals: string; last_run: string | null }>(
          `SELECT
             COUNT(*)                                                   AS total,
             COUNT(*) FILTER (WHERE severity = 'error')                AS errors,
             COUNT(*) FILTER (WHERE severity = 'critical')             AS criticals,
             MAX(run_at)                                                AS last_run
           FROM reconciliation_results
           WHERE run_at > NOW() - INTERVAL '24 hours'`,
        );
        const alertSummary = await client.query<{ status: string; cnt: string }>(
          `SELECT status, COUNT(*) AS cnt FROM financial_alerts GROUP BY status`,
        );
        const alertBySeverity = await client.query<{ severity: string; cnt: string }>(
          `SELECT severity, COUNT(*) AS cnt
           FROM financial_alerts
           WHERE status IN ('open', 'acknowledged')
           GROUP BY severity
           ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END`,
        );
        const ledgerDrift = await client.query<{ check_type: string; entity_id: string | null; message: string; run_at: string }>(
          `SELECT check_type, entity_id, message, run_at
           FROM reconciliation_results
           WHERE severity IN ('error', 'critical') AND resolved_at IS NULL
           ORDER BY run_at DESC LIMIT 10`,
        );
        const recentRecon = await client.query<{ check_type: string; severity: string; cnt: string }>(
          `SELECT check_type, severity, COUNT(*) AS cnt
           FROM reconciliation_results
           WHERE run_at > NOW() - INTERVAL '24 hours'
           GROUP BY check_type, severity
           ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'error' THEN 1 ELSE 2 END`,
        );

        const alertStatusMap: Record<string, number> = {};
        for (const row of alertSummary.rows) {
          alertStatusMap[row.status] = parseInt(row.cnt, 10);
        }

        const r = reconSummary.rows[0];
        res.json({
          reconciliation: {
            last24hFindings:   parseInt(r?.total     ?? "0", 10),
            errorsLast24h:     parseInt(r?.errors    ?? "0", 10),
            criticalsLast24h:  parseInt(r?.criticals ?? "0", 10),
            lastRunAt:         r?.last_run ?? null,
            checkBreakdown:    recentRecon.rows,
            findingsByType:    recentRecon.rows,
          },
          alerts: {
            byStatus:    alertStatusMap,
            bySeverity:  alertBySeverity.rows.map((r) => ({
              severity: r.severity,
              count: parseInt(r.cnt, 10),
            })),
            unresolved:  (alertStatusMap["open"] ?? 0) + (alertStatusMap["acknowledged"] ?? 0),
          },
          ledgerDrift: ledgerDrift.rows,
        });
      } catch (err: any) {
        console.error("[health/financial]", err);
        res.status(500).json({ message: "Failed to load financial health" });
      } finally {
        client.release();
      }
    },
  );
}
