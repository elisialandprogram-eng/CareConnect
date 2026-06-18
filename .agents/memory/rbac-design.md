---
name: RBAC system design
description: How the multi-level RBAC system is structured — roles, permissions, assignments, and middleware
---

## The rule
Permission keys follow `module:action` (e.g. `payments:refund`). Six system roles are seeded at server startup via `runStartupMigrations()`: `super_admin`, `country_admin`, `operations_admin`, `finance_admin`, `support_admin`, `read_only_admin`.

## Why
Allows fine-grained access control without changing user `role` column on every policy change. The `admin_assignments` table links user → role with optional `country_code` scoping.

## How to apply
- Add new permissions to `PERMISSION_CATALOG` in `server/middleware/rbac.ts` and assign to roles in `DEFAULT_ROLE_PERMISSIONS`.
- Use `requirePermission(PERMISSIONS.X)` middleware on routes.
- Call `invalidatePermCache(userId)` after any role/assignment change.
- The permission cache TTL is 30 seconds.
- `super_admin` maps to coarse `global_admin` user role; all other RBAC roles map to `country_admin`.
