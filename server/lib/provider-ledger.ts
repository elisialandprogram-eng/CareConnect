/**
 * Canonical provider-ledger movement semantics.
 *
 * `provider_ledger.amount` is already signed:
 *   positive = credit to the provider wallet
 *   negative = debit from the provider wallet
 *
 * Platform-fee and tax rows are audit metadata for the booking settlement.
 * They must not be summed a second time because booking_income already
 * contains the provider's gross payout, including patient-paid tax.
 */

export const PROVIDER_LEDGER_BALANCE_AFFECTING_TYPES = [
  "booking_income",
  "refund_deduction",
  "payout_held",
  "payout_deduction",
  "payout_returned",
  "manual_correction",
  "wallet_adjustment",
  "commission_deduction",
  "cash_platform_fee_deduction",
  "membership_charge",
  "package_charge",
] as const;

export const PROVIDER_LEDGER_INFORMATIONAL_TYPES = [
  "platform_fee_deduction",
  "tax_deduction",
] as const;

export function providerLedgerNetAmount(entryType: string, amount: number): number {
  return (PROVIDER_LEDGER_BALANCE_AFFECTING_TYPES as readonly string[]).includes(entryType)
    ? amount
    : 0;
}

export function providerLedgerTypePlaceholders(startIndex = 1): string {
  return PROVIDER_LEDGER_BALANCE_AFFECTING_TYPES
    .map((_, index) => `$${startIndex + index}`)
    .join(", ");
}