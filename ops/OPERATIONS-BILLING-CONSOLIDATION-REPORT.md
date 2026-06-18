# Operations & Billing Consolidation Sprint Report

**Date:** 2026-06-18
**Sprint:** OPERATIONS BOOKINGS CENTER + REVENUE & BILLING CONSOLIDATION

---

## Executive Summary

This sprint delivered five deliverables:

1. **Operations Bookings Center** — full rewrite of `BookingsManagementComponent` from a 5-column list to an 8-section (A–H) operational console  
2. **Revenue & Billing Center expansion** — 6 new operational tabs added (Refunds, Invoices, Patient Wallets, Payouts, Provider Wallets, Promo Codes)  
3. **Refund system deduplication** — removed the duplicate `RefundRulesPanel` inside `revenue-billing-center.tsx`; `refund-management.tsx` is now the single source  
4. **Financial Alerts bug fix** — fixed `GET /api/admin/financial/alerts 500` caused by missing `details` column  
5. **Currency compliance** — all new surfaces use `fmtBooking(n, row.display_currency)` for booking-currency fields

---

## Part 1 — Operations Bookings Center

### Before
- File: `client/src/components/admin/dashboard/bookings-management.tsx`
- Lines: 282
- Data source: `GET /api/admin/bookings` (thin — 5 columns: ref, date, status, amount, provider)
- No investigation drawer, no column visibility, no export

### After
- Lines: ~700
- Data source: `GET /api/admin/financial/master-report` (enriched join — all 8 sections)
- Status updates: `PATCH /api/admin/bookings/:id`

### Sections A–H now shown

| Section | Fields |
|---------|--------|
| A · Booking | ID, ref, status, payment status, refund status, country, created, updated |
| B · Appointment | Date, start/end time, duration, timezone, visit type, location mode, clinic |
| C · Patient | Name, email, city, country + link to patient profile |
| D · Provider | Name, email, category, city, country, clinic |
| E · Service | Name, category, visit type, duration |
| F · Financials | Booking currency, base price, booking amount, ≈ USD, platform fee, tax, promo discount, refund amount, exchange rate, provider net |
| G · Payment | Method, amount, status, Stripe ID, invoice number, invoice status, payout reference |
| H · Audit & Timeline | Full lifecycle event history via `GET /api/admin/financial/master-report/:id/events` |

### Features
- **Expand row** — inline financial/appointment summary without opening drawer
- **Investigation Drawer** — full 8-section detail + quick action links (Open Patient, Provider, Invoice, Payment, Refund, Timeline)
- **Quick status update** — inline `Select` dropdown → `PATCH /api/admin/bookings/:id`
- **Column visibility** — 7 column groups, toggle individual or by group
- **Saved views** — named column presets persisted in `localStorage`
- **Saved filter presets** — named filter combinations persisted in `localStorage`
- **Filter toolbar** — date range, status, payment status, visit type, refund status
- **CSV export** — `/api/admin/financial/master-report/export/csv`
- **PDF export** — browser print via `@media print` CSS + hidden print target
- **Pagination** — 50 rows/page, server-side, with prev/next controls
- **Sortable columns** — created_at, start_at, status, total_amount

### Currency compliance
- Booking amounts: `formatInCurrency(n, row.display_currency)` — correct booking currency
- USD equivalent: `fmt(n)` (adminCurrency USD) — secondary display only
- Platform fee, promo discount, tax: all formatted as booking currency

---

## Part 2 — Revenue & Billing Center expansion

### Before (12 tabs)
1. Overview  
2. Platform Fees  
3. Commissions  
4. Payment Rules  
5. Travel Fees  
6. Payout Rules  
7. Revenue Sharing  
8. Wallet Rules  
9. Simulator  
10. ~~Refund Rules~~ (DUPLICATE — removed)  
11. Tax / VAT  
12. Gift Cards

### After (18 tabs)

| Tab | Source |
|-----|--------|
| Overview | Existing |
| Platform Fees | Existing |
| Commissions | Existing |
| Payment Rules | Existing |
| Travel Fees | Existing |
| Payout Rules | Existing |
| Revenue Sharing | Existing |
| Wallet Rules | Existing |
| Simulator | Existing |
| Tax / VAT | Existing |
| Gift Cards | Existing |
| **Refunds** | `refund-management.tsx` (RefundManagementPanel + RefundMgmtRulesPanel) |
| **Invoices** | Lazy: `invoice-management.tsx` (InvoiceManagement) |
| **Patient Wallets** | Lazy: `admin-wallets.tsx` (AdminWallets) |
| **Payouts** | Lazy: `admin-payouts.tsx` (AdminPayoutsPanel) |
| **Provider Wallets** | Lazy: `admin-provider-wallets.tsx` (AdminProviderWalletsPanel) |
| **Promo Codes** | Lazy: `promo-code-management.tsx` (PromoCodeManagement) |

New tabs use `React.lazy()` + `Suspense` to avoid bundle bloat — they only load when the tab is first clicked.

---

## Part 3 — Refund system deduplication

### Problem
Two `RefundRulesPanel` implementations existed:

| Location | Lines | Status |
|----------|-------|--------|
| `revenue-billing-center.tsx` lines 1671–1724 | 54 | **DELETED** (duplicate) |
| `refund-management.tsx` line 484 | Part of 547-line file | **KEPT** (canonical) |

The `RefundManagementPanel` (full refund operations) only existed in `refund-management.tsx`. The duplicate in `revenue-billing-center.tsx` was a rules-only copy with no process/approve functionality.

### Changes
1. Deleted `function RefundRulesPanel()` from `revenue-billing-center.tsx` (~54 lines removed)
2. Added `import { RefundManagementPanel, RefundRulesPanel as RefundMgmtRulesPanel } from "@/components/admin/refund-management"` to `revenue-billing-center.tsx`
3. Added "Refunds" tab to RevenueBillingCenter using the canonical `refund-management.tsx` panels
4. Removed `"refunds"` tab from `admin-dashboard.tsx` nav group (Finance section)
5. Removed `import { RefundManagementPanel, RefundRulesPanel } from "@/components/admin/refund-management"` from `admin-dashboard.tsx`
6. Removed `activeTab === "refunds"` render block from `admin-dashboard.tsx`

**Single source of truth:** `client/src/components/admin/refund-management.tsx`

---

## Part 4 — Financial Alerts bug fix

### Problem
```
GET /api/admin/financial/alerts 500
financial-alerts list error: error: column "details" does not exist
  at server/routes/admin/admin-financial.routes.ts:1817
```

### Root cause
The `financial_alerts` table was created in Supabase **before** `details JSONB` was added to the `CREATE TABLE IF NOT EXISTS` statement. Because the table already existed, the `CREATE TABLE IF NOT EXISTS` did not apply the new column.

### Fix
Added `ALTER TABLE financial_alerts ADD COLUMN IF NOT EXISTS details JSONB` to the Phase 2.5 block in `server/db.ts` (runs as idempotent startup migration on next boot).

### Column
```sql
ALTER TABLE financial_alerts ADD COLUMN IF NOT EXISTS details JSONB;
```

---

## Part 5 — Currency compliance audit

### Operations Bookings Center
| Field | Source table column | Formatter used |
|-------|---------------------|----------------|
| Base price | `service_price_snapshot` | `fmtBooking(n, cur)` ✅ |
| Booking total | `total_amount` | `fmtBooking(n, cur)` ✅ |
| Platform fee | `platform_fee_amount` | `fmtBooking(n, cur)` ✅ |
| Tax | `tax_amount` | `fmtBooking(n, cur)` ✅ |
| Promo discount | `promo_discount` | `fmtBooking(n, cur)` ✅ |
| Refund amount | `refund_amount` | `fmtBooking(n, cur)` ✅ |
| USD equivalent | `final_total_usd` | `fmt(n)` ✅ (USD secondary) |
| Provider earning | `provider_earning` | `fmt(n)` ✅ (provider_earnings is USD) |
| Payment amount | `payment_amount` | `fmt(n)` ✅ (payments table = USD) |

### Revenue & Billing Center
- Existing tabs unchanged — they use config values (rates/percentages), not booking amounts
- New "Refunds" tab delegates to `refund-management.tsx` (existing, audited)
- Other new tabs (Invoices, Wallets, Payouts, etc.) are lazy imports of existing audited components

---

## Log error status

| Error | Type | Fix |
|-------|------|-----|
| `GET /api/admin/financial/alerts 500 — column "details" does not exist` | Bug | Fixed (startup migration ALTER TABLE) |
| `[cron_ledger_reconcile] failed — 1 non-ok finding(s)` | Expected behavior | No fix needed — findings > 0 → status="failed" is intentional per design (alerts admin to real inconsistency) |

---

## Files changed

| File | Change |
|------|--------|
| `client/src/components/admin/dashboard/bookings-management.tsx` | Full rewrite (282 → ~700 lines) |
| `client/src/components/admin/dashboard/revenue-billing-center.tsx` | Removed duplicate RefundRulesPanel, added 6 new operational tabs, added lazy imports |
| `client/src/pages/admin-dashboard.tsx` | Removed refunds import + nav item + content block |
| `server/db.ts` | Added `ALTER TABLE financial_alerts ADD COLUMN IF NOT EXISTS details JSONB` |

---

## Architecture decisions

### Why use `/api/admin/financial/master-report` for the Operations Bookings Center
The master-report endpoint already performs the full join (appointments × users × providers × services × payments × provider_earnings × invoices). Re-using it avoids duplicating the SQL, keeps the single source of truth, and gives the operations team all 8 sections of data with correct currency fields.

### Why keep separate Finance nav tabs pointing to Revenue & Billing Center
The `wallets`, `invoices`, `promos`, `payouts` nav items in admin-dashboard.tsx remain as direct-access shortcuts. The canonical panels now live inside Revenue & Billing Center tabs. Removing the nav shortcuts would break existing deep-links; they can be cleaned up in a future Nav Consolidation sprint.

### Lazy loading pattern for new tabs
New operational tabs are wrapped in `React.lazy()` + `Suspense` inside `revenue-billing-center.tsx`. This prevents the already-heavy 1900-line file from bloating the initial bundle. Each panel is fetched on first tab click.
