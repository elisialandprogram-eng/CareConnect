---
name: Phase 2 security architecture
description: Current authentication, role, session invalidation, and admin-boundary rules established during identity hardening.
---

The application has one shared role vocabulary for legacy user roles and specialized RBAC admin roles. Legacy `admin` and `global_admin` are super-admin compatibility roles; specialized admin access requires an active admin assignment and explicit permission rows. Missing assignments are explicit denies, not implicit grants.

**Why:** Mixing coarse user roles, frontend-only role lists, and database permission assignments caused authorization drift and made it possible for tests to pass against stale contracts.

**How to apply:** Add new role checks through `shared/authorization.ts`, `client/src/lib/roles.ts`, and the RBAC middleware. Do not introduce a second role catalogue or hidden default permission path.

All `/api/admin` routes pass through centralized authentication and coarse admin-role middleware before module-specific permission checks. Resource-level handlers still own country scope and ownership validation.

**Why:** Several admin modules had inconsistent protection and some handlers depended on route-local middleware ordering.

**How to apply:** Keep specialized permissions in `requirePermission(...)`; keep country/resource checks at the data boundary until they are consolidated into a shared service.

Refresh tokens are stored only as SHA-256 hashes in `public.refresh_tokens`; rotation consumes the hash atomically. Logout, password changes, password resets, and administrative session revocation set `users.session_revoked_at`, clear auth caches, and remove refresh tokens where applicable.

**Why:** Stateless access tokens otherwise survive logout or credential changes, and the hosted Supabase database also exposes an unrelated `auth.refresh_tokens` table that must never be targeted by public migrations.

**How to apply:** Scope refresh-token schema migrations to `public.refresh_tokens`; never query or mutate `auth.refresh_tokens`.