# Final Legacy Eradication & Dead Code Elimination — Sprint Report

**Date:** 2026-06-14  
**Sprint:** Final Legacy Eradication & Dead Code Elimination  
**Status:** COMPLETED ✅

---

## Forensic Scan Summary

A full forensic audit was performed across `server/`, `client/src/`, and `shared/` to identify:
- Dead/unreachable component files
- Deprecated API routes with no active callers
- Stale code comments pointing to deleted infrastructure
- Compatibility shims with no importers
- Dead page files superseded by inline components

---

## Changes Made

### 1. Dead Files Deleted (7 files)

| File | Reason |
|------|--------|
| `server/lib/validateEnv.ts` | Backward-compat shim re-exporting `server/config/env.ts`; zero imports anywhere in the codebase |
| `client/src/components/admin/dashboard/DatabaseResetTool.tsx` | 0 references anywhere in the codebase |
| `client/src/components/admin/dashboard/tax-management.tsx` | 0 references anywhere in the codebase |
| `client/src/components/provider-verification-tracker.tsx` | 0 references anywhere in the codebase |
| `client/src/components/provider/AvailabilityTemplate.tsx` | 0 references anywhere in the codebase |
| `client/src/components/settings/MfaSetupPanel.tsx` | 0 references anywhere in the codebase |
| `client/src/pages/provider-setup.tsx` | `/provider/setup` route now handled by `SetupRedirect` inline in `App.tsx`; page file unreferenced |

### 2. Deprecated API Routes Removed (2 routes)

| Route | File | Reason |
|-------|------|--------|
| `GET /api/chat/conversations` | `server/routes/communication.routes.ts` | Marked deprecated; frontend exclusively uses `/api/chat/conversations-rich`; no callers found |
| `PATCH /api/appointments/:id/cancel` | `server/routes/appointment.routes.ts` | Deprecated alias forwarding to `/api/appointments/:id/action`; frontend uses the action endpoint directly; no callers found |

### 3. Stale Comments Cleaned (db.ts)

Removed 5 comment blocks in `server/db.ts` pointing to `runDeferredMigrations()` — a function that was deleted in the Launch Baseline v1 consolidation sprint. These were misleading dead-end references:
- `// NOTE: Purge of legacy plaintext-only rows moved to runDeferredMigrations()`
- `// NOTE: Currency normalization UPDATEs moved to runDeferredMigrations()`
- `// Step 4 — search_vector backfill moved to runDeferredMigrations()`
- The 7-line "Deferred DML operations → see runDeferredMigrations()" block comment
- `// NOTE: provider_credentials.verified backfill moved to runDeferredMigrations()`

### 4. File Header / Comment Hygiene

| File | Change |
|------|--------|
| `server/routes/communication.routes.ts` | Header comment updated: "legacy + rich" → "rich" (legacy endpoint removed) |
| `server/routes/appointment.routes.ts` | Header route list: removed `PATCH /api/appointments/:id/cancel` entry |
| `shared/schema.ts` | `service_category` column comment updated from old `"physiotherapist"` example to canonical `"physician", "rehabilitation"` |

---

## What Was Kept (Deliberate)

| Item | Reason |
|------|--------|
| Legacy status aliases in `server/lib/provider-visibility.ts` (`"active"` → approved, `"pending_approval"` → submitted, etc.) | Defensive reads against legacy DB values; DB rows may still carry old status strings |
| `["approved","active"]` checks in `server/routes/provider.routes.ts` (8 sites) | Same reason — backward-compatible DB reads |
| `@deprecated` JSDoc on `providers.consultationFee` in `shared/schema.ts` | Column still actively used in multiple frontend components and seed scripts; removal is a separate migration task |
| `ProfileSection` type with `@deprecated` JSDoc in `ProviderProfileTab.tsx` | Still imported and used in `provider-dashboard.tsx` (11 references) |
| Standalone admin pages (`admin-stale-bookings`, `admin-home`, `admin-users`, `admin-bug-reports`) | All are active routes registered in `App.tsx` |
| Admin sub-route files (`admin-monitoring.routes.ts`, `community.routes.ts`, etc.) | All registered in `routes.ts`; active endpoints |

---

## Build Verification

- Application restarts cleanly: ✅
- No TypeScript import errors from deletions: ✅  
- No stale imports found after deletion: ✅
- Server reaches port 5000 and serves requests: ✅
