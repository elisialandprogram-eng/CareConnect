# GOLDENLIFE FINAL CATALOGUE NORMALIZATION SPRINT — REPORT

**Date:** 2026-06-15  
**Status:** ✅ COMPLETE

---

## Legacy Values Found

| Type | Value | Location |
|------|-------|----------|
| Legacy PG enum slugs (DB-only, not in TS) | `doctor`, `physiotherapist`, `nurse` | Historical DB enum values — never referenced in app code |
| Legacy category slugs | `medical-doctors`, `mental-health`, `physical-therapy`, `alternative-holistic`, `maternal-nursing` | `runCatalogSeed()` oldToNew dedup block |
| Legacy dual-lookup comment & logic | `provider_category_name` fallback | `catalog.routes.ts`, `group-sessions.mixin.ts` |
| Legacy seed script | `scripts/seed-healthcare-services.ts` | Standalone file using `doctor`/`physiotherapist`/`nurse` |
| Legacy seed UPDATE | `provider_category_name = $1` | `script/reset-and-seed.ts` |
| Legacy comment | `categorySlug: stored in sub_services.provider_category_name` | `script/reset-and-seed.ts` |
| Legacy normalizer field | `providerCategoryName: row.provider_category_name` | `normalizeSubServiceRow` in mixin |
| Legacy filter comment | `cover both category and provider_category_name columns` | `add-service-catalogue-dialog.tsx` |
| Legacy frontend filter | `s.provider_category_name || s.providerCategoryName` fallback | `add-service-catalogue-dialog.tsx` |

---

## Legacy Values Normalized

All 7 canonical category slugs are now the **sole** authority throughout the platform:

| Slug | Display Name |
|------|-------------|
| `physician` | Medical Doctors & Specialists |
| `mental_health` | Mental Health & Behavioral Professionals |
| `nutrition` | Nutrition, Dietetics & Metabolic Wellness |
| `rehabilitation` | Physical Therapy & Rehabilitation |
| `dental` | Dental Care Professionals |
| `alternative_medicine` | Alternative, Holistic & Integrative Medicine |
| `nursing` | Maternal, Nursing & Allied Health Support |

---

## Catalogue Records Corrected

Database is reset and clean — all `sub_services.category` values use canonical slugs only. No records required correction.

---

## Service Hierarchy Corrections

- `catalog_service_id` FK backfill logic in `runCatalogSeed()` verified correct (0 orphaned rows)
- All 7 categories resolve correctly via `/api/browse/services` with proper subcategory grouping

---

## Sub-Service Corrections

| Category | Sub-service count |
|----------|-------------------|
| physician | 105 |
| mental_health | 42 |
| nutrition | 29 |
| rehabilitation | 31 |
| dental | 23 |
| alternative_medicine | 20 |
| nursing | 28 |
| **Total** | **278** |

All sub-services resolve to exactly one canonical category. Zero cross-category leakage.

---

## Legacy Logic Removed

### `server/db.ts` — `runCatalogSeed()`
- Removed entire `oldToNew` deduplication block (45 lines) that mapped legacy slugs (`medical-doctors` → `physician`, `mental-health` → `mental_health`, `physical-therapy` → `rehabilitation`, `alternative-holistic` → `alternative_medicine`, `maternal-nursing` → `nursing`) to canonical slugs. Since the database is reset, these old slugs never exist and the block was pure dead code.

### `server/routes/catalog.routes.ts`
- `/api/browse/services`: Removed `provider_category_name` fallback filter (`pcn === c.slug` check). Simplified to single `s.category === c.slug` comparison.
- `/api/sub-services` (providerCategory branch): Removed dual-lookup `(provider_category_name = $1::text OR category::text = $1::text)`. Now uses clean `category::text = $1::text` only.
- `PATCH /api/sub-services/:id`: Removed raw SQL `providerCategoryName` field handling (extra `pool.query` update + legacy response field).

### `server/storage/group-sessions.mixin.ts`
- `getAllSubServices()`: Removed `SELECT *, provider_category_name` — now `SELECT *` only.
- `getSubServicesByCategory()`: Removed dual-lookup, uses `category::text = $1::text` only.
- `getSubServicesByProviderCategory()`: Removed dual-lookup, uses `category::text = $1::text` only.
- `normalizeSubServiceRow()`: Removed `providerCategoryName: row.provider_category_name` mapping.

### `client/src/components/add-service-catalogue-dialog.tsx`
- Removed `s.provider_category_name || s.providerCategoryName` fallback in client-side category filter. Now uses `s.category !== myCategory` directly.
- Updated stale comment referencing dual-lookup logic.

### `script/reset-and-seed.ts`
- Removed `UPDATE sub_services SET provider_category_name = $1` block.
- Removed stale comment about `provider_category_name` being the filter column.

---

## Dead Code Removed

| Item | File |
|------|------|
| `oldToNew` dedup map + loop (45 lines) | `server/db.ts` |
| `provider_category_name` raw SQL fallback in browse filter | `server/routes/catalog.routes.ts` |
| `provider_category_name` dual-lookup in sub-services filter | `server/routes/catalog.routes.ts` |
| `providerCategoryName` raw SQL PATCH handler | `server/routes/catalog.routes.ts` |
| `provider_category_name` in `SELECT *` override | `server/storage/group-sessions.mixin.ts` |
| `normalizeSubServiceRow.providerCategoryName` mapper | `server/storage/group-sessions.mixin.ts` |
| Frontend `provider_category_name` fallback | `client/src/components/add-service-catalogue-dialog.tsx` |

---

## Orphan Files Removed

| File | Reason |
|------|--------|
| `scripts/seed-healthcare-services.ts` (526 lines) | Used legacy `doctor`/`physiotherapist`/`nurse` types. Never imported by the server. Superseded by `server/lib/sub-service-seed-data.ts` + `runCatalogSeed()`. |

---

## Orphan APIs Removed

None — all existing routes are needed.

---

## Orphan Routes Removed

None — all routes have active consumers.

---

## Additional Defects Found & Fixed

None discovered during audit.

---

## Build Validation

```
✓ npm run build — clean (0 errors, 0 warnings related to catalogue changes)
✓ Server bundle: dist/index.cjs (2.7 MB)
✓ Client bundle: built in 32.18s
```

---

## TypeScript Validation

```
✓ npx tsc --noEmit --skipLibCheck — 0 errors
```

---

## Database Integrity Validation

Live API checks:

```
GET /api/categories          → 7 rows, all canonical slugs
GET /api/sub-services?providerCategory=physician    → 105 rows, category: ['physician'] only
GET /api/sub-services?category=rehabilitation       → 31 rows,  category: ['rehabilitation'] only
GET /api/browse/services     → 7 categories, 278 total sub-services, no orphans
```

---

## Final Taxonomy Validation

✓ `physician` — 105 sub-services  
✓ `mental_health` — 42 sub-services  
✓ `nutrition` — 29 sub-services  
✓ `rehabilitation` — 31 sub-services  
✓ `dental` — 23 sub-services  
✓ `alternative_medicine` — 20 sub-services  
✓ `nursing` — 28 sub-services  

---

## Final Catalogue Validation

✓ Every sub-service belongs to exactly one category  
✓ Every category has sub-services  
✓ No cross-category leakage on any endpoint  
✓ `providerCategory` and `category` query params both route through single canonical lookup  
✓ No `provider_category_name` fallback remains in any API path  
✓ No legacy slug (doctor/physiotherapist/nurse/medical-doctors/etc.) referenced in server code  
✓ Onboarding category derivation (`CATEGORY_NAME_TO_SLUG`) maps display names → canonical slugs only  

---

## Remaining Risks

None. The platform is operating entirely on the final launch-ready taxonomy.

