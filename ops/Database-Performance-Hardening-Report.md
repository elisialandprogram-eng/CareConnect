# Database Performance Hardening Sprint — Final Report

**Date:** 2026-06-11  
**Status:** ✅ Complete

---

## Executive Summary

The sprint hardened GoldenLife's database boot sequence, query performance, and
observability. The primary goal was to eliminate the ~20 sequential queries
(including full-table scans) that ran synchronously during cold-start, ensuring
the HTTP server reaches a ready state faster and with lower resource pressure.

---

## Phase 1 — Startup Migration Refactoring

### Problem
`runStartupMigrations()` (~2 700 lines) contained a mix of pure DDL and data
mutation operations. The data mutations (backfills, reconciliation UPDATEs) ran
synchronously on every boot — even when they were guaranteed no-ops on a healthy
production database — causing unnecessary cold-start latency.

### Solution: `runDeferredMigrations()`
A new exported function `runDeferredMigrations()` was created in `server/db.ts`
and called **fire-and-forget** (5-second delayed setTimeout) after
`httpServer.listen()` completes. This keeps all DML out of the critical startup
path.

### Blocks moved to `runDeferredMigrations()`

| Block | Type | Why deferred |
|---|---|---|
| `DELETE FROM refresh_tokens WHERE token_hash IS NULL` | DML | One-time; no-op after first run |
| 5× currency normalization UPDATEs | DML | No-op once all rows are USD |
| `UPDATE providers … WHERE search_vector IS NULL` | Full-table scan | No-op on healthy DB |
| marketplace_ledger orphan backfill | JOIN + per-row INSERT | Expensive; no-op on clean DB |
| provider_ledger wallet-drift backfill | GROUP BY + per-row UPDATE | Expensive; no-op on clean DB |
| provider_documents status normalization (3 UPDATEs) | DML | No-op once statuses are canonical |
| Stuck-state reconciliation (legacy status names) | Cross-table SELECT + per-row UPDATE | No-op on clean DB |
| Document type normalization | DML | One-time |
| Provider lifecycle state rename | DML | One-time |
| Stuck-state reconciliation (canonical status names) | Cross-table SELECT + per-row UPDATE | No-op on clean DB |
| medical_license provider_documents backfill | INSERT … WHERE NOT EXISTS | No-op on clean DB |
| provider_credentials.verified backfill | UPDATE with JOIN | No-op on clean DB |

**Total queries removed from startup path:** ~30 queries across 12 blocks.

### `runStartupMigrations()` now contains only:
- `CREATE TABLE IF NOT EXISTS` (idempotent, fast)
- `CREATE INDEX IF NOT EXISTS` (idempotent, fast)
- `ALTER TABLE ADD COLUMN IF NOT EXISTS` (idempotent, fast)
- `ALTER TABLE ALTER COLUMN SET DEFAULT` (DDL)
- `CREATE OR REPLACE FUNCTION` (trigger function, DDL)
- `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` (DDL)
- `ON CONFLICT DO NOTHING` seed inserts (payment_providers)

---

## Phase 2 — Connection Pool Configuration

No changes required. Current pool settings are well-matched to Supabase's
PgBouncer limits:

```typescript
max: 5                    // Below Supabase pool_size=15 — no EMAXCONNSESSION risk
idleTimeoutMillis: 30_000 // 30s — appropriate for burst/idle patterns
connectionTimeoutMillis: 10_000  // 10s timeout — reasonable for shared plans
keepAlive: true           // Prevents TCP idle teardown
options: "-c TimeZone=UTC" // Consistent UTC on all connections
```

---

## Phase 3 — No Rogue Pool Instances

Audit confirmed all 30 server files that import DB access use the single
singleton pool from `server/db.ts`. The `pool2` reference in
`appointment.routes.ts:2263` is a dynamic import of the same singleton (safe).

**Result:** No secondary pool instances — no connection leaks.

---

## Phase 4 — DB Pool Health Telemetry

### New endpoint: `GET /api/admin/health/database`
Added to `server/routes/admin/admin-health.routes.ts` (requires
`MONITORING_VIEW` permission).

**Returns:**
- `pool` — totalCount / idleCount / waitingCount / max
- `connections.byState` — pg_stat_activity grouped by state + wait event type
- `topTables` — top 20 tables by live row count with dead rows, bloat %, and
  last autovacuum/analyze timestamps
- `cacheHitRate` — heap and index buffer cache hit rates from
  `pg_statio_user_tables`

### New admin panel: `Development → DB Health`
Added `DatabaseHealthPanel` component at
`client/src/components/admin/dashboard/database-health-panel.tsx`.

Features:
- Pool utilization gauge (4 stat cards + progress bar)
- Buffer cache hit rate gauges with optimal/degraded badges
- Active PG connections breakdown by state
- Top-20 tables with live/dead rows, bloat %, autovacuum staleness
- Auto-refresh every 30s + manual refresh button

---

## Phase 5 — Metrics System Audit

`server/lib/requestMetrics.ts` already implements **pure in-memory** metrics
with no DB writes per request. ✅ No changes needed.

Slow endpoint events do write one row to `system_events` for requests exceeding
`SLOW_MS` — this is intentional, rate-limited by the nature of slow requests,
and acceptable.

---

## Phase 6 — Performance Hardening Indexes

Added 10 new indexes covering the highest-value query hot-paths:

| Index name | Table | Columns | Purpose |
|---|---|---|---|
| `idx_user_notif_user_created` | user_notifications | (user_id, created_at DESC) | Notification listing |
| `idx_audit_logs_user_created` | audit_logs | (user_id, created_at DESC) | Audit trail per user |
| `idx_audit_logs_entity` | audit_logs | (entity_type, entity_id) | Entity audit lookup |
| `idx_appointments_patient_time` | appointments | (patient_id, created_at DESC) | Patient appointment history |
| `idx_appointments_provider_time` | appointments | (provider_id, created_at DESC) | Provider appointment history |
| `idx_realtime_msgs_created` | realtime_messages | (conversation_id, created_at DESC) | Chat pagination |
| `idx_convos_participants` | conversations | (participant_one_id, participant_two_id) | Conversation lookup |
| `idx_provider_ledger_provider_created` | provider_ledger | (provider_id, created_at DESC) | Ledger history pagination |
| `idx_wallet_txns_wallet_created` | wallet_transactions | (wallet_id, created_at DESC) | Wallet transaction history |
| `idx_system_events_country_created` | system_events | (country_code, created_at DESC) | Filtered event listing |

All added to `runStartupMigrations()` Phase 6 block — idempotent, each in its
own try-catch.

---

## Phase 7 — Request Metrics (Already Compliant)

`requestMetrics.ts` is pure in-memory with no DB writes per request. ✅

---

## Phase 8 — Cache TTL (Already Compliant)

`server/lib/cache.ts` uses TTL-based in-memory caches with no DB interaction. ✅
All caches use `node-lru-cache` or similar primitives with expiry.

---

## Summary of Files Changed

| File | Change |
|---|---|
| `server/db.ts` | Extracted 12 DML blocks → `runDeferredMigrations()`; added Phase 6 indexes |
| `server/index.ts` | Import `runDeferredMigrations`; call fire-and-forget 5s after startup completes |
| `server/routes/admin/admin-health.routes.ts` | Added `GET /api/admin/health/database` endpoint |
| `client/src/components/admin/dashboard/database-health-panel.tsx` | New DB Health panel |
| `client/src/pages/admin-dashboard.tsx` | Added DB Health nav item + panel render in Development group |

---

## Technical Debt Noted

- `runDeferredMigrations()` should eventually become versioned up/down Drizzle
  migrations (see `ops/tech-debt.md` TD-03) once the platform reaches stable
  multi-instance deployment.
- Some deferred operations (stuck-state reconciliation) are better suited as
  cron jobs or admin-triggered actions rather than boot-time tasks.
