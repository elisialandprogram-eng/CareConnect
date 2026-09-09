---
name: Provider wallet system
description: Design decisions for provider_wallets + provider_ledger — balance semantics, trigger points, two-flow reconciliation, and migration pattern.
---

## Core tables
- `provider_wallets` — one row per provider, denormalized balance snapshot for fast reads
- `provider_ledger` — append-only event log; every credit/debit is a row

## Balance semantics
- `available_balance` — what the provider can withdraw right now (pending earnings − in-flight payout requests)
- `held_balance` — sum of pending/approved payout request amounts
- `lifetime_earnings` — cumulative total ever credited (never decremented)
- `pending_balance` — reserved for future settlement-period holds (currently 0)
- Stripe provider wallet top-ups increase `available_balance` and are withdrawable, but do not increase `lifetime_earnings`; they are tracked separately for payment idempotency.

## Trigger points (where wallet is updated)
1. `recordProviderEarning()` in storage.ts → +available_balance, +lifetime_earnings; ledger: `booking_income`, `platform_fee_deduction`, `tax_deduction`
2. `markEarningPaid()` in storage.ts → −available_balance; ledger: `payout_deduction`
3. `POST /api/provider/payout-requests` → −available_balance, +held_balance; ledger: `payout_held`
4. `PATCH /api/admin/payout-requests/:id` status=paid → −held_balance, update last_payout_date; ledger: `payout_deduction`
5. `PATCH /api/admin/payout-requests/:id` status=rejected → −held_balance, +available_balance; ledger: `payout_returned`
6. `DELETE /api/provider/payout-requests/:id` (cancel) → −held_balance, +available_balance; ledger: `payout_returned`
7. `POST /api/admin/provider-wallets/:id/adjust` → ±available_balance; ledger: `manual_correction` or custom type
8. Verified Stripe `provider_wallet_topup` webhook → +available_balance only; separate top-up record and ledger entry, idempotent by Checkout session

## Two-flow reconciliation
The existing system has two parallel payout flows:
- Flow 1: Admin marks individual earnings as "paid" via `/api/admin/financial/providers/:id/mark-paid`
- Flow 2: Provider submits payout request → admin approves/pays via `/api/admin/payout-requests/:id`

**Why:** Both flows existed before wallets were added. Both now update the wallet correctly. In practice, a provider uses one or the other, not both for the same earnings — so double-deduction shouldn't occur. `GREATEST(0, ...)` guards against going negative in edge cases.

## Migration pattern
New provider wallet migrations are placed in their OWN try-catch block AFTER the main migration try-catch block in `runStartupMigrations()`. This is intentional — the main block has many legacy migrations and a failure there is expected (warning). The wallet block logs separately so failures are clearly attributed.

## Backfill
On first boot (via `ON CONFLICT (provider_id) DO NOTHING`), existing providers get wallets backfilled from `provider_earnings` + `payout_requests`. Idempotent — safe to run on every boot.

## Frontend
- `ProviderWalletPanel` at `client/src/components/provider-wallet-panel.tsx` — balance cards, recharts bar chart (monthly), ledger table, this-month breakdown
- Shown at top of provider dashboard "payouts" tab, above the existing `ProviderPayoutPanel`
- Cancel button for pending payout requests added to `ProviderPayoutPanel`
- Admin: `AdminProviderWalletsPanel` inline in `admin-dashboard.tsx` — searchable table with freeze/unfreeze + manual adjustment dialog; tab value "provider-wallets"

## API routes added
Provider:
- `GET /api/provider/wallet` — own wallet snapshot
- `GET /api/provider/wallet/ledger` — paginated ledger
- `GET /api/provider/wallet/monthly` — 12-month earnings chart data
- `GET /api/provider/wallet/breakdown` — this-month fee/tax breakdown
- `DELETE /api/provider/payout-requests/:id` — cancel pending request

Admin:
- `GET /api/admin/provider-wallets` — list all wallets (searchable, paginated)
- `GET /api/admin/provider-wallets/:providerId` — wallet + ledger
- `POST /api/admin/provider-wallets/:providerId/adjust` — manual adjustment
- `PATCH /api/admin/provider-wallets/:providerId/freeze` — freeze/unfreeze
