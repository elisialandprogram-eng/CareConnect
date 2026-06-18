---
name: Provider earnings double-conversion bug
description: appointment.total_amount is already in USD; calling toUSDSync on it corrupts provider_earnings and provider_wallets
---

## The rule
`appointment.total_amount` is ALWAYS stored in USD (canonical currency).  
`computeFinalPrice()` defaults `currency` to "USD" and never applies local-currency conversion before writing `total_amount`.

**Never** call `toUSDSync(appt.totalAmount, localCurrency, rates)` in `recordProviderEarning()` or any similar helper — this divides an already-USD value by the local exchange rate.

**Why:**  
For a HU appointment (countryCode="HU"), `countryCurrency("HU")` returns "HUF" (rate≈365).  
`toUSDSync(13.70, "HUF", rates) = 13.70 / 365 = 0.0375 ≈ 0.04` — corrupting provider_earnings, provider_wallets, and provider_ledger with a value 365× too small.

**How to apply:**  
In `recordProviderEarning()`, use `totalAmount` directly as the USD value.  
Compute `displayAmountLocal = providerEarning * rateVal` for the local-currency display reference stored in `provider_earnings.display_amount`.

## Data repair
Existing corrupted records can be corrected via:
- `GET  /api/admin/financial/repair-earnings/preview` — shows affected rows and delta (safe, read-only)
- `POST /api/admin/financial/repair-earnings/apply`   — applies correction in a transaction (global_admin only)

The repair recalculates `provider_earnings.{total_amount, platform_fee, provider_earning}` from the source-of-truth `appointments.total_amount`, then recalculates `provider_wallets.{available_balance, lifetime_earnings}`.
