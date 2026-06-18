/**
 * Financial Anomaly Alerting — Section F / Sprint Phase 2.5
 *
 * Scans reconciliation_results for critical/error findings and generates
 * financial_alerts rows. Never auto-corrects data — only creates alerts.
 *
 * Deduplication strategy (Section C hardening):
 *   Each alert has an alert_fingerprint = check_type:entity_type:entity_id:country_code
 *   A finding with the same fingerprint and an existing open/acknowledged alert
 *   updates that alert's last_detected_at + occurrence_count instead of creating
 *   a duplicate. This prevents alert storms from repeated reconciliation runs.
 *
 * Alert lifecycle:
 *   open → acknowledged → resolved
 *   Columns: first_detected_at, last_detected_at, occurrence_count
 *
 * Exported:
 *   generateFinancialAlerts(pool)  — run by cron or on-demand
 *   getOpenAlerts(pool, filters)   — for admin API
 */

import type { Pool } from "pg";

export type AlertSeverity = "info" | "warning" | "error" | "critical";
export type AlertStatus   = "open" | "acknowledged" | "resolved";

export interface FinancialAlertRow {
  id: string;
  check_type: string;
  alert_fingerprint: string;
  severity: AlertSeverity;
  entity_type: string | null;
  entity_id: string | null;
  message: string;
  details: Record<string, unknown> | null;
  country_code: string | null;
  status: AlertStatus;
  first_detected_at: string;
  last_detected_at: string;
  occurrence_count: number;
  source_reconciliation_id: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

// Severity thresholds — reconciliation findings that warrant an alert
const ALERT_SEVERITIES: AlertSeverity[] = ["error", "critical"];

/**
 * Generate a deterministic fingerprint for a finding.
 * Same check_type + entity + country always maps to the same fingerprint,
 * so repeated reconciliation runs update existing alerts rather than creating storms.
 */
function makeFingerprint(
  checkType: string,
  entityType: string | null,
  entityId: string | null,
  countryCode: string | null,
): string {
  return [
    checkType,
    entityType ?? "_",
    entityId   ?? "_",
    countryCode ?? "_",
  ].join(":");
}

/**
 * Scan recent reconciliation_results and upsert financial_alerts.
 * - New fingerprint → INSERT with occurrence_count = 1
 * - Existing open/acknowledged alert → UPDATE last_detected_at + increment occurrence_count
 *
 * Returns the number of net-new alerts created.
 */
export async function generateFinancialAlerts(pool: Pool): Promise<number> {
  let created = 0;
  try {
    // Fetch unprocessed error/critical findings from last 24h (single query)
    const { rows: findings } = await pool.query<{
      id: string;
      check_type: string;
      severity: string;
      entity_type: string | null;
      entity_id: string | null;
      message: string;
      details: Record<string, unknown> | null;
      country_code: string | null;
    }>(
      `SELECT id, check_type, severity, entity_type, entity_id, message, details, country_code
       FROM reconciliation_results
       WHERE severity = ANY($1::text[])
         AND run_at > NOW() - INTERVAL '24 hours'
         AND resolved_at IS NULL
       ORDER BY run_at DESC`,
      [ALERT_SEVERITIES],
    );

    if (findings.length === 0) return 0;

    // Batch: fetch all currently-open/acknowledged alerts in one query to avoid N+1
    const { rows: existingAlerts } = await pool.query<{
      id: string;
      alert_fingerprint: string;
      occurrence_count: number;
    }>(
      `SELECT id, alert_fingerprint, occurrence_count
       FROM financial_alerts
       WHERE status IN ('open', 'acknowledged')`,
    );
    const existingByFingerprint = new Map(
      existingAlerts.map((a) => [a.alert_fingerprint, a]),
    );

    for (const finding of findings) {
      const fp = makeFingerprint(
        finding.check_type,
        finding.entity_type,
        finding.entity_id,
        finding.country_code,
      );

      const existing = existingByFingerprint.get(fp);

      if (existing) {
        // Update existing alert — bump occurrence count and last_detected_at
        await pool.query(
          `UPDATE financial_alerts
           SET last_detected_at  = NOW(),
               occurrence_count  = occurrence_count + 1,
               source_reconciliation_id = $1
           WHERE id = $2`,
          [finding.id, existing.id],
        ).catch(() => {});
        // Keep map entry fresh (prevent double-update within same batch run)
        existingByFingerprint.set(fp, { ...existing, occurrence_count: existing.occurrence_count + 1 });
      } else {
        // Insert new alert
        await pool.query(
          `INSERT INTO financial_alerts
             (check_type, alert_fingerprint, severity, entity_type, entity_id, message, details,
              country_code, status, source_reconciliation_id,
              first_detected_at, last_detected_at, occurrence_count)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, NOW(), NOW(), 1)`,
          [
            finding.check_type,
            fp,
            finding.severity,
            finding.entity_type,
            finding.entity_id,
            finding.message,
            finding.details ? JSON.stringify(finding.details) : null,
            finding.country_code,
            finding.id,
          ],
        );
        created++;
        // Register in local map so subsequent findings with same fp update, not re-insert
        existingByFingerprint.set(fp, { id: `new-${fp}`, alert_fingerprint: fp, occurrence_count: 1 });
      }
    }

    if (created > 0) {
      await pool.query(
        `INSERT INTO system_events (event_type, severity, source, message, metadata)
         VALUES ('failed_job', 'warning', 'financial_alerting', $1, $2)`,
        [
          `Financial anomaly alerting: ${created} new alert(s) generated`,
          JSON.stringify({ count: created, timestamp: new Date().toISOString() }),
        ],
      ).catch(() => {});
    }
  } catch (err: any) {
    console.warn("[financial-alerting] generateFinancialAlerts error:", err.message);
  }
  return created;
}

export interface AlertFilters {
  status?: AlertStatus;
  severity?: AlertSeverity;
  countryCode?: string;
  checkType?: string;
  limit?: number;
  offset?: number;
}

/**
 * Fetch financial alerts for the admin API with optional filters.
 */
export async function getOpenAlerts(
  pool: Pool,
  filters: AlertFilters = {},
): Promise<{ rows: FinancialAlertRow[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  if (filters.status)      { conditions.push(`status = $${p++}`);      params.push(filters.status); }
  if (filters.severity)    { conditions.push(`severity = $${p++}`);    params.push(filters.severity); }
  if (filters.countryCode) { conditions.push(`country_code = $${p++}`); params.push(filters.countryCode); }
  if (filters.checkType)   { conditions.push(`check_type = $${p++}`);  params.push(filters.checkType); }

  const where  = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit  = Math.min(200, filters.limit  ?? 50);
  const offset = filters.offset ?? 0;

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query<FinancialAlertRow>(
      `SELECT * FROM financial_alerts ${where}
       ORDER BY
         CASE severity WHEN 'critical' THEN 0 WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
         last_detected_at DESC
       LIMIT $${p} OFFSET $${p + 1}`,
      [...params, limit, offset],
    ),
    pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM financial_alerts ${where}`,
      params,
    ),
  ]);

  return { rows, total: parseInt(countRows[0]?.cnt ?? "0", 10) };
}
