# Supabase Migration Report

**Date:** 2026-06-10  
**Project:** GoldenLife (CareConnect) — Healthcare Booking Platform  
**Target DB:** Supabase PostgreSQL (pooled session mode, ap-southeast-2)

---

## Summary

The application has been fully migrated to Supabase PostgreSQL as its sole database provider. All `DATABASE_URL` fallbacks have been removed. The complete schema (118 tables, 30 enums) was bootstrapped from `script/bootstrap-supabase.ts` and the app starts cleanly against Supabase.

**Status: ✅ COMPLETE**

---

## Changes Made

### 1. Database Configuration (`server/db.ts`)
- Removed `DATABASE_URL ||` fallback — now exclusively uses `SUPABASE_DATABASE_URL`
- Updated startup error message to reference `SUPABASE_DATABASE_URL`

### 2. Environment Validation (`server/config/env.ts`)
- Removed `DATABASE_URL` from required variable list
- `SUPABASE_DATABASE_URL` is now the only required database secret

### 3. Drizzle Config (`drizzle.config.ts`)
- Updated `url` to use only `SUPABASE_DATABASE_URL`
- Removed `DATABASE_URL` fallback expression

### 4. Bootstrap Script (`script/bootstrap-supabase.ts`)
- New one-shot idempotent schema bootstrap script (safe to re-run)
- Creates all 118 tables in FK dependency order
- Creates 30 enums, all indexes, FTS trigger/function
- Seeds: categories (5), sub_services (10), tax_settings (3), platform_settings (9), currency_rates (5), payment_providers (9)
- Run with: `npx tsx script/bootstrap-supabase.ts`

---

## Schema Summary

| Category | Count |
|---|---|
| Tables | 118 |
| Enums | 30 |
| Indexes | ~180 |
| FTS Triggers | 1 (providers.search_vector) |

### Key Tables Created (in dependency order)
1. `users` → `providers` → `categories` / `catalog_services` / `sub_services`
2. `services` → `practitioners` → `time_slots` → `appointments`
3. `invoices` → `payments` → `provider_earnings` → `reviews`
4. `wallets` → `wallet_transactions`
5. `provider_wallets` → `provider_ledger` → `payout_requests`
6. `packages` → `package_benefits` → `user_packages` → `membership_benefit_usage`
7. `audit_logs`, `system_events`, `bug_reports`, `support_tickets`
8. Runtime/monitoring: `reconciliation_results`, `monitoring_daily_summary`, `monitoring_endpoint_stats`, `rate_limit_hits`

---

## Seed Data

| Table | Rows | Notes |
|---|---|---|
| `users` | 2 | admin@goldenlife.com + elite@physiotherapists.hu (via `npm run seed`) |
| `categories` | 5 | Physiotherapy, Doctor, Home Care Nursing, Mental Health, Nutrition |
| `sub_services` | 10 | 4 physio + 3 doctor + 3 nurse services |
| `tax_settings` | 3 | HU (27%), IR (9%), global (0%) |
| `platform_settings` | 9 | Fees, booking rules, security, referrals |
| `currency_rates` | 5 | USD, EUR, HUF, IRR, GBP |
| `payment_providers` | 9 | Stripe, OTP Bank, Wise, PayPal, Revolut, Shetab, Sadad, Cash, Bank Transfer |

---

## Validation Results

### TypeScript Check
```
npx tsc --noEmit --skipLibCheck
Exit code: 0 ✅
```

### Application Startup
```
[db] Database Provider: Supabase PostgreSQL
[db] Database URL Loaded: YES
[db] Connection: OK (~800ms)
[db] First query: OK (~150ms)
[db] payment_providers table ready + seeded
[db] RBAC roles and permissions seeded
... all runStartupMigrations() completed
```

### Non-Fatal Startup Warnings (resolved)
| Warning | Root Cause | Fix |
|---|---|---|
| `privacy_requests: column "country_code" does not exist` | Column missing from bootstrap | Added via `ALTER TABLE` post-bootstrap |
| `financial_alerts: column "status" does not exist` | Bootstrap used `is_resolved` instead of `status` | Added `status`, `check_type`, `entity_type`, `entity_id`, `source_reconciliation_id`, `acknowledged_at/by` columns |

---

## Connection Details

- **Provider:** Supabase (pooled session mode)
- **Region:** AWS ap-southeast-2
- **Port:** 5432 (session mode — required for Drizzle ORM)
- **Pool max:** 10 connections
- **Connection timeout:** 10,000ms
- **Secret:** `SUPABASE_DATABASE_URL` (Replit secret, never committed)

> **Note:** Supabase's transaction-mode pooler (port 6543) is NOT compatible with Drizzle ORM's prepared statements. Always use the session-mode pooler on port 5432.

---

## Operational Notes

### Running Bootstrap (first-time or reset)
```bash
npx tsx script/bootstrap-supabase.ts
```
Safe to re-run. All statements use `IF NOT EXISTS` / `DO $$ … EXCEPTION WHEN duplicate_object` guards.

### Seeding Admin Accounts
```bash
npm run seed
```
Creates `admin@goldenlife.com` (global_admin) + sample provider account.

### Adding New Tables
Per the established pattern in `replit.md`: all new tables **must** be added to `runStartupMigrations()` in `server/db.ts`. Do NOT use `db:push` (targets Replit local DB, hangs on Supabase introspection). Additionally, add to `script/bootstrap-supabase.ts` for future fresh deployments.

### Schema Drift Prevention
Drizzle ORM SELECTs all columns defined in `shared/schema.ts`. Any column added to the schema must have a corresponding `ALTER TABLE ADD COLUMN IF NOT EXISTS` in `runStartupMigrations()` before the schema change goes live — otherwise the first request to any query on that table returns 500.

---

## Files Changed

| File | Change |
|---|---|
| `server/db.ts` | SUPABASE_DATABASE_URL only; removed DATABASE_URL fallback |
| `server/config/env.ts` | Requires SUPABASE_DATABASE_URL only |
| `drizzle.config.ts` | SUPABASE_DATABASE_URL only |
| `script/bootstrap-supabase.ts` | NEW — full schema bootstrap script |
| `ops/Supabase-Migration-Report.md` | NEW — this report |

