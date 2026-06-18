# W9 — Revenue Rule Priority: Gift Card + Wallet Stacking

**Sprint:** P2 — Revenue Completion
**Status:** Complete
**Date:** 2026-06-11

## Scope

Define and implement the precedence order when multiple payment sources are available at booking time, specifically addressing the interaction between gift cards and wallet credits.

## Priority Order (Highest → Lowest)

| Priority | Source | Handled by |
|---|---|---|
| 1 | Gift card (partial/full) | W5 gift-card block in appointment.routes.ts |
| 2 | Wallet balance (patient) | Existing wallet-deduction block |
| 3 | Stripe (card payment) | Existing Stripe checkout creation |
| 4 | Cash / bank transfer | Existing offline payment path |

## Implementation

The gift-card block runs **before** the wallet block. When a gift card is applied:

1. GC credit is deposited into the patient wallet via `storage.topUpWallet()`.
2. The wallet block then deducts the total fee (including the GC-credited portion) from the wallet.

This means the effective payment flow is:
- Gift card → wallet top-up → wallet deduction → (optional) Stripe for remainder

**Example:**
- Booking fee: $60
- Gift card balance: $40
- Patient wallet balance: $30

Flow:
1. GC top-up: wallet goes from $30 → $70
2. Wallet deduction: wallet goes from $70 → $10
3. No Stripe payment required — full $60 covered.

If the patient's wallet + GC credit still doesn't cover the fee, the remainder falls through to Stripe checkout or cash depending on `paymentMethod`.

## Gift Card Partial Redemption

If the gift card balance exceeds the booking fee, only the booking fee is credited to the wallet. The remaining GC balance is preserved in `gift_cards.balance` for future use. The card is only deactivated when its balance reaches exactly 0.

## Idempotency

All GC wallet credits use the idempotency key `gc:<gcId>:appt:<apptId>`. If the booking route is retried (e.g. after a timeout), the second wallet top-up is rejected as a duplicate and the GC balance is not decremented a second time.

## Testing Notes

1. GC covers full fee: GC balance > fee → wallet ends at (original balance) after deduction. GC balance = (original - fee).
2. GC covers partial fee: GC balance < fee → wallet is used for remainder, Stripe for any further gap.
3. Retry scenario: call booking route twice with the same `giftCardCode` and `appointmentId` — verify GC is only debited once.
4. Expired GC: set `expires_at` in the past — verify GC block is silently skipped and booking proceeds normally.
