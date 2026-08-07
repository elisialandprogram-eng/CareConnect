import { round2 } from "./math";
import type { PoolClient } from "pg";

export const OFFLINE_PAYMENT_METHODS = new Set(["cash", "bank_transfer"]);

export interface ProviderSettlementInput {
  /** Provider's service share before tax and cash-fee settlement, in booking currency. */
  serviceEarningsLocal: number;
  /** Tax paid by the patient, in booking currency. */
  taxLocal: number;
  /** Platform fee billed to the patient, in booking currency. */
  platformFeeLocal: number;
  paymentMethod: string | null | undefined;
  bookingCurrency: string;
  /** Rates are USD-based: 1 USD = rates[currency] local units. */
  rates: Record<string, number>;
}

export interface ProviderSettlement {
  paymentMethod: string;
  isOffline: boolean;
  serviceEarningsLocal: number;
  taxLocal: number;
  cashPlatformFeeLocal: number;
  grossProviderPayoutLocal: number;
  providerPayoutLocal: number;
  serviceEarningsUsd: number;
  taxPassThroughUsd: number;
  cashPlatformFeeDeductionUsd: number;
  grossProviderPayoutUsd: number;
  providerPayoutUsd: number;
  exchangeRateUsed: number;
}

/**
 * Canonical provider settlement:
 *   gross provider payout = service share + patient-paid tax
 *   online final provider payout = gross provider payout
 *   offline final provider payout = 0 (offline payments never enter the
 *   platform/provider payout wallet)
 *
 * Offline bookings still retain the gross and fee snapshots for audit/reporting,
 * but their settlement amount is deliberately non-withdrawable.
 */
export function calculateProviderSettlement(input: ProviderSettlementInput): ProviderSettlement {
  const paymentMethod = String(input.paymentMethod || "card").toLowerCase();
  const isOffline = OFFLINE_PAYMENT_METHODS.has(paymentMethod);
  const exchangeRateUsed = Number(input.rates[input.bookingCurrency] ?? 1) > 0
    ? Number(input.rates[input.bookingCurrency] ?? 1)
    : 1;

  const serviceEarningsLocal = round2(Math.max(0, Number(input.serviceEarningsLocal) || 0));
  const taxLocal = round2(Math.max(0, Number(input.taxLocal) || 0));
  const cashPlatformFeeLocal = isOffline
    ? round2(Math.max(0, Number(input.platformFeeLocal) || 0))
    : 0;
  const grossProviderPayoutLocal = round2(serviceEarningsLocal + taxLocal);
  const providerPayoutLocal = isOffline
    ? 0
    : grossProviderPayoutLocal;

  const toUsd = (value: number) => round2(value / exchangeRateUsed);
  const serviceEarningsUsd = toUsd(serviceEarningsLocal);
  const taxPassThroughUsd = toUsd(taxLocal);
  const cashPlatformFeeDeductionUsd = toUsd(cashPlatformFeeLocal);
  const grossProviderPayoutUsd = round2(serviceEarningsUsd + taxPassThroughUsd);
  const providerPayoutUsd = isOffline
    ? 0
    : grossProviderPayoutUsd;

  return {
    paymentMethod,
    isOffline,
    serviceEarningsLocal,
    taxLocal,
    cashPlatformFeeLocal,
    grossProviderPayoutLocal,
    providerPayoutLocal,
    serviceEarningsUsd,
    taxPassThroughUsd,
    cashPlatformFeeDeductionUsd,
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
        settlement_amount_usd = GREATEST(
          0,
          COALESCE(gross_provider_payout_usd, provider_earning, 0)
          - COALESCE(cash_platform_fee_applied_usd, 0)
        )
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
  // Offline bookings are direct provider payments, not platform/provider-wallet
  // earnings. Keep the historical fee fields available for audit screens, but
  // never deduct them from a provider wallet during a payout request.
  return {
    totalAppliedUsd: 0,
    earningsCount: 0,
    taxPassThroughUsd: 0,
    grossEligibleUsd: 0,
    earningIds: [],
  };
}