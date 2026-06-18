# Reporting Currency Correction Report

**Sprint:** Reporting Currency Correction & Master Report Completion  
**Completed:** 2026-06-18  
**Author:** Agent  

---

## Summary

A forensic audit of all three reporting surfaces (Admin Financial Master Report, Provider Reporting Center, Patient Reporting Center) revealed critical currency display bugs in the Admin Financial Master Report where booking-currency values (HUF, IRR) were formatted through a USD-only formatter, producing nonsense figures such as "$5,000" for a 5,000 HUF booking.

This report documents:
- The architecture that was confirmed
- Every bug found and fixed
- New features shipped
- Where to look if issues recur

---

## 1. Currency Architecture (Confirmed)

| Column | Table | Currency | Used for |
|--------|-------|----------|----------|
| `total_amount` | `appointments` | **Booking currency** (HUF / IRR / USD) | Patient-facing total at booking time |
| `final_total_usd` | `appointments` | **USD normalized** | Platform KPI aggregation |
| `display_amount` | `appointments` | Booking currency (same as `total_amount`) | Snapshot of local-currency amount |
| `display_currency` | `appointments` | ISO-4217 string | Which currency `total_amount` is in |
| `exchange_rate_used` | `appointments` | n/a | Rate applied at booking time |
| `service_price_snapshot` | `appointments` | Booking currency | Base service price at booking |
| `promo_discount` | `appointments` | Booking currency | Promotional reduction |
| `tax_amount` | `appointments` | Booking currency | Tax charged |
| `refund_amount` | `appointments` | Booking currency | Amount refunded |
| `platform_fee_amount` | `appointments` | Booking currency | Platform fee component |
| `provider_earning` | `provider_earnings` | **USD** | Provider's gross payout |
| `platform_fee` | `provider_earnings` | **USD** | Platform's cut |
| `amount` | `payments` | **USD** | Stripe / gateway charge |

**Rule:** `fmtBooking(amount, display_currency)` for appointment-level values;  
`fmt(amount)` (USD admin formatter) for provider_earnings and payment gateway values.

---

## 2. Bugs Found & Fixed

### 2.1 Financial Master Report — Frontend (`financial-master-report.tsx`)

| # | Field | Before | After |
|---|-------|--------|-------|
| 1 | `total_amount` in table | `fmt(n(row.total_amount))` → `$5,000` for 5,000 HUF | `fmtBooking(n(row.total_amount), row.display_currency)` → `Ft 5,000` |
| 2 | `promo_discount` in table | `fmt(n(row.promo_discount))` → wrong currency | `fmtBooking(...)` |
| 3 | `refund_amount` in table | `fmt(n(row.refund_amount))` → wrong currency | `fmtBooking(...)` |
| 4 | `service_price_snapshot` in drawer | `fmt(...)` → wrong currency | `fmtLocal(...)` with booking currency |
| 5 | `platform_fee_amount` in drawer | `fmt(...)` → wrong currency | `fmtLocal(...)` with booking currency |
| 6 | `tax_amount` in drawer | `fmt(...)` → wrong currency | `fmtLocal(...)` with booking currency |
| 7 | `promo_discount` in drawer | `fmt(...)` → wrong currency | `fmtLocal(...)` with booking currency |
| 8 | Drawer section label | "Pricing Breakdown (USD)" | "Pricing Breakdown" (no hardcoded USD) |
| 9 | Summary gross_revenue | Summed raw `total_amount` (mixed HUF+IRR+USD) | `COALESCE(final_total_usd, total_amount)` per row |
| 10 | Summary total_refunds | Only counted `payment_status='completed'` refunds | Now filters on `refund_status='processed'` |

### 2.2 Backend Summary SQL (`admin-financial.routes.ts`)

All five platform KPI aggregations now use `COALESCE(a.final_total_usd, a.total_amount)::numeric` to produce USD-normalized totals, ensuring rows created before `final_total_usd` was added (which have NULL there) fall back gracefully to the raw amount.

### 2.3 Surfaces Cleared (No Bugs)

- **Provider Reporting Center** — all amounts go through `fmtEarnings` = `formatInCurrency(n, providerNativeCurrency)` ✅
- **Patient Reporting Center** — all amounts go through `formatPrice` from `useCurrency()` ✅
- **Admin Revenue Overview / Analytics** — use `useAdminCurrency()` (always USD) ✅

---

## 3. New Features Shipped

### 3.1 Phase-4 Columns Added

Backend `SELECT` expanded to include: `final_total_usd`, `display_amount`, `updated_at`, `invoice_status`, `provider_city`, `clinic_name`, `patient_city`, `service_category`.

### 3.2 DualAmount Display

Non-USD rows now show both the booking currency amount AND a grayed "≈ USD" line beneath, giving admins at a glance the local figure without losing USD context.

### 3.3 Column Visibility

A **Columns** dropdown in the toolbar lets admins toggle 6 column groups (A Booking, B Patient, C Provider, D Service, E Financial, G Payout) on/off to reduce visual noise for specific workflows.

### 3.4 Saved Filter Presets

Admins can save any active filter combination under a name (persisted to `localStorage`). Presets appear as one-click pills under the filter bar and can be deleted individually.

### 3.5 PDF Export

A **PDF** button triggers `window.print()` with injected `@media print` CSS that hides all chrome except the report table, sets landscape orientation, and uses 9px table font. No external library required.

### 3.6 Expanded CSV Export

CSV columns expanded from 19 → 42, organized into Sections A–H matching the drawer structure. Booking amount and normalized USD amount are both included as separate columns. Correctly labeled `"Booking Amount"` vs `"Normalized USD Amount"`.

### 3.7 Investigation Drawer — Section Grouping

Drawer reorganized into 8 labeled sections (A Booking, B Patient, C Provider, D Service, E Financial, F Payment, G Payout, H Audit) with dedicated icons. Added: Completion Date, Last Updated, Provider City, Clinic Name, Patient City, Invoice Status, Audit Reference (appointment ID), normalized USD amount alongside booking amount.

---

## 4. Architecture Decision

**Summary cards are always USD.** The 11 KPI cards in the master report represent platform financial position. They aggregate using `final_total_usd` (normalized at booking time by the revenue engine). This is intentional — mixing currencies in a sum produces meaningless totals.

**Table rows show booking currency with a USD hint.** The individual row amount column always shows what the patient paid in their local currency. A small "≈ USD" subscript appears for non-USD rows only, preserving full traceability without losing local-currency context.

---

## 5. Files Changed

| File | Change |
|------|--------|
| `client/src/components/admin/dashboard/financial-master-report.tsx` | Full rewrite: currency bugs fixed, new features added |
| `server/routes/admin/admin-financial.routes.ts` | Data SELECT expanded (+9 columns), summary SQL uses `final_total_usd`, CSV columns expanded to 42 |

---

## 6. Regression Checklist

If you suspect a currency regression in future:

1. `grep -n "fmt(n(row\." financial-master-report.tsx` — must return **zero** results for booking-level fields; only provider_earning / payment_amount should use `fmt()`
2. Check that `display_currency` is populated on appointments (set in booking route from `bookingCurrency`)
3. Check that `final_total_usd` is populated — the startup migration in `db.ts` (line 3127) adds the column; the booking route writes it from `revenueEngineResult.finalTotalUsd`
4. Summary cards: if totals look inflated, verify `final_total_usd` is being set correctly in the booking route
