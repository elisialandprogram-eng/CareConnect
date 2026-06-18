# GOLDENLIFE — ANALYTICS & REPORTS FORENSIC AUDIT
**Date:** 2026-06-18  
**Auditor:** Agent forensic audit  
**Scope:** Every dashboard, chart, KPI, export, and metric across the platform

---

## SECTION 1 — COMPLETE DASHBOARD INVENTORY

### 1.1 Admin Dashboards

| ID | Dashboard | File | Panel Slot |
|----|-----------|------|------------|
| A01 | Admin Home (Operational Command) | `client/src/pages/admin-home.tsx` | `/admin-home` |
| A02 | Platform Analytics Overview | `client/src/components/admin/dashboard/analytics-overview.tsx` | `admin-dashboard` → "Overview" |
| A03 | Financial Reports | `client/src/components/admin/dashboard/financial-reports.tsx` | `admin-dashboard` → "Financials" |
| A04 | Enhanced Analytics (Insights) | `client/src/components/admin/enhanced-analytics.tsx` | `admin-dashboard` → "Insights" |
| A05 | Revenue Intelligence | `client/src/components/admin/dashboard/revenue-intelligence.tsx` | `admin-dashboard` → "Revenue" |
| A06 | Operations Intelligence | `client/src/components/admin/dashboard/operations-intelligence.tsx` | `admin-dashboard` → "Operations" |
| A07 | Financial Master Report | `client/src/components/admin/dashboard/financial-master-report.tsx` | `admin-dashboard` → "Master Report" |
| A08 | Financial Alerts Panel | `client/src/components/admin/dashboard/financial-alerts-panel.tsx` | `admin-dashboard` → "Alerts" |
| A09 | Location Analytics | `client/src/components/admin/dashboard/location-analytics.tsx` | `admin-dashboard` → "Location" |
| A10 | Admin Wallets | `client/src/components/admin/dashboard/admin-wallets.tsx` | `admin-dashboard` → "Wallets" |
| A11 | Admin Provider Wallets | `client/src/components/admin/dashboard/admin-provider-wallets.tsx` | `admin-dashboard` → "Provider Wallets" |
| A12 | Admin Payouts | `client/src/components/admin/dashboard/admin-payouts.tsx` | `admin-dashboard` → "Payouts" |
| A13 | Revenue & Billing Center | `client/src/components/admin/dashboard/revenue-billing-center.tsx` | `admin-dashboard` → "Revenue Center" |
| A14 | Revenue Overview (in Billing Center) | Inside `revenue-billing-center.tsx` | `admin-dashboard` → "Revenue Center" sub-tab |

### 1.2 Provider Dashboards

| ID | Dashboard | File | API |
|----|-----------|------|-----|
| P01 | Provider Insights Tab | `client/src/components/provider/dashboard/ProviderAnalyticsTab.tsx` (via QK.providerAnalytics) | `/api/provider/analytics` |
| P02 | Provider Insights (smart tips) | `client/src/pages/provider-dashboard.tsx` | `/api/provider/insights` |
| P03 | Provider Earnings | `client/src/pages/provider-earnings.tsx` | `/api/provider/earnings` |
| P04 | Provider Wallet Panel | `client/src/components/provider-wallet-panel.tsx` | `/api/provider/wallet`, `/api/provider/wallet/monthly` |

### 1.3 Patient Dashboards

| ID | Dashboard | File | Notes |
|----|-----------|------|-------|
| PA01 | Patient Dashboard | `client/src/pages/patient-dashboard.tsx` | No dedicated analytics — shows appointment list, wallet balance, package summary |
| PA02 | Health Metrics Tab | `client/src/components/health-metrics-tab.tsx` | `/api/health-metrics` — clinical data, not analytics |
| PA03 | Family Member Dashboard | `client/src/pages/family-member-dashboard.tsx` | Appointment history only |

---

## SECTION 2 — METRICS INVENTORY

### 2.1 Admin Metrics

| Metric | Endpoint | Source Table(s) | Formula |
|--------|----------|-----------------|---------|
| Total Users | `/api/admin/analytics` | `users` | `COUNT(*) WHERE role='patient'` |
| Total Providers | `/api/admin/analytics` | `providers` | `COUNT(*)` |
| Active Providers | `/api/admin/analytics` | `providers` | `COUNT(*) WHERE status IN ('active','approved')` |
| Total Bookings | `/api/admin/analytics` | `appointments` | `COUNT(*)` all statuses |
| Pending Bookings | `/api/admin/analytics` | `appointments` | `COUNT(*) WHERE status='pending'` |
| Completed Bookings | `/api/admin/analytics` | `appointments` | `COUNT(*) WHERE status='completed'` |
| Confirmed Bookings | `/api/admin/analytics` | — | **NOT RETURNED BY API** — UI reads `analytics?.confirmedBookings` → always 0 |
| Cancelled Bookings | `/api/admin/analytics` | — | **NOT RETURNED BY API** — UI reads `analytics?.cancelledBookings` → always 0 |
| Total Revenue | `/api/admin/analytics` | `appointments` | SUM(total_amount) WHERE (payment_status='completed' OR status='completed') AND payment_status NOT IN ('refunded','failed') |
| Platform Fees | `/api/admin/analytics` | `appointments` | SUM(platform_fee_amount) same filter |
| Provider Payouts | `/api/admin/analytics` | `appointments` (computed) | `totalRevenue - platformFees` — **NOT actual payout data** |
| Avg Booking Value | `/api/admin/analytics` | `appointments` | totalRevenue / paidCount |
| Revenue Today | `/api/admin/analytics` | `appointments` | SUM(total_amount) WHERE created_at >= CURRENT_DATE |
| Revenue This Month | `/api/admin/analytics` | `appointments` | SUM(total_amount) WHERE created_at >= date_trunc('month') |
| Revenue Last Month | `/api/admin/analytics` | `appointments` | SUM(total_amount) for prior month |
| Revenue Growth % | `/api/admin/analytics` | computed | (thisMonth - lastMonth) / lastMonth × 100 |
| Revenue Series (12mo) | `/api/admin/analytics` | `appointments` | Monthly sums, payment_status='completed' |
| Monthly Revenue Trend | `/api/admin/analytics/monthly` | — | **ROUTE DOES NOT EXIST** |
| New Users (30d) | `/api/admin/analytics/enhanced` | `users` | COUNT(*) WHERE role='patient' AND created_at >= 30d |
| New Providers (30d) | `/api/admin/analytics/enhanced` | `providers` | COUNT(*) WHERE created_at >= 30d |
| Active Patients (90d) | `/api/admin/analytics/enhanced` | `appointments` | COUNT(DISTINCT patient_id) WHERE created_at >= 90d |
| Returning Patients | `/api/admin/analytics/enhanced` | `appointments` | Patients with >1 appointment |
| Retention Rate | `/api/admin/analytics/enhanced` | computed | returningPatients / activePatients × 100 |
| Refund Count | `/api/admin/analytics/enhanced` | `payments` | COUNT(*) WHERE status='refunded' |
| Refund Total | `/api/admin/analytics/enhanced` | `payments` | SUM(amount) WHERE status='refunded' |
| Cancel Rate | `/api/admin/analytics/enhanced` | `appointments` | cancelled(3 statuses) / total × 100 |
| Top Providers | `/api/admin/analytics/enhanced` | `appointments`, `providers`, `payments` | By completed appointment count |
| Growth Series (6mo) | `/api/admin/analytics/enhanced` | `users`, `providers`, `appointments` | Monthly users/providers/bookings |
| Gross Revenue (12mo) | `/api/admin/financial/revenue-trends` | `appointments` | SUM(total_amount) WHERE payment_status='completed' |
| Platform Fees (12mo) | `/api/admin/financial/revenue-trends` | `appointments` | SUM(platform_fee_amount) WHERE payment_status='completed' |
| Refunds (12mo) | `/api/admin/financial/revenue-trends` | `appointments` | SUM(refund_amount) WHERE payment_status='completed' |
| Promo Effectiveness | `/api/admin/analytics/commercial` | `promo_codes`, `appointments` | Usage count + discount totals |
| Package Conversion | `/api/admin/analytics/commercial` | `packages`, `user_packages` | No country filter |
| Referral Conversion | `/api/admin/analytics/commercial` | `referrals` | **No country filter — global mix** |
| Waitlist Conversion | `/api/admin/analytics/commercial` | `waitlist_entries` | **No country filter — global mix** |
| Gift Card Stats | `/api/admin/analytics/commercial` | `gift_cards` | No country filter |
| Support Tickets (30d) | `/api/admin/support/analytics` | `support_tickets` | Volume, SLA, escalation rate |
| Growth Metrics (12wk) | `/api/admin/analytics/growth-metrics` | `users`, `appointments`, `providers` | New patients, repeat rate, no-show by visit type |
| Location Analytics | `/api/admin/analytics/location` | Multiple location tables | See location.routes.ts |
| Financial Alerts | `/api/admin/financial/alerts` | `financial_alerts` | Paginated with filters |
| Financial Health | `/api/admin/health/financial` | Multiple | System health checks |
| Master Report KPIs | `/api/admin/financial/master-report/summary` | `appointments`, `provider_earnings` | Multi-join, **no payment filter** |
| Provider Financial Overview | `/api/admin/financial/providers-overview` | `appointments`, `provider_wallets` | Per-provider aggregates, no pagination |
| Provider Detail (monthly) | `/api/admin/financial/providers/:id/detail` | `appointments` | Monthly breakdown last 13 months |
| Provider Revenue | `/api/admin/providers/:id/revenue` | `appointments` | Revenue by provider |
| Provider Stats | `/api/admin/providers/:id/stats` | `appointments` (ALL in memory) | In-memory filter after full table load |
| Reconciliation | `/api/admin/financial/reconciliation` | Multiple | Financial reconciliation checks |
| Regional Summary | `/api/admin/financial/regional-summary` | Multiple | Per-country financial breakdown |
| Home Summary | `/api/admin/home-summary` | Multiple | Operational snapshot (patients, providers, appointments, revenue today, support) |
| Analytics Events | `/api/admin/analytics/events` | `analytics_events` | Event tracking summary |
| Analytics Funnel | `/api/admin/analytics/funnel` | `analytics_events` | Daily conversion funnel |
| Monitoring Stats | `/api/admin/monitoring/stats` | Multiple | System health |
| Monitoring Events | `/api/admin/monitoring/events` | `system_events` | Error/warning events |
| Daily Summaries | `/api/admin/monitoring/daily-summaries` | `monitoring_daily_summary` | Last 90 days of request metrics |
| Endpoint Performance | `/api/admin/monitoring/endpoint-performance` | `monitoring_endpoint_stats` | Per-route latency and error rates |
| Error Trends | `/api/admin/monitoring/error-trends` | `monitoring_endpoint_stats` | 30-day error rate |
| Wallet Balances | `/api/admin/wallets` | `wallets` | Patient wallet balances |
| Wallet Transactions | `/api/admin/wallets/:userId/transactions` | `wallet_transactions` | Per-user transaction history |
| Provider Wallets | `/api/admin/provider-wallets` | `provider_wallets` | Provider wallet balances |
| Provider Ledger | `/api/admin/provider-wallets/:id/ledger` | `provider_ledger` | Append-only ledger |
| Payout Requests | `/api/admin/payout-requests` | `payout_requests` | All payout requests |
| All Earnings | `/api/admin/earnings` | `provider_earnings` | All provider earnings |
| Refunds | `/api/admin/refunds` | `appointments` | Appointments with refunds |
| Invoices | `/api/admin/invoices` | `invoices` | All invoices |

### 2.2 Provider Metrics

| Metric | Endpoint | Source Table(s) | Formula |
|--------|----------|-----------------|---------|
| Weekly Revenue (12wk) | `/api/provider/insights` | `appointments` | SUM(total_amount) WHERE status='completed', last 12 weeks |
| Busy Heatmap | `/api/provider/insights` | `appointments` | DOW × hour matrix of completed appts, last 6 months |
| Cancellation Rate | `/api/provider/insights` | `appointments` | cancelled(5 statuses) / total × 100, last 12 months |
| Utilization % | `/api/provider/insights` | `appointments` | completed / total × 100, last 12 months |
| Repeat Patient % | `/api/provider/insights` | `appointments` | patients with ≥2 visits / unique patients × 100 |
| Lost Bookings | `/api/provider/insights` | `appointments` | COUNT cancelled/rejected/expired, last 12 months |
| Popular Services | `/api/provider/insights` | `appointments`, `services` | Top 8 by completed booking count |
| Repeat Patient List | `/api/provider/insights` | `appointments`, `users` | Patients with ≥2 completed, last visit, total spend |
| Service Breakdown | `/api/provider/analytics` | `appointments`, `services`, `reviews` | Bookings+revenue+rating per service |
| Rating Distribution | `/api/provider/analytics` | `reviews` | Star counts 1-5 |
| Monthly Trend | `/api/provider/analytics` | `appointments` | Revenue+bookings+cancellations+no_shows per month, 12mo |
| Referral Stats | `/api/provider/analytics` | `referrals` | Total, converted, total earned |
| Schedule Utilization | `/api/provider/analytics` | `time_slots` | is_booked=TRUE / total slots, last 30 days |
| Package Performance | `/api/provider/analytics` | `appointments`, `service_packages` | Bookings using packages |
| Earnings List | `/api/provider/earnings` | `provider_earnings`, `appointments`, `services`, `users` | Full earnings history |
| Earnings Summary | `/api/provider/earnings` | `provider_earnings` | Total, pending, paid, platformRevenue |
| Wallet Balance | `/api/provider/wallet` | `provider_wallets` | Available, held, pending, lifetime |
| Monthly Wallet Trend | `/api/provider/wallet/monthly` | `provider_ledger` | Monthly net credits, last 12 months |
| Payout Summary | `/api/provider/payout-summary` | `provider_wallets`, `payout_requests`, `provider_earnings` | Wallet balance, in-flight, lifetime paid |

### 2.3 Exports Inventory

| ID | Export | Endpoint | Format | Source | Currency Label |
|----|--------|----------|--------|--------|----------------|
| EX01 | Financial Overview CSV | `/api/admin/financial/export-csv` | CSV | `appointments`, `providers` | Comments "All amounts in USD" |
| EX02 | Appointments CSV | `/api/admin/export/appointments.csv` | CSV | `appointments`, `services`, `users`, `providers` | No label |
| EX03 | Users CSV | `/api/admin/export/users.csv` | CSV | `users` | N/A |
| EX04 | Revenue CSV | `/api/admin/export/revenue.csv` | CSV | `appointments`, `tax_settings` | "All monetary amounts are in USD" |
| EX05 | Payouts CSV | `/api/admin/export/payouts.csv` | CSV | `payout_requests`, `providers`, `users` | "All amounts are in USD" |
| EX06 | Financial Master Report CSV | `/api/admin/financial/master-report/export/csv` | CSV | 6-table JOIN | Labels columns "Gross Amount (USD)" etc. |
| EX07 | Provider Earnings CSV | `/api/provider/earnings/export` | CSV | `provider_earnings`, `appointments`, `services`, `users` | `COALESCE(display_currency, 'USD')` |

---

## SECTION 3 — REAL METRICS

Metrics confirmed to be accurately sourced, correctly calculated, and properly filtered:

| Metric | Classification | Notes |
|--------|---------------|-------|
| Total Users (patients) | REAL | Parameterized query, country-scoped |
| Total Providers | REAL | Parameterized query, country-scoped |
| Active Providers | REAL | status IN ('active','approved') |
| Total Bookings | REAL | All statuses, country-scoped |
| Pending Bookings | REAL | status='pending' |
| Completed Bookings | REAL | status='completed' |
| Revenue This Month | REAL | payment_status filter applied |
| Revenue Last Month | REAL | payment_status filter applied |
| Revenue Growth % | REAL | Correct month-over-month formula |
| Revenue Series (12mo) | REAL | Gap-filled, payment_status='completed' |
| Revenue Today | REAL | created_at >= CURRENT_DATE filter (see caveat BRK-05) |
| Avg Booking Value | REAL | Correct denominator (paidCount) |
| New Users (30d) | REAL | Parameterized, country-scoped |
| New Providers (30d) | REAL | Parameterized, country-scoped |
| Active Patients (90d) | REAL | DISTINCT patient_id in 90-day window |
| Returning Patients | REAL | GROUP BY HAVING COUNT(*) > 1 |
| Cancel Rate (enhanced) | REAL | 3 canonical cancel statuses |
| Gross Revenue 12mo (revenue-trends) | REAL | payment_status='completed', fills gaps |
| Platform Fees 12mo (revenue-trends) | REAL | payment_status='completed' |
| Refunds 12mo (revenue-trends) | REAL | refund_amount WHERE payment_status='completed' |
| Support SLA metrics | REAL | Uses resolved_at timestamps |
| Growth-metrics acquisition | REAL | Weekly new patient registrations |
| Growth-metrics retention | REAL | 90d active vs churned definition |
| Cancellation Rate (provider insights) | REAL | 5 statuses correctly capture all lost bookings |
| Repeat Patient % (provider insights) | REAL | ≥2 visits per patient |
| Popular Services | REAL | JOIN with services table |
| Rating Distribution | REAL | From reviews table |
| Monthly Trend (provider analytics) | REAL | Correctly fills 12 months |
| Earnings List | REAL | Full JOIN with rich context |
| Earnings Summary (getEarningsSummary) | REAL | Sourced from provider_earnings table |
| Wallet Balance | REAL | provider_wallets.available_balance |
| Monthly Wallet Trend | REAL | provider_ledger credits per month |
| Financial Alerts | REAL | financial_alerts table, paginated |
| Daily Monitoring Summaries | REAL | monitoring_daily_summary table |
| Endpoint Performance | REAL | monitoring_endpoint_stats table |
| Error Trends | REAL | Aggregated from monitoring_endpoint_stats |
| Support Analytics | REAL | support_tickets, SLA via resolved_at |
| EX04 Revenue CSV | REAL | payment_status='completed' filter |
| EX05 Payouts CSV | REAL | payout_requests table |
| EX01 Financial Overview CSV | REAL | payment_status='completed' filter |

---

## SECTION 4 — PARTIAL METRICS

Metrics that exist and return data, but have accuracy, completeness, or consistency problems:

### PAR-01 — Provider Payouts figure is estimated, not actual
- **Field:** `providerPayouts` in `/api/admin/analytics`
- **Formula:** `Math.max(0, totalRevenue - platformFees)` — arithmetic on appointment totals
- **Displayed as:** "Owed to providers — click to manage" in the admin KPI card
- **Real data:** `payout_requests` (paid amounts), `provider_wallets` (available balances)
- **Impact:** The KPI card "Provider Payouts" does not reflect what has actually been paid out or what is in provider wallets. It is net revenue after platform fees, which differs from both concepts.

### PAR-02 — refundTotal in Enhanced Analytics may have currency issue
- **Field:** `refundTotal` in `/api/admin/analytics/enhanced`
- **Source:** `payments` table `SUM(amount)` WHERE status='refunded'
- **Risk:** The `payments` table stores `amount` in the original payment currency. For HUF/IRR transactions processed before the USD-canonical migration, amounts could be in local currency. The field is returned as a plain number with no currency label.
- **Impact:** If non-USD payments exist in the payments table with status='refunded', refundTotal will be inflated.

### PAR-03 — Schedule Utilization uses stale `is_booked` flag
- **Field:** `scheduleHealth.utilizationPct` in `/api/provider/analytics`
- **Source:** `time_slots.is_booked` flag
- **Problem:** Per the slot-availability audit, `is_booked` can remain TRUE after a cancellation and is only healed by a subsequent booking attempt. This means cancelled slots still count as "booked" in the utilization calculation.
- **Impact:** Schedule utilization % is overstated for providers with cancellations.

### PAR-04 — Revenue filter in getAnalyticsStats uses ambiguous OR clause
- **Filter:** `(payment_status = 'completed' OR status = 'completed') AND payment_status NOT IN ('refunded', 'failed')`
- **Problem:** If `status = 'completed'` but `payment_status = 'pending'` (appointment marked done before payment), the row is included. Correct filter should be `payment_status = 'completed'` only.
- **Impact:** Revenue and platform fees can be over-counted for bookings completed before payment confirmation.

### PAR-05 — Admin Financial Providers Overview has no pagination
- **Endpoint:** `/api/admin/financial/providers-overview`
- **Problem:** Returns ALL providers in one query. No LIMIT, no pagination parameters. As the platform grows, this will cause timeout or out-of-memory conditions.

### PAR-06 — Referral + Waitlist conversion metrics ignore country
- **Endpoint:** `/api/admin/analytics/commercial`
- **Problem:** Referral and waitlist queries use no country filter (empty `[]` params array). All countries are mixed.
- **Impact:** Country-admin users see global stats, not their country's data.

### PAR-07 — Package Conversion `totalRevenueUsd` contains native currency amounts
- **Endpoint:** `/api/admin/analytics/commercial`
- **Field:** `totalRevenueUsd` computed as `SUM(mp.price)` from `packages.price`
- **Problem:** `packages.price` is stored in native currency (HUF/IRR). The field is labeled `totalRevenueUsd` but contains HUF or IRR values for non-USD packages.
- **Severity:** **P1 currency leak**

### PAR-08 — Admin Home Summary uses string interpolation for country filter
- **Endpoint:** `/api/admin/home-summary`
- **Code:** ``AND country_code::text = '${countryFilter}'`` — direct string interpolation
- **Risk:** SQL injection vector if `countryFilter` value is ever untrusted. The source `listingCountryFilter()` limits to known enum values, providing soft protection.

---

## SECTION 5 — BROKEN METRICS

### BRK-01 — `/api/admin/analytics/monthly` backend route does not exist
- **Consumed by:** `analytics-overview.tsx` line 73
- **Effect:** The `monthlySeries` query always returns an empty array `[]`. The revenue Area chart then falls back to 12 placeholder data points all showing revenue = 0, bookings = 0.
- **Visible impact:** The "Revenue trend" chart on the main admin Platform Overview tab is permanently empty. The entire charting surface shows a flat line.
- **Note:** The CORRECT series data IS returned inside `/api/admin/analytics` as `revenueSeries` — the component fetches it twice unnecessarily and the second fetch (to a non-existent route) shadows the first.
- **Severity:** P0

### BRK-02 — `confirmedBookings` field not in API response
- **Consumed by:** `analytics-overview.tsx` line 101 (`analytics?.confirmedBookings || 0`)
- **Not returned by:** `getAnalyticsStats` (returns: totalBookings, pendingBookings, completedBookings)
- **Effect:** "Confirmed" slice of the appointment status pie chart always renders as 0. Pie chart is incomplete.
- **Severity:** P1

### BRK-03 — `cancelledBookings` field not in API response
- **Consumed by:** `analytics-overview.tsx` line 111 (`analytics?.cancelledBookings || 0`)
- **Not returned by:** `getAnalyticsStats`
- **Effect:** "Cancelled" slice of the appointment status pie chart always renders as 0. The pie chart silently omits cancelled appointments, making the distribution appear to have only pending and completed.
- **Severity:** P1

### BRK-04 — Financial Master Report summary sums ALL bookings including unpaid
- **Endpoint:** `/api/admin/financial/master-report/summary`
- **Formula:** `SUM(a.total_amount)` across the full MASTER_JOIN with no `payment_status` filter
- **Effect:** `grossRevenue`, `platformRevenue`, `providerEarnings` in the summary KPI cards include pending, failed, and cancelled bookings. Numbers are materially inflated.
- **Severity:** P0

### BRK-05 — Revenue Today uses `created_at` not `start_at` or `date`
- **Field:** `revenueToday` in `getAnalyticsStats`
- **Filter:** `WHERE created_at >= CURRENT_DATE` on appointments
- **Problem:** A booking created today for a session next week is counted as "Today's Revenue". Revenue should be measured by appointment date or start_at, not booking creation time.
- **Severity:** P1

### BRK-06 — `/api/admin/providers/:id/stats` loads all appointments into memory
- **Code:** `const appts = await storage.getAppointmentsByProvider(providerId)` (no LIMIT)
- **Then:** In-memory `.filter()` and `.map()` to compute stats
- **Effect:** For a provider with 1000+ appointments, this pulls the entire appointment history into the Node.js process. Causes high memory usage and slow response times.
- **Severity:** P1 (scalability breaking point)

---

## SECTION 6 — DUPLICATE METRICS

### DUP-01 — Total Revenue: 3 conflicting calculations

| Location | Endpoint | Filter | Source |
|----------|----------|--------|--------|
| Analytics Overview, Financial Reports | `/api/admin/analytics` | `(payment_status='completed' OR status='completed') AND payment_status NOT IN ('refunded','failed')` | `appointments.total_amount` |
| Revenue Intelligence | `/api/admin/financial/revenue-trends` | `payment_status='completed'` | `appointments.total_amount` |
| Financial Master Report | `/api/admin/financial/master-report/summary` | None — all bookings | `appointments.total_amount` |

These three will produce three different numbers simultaneously visible to an admin.

### DUP-02 — Platform Fees: 3 conflicting calculations

Same three sources as DUP-01 with the same filter discrepancies applied to `platform_fee_amount`.

### DUP-03 — Provider Payouts/Earnings: 3 conflicting sources

| Location | Endpoint | Source | Formula |
|----------|----------|--------|---------|
| Analytics Overview | `/api/admin/analytics` | `appointments` (computed) | `totalRevenue - platformFees` |
| Revenue Intelligence | `/api/admin/financial/revenue-trends` | `appointments.platform_fee_amount` | Implied net |
| Financial Master Report | `/api/admin/financial/master-report/summary` | `provider_earnings.provider_earning` | SUM of actual recorded earnings |

### DUP-04 — Cancellation Rate: 4 different definitions

| Location | Statuses Counted | Window |
|----------|-----------------|--------|
| Provider Insights KPI | cancelled, cancelled_by_patient, cancelled_by_provider, rejected, expired (5) | Last 12 months |
| Enhanced Analytics | cancelled, cancelled_by_patient, cancelled_by_provider (3) | All time |
| Revenue Trends | cancelled, no_show (2) | Per month |
| Analytics Overview Pie | **Always 0** (broken — BRK-03) | All time |

### DUP-05 — Monthly Revenue Trend: 3 separate implementations

| Location | Endpoint | Window | Grouping |
|----------|----------|--------|----------|
| Analytics Overview (broken) | `/api/admin/analytics/monthly` (MISSING) | — | — |
| Analytics Overview (via /analytics) | `/api/admin/analytics` → `revenueSeries` | 12 months | Monthly, payment_status='completed' |
| Revenue Intelligence | `/api/admin/financial/revenue-trends` | 12-24 months | Monthly by country, payment_status='completed' |
| Provider Analytics | `/api/provider/analytics` → `monthlyTrend` | 12 months | Per provider, includes cancellations |
| Provider Wallet Panel | `/api/provider/wallet/monthly` | 12 months | Ledger credits per month |

### DUP-06 — User Growth: 3 separate implementations

| Location | Metric | Window |
|----------|--------|--------|
| Analytics Overview | Total Users (all time) | All time |
| Enhanced Analytics | New Users (30d) + Growth Series (6mo) | Rolling windows |
| Operations Intelligence | Weekly New Patient Acquisition (12wk) | Last 12 weeks |

Three views of growth exist in three separate panels with no cross-linking or shared definition.

### DUP-07 — Schedule/Utilization Rate: 2 conflicting implementations

| Location | Definition | Source | Window |
|----------|-----------|--------|--------|
| Provider Insights `utilizationPct` | completed / total bookings | `appointments` | Last 12 months |
| Provider Analytics `scheduleHealth.utilizationPct` | bookedSlots / totalSlots | `time_slots.is_booked` | Last 30 days |

These measure completely different things but both appear labeled "utilization" in the provider dashboard.

### DUP-08 — Repeat Patient Rate: 2 conflicting implementations

| Location | Definition | Denominator |
|----------|-----------|-------------|
| Provider Insights | patients with ≥2 visits / unique patients | Unique patients (all time) |
| Growth Metrics | repeatPatients / totalPatients | All patients with any appointment |

### DUP-09 — Financial Reports duplicates Analytics Overview

`FinancialReports` (`financial-reports.tsx`) calls `/api/admin/analytics` and renders the same KPIs (totalRevenue, platformFees, providerPayouts, avgBookingValue, revenueSeries, growthPct) as `AnalyticsOverview` but in a different UI layout. Two panels, one endpoint, same data shown twice in separate admin tabs.

---

## SECTION 7 — MOCK / STALE METRICS

No explicitly mock or hardcoded data found. All metrics attempt to fetch from real database queries. However, the following are effectively "stale by design":

### STL-01 — Schedule Utilization uses stale `is_booked` flag (see PAR-03)

### STL-02 — Analytics cache may serve up to 30-second-old data
- `analyticsCache` (30s TTL) wraps the enhanced analytics endpoint
- `homeSummaryCache` wraps the admin home summary
- Not a problem in normal operation; documented for awareness.

### STL-03 — Provider list cache serves 30-second-old provider data
- Unrelated to analytics but `providerListCache` affects counts in browse APIs.

---

## SECTION 8 — CURRENCY FINDINGS

### CUR-01 — Provider Payouts KPI shows estimated net, not USD payout amount
- `providerPayouts` = `totalRevenue - platformFees` — a derived USD estimate
- Displayed as "Owed to providers"
- Actual payout amounts in `payout_requests` and `provider_wallets` are not used
- Label is misleading

### CUR-02 — Package Conversion `totalRevenueUsd` contains native currency amounts (P1 leak)
- `packages.price` is stored in native currency (HUF/IRR/USD)
- `SUM(mp.price)` in the commercial analytics query sums native values
- Field is labeled `totalRevenueUsd` in both the API response and the UI
- A HUF package priced at 50,000 HUF (~$136) is displayed as "$50,000"

### CUR-03 — Provider Earnings CSV currency column is misleading
- CSV column uses `COALESCE(pe.display_currency, 'USD')` as currency identifier
- All amount columns (patient_paid, platform_fee, net_earning) are in USD
- For HUF providers, `display_currency` is 'HUF' but the amounts remain in USD
- CSV reader will interpret numbers as HUF, not USD

### CUR-04 — Financial Master Report CSV is correctly labeled
- Columns explicitly titled "Gross Amount (USD)", "Platform Fee (USD)"
- `appointments.total_amount` is USD — correct
- Verified: **No currency leak in this export**

### CUR-05 — Revenue CSV correctly labeled
- Comment row: "All monetary amounts are in USD"
- Source: appointments.total_amount — correct
- Verified: **No currency leak**

### CUR-06 — Payouts CSV correctly labeled
- Comment row: "All amounts are in USD"
- Source: payout_requests.amount — correct
- Verified: **No currency leak**

### CUR-07 — Enhanced Analytics refundTotal has potential multi-currency summing
- Source: `payments.amount` WHERE `status='refunded'`
- The `payments` table does not have a canonical "this is USD" guarantee on historical rows
- Low risk currently (most payments go through Stripe which uses USD), but not provably safe

### CUR-08 — Financial Providers Overview net_earnings correctly computed
- `total_amount - platform_fee_amount - refund_amount` — all USD fields
- Verified: **No currency leak**

---

## SECTION 9 — EXPORT FINDINGS

### EXF-01 — Financial Master Report CSV includes all bookings regardless of payment status (BROKEN)
- Per BRK-04, the underlying query has no payment filter
- CSV rows for pending, failed, and cancelled bookings are included
- Admin downloading this CSV will see gross amounts inflated by incomplete bookings

### EXF-02 — Provider Earnings CSV currency column misleads (see CUR-03)
- Amounts are USD; currency column says native currency for non-USD providers

### EXF-03 — Appointments CSV: verify content
- `/api/admin/export/appointments.csv` — content not audited in this sprint; needs separate review
- Likely includes all statuses (no filter confirmed)

### EXF-04 — Revenue CSV is clean
- Filter: `payment_status='completed'`
- Currency labeled
- Includes tax metadata

### EXF-05 — No PDF export exists anywhere in the platform
- The audit instruction mentioned PDF exports
- No PDF generation route found in any server file
- No PDF library (puppeteer, pdfkit, etc.) found in package.json scope
- **Finding:** PDF export capability does not exist. All exports are CSV.

### EXF-06 — No scheduled / automated export exists
- No cron job generates reports and emails them
- All exports are on-demand via admin UI button
- **Finding:** Scheduled reports are not implemented.

---

## SECTION 10 — PERFORMANCE FINDINGS

### PERF-01 — Provider Insights: 6 parallel pool.query() calls — HIGH RISK
- **Endpoint:** `/api/provider/insights`
- **Pattern:** `Promise.all([pool.query(), pool.query(), pool.query(), pool.query(), pool.query(), pool.query()])`
- **Risk:** Each call checks out its own connection. Pool max=12. Two providers loading Insights simultaneously = 12 connections (pool exhausted).
- **Fix needed:** Rewrite to use single checked-out client with sequential queries (same pattern as `getEnhancedAnalytics`).
- **Severity:** HIGH

### PERF-02 — Provider Analytics: 6 parallel pool.query() calls — HIGH RISK
- **Endpoint:** `/api/provider/analytics`
- **Same problem as PERF-01**
- **Severity:** HIGH

### PERF-03 — Admin Financial Providers Overview: no pagination — MEDIUM
- **Endpoint:** `/api/admin/financial/providers-overview`
- **Problem:** Returns ALL providers in one JOIN with appointments aggregate. No LIMIT.
- **Severity:** MEDIUM

### PERF-04 — Admin Provider Stats: in-memory filter on full history — HIGH
- **Endpoint:** `/api/admin/providers/:id/stats`
- **Code:** `storage.getAppointmentsByProvider(providerId)` then in-memory filter
- **Fix needed:** Replace with direct SQL COUNT queries.
- **Severity:** HIGH

### PERF-05 — Admin Home Summary: 6 separate subqueries via correlated SELECT — LOW
- **Endpoint:** `/api/admin/home-summary`
- **Pattern:** Multiple `(SELECT COUNT(*) FROM ...)` subqueries inside one SELECT
- **Mitigation:** In-memory cache with 30s TTL reduces real DB hit rate
- **Severity:** LOW (cached)

### PERF-06 — Enhanced Analytics: 11 sequential queries on single client — MEDIUM
- **Endpoint:** `/api/admin/analytics/enhanced`
- **Pattern:** Correct single-client pattern, but 11 sequential queries
- **Mitigated by:** 30s analytics cache
- **Severity:** MEDIUM (no parallelism possible without pool exhaustion risk)

### PERF-07 — Financial Master Report: OFFSET pagination degrades at scale — LOW
- **Endpoint:** `/api/admin/financial/master-report`
- **Pattern:** Standard LIMIT/OFFSET — degrades as offset grows on large datasets
- **Severity:** LOW (acceptable for current scale)

---

## SECTION 11 — PERMISSION AUDIT

| Endpoint | Auth | Finding |
|----------|------|---------|
| `/api/admin/analytics` | `requireAdmin + requirePermission(ANALYTICS_VIEW)` | ✅ Correct |
| `/api/admin/analytics/enhanced` | `requireAdmin + requirePermission(ANALYTICS_VIEW)` | ✅ Correct |
| `/api/admin/analytics/events` | `requireAdmin` only | ⚠️ Missing `requirePermission(ANALYTICS_VIEW)` |
| `/api/admin/analytics/funnel` | `requireAdmin` only | ⚠️ Missing `requirePermission(ANALYTICS_VIEW)` |
| `/api/admin/analytics/commercial` | `requireAdmin + requirePermission(ANALYTICS_VIEW)` | ✅ Correct |
| `/api/admin/financial/revenue-trends` | `requireAdmin + requirePermission(ANALYTICS_VIEW)` | ✅ Correct |
| `/api/admin/analytics/growth-metrics` | `requireAdmin + requirePermission(ANALYTICS_VIEW)` | ✅ Correct |
| `/api/admin/support/analytics` | `requireAdmin + requirePermission(TICKETS_VIEW)` | ✅ Correct |
| `/api/admin/financial/providers-overview` | `requireAdmin` only | ⚠️ Missing `requirePermission(PAYMENTS_VIEW)` |
| `/api/admin/financial/providers/:id/detail` | `requireAdmin` only | ⚠️ Missing `requirePermission(PAYMENTS_VIEW)` |
| `/api/admin/financial/master-report` | `requireAdmin` only | ⚠️ Missing `requirePermission(PAYMENTS_VIEW)` |
| `/api/admin/financial/master-report/summary` | `requireAdmin` only | ⚠️ Missing `requirePermission(PAYMENTS_VIEW)` |
| `/api/admin/financial/master-report/export/csv` | `requireAdmin` only | ⚠️ Missing `requirePermission(PAYMENTS_VIEW)` |
| `/api/provider/insights` | role==='provider' check | ✅ Provider-scoped |
| `/api/provider/analytics` | role==='provider' check | ✅ Provider-scoped |
| `/api/provider/earnings` | role==='provider' check | ✅ Provider-scoped |
| All patient endpoints | `req.user.id` scoping | ✅ Patient-scoped |

---

## SECTION 12 — SINGLE SOURCE OF TRUTH MAPPING (Recommended)

### Platform Revenue
- **Official source:** `appointments`
- **Official formula:** `SUM(total_amount) WHERE payment_status = 'completed'`
- **Official currency:** USD
- **Official owner:** Admin Finance → Master Report

### Platform Fees
- **Official source:** `appointments`
- **Official formula:** `SUM(platform_fee_amount) WHERE payment_status = 'completed'`
- **Official currency:** USD
- **Official owner:** Admin Finance → Master Report

### Provider Payouts (Processed)
- **Official source:** `payout_requests`
- **Official formula:** `SUM(amount) WHERE status = 'paid'`
- **Official currency:** USD
- **Official owner:** Admin Finance → Payouts

### Provider Earnings (Pending)
- **Official source:** `provider_earnings`
- **Official formula:** `SUM(provider_earning) WHERE status = 'pending'`
- **Official currency:** USD
- **Official owner:** Admin Finance → Provider Wallets

### Total Bookings
- **Official source:** `appointments`
- **Official formula:** `COUNT(*) WHERE country_code filter`
- **Official note:** Always scoped by country for admin roles

### Cancellation Rate (Platform)
- **Official formula:** `COUNT(*) WHERE status IN ('cancelled','cancelled_by_patient','cancelled_by_provider') / COUNT(*) × 100`
- **Note:** 'rejected' and 'expired' are separate operational statuses, not cancellations

### Cancellation Rate (Provider-side)
- **Official formula:** `COUNT(*) WHERE status IN ('cancelled','cancelled_by_patient','cancelled_by_provider','rejected','expired') / COUNT(*) × 100`
- **Rationale:** From a provider revenue perspective, rejected and expired bookings are also lost revenue

### Schedule Utilization
- **Official source:** `appointments` (not `time_slots`)
- **Official formula:** `COUNT(*) WHERE status = 'completed' / COUNT(*) all statuses`
- **Rationale:** `time_slots.is_booked` is stale; appointment table is the truth

### Refund Total (Admin)
- **Official source:** `appointments`
- **Official formula:** `SUM(refund_amount) WHERE refund_status = 'processed'`
- **Official currency:** USD
- **Rationale:** appointments.refund_amount is USD; payments table has currency ambiguity

---

## SECTION 13 — PRIORITY MATRIX

### P0 — Critical (immediate action required)

| ID | Issue | Impact |
|----|-------|--------|
| BRK-01 | `/api/admin/analytics/monthly` route missing — revenue chart permanently empty | Main admin analytics panel shows no revenue trend |
| BRK-04 | Financial Master Report summary has no payment filter — all amounts inflated | Primary financial report shows wrong KPIs |

### P1 — High (action required before production use of these features)

| ID | Issue | Impact |
|----|-------|--------|
| BRK-02 | `confirmedBookings` missing from analytics response | Pie chart always wrong |
| BRK-03 | `cancelledBookings` missing from analytics response | Pie chart always wrong |
| BRK-05 | Revenue Today counts bookings by created_at, not appointment date | Wrong date attribution |
| BRK-06 | `/api/admin/providers/:id/stats` loads all appointments into memory | Performance risk |
| PAR-01 | `providerPayouts` is estimated not actual — label is wrong | Misleading KPI |
| PAR-07 | Package `totalRevenueUsd` contains native currency amounts | Currency leak |
| CUR-02 | Package conversion currency mislabeled | P1 currency leak |
| EXF-01 | Master Report CSV includes unpaid bookings | Inflated export data |
| PERF-01 | Provider Insights: 6 parallel pool connections | Pool exhaustion risk |
| PERF-02 | Provider Analytics: 6 parallel pool connections | Pool exhaustion risk |
| PERF-04 | Provider Stats: in-memory full-history load | Scalability breaking point |

### P2 — Medium (fix before scaled launch)

| ID | Issue | Impact |
|----|-------|--------|
| PAR-02 | refundTotal may sum non-USD amounts | Potential inaccuracy |
| PAR-03 | Schedule utilization uses stale is_booked | Overstated utilization |
| PAR-04 | Revenue filter OR clause over-counts | Small revenue inflation |
| PAR-05 | Financial providers overview has no pagination | Future scalability |
| PAR-06 | Referral/waitlist analytics ignore country | Country admins see wrong data |
| DUP-01 | Revenue calculated 3 different ways | Conflicting numbers on one screen |
| DUP-02 | Platform fees calculated 3 different ways | Conflicting numbers |
| DUP-03 | Provider payouts/earnings — 3 conflicting sources | Financial confusion |
| DUP-04 | Cancellation rate — 4 different definitions | Inconsistent reporting |
| DUP-05 | Monthly revenue trend — 3 separate implementations | Inconsistent charts |
| DUP-07 | Schedule utilization — 2 conflicting implementations | Confusing to providers |
| DUP-09 | Financial Reports duplicates Analytics Overview | Wasted fetch, duplicate panel |
| CUR-03 | Provider earnings CSV currency column misleads | Export confusion |
| CUR-07 | refundTotal may sum non-USD historical amounts | Historical inaccuracy |
| PERM-01 | `/api/admin/analytics/events` and `/api/admin/analytics/funnel` missing permission check | Underprivileged access |
| PERM-02 | Master Report endpoints missing `PAYMENTS_VIEW` permission | Financial data too accessible |
| PERF-03 | Providers overview no pagination | Future risk |
| PERF-06 | Enhanced analytics: 11 sequential queries | Slow on cold cache |

### P3 — Low (address in tech debt sprint)

| ID | Issue | Impact |
|----|-------|--------|
| PAR-08 | Admin home SQL injection via string interpolation | Low risk (enum-constrained input) |
| DUP-06 | User growth: 3 separate implementations | Not coordinated |
| DUP-08 | Repeat patient rate: 2 definitions | Minor inconsistency |
| STL-02 | 30s analytics cache may serve stale data | Acceptable trade-off |
| PERF-07 | OFFSET pagination degrades at scale | Acceptable at current scale |
| EXF-05 | PDF export does not exist (mentioned in specs) | Feature gap |
| EXF-06 | Scheduled/automated reports do not exist | Feature gap |

---

## APPENDIX — ROUTE CROSS-REFERENCE

### Backend Routes with No Frontend Consumer
- `/api/admin/analytics/events` — no frontend consumer found
- `/api/admin/analytics/funnel` — no frontend consumer found
- `/api/analytics/track` — called by frontend event tracking (POST, correct)
- `/api/admin/providers/:id/stats` — no frontend component found consuming this (admin sees per-provider detail via `/api/admin/financial/providers/:id/detail` instead)

### Frontend Queries with No Backend Route
- `/api/admin/analytics/monthly` — **BROKEN** (BRK-01)

### Routes with Missing Permission Guards
- `/api/admin/analytics/events`
- `/api/admin/analytics/funnel`
- `/api/admin/financial/providers-overview`
- `/api/admin/financial/providers/:id/detail`
- `/api/admin/financial/master-report` (all sub-routes)
