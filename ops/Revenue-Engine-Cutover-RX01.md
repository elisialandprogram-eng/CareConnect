# Sprint RX-01 — Revenue Engine Cutover

**Date:** 2026-06-11  
**Status:** ✅ Complete  
**TypeScript:** EXIT 0 (clean)

---

## Console Errors Fixed

### Bug 1 — `invalid input value for enum payment_status: "partial"` and `'escrow'`

**File:** `server/routes/admin/admin-financial.routes.ts` line ~1464  
**Root cause:** Escrow-pending query used `IN ('pending', 'partial', 'failed', 'escrow')`. The `payment_status` PG enum only contains `pending | completed | refunded | failed`. Both `'partial'` and `'escrow'` are invalid values.  
**Fix:** Changed the `IN` clause to `IN ('pending', 'failed')` — the only two statuses that represent genuinely un-settled payments.

### Bug 2 — `DeprecationWarning: Calling client.query() when the client is already executing a query`

**File:** `server/routes/financials.routes.ts` — `GET /api/admin/financials/platform-summary`  
**Root cause:** Route checked out a single pg client from the pool then ran 4 queries via `Promise.all([client.query(...), client.query(...), ...])`. `pg` does not allow concurrent queries on a checked-out client.  
**Fix:** Replaced the single-client block with 3 independent `pool.query()` calls in `Promise.all` (no client checkout needed — these are pure reads). The 4th call (commission rate) is now sourced via `getCommissionRate()` which itself reads from the commission_rules table.

---

## Sprint RX-01 — Revenue Engine as Single Source of Truth

### What changed

#### 1. `server/lib/revenue-engine.ts` (no changes — already correct)
`runRevenueEngine()` already wraps `computeFinalPrice` (the kernel) with DB-driven rule overrides for platform fees, commission, payment method surcharges, travel fees, and revenue shares. This file is the untouched source of truth.

#### 2. Booking creation — `server/routes/appointment.routes.ts`
**Before:** `computeFinalPrice()` called directly at booking time. Commission, payment surcharges, travel fees, and revenue shares were never applied.  
**After:** Both booking paths (`effectiveSvc || subRecord` and the fallback provider-fee path) now call `runRevenueEngine()`. The `patientPayable` field (= base total + payment surcharge + travel fee) is stored as `totalAmount`. The full RE result is stored as `pricingBreakdown` (JSONB).

Additional context passed to RE at booking time:
- `paymentMethod` — enables surcharge rule matching
- `countryCode` — enables country-scoped rules
- `providerId` — enables provider-specific commission rules
- `providerType` — enables provider-type commission tiers
- `serviceCategory` — enables category-specific platform fee rules

#### 3. Financial snapshot columns — `server/db.ts` (new startup migration)
Seven new columns added to `appointments` via idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS`:

| Column | Type | Content |
|---|---|---|
| `commission_rate` | NUMERIC(8,4) | RE commission rate (e.g. 0.1000 = 10%) |
| `commission_amount` | NUMERIC(10,2) | Exact platform commission in USD |
| `provider_earnings_snapshot` | NUMERIC(10,2) | Provider net earnings in USD |
| `payment_surcharge_amount` | NUMERIC(10,2) | Payment method surcharge in USD |
| `travel_fee_snapshot` | NUMERIC(10,2) | Travel fee applied in USD |
| `platform_revenue_snapshot` | NUMERIC(10,2) | Total platform revenue (fee + commission + surcharge) |
| `re_applied_rules` | JSONB | Array of `AppliedRule` objects (ruleType, ruleName, impact) |

Columns written immediately after `createAppointmentWithEvent()` via raw `pool.query UPDATE`. Non-fatal on write failure (logs a warning).

#### 4. Revenue shares table — `server/db.ts` (new startup migration)
New `booking_revenue_shares` table:
```
id, appointment_id (FK → appointments), participant_type, label, amount, percent, created_at
```
Revenue shares from RE output are persisted per-booking (fire-and-forget Promise.all).

#### 5. Settlement — `server/routes/financials.routes.ts`
`POST /api/financials/settle-appointment` now reads `commission_amount` from the appointment row:
- **RX-01 appointments**: uses the immutable booking-time snapshot (`commission_amount`) directly — commission is never re-computed at settlement, eliminating rate-change exposure.
- **Legacy appointments** (pre-RX-01, `commission_amount = 0`): falls back to `getCommissionRate()` → commission_rules global rate.

#### 6. `DEFAULT_COMMISSION = 0.15` bypass removed — `server/routes/financials.routes.ts`
`getCommissionRate()` was previously hardcoded to 15% with a `platform_settings` fallback (display only). Now:
1. **Primary:** reads `commission_percent` from `commission_rules WHERE commission_type='global'` (the RE rule table, default 10%)
2. **Fallback:** `platform_settings.marketplace_commission_rate` key
3. **Last resort:** 10% (matches the seeded default global commission rule)

`getCommissionRate()` is now only used as a fallback for settlement of legacy appointments and for the platform-summary display endpoint.

#### 7. Provider earnings — `server/storage/database-storage.ts`
`recordProviderEarning()` now checks for RE snapshot columns first:
- **RX-01 path** (`provider_earnings_snapshot > 0`): uses the immutable booking-time earnings directly
- **Contractual split path** (`fee_split_ratio` set on provider): `totalAmount × feeSplitRatio`
- **Legacy path**: `totalAmount − platformFeeAmount`

---

## Architecture Decision: Wallet Atomicity (noted, not refactored)

The booking flow creates the appointment row first, then debits the wallet. If the wallet debit fails, a rollback cancels the appointment. This is not a true DB transaction (two separate operations) but the existing rollback path is solid. A full DB transaction refactor would require significant surgery to `createAppointmentWithEvent` and the wallet system. This is noted for a future "Booking Atomicity" sprint.

---

## Files Modified

| File | Change |
|---|---|
| `server/routes/admin/admin-financial.routes.ts` | Fix invalid payment_status enum values |
| `server/routes/financials.routes.ts` | Remove DEFAULT_COMMISSION bypass; fix parallel client.query; settle uses RE snapshot |
| `server/routes/appointment.routes.ts` | Switch to runRevenueEngine; persist financial snapshot + revenue shares |
| `server/storage/database-storage.ts` | recordProviderEarning reads RE snapshot first |
| `server/db.ts` | Add 7 snapshot columns + booking_revenue_shares table |
