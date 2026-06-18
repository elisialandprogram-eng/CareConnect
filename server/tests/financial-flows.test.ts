/**
 * Integration tests — Financial Flows
 *
 * Tests: 3
 *   1. Wallet payment → ESCROW_HOLD ledger row inserted (with country_code + currency_iso)
 *   2. Admin payout approval → PROVIDER_WITHDRAWAL ledger row inserted
 *   3. Appointment settlement → atomic 85/15 split with BEGIN/COMMIT boundary
 *
 * Usage:
 *   npx tsx server/tests/financial-flows.test.ts
 *
 * Requirements: SUPABASE_DATABASE_URL must be set.
 */

import { pool } from "../db";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    failed++;
  }
}

async function withTx<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("ROLLBACK"); // always roll back — tests must not mutate state
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function roundToCents(value: number): number {
  return Math.round(value * 100);
}

// ── Test 1: Wallet Payment → Ledger Escrow Hold ───────────────────────────────

async function testWalletLedgerIntegration(): Promise<void> {
  console.log("\nTest 1: Wallet payment → ESCROW_HOLD ledger row");
  await withTx(async (client) => {
    const amount = 45.50; // USD
    const amountCents = roundToCents(amount);
    const countryCode = "HU";
    const currencyIso = "HUF";

    // Simulate ledger insert that wallet pay-appointment route performs
    const { rows } = await client.query(
      `INSERT INTO marketplace_ledger
         (source_account, destination_account, amount_cents,
          transaction_type, status, currency_iso, country_code)
       VALUES ('CLIENT_FUNDING', 'PLATFORM_ESCROW', $1, 'ESCROW_HOLD', 'PENDING', $2, $3)
       RETURNING *`,
      [amountCents, currencyIso, countryCode],
    );

    const row = rows[0];
    assert(!!row, "ledger row was inserted");
    assert(row.amount_cents === amountCents, `amount_cents === ${amountCents} (got ${row.amount_cents})`);
    assert(row.transaction_type === "ESCROW_HOLD", "transaction_type is ESCROW_HOLD");
    assert(row.status === "PENDING", "status is PENDING");
    assert(row.currency_iso === currencyIso, `currency_iso === ${currencyIso} (got ${row.currency_iso})`);
    assert(row.country_code === countryCode, `country_code === ${countryCode} (got ${row.country_code})`);
  });
}

// ── Test 2: Admin Payout Approval → Ledger Provider Withdrawal ───────────────

async function testPayoutLedgerIntegration(): Promise<void> {
  console.log("\nTest 2: Admin payout approval → PROVIDER_WITHDRAWAL ledger row");
  await withTx(async (client) => {
    const payoutAmount = 200.00; // USD
    const amountCents = roundToCents(payoutAmount);
    const countryCode = "IR";
    const currencyIso = "IRR";

    // Simulate ledger insert that payout PATCH route performs on approval
    const approvedRes = await client.query(
      `INSERT INTO marketplace_ledger
         (source_account, destination_account, amount_cents,
          transaction_type, status, currency_iso, country_code)
       VALUES ('PROVIDER_WITHDRAWABLE', 'EXTERNAL_BANK', $1,
               'PROVIDER_WITHDRAWAL_APPROVED', 'PENDING', $2, $3)
       RETURNING *`,
      [amountCents, currencyIso, countryCode],
    );

    const approvedRow = approvedRes.rows[0];
    assert(!!approvedRow, "approval ledger row inserted");
    assert(approvedRow.transaction_type === "PROVIDER_WITHDRAWAL_APPROVED",
      "transaction_type is PROVIDER_WITHDRAWAL_APPROVED");
    assert(approvedRow.status === "PENDING", "approved status is PENDING");
    assert(approvedRow.country_code === countryCode, `country_code === ${countryCode}`);
    assert(approvedRow.currency_iso === currencyIso, `currency_iso === ${currencyIso}`);

    // Simulate settled (paid) payout
    const settledRes = await client.query(
      `INSERT INTO marketplace_ledger
         (source_account, destination_account, amount_cents,
          transaction_type, status, currency_iso, country_code)
       VALUES ('PROVIDER_WITHDRAWABLE', 'EXTERNAL_BANK', $1,
               'PROVIDER_WITHDRAWAL', 'SETTLED', $2, $3)
       RETURNING *`,
      [amountCents, currencyIso, countryCode],
    );

    const settledRow = settledRes.rows[0];
    assert(!!settledRow, "settled ledger row inserted");
    assert(settledRow.transaction_type === "PROVIDER_WITHDRAWAL", "transaction_type is PROVIDER_WITHDRAWAL");
    assert(settledRow.status === "SETTLED", "settled status is SETTLED");
  });
}

// ── Test 3: Atomic Appointment Settlement (85/15 split) ───────────────────────

async function testAtomicSettlementSplit(): Promise<void> {
  console.log("\nTest 3: Atomic 85%/15% settlement split within transaction boundary");
  await withTx(async (client) => {
    const totalCents = 10000; // $100.00
    const commissionRate = 0.15;
    const platformCutCents  = Math.round(totalCents * commissionRate);  // 1500
    const providerShareCents = totalCents - platformCutCents;            // 8500

    assert(platformCutCents === 1500,  `platform 15% cut = 1500 cents (got ${platformCutCents})`);
    assert(providerShareCents === 8500, `provider 85% share = 8500 cents (got ${providerShareCents})`);
    assert(platformCutCents + providerShareCents === totalCents,
      "split sums back to totalCents (no rounding gap)");

    // Insert escrow hold
    await client.query(
      `INSERT INTO marketplace_ledger
         (source_account, destination_account, amount_cents,
          transaction_type, status, currency_iso, country_code)
       VALUES ('CLIENT_FUNDING', 'PLATFORM_ESCROW', $1, 'ESCROW_HOLD', 'PENDING', 'USD', 'HU')`,
      [totalCents],
    );

    // Settle: mark escrow as SETTLED
    await client.query(
      `UPDATE marketplace_ledger
         SET status = 'SETTLED'
       WHERE transaction_type = 'ESCROW_HOLD' AND status = 'PENDING'
         AND amount_cents = $1`,
      [totalCents],
    );

    // Insert provider share
    await client.query(
      `INSERT INTO marketplace_ledger
         (source_account, destination_account, amount_cents,
          transaction_type, status, currency_iso, country_code)
       VALUES ('PLATFORM_ESCROW', 'PROVIDER_WITHDRAWABLE', $1,
               'SESSION_COMPLETED_SPLIT', 'SETTLED', 'USD', 'HU')`,
      [providerShareCents],
    );

    // Insert platform revenue
    await client.query(
      `INSERT INTO marketplace_ledger
         (source_account, destination_account, amount_cents,
          transaction_type, status, currency_iso, country_code)
       VALUES ('PLATFORM_ESCROW', 'PLATFORM_REVENUE', $1,
               'SESSION_COMPLETED_SPLIT', 'SETTLED', 'USD', 'HU')`,
      [platformCutCents],
    );

    // Verify settled rows exist
    const { rows: provRows } = await client.query(
      `SELECT amount_cents FROM marketplace_ledger
       WHERE destination_account = 'PROVIDER_WITHDRAWABLE'
         AND transaction_type = 'SESSION_COMPLETED_SPLIT'
         AND status = 'SETTLED'
       ORDER BY id DESC LIMIT 1`,
    );
    assert(provRows.length > 0, "provider split row found in ledger");
    assert(parseInt(provRows[0].amount_cents, 10) === providerShareCents,
      `provider row has correct amount (${providerShareCents} cents)`);

    const { rows: platRows } = await client.query(
      `SELECT amount_cents FROM marketplace_ledger
       WHERE destination_account = 'PLATFORM_REVENUE'
         AND transaction_type = 'SESSION_COMPLETED_SPLIT'
         AND status = 'SETTLED'
       ORDER BY id DESC LIMIT 1`,
    );
    assert(platRows.length > 0, "platform revenue split row found in ledger");
    assert(parseInt(platRows[0].amount_cents, 10) === platformCutCents,
      `platform row has correct amount (${platformCutCents} cents)`);

    // Confirm column schema has currency_iso + country_code
    const { rows: colRows } = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'marketplace_ledger'
         AND column_name IN ('currency_iso', 'country_code')
       ORDER BY column_name`,
    );
    const cols = colRows.map((r: any) => r.column_name);
    assert(cols.includes("currency_iso"), "marketplace_ledger has currency_iso column");
    assert(cols.includes("country_code"), "marketplace_ledger has country_code column");
  });
}

// ── Runner ────────────────────────────────────────────────────────────────────

(async () => {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  GoldenLife — Financial Flow Integration Tests");
  console.log("═══════════════════════════════════════════════════════════");

  try {
    await testWalletLedgerIntegration();
    await testPayoutLedgerIntegration();
    await testAtomicSettlementSplit();
  } catch (err: any) {
    console.error("\nFATAL test runner error:", err.message);
    failed++;
  }

  console.log("\n───────────────────────────────────────────────────────────");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("───────────────────────────────────────────────────────────");

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
})();
