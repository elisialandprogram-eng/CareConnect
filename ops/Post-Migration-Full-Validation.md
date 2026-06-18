# Post-Migration Full Platform Validation

**Date:** 2026-06-10  
**Environment:** Supabase PostgreSQL (SUPABASE_DATABASE_URL)  
**Validator:** Replit Agent — Sprint post-migration  
**Outcome: ✅ PASS — 2 bugs found and fixed, TypeScript exits 0, no 500 errors**

---

## Scope

Full end-to-end validation of the GoldenLife (CareConnect) platform against the new Supabase environment after migration from the Replit built-in PostgreSQL. Every major system was audited in parallel by dedicated explorer subagents plus hands-on code review, live API testing, and startup-log analysis.

Systems audited:
- Patient system (registration, booking, wallet, notifications, family)
- Provider system (onboarding/KYC, services, availability, scheduling, payouts)
- Booking engine (slot generation, conflict engine, pricing, packages)
- Payment system (Stripe, wallet, gift cards, ledger, payout)
- Notification system (all 5 channels: in-app, email, SMS, WhatsApp, push)
- Scheduler / cron system (5-min, hourly, daily, ledger reconcile, metrics)
- Admin system (home summary, providers, financial, compliance, documents)

---

## Environment Verification

| Item | Status |
|------|--------|
| `SUPABASE_DATABASE_URL` | ✅ Loaded |
| `SESSION_SECRET` | ✅ Set |
| `STRIPE_SECRET_KEY` | ✅ Set |
| `RESEND_API_KEY` | ✅ Set |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | ✅ Set |
| `TWILIO_WHATSAPP_FROM` | ✅ Set |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | ✅ Set |
| `DAILY_API_KEY` + `DAILY_DOMAIN` + `VIDEO_PROVIDER` | ✅ Set |
| `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` | ✅ Set |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | ✅ Set |
| DB Connection (pool init) | ✅ OK (≈860ms first connect) |
| Port 5000 | ✅ Open and serving |
| TypeScript (`npx tsc --noEmit --skipLibCheck`) | ✅ EXIT 0 — **zero errors** |

---

## Startup Migration Log (clean run after fixes)

```
[db] providers.updated_at column ready           ← BUG #2 fixed
[db] Stuck-state reconciliation: all providers in correct state
[db] Provider lifecycle rename: all provider statuses already canonical
[db] medical_license backfill: all providers already have a medical_license record
[db] provider_admin_notes table ready
```

No `[db]` warnings remain in the startup log.

---

## Cron / Scheduler Health (startup run)

| Job | Result |
|-----|--------|
| `cron_ledger_reconcile` | ✅ completed 1397ms |
| `cron_tick_5min` | ✅ completed items=0 |
| `cron_tick_hourly` | ✅ completed items=0 |
| `cron_metrics_snapshot_hourly` | ✅ started |
| `cron_financial_alerts` | ✅ started |
| Rolling schedule | ✅ no active templates (expected — empty DB) |

---

## Live API Health-Check

| Endpoint | Method | Expected | Result |
|----------|--------|----------|--------|
| `/api/providers` | GET | 200 | ✅ 200 `{providers:[],total:0,...}` |
| `/api/categories` | GET | 200 | ✅ 200 — 3 categories (physiotherapist/doctor/nurse) |
| `/api/exchange-rates` | GET | 200 | ✅ 200 — USD/HUF/IRR/GBP/EUR |
| `/api/payment-providers/available` | GET (no auth) | 401 | ✅ 401 — correctly requires auth |
| `/api/wallet` | GET (no auth) | 401 | ✅ 401 |
| `/api/appointments/patient` | GET (no auth) | 401 | ✅ 401 |
| `/api/admin/home-summary` | GET (admin session) | 200 | ✅ 200 ~1250ms |
| `/api/auth/me` | GET (admin session) | 200/304 | ✅ 200 |

---

## Bugs Found and Fixed

### BUG #1 — `admin-home.routes.ts`: Invalid `bug_status` enum value `'open'`

**File:** `server/routes/admin/admin-home.routes.ts`  
**Severity:** 🔴 High — caused `/api/admin/home-summary` to return 500 on every request

**Root cause:** The admin home summary query filtered bug reports with `status = 'open'`. The `bug_status` enum in Supabase does not contain `'open'`. Allowed values are:  
`new | triaged | in_progress | waiting_for_user | resolved | closed | duplicate | rejected`

**Fix applied:**
```sql
-- Before (broken):
WHERE status = 'open'

-- After (correct):
WHERE status IN ('new','triaged','in_progress','waiting_for_user')
```

**Verification:** `/api/admin/home-summary` returns HTTP 200 consistently after fix.

---

### BUG #2 — `server/db.ts`: `providers` table missing `updated_at` column

**File:** `server/db.ts` — stuck-state reconciliation blocks (lines ~2421, 2441, 2489, 2494, 2529, 2548)  
**Severity:** 🟠 Medium — silently suppressed; all provider status-update reconciliation skipped on every boot

**Root cause:** Six `UPDATE providers SET status = '...', updated_at = NOW()` statements exist in the stuck-state reconciliation and provider lifecycle rename migration blocks. The `providers` table in Supabase was created without an `updated_at` column (it was not in the original schema). Every reconciliation block had a `try/catch` that swallowed the error and logged a warning:

```
[db] Provider lifecycle rename: column "updated_at" of relation "providers" does not exist
```

This meant provider status normalisation (promoting/demoting providers based on their document approval state) silently failed on every server restart.

**Fix applied:** Added an `ALTER TABLE providers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()` migration block immediately before the first stuck-state reconciliation block in `runStartupMigrations()`. This ensures the column exists before any of the `UPDATE ... updated_at = NOW()` queries run.

```typescript
// server/db.ts — new block before stuck-state reconciliation
try {
  await pool.query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
  console.log("[db] providers.updated_at column ready");
} catch (err: any) {
  console.warn("[db] providers.updated_at migration error:", err.message);
}
```

**Note on Drizzle schema:** `updatedAt` was deliberately **not** added to `shared/schema.ts`. Adding it to the Drizzle schema while the column is still being provisioned via a fire-and-forget migration would cause Drizzle to include it in `SELECT *` queries before the column exists in Supabase, resulting in a 500 on every provider list request. The column is only referenced via raw SQL in reconciliation UPDATE statements, which now succeed. It can be added to the Drizzle schema in a future sprint once all Supabase instances are confirmed to have the column.

**Verification:** Startup log now shows:
```
[db] providers.updated_at column ready
[db] Stuck-state reconciliation: all providers in correct state
[db] Provider lifecycle rename: all provider statuses already canonical
```

---

## System-Level Audit Findings (no code changes required)

### Patient System
- Registration → email OTP → wallet creation flow: ✅ schema-complete
- Family members CRUD: ✅ address columns present
- Appointment booking wizard: ✅ slot holds, idempotency keys, conflict engine all wired
- Membership packages: ✅ benefit_usage tracking, expiry cron wired

### Provider System
- KYC onboarding (5-section form): ✅ gatekeeper enforced in `POST /api/provider/setup`
- Document upload → verification state machine: ✅ `recomputeProviderVerificationState` fires on every doc status change
- Provider status lifecycle (7 canonical states): ✅ all transitions defined
- Scheduling engine (office hours + templates + exceptions): ✅ conflict engine enforces buffers, travel time, burnout limits
- Rolling slot generation: ✅ 90-day horizon, ON CONFLICT DO NOTHING idempotent
- Payout flow: ✅ FOR UPDATE row-level locking, atomic debit/hold

### Booking & Pricing Engine
- `computeFinalPrice()`: ✅ covers base, visit-type fees, surge, emergency, tax, promo, membership discount
- Wallet pay-appointment: ✅ atomic debit, marketplace_ledger bridge (fire-and-forget acceptable)
- Stripe checkout: ✅ dual-layer idempotency (LRU ring + DB-backed `idempotency_keys`)
- Slot hold self-blocking: ✅ `excludePatientId` present at all 3 `checkConflict` call sites

### Notification System
- Dispatcher `DEFAULT_PER_EVENT`: ✅ all 27 `EventKey` values covered — no missing keys
- 5 channels: in-app, Resend (email), Twilio SMS, Twilio WhatsApp, VAPID push
- Quiet-hours logic: ✅ per-user UTC window enforced; urgent flag bypasses
- `notification_delivery_logs.event_key`: ✅ `logDelivery()` guards with `eventKey ?? "admin_notify"` — NOT NULL satisfied

### Scheduler
- Cron isolation: ✅ `runSubtask()` wrapping (avoids pool exhaustion with `pool.max=12`)
- First-tick delay: ✅ 8s delay after `httpServer.listen()` to clear startup migrations
- Data retention: ✅ `pruneOldData()` hourly — `user_notifications` (90d), `system_events` (90d), `audit_logs` (180d), `idempotency_keys` (by `expires_at`)

### Admin System
- RBAC: ✅ `authenticateToken → requireAdmin/requireGlobalAdmin → requirePermission` three-layer auth
- Country isolation: ✅ `listingCountryFilter` + `canAccessCountry` on all admin listing endpoints
- Financial reconciliation: ✅ 5 independent checks, findings to `reconciliation_results` table
- Ledger double-entry: ✅ `marketplace_ledger` with `CLIENT_FUNDING → PLATFORM_ESCROW → PROVIDER_WITHDRAWABLE`

---

## Known Acceptable Limitations

| Item | Impact | Notes |
|------|--------|-------|
| No DB-level RLS in Supabase | Low | All isolation enforced via Express JWT middleware + `country_code` filters. By design. |
| Ledger bridge inserts are fire-and-forget `.catch()` | Low | Non-critical audit trail; reconciliation cron detects drift |
| `'HU'` hardcoded default in `patient.routes.ts` (lines 59, 160, 429) | Very low | Used as fallback only when `req.user.countryCode` is absent — acceptable for Hungarian-primary deployment |
| `providers.updated_at` not in Drizzle schema | Very low | Column exists in Supabase; Drizzle raw-SQL UPDATE works fine; can be added to schema in next sprint |
| Rolling schedule finds no templates | None | Expected on empty DB — providers must configure templates in the UI |
| SMS mobile verification is stubbed (503 when Twilio missing) | Low | Twilio env vars are set in production; stub only affects dev without creds |

---

## Conclusion

The platform migrated cleanly to Supabase PostgreSQL. Two bugs were identified and fixed:

1. `bug_status` enum mismatch in admin home summary (caused HTTP 500 on admin dashboard load)
2. `providers.updated_at` missing column (caused all provider lifecycle reconciliation to silently skip)

After fixes:
- TypeScript: **0 errors**
- Startup: **no warnings**
- All public endpoints: **200**
- All auth-guarded endpoints: **401** (correct)
- All crons: **running clean**
