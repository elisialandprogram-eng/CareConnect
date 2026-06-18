/**
 * Ledger reconciliation cron.
 *
 * Runs hourly.  Performs five independent financial-consistency checks and
 * writes all findings to the `reconciliation_results` table.  This job is
 * read-only: it NEVER modifies financial data.
 *
 * Checks
 * ──────
 * 1. double_entry_balance  — marketplace_ledger net must equal zero.
 * 2. negative_holding      — PLATFORM_ESCROW / PROVIDER_WITHDRAWABLE must be ≥ 0.
 * 3. provider_wallet_drift — provider_wallets.available_balance vs provider_ledger SUM.
 * 4. orphaned_payments     — completed payments with appointment_id but no ledger rows.
 * 5. missing_ledger_entry  — completed appointments with total_amount > 0 and no ledger rows.
 *
 * Admin surface: GET /api/admin/financial/reconciliation-results
 */

import { pool } from "../db";
import { logScheduler } from "../lib/logger";
import { withJobTracking } from "../lib/cronState";

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

// ── Check 1 + 2: Double-entry balance ────────────────────────────────────────

interface AccountNets {
  netClientFunding: number;
  netPlatformEscrow: number;
  netProviderWithdrawable: number;
  netPlatformRevenue: number;
}

async function fetchAccountNets(): Promise<AccountNets> {
  const { rows } = await pool.query<{
    net_client_funding: string;
    net_platform_escrow: string;
    net_provider_withdrawable: string;
    net_platform_revenue: string;
  }>(`
    SELECT
      COALESCE(SUM(CASE WHEN destination_account = 'CLIENT_FUNDING'        THEN amount_cents ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN source_account      = 'CLIENT_FUNDING'       THEN amount_cents ELSE 0 END), 0) AS net_client_funding,

      COALESCE(SUM(CASE WHEN destination_account = 'PLATFORM_ESCROW'       THEN amount_cents ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN source_account      = 'PLATFORM_ESCROW'      THEN amount_cents ELSE 0 END), 0) AS net_platform_escrow,

      COALESCE(SUM(CASE WHEN destination_account = 'PROVIDER_WITHDRAWABLE' THEN amount_cents ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN source_account      = 'PROVIDER_WITHDRAWABLE' THEN amount_cents ELSE 0 END), 0) AS net_provider_withdrawable,

      COALESCE(SUM(CASE WHEN destination_account = 'PLATFORM_REVENUE'      THEN amount_cents ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN source_account      = 'PLATFORM_REVENUE'     THEN amount_cents ELSE 0 END), 0) AS net_platform_revenue
    FROM marketplace_ledger
    WHERE status NOT IN ('CANCELLED')
  `);

  return {
    netClientFunding:        Number(rows[0]?.net_client_funding        ?? 0),
    netPlatformEscrow:       Number(rows[0]?.net_platform_escrow       ?? 0),
    netProviderWithdrawable: Number(rows[0]?.net_provider_withdrawable ?? 0),
    netPlatformRevenue:      Number(rows[0]?.net_platform_revenue      ?? 0),
  };
}

async function checkDoubleEntry(): Promise<void> {
  const nets = await fetchAccountNets();
  const { netClientFunding, netPlatformEscrow, netProviderWithdrawable, netPlatformRevenue } = nets;
  const totalNet = netClientFunding + netPlatformEscrow + netProviderWithdrawable + netPlatformRevenue;

  if (totalNet !== 0) {
    await writeResult({
      checkType: "double_entry_balance",
      severity: "error",
      message: `IMBALANCE DETECTED — total net is ${totalNet} cents (must be 0)`,
      details: { totalNet, netClientFunding, netPlatformEscrow, netProviderWithdrawable, netPlatformRevenue },
    });
  } else {
    await writeResult({
      checkType: "double_entry_balance",
      severity: "ok",
      message: `Double-entry balanced — all account nets sum to 0`,
      details: { totalNet, netClientFunding, netPlatformEscrow, netProviderWithdrawable, netPlatformRevenue },
    });
  }

  if (netPlatformEscrow < 0) {
    await writeResult({
      checkType: "negative_holding",
      severity: "error",
      entityType: "account",
      entityId: "PLATFORM_ESCROW",
      message: `PLATFORM_ESCROW has negative net: ${netPlatformEscrow} cents`,
      details: { account: "PLATFORM_ESCROW", net: netPlatformEscrow },
    });
  }
  if (netProviderWithdrawable < 0) {
    await writeResult({
      checkType: "negative_holding",
      severity: "error",
      entityType: "account",
      entityId: "PROVIDER_WITHDRAWABLE",
      message: `PROVIDER_WITHDRAWABLE has negative net: ${netProviderWithdrawable} cents`,
      details: { account: "PROVIDER_WITHDRAWABLE", net: netProviderWithdrawable },
    });
  }
}

// ── Check 3: Provider wallet drift ───────────────────────────────────────────

// Canonical signed-amount expression for provider_ledger entries.
// Income types (booking_income, adjustment, earning, payout_returned, refund,
// tax_deduction) are stored with their correct sign already; outgoing types
// (payout, reversal, fee) are stored as positive values and must be negated.
const LEDGER_NET_EXPR = `
  CASE WHEN pl.entry_type IN ('earning','adjustment','booking_income',
                               'payout_returned','refund','tax_deduction')
            THEN pl.amount
       WHEN pl.entry_type IN ('payout','reversal','fee')
            THEN -pl.amount
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
  `);

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

// ── Check 4: Orphaned payments ───────────────────────────────────────────────

async function checkOrphanedPayments(): Promise<void> {
  // Cash, bank_transfer, and wallet payments do not flow through marketplace_ledger
  // (cash/bank are offline; wallet uses wallet_transactions). Exclude them so the
  // check only flags electronic payments that should always have ledger entries.
  const { rows } = await pool.query<{
    id: string;
    appointment_id: string;
    amount: string;
    patient_id: string;
  }>(`
    SELECT p.id, p.appointment_id, p.amount::text, p.patient_id
      FROM payments p
      JOIN appointments a ON a.id = p.appointment_id
     WHERE p.status = 'completed'
       AND p.appointment_id IS NOT NULL
       AND a.total_amount::numeric > 0
       AND COALESCE(p.payment_method, 'card') NOT IN ('cash','bank_transfer','wallet')
       AND NOT EXISTS (
             SELECT 1 FROM marketplace_ledger ml
              WHERE ml.appointment_id = p.appointment_id
           )
     LIMIT 50
  `);

  for (const row of rows) {
    await writeResult({
      checkType: "orphaned_payment",
      severity: "warning",
      entityType: "payment",
      entityId: row.id,
      message: `Completed payment ${row.id} (amount=${row.amount}) has no marketplace_ledger entry for appointment ${row.appointment_id}`,
      details: { paymentId: row.id, appointmentId: row.appointment_id, amount: row.amount, patientId: row.patient_id },
    });
  }
  if (rows.length === 0) {
    await writeResult({
      checkType: "orphaned_payment",
      severity: "ok",
      message: `No orphaned completed payments found`,
    });
  }
}

// ── Check 5: Completed appointments missing ledger entries ───────────────────

async function checkMissingLedgerEntries(): Promise<void> {
  // Cash, bank_transfer, and wallet payments are settled outside the marketplace_ledger
  // (offline or via wallet_transactions). Only check electronic payments that must
  // produce ledger entries (card, stripe, crypto, etc.).
  const { rows } = await pool.query<{
    id: string;
    total_amount: string;
    patient_id: string;
    provider_id: string;
    country_code: string;
  }>(`
    SELECT a.id, a.total_amount::text, a.patient_id, a.provider_id, a.country_code::text
      FROM appointments a
     WHERE a.status = 'completed'
       AND a.total_amount::numeric > 0
       AND COALESCE(
             (SELECT pm.payment_method FROM payments pm
               WHERE pm.appointment_id = a.id AND pm.status = 'completed'
               LIMIT 1),
             'card'
           ) NOT IN ('cash','bank_transfer','wallet')
       AND NOT EXISTS (
             SELECT 1 FROM marketplace_ledger ml
              WHERE ml.appointment_id = a.id
           )
     LIMIT 50
  `);

  for (const row of rows) {
    await writeResult({
      checkType: "missing_ledger_entry",
      severity: "warning",
      entityType: "appointment",
      entityId: row.id,
      message: `Completed appointment ${row.id} (amount=${row.total_amount}) has no marketplace_ledger entries`,
      details: { appointmentId: row.id, totalAmount: row.total_amount, patientId: row.patient_id, providerId: row.provider_id },
      countryCode: row.country_code,
    });
  }
  if (rows.length === 0) {
    await writeResult({
      checkType: "missing_ledger_entry",
      severity: "ok",
      message: `All completed appointments with non-zero amounts have ledger entries`,
    });
  }
}

// ── Full reconciliation pass ──────────────────────────────────────────────────

export async function reconcileLedger(): Promise<number> {
  const start = Date.now();
  const runStart = new Date(); // capture before any checks write results
  let findings = 0;

  try {
    await checkDoubleEntry();
  } catch (e: any) {
    console.error("[ledger-reconcile] checkDoubleEntry failed:", e.message);
  }

  try {
    await checkProviderWalletDrift();
  } catch (e: any) {
    console.error("[ledger-reconcile] checkProviderWalletDrift failed:", e.message);
  }

  try {
    await checkOrphanedPayments();
  } catch (e: any) {
    console.error("[ledger-reconcile] checkOrphanedPayments failed:", e.message);
  }

  try {
    await checkMissingLedgerEntries();
  } catch (e: any) {
    console.error("[ledger-reconcile] checkMissingLedgerEntries failed:", e.message);
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
  reconcileLedger().catch((err: Error) =>
    console.error("[ledger-reconcile] initial run failed:", err.message),
  );
  setInterval(() => {
    reconcileLedger().catch((err: Error) =>
      console.error("[ledger-reconcile] tick failed:", err.message),
    );
  }, RECONCILE_INTERVAL_MS);
}
