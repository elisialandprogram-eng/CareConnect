# Provider Command Center — Production Readiness Audit

**Date:** 2026-06-18  
**Scope:** All 11 tabs of `client/src/components/admin/provider-operations-console.tsx`  
**Goal:** Zero broken flows · Zero dead actions · Zero currency inconsistencies · Zero permission leaks

---

## Executive Summary

| Area | Finding | Resolved |
|------|---------|----------|
| Backend 500s | 3 endpoints returning 500 in production | ✅ All fixed |
| Frontend dead actions | 6 UX/display defects | ✅ All fixed |
| Currency inconsistencies | 0 found | ✅ Clean |
| Permission leaks | 0 found | ✅ Clean |
| Broken flows | 0 remaining | ✅ Clean |

---

## Backend Fixes

### Fix 1 — Schedule GET 500
**Symptom:** `GET /api/admin/providers/:id/schedule` returned 500  
**Root cause:** SQL SELECT included `max_patients_per_day` — a column that does not exist on the `provider_schedule_templates` table in Supabase (only in local Drizzle schema).  
**File:** `server/routes/admin/admin-providers.routes.ts`  
**Fix:** Removed `max_patients_per_day` from the SELECT list. The column was derived from `settings_json` on the client already, so removing it from the SQL had no functional impact.

### Fix 2 — Notes GET 500
**Symptom:** `GET /api/admin/providers/:id/notes` returned 500 with `column n.content does not exist`  
**Root cause:** The `provider_admin_notes` table was created in an earlier session with column `note` (NOT NULL). Later code was written expecting `content`. The two names diverged.  
**File:** `server/db.ts`  
**Fix:** Added `ALTER TABLE IF NOT EXISTS` guards in `runStartupMigrations()` for the missing columns (`admin_id`, `content`, `is_pinned`, `updated_at`). GET query now uses `COALESCE(n.note, n.content) AS note_text` to handle both column naming conventions across environments.

### Fix 3 — Notes POST 500
**Symptom:** `POST /api/admin/providers/:id/notes` returned 500 even after GET was fixed  
**Root cause:** The INSERT targeted column `content` but the Supabase table's original NOT NULL column is `note`. Inserting into `content` (nullable) left `note` as NULL, violating the NOT NULL constraint.  
**Error message logged:** `null value in column "note" of relation "provider_admin_notes" violates not-null constraint`  
**File:** `server/routes/admin/admin-providers.routes.ts`  
**Fix:** Changed INSERT to `(provider_id, admin_id, note)` with `RETURNING id, note AS note_text`. PATCH handler updated identically. Audit log INSERT wrapped in `.catch(() => {})` to prevent cascade failure if `audit_logs` enum is missing an action value.

### Fix 4 — Category Permissions PUT 500
**Symptom:** `PUT /api/admin/providers/:id/category-permissions` returned 500 with `invalid input value for enum provider_type: "<UUID>"`  
**Root cause:** Frontend was sending category UUIDs from `getAllCategories()` as the `categoryId` field. The DB column `provider_category_permissions.category` is a PostgreSQL `provider_type` ENUM — it accepts 7 slugs only (physician/mental_health/etc.), not UUIDs.  
**Fix:**  
- GET endpoint now returns `PROVIDER_TYPE_OPTIONS` (the 7 canonical slugs) instead of `getAllCategories()` rows  
- Frontend `CategoryPermissionsTab` uses `c.id` (which now equals a slug like `"physician"`) as both key and draft value, which the ENUM column accepts

---

## Frontend Fixes

### Fix 5 — Schedule tab blank on first open
**Symptom:** Schedule tab rendered nothing on first click because `ScheduleTab` was unmounted  
**Root cause:** `TabsContent value="schedule"` was wrapped with `mountedTabs.has("schedule")` as an outer guard, preventing Radix from mounting the content at all  
**Fix:** Moved the conditional inside `TabsContent` — the wrapper stays in the DOM; the inner component is guarded

### Fix 6 — Enable/Disable Bookings had no confirm dialog
**Symptom:** Clicking the toggle immediately fired the API call with no confirmation  
**Fix:** Wrapped toggle handler in `AlertDialog` with descriptive copy ("This will prevent new bookings…" / "Allow new bookings again")

### Fix 7 — Provider type header showed raw enum value
**Symptom:** Header showed `"rehabilitation"` instead of `"Rehabilitation"`  
**Fix:** Applied `humanLabel()` to `prov.providerType` in the console header pill

### Fix 8 — Health score note showed raw number
**Symptom:** Health factor `score` rendered as `{score}` without a label  
**Fix:** Added `Note:` prefix and clamped display to 0–100

### Fix 9 — Extra docs section had no label
**Symptom:** The "additional documents" disclosure area showed no header  
**Fix:** Added `"Additional Documents"` heading with count badge

### Fix 10 — RequestDocumentsDialog criticality badge was always grey
**Symptom:** All criticality levels showed the same neutral badge  
**Fix:** Added `variant` mapping: `required→destructive`, `important→warning`, `optional→secondary`

---

## Currency Audit — All 11 Tabs

| Tab | Currency Rule Applied | Status |
|-----|----------------------|--------|
| Overview | `fmtUSD` for wallet/revenue KPIs (admin always sees USD totals) | ✅ |
| Profile | `fmtUSD` for fee columns; `humanLabel()` for enum display | ✅ |
| KYC & Docs | No currency display | ✅ |
| Schedule | No currency display | ✅ |
| Services | `fmtSvcPrice` (formatInCurrency in native currency) for service prices | ✅ |
| Bookings | `formatInCurrency(appt.totalAmount, appt.displayCurrency)` for booking amounts | ✅ |
| Patients | No currency display | ✅ |
| Financials | `fmtUSD` for admin revenue reporting, wallet balance | ✅ |
| Staff | No currency display | ✅ |
| Timeline | No currency display | ✅ |
| Admin Notes | No currency display | ✅ |

**Rule enforced:** Admin panels always use `fmtUSD` (provider_earnings / wallet are stored USD). Booking amounts use `formatInCurrency(amount, displayCurrency)` — never `fmtMoney` (which expects USD input).

---

## Permission Audit

All 11 tab data endpoints require:
- `authenticateToken` — valid JWT
- `requireAdmin` OR `requireGlobalAdmin` — role check
- Country-scoped access via `canAccessCountry()` where applicable (documents, credentials endpoints)

No patient-facing data is exposed without the admin gate. Provider PII is sanitized via `sanitizeProvider("public")` on list endpoints.

---

## Lazy-Mount Pattern

Tabs that fetch heavy data (Schedule, Bookings, Financials, Timeline, Admin Notes) use the `mountedTabs` set pattern:

```tsx
<TabsContent value="schedule" className="mt-0">
  {mountedTabs.has("schedule") && <ScheduleTab providerId={prov.id} />}
</TabsContent>
```

Only the "overview" tab is pre-mounted. All others mount on first visit and stay mounted (no flicker on re-visit). This reduces cold-open network load from 11 parallel fetches to 1.

---

## Remaining Known Items (Non-Blocking)

| Item | Severity | Notes |
|------|----------|-------|
| `content` column remains on `provider_admin_notes` | Low | Nullable, harmless orphan; can be dropped in a future migration |
| `cron_ledger_reconcile` reports 1 non-ok finding | Low | Pre-existing; not related to Command Center |

---

## Files Changed

| File | Change |
|------|--------|
| `server/routes/admin/admin-providers.routes.ts` | Schedule SELECT fix; Notes GET/POST/PATCH column fix; Category permissions GET returns slugs; error logging |
| `server/db.ts` | `provider_admin_notes` ALTER TABLE guards for missing columns; id DEFAULT guard |
| `client/src/components/admin/provider-operations-console.tsx` | 6 frontend fixes (lazy-mount, confirm dialog, humanLabel, health note, docs label, criticality badge) |
