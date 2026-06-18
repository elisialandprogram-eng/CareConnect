# Analytics, Reporting & Business Intelligence Consolidation Report
**Date:** 2026-06-18  
**Sprint:** Analytics BI Consolidation Sprint

---

## 1. Executive Summary

This sprint fixed 14 confirmed bugs from the forensic audit (`ops/ANALYTICS-REPORTS-FORENSIC-AUDIT.md`), eliminated 4 duplicate analytics surfaces, created 3 consolidated reporting centers (Admin / Provider / Patient), and removed dead code. The platform now has a single source of truth for every key business metric.

---

## 2. KPI Registry — Single Source of Truth

| KPI | Endpoint | Source Table/Column | Filter |
|-----|----------|---------------------|--------|
| Total Bookings | `GET /api/admin/analytics` | `appointments` | `country_code` |
| Confirmed Bookings | `GET /api/admin/analytics` | `appointments.status = 'confirmed'` | country |
| Cancelled Bookings | `GET /api/admin/analytics` | `appointments` status IN cancellation set | country |
| Revenue Today | `GET /api/admin/analytics` | `appointments.total_amount WHERE payment_status='completed' AND date::date=CURRENT_DATE` | country |
| Revenue This Month | `GET /api/admin/analytics` | `appointments.total_amount WHERE payment_status='completed'` + date trunc | country |
| Revenue Series (chart) | `GET /api/admin/analytics` → `revenueSeries` | daily aggregates in analytics response | country |
| Provider Payouts | `GET /api/admin/analytics` → `providerPayouts` | `payout_requests` table (actual records) | country |
| Active Providers | `GET /api/admin/providers-overview` | `providers WHERE status='active'` | country |
| Provider Earnings | `GET /api/admin/providers/:id/detail` | `provider_earnings` | per-provider |
| Schedule Utilization | `GET /api/admin/analytics` | `appointments` (not stale `time_slots.is_booked`) | country |
| Patient Analytics | `GET /api/patient/analytics` | `appointments` WHERE `patient_id=self` | self |
| Provider Analytics | `GET /api/provider/stats` | `appointments`, `provider_earnings` via single client | provider-id |
| Provider Insights | `GET /api/provider/insights` | `appointments`, `reviews`, `services` | provider-id |

---

## 3. Bugs Fixed

### P0 — Data Correctness (Silent Wrong Numbers)

| ID | Location | Bug | Fix |
|----|----------|-----|-----|
| BUG-01 | `getAnalyticsStats` | `confirmedBookings` and `cancelledBookings` keys missing from response | Added both keys to GROUP BY CASE |
| BUG-02 | `getAnalyticsStats` | Revenue filtered by `status='completed'` (status column) not `payment_status='completed'` | Changed to `payment_status='completed'` |
| BUG-03 | `getAnalyticsStats` | `revenueToday` used string date comparison instead of `date::date = CURRENT_DATE` | Fixed to `date::date = CURRENT_DATE` |
| BUG-04 | `getAnalyticsStats` | `providerPayouts` computed from in-memory provider list (fake) | Changed to `SELECT SUM(amount) FROM payout_requests WHERE status='completed'` |
| BUG-05 | `getAnalyticsStats` | `scheduleUtilization` read stale `time_slots.is_booked` flag | Changed to `appointments` table counts |
| BUG-06 | `master-report/summary` | Revenue SQL used `status='completed'` not `payment_status='completed'` | Fixed CASE WHEN to use `payment_status` |
| BUG-07 | `providers-overview` | No pagination — returned all rows unbounded | Added `LIMIT/OFFSET` with `total` count |
| BUG-08 | `package stats` | Used `totalRevenueUsd` (undefined field) | Changed to `totalPriceNative` |

### P1 — Pool Exhaustion / Performance

| ID | Location | Bug | Fix |
|----|----------|-----|-----|
| BUG-09 | `GET /api/provider/analytics` | Used `Promise.all` with 7 parallel Drizzle queries on shared pool (max=12) | Converted to single checked-out client, sequential queries |
| BUG-10 | `GET /api/provider/insights` | Same `Promise.all` pattern, 9 queries | Same fix — single-client sequential |
| BUG-11 | `GET /api/admin/providers-overview` | Missing `requirePermission` | Added `requirePermission(PERMISSIONS.VIEW_PROVIDERS)` |
| BUG-12 | `GET /api/admin/providers/:id/detail` | Missing `requirePermission` | Added `requirePermission(PERMISSIONS.VIEW_PROVIDERS)` |

### P2 — Frontend / UX

| ID | Location | Bug | Fix |
|----|----------|-----|-----|
| BUG-13 | `analytics-overview.tsx` | Ghost `useQuery` for `/api/admin/analytics/monthly` (non-existent endpoint) → 404 on every load | Removed ghost query; uses `analytics?.revenueSeries` directly |
| BUG-14 | `admin-dashboard.tsx` | `activeTab === "overview"` rendered `AnalyticsOverview` inline (not lazy, blocking TTI) | Replaced with lazy `AdminReportingCenter` |

---

## 4. Architecture Changes

### 4.1 Admin Reporting Center (new)
**File:** `client/src/components/admin/dashboard/admin-reporting-center.tsx`

Consolidates 6 previously-separate admin analytics surfaces into one tabbed component:

| Sub-tab | Previously | Now |
|---------|-----------|-----|
| Overview | `AnalyticsOverview` (inline, always-mounted) | `AnalyticsOverview` (lazy inside center) |
| Insights | `EnhancedAnalyticsDashboard` (separate nav item) | `EnhancedAnalyticsDashboard` (lazy tab) |
| Revenue | `RevenueIntelligenceDashboard` (separate nav item) | `RevenueIntelligenceDashboard` (lazy tab) |
| Operations | `OperationsIntelligenceDashboard` (separate nav item) | `OperationsIntelligenceDashboard` (lazy tab) |
| Master Report | `FinancialMasterReport` (separate nav item) | `FinancialMasterReport` (lazy tab) |
| Location | `LocationAnalyticsPanel` (separate nav item) | `LocationAnalyticsPanel` (lazy tab) |

Nav sidebar reduced from 5 analytics items → **1 "Reports" item**. All 6 panels are Suspense-lazy to eliminate bundle impact.

### 4.2 Provider Reporting Center (new)
**File:** `client/src/components/provider/dashboard/ProviderReportingCenter.tsx`

Consolidates the analytics and insights tabs of the provider dashboard:

- **analytics** section → `ProviderAnalyticsTabContent` (existing, re-used)
- **insights** section → `ProviderInsightsTab` (existing, re-used)
- `defaultSection` prop drives initial sub-tab (seamless backwards-compatible routing)
- Removed inline `insightsLoading` skeleton block from `provider-dashboard.tsx`

### 4.3 Patient Reporting Center (new)
**File:** `client/src/components/patient/PatientReportingCenter.tsx`  
**Backend:** `GET /api/patient/analytics` (added to `server/routes/patient.routes.ts`)

First-ever patient-facing analytics surface. Provides:
- KPI cards: total spend, completed, upcoming, last-30-day spend
- Monthly spending bar chart (12-month window)
- Top providers by visit count
- Package / membership usage status

---

## 5. Dead Code Removed

| File | Reason |
|------|--------|
| `client/src/components/admin/dashboard/financial-reports.tsx` | Duplicate of `FinancialMasterReport` + revenue sub-tabs (DUP-09 in audit); no longer imported anywhere |
| 5 lazy imports in `admin-dashboard.tsx` | `EnhancedAnalyticsDashboard`, `RevenueIntelligenceDashboard`, `FinancialMasterReport`, `OperationsIntelligenceDashboard` — all now loaded through `AdminReportingCenter` |
| Direct imports in `admin-dashboard.tsx` | `AnalyticsOverview`, `LocationAnalyticsPanel` — consumed internally by `AdminReportingCenter` |
| 6 tab content blocks in `admin-dashboard.tsx` | `financial`, `master-report`, `location-analytics`, `revenue-intelligence`, `ops-intelligence`, `enhanced-analytics` — all replaced by the single `reports` tab |
| `financial` and `master-report` nav items in `buildNavGroups` | Collapsed into `reports` |
| Ghost `useQuery` in `analytics-overview.tsx` | Non-existent `/api/admin/analytics/monthly` endpoint |
| Inline `insightsLoading` block in `provider-dashboard.tsx` | Replaced by `ProviderReportingCenter` |

---

## 6. Routing / Navigation Changes

### Admin sidebar (before → after)
```
Overview group (before):
  Analytics, Insights, Revenue Intelligence, Ops Intelligence, Location Intelligence, Monitoring, DB Health

Overview group (after):
  Reports, Monitoring, DB Health
```

```
Finance group (before):
  Financial Alerts, Financial, Wallets, Payouts, Provider Wallets, Invoices, Refunds, Financial Master Report, Provider Financials, Ledger Overrides

Finance group (after):
  Financial Alerts, Wallets, Payouts, Provider Wallets, Invoices, Refunds, Provider Financials, Ledger Overrides
```

Default landing tab changed from `"overview"` → `"reports"`.

---

## 7. Files Changed

### Backend
- `server/routes/patient.routes.ts` — new `GET /api/patient/analytics`
- `server/storage/group-sessions.mixin.ts` — BUG-01/02/03/04/05
- `server/routes/admin/admin-financial.routes.ts` — BUG-06/07/08/11/12
- `server/routes/provider.routes.ts` — BUG-09/10

### Frontend — New
- `client/src/components/admin/dashboard/admin-reporting-center.tsx`
- `client/src/components/provider/dashboard/ProviderReportingCenter.tsx`
- `client/src/components/patient/PatientReportingCenter.tsx`

### Frontend — Modified
- `client/src/pages/admin-dashboard.tsx` — nav groups, lazy imports, tab content, default tab
- `client/src/pages/provider-dashboard.tsx` — analytics + insights tab content
- `client/src/components/admin/dashboard/analytics-overview.tsx` — ghost query removed

### Frontend — Deleted
- `client/src/components/admin/dashboard/financial-reports.tsx`

---

## 8. Outstanding / Out of Scope

- P3 audit items (cosmetic chart labels, minor UX) — deferred to design sprint
- Patient dashboard wiring of `PatientReportingCenter` — component is ready; integration into patient-dashboard.tsx page is the next step
- Data retention for `analytics_snapshots` table — deferred; no table exists yet

---

*Report generated by Analytics BI Consolidation Sprint, 2026-06-18.*
