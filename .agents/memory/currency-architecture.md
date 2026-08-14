---
name: Currency system architecture
description: USD canonical storage with dynamic display conversion — rules for avoiding double-conversion and hardcoded currency bugs.
---

# Currency System Architecture

**Rule:** Accounting storage remains USD, but booking pricing is calculated in the provider's native booking currency. HUF, IRR, JPY, and KRW are zero-decimal currencies and use canonical half-up rounding at monetary boundaries.

**Why:** The payment contract requires the same amount in tax, totals, refunds, earnings, wallet ledgers, settlements, and displays; truncation or independent formatters caused charges and visible amounts to diverge.

**How to apply:**
- Server: use `CurrencyService` in `server/services/currency.ts` — `toUSDSync()` to store, `fromUSDSync()` + `formatSync()` to display.
- Client: use `useCurrency()` from `client/src/lib/currency.ts` — `format(amountInUSD)` for all display. Never roll your own `Intl.NumberFormat` block.
- Never hardcode `$`, `HUF`, `IRR`, `"en-US"`, `"hu-HU"`, or `"fa-IR"` in UI components.
- `provider_wallets.currency` must always be `"USD"` (fixed in `storage.ts` `getOrCreateProviderWallet`).
- `fmtBalance(n, currency)` in `admin-dashboard.tsx` and `fmtUSD(n)` in `provider-operations-console.tsx` are the admin-side formatters — use them, do not add new ones.
- Live rates: fetched hourly by cron (`reminderCron.ts` → `CurrencyService.syncRates()`), stored in `currency_rates` table, served via `GET /api/exchange-rates`, cached client-side by `useLiveRates()`.
- Fallback rates and currency metadata come from the shared currency policy so server and client agree on codes, symbols, precision, and conversion defaults.
- Use `roundCurrencyAmount()`/`roundBookingAmount()` for monetary boundaries; preserve precision between boundaries. Use `roundToCents()` only for USD minor-unit wallet/Stripe amounts.
