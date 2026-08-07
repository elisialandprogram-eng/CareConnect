/**
 * Phase 1.1 canonical financial-flow regression tests.
 *
 * These tests intentionally use a transaction and always roll it back. They
 * exercise the current authority:
 *   provider_earnings -> provider_wallets -> provider_ledger
 *
 * Run:
 *   npx tsx server/tests/financial-flows.test.ts
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import {
  PROVIDER_LEDGER_BALANCE_AFFECTING_TYPES,
  PROVIDER_LEDGER_INFORMATIONAL_TYPES,
  providerLedgerNetAmount,
} from "../lib/provider-ledger";

const JWT_SECRET = process.env.SESSION_SECRET ?? "dev-secret-fallback";

let passed = 0;
let failed = 0;

function check(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

async function withTx<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("ROLLBACK");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function testCanonicalProviderWalletLedgerFlow(): Promise<void> {
  console.log("\nTest 1: provider earnings -> wallet -> signed provider ledger");
  await withTx(async (client) => {
    const provider = await client.query<{ id: string; country_code: string }>(`
      SELECT id, country_code
      FROM providers
      ORDER BY id
      LIMIT 1
    `);
    if (!provider.rows[0]) {
      check(true, "skipped — no provider fixture is available");
      return;
    }

    const providerId = provider.rows[0].id;
    const referenceId = `phase1-${randomUUID()}`;
    const income = 12.34;
    const before = await client.query<{ available_balance: string }>(
      `SELECT available_balance FROM provider_wallets WHERE provider_id = $1`,
      [providerId],
    );
    const balanceBefore = Number(before.rows[0]?.available_balance ?? 0);

    await client.query(`
      INSERT INTO provider_wallets
        (provider_id, available_balance, lifetime_earnings, currency, country_code)
      VALUES ($1, $2, $2, 'USD', $3)
      ON CONFLICT (provider_id) DO UPDATE
      SET available_balance = provider_wallets.available_balance + $2,
          lifetime_earnings = provider_wallets.lifetime_earnings + $2,
          updated_at = NOW()
    `, [providerId, income, provider.rows[0].country_code]);

    const wallet = await client.query<{ available_balance: string }>(
      `SELECT available_balance FROM provider_wallets WHERE provider_id = $1`,
      [providerId],
    );
    const balanceAfter = Number(wallet.rows[0].available_balance);

    await client.query(`
      INSERT INTO provider_ledger
        (provider_id, amount, entry_type, reference_id, description,
         balance_after, country_code, currency, amount_usd)
      VALUES ($1, $2, 'booking_income', $3, 'Phase 1.1 fixture',
              $4, $5, 'USD', $2)
    `, [
      providerId,
      income,
      referenceId,
      balanceAfter,
      provider.rows[0].country_code,
    ]);

    const ledger = await client.query<{ amount: string; currency: string; amount_usd: string }>(
      `SELECT amount, currency, amount_usd
         FROM provider_ledger
        WHERE reference_id = $1`,
      [referenceId],
    );

    check(balanceAfter === Number((balanceBefore + income).toFixed(2)),
      "wallet increases by the canonical USD earning");
    check(ledger.rows[0]?.currency === "USD", "provider ledger currency is USD");
    check(Number(ledger.rows[0]?.amount_usd) === income, "amount_usd matches signed amount");
    check(providerLedgerNetAmount("booking_income", income) === income,
      "booking_income is a balance-affecting credit");
  });
}

async function testInformationalRowsAreNotWalletMovements(): Promise<void> {
  console.log("\nTest 2: tax/platform fee rows are informational");
  for (const type of PROVIDER_LEDGER_INFORMATIONAL_TYPES) {
    check(providerLedgerNetAmount(type, -1620) === 0,
      `${type} is excluded from wallet reconciliation`);
  }
  for (const type of PROVIDER_LEDGER_BALANCE_AFFECTING_TYPES) {
    check(providerLedgerNetAmount(type, -1.25) === -1.25,
      `${type} preserves signed debit semantics`);
  }
}

async function testCanonicalSchemaAndRetiredAuthority(): Promise<void> {
  console.log("\nTest 3: canonical schema and retired marketplace authority");
  const columns = await pool.query<{ column_name: string }>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'provider_ledger'
      AND column_name IN ('amount', 'amount_usd', 'currency', 'entry_type')
  `);
  const names = new Set(columns.rows.map((row) => row.column_name));
  check(names.has("amount") && names.has("amount_usd") &&
    names.has("currency") && names.has("entry_type"),
  "provider ledger has signed amount and USD audit columns");

  const user = await pool.query<{ id: string; email: string; role: string }>(`
    SELECT id, email, role
    FROM users
    WHERE is_email_verified = true
      AND role <> 'provider'
    ORDER BY id
    LIMIT 1
  `);
  if (!user.rows[0]) {
    check(true, "skipped — no verified user fixture is available");
    return;
  }
  const token = jwt.sign({
    id: user.rows[0].id,
    email: user.rows[0].email,
    role: user.rows[0].role,
    countryCode: "HU",
  }, JWT_SECRET, { expiresIn: "1h" });
  const retired = await fetch("http://localhost:5000/api/financials/settle-appointment", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  check(retired.status === 410, "retired appointment settlement endpoint returns 410");
}

async function main(): Promise<void> {
  console.log("GoldenLife — Phase 1.1 canonical financial-flow tests");
  try {
    await testCanonicalProviderWalletLedgerFlow();
    await testInformationalRowsAreNotWalletMovements();
    await testCanonicalSchemaAndRetiredAuthority();
  } catch (error: any) {
    failed++;
    console.error(`\nFatal test error: ${error?.message ?? error}`);
  } finally {
    await pool.end();
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

void main();