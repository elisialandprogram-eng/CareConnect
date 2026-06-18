---
name: CJS build top-level-await trap
description: Any top-level await in server/ source files causes esbuild CJS format build failure; all async code must be inside a function.
---

## The Rule
Every `await` expression in any `server/` TypeScript file MUST be inside a function body (async function, IIFE, method). A bare top-level `await` in module scope compiles fine in ESM (tsx dev mode) but causes a fatal esbuild error when targeting `format: "cjs"`.

**Why:** esbuild CJS output does not support top-level await. The dev server uses `tsx` (ESM-aware), which masks the problem — the bug is invisible in development but blocks every production build.

**How to apply:**
- Before adding any await to `server/db.ts` or any other server file, confirm it's inside `runStartupMigrations()` or another async function.
- The closing `}` of `runStartupMigrations()` in `server/db.ts` is the last line of the file. If code appears AFTER that `}`, it's module-scope and will break the build.
- When the build emits `Top-level await is not available in the configured target environment`, grep for bare `await` outside any function in the offending file.
- The `payment_providers` seeding block was the first instance — it was accidentally placed after the function's closing brace.
