---
name: service_requests schema gaps
description: Supabase service_requests table has fewer columns than the Drizzle schema; sub_services.category is a strict enum
---

## Rule
When inserting into `service_requests`, only use these columns (the Supabase table was created before later additions):

**Always present:** `id`, `provider_id`, `category`, `service_name`, `sub_service_name`, `suggested_price`, `description`, `status`, `admin_notes`, `rejection_reason`, `created_service_id`, `created_at`, `updated_at`, `location_mode`, `country_code`

**Added via ALTER TABLE (Sprint 8):** `reviewed_by`, `reviewed_at`, `currency`, `duration_minutes`, `requested_by`

The `CREATE TABLE IF NOT EXISTS` body is skipped if the table already exists — ALTER TABLE guards are **required** for any column added after the initial table creation.

## sub_services.category is providerTypeEnum
`sub_services.category` uses the `provider_type` PG enum: only `"physiotherapist"`, `"doctor"`, `"nurse"` are valid. Inserting `"physiotherapy"` causes `invalid input value for enum`. Service requests store free-text categories — map them before inserting into sub_services.

## sub_services and services tables have no `status` column
Both `sub_services` and `services` tables do **not** have a `status` column (checked against shared/schema.ts). Any INSERT that includes `status` will fail with `column "status" does not exist`.

**Why:** The schema was evolved over time; the Supabase DB has the original table without those columns. ALTER TABLE guards are the only safe way to add columns to an existing Supabase table.

**How to apply:** Before writing any raw SQL INSERT against these tables, grep shared/schema.ts to confirm column names. Add ALTER TABLE guards to runStartupMigrations() for any new column.
