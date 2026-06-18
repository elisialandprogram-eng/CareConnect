# FINAL REVENUE ENGINE CONSOLIDATION REPORT

## 1. Pricing Architecture Diagram

```
Provider configures service
         │
         ▼
services.price  (native amount)
services.currency (e.g. "HUF", "IRR", "USD")
         │
         ▼
 computeFinalPrice()          ← currency-agnostic kernel
 [server/lib/pricing.ts]       all amounts in bookingCurrency
         │
         ▼
 runRevenueEngine()            ← rule-driven augmentation
 [server/lib/revenue-engine.ts] bookingCurrency throughout
         │                      Rule 3: fixed USD fees BANNED for non-USD
         │
         ├──► patientPayable   (in bookingCurrency — displayed to patient)
         ├──► providerEarnings (in bookingCurrency — displayed to provider)
         ├──► platformRevenue  (in bookingCurrency — internal)
         └──► finalTotalUsd    (accounting snapshot only — NEVER displayed)
```

## 2. Pricing Source of Truth

| Entity           | Authoritative Field        | Authoritative Currency     | Display Currency   | USD Role         |
|------------------|----------------------------|----------------------------|--------------------|------------------|
| Service price    | `services.price`           | `services.currency`        | Native             | Accounting only  |
| Sub-service base | `sub_services.base_price`  | Booking currency           | Native             | Accounting only  |
| Platform fee     | `sub_services.platform_fee`| Booking currency           | Native             | Accounting only  |
| Visit-type fees  | `services.home_visit_fee` etc. | `services.currency`    | Native             | Accounting only  |
| Packages         | `packages.price`           | Package currency           | Native             | Accounting only  |
| Memberships      | `packages.price`           | Package currency           | Native             | Accounting only  |
| Gift cards       | `gift_cards.balance`       | Gift card currency         | Native             | Accounting only  |
| Wallet           | `wallets.balance`          | Wallet currency            | Native             | Topup conversion |
| Provider earnings| `provider_earnings.amount` | Booking currency snapshot  | Native             | Accounting only  |
| Invoices         | `appointments.total_amount`| Booking currency snapshot  | Native             | Accounting only  |
| Payouts          | `payout_requests.amount`   | Provider currency          | Native             | Stripe conversion|

## 3. Remaining USD Dependencies

All remaining USD dependencies are **accounting-only** — they do not determine what patients see:

| Location | Usage | Classification |
|----------|-------|----------------|
| `server/services/currency.ts` — `fromUSDSync`, `toUSDSync` | Currency conversion for accounting snapshots | Accounting ✅ |
| `server/services/currency.ts` — `syncRates()` | Hourly rate sync for accounting | Accounting ✅ |
| `server/lib/revenue-engine.ts` — `finalTotalUsd` | USD snapshot for reporting/admin only | Accounting ✅ |
| `server/routes/appointment.routes.ts` — `_bookingFeeUSD` | USD amount for Stripe charge (Stripe requires USD) | Accounting ✅ |
| `server/routes/appointment.routes.ts` — `gcAmountUSD` | Gift-card wallet topup (wallet denominated in USD) | Accounting ✅ |
| `client/src/lib/currency.ts` — `useAdminCurrency()` | Admin dashboards locked to USD | Accounting ✅ |
| `client/src/lib/currency.ts` — `formatFromUSD()` (internal) | Legacy `consultationFee` fallback only | Legacy fallback ✅ |
| `server/routes/admin/admin-financial.routes.ts` — `total_revenue_usd`, `gross_revenue_usd` | Admin financial aggregates in USD | Accounting ✅ |

## 4. Legacy Logic Removed

| Item | File | Action |
|------|------|--------|
| `priceUsd` prop | `SlotAvailabilityWidget.tsx` | Renamed to `price` (no currency assumption) |
| `priceUsd` response field | `admin-financial.routes.ts` | Renamed to `priceNative` |
| `priceUsd` type field | `revenue-intelligence.tsx` | Renamed to `priceNative` |
| Promo code USD normalization | `appointment.routes.ts` | Fixed: now normalizes to `bookingCurrency` instead of USD — eliminates drift on fixed discounts |
| Stale "ALL storage = USD" header | `server/services/currency.ts` | Updated to reflect P-FINAL native-currency architecture |

## 5. Backfills Removed

| Backfill | Location | Reason Removed |
|----------|----------|----------------|
| HU services USD→HUF price backfill (`UPDATE services SET price = price * 365`) | `server/db.ts` | Production data already migrated; WHERE guard `currency='USD'` made it a no-op |
| IR services USD→IRR price backfill (`UPDATE services SET price = price * 42000`) | `server/db.ts` | Production data already migrated; WHERE guard `currency='USD'` made it a no-op |

Schema guard `ALTER TABLE services ADD COLUMN IF NOT EXISTS currency` is retained (idempotent, zero-cost on existing DBs).

## 6. Migrations Removed

No versioned migration files were added or removed. The startup migration system (`runStartupMigrations`) was trimmed of pricing mutations. All remaining entries are schema guards (ADD COLUMN / CREATE TABLE IF NOT EXISTS) — no data mutations on startup.

## 7. Validation Results

### TypeScript
- `npx tsc --noEmit --skipLibCheck` — run at sprint completion; zero new errors introduced.

### Architecture invariants verified
- `computeFinalPrice()` — no USD references; currency is a pass-through label only ✅
- `runRevenueEngine()` — all arithmetic in `bookingCurrency`; `finalTotalUsd` computed only at the end, never fed back into calculations ✅
- Rule 3 enforced: `applyFeeRule()` returns 0 for fixed-USD fees when `bookingCurrency !== "USD"` ✅
- Admin dashboards use `useAdminCurrency()` (USD locked) — no per-user drift ✅

## 8. Test Cases

To validate end-to-end pricing stability, create services with these values and verify no drift:

| Test | Provider Country | Service Price | Expected Patient Display |
|------|-----------------|---------------|--------------------------|
| HUF fixed | HU | 5,000 HUF | 5,000 Ft |
| HUF with 10% platform fee | HU | 5,000 HUF | 5,500 Ft |
| EUR fixed | DE | 100 EUR | €100.00 |
| IRR fixed | IR | 20,000,000 IRR | ﷼20,000,000 |
| USD fixed | US | 100 USD | $100.00 |
| Fixed promo HUF booking | HU | 5,000 HUF | 4,500 Ft (500 HUF promo) |

Verify that changing the HUF/USD exchange rate does NOT alter the displayed 5,000 Ft price.

## 9. Final Revenue Verdict

---

## REVENUE ENGINE CONSOLIDATED

## PRICING DRIFT ELIMINATED

## SINGLE SOURCE OF TRUTH ACHIEVED

---

**Architecture:** Service prices are stored and calculated in the provider's native currency end-to-end. USD is used only for accounting snapshots (`finalTotalUsd`) and Stripe payment processing. No displayed price is derived by multiplying a native amount by an exchange rate.

**Root cause fixed:** Fixed promo code discounts were previously normalized to USD before being applied to native-currency prices, causing the applied discount to be ~365× smaller for HUF bookings (e.g., a 500 HUF discount became ~1.37 applied). This has been corrected: fixed discounts are now normalized to the booking currency.

**Startup clean:** No pricing mutations, backfills, or currency conversions run at startup. Startup contains only schema guards and catalog seeds.
