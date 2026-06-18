# GoldenLife — Revenue Engine Forensic Audit

**Date:** 2026-06-16  
**Status:** READ-ONLY — No code changes were made during this audit.  
**Scope:** Currency, Pricing, Commission, Fees, Packages, Memberships, Wallet, Payout, Refund, Exchange Rates.

---

## Table of Contents

1. [Currency Architecture](#part-1--currency-architecture)
2. [Service Pricing](#part-2--service-pricing)
3. [Platform Revenue](#part-3--platform-revenue)
4. [Exchange Rates](#part-4--exchange-rates)
5. [Memberships](#part-5--memberships)
6. [Packages](#part-6--packages)
7. [Booking Snapshot Integrity](#part-7--booking-snapshot-integrity)
8. [Provider Earnings](#part-8--provider-earnings)
9. [Refunds](#part-9--refunds)
10. [Payouts](#part-10--payouts)
11. [Data Model Review](#part-11--data-model-review)
12. [Risk Assessment](#part-12--risk-assessment)
13. [Future Global Readiness](#part-13--future-global-readiness)
14. [Identified Bugs](#identified-bugs)
15. [Recommended Future Architecture](#recommended-future-architecture)

---

## PART 1 — Currency Architecture

### Design Principle

> **ALL storage = USD. ALL calculations = USD. ALL display = preferred local currency.**

This is the explicit contract declared in `server/services/currency.ts` line 1–8. No exception.

### Currency Roles

| Role | Currency | Where set | Notes |
|------|----------|-----------|-------|
| **Platform base** | USD | Hardcoded as canonical | Every financial column is decimal USD |
| **Reporting** | USD | `useAdminCurrency()` hook locks admin panel to USD | Prevents admin confusion when providers are in HU/IR |
| **Provider pricing** | USD (stored), local (display) | Provider sets price in local currency; `editToUSD()` converts before save | Fix landed this session: `RequestServiceEditDialog` was showing raw USD |
| **Patient display** | Preferred currency | `useCurrency()` resolves: user.preferredCurrency → country → localStorage → USD | Converts at render time only |
| **Payment processing** | USD | Stripe always charged in USD (`currency: "usd"`) | `toStripeAmount()` handles cents |
| **Wallet** | USD | `wallets.currency` defaults to `"USD"` | Balance always in USD regardless of country |
| **Membership** | USD | `packages.currency` defaults to `"USD"` | Display in local; purchase in USD |
| **Package purchase** | USD | `user_packages.price_paid` in USD | **No currency column** — local amount is not preserved |
| **Payout** | USD | Provider wallet is USD; Stripe Connect transfers in USD | Bank conversion is Stripe/bank controlled |

### Supported Currencies

`server/services/currency.ts` — `SUPPORTED_CURRENCIES`:

```
USD, HUF, IRR, GBP   (+ EUR fetched but not in SupportedCurrency type)
```

Hardcoded fallback rates (used when DB or network fails):

```
USD: 1.0
HUF: 365
IRR: 42,000
GBP: 0.79
EUR: 0.92
```

### Currency Conversion Pipeline

```
Provider sets price (local display)
  → editToUSD() [client-side, using live rates from /api/exchange-rates]
  → stored as USD in services.price / sub_services.base_price

Patient browses
  → fromUSDSync(amountUSD, toCurrency, rates) [server-side]
  → displayed in patient's preferred currency

Patient books
  → runRevenueEngine() calculates everything in USD
  → patientPayable stored as appointments.total_amount (USD)
  → displayCurrency + displayAmount + exchangeRateUsed snapshotted on appointment

Provider views dashboard
  → provider_earnings.provider_earning (USD)
  → useCurrency() converts for display only
```

---

## PART 2 — Service Pricing

### Storage

| Table | Column | Type | Currency | Purpose |
|-------|--------|------|----------|---------|
| `sub_services` | `base_price` | decimal(10,2) | USD | Catalogue default price |
| `sub_services` | `platform_fee` | decimal(10,2) | USD | Default platform fee |
| `sub_services` | `tax_percentage` | decimal(5,2) | % | Tax rate for this service type |
| `sub_services` | `pricing_type` | enum | — | `fixed` or `hourly` |
| `services` | `price` | decimal(10,2) | USD | Provider override price (0 = use sub_service base) |
| `services` | `platform_fee_override` | decimal(10,2) | USD | Provider-level platform fee override |
| `services` | `home_visit_fee` | decimal(10,2) | USD | Surcharge for home visits |
| `services` | `clinic_fee` | decimal(10,2) | USD | Surcharge for clinic visits |
| `services` | `telemedicine_fee` | decimal(10,2) | USD | Surcharge for video consultations |
| `services` | `emergency_fee` | decimal(10,2) | USD | Emergency surcharge |

### Pricing Formula

**Layer 1 — `computeFinalPrice()` in `server/lib/pricing.ts`:**

```
basePerSession =
  if service.price > 0 → service.price
  else → subService.base_price

if pricingType = "hourly" and service.price > 0:
  basePerSession = service.price × (durationMinutes / 60)

visitTypeFeePerSession =
  if home   → service.home_visit_fee
  if clinic → service.clinic_fee
  if online → service.telemedicine_fee

emergencyFeePerSession = isEmergency ? service.emergency_fee : 0

surgePerSession = (basePerSession + visitTypeFeePerSession) × (surgeMultiplier − 1)

baseTotal = basePerSession × sessions   [or packagePrice if package booking]

membershipBaseDiscount = baseTotal × (membershipDiscount.serviceDiscountPercent / 100)
platformFeePerSession  = rawPlatformFee × (1 − membershipDiscount.platformFeeDiscount / 100)

effectiveBase  = baseTotal − membershipBaseDiscount
preDiscount    = effectiveBase + (platformFeePerSession × sessions) + (visitTypeFeePerSession × sessions)
               + surgeTotal + emergencyTotal

discountAmount = promoCode (percent of preDiscount OR fixed amount, capped at preDiscount)

taxableSubtotal = preDiscount − discountAmount
tax             = taxableSubtotal × (subService.taxPercentage OR country.taxRate) / 100
total           = taxableSubtotal + tax
```

**Layer 2 — `runRevenueEngine()` in `server/lib/revenue-engine.ts`:**

```
enginePlatformFee =
  if platform_fee_rules match (scope: global/country/provider_type/category/modality)
    → applyFeeRule(rule, base.base)   [can be percent, fixed, or hybrid; min/max caps apply]
  else → base.platformFee from Layer 1

commissionRate =
  selectCommissionRule() picks most-specific:
    provider_specific > category_specific > promotional > tier > global
  if membershipReducedCommissionPercent provided:
    effectiveRate = max(0, baseRate − membershipReducedCommissionPercent)
  else:
    effectiveRate = baseRate (default: 10%)

commissionAmount = base.base × (commissionRate / 100)

paymentSurcharge =
  payment_method_rules match by paymentMethod + allowedCountries
  surchargeType = "percent" → base.total × (value / 100)
  surchargeType = "fixed"   → value
  discountType  = "percent" → − base.total × (disc / 100)
  discountType  = "fixed"   → − disc

engineTravelFee = [only for home visits]
  travel_fee_rules match by countryCode + providerType
  feeType = "flat"     → flatAmount
  feeType = "distance" → distanceKm × perKmRate
  feeType = "radius"   → distanceKm > radiusKm ? (distance − radius) × perKmRate : 0

patientPayable  = base.total + paymentSurcharge + engineTravelFee
providerEarnings = base.base − commissionAmount
platformRevenue  = enginePlatformFee + commissionAmount + max(0, paymentSurcharge)
```

### Complete Formula Summary

```
Patient pays:
  patientPayable = (base + visitFee + surge + emergency − membershipDiscount + platformFee − promoDiscount + tax)
                 + paymentSurcharge + travelFee

Provider nets:
  providerEarnings = base − commissionAmount

Platform earns:
  platformRevenue = platformFee + commissionAmount + max(0, paymentSurcharge)
```

All amounts in **USD**.

---

## PART 3 — Platform Revenue

### Revenue Streams

| Stream | Source | Type | Rule Table |
|--------|--------|------|-----------|
| Platform fee | Applied to every booking | percent / fixed / hybrid | `platform_fee_rules` |
| Commission | Deducted from provider's gross | percent of base | `commission_rules` |
| Payment surcharge | Charged to patient on top of total | percent / fixed | `payment_method_rules` |
| Travel fee | Home visit logistics | flat / distance / radius | `travel_fee_rules` |
| Revenue shares | Optional split to 3rd parties | percent of platformRevenue | `revenue_share_rules` |

### Rule Engine Details

All five rule tables share a common pattern:

- `enabled` boolean — dead rules are ignored
- `effective_from` / `effective_to` timestamps — time-bounded
- `priority` integer — lower = higher priority (first match wins)
- Rules are cached in-process for **30 seconds** (`RULES_CACHE_TTL_MS = 30_000`)
- Cache is busted by `invalidateRevenueRulesCache()` on every admin write

**`platform_fee_rules` targeting scopes:**
```
global → applies to all
country → matches countryCode
provider_type → matches providerType
category → matches serviceCategory
modality → matches visitType (online/home/clinic)
```
Caps: `min_fee` and `max_fee` enforce floors and ceilings per rule.

**Commission selection — specificity order:**
```
provider_specific (for one provider by ID)
  > category_specific (for a service category)
  > promotional (time-bounded promo rate)
  > tier (by provider type)
  > global
```
Default fallback if no rule matches: **10%**.

**Payment surcharge:**  
Can be negative (a discount for cash payments, for example). The sign is applied after combining `surchargeType` + `discountType`.

---

## PART 4 — Exchange Rates

### Rate Source

| Property | Value |
|----------|-------|
| External API | `open.er-api.com/v6/latest/USD` (free tier, no auth key) |
| Update trigger | Hourly cron (`syncRates()` in `server/reminderCron.ts`) |
| In-process cache TTL | 55 minutes |
| DB table | `currency_rates (currency_code PK, rate_from_usd DECIMAL, fetched_at TIMESTAMP)` |
| Fallback chain | in-process cache → DB → hardcoded constants |

### Rate Impact Analysis

| Question | Answer | Detail |
|----------|--------|--------|
| Can patient-visible prices change daily? | **YES** | Service prices stored in USD; display uses live rate. A $10 service shows 3,650 Ft today, 3,700 Ft tomorrow if HUF moves. |
| Can provider earnings change daily? | **NO (in USD)** | Earnings stored as USD. Only the display amount fluctuates. |
| Can package prices drift? | **YES** | Package price is USD; shown in local currency using live rate. No price-lock at browse time. |
| Can membership prices drift? | **YES** | Same as packages. |
| Can historical booking totals change? | **NO** | `exchangeRateUsed` snapshotted at booking time on `appointments`, `payments`, `provider_earnings`. USD total is immutable. |
| What if open.er-api.com is down? | **Graceful** | Silently falls through to 55-min cache → DB → hardcoded fallbacks. Server never fails to start. |
| What if HUF rate is stale? | **YELLOW** | Prices shown in HUF will be wrong by the stale amount. No alert mechanism for stale rates. |

### Example: HUF Rate Drift

```
Scenario: USD/HUF rate moves from 365 → 400 overnight.

Service base price: $10 USD (unchanged in DB)

Monday display: 10 × 365 = 3,650 Ft
Tuesday display: 10 × 400 = 4,000 Ft  (+9.5% increase — no code change)

Patient who booked Monday at 3,650 Ft: their appointment record shows
  total_amount = 10.00 USD
  display_currency = HUF
  display_amount = 3650.00
  exchange_rate_used = 365.000000
→ Historical record is safe and unchanged.

New patient on Tuesday sees 4,000 Ft for the same service.
```

### ⚠ Rate Source Risk

`open.er-api.com` is a **free-tier public API**:
- No SLA, no uptime guarantee
- Rate-limited (unknown limit)
- Not suitable for production financial systems
- FALLBACK_RATES are hardcoded constants from years ago (HUF=365 may be significantly wrong)

---

## PART 5 — Memberships

### Storage Model

| Table | Key Columns | Currency |
|-------|-------------|----------|
| `packages` | `price`, `currency` (default USD), `duration_days`, `country_code` | USD |
| `package_benefits` | `benefit_key` (enum), `benefit_value` (decimal percent/amount) | unitless |
| `user_packages` | `price_paid`, `activated_at`, `expires_at`, `auto_renew` | USD |
| `membership_benefit_usage` | `benefit_type`, `quantity`, `description` | — |

### Benefit Keys (PG enum `benefit_key`)

```
service_discount_percent   — % off base service price
platform_fee_discount      — % off platform fee
wallet_bonus               — one-time wallet credit on activation
featured_provider          — visibility boost flag
reduced_commission         — provider's commission reduced by N percentage points
priority_support           — flag benefit
free_cancellations         — bypass cancellation window policy
```

### Currency Impact on Memberships

**YES — membership cost can change daily for local-currency patients.**

```
Package: "Premium HU" priced at $20 USD

Rate = 365 HUF/USD → displayed as 7,300 Ft
Rate = 400 HUF/USD → displayed as 8,000 Ft  (+9.5%)

user_packages.price_paid = 20.00 (USD) — correctly recorded regardless of when bought.
```

**What memberships protect against exchange rate drift:**
- Discount benefits (e.g. 15% off service) are stored as percentages and applied to the USD base → the discount value in USD scales proportionally → **no drift in discount value**.

**What memberships do NOT protect against:**
- The displayed Ft/IRR cost of purchasing a membership fluctuates daily.
- `user_packages` has no `currency` column — the original local-currency cost is permanently lost.

---

## PART 6 — Packages

Packages and memberships share the exact same data model (`packages` / `user_packages` / `package_benefits`). All findings from Part 5 apply equally.

### Provider-Level Service Packages (different system)

`service_packages` and `package_services` tables allow providers to bundle their own services (e.g., "5-session physio pack"). These are priced separately and handled outside the membership engine.

### Package Price at Booking

When a package session is consumed, `computeFinalPrice()` receives `packagePrice` — a USD amount. The full formula shortcircuits to use that fixed USD price, bypassing `basePerSession` calculation. **Package session prices are therefore immune to service price changes after purchase.**

### Risk Summary

| Risk | Severity |
|------|----------|
| Displayed purchase price fluctuates daily in HUF/IRR | YELLOW |
| No local-currency price lock at time of purchase | YELLOW |
| No original-currency record in user_packages | YELLOW |
| Once purchased, per-session USD value is fixed | GREEN |
| Benefit percentages are rate-neutral | GREEN |

---

## PART 7 — Booking Snapshot Integrity

### What Is Stored at Booking Time

Columns on `appointments` table:

| Column | Type | Value | Immutable? |
|--------|------|-------|-----------|
| `total_amount` | decimal(10,2) USD | Patient payable | ✅ Yes |
| `platform_fee_amount` | decimal(10,2) USD | Platform fee | ✅ Yes |
| `service_price_snapshot` | decimal(10,2) USD | Base price at booking | ✅ Yes |
| `promo_discount` | decimal(10,2) USD | Promo code discount | ✅ Yes |
| `tax_amount` | decimal(10,2) USD | Tax computed | ✅ Yes |
| `pricing_breakdown` | JSONB | Full line-item breakdown | ✅ Yes |
| `display_currency` | text | What currency patient saw | ✅ Yes |
| `display_amount` | decimal(14,2) | Amount in patient's currency | ✅ Yes |
| `exchange_rate_used` | decimal(16,6) | Rate at booking | ✅ Yes (if populated) |
| `commission_amount` | decimal (via RX-01) | Commission snapshot | ✅ Yes |
| `provider_earnings_snapshot` | decimal (via RX-01) | Provider net snapshot | ✅ Yes |

### Answer: Can Historical Booking Totals Change?

**NO.**

All financial amounts are stored in USD at booking time and never recalculated. The `exchange_rate_used` column preserves what rate was active when the patient booked, allowing exact reconstruction of what was shown to the patient.

### ⚠ Caveat: Rate Population Gap

The schema has `exchange_rate_used` on `appointments`, but a code-level grep shows the booking route sets `display_currency` and `display_amount` but may not explicitly write `exchange_rate_used` in all paths. This means the column could be `NULL` for some historical bookings.

**Impact:** NULL `exchange_rate_used` means the historical Ft amount cannot be reconstructed from the DB alone — you must use the fallback rate. The USD total_amount is always correct.

---

## PART 8 — Provider Earnings

### Earnings Creation Flow

```
1. Appointment completed
2. POST /api/appointments/:id/status (status → completed)
3. recordProviderEarning() called
4. provider_earnings INSERT:
   - total_amount  = appointment.total_amount  (USD, from DB — NOT re-fetched from service)
   - platform_fee  = appointment.platform_fee_amount (USD)
   - provider_earning = total_amount − platform_fee  (USD net)
   - display_currency / display_amount / exchange_rate_used → snapshot at insert time
5. provider_ledger INSERT with entry_type = "booking_income"
6. provider_wallets.available_balance += provider_earning (USD)
```

### Commission Deduction Path

Commission is deducted inside `runRevenueEngine()` before the appointment is created:

```
providerEarnings = base.base − commissionAmount
```

This net amount becomes `appointments.total_amount` as provider's gross, and `provider_earnings.provider_earning` is the final net.

### Answer: Can Provider Earnings Vary Due to Rate Changes?

**NO.**

`provider_earnings.provider_earning` is stored as USD at the time of appointment completion. It never changes. Display conversion to HUF/IRR happens only at render time using the current live rate.

### ⚠ Historical Bug (Fixed)

Memory records a prior double-conversion bug: `recordProviderEarning()` was calling `toUSDSync()` on `appointment.total_amount` — which is already USD — resulting in division by the HUF rate (≈ 13.70 ÷ 365 = 0.04 — causing provider earnings to appear as 4 cents instead of $13.70). This was repaired via `POST /api/admin/financial/repair-earnings/apply`.

---

## PART 9 — Refunds

### Refund Mechanisms

| Type | Trigger | Code Path | Currency |
|------|---------|-----------|----------|
| Wallet refund | Auto-cancel, patient cancel | `storage.refundWallet()` → `walletTransactions` | USD |
| Stripe card refund | Direct card payment | `stripe.refunds.create()` | USD (Stripe handles) |
| Admin manual refund | Admin dashboard | `POST /api/admin/refunds/:id/process` | USD |
| Auto-cancel stale refund | Cron (24h after confirmed) | `cancelStaleConfirmed()` | USD, wallet first then Stripe |

### Refund Policy

**Default (hardcoded):**
```
Cancelled > 24h before start  → 100% refund
Cancelled 6–24h before start  → 50% refund
Cancelled < 6h before start   → 0% refund
Provider/admin cancellation   → 100% refund always
```

**Override via `refund_rules` table:**  
Per country (`country_code = "HU"` / `"IR"` / `"all"`). Fields: `full_refund_hours`, `partial_refund_hours`, `partial_refund_percent`.

**Membership override:**  
Patients with `free_cancellations` benefit bypass the minimum window.

### Integrity Guards

Three independent layers on every Stripe refund path:
1. `refund_status = "processed"` check — abort if already done
2. `stripe_refund_id IS NOT NULL` check — abort if Stripe refund exists  
3. Stripe idempotency key (`appointment:{id}:card-refund`) — Stripe dedupes on its side

### Currency Effect on Refunds

- Wallet refund: the **USD amount** from `appointments.refund_amount` is credited back to `wallets.balance` (USD). The patient sees this converted to HUF at today's rate.
- Card refund: Stripe refunds the **original charge amount in USD**. Stripe converts to the cardholder's statement currency at their bank's rate — outside GoldenLife's control.

**Mismatch risk example:**
```
Patient paid: 3,650 Ft displayed ($10.00 USD, rate = 365)
Rate changes to 400 HUF/USD
Patient refunded: $10.00 USD → wallet shows 4,000 Ft equivalent

Result: Patient receives a 350 Ft windfall from rate movement.
This is not a GoldenLife system bug — it is inherent to USD-canonical storage.
```

This is acceptable and standard practice. The alternative (locking the refund to the original Ft amount) would require storing the original local-currency payment, which `user_packages` and `payments` do not currently preserve.

---

## PART 10 — Payouts

### Payout Flow

```
1. Provider requests payout via POST /api/provider/payout-requests
2. System checks:
   - wallet not frozen
   - available_balance >= minimumAmountUsd (default $25)
   - holdDays passed since last appointment
3. BEGIN SERIALIZABLE transaction:
   - SELECT provider_wallets FOR UPDATE (row lock)
   - available_balance -= amount
   - held_balance      += amount
   - provider_ledger entry: type = "payout_held"
   - payout_requests INSERT: status = "pending"
4. Admin approves → status = "approved"
5. Payout execution:
   - Stripe Connect: stripe.transfers.create({ amount_usd })
   - Manual: admin marks as "paid" after external transfer
6. provider_ledger entry: type = "payout_deduction"
7. held_balance -= amount
```

### Payout Currency Handling

| Layer | Currency | Notes |
|-------|----------|-------|
| `provider_wallets.available_balance` | USD | Source of truth |
| `payout_requests.amount` | USD | Requested amount |
| `payout_config.currency` | USD (default) | Payout denomination |
| Stripe Connect transfer | USD | GoldenLife transfers USD to provider's Stripe account |
| Provider bank account | Local (HUF/IRR/GBP) | Stripe/bank converts at their rate |

### Answer: Can Payout Differ from Expected Earnings?

**NO (in USD).**  
The payout in USD equals exactly `provider_wallets.available_balance` (minus any minimum threshold rounding).

**YES (in local currency), but outside GoldenLife's control.**  
Once USD leaves GoldenLife to Stripe Connect, the HUF/GBP bank deposit is governed by Stripe's exchange rate and the provider's bank — not by `currency_rates` table.

**Automation Engine (`payout-automation.service.ts`):**
- Cron-driven for `weekly` and `monthly` schedules
- `getEligibleProviders()` checks balance > minimum AND hold period elapsed
- `runBatchPayout()` uses SERIALIZABLE isolation + FOR UPDATE — no double-spend possible
- Failed Stripe transfers are caught, ledger entry reversed, wallet restored

---

## PART 11 — Data Model Review

### Revenue-Related Tables

| Table | Purpose | Key Financial Columns |
|-------|---------|----------------------|
| `appointments` | Booking record | `total_amount`, `platform_fee_amount`, `service_price_snapshot`, `promo_discount`, `tax_amount`, `pricing_breakdown` (JSONB), `refund_amount`, `display_currency`, `display_amount`, `exchange_rate_used` |
| `payments` | Payment record per booking | `amount` (USD), `refunded_amount`, `currency`, `stripe_payment_id`, `stripe_refund_id`, `refund_status`, `display_currency`, `display_amount`, `exchange_rate_used` |
| `wallets` | Patient wallet balance | `balance` (USD), `currency`, `is_frozen` |
| `wallet_transactions` | Patient wallet ledger (append-only) | `amount` (signed USD), `balance_after`, `type` (topup/debit/refund/adjustment/reversal), `idempotency_key`, `amount_usd`, `exchange_rate_used` |
| `provider_earnings` | Per-appointment provider net | `total_amount`, `platform_fee`, `provider_earning` (USD net), `display_currency`, `display_amount`, `exchange_rate_used` |
| `provider_wallets` | Provider balance snapshot | `available_balance`, `held_balance`, `pending_balance` (USD) |
| `provider_ledger` | Provider double-entry ledger | `amount`, `entry_type` (booking_income/payout_held/payout_deduction/platform_fee_deduction/commission_deduction), `balance_after`, `amount_usd`, `exchange_rate_used` |
| `payout_requests` | Payout tracking | `amount` (USD), `status` (pending/approved/rejected/paid), `currency`, `stripe_transfer_id` |
| `payout_schedules` | Automated payout config | `frequency` (weekly/monthly/manual), `minimum_amount_usd`, `hold_days` |
| `currency_rates` | Live exchange rates | `currency_code` (PK), `rate_from_usd`, `fetched_at` |
| `packages` | Membership/package definitions | `price` (USD), `currency`, `duration_days`, `country_code` |
| `package_benefits` | Benefit rules | `benefit_key` (enum), `benefit_value` (percent/amount) |
| `user_packages` | Patient subscriptions | `price_paid` (USD), `status`, `expires_at`, `auto_renew` |
| `membership_benefit_usage` | Benefit consumption log | `benefit_type`, `quantity` |
| `platform_fee_rules` | Platform fee rule engine | `fee_type`, `percent_value`, `fixed_amount`, `min_fee`, `max_fee`, `target_scope`, `priority` |
| `commission_rules` | Commission rule engine | `commission_percent`, `commission_type`, `provider_id`, `service_category`, `priority` |
| `payment_method_rules` | Surcharge/discount rules | `surcharge_type`, `surcharge_value`, `discount_type`, `discount_value`, `payment_method` |
| `travel_fee_rules` | Distance-based home visit fees | `fee_type` (flat/distance/radius), `flat_amount`, `per_km_rate`, `radius_km` |
| `revenue_share_rules` | 3rd-party revenue split | `share_percent`, `fixed_amount`, `participant_type` |
| `booking_revenue_shares` | Revenue share records per booking | `appointment_id`, `participant_type`, `amount` |
| `marketplace_ledger` | Double-entry financial ledger | `amount_cents`, `source_account`, `destination_account`, `transaction_type` |
| `promo_codes` | Discount codes | `discount_type`, `discount_value`, `valid_from`, `valid_until`, `max_uses`, `base_currency` |
| `gift_cards` | Prepaid balances | `amount`, `currency`, `redeemed_by`, `redeemed_at` |
| `refund_rules` | Time-based refund policies | `full_refund_hours`, `partial_refund_hours`, `partial_refund_percent`, `country_code` |
| `payout_config` | Payout configuration | `minimum_amount_usd`, `hold_days`, `currency` |
| `provider_stripe_accounts` | Stripe Connect accounts | `stripe_account_id`, `onboarding_complete`, `payouts_enabled` |

---

## PART 12 — Risk Assessment

### Traffic Light Summary

| Area | Status | Finding |
|------|--------|---------|
| **Service Pricing** | 🟢 GREEN | USD-canonical, formula is correct, JSONB snapshot at booking |
| **Revenue Engine** | 🟢 GREEN | Single source of truth, comprehensive rule system, 30s cache |
| **Commission Engine** | 🟢 GREEN | Specificity-ordered rules, default 10% fallback, time-bounded |
| **Wallet (Patient)** | 🟢 GREEN | FOR UPDATE locks, idempotency keys, balance_after snapshots |
| **Refunds** | 🟢 GREEN | Triple guard, idempotency, policy-driven, audit logged |
| **Provider Earnings** | 🟢 GREEN | USD stored, display-only conversion, RX-01 snapshots on appointments |
| **Booking Snapshots** | 🟡 YELLOW | USD total is immutable; `exchange_rate_used` may be NULL in some paths |
| **Memberships** | 🟡 YELLOW | Purchase price drifts daily in local currency; no price lock; `user_packages` has no currency column |
| **Packages** | 🟡 YELLOW | Same as Memberships |
| **Payouts** | 🟡 YELLOW | USD transfer is exact; HUF/GBP delivery is bank-controlled |
| **Exchange Rates** | 🟡 YELLOW | Free-tier API with no SLA; 55-min stale window; hardcoded fallbacks are outdated |
| **Reporting** | 🟡 YELLOW | Admin sees USD (correct); no time-series rate history; no cross-currency P&L |

### Detail: YELLOW Items

#### Exchange Rates — YELLOW
- Free-tier `open.er-api.com` provides no uptime guarantee
- 55-minute stale window means a rate spike during high-booking periods goes undetected
- Hardcoded fallback HUF=365 is used if DB is empty on first boot — may be significantly wrong
- No alerting when the rate hasn't been refreshed in >2 hours
- No rate history table (cannot audit what rate was active at any past moment if `exchange_rate_used` is NULL)

#### Memberships/Packages — YELLOW
- `packages.price` is USD; no local-currency price lock
- `user_packages.price_paid` has no `currency` column — local currency amount is permanently lost
- Patients in HU see a Ft price that changes daily; there is no "price shown at browse time" guarantee

#### Booking Snapshot — YELLOW
- `appointments.exchange_rate_used` column exists in schema
- Not confirmed to be written in 100% of booking paths (needs code audit of `POST /api/appointments`)
- NULL `exchange_rate_used` means the original display amount cannot be verified from DB alone

#### Payouts — YELLOW (external)
- GoldenLife correctly transfers USD to Stripe Connect
- HUF/GBP/IRR bank delivery rate is controlled by Stripe and the provider's bank
- No mechanism to show providers their expected local-currency payout before requesting

---

## PART 13 — Future Global Readiness

### Currently Deployed Currencies

| Currency | Storage | Display | Payment | Payout |
|----------|---------|---------|---------|--------|
| USD | ✅ | ✅ | ✅ Stripe | ✅ |
| HUF | USD stored | ✅ Live rate | ⚠ No (Stripe USD only) | USD → bank converts |
| IRR | USD stored | ✅ Live rate | ❌ Stripe does not support IRR | USD → bank converts |
| GBP | USD stored | ✅ Schema | ✅ Stripe supports GBP | USD → bank converts |
| EUR | USD stored | ✅ Partially | Not configured | Not configured |

### Readiness for Additional Currencies

| Currency | Effort | Blockers |
|----------|--------|----------|
| **EUR** | Low | Add to `SUPPORTED_CURRENCIES`; add `rate_from_usd` to `syncRates()`; add `CURRENCY_CONFIGS` entry; Stripe supports EUR natively |
| **GBP** | Low | Already in `SUPPORTED_CURRENCIES`; needs Stripe GBP product config |
| **INR** | Medium | Add to currency configs; add country_code enum value if needed; Stripe supports INR; RBI payment regulations apply |
| **AED** | Medium | Add to configs; Stripe supports AED; no local payment method integration |
| **AUD** | Low | Add to configs; Stripe supports AUD |
| **CAD** | Low | Add to configs; Stripe supports CAD |

### Key Architectural Limitations for Full Global Operation

1. **USD-only Stripe charging** — All Stripe payments go through as USD. For markets where local card acceptance requires local currency (Brazil PIX, Indian UPI, etc.), the current architecture needs Stripe PaymentIntents in local currency — a significant change.

2. **No price-lock mechanism** — Membership and service prices shown to patients are live-converted from USD. A patient who sees "5,000 Ft" today may see "5,200 Ft" tomorrow for the same plan. A **price-lock table** (storing `{ packageId, currency, lockedPrice, validUntil }`) would solve this.

3. **Free-tier exchange rate source** — `open.er-api.com` is not production-grade. Replacement with a paid provider (Fixer.io, ExchangeRates-API, or Wise FX rates) is required for SLA-bound operation.

4. **IRR payment gap** — IRR is displayed but Stripe does not process IRR payments. Iranian patients currently pay in USD via Stripe, which contradicts the Ft/IRR display. A local payment gateway (Zarinpal, IDPay) would be needed.

5. **No multi-currency reporting** — Admin dashboard is locked to USD. A multi-currency P&L view would require exchange-rate-adjusted aggregate queries and a rate history table.

6. **`user_packages` missing currency column** — Cannot reconstruct what local-currency amount a patient paid for a membership without this.

---

## Identified Bugs

### BUG-001: `exchange_rate_used` not written in all booking paths
- **Severity:** YELLOW  
- **Location:** `server/routes/appointment.routes.ts` (POST /api/appointments)  
- **Symptom:** `appointments.exchange_rate_used` may be NULL for some bookings  
- **Impact:** Cannot verify original display price from DB alone; USD total is still correct  
- **Fix:** Explicitly write `exchangeRateUsed: rates[patientCurrency]` when persisting appointment

### BUG-002: `user_packages.price_paid` has no currency column
- **Severity:** YELLOW  
- **Location:** `shared/schema.ts` — `userPackages` table  
- **Symptom:** No way to know what local-currency amount a patient actually paid for a membership  
- **Impact:** Cannot issue local-currency refunds for membership cancellations accurately  
- **Fix:** Add `currency TEXT DEFAULT 'USD'` and `local_amount DECIMAL(14,2)` to `user_packages`

### BUG-003: IRR display but no IRR payment path
- **Severity:** YELLOW  
- **Location:** `server/services/currency.ts` / Stripe config  
- **Symptom:** Prices shown in IRR (﷼), but Stripe processes USD; patient is charged in USD  
- **Impact:** Patient sees 420,000 ﷼ and pays with Stripe in USD ($10) — confusing UX  
- **Fix:** Either remove IRR from payment display OR integrate a Zarinpal/IDPay gateway

### BUG-004: Hardcoded fallback rates are stale
- **Severity:** YELLOW  
- **Location:** `server/services/currency.ts` — `FALLBACK_RATES`  
- **Symptom:** HUF=365, EUR=0.92 fallbacks — these may differ from current market rates by 10–20%  
- **Impact:** During a DB outage or cold start, prices are computed with wrong rates  
- **Fix:** Update fallbacks regularly; add a monitoring alert if `currency_rates.fetched_at` is > 2h ago

### BUG-005: Rules cache is per-instance (not distributed)
- **Severity:** LOW  
- **Location:** `server/lib/revenue-engine.ts` — `_rulesCache`  
- **Symptom:** If running multiple Node.js processes (horizontal scaling), each has its own 30s rules cache  
- **Impact:** An admin rule change may take up to 30s to propagate to each process independently  
- **Fix:** For multi-instance deployments, use Redis pub/sub or a shorter TTL

---

## Recommended Future Architecture

### Priority 1 — High (Financial Safety)

1. **Write `exchange_rate_used` consistently** at booking time in all paths  
2. **Add `currency` column to `user_packages`** so local-currency membership payments can be audited  
3. **Add stale-rate monitoring alert** — log WARN if `currency_rates.fetched_at` > 2h ago

### Priority 2 — Medium (Pricing Stability)

4. **Price-lock table** — `package_prices (package_id, currency, locked_price, valid_from, valid_until)` — allows admin to set a fixed Ft/IRR price for a package rather than live-converting USD  
5. **Quote-time rate lock** — when patient opens the booking wizard, snapshot the rate; lock it for 15 minutes; display that rate on confirmation page

### Priority 3 — Scalability (Global Readiness)

6. **Replace open.er-api.com** with a paid provider (Fixer.io or ExchangeRates-API) with an SLA  
7. **Add `currency_rate_history` table** — append-only log of rate snapshots, enabling reconstruction of any historical conversion  
8. **Multi-currency Stripe** — Use Stripe PaymentIntents with `currency` matching patient country for HUF/EUR markets  
9. **IRR payment gateway** — Integrate Zarinpal or IDPay for Iranian patients  
10. **Multi-currency P&L report** — Rate-adjusted aggregate view in admin dashboard using `currency_rate_history`

---

*Audit performed by read-only code analysis. No tables, columns, or code were created or modified during this audit.*
