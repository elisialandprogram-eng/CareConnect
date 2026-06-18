# Platform Compatibility & Deployment Hardening Audit

**Date:** 2026-06-10  
**Sprint:** Platform Compatibility & Deployment Hardening  
**Result:** PASS — `npm run build` EXIT 0, dev server healthy

---

## Issues Found & Fixed

### 1. CRITICAL — Top-level `await` in CJS output (Build Blocker)

**File:** `server/db.ts`  
**Root Cause:** The `payment_providers` table creation + seeding block (50 lines) was accidentally placed OUTSIDE the closing `}` of `runStartupMigrations()`. This made esbuild emit top-level `await` statements in the CJS output, which CJS format does not support — causing 4 build errors and blocking `npm run build` completely.

**Fix:** Removed the stray closing `}` at line 2648 and added a correct `}` at the end of the file, making the `payment_providers` block part of the function body.

**Verification:** `npm run build` → EXIT 0; `[db] payment_providers table ready + seeded` still logs on startup.

---

### 2. Replit-Specific Vite Plugins

**File:** `vite.config.ts`  
**Issue:** Three `@replit/vite-plugin-*` packages were conditionally loaded via `await import(...)` behind an `isReplit` (`REPL_ID` env var) gate. On non-Replit hosts (Render, Railway, VPS, Docker), the `REPL_ID` env var is absent so the plugins never loaded — but the `devDependencies` containing them may not exist, and the `REPL_ID` check is a Replit platform assumption.

**Fix:** Removed the `isReplit` variable, `isDev` variable, and the entire Replit plugin conditional block. The config now only uses `react()` — clean, portable, and provider-agnostic.

---

### 3. Replit-Named AI Integrations Folder

**Path:** `server/replit_integrations/` → `server/ai_integrations/`  
**Issue:** The folder was named `replit_integrations` despite containing pure OpenAI-backed features (AI chat, image generation, batch processing) with zero dependency on Replit platform APIs. The name would mislead operators on external hosts.

**Fix:**
- Copied all 8 files to `server/ai_integrations/` preserving directory structure (`batch/`, `chat/`, `image/`)
- Updated `server/routes.ts` imports from `./replit_integrations/*` → `./ai_integrations/*`
- Updated comment in `batch/utils.ts` example import path
- Deleted `server/replit_integrations/` entirely

---

### 4. Stale "Replit" Comments in Core Server Files

**Files:** `server/index.ts`, `server/db.ts`, `server/config/env.ts`

| File | Old | New |
|------|-----|-----|
| `server/index.ts:31` | `// Trust the Replit reverse proxy so req.ip resolves to the real client IP.` | `// Trust the reverse proxy (Render, Railway, Nginx, etc.) so req.ip resolves to the real client IP.` |
| `server/db.ts:24` | `// DATABASE_URL (Replit built-in) is NOT used — Supabase is the only database.` | `// DATABASE_URL is NOT used — SUPABASE_DATABASE_URL is the only accepted connection string.` |
| `server/config/env.ts:65` | `// DATABASE_URL (Replit built-in) is intentionally ignored` | `// DATABASE_URL is intentionally ignored` |

---

### 5. Unused `@neondatabase/serverless` in esbuild Allowlist

**File:** `script/build.ts`  
**Issue:** `@neondatabase/serverless` was in the esbuild bundle allowlist but is not imported anywhere in the server codebase (Neon is not used — database is Supabase/pg). This caused the package to be needlessly bundled into `dist/index.cjs`.

**Fix:** Removed from the allowlist.

---

## Build Output Summary

```
Vite client build:   ✓ built in 27.96s
esbuild server CJS:  dist/index.cjs 2.4mb ⚡ Done in 1130ms
TypeScript check:    EXIT 0 (--noEmit --skipLibCheck)
Dev server startup:  PORT 5000 OK, DB connected, payment_providers seeded
```

---

## Deployment Compatibility After This Sprint

| Environment | Status |
|-------------|--------|
| Replit (dev) | ✅ Working |
| Render | ✅ `npm run build` + `npm run start` will work |
| Railway | ✅ Same — no platform env vars assumed |
| Docker / VPS | ✅ Clean CJS output, no platform assumptions |
| Self-hosted | ✅ Requires `SESSION_SECRET` + `SUPABASE_DATABASE_URL` |

---

## No-Change Items

- `server/replit_integrations/chat/`, `/image/`, `/batch/`: These are OpenAI-backed features, not Replit-platform integrations. The rename to `ai_integrations/` accurately reflects their purpose.
- `server/vite.ts`: Not modified — already provider-agnostic.
- `server/config/env.ts`: Logic untouched; only comments updated.
- `package.json`: Not modified (per user rule). The `@replit/vite-plugin-*` devDependencies remain but are no longer referenced in code.
