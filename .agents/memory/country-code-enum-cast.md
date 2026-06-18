---
name: country_code enum cast pattern
description: Which tables need ::text cast when comparing country_code to a text parameter in raw SQL
---

## Rule

In raw SQL queries, `providers.country_code` and `users.country_code` are PostgreSQL enum types (`country_code` enum). Comparing them directly to a `$N` text parameter fails with error 42883 (operator does not exist). Always cast:

```sql
WHERE p.country_code::text = $1
WHERE u.country_code::text = $1
WHERE a.country_code::text = $1   -- appointments also uses the enum
```

## Tables that are TEXT (no cast needed)

- `admin_notifications.country_code` — defined as `TEXT` in db.ts DDL
- `pricing_overrides.country_code` — raw SQL DDL, TEXT
- `invoice_templates.country_code` — raw SQL DDL, TEXT
- `platform_events.country_code` — raw SQL DDL, TEXT

**Why:** Supabase Postgres enforces strict enum/text separation; the Drizzle schema uses `pgEnum("country_code", [...])` for providers and users but raw tables created via pool.query use plain TEXT.

**How to apply:** Before writing any WHERE clause with `country_code = $N`, check the table DDL. If the table is defined in shared/schema.ts using pgEnum, add `::text`. If defined in server/db.ts as plain TEXT, no cast needed.
