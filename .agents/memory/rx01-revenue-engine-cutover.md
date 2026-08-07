---
name: Revenue Engine Cutover RX-01
description: Sprint RX-01 made runRevenueEngine() the single source of truth for all booking-time financial calculations. Key patterns, fallbacks, and pitfalls.
---

## What changed in RX-01

- `appointment.routes.ts` booking creation now calls `runRevenueEngine()` (not `computeFinalPrice` directly) for BOTH the service path and the provider-level fallback path.
- `patientPayable` (includes payment surcharge + travel fee) is stored as `totalAmount`.
- 7 new columns on `appointments`: `commission_rate`, `commission_amount`, `provider_earnings_snapshot`, `payment_surcharge_amount`, `travel_fee_snapshot`, `platform_revenue_snapshot`, `re_applied_rules` (JSONB). Written via raw pool.query UPDATE after appointment insert (non-fatal on failure).
- `booking_revenue_shares` table: one row per revenue share participant per booking.
- `financials.routes.ts` settlement reads `commission_amount` from appointment (immutable snapshot). Zero = legacy appointment → falls back to `getCommissionRate()`.
- `recordProviderEarning` in database-storage.ts: if `provider_earnings_snapshot > 0`, use it directly (RX-01 path); otherwise fee_split_ratio or platformFeeAmount (legacy).
- `DEFAULT_COMMISSION = 0.15` hardcode removed. `getCommissionRate()` now reads commission_rules table first (global rule, default 10%).

## Why

Prevents commission rate drift: once a booking is created, the commission and earnings are frozen. Settlement uses the snapshot, not the live rate.

## How to apply

Any new booking path must call `runRevenueEngine()` and persist the result. Never call `computeFinalPrice()` directly in appointment creation routes. `computeFinalPrice` is still the internal kernel used by RE — do not delete it.

## Fallback chain for commission

1. RE snapshot on appointment (`commission_amount` column) — most appointments post RX-01
2. `commission_rules` global rule (commission_percent, type='global', enabled=true)
3. `platform_settings` key `marketplace_commission_rate`
4. 10% hardcoded floor
