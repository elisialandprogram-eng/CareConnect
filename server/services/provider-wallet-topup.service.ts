import { pool } from "../db";

export async function creditProviderWalletTopup(input: {
  providerId: string;
  providerUserId: string;
  providerSessionId: string;
  providerPaymentId?: string | null;
  amountUsd: number;
}): Promise<{ credited: boolean; balanceAfter: number }> {
  if (!(input.amountUsd > 0) || !Number.isFinite(input.amountUsd)) {
    throw new Error("Provider wallet top-up amount must be positive");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const providerResult = await client.query<{
      id: string;
      user_id: string;
      country_code: string | null;
    }>(
      `SELECT id, user_id, country_code::text AS country_code
         FROM providers
        WHERE id = $1 AND user_id = $2
        FOR UPDATE`,
      [input.providerId, input.providerUserId],
    );
    if (!providerResult.rows[0]) {
      throw new Error("Provider wallet top-up metadata does not match provider");
    }

    await client.query(
      `INSERT INTO provider_wallet_topups
        (provider_id, provider_session_id, provider_payment_id, amount_usd,
         status, idempotency_key)
       VALUES ($1, $2, $3, $4, 'pending', $5)
       ON CONFLICT (provider_session_id) DO NOTHING`,
      [
        input.providerId,
        input.providerSessionId,
        input.providerPaymentId ?? null,
        input.amountUsd,
        `stripe:${input.providerSessionId}`,
      ],
    );

    const topupResult = await client.query<{ id: string; status: string }>(
      `SELECT id, status
         FROM provider_wallet_topups
        WHERE provider_session_id = $1
        FOR UPDATE`,
      [input.providerSessionId],
    );
    const topup = topupResult.rows[0];
    if (!topup) throw new Error("Provider wallet top-up record was not created");

    let credited = false;
    if (topup.status !== "completed") {
      await client.query(
        `INSERT INTO provider_wallets
          (provider_id, available_balance, currency, country_code)
         VALUES ($1, $2, 'USD', $3)
         ON CONFLICT (provider_id) DO UPDATE SET
           available_balance = provider_wallets.available_balance + $2::numeric,
           updated_at = NOW()`,
        [
          input.providerId,
          input.amountUsd,
          providerResult.rows[0].country_code || "HU",
        ],
      );

      const walletResult = await client.query<{ available_balance: string }>(
        `SELECT available_balance
           FROM provider_wallets
          WHERE provider_id = $1
          FOR UPDATE`,
        [input.providerId],
      );
      const balanceAfter = Number(walletResult.rows[0]?.available_balance ?? input.amountUsd);

      await client.query(
        `INSERT INTO provider_ledger
          (provider_id, amount, amount_usd, currency, entry_type,
           reference_id, description, balance_after, country_code)
         VALUES ($1, $2, $2, 'USD', 'provider_wallet_topup',
                 $3, $4, $5, $6)`,
        [
          input.providerId,
          input.amountUsd,
          input.providerSessionId,
          `Stripe provider wallet top-up — ${input.amountUsd.toFixed(2)} USD`,
          balanceAfter,
          providerResult.rows[0].country_code || "HU",
        ],
      );

      await client.query(
        `UPDATE provider_wallet_topups
            SET provider_payment_id = COALESCE($1, provider_payment_id),
                amount_usd = $2,
                status = 'completed',
                completed_at = COALESCE(completed_at, NOW())
          WHERE id = $3`,
        [input.providerPaymentId ?? null, input.amountUsd, topup.id],
      );
      credited = true;
    }

    const finalWallet = await client.query<{ available_balance: string }>(
      `SELECT available_balance
         FROM provider_wallets
        WHERE provider_id = $1`,
      [input.providerId],
    );

    await client.query("COMMIT");
    return {
      credited,
      balanceAfter: Number(finalWallet.rows[0]?.available_balance ?? 0),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}