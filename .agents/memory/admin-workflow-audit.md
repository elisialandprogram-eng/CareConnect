---
name: Admin workflow audit
description: Key bugs found and fixed during the June 2026 admin domain complete audit
---

# Admin Workflow Audit — June 2026

## Security
- `/admin/bug-reports` had NO ProtectedRoute in App.tsx — anyone could view it. Fixed by wrapping with ProtectedRoute + admin roles.
- Check ALL new admin page routes in App.tsx — the ProtectedRoute wrapper is easy to forget.

## Route Registration Order (routes.ts)
```
113: registerAdminUsersRoutes     ← wins any shared-path conflict
114: registerAdminProvidersRoutes
115: registerAdminFinancialRoutes
116: registerAdminMonitoringRoutes
117: registerAdminComplianceRoutes
```
admin-users is registered FIRST — any path it defines shadows the same path in admin-monitoring.

## Duplicate route
`GET /api/admin/stale-bookings` existed in BOTH admin-users (line 47) and admin-monitoring (line 293). admin-users wins. Removed the unreachable duplicate from admin-monitoring.

## Country isolation gap
`active_memberships` subquery in `/api/admin/home-summary` had no country_code filter. user_packages has no country_code — must JOIN users ON user_id and filter via users.country_code.

## Duplicate UI tabs
Admin dashboard had TWO audit log tabs: `audit` (AuditLogPanel, older) and `audit-enhanced` (AdminAuditLogs, newer). Removed the old `audit` tab; consolidated into `audit-enhanced` renamed to "Audit Logs".

## Non-functional forms
Integrations tab Google/Messaging sub-tabs had inputs + save buttons that only fired a toast without saving. Replaced with env-var reference notices. The Payments sub-tab (StripeSettingsPanel) is functional and was kept.

**Why:** Fake save buttons deceive admins into believing configuration was persisted when it wasn't.
