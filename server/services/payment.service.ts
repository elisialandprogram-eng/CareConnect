import { pool } from "../db";
import { getStripe } from "../stripe";
import { round2, roundToCents } from "../lib/math";

export type PaymentState =
  | "pending"
  | "processing"
  | "partially_paid"
  | "paid"
  | "failed"
  | "refund_pending"
  | "partially_refunded"
  | "refunded"
  | "disputed"
  | "cancelled";

export type PaymentSource = "wallet" | "stripe" | "cash" | "bank_transfer";
export type PaymentMethodInput = PaymentSource | "card";

const TRANSITIONS: Record<PaymentState, readonly PaymentState[]> = {
  pending: ["processing", "partially_paid", "paid", "failed", "cancelled"],
  processing: ["partially_paid", "paid", "failed", "cancelled"],
  partially_paid: ["processing", "paid", "failed", "refund_pending", "partially_refunded", "refunded", "disputed", "cancelled"],
  paid: ["refund_pending", "partially_refunded", "refunded", "disputed"],
  failed: ["processing", "partially_paid", "paid", "cancelled"],
  refund_pending: ["partially_refunded", "refunded", "failed"],
  partially_refunded: ["partially_refunded", "refunded", "disputed"],
  refunded: ["disputed"],
  disputed: ["refund_pending", "partially_refunded", "refunded"],
  cancelled: [],
};

function assertState(value: string): asserts value is PaymentState {
  if (!(value in TRANSITIONS)) throw new Error(`Unknown payment state: ${value}`);
}

function canTransition(from: PaymentState, to: PaymentState): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

async function transitionOnClient(
  client: { query: (text: string, values?: unknown[]) => Promise<any> },
  paymentId: string,
  toStatus: PaymentState,
  opts: { idempotencyKey?: string; metadata?: unknown } = {},
) {
  assertState(toStatus);
  const current = await client.query(
    `SELECT id, status FROM payments WHERE id = $1 FOR UPDATE`,
    [paymentId],
  );
  if (!current.rows[0]) throw new Error("Payment aggregate not found");

  const fromStatus = current.rows[0].status as PaymentState;
  assertState(fromStatus);
  if (!canTransition(fromStatus, toStatus)) {
    throw new Error(`Invalid payment transition ${fromStatus} -> ${toStatus}`);
  }

  if (opts.idempotencyKey) {
    const event = await client.query(
      `INSERT INTO payment_events
         (payment_id, event_type, from_status, to_status, idempotency_key, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        paymentId,
        `payment.${toStatus}`,
        fromStatus,
        toStatus,
        opts.idempotencyKey,
        opts.metadata ? JSON.stringify(opts.metadata) : null,
      ],
    );
    if (!event.rows[0]) {
      const existing = await client.query(`SELECT * FROM payments WHERE id = $1`, [paymentId]);
      return existing.rows[0];
    }
  } else {
    await client.query(
      `INSERT INTO payment_events
         (payment_id, event_type, from_status, to_status, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        paymentId,
        `payment.${toStatus}`,
        fromStatus,
        toStatus,
        opts.metadata ? JSON.stringify(opts.metadata) : null,
      ],
    );
  }

  const updated = await client.query(
    `UPDATE payments
        SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *`,
    [toStatus, paymentId],
  );
  return updated.rows[0];
}

export async function transitionPayment(
  paymentId: string,
  toStatus: PaymentState,
  opts: { idempotencyKey?: string; metadata?: unknown } = {},
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const payment = await transitionOnClient(client, paymentId, toStatus, opts);
    await client.query("COMMIT");
    return payment;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function createAppointmentPayment(input: {
  appointmentId: string;
  patientId: string;
  totalAmountUsd: number;
  initialMethod: PaymentMethodInput;
  displayCurrency: string;
  displayAmount: number;
  exchangeRateUsed: number;
  countryCode: string;
  idempotencyKey: string;
}) {
  if (!Number.isFinite(input.totalAmountUsd) || input.totalAmountUsd <= 0) {
    throw new Error("Payment total must be positive");
  }
  const normalizedMethod = input.initialMethod === "card" ? "card" : input.initialMethod;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO payments
         (appointment_id, patient_id, amount, paid_amount_usd, remaining_amount_usd,
          refunded_amount, currency, payment_method, status, display_currency,
          display_amount, exchange_rate_used, country_code, updated_at)
       VALUES ($1, $2, $3, 0, $3, 0, 'USD', $4, 'pending',
               $5, $6, $7, $8, NOW())
       ON CONFLICT (appointment_id) WHERE appointment_id IS NOT NULL DO UPDATE
         SET updated_at = NOW()
       RETURNING *`,
      [
        input.appointmentId,
        input.patientId,
        round2(input.totalAmountUsd).toFixed(2),
        normalizedMethod,
        input.displayCurrency,
        round2(input.displayAmount).toFixed(2),
        input.exchangeRateUsed.toFixed(6),
        input.countryCode,
      ],
    );
    const payment = result.rows[0];
    if (!payment) {
      throw new Error("Appointment already has a different payment aggregate");
    }
    if (
      payment.patient_id !== input.patientId ||
      Math.abs(Number(payment.amount) - input.totalAmountUsd) > 0.01
    ) {
      throw new Error("Appointment already has a different payment aggregate");
    }
    await client.query(
      `INSERT INTO payment_events
         (payment_id, event_type, to_status, idempotency_key, metadata)
       VALUES ($1, 'payment.pending', 'pending', $2, $3)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [payment.id, input.idempotencyKey, JSON.stringify({ source: "appointment_booking" })],
    );
    await client.query("COMMIT");
    return payment;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function createPaymentAttempt(input: {
  paymentId: string;
  source: PaymentSource;
  amountUsd: number;
  idempotencyKey: string;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT * FROM payment_attempts WHERE idempotency_key = $1`,
      [input.idempotencyKey],
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return existing.rows[0];
    }

    await transitionOnClient(client, input.paymentId, "processing", {
      idempotencyKey: `${input.idempotencyKey}:processing`,
      metadata: { source: input.source, amountUsd: input.amountUsd },
    });
    const attempt = await client.query(
      `INSERT INTO payment_attempts
         (payment_id, source, status, amount_usd, idempotency_key, updated_at)
       VALUES ($1, $2, 'processing', $3, $4, NOW())
       RETURNING *`,
        [input.paymentId, input.source, round2(input.amountUsd).toFixed(2), input.idempotencyKey],
    );
    await client.query("COMMIT");
    return attempt.rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function applyWalletAllocation(input: {
  paymentId: string;
  userId: string;
  amountUsd: number;
  idempotencyKey: string;
  description?: string;
}) {
  if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
    throw new Error("Wallet allocation must be positive");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const paymentResult = await client.query(
      `SELECT * FROM payments WHERE id = $1 FOR UPDATE`,
      [input.paymentId],
    );
    const payment = paymentResult.rows[0];
    if (!payment) throw new Error("Payment aggregate not found");

    const existing = await client.query(
      `SELECT pa.*, wt.id AS wallet_transaction_id
         FROM payment_allocations pa
         LEFT JOIN wallet_transactions wt
           ON wt.idempotency_key = pa.idempotency_key
        WHERE pa.idempotency_key = $1`,
      [input.idempotencyKey],
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return {
        payment,
        allocation: existing.rows[0],
        transaction: existing.rows[0].wallet_transaction_id
          ? (await pool.query(`SELECT * FROM wallet_transactions WHERE id = $1`, [existing.rows[0].wallet_transaction_id])).rows[0]
          : null,
      };
    }

    const walletResult = await client.query(
      `SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [input.userId],
    );
    const wallet = walletResult.rows[0];
    if (!wallet) throw new Error("Wallet not found");
    if (wallet.is_frozen) throw new Error("Wallet is frozen");
    const balance = Number(wallet.balance);
    const remaining = Number(payment.remaining_amount_usd ?? payment.amount);
    const amountToApply = round2(Math.min(input.amountUsd, remaining));
    if (amountToApply <= 0) throw new Error("Payment is already fully funded");
    if (balance + 1e-6 < amountToApply) throw new Error("Insufficient wallet balance");

    if (payment.status === "failed") {
      await transitionOnClient(client, input.paymentId, "processing", {
        idempotencyKey: `${input.idempotencyKey}:retry`,
        metadata: { source: "wallet", reason: "wallet_retry" },
      });
    }

    const nextBalance = round2(balance - amountToApply);
    const walletTx = await client.query(
      `INSERT INTO wallet_transactions
         (wallet_id, user_id, type, status, amount, balance_after, currency,
          description, reference_type, reference_id, idempotency_key, amount_usd)
       VALUES ($1, $2, 'debit', 'completed', $3, $4, 'USD', $5,
               'appointment_payment', $6, $7, $3)
       RETURNING *`,
      [
        wallet.id,
        input.userId,
        (-amountToApply).toFixed(2),
        nextBalance.toFixed(2),
        input.description ?? "Appointment payment",
        payment.appointment_id,
        input.idempotencyKey,
      ],
    );
    await client.query(
      `UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2`,
      [nextBalance.toFixed(2), wallet.id],
    );
    const allocation = await client.query(
      `INSERT INTO payment_allocations
         (payment_id, source, amount_usd, provider_reference, idempotency_key, status, updated_at)
       VALUES ($1, 'wallet', $2, $3, $4, 'paid', NOW())
       RETURNING *`,
      [input.paymentId, amountToApply.toFixed(2), walletTx.rows[0].id, input.idempotencyKey],
    );

    const totals = await client.query(
      `SELECT COALESCE(SUM(amount_usd) FILTER (WHERE status IN ('paid','refunded')), 0) AS paid
         FROM payment_allocations WHERE payment_id = $1`,
      [input.paymentId],
    );
    const paid = Number(totals.rows[0].paid);
    const total = Number(payment.amount);
    const nextStatus: PaymentState = paid >= total ? "paid" : "partially_paid";
    await client.query(
      `UPDATE payments
          SET paid_amount_usd = $1,
              remaining_amount_usd = GREATEST(0, amount - $1),
              payment_method = CASE
                WHEN EXISTS (
                  SELECT 1 FROM payment_allocations
                   WHERE payment_id = $2 AND source <> 'wallet' AND status = 'paid'
                ) THEN 'mixed'
                ELSE 'wallet'
              END,
              updated_at = NOW()
        WHERE id = $2`,
      [round2(paid).toFixed(2), input.paymentId],
    );
    await transitionOnClient(client, input.paymentId, nextStatus, {
      idempotencyKey: `${input.idempotencyKey}:state`,
      metadata: { source: "wallet", amountUsd: amountToApply },
    });
    await client.query("COMMIT");
    return {
      payment: (await pool.query(`SELECT * FROM payments WHERE id = $1`, [input.paymentId])).rows[0],
      allocation: allocation.rows[0],
      transaction: walletTx.rows[0],
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function attachStripeAttempt(
  attemptId: string,
  providerSessionId: string,
) {
  const result = await pool.query(
    `UPDATE payment_attempts
        SET provider_session_id = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *`,
    [providerSessionId, attemptId],
  );
  return result.rows[0];
}

export async function completeStripeAttempt(input: {
  providerSessionId: string;
  providerPaymentId?: string | null;
  idempotencyKey: string;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const attemptResult = await client.query(
      `SELECT pa.*, p.amount AS total_amount
         FROM payment_attempts pa
         JOIN payments p ON p.id = pa.payment_id
        WHERE pa.provider_session_id = $1
        FOR UPDATE OF pa, p`,
      [input.providerSessionId],
    );
    const attempt = attemptResult.rows[0];
    if (!attempt) throw new Error("Stripe payment attempt not found");
    if (attempt.status === "paid") {
      await client.query("COMMIT");
      return (await pool.query(`SELECT * FROM payments WHERE id = $1`, [attempt.payment_id])).rows[0];
    }

    await client.query(
      `UPDATE payment_attempts
          SET status = 'paid', provider_payment_id = COALESCE($1, provider_payment_id), updated_at = NOW()
        WHERE id = $2`,
      [input.providerPaymentId ?? null, attempt.id],
    );
    await client.query(
      `INSERT INTO payment_allocations
         (payment_id, source, amount_usd, provider_reference, idempotency_key, status, updated_at)
       VALUES ($1, 'stripe', $2, $3, $4, 'paid', NOW())
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [attempt.payment_id, attempt.amount_usd, input.providerPaymentId ?? input.providerSessionId, `${input.idempotencyKey}:allocation`],
    );
    const totals = await client.query(
      `SELECT
         COALESCE(SUM(amount_usd) FILTER (WHERE status IN ('paid','refunded')), 0) AS paid,
         COALESCE(SUM(refunded_amount_usd), 0) AS refunded
       FROM payment_allocations
      WHERE payment_id = $1`,
      [attempt.payment_id],
    );
    const paid = Number(totals.rows[0].paid);
    const refunded = Number(totals.rows[0].refunded);
    const total = Number(attempt.total_amount);
    const next: PaymentState = refunded >= paid && paid > 0
      ? "refunded"
      : refunded > 0
        ? "partially_refunded"
        : paid >= total
          ? "paid"
          : "partially_paid";
    await client.query(
      `UPDATE payments
          SET paid_amount_usd = $1,
              remaining_amount_usd = GREATEST(0, amount - $1),
              refunded_amount = $2,
              payment_method = CASE
                WHEN EXISTS (
                  SELECT 1 FROM payment_allocations
                   WHERE payment_id = $5 AND source = 'wallet' AND status IN ('paid','refunded')
                ) THEN 'mixed'
                ELSE 'card'
              END,
              stripe_payment_id = COALESCE($3, stripe_payment_id),
              stripe_session_id = $4,
              updated_at = NOW()
        WHERE id = $5`,
      [round2(paid).toFixed(2), round2(refunded).toFixed(2), input.providerPaymentId ?? null, input.providerSessionId, attempt.payment_id],
    );
    await transitionOnClient(client, attempt.payment_id, next, {
      idempotencyKey: `${input.idempotencyKey}:state`,
      metadata: { source: "stripe", providerSessionId: input.providerSessionId },
    });
    await client.query("COMMIT");
    return (await pool.query(`SELECT * FROM payments WHERE id = $1`, [attempt.payment_id])).rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function failPaymentAttempt(input: {
  providerSessionId: string;
  failureCode?: string | null;
  failureMessage?: string | null;
  idempotencyKey: string;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT * FROM payment_attempts WHERE provider_session_id = $1 FOR UPDATE`,
      [input.providerSessionId],
    );
    const attempt = found.rows[0];
    if (!attempt) throw new Error("Stripe payment attempt not found");
    if (attempt.status === "paid" || attempt.status === "failed" || attempt.status === "expired") {
      await client.query("COMMIT");
      return (await pool.query(`SELECT * FROM payments WHERE id = $1`, [attempt.payment_id])).rows[0];
    }
    await client.query(
      `UPDATE payment_attempts
          SET status = 'failed', failure_code = $1, failure_message = $2, updated_at = NOW()
        WHERE id = $3`,
      [input.failureCode ?? null, input.failureMessage ?? null, attempt.id],
    );
    const paid = await client.query(
      `SELECT COALESCE(SUM(amount_usd), 0) AS amount
         FROM payment_allocations
        WHERE payment_id = $1 AND status = 'paid'`,
      [attempt.payment_id],
    );
    const next: PaymentState = Number(paid.rows[0].amount) > 0 ? "partially_paid" : "failed";
    await transitionOnClient(client, attempt.payment_id, next, {
      idempotencyKey: `${input.idempotencyKey}:state`,
      metadata: { source: "stripe", providerSessionId: input.providerSessionId },
    });
    await client.query("COMMIT");
    return (await pool.query(`SELECT * FROM payments WHERE id = $1`, [attempt.payment_id])).rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function expirePaymentAttempt(input: {
  providerSessionId: string;
  idempotencyKey: string;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT * FROM payment_attempts WHERE provider_session_id = $1 FOR UPDATE`,
      [input.providerSessionId],
    );
    const attempt = found.rows[0];
    if (!attempt) throw new Error("Stripe payment attempt not found");
    if (attempt.status === "paid" || attempt.status === "expired") {
      await client.query("COMMIT");
      return (await pool.query(`SELECT * FROM payments WHERE id = $1`, [attempt.payment_id])).rows[0];
    }
    await client.query(
      `UPDATE payment_attempts
          SET status = 'expired', failure_code = 'checkout_expired',
              failure_message = 'Stripe checkout session expired', updated_at = NOW()
        WHERE id = $1`,
      [attempt.id],
    );
    const paid = await client.query(
      `SELECT COALESCE(SUM(amount_usd), 0) AS amount
         FROM payment_allocations
        WHERE payment_id = $1 AND status IN ('paid','refunded')`,
      [attempt.payment_id],
    );
    const next: PaymentState = Number(paid.rows[0].amount) > 0 ? "partially_paid" : "failed";
    await transitionOnClient(client, attempt.payment_id, next, {
      idempotencyKey: `${input.idempotencyKey}:state`,
      metadata: { source: "stripe", providerSessionId: input.providerSessionId, expired: true },
    });
    await client.query("COMMIT");
    return (await pool.query(`SELECT * FROM payments WHERE id = $1`, [attempt.payment_id])).rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function recordStripeDispute(input: {
  paymentIntentId: string;
  providerDisputeId: string;
  amountUsd: number;
  reason?: string | null;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const paymentResult = await client.query(
      `SELECT id FROM payments WHERE stripe_payment_id = $1 FOR UPDATE`,
      [input.paymentIntentId],
    );
    const payment = paymentResult.rows[0];
    if (!payment) throw new Error("Payment aggregate not found for dispute");
    await client.query(
      `INSERT INTO payment_disputes
         (payment_id, provider_dispute_id, status, reason, amount_usd, updated_at)
       VALUES ($1, $2, 'open', $3, $4, NOW())
       ON CONFLICT (provider_dispute_id) DO UPDATE
         SET status = 'open', reason = EXCLUDED.reason, amount_usd = EXCLUDED.amount_usd, updated_at = NOW()`,
      [payment.id, input.providerDisputeId, input.reason ?? null, round2(input.amountUsd).toFixed(2)],
    );
    await transitionOnClient(client, payment.id, "disputed", {
      idempotencyKey: `dispute:${input.providerDisputeId}:state`,
      metadata: { providerDisputeId: input.providerDisputeId, reason: input.reason },
    });
    await client.query("COMMIT");
    return (await pool.query(`SELECT * FROM payments WHERE id = $1`, [payment.id])).rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function recordStripeRefund(input: {
  paymentIntentId: string;
  providerRefundId: string;
  amountUsd: number;
  idempotencyKey: string;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const paymentResult = await client.query(
      `SELECT * FROM payments WHERE stripe_payment_id = $1 FOR UPDATE`,
      [input.paymentIntentId],
    );
    const payment = paymentResult.rows[0];
    if (!payment) throw new Error("Payment aggregate not found for refund");
    // Stripe's charge.refunded event reports charge.amount_refunded, which is
    // cumulative. Only the delta since the last provider refund may be applied
    // to local allocations.
    const priorProviderRefunds = await client.query(
      `SELECT COALESCE(SUM(amount_usd), 0) AS amount
         FROM payment_refunds
        WHERE payment_id = $1
          AND provider_refund_id IS NOT NULL
          AND status = 'processed'`,
      [payment.id],
    );
    const priorRefunded = Number(priorProviderRefunds.rows[0]?.amount ?? 0);
    const refundDelta = round2(input.amountUsd - priorRefunded);
    if (refundDelta <= 0) {
      await client.query("COMMIT");
      return payment;
    }

    const inserted = await client.query(
      `INSERT INTO payment_refunds
         (payment_id, amount_usd, status, reason, idempotency_key, provider_refund_id, processed_at)
       VALUES ($1, $2, 'processed', 'stripe_refund', $3, $4, NOW())
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [payment.id, refundDelta.toFixed(2), input.idempotencyKey, input.providerRefundId],
    );
    if (!inserted.rows[0]) {
      await client.query("COMMIT");
      return payment;
    }

    let remaining = refundDelta;
    const allocations = await client.query(
      `SELECT id, amount_usd, refunded_amount_usd
         FROM payment_allocations
        WHERE payment_id = $1 AND source = 'stripe' AND status IN ('paid','refunded')
        ORDER BY created_at
        FOR UPDATE`,
      [payment.id],
    );
    for (const allocation of allocations.rows) {
      if (remaining <= 0) break;
      const available = Math.max(0, Number(allocation.amount_usd) - Number(allocation.refunded_amount_usd));
      const refund = Math.min(available, remaining);
      if (refund <= 0) continue;
      const nextRefunded = Number(allocation.refunded_amount_usd) + refund;
      await client.query(
        `UPDATE payment_allocations
            SET refunded_amount_usd = $1,
                status = CASE WHEN refunded_amount_usd + $2 >= amount_usd THEN 'refunded' ELSE status END,
                updated_at = NOW()
          WHERE id = $3`,
        [nextRefunded.toFixed(2), refund.toFixed(2), allocation.id],
      );
      remaining = round2(remaining - refund);
    }

    const totals = await client.query(
      `SELECT COALESCE(SUM(amount_usd) FILTER (WHERE status IN ('paid','refunded')), 0) AS paid,
              COALESCE(SUM(refunded_amount_usd), 0) AS refunded
         FROM payment_allocations
        WHERE payment_id = $1`,
      [payment.id],
    );
    const paid = Number(totals.rows[0].paid);
    const refunded = Number(totals.rows[0].refunded);
    const next: PaymentState = refunded >= paid && paid > 0 ? "refunded" : "partially_refunded";
    await client.query(
      `UPDATE payments
          SET refunded_amount = $1,
              stripe_refund_id = COALESCE($2, stripe_refund_id),
              updated_at = NOW()
        WHERE id = $3`,
      [round2(refunded).toFixed(2), input.providerRefundId, payment.id],
    );
    await transitionOnClient(client, payment.id, next, {
      idempotencyKey: `${input.idempotencyKey}:state`,
      metadata: { providerRefundId: input.providerRefundId, amountUsd: input.amountUsd },
    });
    await client.query("COMMIT");
    return (await pool.query(`SELECT * FROM payments WHERE id = $1`, [payment.id])).rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Canonical refund entry point for appointment payments.
 *
 * The aggregate and allocations are locked for the entire operation. Wallet,
 * cash, and bank-transfer allocations are credited to the patient's wallet;
 * Stripe allocations are sent through the supplied idempotent provider
 * callback. This keeps every refund source allocation-aware.
 */
export async function refundPayment(input: {
  paymentId: string;
  amountUsd?: number;
  reason: string;
  idempotencyKey: string;
  stripeRefund?: (args: {
    paymentIntentId: string;
    amountUsd: number;
    idempotencyKey: string;
  }) => Promise<{ id: string }>;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const paymentResult = await client.query(
      `SELECT * FROM payments WHERE id = $1 FOR UPDATE`,
      [input.paymentId],
    );
    const payment = paymentResult.rows[0];
    if (!payment) throw new Error("Payment aggregate not found");

    const existingRefund = await client.query(
      `SELECT * FROM payment_refunds WHERE idempotency_key = $1`,
      [input.idempotencyKey],
    );
    if (existingRefund.rows[0]) {
      await client.query("COMMIT");
      return (await pool.query(`SELECT * FROM payments WHERE id = $1`, [input.paymentId])).rows[0];
    }

    const allocationResult = await client.query(
      `SELECT id, source, amount_usd, refunded_amount_usd
         FROM payment_allocations
        WHERE payment_id = $1 AND status IN ('paid','refunded')
        ORDER BY CASE source WHEN 'wallet' THEN 1 WHEN 'stripe' THEN 2 ELSE 3 END, created_at
        FOR UPDATE`,
      [input.paymentId],
    );
    const refundable = allocationResult.rows.reduce(
      (sum: number, row: any) => sum + Math.max(0, Number(row.amount_usd) - Number(row.refunded_amount_usd)),
      0,
    );
    const requested = round2(input.amountUsd ?? refundable);
    if (!Number.isFinite(requested) || requested <= 0) throw new Error("Refund amount must be positive");
    if (requested > refundable + 0.01) throw new Error("Refund exceeds the refundable payment amount");

    // Plan the exact source split before calling Stripe. This prevents a
    // mixed refund from charging Stripe for money that is being returned to
    // the wallet first.
    let planRemaining = requested;
    const refundPlan = allocationResult.rows.map((allocation: any) => {
      const available = Math.max(0, Number(allocation.amount_usd) - Number(allocation.refunded_amount_usd));
      const refundAmount = Math.min(available, planRemaining);
      planRemaining = round2(planRemaining - refundAmount);
      return { allocation, refundAmount };
    }).filter(({ refundAmount }) => refundAmount > 0);
    if (planRemaining > 0.01) throw new Error("Refund allocation could not be planned");

    const stripeRefundAmount = refundPlan
      .filter(({ allocation }: any) => allocation.source === "stripe")
      .reduce((sum: number, { refundAmount }: any) => sum + refundAmount, 0);
    if (stripeRefundAmount > 0) {
      if (!payment.stripe_payment_id || !input.stripeRefund) {
        throw new Error("Stripe refund provider is unavailable");
      }
      await input.stripeRefund({
        paymentIntentId: payment.stripe_payment_id,
        amountUsd: round2(stripeRefundAmount),
        idempotencyKey: `${input.idempotencyKey}:stripe`,
      });
    }

    const refund = await client.query(
      `INSERT INTO payment_refunds
         (payment_id, amount_usd, status, reason, idempotency_key, processed_at)
       VALUES ($1, $2, 'processed', $3, $4, NOW())
       RETURNING id`,
      [input.paymentId, requested.toFixed(2), input.reason, input.idempotencyKey],
    );

    let remaining = requested;
    for (const { allocation, refundAmount } of refundPlan) {
      if (remaining <= 0) break;

      if (allocation.source === "wallet" || allocation.source === "cash" || allocation.source === "bank_transfer") {
        const walletResult = await client.query(
          `SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE`,
          [payment.patient_id],
        );
        const wallet = walletResult.rows[0];
        if (!wallet) throw new Error("Wallet not found for refund");
        const balanceAfter = round2(Number(wallet.balance) + refundAmount);
        const walletIdempotency = `${input.idempotencyKey}:wallet:${allocation.id}`;
        const walletTx = await client.query(
          `INSERT INTO wallet_transactions
             (wallet_id, user_id, type, status, amount, balance_after, currency,
              description, reference_type, reference_id, idempotency_key, amount_usd)
           VALUES ($1, $2, 'refund', 'completed', $3, $4, 'USD', $5,
                   'appointment_refund', $6, $7, $3)
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING id`,
          [
            wallet.id,
            payment.patient_id,
            refundAmount.toFixed(2),
            balanceAfter.toFixed(2),
            `Refund: ${input.reason}`,
            payment.appointment_id,
            walletIdempotency,
          ],
        );
        if (walletTx.rows[0]) {
          await client.query(
            `UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2`,
            [balanceAfter.toFixed(2), wallet.id],
          );
        }
      }

      const nextRefunded = Number(allocation.refunded_amount_usd) + refundAmount;
      await client.query(
        `UPDATE payment_allocations
            SET refunded_amount_usd = $1,
                status = CASE WHEN $1 >= amount_usd THEN 'refunded' ELSE status END,
                updated_at = NOW()
          WHERE id = $2`,
        [nextRefunded.toFixed(2), allocation.id],
      );
      remaining = round2(remaining - refundAmount);
    }
    if (remaining > 0.01) throw new Error("Refund allocation could not be completed");

    const totals = await client.query(
      `SELECT
          COALESCE(SUM(amount_usd) FILTER (WHERE status IN ('paid','refunded')), 0) AS paid,
          COALESCE(SUM(refunded_amount_usd), 0) AS refunded
         FROM payment_allocations WHERE payment_id = $1`,
      [input.paymentId],
    );
    const paid = Number(totals.rows[0].paid);
    const refunded = Number(totals.rows[0].refunded);
    const next: PaymentState = refunded >= paid && paid > 0 ? "refunded" : "partially_refunded";
    await client.query(
      `UPDATE payments
          SET refunded_amount = $1, updated_at = NOW()
        WHERE id = $2`,
      [round2(refunded).toFixed(2), input.paymentId],
    );
    await transitionOnClient(client, input.paymentId, next, {
      idempotencyKey: `${input.idempotencyKey}:state`,
      metadata: { reason: input.reason, amountUsd: requested, refundId: refund.rows[0].id },
    });
    await client.query("COMMIT");
    return (await pool.query(`SELECT * FROM payments WHERE id = $1`, [input.paymentId])).rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function refundAppointmentPayment(input: {
  paymentId: string;
  amountUsd?: number;
  reason: string;
  idempotencyKey: string;
}) {
  return refundPayment({
    ...input,
    stripeRefund: async ({ paymentIntentId, amountUsd, idempotencyKey }) => {
      const stripe = getStripe();
      if (!stripe) throw new Error("Stripe refund provider is unavailable");
      const refund = await stripe.refunds.create(
        { payment_intent: paymentIntentId, amount: roundToCents(amountUsd) },
        { idempotencyKey },
      );
      return { id: refund.id };
    },
  });
}

export async function recordOfflineReceipt(input: {
  paymentId: string;
  source: "cash" | "bank_transfer";
  idempotencyKey: string;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const paymentResult = await client.query(
      `SELECT * FROM payments WHERE id = $1 FOR UPDATE`,
      [input.paymentId],
    );
    const payment = paymentResult.rows[0];
    if (!payment) throw new Error("Payment aggregate not found");
    if (payment.payment_method !== input.source) {
      throw new Error("Offline receipt source does not match the payment method");
    }
    const remainingAmount = Number(payment.remaining_amount_usd ?? 0);
    if (!Number.isFinite(remainingAmount) || remainingAmount <= 0) {
      await client.query("COMMIT");
      return payment;
    }
    const allocation = await client.query(
      `INSERT INTO payment_allocations
         (payment_id, source, amount_usd, idempotency_key, status, updated_at)
       VALUES ($1, $2, $3, $4, 'paid', NOW())
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [input.paymentId, input.source, round2(remainingAmount).toFixed(2), input.idempotencyKey],
    );
    if (allocation.rows[0]) {
      await client.query(
        `UPDATE payments
            SET paid_amount_usd = paid_amount_usd + $1,
                remaining_amount_usd = 0,
                updated_at = NOW()
          WHERE id = $2`,
        [round2(remainingAmount).toFixed(2), input.paymentId],
      );
    }
    await transitionOnClient(client, input.paymentId, "paid", {
      idempotencyKey: `${input.idempotencyKey}:state`,
      metadata: { source: input.source },
    });
    await client.query("COMMIT");
    return (await pool.query(`SELECT * FROM payments WHERE id = $1`, [input.paymentId])).rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getCanonicalPaymentByAppointment(appointmentId: string) {
  const result = await pool.query(
    `SELECT
       p.*,
       COALESCE(json_agg(DISTINCT pa) FILTER (WHERE pa.id IS NOT NULL), '[]') AS allocations,
       COALESCE(json_agg(DISTINCT pat) FILTER (WHERE pat.id IS NOT NULL), '[]') AS attempts
     FROM payments p
     LEFT JOIN payment_allocations pa ON pa.payment_id = p.id
     LEFT JOIN payment_attempts pat ON pat.payment_id = p.id
    WHERE p.appointment_id = $1
    GROUP BY p.id`,
    [appointmentId],
  );
  return result.rows[0] ?? null;
}