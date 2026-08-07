---
name: Analytics consolidation pattern
description: How analytics surfaces are structured after the BI Consolidation Sprint — reporting hubs, revenue filter rule, and pool-safe query patterns.
---

## Reporting Hub Architecture

Three consolidated reporting centers replaced ~10 separate analytics surfaces:

- **Admin:** `AdminReportingCenter` at `client/src/components/admin/dashboard/admin-reporting-center.tsx` — 6 lazy sub-tabs (Overview, Insights, Revenue, Operations, Master, Location). Nav entry is `value="reports"` (was 5 separate nav items).
- **Provider:** `ProviderReportingCenter` at `client/src/components/provider/dashboard/ProviderReportingCenter.tsx` — `defaultSection` prop drives initial sub-tab ("analytics" or "insights").
- **Patient:** `PatientReportingCenter` at `client/src/components/patient/PatientReportingCenter.tsx` — backed by `GET /api/patient/analytics` in `server/routes/patient.routes.ts`.

## Revenue Filter Rule (CRITICAL)

Always filter completed revenue with `payment_status = 'completed'`, NOT `status = 'completed'`.

- `appointments.status` = workflow state (pending/confirmed/completed/cancelled)
- `appointments.payment_status` = financial state (pending/completed/refunded)

Using `status='completed'` silently under-counts revenue because many paid appointments never reach status=completed (e.g. confirmed + paid, then rescheduled).

**Applies to:** any SQL touching `appointments.total_amount` or `appointments.booking_currency`.

## Pool Exhaustion Rule (provider routes)

`GET /api/provider/analytics` and `GET /api/provider/insights` use **single-client sequential queries** (check out one client from pool, run all queries sequentially, release). Never use `Promise.all` with multiple Drizzle queries on these endpoints — pool.max=12 means >6 concurrent tasks per request causes EMAXCONNSESSION.

**Why:** Provider routes are called by every provider on page load simultaneously; parallel within-request queries multiply pool usage by query count.
