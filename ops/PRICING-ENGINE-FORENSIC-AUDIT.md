# GoldenLife — Pricing Engine Forensic Audit

**Date:** 2026-06-17  
**Scope:** All locations where `service.price` or `price_per_user` is read and could be incorrectly treated as USD, when those values are stored in native provider currency (HUF/IRR/USD) per the P-FINAL architecture.

---

## P-FINAL Architecture Summary

| Value | Currency | Notes |
|---|---|---|
| `services.price` | Native (HUF / IRR / USD) | Set by provider in their local currency |
| `services.currency` | ISO code | Explicit tag on each service |
| `group_sessions.price_per_user` | Native (HUF / IRR / USD) | Implied by `country_code` |
| `sub_services.base_price` | USD (admin-set) | Admin always works in USD |
| `wallets.balance` | USD | All wallets are USD-denominated |
| `appointments.total_amount` | Booking currency (may be HUF) | Set by revenue engine output |
| `provider_earnings.total_amount` | USD | Must be stored as USD for payout |
| `revenue_engine.finalTotalUsd` | USD | The only correct USD conversion |
| `revenue_engine.patientPayable` | Booking currency | Used for display / Stripe charge in local |

---

## Audit Results

### ✅ Server-side — Revenue Engine (`server/lib/revenue-engine.ts`)

**Finding:** COMPLIANT  
The engine correctly reads `service.price` in native currency, then converts using the booking exchange rate. `finalTotalUsd` is the only output consumed for wallet/payout operations. No assumption of USD on `service.price`.

---

### ✅ Server-side — Booking Route (`server/routes/appointment.routes.ts`) — after fix

**Pre-fix bug (Bug 1 of this file):** `_fmtProv` and `_fmtEmailAmt` helpers called `formatSync(amount, "USD")` on `platformFee`, `promoDiscount`, and `taxAmountNum`, which are denominated in `bookingCurrency` (e.g., HUF). This treated HUF amounts as USD, producing wildly inflated notification emails/SMS for HU patients.

**Fix applied:** Divided each amount by `_bookingRateVal` before calling `formatSync` so the helpers receive USD, then format correctly.

---

### ✅ Server-side — Quote API (`server/routes/appointment.routes.ts` — `/api/services/quote`)

**Finding:** COMPLIANT  
`runRevenueEngine()` is called with the full provider context (currency, rate). Output `patientPayable` and `finalTotalUsd` are returned; no raw `service.price` USD assumption.

---

### ✅ Server-side — Service Catalog Routes (read-only display)

**Finding:** COMPLIANT  
Catalog listing and detail endpoints return `service.price` as-is with `service.currency`. No arithmetic or USD assumption. Consumers must use `formatInCurrency` not `fmtMoney`.

---

### ✅ Server-side — Wallet Credit/Debit (`server/routes/appointment.routes.ts` — booking route)

**Finding:** COMPLIANT (after earlier P-FINAL fixes)  
`walletAmountUsed` from the frontend arrives in local currency and is converted via `toUSDSync` before deducting from the USD wallet. `engine.finalTotalUsd` is used for all wallet arithmetic.

---

### ✅ Server-side — Gift Cards

**Finding:** COMPLIANT  
Gift card amounts are stored and compared in USD. No `service.price` assumption.

---

### ✅ Server-side — Provider Earnings (`server/storage/database-storage.ts`) — after fix

**Pre-fix bug (Bug 2 of this file — critical):** `recordProviderEarning` stored `appointment.total_amount` (which is in booking currency, e.g., HUF) directly into `provider_earnings.total_amount` without conversion. Since `provider_earnings` feeds the USD payout engine, a HU appointment worth 5,000 HUF would record as "5000 USD" in earnings — a 365× inflation.

**Fix applied:** Added `_toUSD` conversion using the appointment's booking rate before writing to `provider_earnings`. Non-USD `total_amount` values are divided by `rateVal` to produce correct USD.

---

### ✅ Server-side — Provider Earnings Repair Endpoint

**Finding:** COMPLIANT  
`POST /api/admin/financial/repair-earnings/apply` already includes the double-conversion guard — it reads from `appointments.total_amount` and uses the currency to compute USD. No issue.

---

### ✅ Frontend — Book Wizard (`client/src/pages/book-wizard.tsx`) — after fix

**Pre-fix bug (Bug 3 of this file — display):** `fmtMoney(minServicePrice)` and `fmtMoney(svc.price)` assumed USD input, but both values are in native provider currency (HUF for HU providers). HU patients would see prices like "HUF 1,825,000" for a 5,000 HUF service.

**Fix applied:** Replaced both calls with `formatInCurrency(amount, getCurrencyConfigForCountry(countryCode).code)` to display the native price directly.

---

### ✅ Frontend — Group Sessions Display (`client/src/pages/group-sessions.tsx`) — after fix

**Pre-fix bug (Bug 4 of this file — display):** `fmtMoney(s.pricePerUser)` at line 146 treated HUF `price_per_user` as USD before formatting. A 5,000 HUF session would display as "HUF 1,825,000".

**Fix applied:** Replaced with `formatInCurrency(Number(s.pricePerUser), getCurrencyConfigForCountry(s.countryCode).code)`. Added `countryCode` field to the `GroupSession` TypeScript type (it was already returned by the API at line 323 of `group-sessions.mixin.ts`).

Note: `MyBookingsList` at line 216 uses `fmtMoney(b.amountPaid)` — this is **correct** because `amount_paid` on participant rows is stored in USD (matches wallet denomination) so the USD→local conversion via `fmtMoney` is appropriate.

---

### ✅ Server-side — Group Sessions Wallet Debit (`server/storage/group-sessions.mixin.ts`) — after fix

**Pre-fix bug (Bug 5 — critical financial):** `bookGroupSessionWithWallet` compared `price_per_user` (native HUF/IRR) directly against `wallet.balance` (USD). For any non-trivial HU session (e.g., 5,000 HUF ≈ $13.70), `priceCents = 500,000` vs `balanceCents ≈ 1,370` → always threw "Insufficient wallet balance" even with adequate funds. If a session somehow passed (e.g., 1 HUF free tier), the wallet would be debited by the HUF integer amount treated as USD.

**Fix applied:**
1. Fetched exchange rates via `getRates()` inside the transaction
2. Derived `_gsCurrency` from `countryCurrency(s.country_code)` 
3. Computed `price = priceNative / rateVal` (USD equivalent)
4. All wallet comparisons and debits now use the USD `price`
5. `amount_paid` on the participant row stores the USD price so that `cancelGroupSessionAndRefund` can credit the wallet correctly without a second currency lookup

---

### ⚠️ Medium Risk — Sub-service Catalog Base Price Display (`client/src/components/service-catalog-hierarchy.tsx` line 639)

**Finding:** `fmtMoney(s.basePrice)` — `sub_services.base_price` is set by admins who always work in USD (enforced via `useAdminCurrency()`). The catalog hierarchy component is part of the provider setup flow. If `base_price` is a USD reference price, `fmtMoney` (USD→local) is correct.

**Risk:** If a future admin form allowed entering base prices in local currency, this would break. Currently harmless because admin input is always USD.

**Recommendation:** Add a `currency: "USD"` column to `sub_services` and use `formatInCurrency` explicitly. Tracked for future sprint.

---

### ⚠️ Medium Risk — Practitioner Fee Display (`client/src/components/admin/practitioner-management.tsx` line 420)

**Finding:** `fmtMoney(assignment.fee)` — practitioner fee overrides (`practitioner_service_assignments.fee`) are set by admins and are not tied to a country/currency. If always entered in USD, display is correct.

**Risk:** If fees were ever entered in non-USD context, display inflates. No current code path does this.

**Recommendation:** Add a comment at the assignment creation form that fee must be in USD. Tracked for future sprint.

---

## Summary

| # | Severity | Location | Bug | Status |
|---|---|---|---|---|
| 1 | 🔴 Critical | `server/routes/appointment.routes.ts` | Notification formatters double-converted HUF amounts to USD | Fixed |
| 2 | 🔴 Critical | `server/storage/database-storage.ts` `recordProviderEarning` | Provider earnings stored HUF as USD (365× inflation) | Fixed |
| 3 | 🟡 Display | `client/src/pages/book-wizard.tsx` | `fmtMoney(svc.price)` treated HUF as USD | Fixed |
| 4 | 🟡 Display | `client/src/pages/group-sessions.tsx` | `fmtMoney(pricePerUser)` treated HUF as USD | Fixed |
| 5 | 🔴 Critical | `server/storage/group-sessions.mixin.ts` | Wallet debit compared HUF price to USD balance → always rejected | Fixed |
| 6 | ⚪ Low | `service-catalog-hierarchy.tsx` | `fmtMoney(basePrice)` — OK if admin always enters USD | Tracked |
| 7 | ⚪ Low | `practitioner-management.tsx` | `fmtMoney(assignment.fee)` — OK if admin always enters USD | Tracked |

All server-side pricing paths that affect real money (revenue engine, booking route, quote API, wallet debit/credit, provider earnings) are now P-FINAL compliant.

---

## Key Rule Going Forward

> **Never call `fmtMoney()` or `formatSync(amount, "USD")` on a value that comes from `services.price`, `group_sessions.price_per_user`, or any appointment field denominated in booking currency. Always use `formatInCurrency(amount, currencyCode)` for those values, or convert to USD first via `toUSDSync`/`divide-by-rate` before passing to a USD formatter.**
