---
name: Currency system architecture
description: USD canonical storage with dynamic display conversion — rules for avoiding double-conversion and hardcoded currency bugs.
---

# Currency System Architecture

**Rule:** ALL storage = USD, ALL calculations = USD, ALL display = user/provider preferred currency.

**Why:** Avoids mixed-currency math and double-conversion bugs across HU (HUF), IR (IRR), and GBP users.

**How to apply:**
- Server: use `CurrencyService` in `server/services/currency.ts` — `toUSDSync()` to store, `fromUSDSync()` + `formatSync()` to display.
- Client: use `useCurrency()` from `client/src/lib/currency.ts` — `format(amountInUSD)` for all display. Never roll your own `Intl.NumberFormat` block.
- Never hardcode `$`, `HUF`, `IRR`, `"en-US"`, `"hu-HU"`, or `"fa-IR"` in UI components.
- `provider_wallets.currency` must always be `"USD"` (fixed in `storage.ts` `getOrCreateProviderWallet`).
- `fmtBalance(n, currency)` in `admin-dashboard.tsx` and `fmtUSD(n)` in `provider-operations-console.tsx` are the admin-side formatters — use them, do not add new ones.
- Live rates: fetched hourly by cron (`reminderCron.ts` → `CurrencyService.syncRates()`), stored in `currency_rates` table, served via `GET /api/exchange-rates`, cached client-side by `useLiveRates()`.
- Fallback rates exist in both server (`FALLBACK_RATES`) and client (`CURRENCY_BY_LANG`) so the app always starts.
