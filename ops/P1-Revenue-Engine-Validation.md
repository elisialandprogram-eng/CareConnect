# P1 — Revenue Engine Validation
**Sprint:** P1 Launch Blockers | **Workstream:** 5 — Revenue Engine  
**Status:** ✅ Validated | **Date:** 2026-06-11

---

## Validation Summary

**PASS ✅** — Revenue Engine is the single source of truth for all booking price calculations. All 6 payment paths use `runRevenueEngine()`.

---

## Validated Components

### `computeFinalPrice` (`server/lib/pricing.ts`)
✅ Base price resolution (sub-service → provider-specific override)  
✅ Visit type fees (home/clinic/online)  
✅ Surge & emergency multipliers  
✅ Membership discount (percentage off base + platform fee)  
✅ Promo code (fixed or %)  
✅ VAT/tax calculation  

### `runRevenueEngine` (`server/lib/revenue-engine.ts`)
✅ Platform fee rules (country/category/provider-type/modality scope)  
✅ Commission rules (provider > category > tier > global specificity)  
✅ Payment surcharge rules (per payment method)  
✅ Travel fee rules (distance-based or flat-rate for home visits)  
✅ Revenue sharing (partner splits, referrer commission)  
✅ Wallet bonus (% credited back post-booking)  
✅ Membership commission reduction  

### Financial Snapshots on `appointments` table
✅ `total_amount` — patient-payable (canonical, immutable after booking)  
✅ `platform_fee` — platform cut (immutable)  
✅ `provider_earnings_snapshot` — provider net (immutable)  
✅ `commission_amount` — commission portion  
✅ `promo_discount_amount` — promo applied  
✅ `tax_amount` — tax collected  
✅ `platform_fee_rule_id` — which rule fired  
✅ `commission_rule_id` — which rule fired  

All 7 snapshot columns are written by `runRevenueEngine` at booking creation and **never recalculated afterwards**. Settlement and payout use these snapshots only.

---

## Payment Path Coverage

| Payment Method | Revenue Engine | Stripe | Notes |
|----------------|---------------|--------|-------|
| `card` | ✅ | ✅ | Stripe Checkout session |
| `wallet` | ✅ | ❌ | In-app wallet deduction |
| `cash` | ✅ | ❌ | Manual collection |
| `bank_transfer` | ✅ | ❌ | Manual verification |
| `pos` | ✅ | ❌ | Clinic POS |
| `bundled` | ✅ | ❌ | Multi-session/child |

All 6 methods call `runRevenueEngine()` before persisting the appointment.

---

## Identified Risks (Historical — Resolved)

| Risk | Status | Fix |
|------|--------|-----|
| Provider earnings double-conversion (HUF rate applied to USD) | ✅ Fixed | `recordProviderEarning` no longer converts `total_amount` — it's already USD |
| DEFAULT_COMMISSION 0.15 bypass | ✅ Fixed in RX-01 | Revenue engine mandatory for all bookings |
| `appointment.total_amount` not matching `payment.amount` | ✅ Reconciliation check added | `revenue_snapshot_consistency` in full reconciliation |

---

## Validation Method

Code audit performed across:
- `server/lib/pricing.ts` — kernel
- `server/lib/revenue-engine.ts` — wrapper
- `server/routes/appointment.routes.ts` — all booking paths
- `shared/schema.ts` — snapshot columns
- `server/storage/database-storage.ts` — `recordProviderEarning`

No code changes required — engine is correct. Financial reconciliation checks added to detect any future bypasses automatically.
