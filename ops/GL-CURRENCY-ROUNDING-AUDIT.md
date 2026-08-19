# Golden Life Currency and Monetary Rounding Audit

**Audit date:** 2026-08-19  
**Scope:** Full repository review of currency conversion, rounding, pricing, tax, booking, payments, fees, discounts, provider earnings, wallets, ledgers, payouts, refunds, reports, notifications, and display formatting.  
**Audit mode:** Analysis only. No application behavior was changed as part of this audit.

## Executive summary

The project has an established currency architecture:

- Booking calculations use the provider's native booking currency.
- USD is the accounting currency for wallets, Stripe, provider wallets, ledgers, and settlement.
- HUF, IRR, JPY, and KRW are zero-decimal currencies.
- `shared/currency.ts` is the shared currency policy.
- `server/lib/math.ts` provides the server-side rounding helpers.
- `runRevenueEngine()` is the booking calculation authority.

The architecture is directionally correct, but the implementation still contains inconsistent rounding and currency boundaries. The most important findings are:

1. Admin refund approval calculates a USD refund but writes it to an appointment refund field consumed elsewhere as booking currency.
2. Pricing rounds components before the revenue engine reuses them in later calculations.
3. Tax allocation independently rounds service and platform buckets, which can make their sum differ from the rounded discounted base, especially in HUF/IRR.
4. Provider settlement converts and rounds each local component independently, creating possible USD reconciliation drift.
5. Fixed, minimum, maximum, payment-method, and travel-fee rule currencies are not governed by one explicit contract.
6. The frontend exposes several formatter/conversion APIs with different full-unit, minor-unit, USD, and local-currency contracts.

This is not a case for replacing every `Math.round()` with another function. The project needs explicit monetary boundaries and reconciliation invariants.

## Severity summary

| Severity | Area |
|---|---|
| High | Admin refund currency mismatch |
| High | Early pricing/component rounding |
| High | Tax allocation residual mismatch |
| High | Provider settlement component conversion rounding |
| High | Fixed-fee currency semantics |
| High | Duplicate frontend formatter contracts |
| Medium | Zero-decimal values persisted with two-decimal serialization |
| Medium | Local payout input does not enforce zero-decimal precision |
| Medium | Promo round-trip conversions |
| Medium | Mixed local/USD provider earnings display |
| Medium | Stale revenue-engine currency documentation |

---

# A. Complete calculation inventory

## A.1 Shared currency policy

### `shared/currency.ts:9-24`

Defines supported currencies, locales, symbols, and fraction digits. HUF, IRR, JPY, and KRW are configured as zero-decimal currencies.

### `shared/currency.ts:53-64`

`roundCurrencyAmount()` performs currency-aware half-up rounding. This is the correct shared policy for final monetary boundaries and display.

### `shared/currency.ts:66-82`

`formatCurrencyAmount()` rounds and formats using `Intl.NumberFormat`. This is appropriate for final display.

### `shared/currency.ts:86-93`

`formatCurrencyMinorUnits()` interprets input as minor units. This is correct only when callers actually provide cents/fillér/etc., not ordinary full currency units.

## A.2 Server math utilities

### `server/lib/math.ts:17-19`

`roundToCents()` converts USD full units to integer cents. This is appropriate for wallets and Stripe.

### `server/lib/math.ts:25-27`

`round2()` rounds as USD/full two-decimal currency.

### `server/lib/math.ts:35-36`

`roundBookingAmount()` delegates to the shared currency policy and is appropriate for booking-currency boundaries.

## A.3 Currency conversion

### `server/services/currency.ts:99-107`

`fromUSDSync()` and `toUSDSync()` preserve precision. This is appropriate for intermediate calculations.

### `server/services/currency.ts:115-129`

`convertUSDToLocal()` and `convertLocalToUSD()` convert and round at the target boundary. They should not be used for intermediate calculations where precision must be retained.

### `server/services/currency.ts:133-148`

`formatSync()` assumes USD input and converts it for display. `formatLocal()` assumes the input is already in the display currency. Both contracts are valid but not type-distinguishable.

### `server/services/currency.ts:159-163`

`toStripeAmount()` applies currency-specific minor-unit rules. This is correct in principle; the production platform currently charges in USD.

## A.4 Pricing kernel

### `server/lib/pricing.ts:91-153`

Calculates base price, hourly price, session totals, membership discount, visit fees, surge, emergency fee, promo discount, taxable subtotal, and pre-tax total. Intermediate values are initially kept at full precision.

### `server/lib/pricing.ts:157-200`

Returned pricing lines and all returned component fields are rounded using the booking currency.

## A.5 Revenue engine

### `server/lib/revenue-engine.ts:254-290`

Calculates platform fees, including percentage, fixed, hybrid, minimum, and maximum values, then rounds the result in booking currency.

### `server/lib/revenue-engine.ts:317-334`

Calculates payment-method surcharge and discount, including fixed values, then rounds in booking currency.

### `server/lib/revenue-engine.ts:349-370`

Calculates flat, distance, and radius travel fees, then rounds in booking currency.

### `server/lib/revenue-engine.ts:470-514`

Rounds fee deltas, payment base, payment adjustments, service subtotal, taxable subtotal, final total, provider earnings, and platform revenue.

### `server/lib/revenue-engine.ts:535-541`

Converts the final booking-currency patient payable to USD for reporting and payment processing.

## A.6 Tax engine

### `server/lib/tax-engine.ts:112-151`

Calculates service and platform taxable buckets, allocates discounts proportionally, rounds both taxable buckets, calculates each tax, and rounds the total tax.

## A.7 Booking persistence

### `server/routes/appointment.routes.ts:1027-1114`

Uses `runRevenueEngine()`. `finalTotalUsd` is used for payment processing while booking-currency snapshots are retained for display and audit.

### `server/routes/appointment.routes.ts:1164-1180`

Persists service price, tax, and package discount snapshots using `.toFixed(2)`.

### `server/routes/appointment.routes.ts:1510-1517`

Creates the payment aggregate with USD total and booking-currency display amount/currency.

## A.8 Wallets and payment allocations

### `server/storage/database-storage.ts:3995-4002`

Wallet balances are maintained using integer USD cents. This is correct.

### `server/storage/database-storage.ts:4040-4087`

Top-ups, debits, refunds, and admin adjustments use `roundToCents()`. This is correct for USD wallets.

### `server/services/payment.service.ts:277-345`

Payment allocations are rounded to USD cents and update wallet/payment aggregates atomically.

### `server/services/payment.service.ts:820-845`

Refund allocations and aggregate refunded amounts are maintained in USD cents/two-decimal USD values.

## A.9 Group sessions

### `server/storage/group-sessions.mixin.ts:445-453`

Native session price is converted to USD before wallet comparison/debit.

### `server/storage/group-sessions.mixin.ts:471-505`

Wallet debits use USD cents and participant `amount_paid` is stored in USD.

### `server/storage/group-sessions.mixin.ts:532-550`

Cancellation refunds use the stored USD participant amount and credit the USD wallet.

## A.10 Provider settlement and earnings

### `server/lib/provider-settlement.ts:58-81`

Local provider earnings, tax, platform fees, and commission are independently rounded, converted to USD, and independently rounded again.

### `server/storage/database-storage.ts:3362-3381`

Provider earning snapshots are serialized as two-decimal values, including local values.

### `server/storage/database-storage.ts:3398-3422`

Online provider wallet income uses the USD settlement amount.

## A.11 Payouts

### `server/routes/provider-wallet-payouts.routes.ts:367-372`

Provider-entered local payout amount is converted to USD before wallet validation.

### `server/routes/provider-wallet-payouts.routes.ts:432-445`

Payout request stores USD amount, local display amount, exchange rate, and settlement snapshots with fixed decimal serialization.

## A.12 Refunds

### `server/routes/appointment.routes.ts:3308-3325`

Appointment refund snapshots are derived from booking-currency appointment totals.

### `server/routes/admin/admin-financial.routes.ts:1317-1344`

Admin refund amount is calculated from USD payment fields and written to `appointments.refund_amount`.

## A.13 Promotions

### `server/routes/community.routes.ts:49-82`
### `server/routes/catalog.routes.ts:556-584`
### `server/routes/appointment.routes.ts:976-1006`

Promo thresholds and values can be converted local → USD → target local before being applied.

## A.14 Frontend display and conversion

### `client/src/lib/currency.ts:136-142`

`useCurrency().format()` assumes USD input and converts it to the user's display currency.

### `client/src/lib/currency.ts:248-259`

`formatCurrencyForCountry()` assumes the input is already local.

### `client/src/lib/currency.ts:265-275`

`convertBetweenCurrencies()` converts full units through USD and rounds to the target currency.

### `client/src/lib/currency.ts:315-323`

`formatInCurrency()` assumes the input is already in the target currency.

### `client/src/lib/currency.ts:169-190`

`formatCurrency()` documents a minor-unit input contract, which differs from the project's normal full-unit monetary values.

### `client/src/pages/provider-earnings.tsx:135-160`

Provider earnings display combines stored local values with USD-derived fallback values and may format different row fields through different rounding paths.

---

# B. Problematic locations

## B.1 Admin refund currency mismatch — High

**Location:** `server/routes/admin/admin-financial.routes.ts:1317-1344`

`totalPaid` and `refundAmt` are derived from USD payment columns:

```ts
paid_amount_usd - refunded_amount
```

The result is written to `appointments.refund_amount`.

The financial master report treats appointment refund fields as booking currency:

```ts
client/src/components/admin/dashboard/financial-master-report.tsx:177-181
```

For a HUF or IRR booking, a USD refund can therefore be displayed as HUF/IRR. This is a confirmed currency-contract conflict.

## B.2 Early pricing/component rounding — High

**Locations:**

- `server/lib/pricing.ts:157-200`
- `server/lib/revenue-engine.ts:432-514`

`computeFinalPrice()` rounds returned components. The revenue engine then uses those rounded components as inputs to later fees, taxes, totals, and provider economics.

This can produce one-cent USD differences or full-unit differences in zero-decimal currencies.

## B.3 Tax allocation residual mismatch — High

**Location:** `server/lib/tax-engine.ts:122-145`

Service and platform taxable subtotals are independently rounded. Their sum can differ from the rounded discounted total.

Example:

```text
service gross = 1 HUF
platform gross = 1 HUF
discount = 1 HUF
allocated bases = 0.5 HUF + 0.5 HUF
rounded bases = 1 HUF + 1 HUF
original discounted total = 1 HUF
```

## B.4 Provider settlement component drift — High

**Location:** `server/lib/provider-settlement.ts:58-77`

Each local component is rounded and converted to USD independently. Component totals can differ from converting the canonical aggregate once.

This affects provider earnings, tax pass-through, platform-fee deductions, commission deductions, and reconciliation reports.

## B.5 Fixed/min/max fee currency semantics — High

**Locations:**

- `server/lib/revenue-engine.ts:254-290`
- `server/lib/revenue-engine.ts:327-330`
- `server/lib/revenue-engine.ts:364-370`

Fixed platform fees are skipped for non-USD bookings, but minimum and maximum values are still applied directly in booking currency. Fixed payment adjustments and travel fee rules also lack one explicit currency policy.

## B.6 Frontend formatter contract duplication — High

**Location:** `client/src/lib/currency.ts:136-323`

The frontend has separate USD, local, minor-unit, and conversion helpers, all accepting plain numbers. The compiler cannot prevent a local amount from being passed into a USD formatter or a full-unit value from being passed into a minor-unit formatter.

## B.7 Zero-decimal snapshot serialization — Medium

**Locations:**

- `server/routes/appointment.routes.ts:1164-1180`
- `server/storage/database-storage.ts:3362-3381`

Native HUF/IRR values are serialized with two decimal places. This does not necessarily lose value, but it weakens the zero-decimal invariant and permits invalid fractional local amounts unless validation is enforced separately.

## B.8 Payout input precision — Medium

**Location:** `server/routes/provider-wallet-payouts.routes.ts:367-372`

Local payout input is converted to USD without first normalizing or rejecting fractional HUF/IRR amounts.

## B.9 Group-session conversion boundary — Medium

**Location:** `server/storage/group-sessions.mixin.ts:445-453`

Native session prices are converted to USD without first enforcing the native currency's precision.

## B.10 Promo round-trip conversion — Medium

**Locations:**

- `server/routes/community.routes.ts:49-82`
- `server/routes/catalog.routes.ts:556-584`
- `server/routes/appointment.routes.ts:976-1006`

Same-currency promotions can be unnecessarily converted local → USD → local, creating avoidable drift.

## B.11 Mixed provider earnings display — Medium

**Location:** `client/src/pages/provider-earnings.tsx:135-160`

The display resolver may combine stored local snapshots with converted USD fallback values in the same row. The values can have different rounding histories.

## B.12 Stale revenue-engine contract — Medium

**Location:** `server/lib/revenue-engine.ts:6-15`

The module header says all amounts are USD, while the implementation returns booking-currency values plus a separate USD total. This documentation conflict can lead to future double conversion.

---

# C. Recommended universal monetary-rounding strategy

1. Use full currency units inside pricing calculations.
2. Preserve precision between monetary boundaries.
3. Round only at explicit booking-currency, tax, payment, accounting, and display boundaries.
4. Use `roundBookingAmount()` for booking currency.
5. Use `round2()`/`roundToCents()` only for USD accounting.
6. Convert the final local aggregate to USD once.
7. Use residual allocation whenever a rounded total is split into components.
8. Never feed display-rounded values back into calculations.
9. Enforce zero-decimal precision for HUF, IRR, JPY, and KRW.
10. Make every monetary field's currency explicit in its name or type.

## Recommended boundaries

### Booking currency

Round at:

- Final booking line values.
- Final service taxable subtotal.
- Final platform taxable subtotal.
- Service tax.
- Platform tax.
- Total tax.
- Final patient payable.
- Provider local earning snapshot.
- Booking-currency refund snapshot.

### USD accounting

Round at:

- Final conversion of booking payable to USD.
- Wallet debit/credit.
- Payment allocation.
- Stripe amount.
- Provider wallet credit/debit.
- Ledger amount.
- Payout amount.
- USD refund amount.

---

# D. Recommended location for the strategy

## Backend

Keep the shared policy in:

```text
shared/currency.ts
```

Keep backend helpers in:

```text
server/lib/math.ts
```

Recommended additional concepts:

- USD full-unit rounding.
- USD integer-cent conversion.
- Booking-currency rounding.
- Currency precision validation.
- Rounded residual allocation.
- Aggregate conversion at accounting boundaries.

## Frontend

Expose explicit helpers with contracts such as:

- `formatUsdAmount(value)`
- `formatLocalAmount(value, currency)`
- `formatMinorUnits(value, currency)`
- `convertLocalToUsdAtBoundary(value, currency, rates)`
- `convertUsdToLocalAtBoundary(value, currency, rates)`

Avoid relying on generic `format()`, `convert()`, or ambiguous `formatCurrency()` names for financial values.

---

# E. Exact places that should use the canonical strategy

1. `server/lib/pricing.ts`
   - Preserve internal precision.
   - Round only contract outputs.

2. `server/lib/revenue-engine.ts`
   - Avoid using display-rounded components as calculation inputs.
   - Define currencies for fixed/min/max rule values.

3. `server/lib/tax-engine.ts`
   - Add residual allocation for service/platform taxable bases and taxes.

4. `server/routes/appointment.routes.ts`
   - Normalize native snapshots.
   - Store explicit local and USD refund values.

5. `server/routes/admin/admin-financial.routes.ts`
   - Convert USD admin refunds to booking currency before writing local snapshot fields, or write only to an explicit USD field.

6. `server/lib/provider-settlement.ts`
   - Convert canonical aggregates once.
   - Allocate USD component residuals deterministically.

7. `server/routes/provider-wallet-payouts.routes.ts`
   - Normalize local payout input before USD conversion.

8. `server/storage/group-sessions.mixin.ts`
   - Validate native price precision before conversion.

9. Promo conversion paths:
   - `server/routes/community.routes.ts`
   - `server/routes/catalog.routes.ts`
   - `server/routes/appointment.routes.ts`

10. `client/src/lib/currency.ts`
    - Consolidate formatter contracts.
    - Separate full units from minor units explicitly.

11. `client/src/pages/provider-earnings.tsx`
    - Select one display currency per row.
    - Distinguish stored-local and converted-display values.

12. Admin reports
    - Keep booking snapshot fields in their stored booking currency.
    - Keep wallets, provider settlements, and ledger fields in USD.
    - Prefer stored currency metadata over country inference.

---

# F. Places where rounding should not happen

Do not round:

1. Before percentage calculations.
2. Before applying discounts.
3. Before applying surge.
4. Before calculating distance fees.
5. Before allocating discounts between tax domains.
6. Before converting a final local aggregate to USD.
7. Between additions in a subtotal.
8. During unnecessary local → USD → local intermediate conversions.
9. During analytics aggregation.
10. When calculating provider earnings from normalized snapshots.
11. Before calculating allocation residuals.
12. Before display-only formatting.

---

# G. Precision rules

## Zero-decimal currencies

HUF, IRR, JPY, and KRW must have:

- No fractional final booking amount.
- No fractional tax.
- No fractional discount.
- No fractional local payout.
- No fractional local refund snapshot.
- Half-up rounding at final boundaries.
- Residual allocation for split totals.

Existing two-decimal database columns may remain for compatibility, but writes should enforce integer-valued monetary data for zero-decimal currencies.

## Two-decimal currencies

USD, EUR, and GBP should:

- Preserve precision during calculations.
- Round to two decimals at monetary boundaries.
- Use integer cents for USD wallets and Stripe.
- Avoid using `.toFixed()` as a calculation operation.

## USD accounting

- Wallet balances and provider ledgers should reconcile in integer cents.
- Stripe amounts must be integer minor units.
- Provider settlement component totals must reconcile to the canonical USD aggregate.
- USD conversion should occur once from the final local aggregate.

---

# H. Tests required

## Core rounding

- Positive and negative half-up rounding.
- HUF, IRR, JPY, and KRW `.5` cases.
- USD `1.005 → 1.01`.
- NaN, Infinity, null, and empty input.
- Small and large values.

## Pricing

- Hourly fractional pricing.
- Multiple sessions.
- Membership plus promo.
- Promo plus platform fee.
- Promo plus travel fee.
- Payment surcharge plus tax.
- Zero-decimal `.5` component cases.
- Line-total reconciliation.

## Tax

- Service/platform `0.5 + 0.5` allocation.
- Discount residual allocation.
- Tax residual allocation.
- Explicit 0% rule.
- Missing tax rule.
- `serviceTax + platformTax === totalTax`.

## Conversion

- Same-currency conversion identity.
- High-rate currencies.
- Six-decimal exchange rates.
- Missing/zero rate handling.
- No unnecessary local → USD → local conversion.
- One final conversion boundary.

## Wallet/payment

- USD-cent top-up, debit, and refund.
- Partial wallet plus Stripe payment.
- Allocation reconciliation.
- Refund never exceeding paid amount.
- Stripe amount matching payment amount.

## Provider settlement

- Local component sum reconciliation.
- USD aggregate reconciliation.
- HUF/IRR provider earnings.
- Online and offline settlement.
- Tax pass-through.
- Commission deduction.
- Payout conversion and ledger reconciliation.

## Refunds

- Full and partial refunds.
- HUF and IRR bookings.
- Admin refund currency.
- Wallet refund currency.
- Stripe refund cents.
- Refund notification currency.
- Report currency.

## Frontend formatter contracts

- USD full-unit formatting.
- Local full-unit formatting.
- Minor-unit formatting.
- Provider-native price display.
- USD wallet display.
- Provider earnings row consistency.
- Admin report booking versus USD field formatting.

---

## Final assessment

The project should not replace every `Math.round()`, `Math.floor()`, or `.toFixed()` mechanically. The required remediation is to:

1. Preserve precision inside calculations.
2. Define explicit local-currency and USD accounting boundaries.
3. Repair tax and settlement residual allocation.
4. Resolve fixed-fee currency semantics.
5. Separate USD refund values from booking-currency refund snapshots.
6. Consolidate frontend formatter contracts.
7. Add reconciliation invariants and zero-decimal currency tests.

The first remediation priorities are:

1. Admin refund currency mismatch.
2. Tax allocation residual mismatch.
3. Provider settlement component conversion rounding.
4. Early pricing rounding.
5. Fixed/min/max/travel rule currency semantics.
6. Frontend formatter contract consolidation.