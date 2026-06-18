# W7 — Subscription Renewal: Auto-Renew Cron

**Sprint:** P2 — Revenue Completion
**Status:** Complete
**Date:** 2026-06-11

## Scope

Automatically renew patient membership packages when they expire, if the patient opted in to auto-renewal and has sufficient wallet balance.

## Changes Delivered

### `server/reminderCron.ts` — `renewExpiredPackages()`

New async function wired into `tickHourly()` before `expireAndNotifyPackages()`:

**Algorithm:**

1. Query `user_packages` for rows with `status IN ('active', 'grace_period')`, `auto_renew = true`, `expires_at < NOW()`, and `renewal_notified_at IS NULL OR renewal_notified_at < NOW() - 5 minutes` (debounce).
2. For each expired-but-auto-renew package:
   a. Load the parent `packages` row to get `price` and `duration_days`.
   b. Load the patient's wallet balance.
   c. If wallet balance ≥ package price:
      - Debit wallet via `storage.deductFromWallet()`.
      - Create a new `user_packages` row with `status = 'active'` and `expires_at = NOW() + duration_days`.
      - Update the old row: `status = 'renewed'`, `renewal_notified_at = NOW()`.
      - Dispatch a `package.renewed` notification to the patient.
   d. If wallet balance insufficient:
      - Set `renewal_notified_at = NOW()` to prevent repeated retry within the hour.
      - Dispatch a `package.renewal_failed` notification prompting the patient to top up.

**Grace period:** The cron does not consume `grace_period_ends_at`. The grace period is respected by the existing `expireAndNotifyPackages()` logic — auto-renewal fires first, and only if it fails does expiry proceed.

### `server/db.ts` — Phase 12

```sql
ALTER TYPE package_status ADD VALUE IF NOT EXISTS 'renewed';
```

The `renewed` status differentiates auto-renewed (superseded) rows from manually-cancelled rows, which preserves billing history.

## Scheduling

`renewExpiredPackages()` is called at the start of `tickHourly()`, ensuring it runs before `expireAndNotifyPackages()`. This prevents a package from being expired and then immediately renewed in the same tick.

## Testing Notes

1. Create a package with `auto_renew = true`, `expires_at = 1 minute ago`, price $10.
2. Top up the patient wallet to $15.
3. Trigger hourly tick — verify a new `user_packages` row with `status = 'active'` is created and the old row shows `status = 'renewed'`.
4. Repeat with insufficient wallet balance — verify `package.renewal_failed` notification is dispatched and no charge is made.
5. Verify `renewal_notified_at` prevents the same package from being retried within the debounce window.

## Edge Cases

- **Concurrent ticks:** The `renewal_notified_at` debounce and the `status = 'renewed'` write together prevent double-charging in the rare case two ticks overlap.
- **Package deleted:** If the parent `packages` row is deleted between renewal check and debit, the package object lookup returns null and the renewal is silently skipped.
- **Currency:** Package prices are stored in the package's own currency. All wallet amounts are USD. The renewal uses `toUSDSync()` to convert before debiting.
