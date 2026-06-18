---
name: Deferred migrations pattern
description: runDeferredMigrations() was deleted in Launch Baseline v1 consolidation; replaced by runCatalogSeed() (slim catalog seeding only).
---

## Current pattern (post-Launch Baseline v1)

`runDeferredMigrations()` **no longer exists** — it was deleted during the Launch Baseline v1 consolidation sprint.

`runStartupMigrations()` in `server/db.ts` is **DDL-only**: CREATE TABLE, CREATE INDEX, ALTER TABLE ADD COLUMN, triggers, and ON CONFLICT DO NOTHING seed inserts.

`runCatalogSeed()` (exported from `server/db.ts`) handles the only remaining fire-and-forget operation: idempotent catalog data upserts (categories, sub-services, service groups). Called 5 seconds after `httpServer.listen()`.

**Why:** All the DML backfills that used to live in runDeferredMigrations() (refresh token purge, currency normalization, search vector backfill, etc.) have been applied to all target databases and are no longer needed.

**How to apply:**
- DDL changes (new columns, tables, indexes) → `runStartupMigrations()`, each in its own try-catch block
- Catalog data seeding → `runCatalogSeed()`
- One-shot DML backfills → write a standalone script in `script/` and run once manually; do NOT add to either function
- The old "runDeferredMigrations" NOTE comments in db.ts have been removed (Final Legacy Eradication sprint, 2026-06-14)
