---
name: New tables via startup migrations
description: All new DB tables must go through runStartupMigrations() in server/db.ts, not db:push
---

## The rule
Any new table, enum, or column must be added to `runStartupMigrations()` in `server/db.ts` using idempotent SQL (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).

## Why
`db:push` only targets the local Replit PostgreSQL database. The production/Supabase database (`SUPABASE_DATABASE_URL`) is only reachable at runtime. `runStartupMigrations()` runs on every server boot against whichever database is active.

## How to apply
- Add `CREATE TABLE IF NOT EXISTS` blocks to `runStartupMigrations()`.
- Seed initial data (roles, permissions, etc.) in the same function using `ON CONFLICT DO UPDATE/NOTHING`.
- Test by restarting the server and checking that no errors appear in startup logs.
