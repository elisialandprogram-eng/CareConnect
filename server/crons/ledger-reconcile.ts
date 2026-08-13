/**
 * Ledger reconciliation cron.
 *
 * Runs hourly.  Performs five independent financial-consistency checks and
 * writes all findings to the `reconciliation_results` table.  This job is
 * read-only: it NEVER modifies financial data.
 *
 * Checks
 * ──────
 * 1. provider_wallet_drift       — provider_wallets.available_balance vs provider_ledger SUM.
 * 2. missing_provider_earning    — completed paid appointments without provider_earnings.
 *
 * Admin surface: GET /api/admin/financial/reconciliation-results
 */

import { pool } from "../db";
import { logScheduler } from "../lib/logger";
import { scheduler } from "../lib/scheduler";
import {
  PROVIDER_LEDGER_BALANCE_AFFECTING_TYPES,
  providerLedgerTypePlaceholders,
} from "../lib/provider-ledger";

const RECONCILE_INTERVAL_MS = 60 * 60 * 1000; // hourly

// ── Result writer ─────────────────────────────────────────────────────────────

type Severity = "ok" | "warning" | "error";

async function writeResult(opts: {
  checkType: string;
  severity: Severity;
  entityType?: string;
  entityId?: string;
  message: string;
  details?: Record<string, unknown>;
  countryCode?: string;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO reconciliation_results
         (check_type, severity, entity_type, entity_id, message, details, country_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        opts.checkType,
        opts.severity,
        opts.entityType ?? null,
        opts.entityId   ?? null,
        opts.message,
        opts.details ? JSON.stringify(opts.details) : null,
        opts.countryCode ?? null,
      ],
    );
  } catch (err: any) {
    const pgCode = err?.code ?? err?.cause?.code;
    // 42P01 = relation does not exist (table not yet migrated on first boot)
    if (pgCode === "42P01") {
      console.warn(`[ledger-reconcile] reconciliation_results table not yet ready — ${opts.severity}:${opts.checkType}: ${opts.message}`);
    } else {
      throw err;
    }
  }
}

// ── Check 3: Provider wallet drift ───────────────────────────────────────────

// `provider_ledger.amount` is signed already. Informational tax/platform-fee
// rows are deliberately excluded because booking_income already includes the
// provider's gross payout.
const BALANCE_AFFECTING_PLACEHOLDERS = providerLedgerTypePlaceholders();
const LEDGER_NET_EXPR = `
  CASE WHEN pl.entry_type IN (${BALANCE_AFFECTING_PLACEHOLDERS})
       THEN pl.amount
       ELSE 0 END`;

async function checkProviderWalletDrift(): Promise<void> {
  const { rows } = await pool.query<{
    provider_id: string;
    wallet_balance: string;
    ledger_net: string;
    delta: string;
  }>(`
    SELECT
      pw.provider_id,
      pw.available_balance::text AS wallet_balance,
      COALESCE(SUM(${LEDGER_NET_EXPR}), 0)::text AS ledger_net,
      ABS(pw.available_balance - COALESCE(SUM(${LEDGER_NET_EXPR}), 0))::text AS delta
    FROM provider_wallets pw
    LEFT JOIN provider_ledger pl ON pl.provider_id = pw.provider_id
    GROUP BY pw.provider_id, pw.available_balance
    HAVING ABS(pw.available_balance - COALESCE(SUM(${LEDGER_NET_EXPR}), 0)) > 0.01
    LIMIT 50
  `, [...PROVIDER_LEDGER_BALANCE_AFFECTING_TYPES]);

  for (const row of rows) {
    await writeResult({
      checkType: "provider_wallet_drift",
      severity: "warning",
      entityType: "provider",
      entityId: row.provider_id,
      message: `Provider wallet balance drift of ${row.delta} USD (wallet=${row.wallet_balance}, ledger_net=${row.ledger_net})`,
      details: {
        providerId: row.provider_id,
        walletBalance: Number(row.wallet_balance),
        ledgerNet: Number(row.ledger_net),
        delta: Number(row.delta),
      },
    });
  }
  if (rows.length === 0) {
    await writeResult({
      checkType: "provider_wallet_drift",
      severity: "ok",
      message: `All provider wallet balances match their ledger nets`,
    });
  }
}

// ── Check 2: Completed paid appointments missing provider earnings ────────────

async function checkMissingProviderEarnings(): Promise<void> {
  const { rows } = await pool.query<{
    id: string;
    appointment_id: string;
    amount: string;
    patient_id: string;
    provider_id: string;
    country_code: string;
  }>(`
    SELECT p.id, p.appointment_id, p.amount::text, p.patient_id
      FROM payments p
      JOIN appointments a ON a.id = p.appointment_id
     WHERE p.status = 'completed'
       AND p.appointment_id IS NOT NULL
       AND a.total_amount::numeric > 0
       AND a.status = 'completed'
       AND NOT EXISTS (
             SELECT 1 FROM provider_earnings pe
              WHERE pe.appointment_id = p.appointment_id
           )
     LIMIT 50
  `);

  for (const row of rows) {
    await writeResult({
      checkType: "missing_provider_earning",
      severity: "warning",
      entityType: "payment",
      entityId: row.id,
      message: `Completed payment ${row.id} (amount=${row.amount}) has no provider_earnings settlement for appointment ${row.appointment_id}`,
      details: {
        paymentId: row.id,
        appointmentId: row.appointment_id,
        amount: row.amount,
        patientId: row.patient_id,
      },
    });
  }
  if (rows.length === 0) {
    await writeResult({
      checkType: "missing_provider_earning",
      severity: "ok",
      message: `All completed paid appointments have provider_earnings settlements`,
    });
  }
}

// ── Full reconciliation pass ──────────────────────────────────────────────────

export async function reconcileLedger(): Promise<number> {
  const start = Date.now();
  const runStart = new Date(); // capture before any checks write results
  let findings = 0;

  try {
    await checkProviderWalletDrift();
  } catch (e: any) {
    console.error("[ledger-reconcile] checkProviderWalletDrift failed:", e.message);
  }

  try {
    await checkMissingProviderEarnings();
  } catch (e: any) {
    console.error("[ledger-reconcile] checkMissingProviderEarnings failed:", e.message);
  }

  try {
    // Count only findings written during THIS run (not accumulated from prior runs).
    const { rows } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM reconciliation_results
        WHERE run_at >= $1 AND severity != 'ok'`,
      [runStart.toISOString()],
    );
    findings = Number(rows[0]?.cnt ?? 0);
  } catch { /* non-fatal */ }

  const durationMs = Date.now() - start;
  logScheduler({
    job: "ledger_reconcile",
    status: findings > 0 ? "failed" : "completed",
    durationMs,
    ...(findings > 0 ? { error: `${findings} non-ok finding(s) this run` } : {}),
  });

  return findings;
}

/** Wire up the hourly reconciliation tick. Fires once immediately on start. */
export function startLedgerReconcileCron(): void {
  scheduler.register({
    name: "ledger_reconcile",
    intervalMs: RECONCILE_INTERVAL_MS,
    startDelayMs: 12_000,
    fn: reconcileLedger,
  });
}
