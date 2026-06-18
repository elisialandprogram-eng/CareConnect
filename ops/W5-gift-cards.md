# W5 — Gift Cards: Booking Integration, Expiry Cron & Admin Panel

**Sprint:** P2 — Revenue Completion
**Status:** Complete
**Date:** 2026-06-11

## Scope

1. Allow patients to apply a gift card code at booking to partially or fully pay for an appointment.
2. Auto-expire gift cards past their `expires_at` date via a cron job.
3. Add admin gift-card management routes (list, deactivate, extend, issue).
4. Surface gift-card management in the Revenue Billing Center.

## Changes Delivered

### `server/routes/appointment.routes.ts` — Gift Card at Booking

The booking route now accepts an optional `giftCardCode` in the request body. The redemption block runs immediately after the payment record is created (before wallet deduction):

1. Queries `gift_cards WHERE code = $1 FOR UPDATE` to prevent race conditions.
2. Validates: `is_active = true`, `balance > 0`, not expired.
3. Computes `gcAmountLocal = min(gc.balance, fee)` then converts to USD.
4. Calls `storage.topUpWallet(userId, gcAmountUSD, ...)` — credits the wallet.
5. Updates `gift_cards.balance` and sets `is_active = false` if balance reaches 0.
6. Records `redeemed_by_user_id` and `redeemed_at` on first redemption.
7. The normal wallet-deduction block then uses the credited amount, achieving transparent gift-card payment.
8. All errors are caught as non-fatal warnings — booking succeeds even if the GC lookup fails.

**Idempotency key:** `gc:<gcId>:appt:<apptId>` prevents double-credit if the route is retried.

### `server/reminderCron.ts` — `expireGiftCards()`

New cron function wired into `tickHourly()`:
- Queries `gift_cards WHERE is_active = true AND expires_at < NOW()`.
- Sets `is_active = false` on expired cards in a single UPDATE.
- Logs the count of deactivated cards.

### `server/routes/payment.routes.ts` — Admin Gift Card Routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/gift-cards` | List all cards (last 200, enriched with purchaser/redeemer email) |
| POST | `/api/admin/gift-cards/issue` | Issue a new card with random 16-char code |
| POST | `/api/admin/gift-cards/:id/deactivate` | Deactivate a card immediately |
| POST | `/api/admin/gift-cards/:id/extend` | Extend `expires_at` by N days |

All routes require `admin`, `global_admin`, or `country_admin` role. Issue requires `admin` or `global_admin`.

### `server/db.ts` — Phase 12 Schema Hardening

Three nullable columns added to `gift_cards` via idempotent migrations:
- `recipient_email TEXT` — for admin-issued cards with a known recipient
- `initial_amount NUMERIC(12,2) DEFAULT 0` — for balance history reporting
- `currency TEXT DEFAULT 'USD'` — multi-currency support

`initial_amount` is backfilled from `balance` where currently `0`.

### Revenue Billing Center — Gift Cards tab (W10)

New **Gift Cards** tab added. Admin can:
- View all cards (code, balance, recipient, expiry, active status).
- Issue new cards via an inline form (amount, currency, recipient email, validity days).
- Deactivate cards one-click.

## Testing Notes

1. Create a gift card with code `TESTGC` and balance $50.
2. Book an appointment with `giftCardCode: "TESTGC"` — verify wallet receives credit and GC balance decreases.
3. Check `redeemed_by_user_id` is set on the GC row.
4. Set `expires_at` to yesterday, run hourly tick — verify `is_active` becomes `false`.
5. Try to use an expired card at booking — verify it is silently skipped (booking proceeds without GC credit).
