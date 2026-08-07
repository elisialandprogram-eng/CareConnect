---
name: time_slots date column is TEXT
description: time_slots.date is stored as TEXT in PostgreSQL, not DATE — SQL operators fail without a column cast
---

## Rule
All SQL comparisons involving `time_slots.date` must cast the column to `date` before comparing it to a `::date` parameter or typed array:

```sql
-- range delete / count
WHERE date::date >= $2::date
  AND date::date <= $3::date

-- array membership (bulk preview)
WHERE date::date = ANY($2::date[])
```

Bare `date >= $2::date` or `date = ANY($2::date[])` fail with:
`operator does not exist: text >= date` / `text = date`

**Why:** The column was created as `text` (probably via early Drizzle migration). Changing the column type would require a migration; the cast pattern avoids that.

**How to apply:** Any route or storage method that queries `time_slots` by date range or array must use `date::date`. Applies in `deleteSlotsByRange` (database-storage.ts) and the bulk/preview route (provider.routes.ts).
