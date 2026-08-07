import { pool } from "../server/db";

async function main() {
  const q = async (sql: string, params?: any[]) => {
    try { return (await pool.query(sql, params)).rows; }
    catch(e: any) { console.error("SQL ERROR:", e.message, "\nSQL:", sql.slice(0,200)); return []; }
  };

  // 1. Get orphaned completed payments (no ledger)
  const orphanedPay = await q(`
    SELECT p.id, p.appointment_id, p.amount, p.patient_id, p.country_code, a.provider_id, a.total_amount, a.platform_fee_amount
    FROM payments p
    JOIN appointments a ON a.id = p.appointment_id
    WHERE p.status = 'completed' AND p.appointment_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM marketplace_ledger ml WHERE ml.appointment_id = p.appointment_id)
    ORDER BY p.created_at
  `);
  console.log("\n=ORPHANED_PAYMENTS=", JSON.stringify(orphanedPay, null, 2));

  // 2. Provider wallets with drift
  const walletDrift = await q(`
    SELECT pw.provider_id, pw.available_balance,
      COALESCE(SUM(CASE WHEN pl.entry_type IN ('earning','adjustment') THEN pl.amount WHEN pl.entry_type IN ('payout','reversal') THEN -pl.amount ELSE 0 END), 0) as ledger_net
    FROM provider_wallets pw
    LEFT JOIN provider_ledger pl ON pl.provider_id = pw.provider_id
    GROUP BY pw.provider_id, pw.available_balance
    HAVING ABS(pw.available_balance - COALESCE(SUM(CASE WHEN pl.entry_type IN ('earning','adjustment') THEN pl.amount WHEN pl.entry_type IN ('payout','reversal') THEN -pl.amount ELSE 0 END), 0)) > 0.01
    LIMIT 20
  `);
  console.log("\n=WALLET_DRIFT=", JSON.stringify(walletDrift, null, 2));

  // 3. Check double_entry balance
  const balance = await q(`
    SELECT
      SUM(CASE WHEN destination_account='CLIENT_FUNDING' THEN amount_cents ELSE 0 END) - SUM(CASE WHEN source_account='CLIENT_FUNDING' THEN amount_cents ELSE 0 END) AS net_cf,
      SUM(CASE WHEN destination_account='PLATFORM_ESCROW' THEN amount_cents ELSE 0 END) - SUM(CASE WHEN source_account='PLATFORM_ESCROW' THEN amount_cents ELSE 0 END) AS net_pe,
      SUM(CASE WHEN destination_account='PROVIDER_WITHDRAWABLE' THEN amount_cents ELSE 0 END) - SUM(CASE WHEN source_account='PROVIDER_WITHDRAWABLE' THEN amount_cents ELSE 0 END) AS net_pw,
      SUM(CASE WHEN destination_account='PLATFORM_REVENUE' THEN amount_cents ELSE 0 END) - SUM(CASE WHEN source_account='PLATFORM_REVENUE' THEN amount_cents ELSE 0 END) AS net_pr
    FROM marketplace_ledger WHERE status NOT IN ('CANCELLED')
  `);
  console.log("\n=LEDGER_BALANCE=", JSON.stringify(balance[0]));

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
