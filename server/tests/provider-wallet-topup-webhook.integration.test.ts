/**
 * Provider wallet top-up webhook idempotency regression test.
 *
 * The fixture uses an existing provider wallet, sends the same Stripe Checkout
 * session through two webhook event IDs, then retries one of those event IDs.
 * Cleanup removes only the test session's rows and restores the wallet
 * snapshot, so the test is safe to run against the shared development DB.
 *
 * Run:
 *   npx tsx server/tests/provider-wallet-topup-webhook.integration.test.ts
 */

import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { handleStripeWebhook } from "../stripeWebhook";
import { pool } from "../db";

type ProviderFixture = {
  id: string;
  user_id: string;
  country_code: string;
  available_balance: string;
  lifetime_earnings: string;
};

type TestResponse = Response & {
  statusCode: number;
  payload: unknown;
};

function makeRequest(event: unknown): Request {
  return {
    body: Buffer.from(JSON.stringify(event)),
    headers: {},
  } as unknown as Request;
}

function makeResponse(): TestResponse {
  const response = {
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(payload: unknown) {
      response.payload = payload;
      return response;
    },
  };
  return response as unknown as TestResponse;
}

function checkoutEvent(
  eventId: string,
  sessionId: string,
  provider: ProviderFixture,
  type: "checkout.session.completed" | "checkout.session.async_payment_succeeded" = "checkout.session.completed",
) {
  return {
    id: eventId,
    type,
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        amount_total: 1250,
        payment_intent: `pi_provider_topup_${sessionId}`,
        metadata: {
          type: "provider_wallet_topup",
          providerId: provider.id,
          providerUserId: provider.user_id,
          amount: "12.50",
        },
      },
    },
  };
}

async function main(): Promise<void> {
  const setup = await pool.connect();
  let provider: ProviderFixture | undefined;
  const sessionId = `cs_provider_topup_test_${randomUUID()}`;
  const eventId = `evt_provider_topup_test_${randomUUID()}`;
  const secondEventId = `evt_provider_topup_test_${randomUUID()}`;

  // A test-only Stripe key is enough for handleStripeWebhook to construct its
  // verifier. The webhook secret is removed so the handler accepts this
  // fixture's raw event body without needing a credential.
  const previousStripeKey = process.env.STRIPE_SECRET_KEY;
  const previousWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_SECRET_KEY = "sk_test_provider_wallet_topup_fixture";
  delete process.env.STRIPE_WEBHOOK_SECRET;

  try {
    const tableCheck = await setup.query<{ relname: string }>(`
      SELECT relname
      FROM pg_class
      WHERE relkind = 'r'
        AND relname IN ('provider_wallet_topups', 'provider_ledger', 'provider_wallets', 'idempotency_keys')
    `);
    const tables = new Set(tableCheck.rows.map((row) => row.relname));
    if (tables.size < 4) {
      console.log("Provider wallet top-up webhook integration test skipped: required tables are missing");
      return;
    }

    const providerResult = await setup.query<ProviderFixture>(`
      SELECT p.id,
             p.user_id,
             p.country_code::text AS country_code,
             pw.available_balance,
             pw.lifetime_earnings
      FROM providers p
      JOIN provider_wallets pw ON pw.provider_id = p.id
      WHERE p.user_id IS NOT NULL
      LIMIT 1
    `);
    provider = providerResult.rows[0];
    if (!provider) {
      console.log("Provider wallet top-up webhook integration test skipped: no provider wallet fixture");
      return;
    }

    const amount = 12.5;
    const originalAvailable = Number(provider.available_balance);
    const originalLifetime = Number(provider.lifetime_earnings);

    const firstResponse = makeResponse();
    await handleStripeWebhook(
      makeRequest(checkoutEvent(eventId, sessionId, provider)),
      firstResponse,
    );
    assert.equal(firstResponse.statusCode, 200, "the first Checkout completion is accepted");

    const secondResponse = makeResponse();
    await handleStripeWebhook(
      makeRequest(checkoutEvent(
        secondEventId,
        sessionId,
        provider,
        "checkout.session.async_payment_succeeded",
      )),
      secondResponse,
    );
    assert.equal(
      secondResponse.statusCode,
      200,
      "a second event for the same Checkout session is accepted as an idempotent no-op",
    );

    const retryResponse = makeResponse();
    await handleStripeWebhook(
      makeRequest(checkoutEvent(eventId, sessionId, provider)),
      retryResponse,
    );
    assert.equal(retryResponse.statusCode, 200, "a retry of the same Stripe event is accepted");
    assert.deepEqual(
      retryResponse.payload,
      { received: true, duplicate: true },
      "a retry of the same Stripe event is reported as a duplicate",
    );

    const claimedEvents = await setup.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM idempotency_keys
      WHERE scope = 'stripe_webhook' AND key IN ($1, $2)
    `, [eventId, secondEventId]);
    assert.equal(
      claimedEvents.rows[0]?.count,
      "2",
      "each distinct Stripe event is claimed persistently",
    );

    const topupResult = await setup.query<{
      count: string;
      amount_usd: string;
      status: string;
      provider_payment_id: string;
    }>(`
      SELECT COUNT(*)::text AS count,
             MAX(amount_usd)::text AS amount_usd,
             MAX(status) AS status,
             MAX(provider_payment_id) AS provider_payment_id
      FROM provider_wallet_topups
      WHERE provider_id = $1 AND provider_session_id = $2
    `, [provider.id, sessionId]);
    assert.equal(topupResult.rows[0]?.count, "1", "the Checkout session creates one top-up record");
    assert.equal(topupResult.rows[0]?.amount_usd, amount.toFixed(2), "the top-up stores the Stripe amount");
    assert.equal(topupResult.rows[0]?.status, "completed", "the top-up is completed once");
    assert.equal(
      topupResult.rows[0]?.provider_payment_id,
      `pi_provider_topup_${sessionId}`,
      "the top-up stores its payment intent",
    );

    const ledgerResult = await setup.query<{
      count: string;
      amount: string;
      amount_usd: string;
      currency: string;
    }>(`
      SELECT COUNT(*)::text AS count,
             MAX(amount)::text AS amount,
             MAX(amount_usd)::text AS amount_usd,
             MAX(currency) AS currency
      FROM provider_ledger
      WHERE provider_id = $1
        AND reference_id = $2
        AND entry_type = 'provider_wallet_topup'
    `, [provider.id, sessionId]);
    assert.equal(ledgerResult.rows[0]?.count, "1", "the provider ledger receives one top-up credit");
    assert.equal(ledgerResult.rows[0]?.amount, amount.toFixed(2), "the ledger credit amount is correct");
    assert.equal(
      Number(ledgerResult.rows[0]?.amount_usd),
      amount,
      "the ledger USD audit amount is correct",
    );
    assert.equal(ledgerResult.rows[0]?.currency, "USD", "provider ledger top-ups are stored in USD");

    const walletResult = await setup.query<{
      available_balance: string;
      lifetime_earnings: string;
    }>(`
      SELECT available_balance, lifetime_earnings
      FROM provider_wallets
      WHERE provider_id = $1
    `, [provider.id]);
    assert.equal(
      Number(walletResult.rows[0]?.available_balance),
      Number((originalAvailable + amount).toFixed(2)),
      "the provider wallet is credited exactly once",
    );
    assert.equal(
      Number(walletResult.rows[0]?.lifetime_earnings),
      originalLifetime,
      "a wallet top-up does not change lifetime earnings",
    );

    console.log("Provider wallet top-up webhook integration tests passed");
  } finally {
    await setup.query("ROLLBACK").catch(() => {});
    if (provider) {
      await setup.query("BEGIN");
      await setup.query(
        `DELETE FROM provider_ledger
         WHERE provider_id = $1 AND reference_id = $2 AND entry_type = 'provider_wallet_topup'`,
        [provider.id, sessionId],
      );
      await setup.query(
        "DELETE FROM provider_wallet_topups WHERE provider_id = $1 AND provider_session_id = $2",
        [provider.id, sessionId],
      );
      await setup.query(
        "DELETE FROM idempotency_keys WHERE key IN ($1, $2) AND scope = 'stripe_webhook'",
        [eventId, secondEventId],
      );
      await setup.query(
        `UPDATE provider_wallets
         SET available_balance = $1, lifetime_earnings = $2, updated_at = NOW()
         WHERE provider_id = $3`,
        [provider.available_balance, provider.lifetime_earnings, provider.id],
      );
      await setup.query("COMMIT");
    }
    setup.release();

    if (previousStripeKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousStripeKey;
    if (previousWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previousWebhookSecret;
  }
}

void main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => {});
  process.exitCode = 1;
});