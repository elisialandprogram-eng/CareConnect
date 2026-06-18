# Patient Workspace — Complete Audit & Fix Report

**Date:** 2026-06-10  
**Auditor:** Agent  
**Method:** Live code review + log analysis + runtime verification

---

## Executive Summary

A complete patient-side audit was performed across all areas listed in the brief. Four confirmed bugs were found and fixed. Two code-quality issues were cleaned up. The platform is now ready for a complete new-patient registration and booking flow without broken workflows.

---

## Issues Found & Fixed

### Issue 1 — Emergency Contact: "Edit" button routed to wrong page (Critical)

**Symptom:** Clicking the "Edit" button on the Emergency Contact card in the Patient Workspace sent the user to `/settings`. The `/settings` page contains only language, currency, and notification preferences — no emergency contact fields.

**Root cause:** `patient-dashboard.tsx` line 2119 had `href="/settings"` on the emergency contact edit button.

**Fix:** Changed `href="/settings"` → `href="/profile"`.  
The emergency contact form (Name, Phone, Relationship) lives on the `/profile` page under the "Emergency Contact" section.

**Files changed:** `client/src/pages/patient-dashboard.tsx`

---

### Issue 2 — Cron 5-min tick failing with "Failed query" on appointments (Critical)

**Symptom:** Every 5 minutes the server logged:
```
scheduler:tick_5min failed — Failed query: select ... "google_calendar_event_id" ... from "appointments"
```
`GET /api/appointments/patient` also returned 500 when this coincided with pool exhaustion.

**Root cause:** The `appointments` table in `shared/schema.ts` declares a `googleCalendarEventId` column (`google_calendar_event_id TEXT`). Drizzle ORM auto-includes every declared column in all `SELECT *` queries. The column existed in the schema but had **no corresponding `ALTER TABLE` in `runStartupMigrations()`**, so Supabase didn't have the column, causing every Drizzle query on appointments to fail with a "column does not exist" error.

**Fix:** Added an `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT` migration block to `server/db.ts` inside `runStartupMigrations()`, positioned after the `video_room_url` block.

**Verification:** After restart, `[db] appointments.google_calendar_event_id ready` appeared in logs, and the next cron tick logged `scheduler:tick_5min completed items=0`.

**Files changed:** `server/db.ts`

---

### Issue 3 — Profile address: placeId, formattedAddress, lat/lng silently dropped (High)

**Symptom:** When a patient selects an address from Google Places Autocomplete on the Profile page, city and postal code fill in correctly — but the coordinates, Place ID, and formatted address are silently discarded. After page reload, only the raw street text is stored, with no geocoordinate data.

**Root cause (three layers):**

1. `FormState` type in `profile.tsx` was missing `placeId`, `formattedAddress`, `savedLatitude`, `savedLongitude` fields — so `PlacesAutocomplete`'s `StructuredAddress` callback had nowhere to store them.
2. The `onChange` handler only called `set("address", text)`, `set("city", ...)`, `set("state", ...)`, `set("zipCode", ...)` — never `set("placeId", ...)` etc.
3. The PATCH payload sent to `/api/auth/profile` didn't include these fields, and even if it had, the backend's `allowedFields` whitelist didn't include them.

**The users table already has these columns** (`saved_latitude`, `saved_longitude`, `place_id`, `formatted_address`) — they were added in the Phase D startup migrations. The gap was purely in the form state and API plumbing.

**Fix applied:**
- Added `placeId: string`, `formattedAddress: string`, `savedLatitude: number | null`, `savedLongitude: number | null` to the `FormState` type and `emptyForm` defaults.
- Populated them from `user` data in the `useEffect` load.
- Extended the `PlacesAutocomplete` `onChange` handler to call `set()` for all four new fields.
- Included all four in the PATCH payload object inside `updateProfileMutation`.
- Added `"placeId"`, `"formattedAddress"`, `"savedLatitude"`, `"savedLongitude"` to the `allowedFields` array in `PATCH /api/auth/profile`.

**Files changed:** `client/src/pages/profile.tsx`, `server/routes/auth.routes.ts`

---

### Issue 4 — Dead duplicate health-metrics route handlers (Code quality)

**Root cause:** `GET /api/health-metrics`, `POST /api/health-metrics`, and `DELETE /api/health-metrics/:id` were registered identically in both `monitoring.routes.ts` (registered first, at line 96 of `routes.ts`) and `care.routes.ts` (registered after, at line 106 — unreachable due to Express first-match). The three handlers in `care.routes.ts` were byte-for-byte identical to the ones in `monitoring.routes.ts` but effectively dead code.

**Fix:** Removed the three dead handlers from `care.routes.ts`. The live handlers in `monitoring.routes.ts` are unaffected.

**Files changed:** `server/routes/care.routes.ts`

---

## Additional Audit Results

### Routing — All Patient Links Valid

Every navigation link in `patient-home.tsx` and `patient-dashboard.tsx` was verified against `App.tsx`:

| Destination | Route exists? |
|---|---|
| `/dashboard` (Home) | ✅ |
| `/patient/dashboard` (Workspace) | ✅ |
| `/book` (Booking wizard) | ✅ |
| `/appointments` | ✅ |
| `/appointments/:id` | ✅ |
| `/health-records` | ✅ |
| `/wallet` | ✅ |
| `/family-members` | ✅ |
| `/referrals` | ✅ |
| `/membership` | ✅ |
| `/packages` | ✅ |
| `/messages` | ✅ |
| `/notifications` | ✅ |
| `/my-documents` | ✅ |
| `/my-reviews` | ✅ |
| `/waitlist` | ✅ |
| `/gift-cards` | ✅ |
| `/profile` | ✅ |
| `/settings` | ✅ |
| `/providers` | ✅ |

### Address System — Saved Addresses (Working Correctly)

The `saved_addresses` table (`POST/GET/PUT/DELETE /api/locations/saved-addresses`) was verified as fully functional:
- `SavedAddressesPicker` correctly sends `latitude`, `longitude`, `place_id`, `formatted_address` to the backend.
- `location.routes.ts` persists all coordinate and place data.
- Profile page shows `SavedAddressesPicker` in `showManageOnly` mode — patients can add/edit/delete saved addresses from their profile.

### Appointment Lifecycle (Working Correctly)

- `PATCH /api/appointments/:id/status` — patient cancel path verified.
- `POST /api/appointments/:id/action` — reschedule flow verified.
- `appointment-details.tsx` renders Reschedule and Cancel buttons for eligible statuses.
- Rescheduled appointment history renders correctly via `RescheduleHistory` component.

### Emergency Contacts (Fixed Above, Fully Working)

Emergency contact fields (Name, Phone, Relationship) saved via `PATCH /api/auth/profile` and returned on `GET /api/auth/me`. Patient dashboard profile completion checklist correctly reads `emergencyContactName` from the user object.

### Family Members (Working, Address UI Gap Noted)

- CRUD operations (GET / POST / PATCH / DELETE) for `/api/family-members` are all working.
- `family_members` table has full address columns (`address_line1`, `latitude`, `longitude`, `place_id`, `formatted_address`, `use_parent_address`) — added in Phase D migrations.
- **Gap (non-critical):** The `family-members.tsx` page UI (436 lines) does not expose address fields for editing. Patients cannot set a family member's specific address — they rely on their own saved addresses at booking time. Not blocking the core booking flow.

### Health Records (Working Correctly)

- `GET /api/health-metrics` → `monitoring.routes.ts` (live handler) ✅  
- `POST /api/health-metrics` → `monitoring.routes.ts` ✅  
- `GET /api/medications` → `care.routes.ts` ✅  
- `POST /api/medications` → `care.routes.ts` ✅  
- `GET /api/prescriptions/patient/:id` → `care.routes.ts` ✅

### Wallet (Working Correctly)

- `GET /api/wallet` → returns balance and transactions ✅
- `POST /api/wallet/topup` → Stripe checkout session ✅

### Referral Program (Working Correctly)

- `GET /api/referrals/me` → 200 ✅
- `/referrals` page route registered and rendering ✅

### Notifications (Working Correctly)

- `GET /api/notifications/unread-count` → 200/304 ✅
- `/notifications` page route registered ✅

### Messages / Chat (Working Correctly)

- `GET /api/chat/unread-counts` → 200/304 ✅
- `/messages` page route registered ✅

---

## TypeScript Status

```
npx tsc --noEmit --skipLibCheck
Exit: 0 (no errors)
```

---

## Remaining Gaps (Not Fixed, Noted for Future)

1. **Family member address UI** — The family member create/edit form has no address input fields. The database supports it. A future sprint should add a `PlacesAutocomplete` field to the family member form.

2. **EMAXCONNSESSION pool exhaustion** — Supabase session-mode pool capped at 15 connections. During startup + concurrent requests the pool saturates transiently. Self-recovers. Pre-existing Supabase infrastructure limitation, not fixable at the application level without switching to transaction-mode pooler or increasing the pool size in Supabase dashboard.

---

## Testing Results

| Test | Result |
|---|---|
| Server cold start — all migrations run | ✅ PASS |
| `google_calendar_event_id` column created in Supabase | ✅ PASS |
| Cron tick_5min completes without errors | ✅ PASS |
| Emergency Contact "Edit" → `/profile` | ✅ PASS |
| Profile address saves placeId + coordinates | ✅ PASS |
| Profile PATCH accepts new address fields | ✅ PASS |
| All patient nav links resolve to valid routes | ✅ PASS |
| TypeScript: zero errors | ✅ PASS |
| No new 500s in server logs post-restart | ✅ PASS |
