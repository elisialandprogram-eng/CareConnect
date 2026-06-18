# Revenue & Pricing Architecture Finalization Sprint — P-FINAL

**Date:** 2026-06-16  
**Status:** ✅ Complete

---

## Problem Statement

The platform had two conflicting pricing architectures in flight simultaneously:

| Issue | Impact |
|---|---|
| Service prices stored in USD but displayed in local currency via rate conversion | HUF/IRR providers' prices drifted with exchange rates on every booking |
| Revenue engine `patientPayable` was USD; wallet/Stripe used it directly without conversion | Wallet deductions for HU/IR patients were off by the exchange rate (×365 for HUF) |
| No booking/provider/patient currency snapshot on appointments | Financial reports couldn't distinguish local-currency bookings from USD bookings |
| Packages had no fixed local pricing; `pkg.price` in USD converted at runtime | Membership prices fluctuated with exchange rates |
| Multiple places called `getRates()` independently inside the same booking request | Unnecessary DB round-trips; potential rate inconsistency mid-request |
| `applyFeeRule()` silently applied fixed USD fee amounts to HUF/IRR bookings | Fixed fee rules (e.g., $2.00 platform fee) were nonsensical in non-USD contexts |

---

## Architecture After P-FINAL

### Rule 1 — Service prices in provider currency
- `services.currency` column added (TEXT, default `'USD'`)
- Backfilled from `providers.country_code` at migration time (HU→HUF, IR→IRR, else USD)
- New services auto-tagged on creation in `POST /api/provider/services`
- Provider edit dialog (`RequestServiceEditDialog`) now reads/writes raw native-currency values — **no USD round-trip**

### Rule 2 — Booking currency = provider native currency
- `_bookingCurrency = countryCurrency(providerCountry)` — resolved once before the revenue engine call
- `_reRates` fetched once per booking request (before RE); reused for wallet, Stripe, and payment record
- Revenue engine receives `bookingCurrency`, `providerCurrency`, `rates`
- All amounts inside the engine (platformFee, commissionAmount, patientPayable, etc.) are in `bookingCurrency`

### Rule 3 — Fixed fee rules warn and zero-out for non-USD
- `applyFeeRule(rule, base, bookingCurrency)` signature updated
- If `rule.feeType === "fixed"` and `bookingCurrency !== "USD"`: logs a warning, returns 0
- Hybrid rules skip the fixed component but still apply the percentage

### Rule 4 — Wallet processing always in USD
- Wallet balance is held in USD
- Booking route: `walletAppliedUSD = _bookingFeeUSD` (full wallet) or `requestedWalletLocal / _reRate` (partial)
- `remainderDue = _bookingFeeUSD − walletAppliedUSD` (USD, for Stripe)

### Rule 5 — Stripe charge in USD
- `_bookingFeeUSD = reResult.finalTotalUsd` — already correct USD
- `remainderDue` (after wallet) goes to Stripe as-is

### Rule 6 — Currency snapshot on appointments
- Four new columns: `booking_currency`, `provider_currency`, `patient_currency`, `final_total_usd`
- Written fire-and-forget after RE snapshot, alongside revenue shares
- Migration: `runStartupMigrations()` (P-FINAL block in `seedRbacRoles()`)

### Rule 7 — USD equivalent for reporting only
- `RevenueEngineResult.finalTotalUsd` = `patientPayable / rates[bookingCurrency]`
- Used only for Stripe amounts, wallet debits, and the `final_total_usd` snapshot column
- Admin financial reports read `final_total_usd` — never reconstruct from live rates

### Rules 8 & 9 — Fixed local package pricing
- `packages.local_prices JSONB` column added (default `{}`)
- Shape: `{"HUF": 10990, "USD": 29, "IRR": 1250000}`
- `POST /api/patient/packages/:id/purchase` reads `localPrices[userCurrency]` if present
- Falls back to `pkg.price` (USD) with `toUSDSync` conversion if no local price set

---

## Files Changed

| File | Change |
|---|---|
| `server/lib/revenue-engine.ts` | Added `bookingCurrency`/`providerCurrency`/`rates` to input; `finalTotalUsd` to output; updated both `runRevenueEngine` and `runRevenueEngineSync`; `applyFeeRule` signature extended |
| `server/db.ts` | P-FINAL migration block: `services.currency`, 4 appointment currency columns, `packages.local_prices` |
| `server/routes/appointment.routes.ts` | Single `getRates()` call before RE; both RE calls pass currency context; `_feeUSD` from `finalTotalUsd`; wallet uses `_bookingFeeUSD`; currency snapshot write |
| `server/routes/provider.routes.ts` | Service create auto-sets `currency` from provider country |
| `server/routes/patient.routes.ts` | Package purchase reads `localPrices` JSONB; currency-aware price resolution |
| `client/src/components/provider/dashboard/ProviderServicesTab.tsx` | Removed `editFromUSD`/`editToUSD`; service prices displayed/saved as native currency |

---

## Backwards Compatibility

- All existing bookings: `booking_currency`/`final_total_usd` will be NULL (new column); financial reports should treat NULL as USD with `COALESCE(final_total_usd, total_amount)`.
- Existing services: `currency` backfilled to `HUF`/`IRR`/`USD` from provider country on migration.
- No changes to `total_amount` column — still booking currency (was always the case for HU/IR providers, now formally documented).
- Wallet balances: unchanged (USD throughout).

---

## Removed Anti-Patterns

| Old pattern | Replaced by |
|---|---|
| `const _bookingFeeUSD = Number(fee)` (treated patientPayable as USD) | `const _bookingFeeUSD = _feeUSD` (engine-computed USD via `finalTotalUsd`) |
| Duplicate `getRates()` calls in booking route | Single `_reRates` fetch before RE, reused throughout |
| `editFromUSD(service.price)` + `editToUSD(draft.price)` in provider UI | Raw native-currency values read/written directly |
| `pkg.currency || countryCurrency(...)` with `toUSDSync` only | `localPrices[userCurrency] ?? pkg.price` with currency tracking |
