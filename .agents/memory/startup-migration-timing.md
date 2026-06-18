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
