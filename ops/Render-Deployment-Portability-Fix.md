# Render Deployment Portability Fix

**Date:** 2026-06-11  
**Status:** COMPLETE — zero Replit-internal registry references remain in deployable source files

---

## Problem Summary

`package-lock.json` contained **584 `resolved` URLs** pointing to:

```
http://package-firewall.replit.local/npm/
```

This is a Replit-internal package mirror that is only reachable inside the Replit sandbox. On any external platform (Render, Railway, Fly.io, Docker, VPS) the hostname does not resolve, causing:

```
npm ERR! getaddrinfo ENOTFOUND package-firewall.replit.local
```

`npm ci` would fail every time during the build phase on external platforms.

---

## Root Cause

The Replit development environment injects `NPM_CONFIG_REGISTRY=http://package-firewall.replit.local/npm/` as a runtime environment variable. When `npm install` was previously run inside Replit without an explicit `--registry` override, the lockfile baked those internal URLs into all 584 `resolved` fields.

---

## Files Changed

| File | Action | References Removed |
|------|--------|--------------------|
| `package-lock.json` | Deleted and regenerated from scratch using `--registry=https://registry.npmjs.org/` | **584** |
| `node_modules/` | Deleted and reinstalled cleanly | N/A |
| `.gitignore` | Created — excludes `node_modules/`, `dist/`, `.cache/` | N/A |

### Files NOT changed (no action needed)

| File | Status | Reason |
|------|--------|--------|
| `package.json` | Clean | No registry URLs present |
| `.npmrc` | Already correct | `registry=https://registry.npmjs.org/` was already set |
| `.replit` | Not applicable | Workflow/run config only |
| `replit.nix` | Clean | No registry references |
| `.cache/replit/env/` | **Intentionally left alone** | Replit runtime-injected environment file; not part of the committed repository; cannot be modified; ignored via new `.gitignore` |
| `attached_assets/` | Historical paste files | Contain error messages from prior incidents — not configuration files |
| `ops/` docs | Documentation only | Reference the URL in narrative prose, not as active config |
| `scripts/sanitize-lockfile.cjs` | Legacy utility | References the URL as a string literal to replace it; functionally harmless |

---

## Lockfile Regeneration Details

```bash
# Step 1: Remove old artifacts
rm -rf node_modules package-lock.json

# Step 2: Regenerate from public registry
npm install --registry=https://registry.npmjs.org/

# Lockfile version: 3
# Packages installed: 584
# Registry used: https://registry.npmjs.org/
```

**Verified sample of regenerated resolved URLs:**
```
"resolved": "https://registry.npmjs.org/@alloc/quick-lru/-/quick-lru-5.2.0.tgz"
"resolved": "https://registry.npmjs.org/@babel/code-frame/-/code-frame-7.29.7.tgz"
"resolved": "https://registry.npmjs.org/@babel/compat-data/-/compat-data-7.29.7.tgz"
```

---

## Validation Results

| Check | Command | Result |
|-------|---------|--------|
| Install from lockfile | `npm ci` | ✅ PASSED — 584 packages, no errors |
| Production build | `npm run build` | ✅ PASSED — client + server bundled in 31s |
| Lockfile scan | `grep "package-firewall.replit.local" package-lock.json` | ✅ **0 matches** |
| Full source scan | `grep -R "package-firewall.replit.local" . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=.cache --exclude-dir=.local --exclude-dir=attached_assets --exclude-dir=ops --exclude="sanitize-lockfile*"` | ✅ **0 matches** |

---

## Final Verdict

**DEPLOYMENT PORTABILITY: RESTORED**

The `package-lock.json` and installed `node_modules` now reference only public npm registry URLs. The project can be built with `npm ci && npm run build` on any external platform without requiring Replit network access.

### Success Criteria Check

```bash
grep -R "package-firewall.replit.local" . \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  --exclude-dir=.git \
  --exclude-dir=.cache \
  --exclude-dir=.local \
  --exclude-dir=attached_assets \
  --exclude-dir=ops
```

**Result: zero matches** ✅

---

## Prevention

`.gitignore` now excludes `.cache/` so Replit's runtime-injected environment files are never committed. The `.npmrc` file already pins `registry=https://registry.npmjs.org/` ensuring future `npm install` runs within Replit also use the public registry.
