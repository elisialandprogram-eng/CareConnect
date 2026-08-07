---
name: Security hardening patterns
description: Audit findings and their resolutions — patterns to follow for future admin/RBAC/country-isolation work
---

## Consent spoofing
POST /api/consents used `userId: req.body.userId || req.user?.id` — an authenticated user could record consent for any other userId.
**Fix:** When authenticated, always use `req.user.id` and 403 if body.userId differs.
**How to apply:** Any route that accepts a userId from the body while also reading from `req.user` must gate with this check.

## Financial overview SQL injection
GET /api/admin/financial/providers-overview interpolated `req.query.countryCode` directly into SQL string via template literal with only a manual `replace(/'/g, "''")` sanitizer.
**Fix:** Use `listingCountryFilter()` (which already enforces admin country scope) to get the effective country, pass it as a `$1` parameter.
**How to apply:** All raw pool.query() calls that accept user-supplied filter values must use `$N` parameters, never string interpolation.

## Admin country scope bypass
`/api/admin/financial/providers-overview` trusted `?countryCode=` query param unconditionally, so a country admin could query another country's financial data.
**Fix:** Route the query param through `listingCountryFilter(req.user!, { country: requestedCountry })` which enforces that country admins can only see their own country.
**How to apply:** All admin listing routes that accept a country query param must go through `listingCountryFilter`.

## Packages N+1
GET /api/admin/packages did `Promise.all(pkgs.map(p => storage.getPackagePurchaseCount(p.id)))` — one SELECT per package.
**Fix:** Added `getPackagePurchaseCounts(packageIds[])` that does a single GROUP BY query; returns `Map<string, number>`.
**How to apply:** Whenever you need aggregate counts for a list of IDs, add a batch method to storage with an `inArray` + `groupBy`, not per-item calls.

## Missing requireAdmin on catalog/settings routes
Sub-services, categories, catalog-services, platform settings, and provider stats routes used inline `if (!isAdminRole(...)) return 403` checks instead of the `requireAdmin` middleware.
**Fix:** Replaced all inline checks with the `requireAdmin` (and where appropriate `requirePermission()`) middleware chains.
**How to apply:** Never use inline `isAdminRole` checks on admin routes — always use `requireAdmin` middleware so RBAC is enforced consistently.

## Missing audit logs on sensitive admin actions
Provider update, user suspend/unsuspend, wallet adjust, gallery upload, credential upload, credential verify, and bulk invoice generation had no audit trail.
**Fix:** Added fire-and-forget `pool.query(INSERT INTO audit_logs ...)` after each sensitive action.
**How to apply:** Every admin write action that modifies a user/provider/document/payment must emit an audit_log row. Use `.catch(() => {})` so a logging failure never blocks the response.

## Consent guard on booking
POST /api/appointments had no server-side check that the patient had accepted terms/privacy.
**Fix:** After email-verified check, query `storage.getPatientConsents(userId)` and 403 if "terms" or "privacy" are missing.
**How to apply:** Server must not trust that consent was recorded at registration — always re-validate at booking time.
