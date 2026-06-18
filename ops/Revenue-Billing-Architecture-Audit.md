# Revenue, Fees, Commissions & Billing Architecture Audit

**Date:** 2026-06-11  
**Status:** Audit Complete — No implementation changes made  
**Scope:** All fee logic, commission systems, billing tables, payment flows, and admin settings across the entire codebase

---

## Table of Contents

1. [Current Architecture Overview](#1-current-architecture-overview)
2. [Phase 1 — Database Inventory](#phase-1--database-inventory)
3. [Phase 2 — Service Pricing Audit](#phase-2--service-pricing-audit)
4. [Phase 3 — Booking Engine Audit](#phase-3--booking-engine-audit)
5. [Phase 4 — Payment Audit](#phase-4--payment-audit)
6. [Phase 5 — Wallet Audit](#phase-5--wallet-audit)
7. [Phase 6 — Provider Commission Audit](#phase-6--provider-commission-audit)
8. [Phase 7 — Membership Audit](#phase-7--membership-audit)
9. [Phase 8 — Promotion Audit](#phase-8--promotion-audit)
10. [Phase 9 — Admin Settings Audit](#phase-9--admin-settings-audit)
11. [Phase 10 — Revenue Flow Map](#phase-10--revenue-flow-map)
12. [Phase 11 — Target Architecture](#phase-11--target-architecture)
13. [Phase 12 — Admin Redesign Plan](#phase-12--admin-redesign-plan)
14. [Phase 13 — Dead Code Detection](#phase-13--dead-code-detection)
15. [Problems Summary](#problems-summary)
16. [Migration Strategy](#migration-strategy)

---

## 1. Current Architecture Overview

GoldenLife uses a **layered pricing engine** (`server/lib/pricing.ts`) as the single calculation entrypoint, but the architecture has **two independent payout/commission systems** running in parallel:

| System | Purpose | Location | Status |
|--------|---------|----------|--------|
| `computeFinalPrice()` | Patient-facing price calculation | `server/lib/pricing.ts` | **Active — canonical** |
| `marketplace_ledger` | Double-entry fund flow (escrow → split) | `server/routes/financials.routes.ts` | **Active — newer** |
| `recordProviderEarning()` | Provider wallet crediting with fee_split_ratio | `server/storage/database-storage.ts` | **Active — older, parallel** |
| `pricing_overrides` table | Admin price override rules | `server/routes/admin/admin-financial.routes.ts` | **Legacy — not wired to engine** |
| `provider_pricing_overrides` table | Provider-specific overrides (relational) | `shared/schema.ts` | **Orphaned — in schema only** |

The **critical problem** is that the platform earns revenue from two separate mechanisms that are not reconciled: the per-booking `platformFee` (a fixed line item charged to the patient) and the `marketplace_commission_rate` (15% taken from the provider's settlement). These are independent amounts, making the true platform revenue unclear.

---

## Phase 1 — Database Inventory

### 1.1 Service Pricing Tables

#### `sub_services`
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `base_price` | decimal | Default price for the service category | **Active** |
| `platform_fee` | decimal | Fixed platform fee per booking | **Active** |
| `tax_percentage` | decimal | Service-level tax override | **Active** |

#### `services` (provider-customised service listings)
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `price` | decimal | Provider's custom price (overrides sub_service.base_price) | **Active** |
| `admin_price_override` | decimal | Admin-forced price override | **⚠ Orphaned** — not read by `computeFinalPrice` |
| `platform_fee_override` | decimal | Provider-level platform fee override | **Active** |
| `home_visit_fee` | decimal | Surcharge for home visit bookings | **Active** |
| `clinic_fee` | decimal | Surcharge for clinic visit bookings | **Active** |
| `telemedicine_fee` | decimal | Surcharge for video consultation bookings | **Active** |
| `emergency_fee` | decimal | Surcharge for emergency bookings | **Active** |
| `enable_deposit` | boolean | Whether deposit is required | **⚠ Orphaned** — not in pricing engine |
| `deposit_amount` | decimal | Deposit amount | **⚠ Orphaned** — not in pricing engine |

#### `service_practitioners` (per-practitioner fee)
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `fee` | decimal | Practitioner-specific rate override | **Active** — read during booking resolution |

#### `service_price_history`
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `price`, `home_visit_fee`, `clinic_fee`, `telemedicine_fee`, `emergency_fee`, `platform_fee_override` | decimal | Historic snapshots | **Active** — audit trail only |

#### `provider_pricing_overrides` (relational override table)
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `consultation_fee` | decimal | Per-provider consultation fee override | **⚠ Orphaned** — in schema, cleaned by DB reset, never read by engine |
| `home_visit_fee` | decimal | Per-provider home visit override | **⚠ Orphaned** |
| `discount_percentage` | decimal | Per-provider discount | **⚠ Orphaned** |

#### `pricing_overrides` (legacy flat table)
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `override_type` | text | Type of override | **⚠ Legacy** — admin UI exists, not wired to engine |
| `value` | decimal | Override value | **⚠ Legacy** |
| `reason`, `expires_at`, `country_code` | text/timestamp | Metadata | **⚠ Legacy** |

---

### 1.2 Appointment & Billing Tables

#### `appointments`
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `total_amount` | decimal | Final price charged (USD) | **Active** |
| `platform_fee_amount` | decimal | Flat platform fee portion (USD) | **Active** |
| `service_price_snapshot` | decimal | Provider price at time of booking | **Active** |
| `promo_discount` | decimal | Discount applied | **Active** |
| `tax_amount` | decimal | Tax charged | **Active** |
| `refund_amount` | decimal | Amount refunded | **Active** |
| `display_amount` | decimal | Local currency display amount | **Active** |
| `exchange_rate_used` | decimal | Rate at booking time | **Active** |
| `pricing_breakdown` | jsonb | Full line-item breakdown | **Active** |

#### `invoices`
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `subtotal` | decimal | Pre-tax amount | **Active** |
| `tax_amount` | decimal | Tax on invoice | **Active** |
| `total_amount` | decimal | Invoice total | **Active** |

#### `invoice_items`
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `unit_price` | decimal | Line item unit price | **Active** |
| `total_price` | decimal | Line item total | **Active** |

---

### 1.3 Payment Tables

#### `payments`
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `amount` | decimal | Amount charged (USD) | **Active** |
| `refunded_amount` | decimal | Amount refunded | **Active** |
| `display_amount` | decimal | Local currency display | **Active** |
| `exchange_rate_used` | decimal | Rate at payment time | **Active** |

#### `promo_codes`
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `discount_type` | text | `"percentage"` or `"fixed"` | **Active** |
| `discount_value` | decimal | Amount/percentage off | **Active** |
| `base_currency` | text | Currency for fixed codes (default `"USD"`) | **Active** |
| `max_uses` | integer | Usage cap | **Active** |
| `used_count` | integer | Current usage | **Active** |
| `valid_from`, `valid_until` | timestamp | Validity window | **Active** |
| `applicable_providers` | text[] | Provider-scoped codes | **Active** |
| `min_amount` | decimal | Minimum order value | **Active** |

---

### 1.4 Wallet & Ledger Tables

#### `wallets` (Patient)
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `balance` | decimal | Available credit (always USD internally) | **Active** |

#### `wallet_transactions`
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `amount` | decimal | Transaction amount | **Active** |
| `balance_after` | decimal | Running balance | **Active** |
| `amount_usd` | decimal | USD equivalent | **Active** |

#### `provider_wallets`
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `available_balance` | decimal | Withdrawable funds (USD) | **Active** |
| `pending_balance` | decimal | Funds not yet released | **Active** |
| `held_balance` | decimal | Funds locked for payout in-transit | **Active** |
| `lifetime_earnings` | decimal | All-time total earned | **Active** |

#### `provider_ledger`
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `amount` | decimal | Entry amount | **Active** |
| `balance_after` | decimal | Running balance | **Active** |
| `amount_usd` | decimal | USD equivalent | **Active** |
| `entry_type` | enum | `appointment_earning`, `platform_fee_deduction`, `commission_deduction`, `tax_deduction`, `payout_held`, `payout_returned` | **Active** |

#### `marketplace_ledger`
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `amount_cents` | integer | Amount in cents | **Active** |
| `source_account` | text | `CLIENT_FUNDING`, `PLATFORM_ESCROW`, `PROVIDER_WITHDRAWABLE` | **Active** |
| `destination_account` | text | `PLATFORM_ESCROW`, `PROVIDER_WITHDRAWABLE`, `PLATFORM_REVENUE` | **Active** |
| `status` | text | `PENDING`, `SETTLED` | **Active** |

---

### 1.5 Earnings & Payout Tables

#### `provider_earnings`
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `total_amount` | decimal | Appointment total (USD) | **Active** |
| `platform_fee` | decimal | Platform portion | **Active** |
| `provider_earning` | decimal | Provider net after deductions | **Active** |
| `display_amount` | decimal | Local currency display | **Active** |

#### `payout_requests`
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `amount` | decimal | Requested payout (USD) | **Active** |
| `display_amount` | decimal | Local currency display | **Active** |
| `exchange_rate_used` | decimal | Rate at payout time | **Active** |

#### `providers` (fee-related columns)
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `fee_split_ratio` | decimal(5,4) | Provider's share (0–1, default 0.7) | **⚠ Conflict** — 0.70 = 30% platform; conflicts with 15% marketplace_commission_rate |
| `cancellation_policy_hours` | integer | Custom cancellation window | **Active** |
| `cancellation_fee_percent` | integer | Provider cancellation fee | **Active** |

---

### 1.6 Membership & Package Tables

#### `packages`
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `price` | decimal | Plan purchase price | **Active** |

#### `package_benefits`
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `benefit_key` | enum | Type of benefit | **Active** |
| `benefit_value` | decimal | Percentage or monetary value | **Active** |

#### `user_packages`
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `price_paid` | decimal | What patient paid for package | **Active** |

---

### 1.7 Supporting Tables

#### `tax_settings`
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `tax_rate` | decimal | Country-level tax rate (%) | **Active** |

#### `refund_rules`
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `partial_refund_percent` | integer | % refunded in partial scenarios | **Active** |
| `full_refund_hours`, `partial_refund_hours` | integer | Time thresholds | **Active** |
| `scenario`, `country_code` | text | Scoping | **Active** |

#### `gift_cards`
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `initial_amount` | decimal | Original value | **Active** |
| `balance` | decimal | Remaining value | **Active** |

#### `referrals`
| Column | Type | Purpose | Status |
|--------|------|---------|--------|
| `reward_amount` | decimal | Wallet credit given to referrer | **Active** |

#### `platform_settings`
| Key | Value | Purpose | Status |
|-----|-------|---------|--------|
| `marketplace_commission_rate` | decimal (default `0.15`) | Platform's % cut at settlement | **Active** |

---

## Phase 2 — Service Pricing Audit

### Price Resolution Hierarchy

```
1. service_practitioners.fee              ← per-practitioner override (highest priority)
2. services.price                         ← provider's custom price
3. sub_services.base_price                ← catalog default (lowest priority)
```

**Gap:** `services.admin_price_override` exists in the schema but is **never read** by `computeFinalPrice`. An admin setting that price has no effect on patient charges.

### Platform Fee Resolution Hierarchy

```
1. services.platform_fee_override         ← provider-level override (if not null)
2. sub_services.platform_fee              ← catalog default
```

**Gap:** `provider_pricing_overrides.consultation_fee` and `pricing_overrides` table entries are **never consulted** by the pricing engine.

### Visit Type Fees

All sourced from `services` columns (provider-customisable):
- `home_visit_fee` → home visits
- `clinic_fee` → clinic visits  
- `telemedicine_fee` → online/video visits

### Other Fee Components

| Component | Source | Condition |
|-----------|--------|-----------|
| Emergency fee | `services.emergency_fee` | `isEmergency = true` |
| Surge multiplier | Passed at booking time (from scheduling engine) | `surgeMultiplier > 1` |
| Tax | `sub_services.tax_percentage` OR `tax_settings.tax_rate` | Always applied |

### Deposit System

`services.enable_deposit` and `services.deposit_amount` exist in the schema but are **never incorporated** into `computeFinalPrice` or any payment flow. The deposit concept is **dead code**.

---

## Phase 3 — Booking Engine Audit

### Core File
`server/lib/pricing.ts` — `computeFinalPrice(input: PricingInput): PricingBreakdown`

### Exact Calculation Formula

```
Step 1 — Base Price
  basePerSession = service_practitioners.fee
                   ?? services.price
                   ?? sub_services.base_price
  
  If pricingType === "hourly":
    basePerSession = price × (durationMinutes / 60)

Step 2 — Platform Fee
  platformFeePerSession = services.platform_fee_override
                          ?? sub_services.platform_fee

Step 3 — Visit Type Fee
  visitTypeFeePerSession = services.home_visit_fee    (if home)
                           | services.clinic_fee      (if clinic)
                           | services.telemedicine_fee (if online)

Step 4 — Emergency & Surge
  emergencyFeePerSession = services.emergency_fee  (if isEmergency)
  surgePerSession = (base + visitFee) × (surgeMultiplier − 1)

Step 5 — Totals over N sessions
  baseTotal = packagePrice ?? (basePerSession × sessions)

Step 6 — Membership Discounts (applied to base and platform fee)
  membershipBaseDiscount  = baseTotal × (serviceDiscountPct / 100)
  platformFeePerSession   = platformFeePerSession × (1 − platformFeeDiscountPct / 100)

Step 7 — Pre-discount subtotal
  effectiveBase = baseTotal − membershipBaseDiscount
  preDiscount   = effectiveBase + platformFeeTotal
                + visitTypeFeeTotal + surgeTotal + emergencyTotal

Step 8 — Promo Code
  discountAmount = preDiscount × (promoValue / 100)   [percent type]
                 | promoValueUSD                        [fixed type, converted to USD]
  discountAmount = min(discountAmount, preDiscount)   [cap at 100%]

Step 9 — Tax
  taxableSubtotal = preDiscount − discountAmount
  effectiveTaxPct = sub_services.tax_percentage || tax_settings.tax_rate
  taxAmount       = taxableSubtotal × (effectiveTaxPct / 100)

Step 10 — Final Total
  total = taxableSubtotal + taxAmount
```

### Known Issues in the Engine

| # | Issue | Impact |
|---|-------|--------|
| B-01 | Promo `preDiscount` includes `platformFeeTotal` — a % promo reduces the platform's own fee revenue | Platform loses fee income on promoted bookings |
| B-02 | `admin_price_override` column is never read; admin UI for it has no effect | Admin confusion, dead column |
| B-03 | `provider_pricing_overrides` table never consulted | Override records created via admin UI but silently ignored |
| B-04 | `pricing_overrides` (legacy) table never consulted by engine | Same as B-03 |
| B-05 | No deposit collection path exists | Deposit feature is non-functional |
| B-06 | Surge multiplier comes from scheduling engine with no admin visibility | Cannot audit or override surge from admin panel |

---

## Phase 4 — Payment Audit

### Payment Methods

| Method | How Amount Is Determined | Surcharge | Status |
|--------|--------------------------|-----------|--------|
| **Stripe (card)** | `computeFinalPrice` total converted to local currency via Stripe checkout | None | **Active** |
| **Wallet** | `computeFinalPrice` total; wallet balance (USD) deducted first | None | **Active** |
| **Partial wallet + Stripe** | Wallet covers part; Stripe session created for `remainderDue` | None | **Active** |
| **Cash** | Manual admin ledger entry | None | **Active (admin-only)** |
| **Bank transfer** | Manual admin ledger entry | None | **Active (admin-only)** |
| **Gift card** | Redeems to wallet balance, then treated as wallet payment | None | **Active** |

**Finding:** There are **no payment-method-specific surcharges** anywhere in the current system. The `payment_providers` table supports country and currency filtering but contains no surcharge fields.

### Refund Policy

Defined in `server/lib/appointmentActions.ts` (`quoteRefund()`), with country-configurable overrides in `refund_rules` table:

| Scenario | Default Refund % |
|----------|-----------------|
| Provider cancels | 100% |
| Admin cancels | 100% |
| Patient cancels > 24 hours before | 100% |
| Patient cancels 6–24 hours before | 50% |
| Patient cancels < 6 hours before | 0% |
| No-show | 0% |

Additionally, providers have `cancellation_policy_hours` and `cancellation_fee_percent` columns for provider-level overrides — but the interaction between `refund_rules`, `quoteRefund()`, and provider-level policies is **not fully reconciled** (see Issues section).

### Stripe Idempotency

Two-layer guard: LRU in-process cache + DB `idempotency_keys` table. Webhook processing is safe against duplicate deliveries.

---

## Phase 5 — Wallet Audit

### Patient Wallet

- **Storage:** `wallets.balance` in USD; `wallet_transactions` for full ledger
- **Concurrency:** Row-level `FOR UPDATE` locking in `applyWalletDelta()`
- **Idempotency:** `idempotency_keys` table guards duplicate top-up webhooks
- **Top-up:** Stripe Checkout → `checkout.session.completed` webhook → 1:1 USD credit (no fees)
- **Gift card redemption:** `gift_cards.balance` → wallet credit
- **Referral rewards:** Credited to wallet on referred user's first paid appointment

### Wallet Application During Booking

```
totalAmount (USD from computeFinalPrice)
├── walletAmountUsed  → deducted from wallets.balance (atomic)
└── remainderDue
    ├── = 0  → appointment confirmed immediately
    └── > 0  → Stripe/cash session created for remainder
```

### Wallet Fees

**None.** No transaction fees, no top-up fees, no withdrawal fees exist anywhere in the codebase.

### Potential Issues

| # | Issue |
|---|-------|
| W-01 | No daily/monthly top-up limits — abuse vector for money laundering via gift cards |
| W-02 | `wallet_bonus` benefit key exists in membership schema but has no implementation in wallet logic |
| W-03 | Currency conversion on wallet debit uses live rates, so a patient's wallet balance in HUF display terms can drift between top-up and booking if rates move |

---

## Phase 6 — Provider Commission Audit

### System A — `marketplace_ledger` (Newer)

Operated by `server/routes/financials.routes.ts`.

```
Booking created:
  CLIENT_FUNDING → PLATFORM_ESCROW  (amount_cents = totalAmount × 100)
  status = PENDING

Admin settles appointment:
  POST /api/financials/settle-appointment
  
  providerCents = totalCents × (1 − commissionRate)   [commissionRate = 0.15 default]
  platformCents = totalCents × commissionRate
  
  PLATFORM_ESCROW → PROVIDER_WITHDRAWABLE  (providerCents)  status = SETTLED
  PLATFORM_ESCROW → PLATFORM_REVENUE       (platformCents)  status = SETTLED
```

**Commission rate:** 15% of total appointment amount, configured in `platform_settings.marketplace_commission_rate` (range 0–30%).

### System B — `recordProviderEarning()` (Older)

Operated by `server/storage/database-storage.ts`.

```
providerEarning = totalAmount × fee_split_ratio        [default fee_split_ratio = 0.7]
platformFee     = totalAmount × (1 − fee_split_ratio)  [default = 0.3 = 30%]

provider_wallets.available_balance += providerEarning
provider_earnings INSERT (total_amount, platform_fee, provider_earning)
provider_ledger INSERT (appointment_earning, platform_fee_deduction, tax_deduction entries)
```

### ⚠ Critical Conflict: Two Commission Rates

| System | Platform Cut | Provider Share | Trigger |
|--------|-------------|----------------|---------|
| marketplace_ledger | 15% | 85% | Admin manually calls settle-appointment |
| recordProviderEarning | 30% (1 − 0.70) | 70% | Automatic on appointment flow |

These are **two separate code paths** that are not mutually exclusive. If both run for the same appointment, the provider is charged commission twice. The audit could not conclusively determine whether both always run or only one does per appointment — this requires runtime tracing.

### ⚠ Additional Conflict: Platform Fee Double-Counting

The `platformFee` (fixed amount per booking, e.g., $5) is:
1. **Already included in `totalAmount`** — the patient pays it
2. **Included in the base for the 15% marketplace commission** — so the platform also takes 15% of its own fee

This means for a $100 base + $5 platform fee appointment:
- Patient pays: $105 (before tax/discounts)
- Marketplace_ledger platform revenue: $105 × 15% = $15.75
- Platform also directly received: the $5 platform fee (embedded in patient total)
- **Effective platform take: $20.75 (19.8% of patient payment)**

This is likely unintentional. The platform fee should probably be excluded from the commission base.

### Provider-Level Overrides

`providers.fee_split_ratio` can be set per-provider via:
```
PATCH /api/appointments/:id/resources
  → UPDATE providers SET fee_split_ratio = $1
```

This allows custom commission rates per provider but only affects System B (`recordProviderEarning`), not System A (`marketplace_ledger`).

---

## Phase 7 — Membership Audit

### Benefit Keys (full inventory)

| Benefit Key | Where Applied | Status |
|-------------|--------------|--------|
| `service_discount_percent` | `computeFinalPrice` → reduces `baseTotal` | **Active** |
| `platform_fee_discount` | `computeFinalPrice` → reduces `platformFeePerSession` | **Active** |
| `wallet_bonus` | NOT in `computeFinalPrice`, NOT in wallet top-up logic | **⚠ Orphaned** |
| `featured_provider` | Provider-side marketing flag — no pricing effect | **Informational** |
| `reduced_commission` | NOT in settlement logic, NOT in `computeFinalPrice` | **⚠ Orphaned** |
| `priority_support` | Support routing flag — no pricing effect | **Informational** |
| `free_cancellations` | NOT verified as hooked into `quoteRefund()` | **⚠ Unclear** |

### Discount Application Order

```
1. Membership discount applied to base price first
2. Membership discount applied to platform fee (% reduction)
3. Promo code applied to (discounted base + reduced platform fee + visit fees + surge + emergency)
4. Tax applied to (step 3 result)
```

### Stacking

Membership discounts and promo codes **stack**. There is no anti-stacking guard. A patient with a membership discount and a promo code gets both applied.

### Known Issues

| # | Issue |
|---|-------|
| M-01 | `wallet_bonus` benefit has no implementation — advertised to patients, does nothing |
| M-02 | `reduced_commission` benefit has no implementation — providers buying "reduced commission" packages receive no benefit |
| M-03 | `free_cancellations` benefit hookup not verified |
| M-04 | No maximum stacking cap — theoretical 100% discount possible with aggressive stacking |

---

## Phase 8 — Promotion Audit

### Promo Code Logic

| Property | Behavior |
|----------|----------|
| **Type: percent** | Removes N% from `preDiscount` (which includes platform fee) |
| **Type: fixed** | Removes a fixed USD amount (converted from `base_currency` at live rate) |
| **Cap** | Cannot reduce total below $0 |
| **Min amount** | `promo_codes.min_amount` — booking must exceed this |
| **Provider scope** | `applicable_providers[]` — can restrict to specific providers |
| **Time window** | `valid_from`, `valid_until` |
| **Usage tracking** | `used_count` incremented after successful booking save |

### Stacking Rules

- Membership + promo: **YES, they stack**
- Multiple promos simultaneously: **One promo code per booking only** (single `discount` input to `computeFinalPrice`)
- No documented policy preventing simultaneous stack exploitation

### Platform Fee Exposure via Promos

A percentage promo applies to `preDiscount` which includes `platformFeeTotal`. This means:
- 20% promo on a $100 appointment with $5 platform fee
- Promo reduces ($100 + $5) × 20% = $21 (including $1 off the platform fee)
- Platform loses $1 of its platform fee revenue on every promo booking

For high-volume promo campaigns this is a meaningful revenue leak.

---

## Phase 9 — Admin Settings Audit

### Complete Fee Settings Inventory

| Setting | Admin Location | Used in Engine | Classification |
|---------|---------------|---------------|----------------|
| `sub_services.platform_fee` | Sub-service editor | ✅ `computeFinalPrice` | **ACTIVE** |
| `services.platform_fee_override` | Service editor | ✅ `computeFinalPrice` | **ACTIVE** |
| `services.home_visit_fee` | Service editor | ✅ `computeFinalPrice` | **ACTIVE** |
| `services.clinic_fee` | Service editor | ✅ `computeFinalPrice` | **ACTIVE** |
| `services.telemedicine_fee` | Service editor | ✅ `computeFinalPrice` | **ACTIVE** |
| `services.emergency_fee` | Service editor | ✅ `computeFinalPrice` | **ACTIVE** |
| `tax_settings.tax_rate` | Tax Settings panel | ✅ `computeFinalPrice` (fallback) | **ACTIVE** |
| `sub_services.tax_percentage` | Sub-service editor | ✅ `computeFinalPrice` (primary) | **ACTIVE** |
| `platform_settings.marketplace_commission_rate` | Platform Financials | ✅ `settle-appointment` | **ACTIVE** |
| `refund_rules` | Admin Financial panel | ✅ `quoteRefund()` | **ACTIVE** |
| `payment_providers` | Config → Payment Providers | ✅ checkout filtering | **ACTIVE** |
| `package_benefits` (service_discount_percent) | Membership editor | ✅ `computeFinalPrice` | **ACTIVE** |
| `package_benefits` (platform_fee_discount) | Membership editor | ✅ `computeFinalPrice` | **ACTIVE** |
| `providers.fee_split_ratio` | Appointment resources panel | ✅ `recordProviderEarning` only | **ACTIVE (System B only)** |
| `services.admin_price_override` | Likely service editor | ❌ NOT in `computeFinalPrice` | **ORPHANED** |
| `services.enable_deposit` + `deposit_amount` | Likely service editor | ❌ NOT in payment flow | **DEAD CODE** |
| `pricing_overrides` table | Admin Financial → Overrides | ❌ NOT in `computeFinalPrice` | **LEGACY** |
| `provider_pricing_overrides` table | No visible admin UI | ❌ NOT in `computeFinalPrice` | **ORPHANED** |
| `package_benefits` (wallet_bonus) | Membership editor | ❌ NOT implemented | **ORPHANED** |
| `package_benefits` (reduced_commission) | Membership editor | ❌ NOT in settlement | **ORPHANED** |
| LedgerOverrides (manual escrow release) | Admin Financial panel | ✅ Direct DB write | **ACTIVE (manual only)** |

---

## Phase 10 — Revenue Flow Map

### Complete Patient Payment Flow

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PATIENT PAYMENT CALCULATION  (computeFinalPrice)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Base price (provider or catalog)
+ Visit type fee (home | clinic | online)
+ Platform fee (sub_service or service override)
+ Surge fee (base + visitFee) × (multiplier − 1)
+ Emergency fee (if applicable)
─────────────────────────────────────────────────
= Pre-membership subtotal

− Membership base discount    (service_discount_percent %)
− Membership platform fee discount  (platform_fee_discount %)
─────────────────────────────────────────────────
= Pre-promo subtotal  (includes discounted platform fee)

− Promo code discount  (% of pre-promo, or fixed USD)
─────────────────────────────────────────────────
= Taxable subtotal

+ Tax  (sub_service rate OR country tax_settings rate)
─────────────────────────────────────────────────
= TOTAL AMOUNT  (stored in USD; displayed in local currency)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PAYMENT COLLECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TOTAL AMOUNT
├── − walletAmountUsed  →  wallets.balance debited
└── = remainderDue
    ├── paid via Stripe (card)  →  Stripe Checkout in local currency
    └── paid via Cash/Bank Transfer  →  admin ledger entry

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FUNDS IN ESCROW  (marketplace_ledger)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CLIENT_FUNDING → PLATFORM_ESCROW  (PENDING)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SETTLEMENT  (admin-triggered)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PLATFORM_ESCROW × (1 − 0.15)  →  PROVIDER_WITHDRAWABLE
PLATFORM_ESCROW × 0.15         →  PLATFORM_REVENUE

  ⚠ ALSO running in parallel (System B):
  TOTAL AMOUNT × fee_split_ratio (0.70)  →  provider_wallets.available_balance
  TOTAL AMOUNT × (1 − 0.70)             →  platform (via provider_earnings)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GOLDENLIFE REVENUE (as currently structured)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  PLATFORM_REVENUE (System A: 15% of totalAmount)
  + platformFeeAmount embedded in totalAmount (already collected from patient)
  ⚠ These are additive — platform takes commission ON its own fee

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROVIDER PAYOUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

provider_wallets.available_balance
− payout request amount → held_balance
→ admin marks paid → balance cleared
```

---

## Phase 11 — Target Architecture

### Recommended Unified Revenue Engine

The goal is a **single source of truth** for every financial calculation with one admin control panel.

#### A. Platform Fee Engine
- **One setting:** `platform_fee_rules` table (replaces sub_services.platform_fee + services.platform_fee_override + provider_pricing_overrides + pricing_overrides)
- Rules: `{ sub_service_id?, provider_id?, visit_type?, fee_type: "fixed"|"percent", value, priority, country_code, active_from, active_until }`
- Engine resolves most-specific matching rule
- All existing column-based overrides migrate into rows in this table

#### B. Provider Commission Engine
- **Consolidate Systems A and B into one path**
- Replace `fee_split_ratio` + `marketplace_commission_rate` with a single `commission_rules` table
- Rules: `{ provider_id?, sub_service_id?, country_code?, rate_percent, active_from, active_until }`
- Default: 15% to platform (= provider keeps 85%)
- Settlement automatically triggered on appointment completion (not manual admin step)

#### C. Payment Method Surcharge Engine
- Add `payment_method_rules` table: `{ method, surcharge_type: "fixed"|"percent", value, country_code, currency_code }`
- Currently no surcharges — this provides the hooks for future implementation
- Admin-configured, not hardcoded

#### D. Membership Discount Engine
- Keep existing `package_benefits` structure but **implement all benefit keys:**
  - `service_discount_percent` — already active ✅
  - `platform_fee_discount` — already active ✅
  - `wallet_bonus` — credit wallet at purchase time (not at booking time)
  - `reduced_commission` — wire into commission engine's provider rule lookup
  - `free_cancellations` — hook into `quoteRefund()`

#### E. Promotion Engine
- Fix platform fee exposure: apply promo to `(effectiveBase + visitFee + surge + emergency)` only, NOT to platform fee
- Add `max_discount_cap` per promo to prevent over-discounting
- Add stacking policy flag: `allows_stacking_with_membership: boolean`

#### F. Tax Engine
- Keep existing two-level tax (sub_service → country fallback) — it works
- Add third level: `provider_tax_override` for providers in special tax zones

### Unified `computeFinalPrice` Formula (target)

```
base               = resolve(platformFeeEngine.basePrice)
visitFee           = resolve(platformFeeEngine.visitTypeFee)
platformFee        = resolve(platformFeeEngine.platformFee)
surge              = (base + visitFee) × (surgeMultiplier − 1)
emergency          = emergencyFee (if applicable)

membershipDiscount = base × membershipEngine.serviceDiscountPct
membershipPfDisc   = platformFee × membershipEngine.platformFeeDiscountPct

taxableBase        = (base − membershipDiscount)
                   + (platformFee − membershipPfDisc)   ← separated from promo scope
                   + visitFee + surge + emergency

promoDiscount      = promoEngine.calculate(taxableBase − platformFeeAfterMembership)
                                           ↑ platform fee excluded from promo base

taxableSubtotal    = taxableBase − promoDiscount
tax                = taxableSubtotal × taxEngine.rate
total              = taxableSubtotal + tax

paymentSurcharge   = paymentMethodEngine.calculate(total, method)  ← future
grandTotal         = total + paymentSurcharge
```

---

## Phase 12 — Admin Redesign Plan

### Proposed: Admin → Revenue & Billing Center

Single top-level tab in admin dashboard replacing:
- Scattered fee fields in service editor
- Platform Financials panel
- Pricing Overrides in admin-financial
- Tax Settings
- Payment Providers

#### Structure

```
Revenue & Billing Center
├── 1. Platform Fees
│   ├── Default platform fee per sub-service (table)
│   ├── Service-level overrides
│   └── Provider-level overrides
│
├── 2. Commission Rules
│   ├── Global default commission rate (currently in platform_settings)
│   ├── Per-provider overrides (replaces fee_split_ratio)
│   └── Membership-linked reduced commission
│
├── 3. Payment Method Rules
│   ├── Active payment providers (existing)
│   └── Surcharge rules per method (new)
│
├── 4. Tax Rules
│   ├── Country-level rates (existing tax_settings)
│   └── Sub-service overrides
│
├── 5. Discount & Promotion Rules
│   ├── Promo code management (existing, move here)
│   ├── Membership plan discounts (existing, move here)
│   └── Stacking policies
│
├── 6. Refund & Cancellation Rules
│   ├── Global refund rules (existing refund_rules table)
│   └── Provider cancellation policies
│
└── 7. Revenue Reports
    ├── Platform revenue (PLATFORM_REVENUE ledger)
    ├── Platform fees collected
    ├── Commission breakdown
    └── Reconciliation status
```

#### Old Screens/Panels to Remove (after migration)

| Panel | Reason for Removal |
|-------|--------------------|
| `pricing_overrides` section in Admin Financial | Replaced by unified Platform Fees panel |
| Individual fee fields scattered in service editor | Move to Revenue Center → Platform Fees |
| `platform_settings` commission rate inline in PlatformFinancials | Move to Revenue Center → Commission Rules |
| LedgerOverrides as standalone panel | Merge into Revenue Reports as action |

---

## Phase 13 — Dead Code Detection

### Orphaned / Unused Fields (DO NOT DELETE YET)

| Location | Field/Table | Classification | Recommendation |
|----------|-------------|----------------|----------------|
| `services.admin_price_override` | DB column | **ORPHANED** — never read by engine | Wire to computeFinalPrice or remove |
| `services.enable_deposit` | DB column | **DEAD CODE** — deposit system never built | Remove when deposit feature planned |
| `services.deposit_amount` | DB column | **DEAD CODE** | Same as above |
| `pricing_overrides` table | Full table | **LEGACY** — admin UI creates records nobody reads | Migrate data to new Platform Fees table, then drop |
| `provider_pricing_overrides` table | Full table | **ORPHANED** — in schema, in DB reset, never queried | Merge with Platform Fees table, then drop |
| `package_benefits` `wallet_bonus` value | Benefit key | **ORPHANED** — enum exists, no implementation | Implement in wallet top-up flow |
| `package_benefits` `reduced_commission` value | Benefit key | **ORPHANED** — enum exists, no implementation | Wire into commission engine |
| `package_benefits` `free_cancellations` value | Benefit key | **UNVERIFIED** — may not be hooked | Verify hookup in `quoteRefund()` |
| `providers.fee_split_ratio` | DB column | **CONFLICT** — duplicates marketplace_commission_rate logic | Consolidate into commission rules, then drop |
| `membership_benefit_usage` table | Full table | **UNUSED** — in schema, never written | Implement benefit usage cap logic or drop |

### Duplicate Calculation Systems

| Duplication | Systems Involved | Risk |
|-------------|-----------------|------|
| Provider commission calculated twice | `recordProviderEarning` (30%) + `marketplace_ledger` (15%) | **HIGH — possible double charging** |
| Platform fee embedded in total AND taken again as commission | `platformFeeAmount` column + 15% of total (including fee) | **MEDIUM — double revenue on platform fee** |
| Two override table designs | `pricing_overrides` + `provider_pricing_overrides` | **LOW — orphaned, but confusing** |

---

## Problems Summary

| # | Severity | Problem |
|---|----------|---------|
| P-01 | 🔴 CRITICAL | Two commission systems may both run for the same appointment (30% + 15%) |
| P-02 | 🔴 CRITICAL | Platform fee is included in marketplace_ledger commission base — platform takes commission on its own fee |
| P-03 | 🟠 HIGH | `admin_price_override` column exists and may be set by admin but has zero effect on prices charged |
| P-04 | 🟠 HIGH | `pricing_overrides` and `provider_pricing_overrides` tables are populated via admin UI but never read |
| P-05 | 🟠 HIGH | `wallet_bonus` and `reduced_commission` membership benefits are sold to customers but not implemented |
| P-06 | 🟡 MEDIUM | Percentage promo codes apply to the full preDiscount (including platform fee), leaking platform fee revenue |
| P-07 | 🟡 MEDIUM | Membership + promo stacking has no cap — theoretically free bookings possible with right combination |
| P-08 | 🟡 MEDIUM | Deposit system is in schema/UI but completely non-functional in payment flow |
| P-09 | 🟡 MEDIUM | Settlement (`settle-appointment`) is a manual admin action — missed settlements mean providers never get paid via System A |
| P-10 | 🟡 MEDIUM | `fee_split_ratio` on providers only affects System B; System A always uses global 15% regardless |
| P-11 | 🟢 LOW | `surge_multiplier` has no admin visibility or cap setting |
| P-12 | 🟢 LOW | `membership_benefit_usage` table is never written — no benefit usage caps enforced |

---

## Migration Strategy

### Phase 1 (Pre-implementation verification) — No code changes
1. Add runtime logging to determine whether both `recordProviderEarning` and `marketplace_ledger` are called for the same appointment
2. Identify one real completed appointment and trace its full financial footprint across all tables
3. Confirm whether `pricing_overrides` has any live data that is relied upon

### Phase 2 (Commission consolidation)
1. Determine canonical system (recommend: marketplace_ledger, auto-triggered on completion)
2. Disable System B (`recordProviderEarning`) or demote to ledger-only (no wallet credit)
3. Fix platform fee exclusion from commission base
4. Migrate `fee_split_ratio` per-provider values into commission_rules table

### Phase 3 (Pricing engine cleanup)
1. Wire `admin_price_override` into `computeFinalPrice` or remove the column
2. Migrate `pricing_overrides` + `provider_pricing_overrides` data into a unified platform fee rules table
3. Implement `wallet_bonus` and `reduced_commission` benefit keys
4. Fix promo code scope (exclude platform fee from promo base)

### Phase 4 (Admin panel)
1. Build unified Revenue & Billing Center
2. Remove legacy panels
3. Add stacking policy settings
4. Add commission rules UI

### Phase 5 (Cleanup)
1. Drop `pricing_overrides` and `provider_pricing_overrides` tables
2. Remove `fee_split_ratio` column
3. Remove or implement deposit fields
4. Implement `membership_benefit_usage` tracking

---

*Audit completed 2026-06-11. No implementation changes were made. All findings are read-only observations.*
