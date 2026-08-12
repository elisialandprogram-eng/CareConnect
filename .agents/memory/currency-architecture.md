---
name: Currency system architecture
description: USD canonical storage with dynamic display conversion — rules for avoiding double-conversion and hardcoded currency bugs.
---

# Currency System Architecture

**Rule:** Accounting storage remains USD, but booking pricing is calculated in the provider's native booking currency. For zero-decimal booking currencies (HUF/IRR), truncate booking amounts instead of rounding them upward.

**Why:** The P-FINAL pricing model needs local service-price math before the one-time USD accounting conversion. Rounding fractional HUF/IRR amounts with `Math.round` made values such as 960.5 display and charge as 961.

**How to apply:**
- Server: use `CurrencyService` in `server/services/currency.ts` — `toUSDSync()` to store, `fromUSDSync()` + `formatSync()` to display.
- Client: use `useCurrency()` from `client/src/lib/currency.ts` — `format(amountInUSD)` for all display. Never roll your own `Intl.NumberFormat` block.
- Never hardcode `$`, `HUF`, `IRR`, `"en-US"`, `"hu-HU"`, or `"fa-IR"` in UI components.
- `provider_wallets.currency` must always be `"USD"` (fixed in `storage.ts` `getOrCreateProviderWallet`).
- `fmtBalance(n, currency)` in `admin-dashboard.tsx` and `fmtUSD(n)` in `provider-operations-console.tsx` are the admin-side formatters — use them, do not add new ones.
- Live rates: fetched hourly by cron (`reminderCron.ts` → `CurrencyService.syncRates()`), stored in `currency_rates` table, served via `GET /api/exchange-rates`, cached client-side by `useLiveRates()`.
- Fallback rates exist in both server (`FALLBACK_RATES`) and client (`CURRENCY_BY_LANG`) so the app always starts.
- Use the shared booking-amount rounding helper for all non-tax booking price components and totals; tax has its own zero-decimal truncation rule.
