# W1 — Membership Engine: Free Cancellations & Benefit Logging

**Sprint:** P2 — Revenue Completion
**Status:** Complete
**Date:** 2026-06-11

## Scope

Close two membership-engine gaps that were left open after the initial package engine shipped:

1. **Free-cancellation benefit enforcement** — patients with a `free_cancellations` benefit on their active package must be able to cancel appointments within the late-cancellation window without incurring a policy block.
2. **Benefit usage logging** — every benefit consumed at booking time (service discount, platform-fee discount, reduced commission, wallet bonus) must be written to `membership_benefit_usage` for audit and analytics.

## Changes Delivered

### `server/routes/appointment.routes.ts`

**Free-cancellation check (before `checkAction`):**

- Before calling `checkAction()` the route now calls `storage.getActiveUserPackage(userId)` for `action === "cancel"` requests from patients.
- If the active package has a `free_cancellations` benefit key with `benefitValue > 0`, the code counts existing rows in `membership_benefit_usage` for that package with `benefit_key = 'free_cancellations'`.
- If `usedCount < benefitValue`, `bypassPatientCancelHours: true` is passed to `checkAction()`, waiving the `PATIENT_CANCEL_HOURS_BEFORE` policy gate.
- The usage is immediately written to `membership_benefit_usage` (fire-and-forget with `.catch(()=>{})` so booking never blocks).

**Benefit usage logging (after wallet_bonus fire-and-forget):**

- If `appliedUserPackageId` is set, the route builds an array of applied benefits (service_discount_percent, platform_fee_discount, reduced_commission, wallet_bonus) and calls `storage.recordBenefitUsage()` for each as a fire-and-forget.
- Failures are caught and logged as non-fatal warnings.

### `server/lib/appointmentActions.ts`

- `checkAction()` accepts an optional `bypassPatientCancelHours?: boolean` parameter.
- When `true` and `action === "cancel"` and `actorRole === "patient"`, the `PATIENT_CANCEL_HOURS_BEFORE` guard is skipped.

## Testing Notes

- Book an appointment as a patient, activate a package with `free_cancellations: 2`, then cancel within the no-cancellation window — should succeed twice, fail on the third attempt.
- Check `membership_benefit_usage` rows after booking with a discount package — one row per benefit consumed.
- Without an active package, cancellation behaviour is unchanged.

## Impact

- No schema changes required — `membership_benefit_usage` table already existed.
- All writes are fire-and-forget; booking latency is unaffected.
- Benefit usage data feeds the analytics panel and future usage-cap enforcement.
