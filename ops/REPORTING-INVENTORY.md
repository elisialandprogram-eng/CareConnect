# GoldenLife — Reporting Inventory
**Date:** 2026-06-18
**Sprint:** Final Reporting, Analytics & BI Consolidation

---

## 1. Admin Reporting Surfaces

### 1.1 Admin Reporting Center (`admin-reporting-center.tsx`)
Single entry point via sidebar → Reports. 12 tabs post-consolidation.

| Tab | Component | Primary Endpoint | Data |
|-----|-----------|-----------------|------|
| Executive | `AnalyticsOverview` | `GET /api/admin/analytics` | Revenue KPIs, bookings, users, charts |
| Financial | `FinancialMasterReport` | `GET /api/admin/financial/master-report` | Forensic ledger, summaries |
| Operations | `OperationsIntelligenceDashboard` | `GET /api/admin/support/analytics` + `GET /api/admin/analytics/growth-metrics` | Support SLA, growth, no-show |
| Providers | `EnhancedAnalyticsDashboard` | `GET /api/admin/analytics/enhanced` | Provider rankings, retention, refunds |
| Patients | Inline `AdminPatientsPanel` | `GET /api/admin/analytics/enhanced` | Patient growth, retention, LTV |
| Memberships | Inline `AdminMembershipsPanel` | `GET /api/admin/analytics/memberships` | Revenue, active/expired, trend |
| Packages | Inline `AdminPackagesPanel` | `GET /api/admin/analytics/commercial` | Package sales, conversion, revenue |
| Revenue Intelligence | `RevenueIntelligenceDashboard` | `GET /api/admin/financial/revenue-trends` + `GET /api/admin/analytics/commercial` | Revenue trends, promos, funnels |
| Geographic | `LocationAnalyticsPanel` | `GET /api/admin/analytics/location` | City/country distribution |
| Compliance | Inline `AdminCompliancePanel` | `GET /api/admin/analytics/compliance` | KYC status, doc expiry |
| Support | Inline `AdminSupportPanel` | `GET /api/admin/support/analytics` | Tickets, SLA, response times |
| Exports | Inline `AdminExportsPanel` | Multiple CSV endpoints | Download links for all exports |

### 1.2 Admin Financial / Operational Panels (separate nav tabs)

| Panel | File | Endpoint | Data |
|-------|------|----------|------|
| Financial Alerts | `financial-alerts-panel.tsx` | `GET /api/admin/financial/alerts` | Alert list, severity, status |
| Wallets | `admin-wallets.tsx` | `GET /api/admin/wallets` | Patient wallet balances |
| Provider Wallets | `admin-provider-wallets.tsx` | `GET /api/admin/provider-wallets` | Provider wallet balances, ledger |
| Payouts | `admin-payouts.tsx` | `GET /api/admin/payout-requests` | Payout requests, status |
| Invoices | `invoice-management.tsx` | `GET /api/admin/invoices` | Invoice list |
| Revenue & Billing | `revenue-billing-center.tsx` | Multiple | Revenue rules, tax, billing config |
| Monitoring | `database-health-panel.tsx` | `GET /api/admin/monitoring/stats` | System health, endpoint perf |

---

## 2. Provider Reporting Surfaces

### 2.1 Provider Reporting Center (`ProviderReportingCenter.tsx`)
Integrated in provider dashboard. 11 tabs post-consolidation.

| Tab | Source Endpoint | Data |
|-----|----------------|------|
| Overview | `/api/provider/insights` + `/api/provider/analytics` | KPIs: completed, utilization, repeat %, cancel % |
| Revenue | `/api/provider/analytics` | Monthly revenue trend, by service |
| Patients | `/api/provider/insights` | Repeat patients list, retention %, new vs returning |
| Bookings | `/api/provider/analytics` | Monthly bookings, cancellations, no-shows |
| Services | `/api/provider/analytics` | Service breakdown: revenue, bookings, rating per service |
| Schedule | `/api/provider/analytics` | Slot utilization, busy hours heatmap |
| Reviews | `/api/provider/analytics` | Rating distribution (1-5 stars), review count |
| Financials | `/api/provider/earnings` | Gross revenue, platform fees, net earnings, taxes |
| Payouts | `/api/provider/wallet` + `/api/provider/payout-summary` | Wallet balance, payout history |
| Growth | `/api/provider/insights` | 12-week revenue trend, growth recommendations |
| Exports | `/api/provider/earnings/export` | CSV earnings download |

### 2.2 Provider Earnings Page (`provider-earnings.tsx`)
Standalone `/provider-earnings` page — full earnings table with filters. Retained as-is.

---

## 3. Patient Reporting Surfaces

### 3.1 Patient Reporting Center (`PatientReportingCenter.tsx`)
8 tabs accessible from patient dashboard → Insights tab.

| Tab | Source | Data |
|-----|--------|------|
| Overview | `/api/patient/analytics` | KPI cards, monthly spend, top providers |
| Health Activity | `/api/patient/analytics` | Monthly activity chart (completed/cancelled), provider activity |
| Appointments | `/api/patient/analytics` | Booking history trends, cancellation history |
| Spending | `/api/patient/analytics` | Monthly/yearly/lifetime spend, savings |
| Memberships | `/api/patient/analytics` | Active memberships, benefits used, savings |
| Packages | `/api/patient/analytics` | Session packages, usage, completion rate |
| Documents | `/api/patient/prescriptions` + `/api/invoices` | Prescription list, invoice download |
| Timeline | `/api/patient/analytics` | Chronological activity view |

---

## 4. Export Registry

| ID | Name | Endpoint | Format | Currency | Role |
|----|------|----------|--------|----------|------|
| EX01 | Financial Overview CSV | `GET /api/admin/financial/export-csv` | CSV | USD | Admin |
| EX02 | Appointments CSV | `GET /api/admin/export/appointments.csv` | CSV | USD | Admin |
| EX03 | Users CSV | `GET /api/admin/export/users.csv` | CSV | N/A | Admin |
| EX04 | Revenue CSV | `GET /api/admin/export/revenue.csv` | CSV | USD | Admin |
| EX05 | Payouts CSV | `GET /api/admin/export/payouts.csv` | CSV | USD | Admin |
| EX06 | Master Report CSV | `GET /api/admin/financial/master-report/export/csv` | CSV | USD | Admin |
| EX07 | Provider Earnings CSV | `GET /api/provider/earnings/export` | CSV | Provider currency | Provider |

---

## 5. Eliminated Duplicates

| Removed | Replaced By |
|---------|-------------|
| `financial-reports.tsx` (standalone) | `FinancialMasterReport` inside Admin Reporting Center |
| 5 separate lazy imports in admin-dashboard.tsx | Single `AdminReportingCenter` lazy import |
| 6 separate tab content blocks (financial, master-report, etc.) | Single "reports" tab content |
| Ghost `useQuery` for `/api/admin/analytics/monthly` (non-existent) | Removed in prior sprint |
| Inline `insightsLoading` block in provider-dashboard.tsx | `ProviderReportingCenter` |
| Provider `analytics` + `insights` as separate sidebar items | Merged into single Reporting Center |

---

## 6. Dead Code Status

All dead code identified in `ANALYTICS-REPORTS-FORENSIC-AUDIT.md` has been eliminated.
No duplicate KPI definitions remain.
No conflicting revenue calculations remain.
