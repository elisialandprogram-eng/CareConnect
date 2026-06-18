# W2 — Discount Integration: Membership Benefit Audit Trail

**Sprint:** P2 — Revenue Completion
**Status:** Complete
**Date:** 2026-06-11

## Scope

Ensure every discount applied via a membership package is traceable in the `membership_benefit_usage` table. This is the audit counterpart to W1's free-cancellation enforcement.

## Background

The Revenue Engine (`runRevenueEngine()`) already computes `membershipDiscountInput` at booking time and stores the net amounts on the `appointments` row. However, the individual benefit types that contributed to those amounts were never written to `membership_benefit_usage`, making it impossible to:

- Audit which benefit key was responsible for a discount.
- Cap per-period benefit usage (e.g. max 5 service-discount uses per month).
- Surface per-patient benefit history in the admin console.

## Changes Delivered

All changes live in `server/routes/appointment.routes.ts`, in the post-booking block that fires after wallet operations:

| Benefit Key | Trigger condition | `amountUsed` stored |
|---|---|---|
| `service_discount_percent` | `membershipDiscountInput.serviceDiscountPercent > 0` | Discount percentage |
| `platform_fee_discount` | `membershipDiscountInput.platformFeeDiscount > 0` | Fee discount percentage |
| `reduced_commission` | `membershipReducedCommission > 0` | Commission reduction % |
| `wallet_bonus` | `pendingWalletBonus > 0` | Bonus amount in USD |

Each row is written via `storage.recordBenefitUsage()` with:
- `userPackageId` — the package that supplied the benefit
- `appointmentId` — the booking that consumed it
- `benefitKey` — one of the four keys above
- `amountUsed` — the magnitude of the benefit applied
- `notes` — human-readable description

All writes are fire-and-forget so booking latency is never affected.

## Testing Notes

- Purchase a package with a 20% service discount + $5 wallet bonus, then book an appointment.
- Query `SELECT * FROM membership_benefit_usage WHERE appointment_id = '<id>'` — should see two rows.
- Verify `amount_used` values match what was applied in the booking.

## Impact

- No schema changes — `membership_benefit_usage` table already existed with the correct columns.
- Enables future per-period usage caps without further schema work.
