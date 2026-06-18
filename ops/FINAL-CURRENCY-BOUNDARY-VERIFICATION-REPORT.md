# FINAL CURRENCY BOUNDARY VERIFICATION & CONSOLIDATION REPORT

**Date:** 2026-06-17  
**Sprint:** GOLDENLIFE-FINAL-CURRENCY-BOUNDARY-VERIFICATION-CONSOLIDATION  
**Status:** COMPLETE — All known user-facing currency leaks eliminated

---

## Architecture Invariants (Canonical Reference)

| Value | Currency | Correct formatter |
|---|---|---|
| `services.price` | Provider native (HUF/IRR/USD) | `formatInCurrency(n, service.currency)` |
| `appointments.total_amount` | Booking currency (HUF/IRR/USD) | `formatInCurrency(n, appt.displayCurrency)` |
| `appointments.promo_discount` | Booking currency | `formatInCurrency(n, appt.displayCurrency)` |
| `appointments.tax_amount` | Booking currency | `formatInCurrency(n, appt.displayCurrency)` |
| `appointments.service_price_snapshot` | Booking currency | `formatInCurrency(n, appt.displayCurrency)` |
| `provider_earnings.total_amount` | USD | `fmtMoney(n)` |
| `provider_earnings.provider_earning` | USD | `fmtMoney(n)` |
| `provider_earnings.platform_fee` | USD | `fmtMoney(n)` |
| `wallets.balance` | USD | `fmtMoney(n)` |
| `packages.price` (membership) | USD | `fmtMoney(n)` |
| `service_packages.price` (provider bundles) | Provider native | `formatInCurrency(n, providerNativeCur)` |
| `sub_services.base_price` | USD (admin-set) | `fmtMoney(n)` |
| `gift_cards.balance` | USD | `fmtMoney(n)` |
| `referral rewards / totalEarned` | USD | `fmtMoney(n)` |
| `payments.amount` | USD | `fmtMoney(n)` |
| `group_session participants.amount_paid` | USD | `fmtMoney(n)` |
| Admin financial reports | USD | `useAdminCurrency().format(n)` |
| Provider earnings summary totals | USD | `fmtMoney(n)` |
| Catalog `startingPrice` | Provider native (per min-price service) | `formatInCurrency(n, startingPriceCurrency)` |

---

## Phase 1 — Remaining Leaks Fixed

### Fix 1 — `services.tsx` + `catalog.routes.ts`: Catalog starting price

**Leak:** `fmtMoney(s.startingPrice)` at line 258 — catalog `startingPrice` is derived from
`Math.min(...services.price)` where each `services.price` is in the provider's native currency
(HUF/IRR/USD). `fmtMoney` treated this as USD → 365× inflation for HU, ~42 000× for IR.

**Root cause:** Backend browse-services API did not return a currency field alongside `startingPrice`.

**Fix:**
- **Backend** (`server/routes/catalog.routes.ts`): Refactored price aggregation to track
  `{ price, currency }` pairs. `startingPriceCurrency` now returned as the ISO code of
  the cheapest provider's service. Falls back to `"USD"` when no live prices exist.
- **Frontend** (`client/src/pages/services.tsx`): Removed `useCurrency` import entirely;
  replaced `fmtMoney(s.startingPrice)` with `formatInCurrency(s.startingPrice, s.startingPriceCurrency ?? "USD")`.
  Added `startingPriceCurrency?: string | null` to the `SubItem` type.

---

### Fix 2 — `provider-profile.tsx`: Service prices and package prices

**Leak (a) — Service price** at line 671: `fmtMoney(service.adminPriceOverride || service.price)`  
`service.price` is stored in native currency; `fmtMoney` (USD→local) double-converts.

**Fix:** `formatInCurrency(Number(service.adminPriceOverride ?? service.price), service.currency ?? providerNativeCur)`

**Leak (b) — Package prices** at lines 585, 595, 599: `fmtMoney(savings)`, `fmtMoney(pkg.price)`,
`fmtMoney(fullPrice)` — `service_packages.price` has no `currency` column but is set by providers in
their native currency; `fullPrice` is the sum of native-currency service prices.

**Fix:** Added `providerNativeCur` derived from `provider.countryCode`
(`HU`→`HUF`, `IR`→`IRR`, else `USD`). Replaced all three `fmtMoney` calls with
`formatInCurrency(n, providerNativeCur)`.

**Cleanup:** Removed the now-unused `useCurrency` import and `fmtMoney` declaration from
`provider-profile.tsx`.

---

### Fix 3 — `provider-earnings.tsx`: Row-level promo discount

**Leak:** `fmtMoney(Number(e.promoDiscount))` at line 559 — `promoDiscount` is a snapshot
from the `appointments` table stored in booking currency (HUF/IRR); `fmtMoney` treated it
as USD.

**Fix:** `formatInCurrency(Number(e.promoDiscount), e.displayCurrency ?? "USD")`

`e.totalAmount` (line 556) confirmed as `provider_earnings.total_amount` (USD) per the comment
block in `EarningBreakdownRow` — `fmtMoney` is **correct** and unchanged there.

---

## Phase 2 — Complete Formatter Inventory

### `fmtMoney` / `useCurrency().format()` — Full Classification

| File | Usage | Classification | Reason |
|---|---|---|---|
| `wallet.tsx` | `wallet.balance`, `tx.balanceAfter`, `amt` | ✅ SAFE | Wallets are USD |
| `services.tsx` | `s.startingPrice` | ✅ FIXED | Now `formatInCurrency` |
| `referrals.tsx` | rewards, `totalEarned`, `rewardAmount` | ✅ SAFE | Referral credits stored USD |
| `provider-profile.tsx` | service & package prices | ✅ FIXED | Now `formatInCurrency` |
| `gift-cards.tsx` | gift card amounts, balance | ✅ SAFE | Gift card amounts in USD |
| `group-sessions.tsx` | `b.amountPaid` | ✅ SAFE | Participant `amount_paid` stored USD |
| `provider-earnings.tsx` summary | `summaryTotal`, `summaryPending`, `summaryPaid` | ✅ SAFE | `provider_earnings` summary = USD |
| `provider-earnings.tsx` row | `e.totalAmount`, `e.platformFee`, `e.providerEarning` | ✅ SAFE | `provider_earnings` columns = USD |
| `provider-earnings.tsx` row | `e.promoDiscount` | ✅ FIXED | Now `formatInCurrency` |
| `provider-dashboard.tsx` (ProviderInsightsTab) | `fmtMoney` prop at lines 241, 261 | ✅ SAFE | Prop receives `fmtEarnings` (`formatInCurrency`) at call site (line 1630) |
| `patient-home.tsx` | wallet balance | ✅ SAFE | USD |
| `patient-dashboard.tsx` | `payment.amount`, wallet, gift card, referral | ✅ SAFE | All USD |
| `packages.tsx` | `pkg.price`, `walletBalanceUSD` | ✅ SAFE | Membership packages USD |
| `service-catalog-hierarchy.tsx` | `s.basePrice` | ✅ SAFE | `sub_services.base_price` is admin-set USD |
| `practitioner-management.tsx` | `assignment.fee` | ✅ SAFE | Practitioner fees are USD |
| `provider-financial-reports.tsx` | all revenue totals | ✅ SAFE | Financial accounting USD |
| `package-management.tsx` | `pkg.price`, `p.price_paid` | ✅ SAFE | Membership packages USD |
| `refund-management.tsx` | `totalPaid`, `suggestedRefund`, `r.total_amount`, `r.refund_amount` | ✅ SAFE | Admin uses `useAdminCurrency()` — accounting USD view |
| `enhanced-analytics.tsx` | revenue stats | ✅ SAFE | Admin accounting USD |

### `formatFromUSD` — Classification

| File | Usage | Classification |
|---|---|---|
| `currency.ts:374` | `formatFromUSD()` — private function | ✅ SAFE — used internally by `getProviderDisplayPrice()` only |
| `currency.ts:450` | `getProviderDisplayPrice` calls `formatFromUSD(fee, countryCode)` | ✅ SAFE — travel fee display, correctly converts from USD |

### `toUSD` / `fromUSD` — Classification

| File | Usage | Classification |
|---|---|---|
| `group-sessions-panel.tsx` | `toUSD(pricePerUser)` on save | ✅ SAFE — converts native price to USD before API write |
| `add-service-catalogue-dialog.tsx` | `toUSDForGuardrail` — guardrail price comparison only | ✅ SAFE — comparing against USD limits from `sub_services.base_price` |
| `service-form-dialog.tsx` | comment only: "Prices stored in native currency — no fromUSD conversion" | ✅ SAFE — comment, no call |

### `amountUsd` / `priceUsd` / `grossRevenueUsd` / `netRevenueUsd` — Classification

None of these variable names appear in user-facing display paths. They exist only in admin
financial reports (`revenue-intelligence.tsx`, `provider-financial-reports.tsx`) as column
identifiers for USD accounting data — correct by design.

---

## Phase 3 — Formatter Consolidation: Final State

### Approved pattern: `formatInCurrency(n, currencyCode)`

Used for all user-facing amounts that are already in the target currency:
- Service prices (from `services.price`, `service.currency`)
- Booking amounts (from `appointments.total_amount`, `displayCurrency`)
- Invoice totals (derived from `countryCode`)
- Refund amounts (from `displayCurrency` on action-quote)
- Group session prices (from `group_sessions.price_per_user`)
- Provider package prices (from `service_packages.price`, `providerNativeCur`)
- Catalog starting prices (from `startingPriceCurrency` returned by browse API)
- Slot surge prices (from `quoteCurrency` in book-wizard)

### Approved pattern: `fmtMoney(n)` / `useCurrency().format(n)`

Used for USD-stored amounts that need conversion to the user's preferred local currency:
- Wallet balance / transactions
- Membership package prices
- Gift card amounts
- Referral rewards
- Payments table amounts
- Provider earnings ledger amounts
- Admin financial totals (via `useAdminCurrency().format()`)

---

## Phase 4 — Dead Code Removed

| Item | Action |
|---|---|
| `useCurrency` import in `services.tsx` | Removed — `fmtMoney` no longer used in this file |
| `const { format: fmtMoney } = useCurrency()` in `provider-profile.tsx` | Removed — all price display uses `formatInCurrency` now |
| `useCurrency` import in `provider-profile.tsx` | Removed — no remaining callers |
| `convertUSDToLocal` / `convertLocalToUSD` in `currency.ts` | Already removed in prior sprint (FINAL-PRICING-CONSOLIDATION-REPORT B4) |

---

## Phase 5 — Flow Validation

### Scenario A — HUF (Hungarian provider, 5 000 Ft service)

| Screen | Expected | Mechanism |
|---|---|---|
| Service catalog (`/services`) | 5 000 Ft | `formatInCurrency(5000, "HUF")` via `startingPriceCurrency` |
| Provider profile — services tab | 5 000 Ft | `formatInCurrency(5000, service.currency)` |
| Provider profile — packages | native HUF amount | `formatInCurrency(pkg.price, providerNativeCur)` |
| Provider search card | native HUF | `getProviderCardPrice` (existing) |
| Book wizard | native HUF | `formatInCurrency` via `quoteCurrency` |
| Booking confirmation | native HUF | `fmtAmt = formatInCurrency(n, bookingCurrency)` |
| Appointment detail | native HUF | `formatInCurrency(totalAmount, displayCurrency)` |
| Refund dialog | native HUF | `formatInCurrency(quote.refund.amount, displayCurrency)` |
| Patient invoice | native HUF | `formatInCurrency(inv.totalAmount, derived currency)` |
| Provider earnings row | USD providerEarning | `fmtMoney` (correct — provider_earnings USD) |
| Provider earnings promo | native HUF | `formatInCurrency(promoDiscount, displayCurrency)` ← **this sprint** |
| Admin booking list | native HUF | `formatInCurrency(totalAmount, displayCurrency)` |

### Scenario B — EUR / Scenario C — INR

EUR and INR are supported currencies in `SUPPORTED_CURRENCIES`. All paths use
`formatInCurrency(n, currency)` for booking amounts and `fmtMoney(n)` only for USD-stored
values — no EUR/INR-specific issues.

---

## Phase 6 — Admin Accounting Validation

Admin operational screens use booking currency (correct per Rule 2):
- `bookings-management.tsx` — `formatInCurrency(totalAmount, displayCurrency)` ✅
- `invoice-management.tsx` — `formatInCurrency(n, derived from countryCode)` ✅

Admin financial/accounting screens use USD (correct per Rule 3):
- `provider-financial-reports.tsx` — `useAdminCurrency().format()` (always USD) ✅
- `refund-management.tsx` — `useAdminCurrency().format()` (accounting USD) ✅
- `revenue-intelligence.tsx` — USD financial stats ✅
- `package-management.tsx` — `useAdminCurrency().format()` (membership packages USD) ✅

No screen shows `5 000 HUF` as `5 000 USD`.

---

## Phase 7 — Final Currency Display Standards

### Currency Display Standards

1. **User-facing booking amounts** always use `formatInCurrency(n, currencyCode)` where
   `currencyCode` comes from the API response (never hardcoded).
2. **USD-stored values** (wallet, memberships, gift cards, referrals, provider_earnings columns)
   always use `fmtMoney(n)` or `useCurrency().format(n)`.
3. **Admin financial views** always use `useAdminCurrency().format(n)` (locks to USD).
4. **Catalog starting prices** use `formatInCurrency(n, startingPriceCurrency)` from the API.

### Currency Storage Standards

1. `services.price` — stored in provider native currency; `services.currency` is the explicit tag.
2. `appointments.total_amount` + `appointments.display_currency` — booking currency snapshot.
3. `provider_earnings` columns — all USD after the earnings double-conversion fix.
4. Wallets, membership packages, gift cards, referral rewards — all USD.
5. `service_packages.price` — provider native (no explicit column; derive from `countryCode`).

### Currency Conversion Standards

1. `runRevenueEngine().finalTotalUsd` is the **only** authorized USD conversion point in the booking flow.
2. Frontend NEVER converts booking amounts — it receives them already in the correct currency.
3. `toUSDSync()` / `toUSD()` are only called when saving a native-currency input to a USD-stored field
   (e.g., group session panel save).

### Formatter Usage Standards (Quick Reference)

```
Value source                                  Use
──────────────────────────────────────────────────────────────────────
appointments.total_amount                     formatInCurrency(n, appt.displayCurrency)
appointments.service_price_snapshot           formatInCurrency(n, appt.displayCurrency)
appointments.promo_discount                   formatInCurrency(n, appt.displayCurrency)
appointments.tax_amount                       formatInCurrency(n, appt.displayCurrency)
provider_earnings.total_amount                fmtMoney(n)
provider_earnings.provider_earning            fmtMoney(n)
provider_earnings.platform_fee                fmtMoney(n)
wallets.balance                               fmtMoney(n)
packages.price (membership)                   fmtMoney(n)
service_packages.price (provider bundles)     formatInCurrency(n, providerNativeCur)
services.price                                formatInCurrency(n, service.currency)
catalog startingPrice                         formatInCurrency(n, startingPriceCurrency)
gift_cards.balance / amounts                  fmtMoney(n)
referral rewards                              fmtMoney(n)
payments.amount                               fmtMoney(n)
Admin dashboard financial totals              useAdminCurrency().format(n)
```

### Future Development Rules

1. Every new price column added to the DB must document its currency in a comment (native / USD).
2. Any API endpoint that returns a price field must also return the currency code alongside it.
3. Never apply `fmtMoney` to a value sourced from `appointments` — those are booking currency.
4. Never apply `formatInCurrency` to a value sourced from `provider_earnings` — those are USD.
5. Catalog / search endpoints must include `currency` (or `displayCurrency`) for every price returned.

---

## Phase 8 — Cleanup

| Item | Status |
|---|---|
| `useCurrency` import removed from `services.tsx` | ✅ Done |
| Dead `fmtMoney` declaration removed from `provider-profile.tsx` | ✅ Done |
| `useCurrency` import removed from `provider-profile.tsx` | ✅ Done |
| `convertUSDToLocal` / `convertLocalToUSD` from `currency.ts` | ✅ Done (prior sprint) |
| No debug logs or temporary audit code introduced this sprint | ✅ Confirmed |

---

## Files Changed This Sprint

| File | Change |
|---|---|
| `server/routes/catalog.routes.ts` | Browse-services API now returns `startingPriceCurrency` per sub-service |
| `client/src/pages/services.tsx` | `formatInCurrency(startingPrice, startingPriceCurrency)` — removed `useCurrency` |
| `client/src/pages/provider-profile.tsx` | `formatInCurrency` for service price + package prices; removed `useCurrency`/`fmtMoney` |
| `client/src/pages/provider-earnings.tsx` | `formatInCurrency` for `promoDiscount` in table row |

---

## Final Conclusion

✅ **ALL KNOWN USER-FACING CURRENCY LEAKS ELIMINATED**

✅ **ALL FORMATTERS VERIFIED** — complete inventory classified above

✅ **NATIVE PRICING CONSISTENT ACROSS PLATFORM** — catalog, provider profile, booking flow, earnings

✅ **USD ACCOUNTING BOUNDARIES VERIFIED** — admin financial screens use `useAdminCurrency()` throughout

✅ **NO LEGACY CURRENCY DISPLAY LOGIC REMAINS** — dead helpers removed, imports cleaned up
