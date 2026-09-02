import { round2, roundBookingAmount } from "./math";
import { allocateRoundedCurrencyAmounts } from "@shared/currency";
import type { PoolClient } from "pg";

export const OFFLINE_PAYMENT_METHODS = new Set(["cash", "bank_transfer"]);

export interface ProviderSettlementInput {
  /** Canonical provider net earnings from the immutable booking snapshot. */
  providerNetEarningsLocal: number;
  /** Service tax passed through to the provider, kept separate from platform tax. */
  serviceTaxLocal: number;
  /** Platform fee billed to the patient, in booking currency. */
  platformFeeLocal: number;
  /** Platform tax billed to the patient, in booking currency. */
  platformTaxLocal?: number;
  /** Provider-side commission frozen on the booking, in booking currency. */
  commissionLocal?: number;
  paymentMethod: string | null | undefined;
  bookingCurrency: string;
  /** Rates are USD-based: 1 USD = rates[currency] local units. */
  rates: Record<string, number>;
}

export interface ProviderSettlement {
  paymentMethod: string;
  isOffline: boolean;
  providerNetEarningsLocal: number;
  serviceTaxLocal: number;
  cashPlatformFeeLocal: number;
  grossProviderPayoutLocal: number;
  providerPayoutLocal: number;
  providerNetEarningsUsd: number;
  serviceTaxPassThroughUsd: number;
  cashPlatformFeeDeductionUsd: number;
  cashPlatformTaxDeductionUsd: number;
  cashCommissionDeductionUsd: number;
  grossProviderPayoutUsd: number;
  providerPayoutUsd: number;
  exchangeRateUsed: number;
}

/**
 * Canonical provider settlement:
 *   provider payout base = canonical provider net earnings
 *   online final provider payout = gross provider payout
 *   offline final provider payout = 0 (offline payments never create wallet
 *   income; their platform fee, platform tax, and commission debit the wallet)
 *
 * Offline bookings still retain the gross and settlement snapshots for
 * audit/reporting, but their settlement amount is deliberately non-withdrawable.
 */
export function calculateProviderSettlement(input: ProviderSettlementInput): ProviderSettlement {
  const paymentMethod = String(input.paymentMethod || "card").toLowerCase();
  const isOffline = OFFLINE_PAYMENT_METHODS.has(paymentMethod);
  const exchangeRateUsed = Number(input.rates[input.bookingCurrency] ?? 1) > 0
    ? Number(input.rates[input.bookingCurrency] ?? 1)
    : 1;

  const roundLocal = (value: number) => roundBookingAmount(value, input.bookingCurrency);
  const providerNetEarningsLocal = roundLocal(Math.max(0, Number(input.providerNetEarningsLocal) || 0));
  const serviceTaxLocal = roundLocal(Math.max(0, Number(input.serviceTaxLocal) || 0));
  const platformFeeLocal = roundLocal(Math.max(0, Number(input.platformFeeLocal) || 0));
  const platformTaxLocal = roundLocal(Math.max(0, Number(input.platformTaxLocal ?? 0) || 0));
  const commissionLocal = roundLocal(Math.max(0, Number(input.commissionLocal ?? 0) || 0));
  const cashPlatformFeeLocal = isOffline ? platformFeeLocal : 0;
  const cashPlatformTaxLocal = isOffline ? platformTaxLocal : 0;
  const cashCommissionLocal = isOffline ? commissionLocal : 0;
  const grossProviderPayoutLocal = providerNetEarningsLocal;
  const providerPayoutLocal = isOffline
    ? 0
    : grossProviderPayoutLocal;

  const usdParts = allocateRoundedCurrencyAmounts(
    [
      providerNetEarningsLocal / exchangeRateUsed,
      serviceTaxLocal / exchangeRateUsed,
      cashPlatformFeeLocal / exchangeRateUsed,
      cashPlatformTaxLocal / exchangeRateUsed,
      cashCommissionLocal / exchangeRateUsed,
    ],
    "USD",
    (
      providerNetEarningsLocal +
      serviceTaxLocal +
      cashPlatformFeeLocal +
      cashPlatformTaxLocal +
      cashCommissionLocal
    ) / exchangeRateUsed,
  );
  const [
    providerNetEarningsUsd,
    serviceTaxPassThroughUsd,
    cashPlatformFeeDeductionUsd,
    cashPlatformTaxDeductionUsd,
    cashCommissionDeductionUsd,
  ] = usdParts;
  const grossProviderPayoutUsd = round2(providerNetEarningsLocal / exchangeRateUsed);
  const providerPayoutUsd = isOffline
    ? 0
    : grossProviderPayoutUsd;

  return {
    paymentMethod,
    isOffline,
    providerNetEarningsLocal,
    serviceTaxLocal,
    cashPlatformFeeLocal,
    grossProviderPayoutLocal,
    providerPayoutLocal,
    providerNetEarningsUsd,
    serviceTaxPassThroughUsd,
    cashPlatformFeeDeductionUsd,
    cashPlatformTaxDeductionUsd,
    cashCommissionDeductionUsd,
    grossProviderPayoutUsd,
    providerPayoutUsd,
    exchangeRateUsed,
  };
}

export interface CashFeeApplication {
  totalAppliedUsd: number;
  earningsCount: number;
  taxPassThroughUsd: number;
  grossEligibleUsd: number;
  earningIds: string[];
}

export interface OfflineSettlementReversalInput {
  appointmentId: string;
  refundId: string;
  cashRefundedToDateUsd: number;
  cashAllocationAmountUsd: number;
  actorId?: string | null;
}

/**
 * Reverse the portion of an already-applied offline settlement that belongs
 * to a cash/bank-transfer refund. The refund service calls this inside its
 * existing transaction, so the patient credit and provider-wallet reversal
 * commit or roll back together.
 *
 * The original deduction columns remain immutable audit snapshots. Separate
 * reversed columns plus idempotent ledger references track the net obligation.
 */
export async function reverseOfflineSettlement(
  client: PoolClient,
  input: OfflineSettlementReversalInput,
): Promise<number> {
  const cashRefundedToDateUsd = Math.max(0, Number(input.cashRefundedToDateUsd) || 0);
  const cashAllocationAmountUsd = Math.max(0, Number(input.cashAllocationAmountUsd) || 0);
  if (cashRefundedToDateUsd <= 0 || cashAllocationAmountUsd <= 0) return 0;

  const earningResult = await client.query(`
    SELECT
      pe.id,
      pe.provider_id,
      pe.cash_platform_fee_deduction_usd,
      pe.cash_platform_tax_deduction_usd,
      pe.cash_commission_deduction_usd,
      pe.cash_platform_fee_reversed_usd,
      pe.cash_platform_tax_reversed_usd,
      pe.cash_commission_reversed_usd,
      pe.cash_wallet_debit_reversed_usd,
      a.payment_method AS appointment_payment_method,
      p.country_code
    FROM provider_earnings pe
    JOIN appointments a ON a.id = pe.appointment_id
    JOIN providers p ON p.id = pe.provider_id
    WHERE pe.appointment_id = $1
      AND COALESCE(NULLIF(pe.payment_method, ''), a.payment_method, '') IN ('cash', 'bank_transfer')
    LIMIT 1
    FOR UPDATE OF pe
  `, [input.appointmentId]);
  const earning = earningResult.rows[0];
  if (!earning) return 0;

  const fraction = Math.min(1, cashRefundedToDateUsd / cashAllocationAmountUsd);
  const targets = {
    platformFee: round2(Math.max(0, Number(earning.cash_platform_fee_deduction_usd || 0)) * fraction),
    platformTax: round2(Math.max(0, Number(earning.cash_platform_tax_deduction_usd || 0)) * fraction),
    commission: round2(Math.max(0, Number(earning.cash_commission_deduction_usd || 0)) * fraction),
  };
  const alreadyReversed = {
    platformFee: Math.max(0, Number(earning.cash_platform_fee_reversed_usd || 0)),
    platformTax: Math.max(0, Number(earning.cash_platform_tax_reversed_usd || 0)),
    commission: Math.max(0, Number(earning.cash_commission_reversed_usd || 0)),
  };
  const reversals = {
    platformFee: round2(Math.max(0, targets.platformFee - alreadyReversed.platformFee)),
    platformTax: round2(Math.max(0, targets.platformTax - alreadyReversed.platformTax)),
    commission: round2(Math.max(0, targets.commission - alreadyReversed.commission)),
  };
  const platformReversal = round2(reversals.platformFee + reversals.platformTax);
  const totalReversal = round2(platformReversal + reversals.commission);
  if (totalReversal <= 0) return 0;

  await client.query(`
    INSERT INTO provider_wallets (provider_id, available_balance, lifetime_earnings, currency, country_code)
    VALUES ($1, 0, 0, 'USD', COALESCE($2, 'HU'))
    ON CONFLICT (provider_id) DO NOTHING
  `, [earning.provider_id, earning.country_code]);
  await client.query(
    `SELECT provider_id FROM provider_wallets WHERE provider_id = $1 FOR UPDATE`,
    [earning.provider_id],
  );
  await client.query(`
    UPDATE provider_wallets
       SET available_balance = available_balance + $1,
           updated_at = NOW()
     WHERE provider_id = $2
  `, [totalReversal, earning.provider_id]);

  const platformReference = `${input.appointmentId}:cash-refund:${input.refundId}:platform`;
  const commissionReference = `${input.appointmentId}:cash-refund:${input.refundId}:commission`;
  if (platformReversal > 0) {
    const wallet = await client.query(
      `SELECT available_balance FROM provider_wallets WHERE provider_id = $1`,
      [earning.provider_id],
    );
    await client.query(`
      INSERT INTO provider_ledger
        (provider_id, amount, entry_type, reference_id, description, actor_id, balance_after, country_code)
      VALUES ($1, $2, 'cash_platform_fee_reversal', $3, $4, $5, $6, $7)
      ON CONFLICT DO NOTHING
    `, [
      earning.provider_id,
      platformReversal,
      platformReference,
      `Cash refund reversal — platform fee + tax for appt #${input.appointmentId}`,
      input.actorId ?? null,
      wallet.rows[0]?.available_balance ?? 0,
      earning.country_code ?? "HU",
    ]);
  }
  if (reversals.commission > 0) {
    const wallet = await client.query(
      `SELECT available_balance FROM provider_wallets WHERE provider_id = $1`,
      [earning.provider_id],
    );
    await client.query(`
      INSERT INTO provider_ledger
        (provider_id, amount, entry_type, reference_id, description, actor_id, balance_after, country_code)
      VALUES ($1, $2, 'commission_reversal', $3, $4, $5, $6, $7)
      ON CONFLICT DO NOTHING
    `, [
      earning.provider_id,
      reversals.commission,
      commissionReference,
      `Cash refund reversal — commission for appt #${input.appointmentId}`,
      input.actorId ?? null,
      wallet.rows[0]?.available_balance ?? 0,
      earning.country_code ?? "HU",
    ]);
  }

  await client.query(`
    UPDATE provider_earnings
       SET cash_platform_fee_reversed_usd = GREATEST(COALESCE(cash_platform_fee_reversed_usd, 0), $1),
           cash_platform_tax_reversed_usd = GREATEST(COALESCE(cash_platform_tax_reversed_usd, 0), $2),
           cash_commission_reversed_usd = GREATEST(COALESCE(cash_commission_reversed_usd, 0), $3),
           cash_wallet_debit_reversed_usd = GREATEST(COALESCE(cash_wallet_debit_reversed_usd, 0), $4)
     WHERE id = $5
  `, [
    targets.platformFee,
    targets.platformTax,
    targets.commission,
    round2(targets.platformFee + targets.platformTax + targets.commission),
    earning.id,
  ]);

  return totalReversal;
}

/** Attach the idempotently applied cash-fee rows to the payout request that
 * caused the debit and persist the final per-earning settlement snapshot. */
export async function linkCashFeeDeductionsToPayout(
  client: PoolClient,
  earningIds: string[],
  payoutRequestId: string,
): Promise<void> {
  if (earningIds.length === 0) return;
  await client.query(`
    UPDATE provider_earnings
    SET cash_platform_fee_payout_request_id = $1,
        cash_platform_fee_applied_at = COALESCE(cash_platform_fee_applied_at, NOW()),
        settlement_amount_usd = 0
    WHERE id = ANY($2::varchar[])
  `, [payoutRequestId, earningIds]);
}

/**
 * Applies any unapplied offline platform-fee snapshots for a provider.
 *
 * Call this inside an existing transaction after locking provider_wallets.
 * The provider earning row is the idempotency record; the ledger reference is
 * the appointment id, so retries cannot create a second debit.
 */
export async function applyPendingCashFeeDeductions(
  client: PoolClient,
  providerId: string,
  actorId?: string | null,
  earningId?: string,
): Promise<CashFeeApplication> {
  // New cash receipts are normally settled by recordProviderEarning in the
  // receipt transaction. This is the recovery path for older/partial rows
  // that have the immutable obligation but were never debited. It runs after
  // the caller locks provider_wallets and locks each earning row below.
  const pending = await client.query(`
    SELECT
      pe.id,
      pe.appointment_id,
      COALESCE(a.appointment_number, pe.appointment_id) AS appointment_number,
      COALESCE(pe.tax_pass_through_amount_usd, 0)::numeric AS tax_pass_through_usd,
      COALESCE(pe.gross_provider_payout_usd, pe.provider_earning, 0)::numeric AS gross_provider_payout_usd,
      COALESCE(pe.cash_platform_fee_deduction_usd, 0)::numeric AS platform_fee_usd,
      COALESCE(pe.cash_platform_tax_deduction_usd, 0)::numeric AS platform_tax_usd,
      COALESCE(pe.cash_commission_deduction_usd, 0)::numeric AS commission_usd,
      COALESCE(pe.cash_platform_fee_applied_usd, 0)::numeric AS fee_applied_usd,
      COALESCE(pe.cash_wallet_debit_applied_usd, 0)::numeric AS wallet_debit_applied_usd
    FROM provider_earnings pe
    LEFT JOIN appointments a ON a.id = pe.appointment_id
    WHERE pe.provider_id = $1
      AND ($2::varchar IS NULL OR pe.id = $2)
      AND COALESCE(NULLIF(LOWER(pe.payment_method), ''), NULLIF(LOWER(a.payment_method), ''), '')
            IN ('cash', 'bank_transfer')
      AND COALESCE(pe.cash_wallet_debit_applied_usd, 0) <= 0
      AND (
        COALESCE(pe.cash_platform_fee_deduction_usd, 0) > 0
        OR COALESCE(pe.cash_platform_tax_deduction_usd, 0) > 0
        OR COALESCE(pe.cash_commission_deduction_usd, 0) > 0
      )
    ORDER BY pe.created_at ASC
    FOR UPDATE OF pe
  `, [providerId, earningId ?? null]);

  if (pending.rows.length === 0) {
    return {
      totalAppliedUsd: 0,
      earningsCount: 0,
      taxPassThroughUsd: 0,
      grossEligibleUsd: 0,
      earningIds: [],
    };
  }

  await client.query(`
    INSERT INTO provider_wallets (provider_id, available_balance, lifetime_earnings, currency, country_code)
    SELECT $1, 0, 0, 'USD', COALESCE(country_code::text, 'HU')
    FROM providers
    WHERE id = $1
    ON CONFLICT (provider_id) DO NOTHING
  `, [providerId]);
  await client.query(
    `SELECT provider_id FROM provider_wallets WHERE provider_id = $1 FOR UPDATE`,
    [providerId],
  );

  let totalAppliedUsd = 0;
  let taxPassThroughUsd = 0;
  let grossEligibleUsd = 0;
  const appliedEarningIds: string[] = [];

  for (const row of pending.rows) {
    const platformFeeUsd = Math.max(0, Number(row.platform_fee_usd || 0));
    const platformTaxUsd = Math.max(0, Number(row.platform_tax_usd || 0));
    const commissionUsd = Math.max(0, Number(row.commission_usd || 0));
    const previouslyAppliedFeeUsd = Math.min(
      platformFeeUsd,
      Math.max(0, Number(row.fee_applied_usd || 0)),
    );

    // A platform ledger row means the receipt path already debited the
    // combined platform fee and platform tax. The commission has its own
    // ledger type and is checked independently.
    const existingLedger = await client.query(`
      SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'cash_platform_fee_deduction'
                          THEN ABS(amount::numeric) ELSE 0 END), 0) AS platform_applied_usd,
        COALESCE(SUM(CASE WHEN entry_type = 'commission_deduction'
                          THEN ABS(amount::numeric) ELSE 0 END), 0) AS commission_applied_usd
      FROM provider_ledger
      WHERE provider_id = $1
        AND reference_id = $2
        AND entry_type IN ('cash_platform_fee_deduction', 'commission_deduction')
    `, [providerId, row.appointment_id]);
    const platformLedgerAppliedUsd = Number(existingLedger.rows[0]?.platform_applied_usd || 0);
    const commissionLedgerAppliedUsd = Number(existingLedger.rows[0]?.commission_applied_usd || 0);

    const outstandingPlatformFeeUsd = platformLedgerAppliedUsd > 0.005
      ? 0
      : Math.max(0, platformFeeUsd - previouslyAppliedFeeUsd);
    const outstandingPlatformTaxUsd = platformLedgerAppliedUsd > 0.005 ? 0 : platformTaxUsd;
    const outstandingCommissionUsd = Math.max(
      0,
      commissionUsd - commissionLedgerAppliedUsd,
    );
    const platformObligationUsd = round2(outstandingPlatformFeeUsd + outstandingPlatformTaxUsd);
    const commissionDebitUsd = round2(outstandingCommissionUsd);
    const appliedUsd = round2(platformObligationUsd + commissionDebitUsd);

    if (platformObligationUsd > 0) {
      const wallet = await client.query(`
        UPDATE provider_wallets
        SET available_balance = available_balance - $1,
            updated_at = NOW()
        WHERE provider_id = $2
        RETURNING available_balance
      `, [platformObligationUsd, providerId]);
      await client.query(`
        INSERT INTO provider_ledger
          (provider_id, amount, entry_type, reference_id, description, actor_id, balance_after, country_code)
        SELECT $1, $2, 'cash_platform_fee_deduction', $3,
               $4, $6, $5, COALESCE(country_code, 'HU')
        FROM provider_wallets
        WHERE provider_id = $1
      `, [
        providerId,
        -platformObligationUsd,
        row.appointment_id,
        `Cash settlement deduction — appt #${row.appointment_number} (platform fee + tax)`,
        wallet.rows[0]?.available_balance ?? 0,
        actorId ?? null,
      ]);
    }

    if (commissionDebitUsd > 0) {
      const wallet = await client.query(`
        UPDATE provider_wallets
        SET available_balance = available_balance - $1,
            updated_at = NOW()
        WHERE provider_id = $2
        RETURNING available_balance
      `, [commissionDebitUsd, providerId]);
      await client.query(`
        INSERT INTO provider_ledger
          (provider_id, amount, entry_type, reference_id, description, actor_id, balance_after, country_code)
        SELECT $1, $2, 'commission_deduction', $3,
               $4, $6, $5, COALESCE(country_code, 'HU')
        FROM provider_wallets
        WHERE provider_id = $1
      `, [
        providerId,
        -commissionDebitUsd,
        row.appointment_id,
        `Cash settlement deduction — appt #${row.appointment_number} (commission)`,
        wallet.rows[0]?.available_balance ?? 0,
        actorId ?? null,
      ]);
    }

    // Keep the legacy fee-applied field component-based for admin reporting,
    // while the wallet-debit field is the authoritative total idempotency mark.
    const totalObligationUsd = round2(platformFeeUsd + platformTaxUsd + commissionUsd);
    await client.query(`
      UPDATE provider_earnings
      SET cash_platform_fee_applied_usd = GREATEST(
            COALESCE(cash_platform_fee_applied_usd, 0),
            COALESCE(cash_platform_fee_deduction_usd, 0)
          ),
          cash_wallet_debit_applied_usd = GREATEST(
            COALESCE(cash_wallet_debit_applied_usd, 0), $1
          ),
          cash_platform_fee_applied_at = COALESCE(cash_platform_fee_applied_at, NOW()),
          settlement_amount_usd = 0
      WHERE id = $2
    `, [totalObligationUsd, row.id]);

    if (appliedUsd > 0) {
      totalAppliedUsd = round2(totalAppliedUsd + appliedUsd);
      appliedEarningIds.push(row.id);
    }
    taxPassThroughUsd = round2(taxPassThroughUsd + Number(row.tax_pass_through_usd || 0));
    grossEligibleUsd = round2(grossEligibleUsd + Number(row.gross_provider_payout_usd || 0));
  }

  return {
    totalAppliedUsd,
    earningsCount: appliedEarningIds.length,
    taxPassThroughUsd,
    grossEligibleUsd,
    earningIds: appliedEarningIds,
  };
}