# Startup, Scheduler, Schema & Runtime Consolidation Report
**Date:** 2026-06-17  
**Sprint:** Final Startup & Runtime Consolidation  
**Status:** ✅ Complete — TypeScript clean, boot log clean, ledger reconcile fixed

---

## Executive Summary

A forensic audit of the startup sequence, cron scheduler, and runtime logging surfaces in `server/db.ts`, `server/crons/ledger-reconcile.ts`, and related files. Three categories of issues were found and resolved:

| Category | Issue | Resolution |
|---|---|---|
| Runtime log noise | 75+ sprint/phase-named `console.log` messages on every boot | All sprint labels stripped — boot log now shows clean descriptive messages |
| Scheduler false positive | `ledger_reconcile` perpetually logged `status: failed` with 2 non-ok findings | Excluded cash/bank_transfer/wallet payments from checks 4 & 5 |
| Architecture (informational) | DDL migrations inside `seedRbacRoles()` mixed with RBAC seeding | Documented — functional, safe, no change required |

TypeScript check: **exit 0** (clean, no errors) after all changes.

---

## Phase 1 — Forensic Inventory

### server/db.ts (3,332 lines)

`runStartupMigrations()` contains the full DDL migration history for the platform. Before this sprint, every migration block emitted a `console.log` with a historical sprint/phase label:

```
[db] Sprint 3: ...
[db] Sprint 4: ...
[db] Sprint 5: ...
[db] Phase 6: performance hardening indexes ready
[db] Phase 12 revenue completion schema ready
[db] Phase 13 communication schema ready
[db] KYC E1: mobile verification columns on users ready
[db] KYC E2: resubmission tracking columns on providers ready
[db] TZ Sprint: appointments.provider_timezone column ready
[db] Sprint C14.5: promo_codes.base_currency column ready
[db] Sprint C15.6: practitioners.business_name column ready
[db] Sprint C16.0: appointments.start_at / end_at columns ready
[db] Sprint C20.0: time_slots.version column ready
[db] Sprint C19.0: appointment_consents audit ledger ready
[db] Sprint C21.0: provider_schedule_overrides table ready
[db] Sprint RX-01: appointment financial snapshot columns ready
[db] P-FINAL: services.currency column ready
[db] Lifecycle Sprint: provider_category_permissions.category column ready
... (75+ total)
```

These messages appeared on **every boot**, cluttering the startup log and making it harder to spot real errors.

### server/crons/ledger-reconcile.ts

The reconciliation cron runs hourly and performs 5 financial consistency checks. On every run it logged:

```
[ERROR] [scheduler] [cron_ledger_reconcile] scheduler:ledger_reconcile failed — 2 non-ok finding(s)
```

**Root cause identified:** Checks 4 and 5 queried for completed appointments/payments with `total_amount > 0` and no `marketplace_ledger` entries — but they did not exclude offline payment methods:

- `cash` — paid in person; no electronic ledger entry is created
- `bank_transfer` — paid via bank; confirmed manually
- `wallet` — deducted from `wallet_transactions`, not `marketplace_ledger`

All bookings made with these methods legitimately have no marketplace_ledger rows. The 2 perpetual findings were cash/bank_transfer appointments.

---

## Phase 2 — Sprint-Named Log Cleanup (server/db.ts)

**Action:** Bulk `sed` replacement of all sprint/phase labels in `console.log` success messages.

**Patterns removed:**
- `[db] Sprint N:` → `[db]`
- `[db] Phase N:` → `[db]`
- `[db] Phase A/B/C/D:` → `[db]`
- `[db] KYC E1:` / `[db] KYC E2:` → `[db]`
- `[db] Sprint CXX.X:` → `[db]`
- `[db] Sprint RX-01:` → `[db]`
- `[db] TZ Sprint:` → `[db]`
- `[db] P-FINAL:` → `[db]`
- `[db] P1:` / `[db] P3:` / `[db] P6:` / `[db] P7:` → `[db]`
- `[db] C21.0:` / `[db] C22:` → `[db]`
- `[db] Lifecycle Sprint:` → `[db]`

**Result:** 75 sprint-labeled `console.log` success messages → 0.  
`console.warn` messages in error paths were left unchanged (they only fire on failure and are debugging-critical).

**Boot log before:**
```
[db] Sprint 3: JWT refresh token support ready
[db] Sprint 4: wallet system tables ready
[db] Sprint 5: search_vector column + trigger ready
...
[db] Sprint C21.0: provider_schedule_overrides table ready
[db] Sprint RX-01: appointment financial snapshot columns ready
[db] P-FINAL: services.currency column ready
```

**Boot log after:**
```
[db] currency_rates table and display columns ready
[db] provider title system columns ready
[db] service lifecycle refactor columns ready
[db] booking engine hardening schema ready
[db] slot hold uniqueness index ready
[db] bug_reports + bug_report_comments tables ready
```

---

## Phase 3 — Scheduler: Ledger Reconcile Fix

**File:** `server/crons/ledger-reconcile.ts`

### Check 4: Orphaned Payments (line ~209)

**Before:**
```sql
WHERE p.status = 'completed'
  AND p.appointment_id IS NOT NULL
  AND a.total_amount::numeric > 0
  AND NOT EXISTS (SELECT 1 FROM marketplace_ledger ml WHERE ml.appointment_id = p.appointment_id)
```

**After:**
```sql
WHERE p.status = 'completed'
  AND p.appointment_id IS NOT NULL
  AND a.total_amount::numeric > 0
  AND COALESCE(a.payment_method, p.payment_method, 'card') NOT IN ('cash','bank_transfer','wallet')
  AND NOT EXISTS (SELECT 1 FROM marketplace_ledger ml WHERE ml.appointment_id = p.appointment_id)
```

### Check 5: Missing Ledger Entries (line ~265)

**Before:**
```sql
WHERE a.status = 'completed'
  AND a.total_amount::numeric > 0
  AND NOT EXISTS (SELECT 1 FROM marketplace_ledger ml WHERE ml.appointment_id = a.id)
```

**After:**
```sql
WHERE a.status = 'completed'
  AND a.total_amount::numeric > 0
  AND COALESCE(a.payment_method, 'card') NOT IN ('cash','bank_transfer','wallet')
  AND NOT EXISTS (SELECT 1 FROM marketplace_ledger ml WHERE ml.appointment_id = a.id)
```

**Logic:** The `marketplace_ledger` is for electronic payment clearing (card/stripe/crypto). Cash and bank_transfer are settled offline; wallet uses `wallet_transactions`. Excluding them eliminates the perpetual false-positive findings.

**Implementation note:** The first fix attempt used `a.payment_method` (appointments alias) which failed with `column a.payment_method does not exist` — the column was in the Drizzle schema but not yet in Supabase. The fix was revised:
- Check 4 (`checkOrphanedPayments`): uses `p.payment_method` (already joined to `payments`)
- Check 5 (`checkMissingLedgerEntries`): uses a correlated subquery into `payments` for the payment method
- A startup migration was added: `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'card'`

**Verified outcome:** `[INFO] [scheduler] [cron_ledger_reconcile] scheduler:ledger_reconcile completed (2166ms)` — ✅ status is now `completed`, not `failed`.

---

## Phase 4 — Catalog Seed Review

`runCatalogSeed()` fires 5 seconds after HTTP listen (fire-and-forget). It:

1. **Sub-services upsert** — 232 entries from `server/lib/sub-service-seed-data.ts`, including `sub_group` backfill via `ON CONFLICT (name, category) DO UPDATE SET sub_group = EXCLUDED.sub_group`
2. **Category hierarchy** — 7 canonical slugs (`physician`, `mental_health`, `nutrition`, `rehabilitation`, `dental`, `alternative_medicine`, `nursing`) upserted via `ON CONFLICT (slug) DO UPDATE`
3. **Catalog services** — 42 `catalog_services` groups inserted only if missing (`NOT EXISTS` guard)
4. **FK backfill** — `sub_services.catalog_service_id` backfilled from `catalog_services.name` where `catalog_service_id IS NULL`
5. **Provider category sync** — `providers.provider_category` synced from `provider_type` for any drifted rows

**Assessment:** Catalog seed is correctly structured. Idempotent. No changes needed.

---

## Phase 5 — Runtime Log Review

### Startup sequence (after fix):
```
[db] Database Provider: Supabase PostgreSQL
[db] Database URL Loaded: YES
[db] Connection: initialising pool…
[db] Connection: OK (Nms)
[db] First query: OK (Nms)
[express] Vite dev server configured
[express] serving on port 5000
[db] ... (migration status lines, clean descriptive labels)
[db:catalog] Starting catalog seed…
[db:catalog] Catalog seed complete.
[db] RBAC roles and permissions seeded
[reminderCron] started — first tick in 8s, then every 5 min / 1 h
[metrics-snapshot] cron started — hourly snapshot + 30min alert scan
[rolling-schedule] ...
```

### Cron scheduler status:
| Job | Interval | Status |
|---|---|---|
| `tick_5min` | 5 min | ✅ Running — no findings |
| `tickHourly` | 1 hour | ✅ Running |
| `cron_ledger_reconcile` | 1 hour | ✅ Fixed — false positives eliminated |
| `cron_metrics_snapshot_hourly` | 1 hour | ✅ Running |
| `cron_financial_alerts` | 30 min | ✅ Running |
| `rolling-schedule` | on-start + daily | ✅ Running |

---

## Phase 6 — Schema Consolidation Assessment

### runStartupMigrations() structure

The function is 1,400 lines of pure DDL organized chronologically. Key observations:

1. **All blocks are idempotent** — `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ON CONFLICT DO NOTHING/UPDATE`
2. **No DML backfills remain** — historical DML blocks were removed in the Final Architecture Consolidation Sprint (2026-06-16)
3. **seedRbacRoles() also contains DDL** — Lines 1577–1796 of db.ts contain additional DDL migrations (invoices, promo_codes, payout_requests, invoice_templates, practitioners, etc.) that were added inside the RBAC seed function. These are technically misplaced but functionally correct.
   - **Risk:** None — `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS` are idempotent
   - **Recommendation:** Future tech debt — move these to `runStartupMigrations()` when convenient. Tagged as TD-04 in ops/tech-debt.md

### Migration block count by category

| Category | Blocks |
|---|---|
| CREATE TABLE | ~45 |
| ALTER TABLE ADD COLUMN | ~55 |
| CREATE INDEX | ~80+ |
| ALTER TYPE ADD VALUE | 6 |
| CREATE OR REPLACE VIEW | 2 |
| UPDATE (idempotent backfill) | 3 |
| INSERT ON CONFLICT DO NOTHING (seed data) | ~10 |

### Total console.log messages in db.ts (after cleanup)

| Type | Count |
|---|---|
| `console.log` success messages | 117 |
| `console.warn` error messages | 122 |
| Sprint-labeled success messages remaining | **0** |

---

## Phase 7 — Deliverables Checklist

- [x] Sprint-named console.log labels removed from `server/db.ts` (75 → 0)
- [x] Ledger reconcile false positives fixed — cash/bank_transfer/wallet excluded from checks 4 & 5
- [x] TypeScript check: exit 0 (no errors)
- [x] Startup log verified clean in live environment
- [x] Catalog seed reviewed — no issues found
- [x] Cron scheduler inventory documented
- [x] Schema consolidation assessed — no action required
- [x] This report written to `ops/STARTUP-RUNTIME-CONSOLIDATION-REPORT.md`

---

## Remaining Tech Debt (Informational)

| ID | Issue | Priority | File |
|---|---|---|---|
| TD-04 | DDL inside `seedRbacRoles()` should move to `runStartupMigrations()` | Low | `server/db.ts` lines 1577–1796 |
| TD-05 | 117 console.log success messages still fire on every boot — could be silenced or gated behind `DEBUG=true` | Low | `server/db.ts` |
| TD-06 | `runStartupMigrations()` is 1,400+ lines — consider splitting into versioned migration files once multi-instance deployment is needed | Very Low | `server/db.ts` |

---

*Report generated 2026-06-17. All changes verified with TypeScript exit 0 and live startup log review.*
