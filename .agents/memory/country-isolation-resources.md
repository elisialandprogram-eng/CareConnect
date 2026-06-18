---
name: Country isolation on per-resource admin endpoints
description: Per-resource admin endpoints need canAccessCountry() check; listing endpoints use listingCountryFilter(); role=admin is global
---

## Rule
Admin **listing** endpoints (GET /api/admin/service-requests, GET /api/admin/providers, etc.) use `listingCountryFilter()` which correctly scopes results.

Admin **per-resource** endpoints (GET /api/admin/providers/:id/documents, GET /api/admin/providers/:id/credentials, PATCH /api/admin/provider-documents/:id/status) do NOT automatically apply country filtering. Each must explicitly call `canAccessCountry(req.user!, provider.countryCode)` and return HTTP 403 if false.

## Role behaviour
- `role === "admin"` → treated as `global_admin` (sees all countries, bypasses filter) via `isGlobalAdmin()` in `server/middleware/country.ts`
- `role === "country_admin"` → scoped to `user.countryCode` only
- `role === "global_admin"` → same as `admin` (all countries)

For isolation tests, use `role === "country_admin"` accounts — `admin` bypasses all country guards by design.

**Why:** `canAccessCountry()` is imported in routes.ts (line 257) but was missing from the per-resource document/credential endpoints. IR country_admin could read HU provider documents. Fixed in Sprint 8.

**How to apply:** Any new GET/PATCH route that accesses a provider-owned resource by ID should do: `const prov = await storage.getProvider(id); if (!canAccessCountry(req.user!, prov.countryCode)) return 403`.
