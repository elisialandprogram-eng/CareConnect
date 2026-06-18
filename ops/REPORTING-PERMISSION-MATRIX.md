# GoldenLife — Reporting Permission Matrix
**Date:** 2026-06-18

---

## Permission Levels

| Level | Description | Middleware |
|-------|-------------|-----------|
| `global_admin` | Full platform access, all countries | `requireGlobalAdmin` |
| `admin` | Full platform access, all countries | `requireAdmin` |
| `country_admin` | Scoped to assigned country_code | `requireAdmin` + `canAccessCountry()` |
| `provider` | Own data only, scoped by provider_id | `authenticateToken` + provider ownership check |
| `patient` | Own data only, scoped by patient_id (user.id) | `authenticateToken` + patient ownership check |

---

## Admin Reporting Access

### Executive Tab
| Report | Endpoint | Required Permission | Country Scoped |
|--------|----------|-------------------|----------------|
| Revenue KPIs | `GET /api/admin/analytics` | `requireAdmin` | Yes |
| Booking KPIs | `GET /api/admin/analytics` | `requireAdmin` | Yes |
| Provider counts | `GET /api/admin/analytics` | `requireAdmin` | Yes |
| Patient counts | `GET /api/admin/analytics` | `requireAdmin` | Yes |
| Revenue chart (12mo) | `GET /api/admin/analytics` | `requireAdmin` | Yes |

### Financial Tab
| Report | Endpoint | Required Permission | Country Scoped |
|--------|----------|-------------------|----------------|
| Master Report | `GET /api/admin/financial/master-report` | `requireAdmin` + `PAYMENTS_VIEW` | Yes |
| Master Report Summary | `GET /api/admin/financial/master-report/summary` | `requireAdmin` + `PAYMENTS_VIEW` | Yes |
| Revenue Trends | `GET /api/admin/financial/revenue-trends` | `requireAdmin` | Yes |
| Master Report CSV | `GET /api/admin/financial/master-report/export/csv` | `requireAdmin` + `PAYMENTS_VIEW` | Yes |

### Operations Tab
| Report | Endpoint | Required Permission | Country Scoped |
|--------|----------|-------------------|----------------|
| Support Analytics | `GET /api/admin/support/analytics` | `requireAdmin` | Yes |
| Growth Metrics | `GET /api/admin/analytics/growth-metrics` | `requireAdmin` | Yes |
| No-Show Analysis | `GET /api/admin/analytics/growth-metrics` | `requireAdmin` | Yes |

### Providers Tab
| Report | Endpoint | Required Permission | Country Scoped |
|--------|----------|-------------------|----------------|
| Enhanced Analytics | `GET /api/admin/analytics/enhanced` | `requireAdmin` | Yes |
| Provider Overview | `GET /api/admin/financial/providers-overview` | `requireAdmin` + `VIEW_PROVIDERS` | Yes |
| Provider Detail | `GET /api/admin/financial/providers/:id/detail` | `requireAdmin` + `VIEW_PROVIDERS` | Yes |

### Patients Tab
| Report | Endpoint | Required Permission | Country Scoped |
|--------|----------|-------------------|----------------|
| Patient Growth | `GET /api/admin/analytics/enhanced` | `requireAdmin` | Yes |
| Patient Retention | `GET /api/admin/analytics/enhanced` | `requireAdmin` | Yes |
| Patient LTV | `GET /api/admin/analytics/enhanced` | `requireAdmin` | Yes |

### Memberships Tab
| Report | Endpoint | Required Permission | Country Scoped |
|--------|----------|-------------------|----------------|
| Package/Membership Analytics | `GET /api/admin/analytics/memberships` | `requireAdmin` | Yes |

### Packages Tab
| Report | Endpoint | Required Permission | Country Scoped |
|--------|----------|-------------------|----------------|
| Package Conversion | `GET /api/admin/analytics/commercial` | `requireAdmin` | Partial (referrals/waitlist: No) |
| Promo Effectiveness | `GET /api/admin/analytics/commercial` | `requireAdmin` | Yes |

### Revenue Intelligence Tab
| Report | Endpoint | Required Permission | Country Scoped |
|--------|----------|-------------------|----------------|
| Revenue Trends 12mo | `GET /api/admin/financial/revenue-trends` | `requireAdmin` | Yes |
| Commercial Analytics | `GET /api/admin/analytics/commercial` | `requireAdmin` | Partial |

### Geographic Tab
| Report | Endpoint | Required Permission | Country Scoped |
|--------|----------|-------------------|----------------|
| Location Analytics | `GET /api/admin/analytics/location` | `requireAdmin` | Yes |

### Compliance Tab
| Report | Endpoint | Required Permission | Country Scoped |
|--------|----------|-------------------|----------------|
| KYC/Compliance Status | `GET /api/admin/analytics/compliance` | `requireAdmin` | Yes |
| Verification Queue | `GET /api/admin/verification-queue` | `requireAdmin` | Yes |

### Support Tab
| Report | Endpoint | Required Permission | Country Scoped |
|--------|----------|-------------------|----------------|
| Support Ticket Analytics | `GET /api/admin/support/analytics` | `requireAdmin` | Yes |

### Exports Tab
| Report | Endpoint | Required Permission | Country Scoped |
|--------|----------|-------------------|----------------|
| Financial Overview CSV | `GET /api/admin/financial/export-csv` | `requireAdmin` | Yes |
| Appointments CSV | `GET /api/admin/export/appointments.csv` | `requireAdmin` | Yes |
| Users CSV | `GET /api/admin/export/users.csv` | `requireAdmin` | Yes |
| Revenue CSV | `GET /api/admin/export/revenue.csv` | `requireAdmin` | Yes |
| Payouts CSV | `GET /api/admin/export/payouts.csv` | `requireAdmin` | Yes |
| Master Report CSV | `GET /api/admin/financial/master-report/export/csv` | `requireAdmin` + `PAYMENTS_VIEW` | Yes |

---

## Provider Reporting Access

**Principle:** Providers can ONLY see their own data. All provider endpoints filter by `provider_id` derived from `req.user.id`.

| Tab | Endpoint | Data Scope |
|-----|----------|-----------|
| Overview | `/api/provider/insights` | Own provider only |
| Revenue | `/api/provider/analytics` | Own provider only |
| Patients | `/api/provider/insights` | Own patients only |
| Bookings | `/api/provider/analytics` | Own bookings only |
| Services | `/api/provider/analytics` | Own services only |
| Schedule | `/api/provider/analytics` | Own time slots only |
| Reviews | `/api/provider/analytics` | Own reviews only |
| Financials | `/api/provider/earnings` | Own earnings only |
| Payouts | `/api/provider/wallet` + `/api/provider/payout-summary` | Own wallet only |
| Growth | `/api/provider/insights` | Own insights only |
| Exports | `/api/provider/earnings/export` | Own data only |

**Cross-data rule:** Providers cannot query another provider's analytics. No endpoint accepts a `provider_id` query param from authenticated provider users.

---

## Patient Reporting Access

**Principle:** Patients can ONLY see their own data. All patient endpoints filter by `user.id`.

| Tab | Endpoint | Data Scope |
|-----|----------|-----------|
| Overview | `/api/patient/analytics` | Own data only |
| Health Activity | `/api/patient/analytics` | Own appointments only |
| Appointments | `/api/patient/analytics` | Own appointments only |
| Spending | `/api/patient/analytics` | Own payments only |
| Memberships | `/api/patient/analytics` | Own memberships only |
| Packages | `/api/patient/analytics` | Own packages only |
| Documents | `/api/patient/prescriptions` + `/api/invoices` | Own documents only |
| Timeline | `/api/patient/analytics` | Own activity only |

**Cross-data rule:** Patients cannot see other patients' data. The `patient_id` filter is always `req.user.id`, never a query parameter from the request.

---

## Security Rules

1. No unauthenticated access to any reporting endpoint.
2. No role escalation — a provider token cannot access admin endpoints.
3. Country-admin access is filtered by `canAccessCountry()` middleware.
4. Provider-scoped endpoints derive `provider_id` from the auth token, never from query params.
5. Patient-scoped endpoints derive `patient_id` from `req.user.id`, never from query params.
6. All SQL filters use parameterized queries (no string interpolation on user input).
