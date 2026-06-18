# FINAL PRICING & CURRENCY CONSOLIDATION REPORT

**Sprint:** GOLDENLIFE-FINAL-PRICING-REVENUE-CURRENCY-CONSOLIDATION  
**Date:** 2026-06-17  
**Status:** COMPLETE — TypeScript clean (exit 0), server running

---

## Architecture Invariants (Post-Sprint)

| Layer | Currency | Rule |
|---|---|---|
| `services.price` | Provider native (HUF/IRR/USD) | Raw price entered by provider |
| `appointments.total_amount` | **Booking currency** (HUF/IRR/USD) | Set by `runRevenueEngine().patientPayable` |
| `appointments.display_currency` | Booking currency code | Snapshot at booking time |
| `appointments.display_amount` | Booking currency amount | Snapshot at booking time |
| `appointments.final_total_usd` | **USD** | Internal snapshot via raw SQL; NOT in Drizzle schema → never leaks to API |
| `provider_earnings.total_amount` | **USD** | After earnings double-conversion fix |
| `provider_earnings.provider_earning` | **USD** | After earnings double-conversion fix |
| `provider_earnings.platform_fee` | **USD** | After earnings double-conversion fix |
| `wallets.balance` | **USD** | Always USD; display via `useCurrency().format()` |
| `packages.price` | **USD** | Always USD; display via `useCurrency().format()` |

**One rule for formatters:**
- `fmtMoney(n)` / `useCurrency().format(n)` → input is **USD**, output is local currency (HUF/IRR) via live rates. Use ONLY for USD-stored values (wallet, packages, provider_earnings).
- `formatInCurrency(n, code)` → input is **already in `code`**, no rate multiplication. Use for booking-currency appointment amounts.

---

## Bugs Fixed This Sprint

### B1 — `booking-confirmation.tsx`: 5× `fmtMoney` on booking-currency amounts  
**File:** `client/src/pages/booking-confirmation.tsx`  
**Severity:** CRITICAL — 365× price inflation for HU patients, ~42,000× for IR patients  
**Root cause:** `appt.totalAmount` / `priceLines` amounts are in booking currency (HUF). `fmtMoney` multiplied by USD→HUF rate again.  
**Fix:** Imported `formatInCurrency`; derived `bookingCurrency = appt?.displayCurrency ?? "USD"`; introduced `fmtAmt = (n) => formatInCurrency(n, bookingCurrency)`; replaced all 5 occurrences (lines 508, 649, 668, 671, 679) with `fmtAmt`.

### B2 — `provider-earnings.tsx`: breakdown uses `fmt` (USD) on booking-currency snapshot fields  
**File:** `client/src/pages/provider-earnings.tsx`  
**Severity:** HIGH — "Service price" and "Promo discount" rows showed inflated amounts in provider earnings breakdown  
**Root cause:** `EarningBreakdownRow` used a single `fmt` (fmtMoney = USD→local) for all lines, but `servicePriceSnapshot`, `promoDiscount`, `taxAmount` are sourced from the `appointments` table in booking currency (HUF/IRR), not USD.  
**Fix:** Imported `formatInCurrency`; added `fmtLocal = (n) => formatInCurrency(n, displayCur)` inside the component; added `fmtFn` property to each `BLine` item so booking-currency lines use `fmtLocal` and USD lines (platformFee, providerEarning, refundAmount) keep `fmt`; `pricingBreakdown.lines` now also use `fmtLocal`.

### B3 — `reminderCron.ts`: overdue invoice notification body missing currency symbol  
**File:** `server/reminderCron.ts` line 514  
**Severity:** MEDIUM — Patients received "your invoice for 5000.00 was due…" with no currency indication  
**Root cause:** `inv.totalAmount` embedded raw without currency symbol. The `invoices` table has no `currency` column.  
**Fix:** Derives currency from `inv.countryCode` (`IR` → `IRR`, `HU` → `HUF`, else `USD`) inline in the template literal.

### B4 — `currency.ts`: dead exported helpers never called anywhere  
**File:** `client/src/lib/currency.ts`  
**Severity:** LOW — dead code risk, misleading API surface suggesting a valid USD↔local conversion path  
**Root cause:** `convertUSDToLocal` and `convertLocalToUSD` were added before `formatInCurrency` / `useCurrency` became the canonical API. No file outside `currency.ts` ever imported them.  
**Fix:** Both functions removed. No callers existed (confirmed via repo-wide grep).

---

## Items Verified Correct (No Change Needed)

| Component | Verdict |
|---|---|
| `booking-canvas.tsx` | Already uses `formatInCurrency` for booking amounts, `formatPrice` (fmtMoney) for wallet. ✓ |
| `packages.tsx` | `pkg.price` is USD (schema canonical), `walletBalanceUSD` is USD — `fmtMoney` correct on both. ✓ |
| `invoice-gen.ts` | Has own `makeFormatter(currencyCode)` that formats amounts already in invoice currency — no double-conversion. ✓ |
| `invoice-helper.ts` | Uses `computeFinalPrice` ONLY to derive a tax ratio to split the snapshotted display total; does not re-price. ✓ |
| `appointments.final_total_usd` exposure | Column written via raw SQL only; absent from Drizzle schema → Drizzle SELECT never returns it → not in any patient/provider API response. ✓ |
| `provider_earnings` summary cards | `summaryTotal`, `summaryPending`, `summaryPaid` from `provider_earnings.provider_earning` (USD) → `fmtMoney` (USD→local) correct. ✓ |

---

## Previous Sprint Fixes (Carried Forward)

These bugs were fixed in the preceding session and validated as still correct:

- **Group sessions wallet debit** — `bookGroupSessionWithWallet` converts `price_per_user` (native HUF/IRR) to USD before comparing wallet balance and debiting; `amount_paid` on participant row stored in USD.
- **Group sessions display** — `formatInCurrency(price, countryCurrency(s.countryCode))` replaces `fmtMoney(s.pricePerUser)`.
- **Provider earnings storage** — `recordProviderEarning` no longer calls `toUSDSync` on `appointment.total_amount` (which is already booking-currency); stores correct USD via the engine snapshot.
- **Notification email links** — booking confirmation email links fixed to use absolute URLs.

---

## TypeScript Status

```
npx tsc --noEmit → EXIT 0 (no errors)
```

---

## Formatter Decision Table (Canonical Reference)

```
Value source                               Formatter to use
──────────────────────────────────────────────────────────────────────
appointments.total_amount (HUF/IRR/USD)   formatInCurrency(n, appt.displayCurrency)
appointments.service_price_snapshot       formatInCurrency(n, appt.displayCurrency)
appointments.promo_discount               formatInCurrency(n, appt.displayCurrency)
appointments.tax_amount                   formatInCurrency(n, appt.displayCurrency)
pricingBreakdown.lines[].amount           formatInCurrency(n, appt.displayCurrency)
provider_earnings.total_amount            fmtMoney(n)  [USD]
provider_earnings.provider_earning        fmtMoney(n)  [USD]
provider_earnings.platform_fee            fmtMoney(n)  [USD]
wallets.balance                           fmtMoney(n)  [USD]
packages.price                            fmtMoney(n)  [USD]
services.price (provider entry forms)     formatInCurrency(n, providerNativeCurrency)
Admin dashboard totals                    useAdminCurrency().format(n)  [always USD]
```

---

## Files Changed

| File | Change |
|---|---|
| `client/src/pages/booking-confirmation.tsx` | Import `formatInCurrency`; add `bookingCurrency`/`fmtAmt`; replace 5× `fmtMoney` on appointment amounts |
| `client/src/pages/provider-earnings.tsx` | Import `formatInCurrency`; add `fmtLocal` + per-line `fmtFn` in `EarningBreakdownRow`; `pricingLines` use `fmtLocal` |
| `server/reminderCron.ts` | Derive currency from `inv.countryCode` in overdue invoice notification body |
| `client/src/lib/currency.ts` | Remove dead `convertUSDToLocal` and `convertLocalToUSD` exports |
