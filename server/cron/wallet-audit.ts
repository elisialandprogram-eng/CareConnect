/**
 * Wallet Drift Integrity Checker — Sprint C14.5 Part 4 (patched Sprint C21.1)
 *
 * Runs on every hourly cron tick. For each provider wallet, verifies that
 * provider_wallets.available_balance matches the arithmetic SUM of
 * provider_ledger entries that *actually affect the wallet balance*.
 *
 * IMPORTANT: platform_fee_deduction and tax_deduction rows in provider_ledger
 * are INFORMATIONAL only — they document how the booking_income was computed
 * but are never separately debited from the wallet. Including them in the SUM
 * creates a guaranteed false-positive drift equal to (platformFee + tax) for
 * every single booking, which caused wallets to be auto-frozen on every hourly
 * tick immediately after an admin unfreeze. They are therefore excluded.
 *
 * Balance-affecting entry types (included in SUM):
 *   booking_income, refund_deduction, payout_held, payout_deduction,
 *   payout_returned, manual_correction, wallet_adjustment, commission_deduction
 *
 * Informational-only types (excluded):
 *   platform_fee_deduction, tax_deduction
 *
 * Safe variance buffer: $0.05 USD — absorbs any remaining floating-point
 * rounding in NUMERIC columns without causing spurious freezes.
 *
 * If a genuine discrepancy > $0.05 is detected, the wallet is frozen with an
 * explicit reason string that includes the exact drift amount, so admins and
 * providers can see why and take action. Auto-frozen wallets are automatically
 * cleared if the drift drops back below the threshold on a later tick.
 */

import { pool } from "../db";

const DRIFT_THRESHOLD_USD = 0.05;

const BALANCE_AFFECTING_TYPES = [
  "booking_income",
  "refund_deduction",
  "payout_held",
  "payout_deduction",
  "payout_returned",
  "manual_correction",
  "wallet_adjustment",
  "commission_deduction",
  "membership_charge",
  "package_charge",
];

export interface WalletAuditResult {
  checked: number;
  flagged: number;
  cleared: number;
}

export async function runWalletAudit(): Promise<WalletAuditResult> {
  const result: WalletAuditResult = { checked: 0, flagged: 0, cleared: 0 };

  const typePlaceholders = BALANCE_AFFECTING_TYPES.map((_, i) => `$${i + 1}`).join(", ");

  const driftQ = await pool.query<{
    provider_id: string;
    wallet_balance: string;
    ledger_sum: string;
    drift_abs: string;
    is_frozen: boolean;
    frozen_reason: string | null;
  }>(
    `SELECT
       pw.provider_id,
       pw.available_balance                                  AS wallet_balance,
       COALESCE(SUM(pl.amount) FILTER (
         WHERE pl.entry_type IN (${typePlaceholders})
       ), 0)                                                 AS ledger_sum,
       ABS(pw.available_balance - COALESCE(SUM(pl.amount) FILTER (
         WHERE pl.entry_type IN (${typePlaceholders})
       ), 0))                                                AS drift_abs,
       pw.is_frozen,
       pw.frozen_reason
     FROM provider_wallets pw
     LEFT JOIN provider_ledger pl ON pl.provider_id = pw.provider_id
     GROUP BY pw.provider_id, pw.available_balance, pw.is_frozen, pw.frozen_reason`,
    BALANCE_AFFECTING_TYPES,
  );

  result.checked = driftQ.rows.length;

  for (const row of driftQ.rows) {
    const drift = Number(row.drift_abs ?? 0);
    const isAuditHold = row.frozen_reason?.startsWith("System: Auto-locked") ?? false;

    if (drift > DRIFT_THRESHOLD_USD) {
      const driftFormatted = drift.toFixed(4);
      const autoReason = `System: Auto-locked due to ledger mismatch — drift $${driftFormatted} USD`;

      if (!row.is_frozen || !isAuditHold) {
        await pool.query(
          `UPDATE provider_wallets
              SET is_frozen     = true,
                  frozen_reason = $2,
                  updated_at    = NOW()
            WHERE provider_id = $1`,
          [row.provider_id, autoReason],
        );
        result.flagged++;
      }
    } else if (row.is_frozen && isAuditHold) {
      await pool.query(
        `UPDATE provider_wallets
            SET is_frozen     = false,
                frozen_reason = NULL,
                updated_at    = NOW()
          WHERE provider_id = $1`,
        [row.provider_id],
      );
      result.cleared++;
    }
  }

  return result;
}
