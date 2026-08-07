/**
 * Database-backed payout lifecycle regression tests.
 *
 * The fixture is committed briefly so two independent PostgreSQL clients can
 * contend on the same payout row. Cleanup restores the provider wallet and
 * removes every fixture ledger/request row.
 *
 * Run:
 *   npx tsx server/tests/provider-payout-lifecycle.integration.test.ts
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../db";
import { transitionProviderPayout } from "../lib/provider-payout-lifecycle";

const amount = 1.23;

async function main(): Promise<void> {
  const setup = await pool.connect();
  let providerId = "";
  let payoutRequestId = "";
  let originalAvailable = "0";
  let originalHeld = "0";
  let originalLifetime = "0";

  try {
    const provider = await setup.query<{
      id: string;
      available_balance: string;
      held_balance: string;
      lifetime_earnings: string;
    }>(`
      SELECT p.id, pw.available_balance, pw.held_balance, pw.lifetime_earnings
      FROM providers p
      JOIN provider_wallets pw ON pw.provider_id = p.id
      LIMIT 1
    `);
    if (!provider.rows[0]) {
      console.log("Provider payout lifecycle integration test skipped: no provider wallet fixture");
      return;
    }

    providerId = provider.rows[0].id;
    originalAvailable = provider.rows[0].available_balance;
    originalHeld = provider.rows[0].held_balance;
    originalLifetime = provider.rows[0].lifetime_earnings;
    payoutRequestId = `test-payout-${randomUUID()}`;

    await setup.query("BEGIN");
    await setup.query(`
      INSERT INTO payout_requests
        (id, provider_id, amount, currency, method, status, payment_method, notes)
      VALUES ($1, $2, $3, 'USD', 'bank_transfer', 'approved', 'manual', 'integration fixture')
    `, [payoutRequestId, providerId, amount]);
    await setup.query(`
      UPDATE provider_wallets
      SET held_balance = held_balance + $1, updated_at = NOW()
      WHERE provider_id = $2
    `, [amount, providerId]);
    await setup.query("COMMIT");

    const settle = async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await transitionProviderPayout(client, payoutRequestId, "paid", null, {
          paymentReference: "integration-test",
        });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    };

    const results = await Promise.all([settle(), settle()]);
    assert.equal(results.filter((result) => result.changed).length, 1, "only one concurrent paid transition changes state");
    assert.equal(results.filter((result) => !result.changed).length, 1, "the second transition is idempotent");

    const state = await setup.query<{ status: string; held_balance: string }>(`
      SELECT pr.status, pw.held_balance
      FROM payout_requests pr
      JOIN provider_wallets pw ON pw.provider_id = pr.provider_id
      WHERE pr.id = $1
    `, [payoutRequestId]);
    assert.equal(state.rows[0]?.status, "paid", "concurrent transitions leave payout paid");
    assert.equal(Number(state.rows[0]?.held_balance), Number(originalHeld), "held balance is consumed once");

    const ledger = await setup.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM provider_ledger
      WHERE reference_id = $1 AND entry_type = 'payout_deduction'
    `, [payoutRequestId]);
    assert.equal(ledger.rows[0]?.count, "1", "one payout deduction ledger entry is written");
    console.log("Provider payout lifecycle integration tests passed");
  } finally {
    await setup.query("ROLLBACK").catch(() => {});
    if (providerId && payoutRequestId) {
      await setup.query("BEGIN");
      await setup.query("DELETE FROM provider_ledger WHERE reference_id = $1", [payoutRequestId]);
      await setup.query("DELETE FROM payout_requests WHERE id = $1", [payoutRequestId]);
      await setup.query(`
        UPDATE provider_wallets
        SET available_balance = $1, held_balance = $2, lifetime_earnings = $3, updated_at = NOW()
        WHERE provider_id = $4
      `, [originalAvailable, originalHeld, originalLifetime, providerId]);
      await setup.query("COMMIT");
    }
    setup.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});