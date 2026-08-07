---
name: PG error code pattern
description: How to correctly check PostgreSQL error codes when using Drizzle ORM — the cause.code fallback is essential
---

## The rule

Always extract the code into a local variable first:

```typescript
const pgCode = err?.code ?? err?.cause?.code;
if (pgCode === "23505") { /* unique violation */ }
if (pgCode === "23503") { /* FK violation */ }
if (pgCode === "23514") { /* check constraint */ }
```

Never write `err.code === "23505"` or even `err?.code === "23505"` directly — both miss the Drizzle-wrapped case.

**Why:** Drizzle ORM (and the `pg` driver) sometimes wraps the underlying PostgreSQL error under `err.cause`. When that happens `err.code` is undefined but `err.cause.code` carries the real PG code. Both the bare form (`err.code`) and the optional-chain-only form (`err?.code`) silently produce `undefined`, causing the 23505 branch to be skipped and the caller to receive an unhandled 500 instead of a clean 409 Conflict.

**How to apply:** Every catch block that branches on a PG error code — in `server/routes/*.ts` and `server/storage/database-storage.ts` — must use the two-part extraction. Search for `err?.code ===` to find any new instances that need the fix.

## Confirmed locations (as of 2026-06-08)

All fixed:
- `server/routes/catalog.routes.ts` — review 23505 / 23514
- `server/routes/provider.routes.ts` — availability-exception 23505
- `server/routes/appointment.routes.ts` — slot-hold 23505 (pgCode pattern already used)
- `server/storage/database-storage.ts` — provider_earnings race 23505, time-slot OCC 23505
