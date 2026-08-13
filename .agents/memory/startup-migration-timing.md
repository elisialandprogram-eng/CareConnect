---
name: Startup migration timing
description: runStartupMigrations must be non-blocking — never await it before httpServer.listen()
---

## Rule
`runStartupMigrations()` in `server/index.ts` must run **after** `httpServer.listen()` as a fire-and-forget call, not awaited before it.

**Why:** Replit kills the workflow if port 5000 isn't open within 60 seconds. Heavy migrations (CREATE TYPE, ALTER TYPE ADD VALUE for enums, bulk upserts for RBAC seeding) can easily exceed that limit, especially on a cold database or Supabase.

**How to apply:**
```ts
// CORRECT — port opens immediately
httpServer.listen(port, "0.0.0.0", () => { log(`serving on port ${port}`); });
runStartupMigrations().catch((e) => console.warn("[db] migration error:", e.message));

// WRONG — blocks port open
await runStartupMigrations();
httpServer.listen(port, "0.0.0.0", ...);
```

Same principle applies to heavy seeding inside `runStartupMigrations()` — use `setTimeout(() => seedFn().catch(...), 0)` for slow sub-tasks like RBAC role/permission upserts so they don't block the outer await chain.

## Request gating
The port may be open while migrations are still running, so mutation endpoints that depend on migration-created constraints must check `getReadiness()` and return a temporary `503` until the status is `ready`.

**Why:** A booking can arrive during the migration window; allowing it to continue can create partial business data and fail later when it reaches a newly-created payment constraint.

**How to apply:** Keep health/listening endpoints available during startup, but gate schema-dependent writes with a stable error code such as `DATABASE_NOT_READY`.

## Partial unique indexes
When a unique index is partial, its `ON CONFLICT` target must include a matching `WHERE` predicate for PostgreSQL to infer the index.

**Why:** `ON CONFLICT (column)` does not match a unique index declared with `WHERE column IS NOT NULL`, even when the index exists.

**How to apply:** Keep the conflict target and index predicate identical, such as `ON CONFLICT (appointment_id) WHERE appointment_id IS NOT NULL`.
