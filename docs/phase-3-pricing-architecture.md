# Phase 3 — Canonical Pricing and Booking Financial Contract

## Authority

`runRevenueEngine()` in `server/lib/revenue-engine.ts` is the only booking
pricing authority. It delegates base arithmetic to the private pricing kernel
and resolves platform fees, commissions, payment adjustments, travel fees,
revenue shares, currencies, and USD reporting values in one result.

Tax is resolved by `server/lib/tax-engine.ts` and is calculated during the
engine pass only. The result includes the tax amount, taxable subtotal, and
engine/tax versions.

## Booking lifecycle

1. Service selection and quote call the revenue engine.
2. Booking confirmation calls the revenue engine once with the final booking
   inputs.
3. The appointment stores the complete `pricing_breakdown`, local booking
   amounts, USD reporting amount, currency context, rule audit, engine
   versions, and calculation timestamp.
4. Payment, settlement, wallet, ledger, notifications, email, and invoice
   consumers read those stored values.
5. Cancellation and refund flows use the original appointment/payment
   snapshot; they do not call the pricing engine again.

## Immutability

`appointments_pricing_snapshot_immutable` is installed by the startup
migration. Once `pricing_calculated_at` is set, changes to totals, fees,
discounts, taxes, the breakdown, earnings, currencies, exchange-rate display
fields, or version metadata are rejected by PostgreSQL. Operational fields
such as status, scheduling, payment status, and refund status remain mutable.

## Removed duplicate calculations

- Invoice generation no longer loads live service or tax settings and no
  longer calls the pricing kernel. It reads the stored tax and total.
- Booking promo eligibility uses the revenue-engine pre-promo helper instead
  of calling the pricing kernel directly.
- Catalog pricing quotes already use the revenue engine for their returned
  breakdown and now use the same helper for promo minimum validation.

The private pricing kernel remains inside the revenue engine because it is the
engine's implementation detail, not a second public pricing authority.

## Currency contract

Booking/display values use the booking currency captured at confirmation.
`final_total_usd` is the one booking-time USD reporting conversion used for
payment and reporting. Provider wallet and ledger records remain USD; local
appointment values are not converted again after confirmation.