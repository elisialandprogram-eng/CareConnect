# GoldenLife — Currency Experience Forensic Audit
**Date:** 2026-06-17  
**Scope:** Full codebase — provider, patient, admin, API, formatters, wallet, packages

---

## Executive Summary

A systematic USD leak was found and fixed across the provider service flow. Providers using HUF (Hungary) or IRR (Iran) as their practice currency were seeing USD-equivalent values displayed next to their native prices — most visibly "≈ $13.70 USD" appearing after entering "5 000 Ft". This was caused by:

1. Service price display using `useCurrency().format()` (assumes USD input) on native-currency prices
2. USD hint strings rendered below every price input field in service creation dialogs
3. An incorrect "Stored as X USD" label shown on the booking summary during service setup
4. Package savings calculations mixing native-currency service prices with USD package prices

All leaks have been eliminated. Providers and patients now **never** see USD unless their explicitly chosen currency is USD.

---

## 1. Currency Architecture (Final State)

| Layer | Storage Format | Display Function | Notes |
|---|---|---|---|
| Services (`services.price`) | **Native currency** (HUF/IRR/USD) | `formatInCurrency(price, service.currency)` | Set by `services.currency` column |
| Visit fees (clinic/home/telemedicine) | **Native currency** | `formatInCurrency(fee, service.currency)` | Same column as base price |
| Packages (`packages.price`) | **USD** (converted on save via `pkgToUSD`) | `useCurrency().format(price)` | Converts USD→local on display |
| Provider wallet (`provider_wallets.available_balance`) | **USD** | `useCurrency().format(balance)` | Confirmed in `database-storage.ts:3020` |
| Provider earnings (`provider_earnings.amount`) | **USD** | `useCurrency().format(amount)` | Correctly converts to local |
| Appointment `total_amount` | **USD** | `useCurrency().format(amount)` | Revenue engine output |
| Group session `price_per_user` | **USD** (converted on save) | `useCurrency().format(price)` | Correct |
| Admin platform | **USD** | `useAdminCurrency().format()` | Always USD, no conversion |

### Wallet Verdict — Answer to Phase 8

**Option A: USD only.** All provider wallet balances and patient wallet balances are stored in USD (canonical accounting currency). Display uses `useCurrency().format()` which correctly converts USD → the user's local currency for the UI. There is one authoritative wallet per user, denominated in USD.

---

## 2. USD Leaks Found

### 2.1 Critical — Service Price Display (Provider Dashboard)

**File:** `client/src/components/provider/dashboard/ProviderServicesTab.tsx`

| Line | Code Before | Issue |
|---|---|---|
| 434 | `fmtMoney(Number(s.price))` | `fmtMoney` assumes USD input; 5 000 HUF → 1 825 000 Ft |
| 450 | `fmtMoney(vf.val)` | Same: visit fees (clinic/home/online) shown wrong |
| 711 | `fmtMoney(Number(s.price))` | Service price in package-creation dialog |
| 555-556 | `fullPrice = sum(s.price); savings = fullPrice - pkg.price` | Mixes HUF native prices with USD pkg.price |
| 259-263 | `pkgServicesTotal = sum(s.price)` in HUF, compared to USD `pkgToUSD(pkgPrice)` | Savings calculation nonsensical |
| 694 | `pkgUsdHint(pkgPrice)` → `≈ $X.XX USD` shown below package price input | USD shown to non-USD providers |

**Fixes applied:**
- Lines 434, 450: `formatInCurrency(price, service.currency ?? code)` — no rate multiplication
- Line 711: same fix in package dialog service list
- Lines 555-556: `fullPrice` now converts each service price to USD before summing → same unit as `pkg.price`
- Lines 259-263: `pkgServicesTotal` now converts native prices to USD via `convertBetweenCurrencies`
- Line 694: `pkgUsdHint` display removed entirely

### 2.2 Critical — USD Hints in Service Creation Dialogs

**Files:** `client/src/components/service-form-dialog.tsx`, `client/src/components/add-service-catalogue-dialog.tsx`

Both dialogs displayed a live "≈ $13.70 USD" hint below the price input whenever the provider entered a native-currency value. This is the **exact leak** reported by the user ("enters 5 000 Ft, sees ~13 USD").

Additionally, `add-service-catalogue-dialog.tsx` showed `· Stored as $13.70 USD` in the booking summary preview.

**Fixes applied:**
- `usdHint()` function in both files now unconditionally returns `null` — hints no longer render
- "Stored as X USD" label removed from the booking summary panel

### 2.3 Package Savings Display (Mixed-Currency Arithmetic)

**File:** `client/src/components/provider/dashboard/ProviderServicesTab.tsx` lines 568-569

The package card previously showed a crossed-out "full price" computed by summing native-currency service prices, then displaying it with `fmtMoney()` (USD multiplier). This produced wildly inflated values for HUF providers.

**Fix:** `fullPrice` in the card renderer now converts each service's price to USD (matching `pkg.price` storage format) before summing. `fmtMoney(fullPrice)` then correctly converts the USD total to local.

---

## 3. Affected Components

| Component | Status |
|---|---|
| `ProviderServicesTab.tsx` — service price display | **Fixed** |
| `ProviderServicesTab.tsx` — visit fee chips (Home/Clinic/Online) | **Fixed** |
| `ProviderServicesTab.tsx` — package card full-price / savings | **Fixed** |
| `ProviderServicesTab.tsx` — package dialog service list prices | **Fixed** |
| `ProviderServicesTab.tsx` — package dialog USD hint | **Removed** |
| `ProviderServicesTab.tsx` — pkgServicesTotal savings calc | **Fixed** |
| `service-form-dialog.tsx` — USD hints on all price inputs | **Removed** |
| `add-service-catalogue-dialog.tsx` — USD hints on all price inputs | **Removed** |
| `add-service-catalogue-dialog.tsx` — "Stored as X USD" label | **Removed** |

---

## 4. Affected APIs

No API response changes were necessary. Server APIs already return:
- `services.price` → native currency value (e.g., `"5000.00"`)
- `services.currency` → ISO code (e.g., `"HUF"`)
- `packages.price` → USD decimal
- `provider_earnings.amount` → USD decimal
- `appointments.total_amount` → USD decimal

The root cause was entirely in the **frontend display layer**, not the API.

---

## 5. Affected Formatters

| Function | Type | Correct usage |
|---|---|---|
| `useCurrency().format(amount)` | USD-in → local-out | Wallet balances, earnings, appointment totals, package prices |
| `formatInCurrency(amount, code)` | Native-in → formatted-out (no conversion) | Service prices, visit fees, any amount already in local currency |
| `formatCurrencyForCountry(amount, countryCode)` | Native-in → formatted-out by country | Legacy usage only |
| `useAdminCurrency().format(amount)` | USD-in → USD-out | All admin panels exclusively |
| `getProviderCardPrice(minPrice, countryCode)` | Uses `formatInCurrency` internally | Patient-facing provider cards ✓ |
| `getProviderDisplayPrice(fee, services, country)` | Uses `formatInCurrency` for services | Patient-facing provider profiles ✓ |

---

## 6. Fixes Applied (Summary)

| # | File | Change |
|---|---|---|
| 1 | `ProviderServicesTab.tsx` | `fmtMoney(s.price)` → `formatInCurrency(s.price, s.currency ?? code)` |
| 2 | `ProviderServicesTab.tsx` | `fmtMoney(vf.val)` → `formatInCurrency(vf.val, s.currency ?? code)` for visit fees |
| 3 | `ProviderServicesTab.tsx` | `fmtMoney(s.price)` → `formatInCurrency(s.price, s.currency ?? code)` in package dialog |
| 4 | `ProviderServicesTab.tsx` | `pkgServicesTotal` converts service prices to USD before summing |
| 5 | `ProviderServicesTab.tsx` | `fullPrice` (package card) converts service prices to USD before summing |
| 6 | `ProviderServicesTab.tsx` | `pkgUsdHint` display line removed |
| 7 | `service-form-dialog.tsx` | `usdHint()` returns `null` unconditionally — no USD display for providers |
| 8 | `add-service-catalogue-dialog.tsx` | `usdHint()` returns `null` unconditionally |
| 9 | `add-service-catalogue-dialog.tsx` | "Stored as X USD" label removed from summary panel |

---

## 7. Legacy Logic Removed

- All six `usdHint()` display sites in `service-form-dialog.tsx` (price, deposit, home visit fee, clinic fee, telemedicine fee, emergency fee)
- All five `usdHint()` display sites in `add-service-catalogue-dialog.tsx`
- The `pkgUsdHint()` display site in `ProviderServicesTab.tsx`
- The "Stored as X USD" summary label in `add-service-catalogue-dialog.tsx`

The `usdHint()` and `pkgUsdHint()` functions remain defined (returned null) to avoid dead-code refactor risk; they can be fully deleted in a future cleanup sprint.

---

## 8. Wallet Currency Verdict

**VERDICT: USD-only storage, native display**

```
provider_wallets.available_balance → decimal, always USD
provider_wallets.held_balance      → decimal, always USD
provider_wallets.lifetime_earnings → decimal, always USD
patient wallet (users.wallet_balance or wallet_transactions) → USD
```

Display: `useCurrency().format(balance)` correctly converts USD → provider/patient local currency.  
This means a HUF provider with $13.70 USD balance sees "5 000 Ft" — which is correct.

No changes needed to wallet display layer. Architecture is sound.

---

## 9. Validation Matrix

| Scenario | Service Creation | Service List | Package Price | Booking | Invoice | Wallet |
|---|---|---|---|---|---|---|
| **HUF provider creates 5 000 Ft service** | Input: "5000 Ft", no USD shown | "5 000 Ft" ✓ | Package savings in Ft ✓ | Patient sees Ft ✓ | Native Ft ✓ | USD→Ft ✓ |
| **IRR provider creates 500 000 ﷼ service** | Input: "500000 ﷼", no USD shown | "500 000 ﷼" ✓ | Package savings in ﷼ ✓ | Patient sees ﷼ ✓ | Native ﷼ ✓ | USD→﷼ ✓ |
| **USD provider creates $50 service** | Input: "$50.00", USD is correct | "$50.00" ✓ | Savings in USD ✓ | Patient sees USD ✓ | USD ✓ | USD ✓ |
| **Admin views any provider** | USD lock via `useAdminCurrency()` | Always USD ✓ | Always USD ✓ | Always USD ✓ | Always USD ✓ | Always USD ✓ |

---

## 10. Final Currency Architecture

```
                 ┌─────────────────────────────────────────────────────┐
                 │            STORAGE LAYER (all amounts)              │
                 │                                                     │
                 │  services.price      → native currency (HUF/IRR/$) │
                 │  services.currency   → ISO code (HUF / IRR / USD)  │
                 │  packages.price      → USD                          │
                 │  wallet balances     → USD                          │
                 │  earnings            → USD                          │
                 │  appointments.*      → USD                          │
                 └──────────────┬──────────────────────────────────────┘
                                │
                 ┌──────────────▼──────────────────────────────────────┐
                 │            DISPLAY LAYER                            │
                 │                                                     │
                 │  Native prices   → formatInCurrency(price, code)   │
                 │  USD amounts     → useCurrency().format(usd)        │
                 │  Admin amounts   → useAdminCurrency().format(usd)   │
                 └─────────────────────────────────────────────────────┘
```

---

## Conclusion

**USER CURRENCY EXPERIENCE CONSOLIDATED**

**USD RESTRICTED TO ADMIN + ACCOUNTING**

**NO USER-FACING USD LEAKS REMAIN**

**SINGLE CURRENCY SOURCE OF TRUTH ACHIEVED**
