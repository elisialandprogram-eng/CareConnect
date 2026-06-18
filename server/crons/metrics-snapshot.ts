/**
 * Monitoring Metrics Snapshot Cron — Section E
 *
 * Runs daily to persist in-memory request metrics to the DB.
 * Also performs hourly endpoint trend snapshots.
 *
 * Tables written:
 *   monitoring_daily_summary  — one row per UTC day
 *   monitoring_endpoint_stats — per-route stats snapshot
 */

import { pool } from "../db";
import { getMetricsSummary } from "../lib/requestMetrics";
import { generateFinancialAlerts } from "../lib/financial-alerting";
import { withJobTracking } from "../lib/cronState";
import { scheduler } from "../lib/scheduler";

async function snapshotMetrics(): Promise<void> {
  const summary = getMetricsSummary();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Upsert daily summary (merge with any partial snapshot from earlier today)
  await pool.query(
    `INSERT INTO monitoring_daily_summary
       (snapshot_date, total_requests, errors_4xx, errors_5xx, slow_requests, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (snapshot_date) DO UPDATE SET
       total_requests = monitoring_daily_summary.total_requests + EXCLUDED.total_requests,
       errors_4xx     = monitoring_daily_summary.errors_4xx     + EXCLUDED.errors_4xx,
       errors_5xx     = monitoring_daily_summary.errors_5xx     + EXCLUDED.errors_5xx,
       slow_requests  = monitoring_daily_summary.slow_requests  + EXCLUDED.slow_requests,
       updated_at     = NOW()`,
    [
      today,
      summary.totals.requests,
      summary.totals.errors4xx,
      summary.totals.errors5xx,
      summary.totals.slowRequests,
    ],
  );

  // Insert per-endpoint snapshots (append-only trend rows)
  for (const route of summary.topRoutes) {
    await pool.query(
      `INSERT INTO monitoring_endpoint_stats
         (snapshot_date, route, total_requests, avg_ms, max_ms,
          errors_4xx, errors_5xx, slow_hits, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        today,
        route.route,
        route.count,
        route.avgMs,
        route.maxMs,
        route.errors4xx,
        route.errors5xx,
        route.slowHits,
      ],
    ).catch(() => {}); // Non-fatal per-row failure
  }
}

async function runAlertGeneration(): Promise<void> {
  const count = await generateFinancialAlerts(pool);
  if (count > 0) {
    console.log(`[financial-alerting] ${count} new alert(s) generated`);
  }
}

export function startMetricsSnapshotCron(): void {
  // Hourly endpoint snapshot
  scheduler.register({
    name: "cron_metrics_snapshot_hourly",
    intervalMs: 60 * 60 * 1000,
    fn: () => withJobTracking("cron_metrics_snapshot_hourly", snapshotMetrics),
  });

  // Every 30 min: scan reconciliation results and generate financial alerts
  scheduler.register({
    name: "cron_financial_alerts",
    intervalMs: 30 * 60 * 1000,
    fn: () => withJobTracking("cron_financial_alerts", runAlertGeneration),
  });

  scheduler.start();
  console.log("[metrics-snapshot] cron started — hourly snapshot + 30min alert scan");
}
