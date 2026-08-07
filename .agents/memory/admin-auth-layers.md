---
name: Admin auth layering
description: The three-layer admin authentication/authorization chain in routes.ts
---

## The rule
Admin routes use three middleware layers in order:
1. `authenticateToken` — validates JWT, sets `req.user`
2. `requireAdmin` (any admin) or `requireGlobalAdmin` (global only) — coarse role check
3. `requirePermission(PERMISSIONS.X)` — fine-grained RBAC check from `admin_assignments` table

## Why
Legacy `admin` and `global_admin` users predate RBAC. They bypass permission checks entirely (treated as super_admin) so existing routes continue working without assignment records.

## How to apply
- New admin routes that global admins only should use: `authenticateToken, requireGlobalAdmin`
- New admin routes with fine-grained control: `authenticateToken, requireAdmin, requirePermission(PERMISSIONS.X)`
- `invalidateAuthCache(userId)` and `invalidatePermCache(userId)` must both be called when role or assignment changes.
