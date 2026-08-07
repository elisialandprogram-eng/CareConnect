import type { PoolClient } from "pg";

export type PayoutLifecycleStatus = "approved" | "paid" | "rejected" | "cancelled" | "on_hold";

export interface PayoutLifecycleResult {
  row: any;
  changed: boolean;
  previousStatus: string;
  amountUsd: number;
}

/**
 * Applies a payout-request state transition and its wallet/ledger effects.
 *
 * Payout creation already moves amount from available to held. This helper is
 * the only place that releases held funds or permanently consumes them, so
 * admin, automation, retry, and cancellation paths stay idempotent.
 */
export async function transitionProviderPayout(
  client: PoolClient,
  payoutRequestId: string,
  nextStatus: PayoutLifecycleStatus,
  actorId?: string | null,
  options?: {
    paymentReference?: string | null;
    adminNote?: string | null;
    stripeTransferId?: string | null;
  },
): Promise<PayoutLifecycleResult> {
  const result = await client.query(`
    SELECT pr.*, p.country_code::text AS provider_country_code
    FROM payout_requests pr
    JOIN providers p ON p.id = pr.provider_id
    WHERE pr.id = $1
    FOR UPDATE
  `, [payoutRequestId]);
  const payout = result.rows[0];
  if (!payout) throw new Error("Payout request not found");

  const previousStatus = String(payout.status);
  const amountUsd = Number(payout.amount || 0);
  if (previousStatus === nextStatus) {
    return { row: payout, changed: false, previousStatus, amountUsd };
  }

  if (nextStatus === "approved") {
    if (!["pending", "rejected"].includes(previousStatus)) {
      throw new Error(`Cannot approve payout with status '${previousStatus}'`);
    }
    if (previousStatus === "rejected") {
      const wallet = await client.query(`
        SELECT available_balance FROM provider_wallets
        WHERE provider_id = $1 FOR UPDATE
      `, [payout.provider_id]);
      if (!wallet.rows[0] || Number(wallet.rows[0].available_balance ?? 0) + 0.001 < amountUsd) {
        throw new Error("Insufficient available balance to retry payout");
      }
      await client.query(`
        UPDATE provider_wallets
        SET available_balance = available_balance - $1,
            held_balance = held_balance + $1,
            updated_at = NOW()
        WHERE provider_id = $2
      `, [amountUsd, payout.provider_id]);
      const balance = await client.query(
        `SELECT available_balance FROM provider_wallets WHERE provider_id = $1`,
        [payout.provider_id],
      );
      await client.query(`
        INSERT INTO provider_ledger
          (provider_id, amount, entry_type, reference_id, description, actor_id, balance_after, country_code)
        VALUES ($1, $2, 'payout_held', $3, $4, $5, $6, $7)
      `, [
        payout.provider_id, -amountUsd, payoutRequestId,
        `Payout retry hold — ${amountUsd.toFixed(2)} USD`,
        actorId ?? null, balance.rows[0]?.available_balance ?? 0,
        payout.provider_country_code ?? "HU",
      ]);
    }
    const updated = await client.query(`
      UPDATE payout_requests
      SET status = 'approved',
          reviewed_by = COALESCE($1, reviewed_by),
          reviewed_at = NOW(),
          admin_note = COALESCE($2, admin_note),
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [actorId ?? null, options?.adminNote ?? null, payoutRequestId]);
    return { row: updated.rows[0], changed: true, previousStatus, amountUsd };
  }

  if (nextStatus === "on_hold") {
    if (!["pending", "approved"].includes(previousStatus)) {
      throw new Error(`Cannot put payout on hold with status '${previousStatus}'`);
    }
    const updated = await client.query(`
      UPDATE payout_requests
      SET status = 'on_hold',
          reviewed_by = COALESCE($1, reviewed_by),
          reviewed_at = NOW(),
          admin_note = COALESCE($2, admin_note),
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [actorId ?? null, options?.adminNote ?? null, payoutRequestId]);
    return { row: updated.rows[0], changed: true, previousStatus, amountUsd };
  }

  if (!["pending", "approved", "on_hold"].includes(previousStatus)) {
    throw new Error(`Cannot ${nextStatus} payout with status '${previousStatus}'`);
  }

  const wallet = await client.query(`
    SELECT available_balance, held_balance
    FROM provider_wallets
    WHERE provider_id = $1
    FOR UPDATE
  `, [payout.provider_id]);
  if (!wallet.rows[0]) throw new Error("Provider wallet not found");

  if (nextStatus === "paid") {
    if (Number(wallet.rows[0].held_balance ?? 0) + 0.001 < amountUsd) {
      throw new Error("Payout hold balance is lower than the requested payout amount");
    }
    const updated = await client.query(`
      UPDATE payout_requests
      SET status = 'paid',
          paid_at = COALESCE(paid_at, NOW()),
          payment_reference = COALESCE($1, payment_reference),
          stripe_transfer_id = COALESCE($2, stripe_transfer_id),
          reviewed_by = COALESCE($3, reviewed_by),
          reviewed_at = COALESCE(reviewed_at, NOW()),
          admin_note = COALESCE($4, admin_note),
          updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [
      options?.paymentReference ?? null,
      options?.stripeTransferId ?? null,
      actorId ?? null,
      options?.adminNote ?? null,
      payoutRequestId,
    ]);
    await client.query(`
      UPDATE provider_wallets
      SET held_balance = GREATEST(0, held_balance - $1),
          last_payout_date = NOW(),
          updated_at = NOW()
      WHERE provider_id = $2
    `, [amountUsd, payout.provider_id]);
    const balance = await client.query(
      `SELECT available_balance FROM provider_wallets WHERE provider_id = $1`,
      [payout.provider_id],
    );
    await client.query(`
      INSERT INTO provider_ledger
        (provider_id, amount, entry_type, reference_id, description, actor_id, balance_after, country_code)
      VALUES ($1, $2, 'payout_deduction', $3, $4, $5, $6, $7)
    `, [
      payout.provider_id,
      -amountUsd,
      payoutRequestId,
      `Payout paid — ${amountUsd.toFixed(2)} USD`,
      actorId ?? null,
      balance.rows[0]?.available_balance ?? 0,
      payout.provider_country_code ?? "HU",
    ]);
    return { row: updated.rows[0], changed: true, previousStatus, amountUsd };
  }

  const updated = await client.query(`
    UPDATE payout_requests
    SET status = $1,
        reviewed_by = COALESCE($2, reviewed_by),
        reviewed_at = NOW(),
        admin_note = COALESCE($3, admin_note),
        updated_at = NOW()
    WHERE id = $4
    RETURNING *
  `, [nextStatus, actorId ?? null, options?.adminNote ?? null, payoutRequestId]);
  await client.query(`
    UPDATE provider_wallets
    SET available_balance = available_balance + $1,
        held_balance = GREATEST(0, held_balance - $1),
        updated_at = NOW()
    WHERE provider_id = $2
  `, [amountUsd, payout.provider_id]);
  const balance = await client.query(
    `SELECT available_balance FROM provider_wallets WHERE provider_id = $1`,
    [payout.provider_id],
  );
  await client.query(`
    INSERT INTO provider_ledger
      (provider_id, amount, entry_type, reference_id, description, actor_id, balance_after, country_code)
    VALUES ($1, $2, 'payout_returned', $3, $4, $5, $6, $7)
  `, [
    payout.provider_id,
    amountUsd,
    payoutRequestId,
    `Payout ${nextStatus} — ${amountUsd.toFixed(2)} USD returned to wallet`,
    actorId ?? null,
    balance.rows[0]?.available_balance ?? 0,
    payout.provider_country_code ?? "HU",
  ]);
  return { row: updated.rows[0], changed: true, previousStatus, amountUsd };
}