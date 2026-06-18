# GoldenLife — Reporting Source of Truth
**Date:** 2026-06-18
**Authority:** This document is the single source of truth for all KPI definitions.
No dashboard may define its own formula. All dashboards must consume the registered KPI.

---

## KPI Ownership Rule

Every KPI has exactly ONE owner. If two reports show the same KPI with the same filters, they must show identical numbers. Any deviation is a bug.

---

## KPI Registry

### Revenue KPIs

| KPI | Formula | Source Tables | Source Fields | Filter | Currency | Role |
|-----|---------|--------------|---------------|--------|----------|------|
| **Total Revenue** | `SUM(total_amount) WHERE payment_status = 'completed'` | `appointments` | `total_amount` | country_code, date range | USD | Admin |
| **Revenue Today** | `SUM(total_amount) WHERE payment_status='completed' AND date::date = CURRENT_DATE` | `appointments` | `total_amount`, `date` | country_code | USD | Admin |
| **Revenue This Month** | `SUM(total_amount) WHERE payment_status='completed' AND date_trunc('month', created_at) = date_trunc('month', NOW())` | `appointments` | `total_amount`, `created_at` | country_code | USD | Admin |
| **Revenue Last Month** | `SUM(total_amount) WHERE payment_status='completed' AND date_trunc('month', created_at) = date_trunc('month', NOW() - INTERVAL '1 month')` | `appointments` | `total_amount`, `created_at` | country_code | USD | Admin |
| **Revenue Growth %** | `(thisMonth - lastMonth) / NULLIF(lastMonth, 0) * 100` | computed | — | — | % | Admin |
| **Revenue Series (12mo)** | Monthly `SUM(total_amount) WHERE payment_status='completed'` with gap-fill | `appointments` + `generate_series` | `total_amount`, `created_at` | country_code | USD | Admin |
| **Platform Fee Revenue** | `SUM(platform_fee_amount) WHERE payment_status='completed'` | `appointments` | `platform_fee_amount` | country_code | USD | Admin |
| **Provider Payouts** | `SUM(amount) WHERE status='completed'` | `payout_requests` | `amount` | country_code | USD | Admin |
| **Avg Booking Value** | `SUM(total_amount) / COUNT(*) WHERE payment_status='completed'` | `appointments` | `total_amount` | country_code | USD | Admin |
| **Net Revenue** | `Total Revenue - Platform Fee Revenue` | computed | — | — | USD | Admin |

**Rule:** Revenue ALWAYS filters by `payment_status = 'completed'`. Never by `status = 'completed'` alone. Never by `status = 'completed' OR payment_status = 'completed'`.

---

### Booking KPIs

| KPI | Formula | Source Tables | Filter | Role |
|-----|---------|--------------|--------|------|
| **Total Bookings** | `COUNT(*) all statuses` | `appointments` | country_code | Admin |
| **Pending Bookings** | `COUNT(*) WHERE status = 'pending'` | `appointments` | country_code | Admin |
| **Confirmed Bookings** | `COUNT(*) WHERE status = 'confirmed'` | `appointments` | country_code | Admin |
| **Completed Bookings** | `COUNT(*) WHERE status = 'completed'` | `appointments` | country_code | Admin |
| **Cancelled Bookings** | `COUNT(*) WHERE status IN ('cancelled','cancelled_by_patient','cancelled_by_provider')` | `appointments` | country_code | Admin |
| **Cancellation Rate** | `cancelled / NULLIF(total, 0) * 100` using 3-status cancelled definition | `appointments` | country_code, date range | Admin |
| **No-Show Rate** | `COUNT(*) WHERE status = 'no_show' / NULLIF(total, 0) * 100` | `appointments` | country_code | Admin |
| **Schedule Utilization** | `completed_count / NULLIF(total_slots, 0) * 100` from appointments (NOT time_slots.is_booked) | `appointments` | provider_id, date range | Admin/Provider |

**Rule:** Cancellation Rate uses EXACTLY 3 statuses: `cancelled`, `cancelled_by_patient`, `cancelled_by_provider`. Not 5 (which would include `rejected` + `expired` — those are separate metrics).

---

### Provider KPIs

| KPI | Formula | Source Tables | Filter | Currency | Role |
|-----|---------|--------------|--------|----------|------|
| **Active Providers** | `COUNT(*) WHERE status IN ('active', 'approved')` | `providers` | country_code | N/A | Admin |
| **New Providers (30d)** | `COUNT(*) WHERE created_at >= NOW() - INTERVAL '30 days'` | `providers` | country_code | N/A | Admin |
| **Provider Revenue** | `SUM(a.total_amount) WHERE payment_status='completed'` grouped by provider | `appointments` | provider_id | USD | Admin |
| **Provider Earnings** | `SUM(provider_earning)` from actual recorded earnings | `provider_earnings` | provider_id | USD | Admin |
| **Provider Net Earnings** | `SUM(provider_earning) - SUM(amount) WHERE status='completed'` | `provider_earnings`, `payout_requests` | provider_id | USD | Admin |
| **Provider Utilization** | `completed_count / NULLIF(total_count, 0) * 100` (12 months) | `appointments` | provider_id | % | Provider |
| **Provider Repeat Patient %** | `patients_with_≥2_visits / NULLIF(unique_patients, 0) * 100` | `appointments` | provider_id | % | Provider |
| **Provider Cancellation Rate** | `cancelled(3 statuses) / NULLIF(total, 0) * 100` | `appointments` | provider_id | % | Provider |

---

### Patient KPIs

| KPI | Formula | Source Tables | Filter | Currency | Role |
|-----|---------|--------------|--------|----------|------|
| **Total Patients** | `COUNT(*) WHERE role = 'patient'` | `users` | country_code | N/A | Admin |
| **Active Patients (90d)** | `COUNT(DISTINCT patient_id) WHERE created_at >= NOW() - INTERVAL '90 days'` | `appointments` | country_code | N/A | Admin |
| **New Patients (30d)** | `COUNT(*) WHERE role='patient' AND created_at >= NOW() - INTERVAL '30 days'` | `users` | country_code | N/A | Admin |
| **Returning Patients** | `COUNT(DISTINCT patient_id) HAVING COUNT(*) > 1` | `appointments` | country_code | N/A | Admin |
| **Patient Retention Rate** | `returningPatients / NULLIF(activePatients, 0) * 100` | computed | country_code | % | Admin |
| **Patient Total Spend** | `SUM(total_amount) WHERE payment_status='completed' AND patient_id = self` | `appointments` | patient_id | Patient preferred | Patient |
| **Patient 30d Spend** | `SUM(total_amount) WHERE payment_status='completed' AND patient_id=self AND created_at >= NOW()-30d` | `appointments` | patient_id | Patient preferred | Patient |

---

### Package & Membership KPIs

| KPI | Formula | Source Tables | Filter | Currency | Role |
|-----|---------|--------------|--------|----------|------|
| **Total Package Sales** | `COUNT(DISTINCT up.id)` | `user_packages` | country_code | N/A | Admin |
| **Active Packages** | `COUNT(*) WHERE status = 'active'` | `user_packages` | country_code | N/A | Admin |
| **Package Revenue** | `SUM(price_paid) WHERE status NOT IN ('cancelled')` | `user_packages` | country_code | USD | Admin |
| **Package Conversion** | `COUNT(up.id) / NULLIF(COUNT(DISTINCT p.id),0)` per package | `packages`, `user_packages` | country_code | N/A | Admin |

---

### Support KPIs

| KPI | Formula | Source Tables | Filter | Role |
|-----|---------|--------------|--------|------|
| **Open Tickets** | `COUNT(*) WHERE status = 'open'` | `support_tickets` | country_code | Admin |
| **Avg Resolution Time** | `AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600)` | `support_tickets` | country_code | Admin |
| **SLA Compliance** | `COUNT(*) WHERE resolved within SLA / NULLIF(total_resolved, 0) * 100` | `support_tickets` | — | Admin |

---

## Currency Rules

| Report Type | Currency | Rule |
|-------------|---------|------|
| Admin Financial Reports | USD | All stored amounts are USD. Display in USD only. Use `useAdminCurrency()`. |
| Provider Reports | Provider native currency | Display in provider's country currency. Use `useCurrency()` + `fmtEarnings`. |
| Patient Reports | Patient preferred currency | Display in patient's preferred currency. Use `formatPrice()` from `useCurrency()`. |

**No report may mix currencies. No formatter may assume a currency. No raw `$` signs.**

---

## Endpoint Registry (Single Source)

| Endpoint | Owner KPIs | Auth |
|----------|-----------|------|
| `GET /api/admin/analytics` | Revenue KPIs, Booking KPIs, Provider counts | Admin |
| `GET /api/admin/analytics/enhanced` | Patient KPIs, Provider rankings, Refunds | Admin |
| `GET /api/admin/analytics/commercial` | Package conversion, Promo effectiveness | Admin |
| `GET /api/admin/analytics/memberships` | Package/Membership KPIs | Admin |
| `GET /api/admin/analytics/compliance` | KYC status, doc expiry | Admin |
| `GET /api/admin/financial/revenue-trends` | Revenue 12-month series | Admin |
| `GET /api/admin/financial/master-report` | Forensic booking ledger | Admin |
| `GET /api/admin/support/analytics` | Support KPIs | Admin |
| `GET /api/admin/analytics/location` | Geographic KPIs | Admin |
| `GET /api/provider/analytics` | Provider-scoped booking/service/review KPIs | Provider |
| `GET /api/provider/insights` | Provider-scoped utilization/retention/growth | Provider |
| `GET /api/provider/earnings` | Provider earnings history | Provider |
| `GET /api/provider/wallet` | Provider wallet balance + monthly trend | Provider |
| `GET /api/provider/payout-summary` | Provider payout summary | Provider |
| `GET /api/patient/analytics` | Patient-scoped spend/activity KPIs | Patient |
