# Admin Workflow Complete Audit & Fix Report
**Date:** 2026-06-10  
**Sprint:** Admin Workflow Audit  
**Status:** ✅ CLOSED — all critical findings fixed

---

## Scope

Full audit of the GoldenLife admin domain:
- 9 decomposed admin route files (`server/routes/admin/`)
- Admin dashboard SPA (35+ tabs, 6 nav groups)
- Admin home page (`admin-home.tsx`)
- App.tsx route registration for all `/admin/*` paths

---

## Findings & Fixes

### 🔴 CRITICAL: `/admin/bug-reports` missing auth protection (FIXED)
**File:** `client/src/App.tsx`  
**Issue:** `<Route path="/admin/bug-reports" component={AdminBugReports} />` had NO `ProtectedRoute` wrapper — any unauthenticated user could navigate to it directly.  
**Fix:** Wrapped in `<ProtectedRoute allowedRoles={["admin","global_admin","country_admin","verification_admin"]}>`.

---

### 🔴 CRITICAL: Duplicate `GET /api/admin/stale-bookings` route (FIXED)
**Files:** `server/routes/admin/admin-monitoring.routes.ts` (line ~293) AND `server/routes/admin/admin-users.routes.ts` (line 47)  
**Issue:** Express registers routes in FIFO order. `admin-users.routes.ts` is registered at line 113 of `server/routes.ts`, `admin-monitoring.routes.ts` at line 116 — so `admin-users` wins. The `admin-monitoring` version was completely unreachable. Both implementations were identical Drizzle ORM queries.  
**Fix:** Removed the unreachable duplicate from `admin-monitoring.routes.ts`. Canonical handler stays in `admin-users.routes.ts`.

---

### 🟡 HIGH: Duplicate audit log tabs in admin dashboard (FIXED)
**File:** `client/src/pages/admin-dashboard.tsx`  
**Issue:** Two tabs both displaying audit logs:
- `audit` → `AuditLogPanel` (older, page size 25, fewer action type colors)
- `audit-enhanced` → `AdminAuditLogs` (newer, more action types: `wallet_adjust`, `ledger_override`, `circuit_breaker`, `repair_earnings`, better UX)

**Fix:** Removed the `audit` tab nav entry, `AuditLogPanel` import, and its render conditional. Renamed `audit-enhanced` label to `t("admin.audit_logs", "Audit Logs")` so the canonical Audit Log Viewer is the single audit panel.

---

### 🟡 HIGH: `active_memberships` missing country isolation (FIXED)
**File:** `server/routes/admin/admin-home.routes.ts`  
**Issue:** The `active_memberships` subquery in the home summary aggregation had no `country_code` filter, while all other stats in the same query correctly applied `${ccClause}`. A country-scoped admin would see global active membership counts.  
**Fix:** Added `JOIN users u ON u.id = up.user_id` with `AND u.country_code::text = '${countryFilter}'` guard.

---

### 🟡 HIGH: Non-functional integrations tab (FIXED)
**File:** `client/src/pages/admin-dashboard.tsx`  
**Issue:** The "Google APIs" and "Messaging" sub-tabs of the Integrations panel contained real-looking form inputs with "Save" buttons that — on click — only fired `toast({ title: t("common.success") })` without persisting anything. This is misleading to admins.  
**Fix:** Replaced the fake forms with informational notices explaining that these credentials are managed via server environment variables (listing the specific env var names).

---

## Non-Issues Investigated

| Concern | Finding |
|---|---|
| `PATCH /api/admin/providers/:id` duplicate | Only in `admin-users.routes.ts`. `admin-providers.routes.ts` only has `PATCH .../office-hours`, `PATCH .../verify-document` etc. — NOT a bare `:id` patch. No conflict. |
| `DELETE /api/admin/providers/:id` duplicate | Only in `admin-users.routes.ts`. Not in `admin-providers.routes.ts`. No conflict. |
| `GET /api/admin/wallets/:userId` duplicate | `admin-financial.routes.ts` has `GET /wallets/:userId/transactions` (different path). `admin-users.routes.ts` has bare `GET /wallets/:userId`. Complementary, not conflicting. |
| `POST /api/admin/admins` vs `POST /api/admin/admin-users` | Different routes doing slightly different things. No frontend uses `/api/admin/admins` directly (it's a legacy endpoint). Both are protected by `requireGlobalAdmin`. No conflict. |
| SQL injection risk in `admin-home.routes.ts` | `listingCountryFilter()` validates via `isCountryCode()` — only accepts `"HU"` or `"IR"`. String interpolation is safe. No actual injection risk. |
| `users` table missing country_code column | `users` table has `country_code` as a column (confirmed in schema). Active_memberships fix JOIN is valid. |
| `/admin/stale-bookings`, `/admin/earnings`, `/admin/users` standalone pages | All three are correctly wrapped in `ProtectedRoute` in App.tsx. These are intentional standalone pages (linked from dashboard header buttons), not dashboard tabs. |
| Four overlapping analytics views | `overview`, `enhanced-analytics`, `revenue-intelligence`, `ops-intelligence` serve different purposes (summary vs detailed vs intelligence dashboards). Not actual duplicates — intentional layering. |

---

## TypeScript
```
EXIT 0 — no type errors
```

---

## Route Registration Order (reference)
```
113: registerAdminUsersRoutes     ← wins any shared-path conflict
114: registerAdminProvidersRoutes
115: registerAdminFinancialRoutes
116: registerAdminMonitoringRoutes
117: registerAdminComplianceRoutes
118: registerFinancialReconcileRoutes
```
