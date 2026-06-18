# W6 — Package Monetization: Benefit Audit & Usage Tracking

**Sprint:** P2 — Revenue Completion
**Status:** Complete
**Date:** 2026-06-11

## Scope

Ensure all package-benefit value flows are auditable. This workstream consolidates the benefit-logging work from W1/W2 and confirms the full package monetization lifecycle is instrumented.

## Benefit Lifecycle (end-to-end)

| Stage | Where | What happens |
|---|---|---|
| Purchase | `POST /api/patient/packages/:id/purchase` | User package created, price charged from wallet or Stripe |
| Tax application | patient.routes.ts | `getTaxSettingByCountry()` looked up; price multiplied by `(1 + taxRate/100)` |
| Activation | `storage.activateUserPackage()` | Status → `active`, `expires_at` set from `packages.duration_days` |
| Booking discount | `runRevenueEngine()` | Discount amounts computed and stored as snapshot columns on appointment |
| Benefit usage log | appointment.routes.ts | `recordBenefitUsage()` called per benefit key consumed |
| Free cancellation | appointment.routes.ts | `free_cancellations` usage counted and logged before `checkAction()` |
| Expiry | `expireAndNotifyPackages()` | Status → `expired`; notification sent to patient |
| Auto-renewal | `renewExpiredPackages()` | Wallet debited; new `user_packages` row created if `auto_renew = true` |

## Data Model

All benefit audit rows live in `membership_benefit_usage`:

```
user_package_id  — links back to the package subscription
appointment_id   — the booking that consumed the benefit (nullable for non-booking events)
benefit_key      — service_discount_percent / platform_fee_discount / reduced_commission
                   / wallet_bonus / free_cancellations
amount_used      — numeric magnitude (percentage, dollar amount, or count)
notes            — human-readable description of the event
created_at       — automatic timestamp
```

## Revenue Impact

Package monetization contributes to revenue through:
1. **Package subscription fees** — charged at purchase (with tax).
2. **Reduced provider churn** — patients with packages book more frequently.
3. **Commission adjustment** — `reduced_commission` benefit lowers platform cut per booking.
4. **Wallet bonus conversion** — bonus dollars are spent in the platform ecosystem.

## Testing Notes

- Verify `membership_benefit_usage` rows are created after each booking with an active discount package.
- Confirm `free_cancellations` usage count increments and the limit blocks further late cancellations.
- Validate package purchase price includes country tax rate.
- Confirm auto-renewal creates a new `user_packages` row with `status = 'renewed'`.
