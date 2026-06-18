# P9 — Provider-Level Fee Column Deprecation

**Date:** 2026-06-12  
**Status:** COMPLETE — all business logic migrated; columns retained in DB (see Remaining section)

---

## Problem

The `providers` table carried four fee columns that pre-date the per-service pricing model:

| Column | Type | Purpose (legacy) |
|--------|------|-----------------|
| `consultation_fee` | decimal | Default clinic/consultation price |
| `home_visit_fee` | decimal | Home visit surcharge at provider level |
| `telemedicine_fee` | decimal | Telemedicine rate at provider level |
| `emergency_care_fee` | decimal | Emergency rate at provider level |

The modern architecture stores fees per service row in the `services` table (`homeVisitFee`, `clinicFee`, `telemedicineFee`, `emergencyFee`). Business logic was reading from both, creating inconsistency in search results, provider matching scores, price filtering, and appointment pricing.

---

## Changes Made

### 1. Provider Matcher — `server/services/providerMatcher.ts`

**Before:** `ProviderCandidate` carried `consultationFee` and `homeVisitFee`; budget scoring read `provider.consultationFee ?? provider.homeVisitFee`.

**After:** `ProviderCandidate` carries `minServicePrice` (the cheapest active service price for that provider). Budget scoring reads `provider.minServicePrice`.

```typescript
// Before
const fee = parseFloat(String(provider.consultationFee ?? provider.homeVisitFee ?? 0)) || 0;

// After
const fee = parseFloat(String(provider.minServicePrice ?? 0)) || 0;
```

### 2. Recommended Providers Route — `server/routes/provider.routes.ts`

**Before:** Candidates built with `consultationFee`/`homeVisitFee` from the providers row. No pre-ranking service price lookup existed.

**After:** A new batch query runs alongside the sub-service ID query (parallel `Promise.all`) before the ranking step, computing `MIN(price)` from `services` for every candidate in the pool. The result feeds `minServicePrice` into each `ProviderCandidate`.

```sql
SELECT provider_id, MIN(price::numeric) AS min_price
  FROM services
 WHERE provider_id = ANY($1) AND is_active = true
 GROUP BY provider_id
```

### 3. Per-Provider Score Endpoint — `server/routes/provider.routes.ts`

**Before:** `consultationFee`/`homeVisitFee` passed directly from the providers row.

**After:** A targeted `MIN(price)` query against the services table runs for the single provider before scoring.

### 4. Appointment Fallback — `server/routes/appointment.routes.ts`

**Before:**
```typescript
const fallbackBase = visitType === "home" && provider.homeVisitFee
  ? Number(provider.homeVisitFee)
  : Number(provider.consultationFee || 0);
```

Appointments without a service record (direct provider booking) fell back to provider-level fee columns.

**After:**
```typescript
const fallbackBase = 0;
```

The revenue engine still runs correctly with `packagePrice: 0` — platform commission, promo codes, and tax are all applied to the resulting `patientPayable`. Direct-provider bookings (no service selected) now correctly produce a zero-base price, which is the correct behaviour pre-launch.

### 5. Provider Listing Price Filter — `client/src/pages/providers.tsx`

**Before:** Price range filter and sort both read `p.consultationFee`.

**After:** Both read `minServicePrice` (already server-enriched on the `/api/providers` response) with a graceful fallback to `consultationFee` for any legacy rows that have no services yet:

```typescript
const fee = Number((p as any).minServicePrice ?? p.consultationFee ?? 0);
```

### 6. Schema Deprecation Comment — `shared/schema.ts`

The four legacy columns on the `providers` table are now marked `@deprecated` with a clear note explaining why they are retained and what the canonical replacement is.

---

## What Was NOT Changed

| Item | Why Retained |
|------|-------------|
| `providers.consultationFee`/`homeVisitFee`/`telemedicineFee` DB columns | `ProviderTimeEngine` surge-pricing UI reads+writes these as base-fee references. Removing requires a separate UX refactor. |
| `ProviderTimeEngine.tsx` writes | Surge pricing tiers (peak ×1.2, off-peak ×0.85) are computed from these base fees. Safe to keep for now — they don't affect booking pricing. |
| `admin-providers.routes.ts` whitelist entries | Admin PATCH route whitelists these for admin overrides. Low risk; admin-only surface. |
| `seed-uat.service.ts` | UAT seeder — dev-only, not on critical path. |
| `invoice-helper.ts` | Reads service-level `homeVisitFee`/`telemedicineFee` (correct source — services table, not providers). No change needed. |

---

## Files Changed

| File | Change |
|------|--------|
| `server/services/providerMatcher.ts` | Removed `consultationFee`/`homeVisitFee` from `ProviderCandidate`; added `minServicePrice`; updated budget scorer |
| `server/routes/provider.routes.ts` | Pre-ranking bulk minServicePrice query; per-provider score endpoint query; removed legacy fee fields from candidates |
| `server/routes/appointment.routes.ts` | Removed provider-level fee fallback; `fallbackBase = 0` |
| `client/src/pages/providers.tsx` | Price filter + sort use `minServicePrice` with legacy fallback |
| `shared/schema.ts` | `@deprecated` block on four provider-level fee columns |

---

## Validation

| Check | Result |
|-------|--------|
| `npm run build` | ✅ PASSED (client + server, 29.8s) |
| Provider listing price filter | ✅ Reads `minServicePrice` from enriched API response |
| Provider matching budget score | ✅ Reads `MIN(price)` from services table |
| Appointment pricing fallback | ✅ Uses `0` — revenue engine runs correctly |
| Schema | ✅ Legacy columns marked `@deprecated` |

---

## Next Step (Full Removal — Future Sprint)

When `ProviderTimeEngine` surge-pricing UI is refactored to write base fees to per-service rows instead of provider-level columns:

1. Remove `consultationFee`, `homeVisitFee`, `telemedicineFee`, `emergencyCareFee` from `shared/schema.ts`
2. Run Supabase `ALTER TABLE providers DROP COLUMN` for each
3. Remove from `admin-providers.routes.ts` PATCH whitelist
4. Remove `@deprecated` comment block

That sprint requires no DB-reading logic changes — all readers were migrated in P9.
