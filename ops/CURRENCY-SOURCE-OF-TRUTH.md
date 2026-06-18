# GoldenLife — Currency Source of Truth

**Created:** 2026-06-18  
**Sprint:** Platform-Wide Currency & Timezone Forensic Audit  
**Status:** AUTHORITATIVE — do not override without updating this document

---

## 1. Single Currency Architecture

There is ONE currency architecture for the platform. Any code that deviates from this document is a bug.

---

## 2. Storage Currency by Table

| Table | Field(s) | Storage Currency | Notes |
|---|---|---|---|
| `services` | `price`, `home_visit_fee`, `clinic_fee`, `telemedicine_fee`, `emergency_fee` | **Native** (HUF/IRR/USD per `services.currency`) | P-FINAL model — never converted to USD at rest |
| `sub_services` | `platform_fee`, `base_price` | **USD** | Admin-set catalog prices |
| `appointments` | `total_amount`, `service_price_snapshot`, `promo_discount`, `tax_amount`, `refund_amount`, `platform_fee_amount` | **Booking Currency** (HUF for HU, IRR for IR, USD otherwise) | Set at booking time from `bookingCurrency` |
| `appointments` | `final_total_usd` | **USD** | Single USD snapshot for cross-currency admin reporting |
| `appointments` | `display_currency` | TEXT | Records what currency the patient saw |
| `provider_earnings` | `total_amount`, `platform_fee`, `provider_earning` | **USD** | Canonical accounting currency |
| `provider_earnings` | `display_amount`, `display_currency` | Native | Human-readable snapshot at earn time |
| `provider_wallets` | `available_balance`, `pending_balance`, `held_balance`, `lifetime_earnings` | **USD** | Single wallet per provider, denominated in USD |
| `provider_ledger` | `amount`, `balance_after`, `amount_usd` | **USD** | Append-only audit log |
| `wallets` (patient) | `balance` | **USD** | Single wallet per patient, denominated in USD |
| `wallet_transactions` | `amount`, `balance_after`, `amount_usd` | **USD** | |
| `payments` | `amount` | **USD** | Stripe charges always in USD |
| `packages` | `price` | **USD** | Converted to USD on create via `pkgToUSD` |
| `user_packages` | `price_paid` | **USD** | |
| `gift_cards` | `initial_amount`, `balance` | **Flexible** (`currency` column) | Can be HUF/IRR/USD depending on purchaser |
| `promo_codes` | `discount_value`, `min_amount` | **USD** (`base_currency` column) | |
| `invoices` | `subtotal`, `tax_amount`, `total_amount` | **Booking Currency** | Linked to appointment |
| `payout_requests` | `amount` | **USD** (`currency` column) | |
| `payout_requests` | `display_amount` | **Native** | Human-readable local equivalent |
| `marketplace_ledger` | `amount_cents` | **Integer cents** in `currency_iso` | Immutable financial record |
| `platform_fee_rules`, `commission_rules` | `fixed_amount`, `min_fee`, `max_fee` | **USD** | Admin configured |

---

## 3. Display Rules by Actor

### 3.1 Patient UI
- **Always display in patient's preferred currency** (`users.preferred_currency`)
- Source for conversion: `useCurrency()` hook — converts USD inputs via live exchange rates
- For amounts already in booking currency: `formatInCurrency(amount, displayCurrency)`
- **Never show raw USD to a patient unless their preferred currency is USD**

### 3.2 Provider UI
- **Always display in provider's native currency**
- Source: provider's `country_code` → `getCurrencyConfigForCountry(countryCode).code`
- Service prices: `formatInCurrency(price, service.currency)` — no conversion (stored in native)
- Earnings (USD-stored): `useCurrency().format(amount)` — converts USD → provider native
- **Never show raw USD to a HU or IR provider**

### 3.3 Admin UI
- **Always USD — no exceptions**
- Source: `useAdminCurrency()` hook — locked to USD regardless of any user setting
- For amounts not already in USD: convert first, then `useAdminCurrency().format(n)`
- Native currency MAY be shown as a secondary label: `5,000 Ft ≈ $13.70 USD`

---

## 4. Conversion Functions (Canonical List)

### 4.1 Frontend (`client/src/lib/currency.ts`)

| Function | Input | Output | When to use |
|---|---|---|---|
| `useCurrency().format(n)` | USD amount | Local currency string | Patient/provider UI — amount stored in USD |
| `useAdminCurrency().format(n)` | USD amount | USD string | Admin UI — always |
| `formatInCurrency(n, code)` | Already-local amount | Local string | Amount stored in native currency (services) |
| `convertBetweenCurrencies(n, from, to)` | Any amount | Target currency amount | Cross-currency arithmetic |
| `formatFromUSD(n, code)` | USD amount | Local string | Internal — prefer `useCurrency().format` |

### 4.2 Backend (`server/services/currency.ts`)

| Function | Input | Output | When to use |
|---|---|---|---|
| `formatLocal(n, currency)` | Already-local amount | Localized string | Notifications, emails — amount already in target currency |
| `formatSync(n, toCurrency, rates)` | USD amount | Local string | Notifications where conversion needed |
| `fromUSDSync(n, toCurrency, rates)` | USD amount | Local number | Internal conversion |
| `toUSDSync(n, fromCurrency, rates)` | Local amount | USD number | Accounting/storage |
| `convertUSDToLocal(n, target, rates)` | USD amount | Local number | Named alias for fromUSDSync |
| `convertLocalToUSD(n, source, rates)` | Local amount | USD number | Named alias for toUSDSync |

---

## 5. Revenue Engine (Single Source of Truth for Booking Prices)

- All booking price calculations go through `runRevenueEngine()` in `server/lib/revenue-engine.ts`
- Engine receives: `bookingCurrency`, `servicePrice` (native), `rates`
- Engine outputs: `patientPayable` (in bookingCurrency), `finalTotalUsd` (accounting snapshot)
- **`finalTotalUsd` is the ONLY USD conversion during booking** — do not convert `patientPayable` again
- Booking stores `total_amount = patientPayable` (booking currency), `final_total_usd = finalTotalUsd`

---

## 6. Wallet Debit Logic (When Patient Uses Wallet at Booking)

1. Patient wallet balance is in **USD**
2. `walletAmountUsed` from frontend is in **booking currency** (local)
3. Backend converts `walletAmountUsed` from local → USD for wallet debit: `toUSDSync(walletAmountUsed, bookingCurrency, rates)`
4. Remaining `patientPayable` goes to Stripe (in USD via `finalTotalUsd` — not a second conversion)

---

## 7. Non-Negotiable Rules

1. **No raw `$.toFixed(2)` in notifications** — use `formatLocal(amount, currency)`
2. **No raw `Intl.NumberFormat` outside currency.ts/invoice-gen.ts** — use canonical formatters
3. **No hardcoded currency symbols** (`$`, `Ft`, `﷼`) in business logic
4. **No `amount * rate` inline calculations** — always use `fromUSDSync` / `convertUSDToLocal`
5. **No summing of mixed booking currencies** in reporting — use `final_total_usd` for cross-country aggregates
6. **No duplicate formatter functions** — if you need a new formatter, add it to `currency.ts` and use it from there
7. **Admin always USD** — `useAdminCurrency()` for every monetary display in admin components
8. **Gift card `currency` field must be respected** — never assume USD for gift cards

---

## 8. Country-to-Currency Mapping (Canonical)

| `country_code` | Currency | `formatLocal` key |
|---|---|---|
| `HU` | `HUF` | `"HUF"` |
| `IR` | `IRR` | `"IRR"` |
| `GB` | `GBP` | `"GBP"` |
| `US` (default) | `USD` | `"USD"` |

Server helper: `const currency = cc === "IR" ? "IRR" : cc === "HU" ? "HUF" : "USD";`
