# Final Architecture Consolidation & Migration Elimination Sprint
**Completed:** 2026-06-17  
**File modified:** `server/db.ts` (3,340 → 3,315 lines, −25 lines)

---

## Objective

Remove all historical migration, repair, and backfill logic from `server/db.ts`, leaving only:
- **Runtime Schema Guards** — `CREATE TABLE / INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`
- **Catalog Seeds** — idempotent `ON CONFLICT DO NOTHING / DO UPDATE` upserts
- **Bootstrap Seeds** — reference data seeds (payment providers, legal doc registry, wallet rules, etc.)

---

## Changes Made

### 1. Removed — `UPDATE tax_settings` year backfill (was line 367)

```sql
-- REMOVED:
UPDATE tax_settings SET year = EXTRACT(YEAR FROM NOW())::INTEGER WHERE year IS NULL
```

**Why removed:** The `ADD COLUMN IF NOT EXISTS` with `DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER` directly above it already handles all new rows. Running this UPDATE on every boot is pure repair logic with no ongoing benefit.

---

### 2. Removed — `UPDATE gift_cards` initial_amount backfill (was line 1473)

```sql
-- REMOVED:
UPDATE gift_cards SET initial_amount = balance WHERE initial_amount = 0 AND balance > 0
```

**Why removed:** One-time backfill to populate `initial_amount` for pre-existing gift card rows from before the P12 revenue sprint. All gift cards created since set `initial_amount` at creation time.

---

### 3. Removed — `UPDATE provider_office_hours` provider_id backfill (was lines 1645–1651)

```sql
-- REMOVED:
UPDATE provider_office_hours oh
SET provider_id = p.id
FROM providers p
WHERE p.user_id = oh.provider_user_id
  AND oh.provider_id IS NULL
```

**Why removed:** One-time normalisation backfill from Sprint C15.1 to populate the new `provider_id` FK column from the legacy `provider_user_id` column. The `ADD COLUMN IF NOT EXISTS` above it (kept) is the schema guard. All new rows write `provider_id` at creation time.

---

### 4. Removed — `UPDATE platform_fee_rules` min/max NULL repair (was lines 2462–2472)

```sql
-- REMOVED entire try-catch block:
UPDATE platform_fee_rules SET min_fee = NULL WHERE min_fee = 0;
UPDATE platform_fee_rules SET max_fee = NULL WHERE max_fee = 0;
```

**Why removed:** Tagged "Repair:" in its own comment. Zero values were silently seeded by an earlier schema default. Rules are now admin-managed; incorrect zeros corrected long ago via admin UI.

---

## Items Already Consolidated in Prior Sprints

| Description | Marker | Sprint |
|-------------|--------|--------|
| TZ backfill (`start_at`/`end_at`/`provider_timezone`) | `[CONSOLIDATED]` comment at line ~1676 | TZ Hardening |
| `services.currency` DML backfill | `[CONSOLIDATED]` comment at line ~3133 | P-FINAL |
| 75 sprint-named `console.log` labels | Bulk removal | Startup-Runtime Consolidation (2026-06-17) |

---

## What Was Kept (and Why)

### Schema Guards (all retained)
All `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` and `CREATE TABLE / INDEX IF NOT EXISTS` blocks remain. These are idempotent DDL required on every boot to ensure Supabase stays in sync with the application schema. The project does not use `drizzle-kit push` against Supabase — see `replit.md` Gotchas.

### Reference Data Seeds (all retained)
| Seed | Pattern |
|------|---------|
| `payment_providers` (9 gateways) | `ON CONFLICT (provider_key) DO NOTHING` |
| `payment_method_rules` (9 methods) | `ON CONFLICT (payment_method) DO NOTHING` |
| `wallet_rules` (5 credit types) | `ON CONFLICT (credit_type) DO NOTHING` |
| `legal_documents` (23 types) | `ON CONFLICT (slug) DO NOTHING` |

All use the correct idempotent insert pattern — zero writes on re-run when data is present.

### `runCatalogSeed()` (fire-and-forget, called after listen)
- **Sub-service seed** — `ON CONFLICT (name, category) DO UPDATE SET sub_group` — catalog upsert, kept
- **Category + group hierarchy** — `ON CONFLICT (slug) DO UPDATE` — catalog upsert, kept
- **Sub-service FK backfill** — `UPDATE sub_services SET catalog_service_id WHERE catalog_service_id IS NULL` — ongoing FK maintenance for newly-seeded rows (not a historical backfill), kept
- **Provider category sync** — `UPDATE providers SET provider_category = CASE provider_type ... WHERE IS DISTINCT FROM` — system's single source of truth sync for the redundant display-name field (see memory: `provider-category-drift.md`), kept

---

## Verification

- `server/db.ts` reduced from 3,340 to 3,315 lines (−25 lines)
- Server restarted cleanly: connection OK, port 5000 serving, no errors in startup log
- No TypeScript errors introduced (all edits were SQL string / comment removals only)

---

## Architecture State Post-Sprint

`runStartupMigrations()` now contains only:

1. Enum value guards (`ADD VALUE IF NOT EXISTS`)
2. Table creation guards (`CREATE TABLE IF NOT EXISTS`)
3. Column addition guards (`ADD COLUMN IF NOT EXISTS`)
4. Index creation guards (`CREATE INDEX IF NOT EXISTS`)
5. Reference data seeds (idempotent, `ON CONFLICT DO NOTHING`)

`runCatalogSeed()` contains only:

1. Catalog upserts (`ON CONFLICT DO UPDATE`)
2. Ongoing FK maintenance (WHERE NULL guard)
3. Provider category display-name sync (IS DISTINCT FROM guard, needed on every boot)
