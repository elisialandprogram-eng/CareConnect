# Provider Category Authority Consolidation — Sprint Report
**Date:** 2026-06-14  
**Status:** ✅ Complete

## Objective
Remove all legacy provider-type architecture (doctor, physiotherapist, nurse, psychologist, psychiatrist, caregiver, dietitian, dentist, holistic_practitioner, speech_therapist, occupational_therapist, clinic, diagnostic_center) and make the 7 canonical categories the sole authority everywhere in TypeScript code.

## 7 Canonical Categories (unchanged)
| Enum value | Display name |
|---|---|
| `physician` | Medical Doctors & Specialists |
| `mental_health` | Mental Health & Behavioral Professionals |
| `nutrition` | Nutrition, Dietetics & Metabolic Wellness |
| `rehabilitation` | Physical Therapy & Rehabilitation |
| `dental` | Dental Care Professionals |
| `alternative_medicine` | Alternative, Holistic & Integrative Medicine |
| `nursing` | Maternal, Nursing & Allied Health Support |

## Changes Made

### Schema (`shared/schema.ts`)
- Removed all 13 legacy values from `providerTypeEnum` array; only 7 canonical remain.
- Note: legacy values still exist in the PostgreSQL enum (DROP VALUE unsupported) but are no longer referenceable in TypeScript.

### Database migrations (`server/db.ts`)
- Startup migration loop now only adds the 7 canonical values to `provider_type` enum.
- Removed legacy specialist values (`psychologist`, `psychiatrist`, `caregiver`, `dietitian`, etc.) from the ADD VALUE loop.

### Provider routes (`server/routes/provider.routes.ts`)
- Removed the 22-entry `PROVIDER_TYPE_TO_CATEGORY` mapping (canonical + legacy aliases).
- Replaced with a clean `CANONICAL_CATEGORY_SLUGS` Set.
- `/api/provider/my-categories` now directly matches `providerType` against canonical slugs.

### Group sessions mixin (`server/storage/group-sessions.mixin.ts`)
- Removed `physiotherapist`, `doctor`, `nurse` from `PROTECTED_TYPES` array.

### Add service catalogue dialog (`client/src/components/add-service-catalogue-dialog.tsx`)
- Removed `LEGACY_TYPE_TO_CANONICAL` mapping (12 legacy → canonical mappings).
- `resolveCanonicalCategory()` now only returns canonical values; returns `null` for unknown types.

### Services page (`client/src/pages/services.tsx`)
- Removed legacy fallback entries (`physiotherapist`, `doctor`, `nurse`) from `CATEGORY_ICON` and `CATEGORY_COLOR`.

### Service catalog hierarchy (`client/src/components/service-catalog-hierarchy.tsx`)
- Replaced substring-based `getCategoryIcon()` / `getCategoryColor()` with switch-based exact slug matching on 7 canonical values.

### Provider operations console (`client/src/components/admin/provider-operations-console.tsx`)
- Removed legacy type checks (`doctor`, `nurse`, `physiotherapist`) from `typeIcon()`.

### Analytics tracker (`server/services/analyticsTracker.ts`)
- Updated inline comment from `"physiotherapist"` example to `"rehabilitation"`.

### Ticket automation (`server/services/ticketAutomation.ts`)
- Removed `"doctor"`, `"physiotherapist"`, `"nurse"` from provider-issue keyword list.

### About page (`client/src/pages/about.tsx`)
- Updated marketing copy to use the 7 official category names.

### Scripts
- `script/reset-and-seed.ts`: Updated all category slugs (`medical-doctors→physician`, `mental-health→mental_health`, `physical-therapy→rehabilitation`, `alternative-holistic→alternative_medicine`, `maternal-nursing→nursing`) and all `providerType` values (doctor→physician, psychiatrist/psychologist→mental_health, dietitian→nutrition, physiotherapist→rehabilitation, dentist→dental, holistic_practitioner→alternative_medicine, nurse→nursing). Removed Step 0 legacy enum extension block.
- `script/bootstrap-supabase.ts`: Updated `provider_type` enum array to 7 canonical values only.
- `script/seed-admin.ts`: Updated seed provider type from `physiotherapist` → `rehabilitation`.
- `script/seed-sub-services.ts`: Updated category `as const` values to canonical.
- `server/services/seed-uat.service.ts`: Updated file header comment.

## Verification
- `npx tsc --noEmit --skipLibCheck` → exit 0 (no type errors)  
- App running on port 5000; `/services` page shows "7 categories · 239 services" ✅  
- No browser console errors ✅  
- Vite HMR reloaded all changed frontend files successfully ✅

## Architecture invariant after this sprint
> **The `providerTypeEnum` values `physician | mental_health | nutrition | rehabilitation | dental | alternative_medicine | nursing` are the ONLY valid provider categories in TypeScript.** Any code that references legacy values (doctor, physiotherapist, nurse, etc.) is a bug.
