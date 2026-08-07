/**
 * Monitoring routes
 * Routes: 5 | Owner: ops | Auth: public (health), admin (diagnostics, health-metrics)
 * Country isolation: N/A (system metrics) | Financial impact: no
 *
 * GET  /api/health
 * POST /api/client-errors
 * GET  /api/health-metrics
 * POST /api/health-metrics
 * DELETE /api/health-metrics/:id
 * GET  /api/admin/diagnostics
 */

import type { Express, Request, Response } from "express";
import { pool, getDbStartupMetrics } from "../db";
import { storage } from "../storage";
import { insertHealthMetricSchema } from "@shared/schema";
import { getCacheStats } from "../lib/cache";
import { getJobStates, countFailingJobs } from "../lib/cronState";
import { getWebhookMetrics } from "../stripeWebhook";
import { getMissingOptionalEnv, getEnvValidationResult } from "../config/env";
import { requirePermission, PERMISSIONS } from "../middleware/rbac";
import { authenticateToken, requireAdmin, type AuthRequest } from "../middleware/auth";
import { getMetricsSummary } from "../lib/requestMetrics";

export function registerMonitoringRoutes(app: Express): void {

  // ── GET /api/health ─────────────────────────────────────────────────────
  app.get("/api/health", async (_req: Request, res: Response) => {
    const checks: Record<string, { status: "healthy" | "degraded" | "failing"; [k: string]: unknown }> = {};

    try {
      const t0 = Date.now();
      await pool.query("SELECT 1");
      checks.database = { status: "healthy", latencyMs: Date.now() - t0 };
    } catch {
      checks.database = { status: "failing", error: "DB unreachable" };
    }

    const cacheStats = getCacheStats();
    const totalCacheEntries = cacheStats.reduce((s, c) => s + c.entries, 0);
    checks.cache = { status: "healthy", totalEntries: totalCacheEntries, instances: cacheStats.length };

    const failingJobs = countFailingJobs();
    checks.scheduler = {
      status: failingJobs === 0 ? "healthy" : "degraded",
      jobCount: getJobStates().length,
      failingJobs,
    };

    const stripeConfigured = !!(process.env.STRIPE_SECRET_KEY);
    const webhookConfigured = !!(process.env.STRIPE_WEBHOOK_SECRET);
    checks.stripe = {
      status: stripeConfigured ? "healthy" : "degraded",
      stripeConfigured,
      webhookConfigured,
    };

    const emailConfigured = !!(process.env.RESEND_API_KEY);
    const pushConfigured = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
    checks.notifications = {
      status: emailConfigured ? "healthy" : "degraded",
      email: emailConfigured ? "configured" : "missing_api_key",
      push: pushConfigured ? "configured" : "missing_vapid_keys",
    };

    const envResult = getEnvValidationResult();
    const envHealthy = envResult === null || envResult.valid;
    checks.environment = { status: envHealthy ? "healthy" : "degraded" };

    const overallStatus = Object.values(checks).some(c => c.status === "failing")
      ? "failing"
      : Object.values(checks).some(c => c.status === "degraded")
      ? "degraded"
      : "healthy";

    res.status(overallStatus === "failing" ? 503 : 200).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      checks,
    });
  });

  // ── POST /api/client-errors ─────────────────────────────────────────────
  app.post("/api/client-errors", async (req: Request, res: Response) => {
    try {
      const { message, stack, componentStack, url, userAgent, timestamp } = req.body ?? {};
      if (!message) return res.status(400).json({ message: "message required" });
      console.error("[client-error]", {
        message: String(message).slice(0, 500),
        stack: String(stack ?? "").slice(0, 2000),
        componentStack: String(componentStack ?? "").slice(0, 2000),
        url: String(url ?? "").slice(0, 500),
        userAgent: String(userAgent ?? "").slice(0, 300),
        timestamp: String(timestamp ?? new Date().toISOString()),
        ip: req.ip,
      });
      pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address)
         VALUES (NULL, 'client_error', 'browser', NULL, $1, $2)`,
        [JSON.stringify({ message: String(message).slice(0, 500), url: String(url ?? "").slice(0, 500), timestamp }), req.ip ?? null]
      ).catch(() => {});
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Failed to record error" });
    }
  });

  // ── GET /api/health-metrics ─────────────────────────────────────────────
  app.get("/api/health-metrics", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const limit = req.query.limit ? Math.min(500, parseInt(req.query.limit as string, 10) || 200) : 200;
      const metrics = await storage.getHealthMetricsByPatient(req.user!.id, limit);
      res.json(metrics);
    } catch (error) {
      console.error("Get health metrics error:", error);
      res.status(500).json({ message: "Failed to load health metrics" });
    }
  });

  // ── POST /api/health-metrics ────────────────────────────────────────────
  app.post("/api/health-metrics", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const body = { ...req.body, patientId: req.user!.id };
      if (body.measuredAt && typeof body.measuredAt === "string") {
        body.measuredAt = new Date(body.measuredAt);
      }
      const parsed = insertHealthMetricSchema.parse(body);

      const hasAtLeastOne = [
        parsed.weightKg, parsed.heightCm, parsed.systolic, parsed.diastolic,
        parsed.heartRate, parsed.bloodGlucose, parsed.temperatureC, parsed.oxygenSaturation,
      ].some((v) => v !== undefined && v !== null && `${v}`.length > 0);
      if (!hasAtLeastOne) {
        return res.status(400).json({ message: "Please record at least one measurement." });
      }

      const created = await storage.createHealthMetric(parsed);
      res.status(201).json(created);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid health metric data", errors: error.errors });
      }
      console.error("Create health metric error:", error);
      res.status(500).json({ message: "Failed to save health metric" });
    }
  });

  // ── DELETE /api/health-metrics/:id ─────────────────────────────────────
  app.delete("/api/health-metrics/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const deleted = await storage.deleteHealthMetric(req.params.id, req.user!.id);
      if (!deleted) return res.status(404).json({ message: "Reading not found" });
      res.json({ ok: true });
    } catch (error) {
      console.error("Delete health metric error:", error);
      res.status(500).json({ message: "Failed to delete reading" });
    }
  });

  // ── GET /api/admin/diagnostics ──────────────────────────────────────────
  app.get(
    "/api/admin/diagnostics",
    authenticateToken,
    requireAdmin,
    requirePermission(PERMISSIONS.MONITORING_VIEW),
    async (req: AuthRequest, res: Response) => {
      try {
        const cacheStats = getCacheStats();
        const schedulerJobs = getJobStates();
        const webhookMetrics = getWebhookMetrics();

        const slowQueriesResult = await pool.query<{
          id: string; event_type: string; source: string; message: string;
          metadata: unknown; created_at: string;
        }>(
          `SELECT id, event_type, source, message, metadata, created_at
             FROM system_events
            WHERE event_type = 'slow_endpoint'
              AND resolved_at IS NULL
            ORDER BY created_at DESC
            LIMIT 20`,
        );

        const reconResult = await pool.query<{
          wallet_drift_count: string;
          orphan_payment_count: string;
          provider_wallet_drift_count: string;
        }>(
          `SELECT
             (SELECT COUNT(*) FROM (
               SELECT w.user_id
                 FROM wallets w
                 LEFT JOIN wallet_transactions wt ON wt.user_id = w.user_id
                 GROUP BY w.id, w.balance
                 HAVING ABS(w.balance - COALESCE(SUM(wt.amount), 0)) > 0.01
             ) x) AS wallet_drift_count,
             (SELECT COUNT(*) FROM payments p
               LEFT JOIN appointments a ON a.id = p.appointment_id
              WHERE p.status = 'completed' AND a.id IS NULL) AS orphan_payment_count,
             (SELECT COUNT(*) FROM (
               SELECT pw.provider_id
                 FROM provider_wallets pw
                 LEFT JOIN provider_ledger pl ON pl.provider_id = pw.provider_id
                 GROUP BY pw.id, pw.available_balance
                 HAVING ABS(pw.available_balance - COALESCE(SUM(pl.amount), 0)) > 0.01
             ) y) AS provider_wallet_drift_count`,
        );
        const recon = reconResult.rows[0] ?? {};

        const searchStatsResult = await pool.query<{ total: string; slow: string }>(
          `SELECT
             COUNT(*) FILTER (WHERE event_type::text LIKE 'search:%')     AS total,
             COUNT(*) FILTER (WHERE event_type::text = 'slow_endpoint'
                                AND source ILIKE '%search%')              AS slow
             FROM system_events
            WHERE created_at > NOW() - INTERVAL '1 hour'`,
        );
        const searchStats = searchStatsResult.rows[0] ?? { total: 0, slow: 0 };

        const mem = process.memoryUsage();
        const coldStart = getDbStartupMetrics();
        const diagEnvResult = getEnvValidationResult();
        const missingOptional = getMissingOptionalEnv();
        const envBlock = {
          required_ok: diagEnvResult === null || diagEnvResult.valid,
          optional_missing: missingOptional,
          integration_status: {
            stripe:     !!(process.env.STRIPE_SECRET_KEY),
            email:      !!(process.env.RESEND_API_KEY),
            cloudinary: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
            twilio:     !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
            push:       !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
            video:      !!(process.env.DAILY_API_KEY),
            ai:         !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY),
          },
        };

        res.json({
          timestamp: new Date().toISOString(),
          uptime: Math.floor(process.uptime()),
          environment: envBlock,
          memory: {
            heapUsedMb:  Math.round(mem.heapUsed  / 1024 / 1024),
            heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
            rssMb:       Math.round(mem.rss       / 1024 / 1024),
          },
          coldStart: {
            processBootMs:     coldStart.processBootMs,
            connectMs:         coldStart.connectMs,
            firstQueryMs:      coldStart.firstQueryMs,
            connectedAt:       coldStart.connectedAt,
            uptimeSinceBootMs: Date.now() - coldStart.processBootMs,
          },
          cache: {
            instances: cacheStats,
            totalEntries: cacheStats.reduce((s, c) => s + c.entries, 0),
          },
          scheduler: {
            jobs: schedulerJobs,
            failingCount: schedulerJobs.filter(j => j.consecutiveFailures > 0).length,
          },
          webhook: { stripe: webhookMetrics },
          slowQueries: {
            unresolvedCount: slowQueriesResult.rows.length,
            recent: slowQueriesResult.rows,
          },
          reconciliation: {
            walletDriftCount:         Number(recon.wallet_drift_count         ?? 0),
            orphanPaymentCount:       Number(recon.orphan_payment_count       ?? 0),
            providerWalletDriftCount: Number(recon.provider_wallet_drift_count ?? 0),
          },
          search: {
            eventsLastHour: Number(searchStats.total ?? 0),
            slowLastHour:   Number(searchStats.slow  ?? 0),
          },
        });
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    }
  );

  // ── GET /api/admin/monitoring/request-metrics ─────────────────────────────
  // Real-time in-process request latency, error-rate, and slow-endpoint data.
  app.get(
    "/api/admin/monitoring/request-metrics",
    authenticateToken,
    requireAdmin,
    (_req: Request, res: Response) => {
      res.json(getMetricsSummary());
    },
  );

  // ── GET /api/admin/financial/reconciliation-results ───────────────────────
  // Persisted findings from the hourly ledger reconciliation cron.
  // Query params: ?severity=error|warning|ok  ?check_type=...  ?limit=N
  app.get(
    "/api/admin/financial/reconciliation-results",
    authenticateToken,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const limit = Math.min(Number(req.query.limit) || 100, 500);
        const severity  = req.query.severity   as string | undefined;
        const checkType = req.query.check_type as string | undefined;
        const params: unknown[] = [];
        const conditions: string[] = [];
        if (severity)  { params.push(severity);  conditions.push(`severity = $${params.length}`); }
        if (checkType) { params.push(checkType); conditions.push(`check_type = $${params.length}`); }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        params.push(limit);
        const { rows } = await pool.query(
          `SELECT id, run_at, check_type, severity, entity_type, entity_id, message, details, country_code, resolved_at
             FROM reconciliation_results
            ${where}
            ORDER BY run_at DESC
            LIMIT $${params.length}`,
          params,
        );
        res.json({ results: rows, count: rows.length });
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    },
  );
}
