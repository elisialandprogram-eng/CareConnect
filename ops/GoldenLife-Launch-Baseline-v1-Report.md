# GoldenLife Launch Baseline v1 — Consolidation Report

**Date:** 2026-06-14  
**Goal:** Remove all historical migration debt, legacy compatibility layers, dead code, and orphan APIs. Result: clean, bootable Launch Baseline.

---

## Summary

| Metric | Before | After |
|---|---|---|
| `server/db.ts` | 3,654 lines | 3,338 lines |
| `shared/schema.ts` | ~2,640 lines | 2,596 lines |
| `runDeferredMigrations()` | 475-line function | **Deleted** (replaced by `runCatalogSeed()`) |
| TypeScript errors | 0 | 0 |
| Build | ✅ | ✅ |
| App boot | ✅ | ✅ |

---

## T002 — db.ts Migration Cleanup

### Removed (one-time DML migration blocks)
- **Provider type rename migration** — `doctor→physician`, `physiotherapist→rehabilitation`, `nurse→nursing` data backfill (no longer needed; all rows already migrated)
- **`sub_services.category` backfill** — deprecated category column fix
- **`appointment_number` backfill** — sequential numbering backfill
- **`provider_wallets` backfill** — upsert-every-provider-on-boot
- **Entire `runDeferredMigrations()` function (475 lines)** — contained 12 DML backfill blocks: currency normalization, FTS search vector rebuild, ledger reconciliation, provider lifecycle rename, credential verified sync, and more

### Replaced with
- **`runCatalogSeed()`** — slim, idempotent function containing only catalog seeding (payment providers, commission rules, platform fee rules, exchange rates). Called fire-and-forget 5s after server listen.

### Moved (DDL kept in `runStartupMigrations()`)
- Banking columns DDL block
- `sub_group` column DDL block

---

## T003 — Schema Cleanup (shared/schema.ts)

### Removed table definitions
| Table | Reason |
|---|---|
| `serviceCategories` | Superseded by `categories` table with slug-based taxonomy |
| `contentBlocks` | CMS feature never shipped; no routes, no UI |
| `blogPosts` | Blog feature never shipped; no routes, no UI |
| `medicalPractitioners` | Replaced by `practitioners` table (provider setup flow) |

### Removed insert schemas
- `insertServiceCategorySchema`
- `insertContentBlockSchema`
- `insertBlogPostSchema`
- `insertMedicalPractitionerSchema`

### Removed type exports
- `ServiceCategory`, `InsertServiceCategory`
- `ContentBlock`, `InsertContentBlock`
- `BlogPost`, `InsertBlogPost`
- `MedicalPractitioner`, `InsertMedicalPractitioner`

---

## T004 — Server-side Dead Code Removal

### storage/group-sessions.mixin.ts
Removed orphan method groups that referenced deleted tables:
- `ContentBlock` CRUD (6 methods): `createContentBlock`, `getContentBlock`, `getContentBlockByKey`, `getAllContentBlocks`, `updateContentBlock`, `deleteContentBlock`
- `BlogPost` CRUD (6 methods): `createBlogPost`, `getBlogPost`, `getBlogPostBySlug`, `getAllBlogPosts`, `updateBlogPost`, `deleteBlogPost`
- `ServiceCategory` CRUD (5 methods): `createServiceCategory`, `getServiceCategory`, `getAllServiceCategories`, `updateServiceCategory`, `deleteServiceCategory`
- `MedicalPractitioner` CRUD (2 methods): `createMedicalPractitioner`, `getMedicalPractitionersByProvider`

### storage/database-storage.ts (IStorage interface)
Removed interface declarations matching the deleted implementations above:
- `ContentBlock` section (6 method signatures)
- `BlogPost` section (6 method signatures)
- `ServiceCategory` section (5 method signatures)
- `MedicalPractitioner` section (2 method signatures)

### storage/financial.storage.ts, users.storage.ts
Removed stale method-name exclusion keys for all 19 deleted methods.

---

## T005 — Frontend Dead Code Removal

### client/src/pages/providers.tsx
Removed legacy provider type fallthrough cases from `getPageTitle()` and `getPageDescription()`:
- `case "doctor"` → was fallthrough to `"physician"`
- `case "physiotherapist"` → was fallthrough to `"rehabilitation"`
- `case "nurse"` → was fallthrough to `"nursing"`

### client/src/pages/provider-profile.tsx
Removed same legacy fallthrough cases from `getTypeLabel()`:
- `case "doctor"`, `case "physiotherapist"`, `case "nurse"`

---

## T006 — Build & TypeScript Validation

```
npx tsc --noEmit --skipLibCheck   → 0 errors
npm run build                      → ✅ frontend + server both compile
App boot                           → ✅ all migrations run, cron starts, API responds
```

---

## What Was Deliberately Kept

- `contentTypeEnum` PG enum in schema.ts — the enum exists in the production DB; removing it from Drizzle schema without a `DROP TYPE` migration would cause issues on Supabase. Kept as a harmless orphan enum until a DB-coordinated cleanup.
- DEV-only auth endpoints in `auth.routes.ts` — already guarded by `process.env.NODE_ENV !== "production"`. Safe as-is.
- All 25+ DDL blocks in `runStartupMigrations()` — these are idempotent and required for fresh installs and Supabase compatibility. They are not migration debt.

---

## Architecture State Post-Cleanup

- **Boot path:** `runStartupMigrations()` (DDL, fire-and-forget) → server listen → `runCatalogSeed()` (catalog data, 5s delay)
- **Provider types:** 7 canonical values (`physician`, `mental_health`, `nutrition`, `rehabilitation`, `dental`, `alternative_medicine`, `nursing`) — no legacy aliases in code
- **Service taxonomy:** `categories` table with slug-based matching — `serviceCategories` table gone
- **No orphan API routes** referencing deleted tables
- **No orphan storage methods** referencing deleted tables
- **No orphan type imports** anywhere in the codebase
