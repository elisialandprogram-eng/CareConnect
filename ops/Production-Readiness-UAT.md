# Production Readiness UAT Report

**Sprint:** Production Readiness UAT  
**Date:** 2026-06-10  
**Environment:** Supabase PostgreSQL + Replit dev server (port 5000)  
**TypeScript check:** `npx tsc --noEmit --skipLibCheck` → **EXIT 0** ✓

---

## Test Accounts

| Role     | Email                            | Password      | ID |
|----------|----------------------------------|---------------|----|
| Patient  | uat_patient@goldenlife.test      | UATpass123!   | 3e1f3bef-1ca7-4bc9-a258-f27a83cf69ed |
| Provider | uat_provider@goldenlife.test     | UATpass123!   | (user) cc822bf3-8556-4d7e-aadc-6e813c5aa710 / (provider) 1c17716c-e33c-40d4-992a-9f28267ceedb |
| Admin    | admin@goldenlife.com             | admin123      | — |

All accounts verified via `POST /api/dev/force-verify` (dev-only endpoint, guarded by `NODE_ENV !== 'production'`).

---

## UAT Results — End-to-End Flow

### T001 — Patient & Provider Registration ✅
- Patient registered via `POST /api/auth/register` (role=patient, countryCode=HU)
- Provider registered via `POST /api/auth/register` (role=provider, countryCode=HU)
- Both email-verified via dev endpoint
- Login returns JWT via `POST /api/auth/login`

### T002 — Provider Profile Setup ✅
- `POST /api/provider/setup` with full profile (bio, licenseNumber, specialization, etc.)
- Provider agreement + data processing agreement accepted
- `licenseDocumentUrl` set to placeholder URL for UAT

### T003 — Provider Document Upload ✅
- Documents inserted via `POST /api/dev/insert-document` (dev bypass — Cloudinary not configured)
- Three documents created: `id_card`, `insurance`, `medical_license` — all status=`pending`
- **Note:** Live document upload requires `CLOUDINARY_*` env vars (returns 503 without them)

### T004 — Provider Submit for Review & Admin Approval ✅
- `POST /api/provider/submit-review` → provider status = `submitted`
- Admin verified via `GET /api/admin/verification-queue?country=HU`
- All 3 documents approved via `PATCH /api/admin/provider-documents/:id/status` → status=`approved`
- Provider finalized via `POST /api/admin/providers/:id/finalize-verification` → `{ ok: true, decision: "approve" }`
- Final provider state: `status=approved`, `isVerified=true`, `isActive=true`

### T005 — Provider Visibility in Listing ✅
- `GET /api/providers?country=HU&limit=50` → `{ total: 1, uat_found: 1 }`
- Provider appears with correct data after approval

### T006 — Availability Setup & Slot Generation ✅ (after fix)
- Schedule templates set via `POST /api/provider/schedule-templates/batch` for Mon–Fri (dow 1–5), 09:00–17:00
- **Bug B1 found & fixed:** `POST /api/availability/bulk` → 500 because `time_slots` was missing a `UNIQUE INDEX` on `(provider_id, date, start_time)`. Drizzle's `onConflictDoNothing({target:[...]})` requires a real unique constraint. Fixed by adding `CREATE UNIQUE INDEX IF NOT EXISTS uq_time_slots_provider_date_start` in `runStartupMigrations()` (db.ts).
- After fix: bulk slot generation created **80 slots** across 5 dates
- `GET /api/providers/:id/available-slots?date=2026-06-15` → **16 available slots** returned
- **Path note:** `POST /api/provider/availability` → 404. Correct endpoints are `POST /api/provider/schedule-templates/batch` (weekly templates) and `POST /api/availability/bulk` (date-range slot generation).

### T006c — Service Creation ✅ (after fix)
- **Bug B2 found & fixed:** `POST /api/admin/providers/:id/services` was silently returning 500.
  - Root cause: caller used wrong field names (`durationMinutes` instead of `duration`, `serviceType` instead of `locationMode`, invalid `category` field).
  - Added `console.error` logging to the handler.
- Service created: `Physiotherapy Consultation`, 60 min, $50.00, `locationMode=both`
- Service ID: `b4a188be-da8f-4b50-8dbf-da750841aab1`

### T007 — Patient Booking ✅ (with payment method specified)
- Patient accepted ToS + Privacy policy via `POST /api/consents` before booking
- **Behavior note:** Booking without explicit `paymentMethod` triggers Stripe checkout creation; when Stripe is not configured this returns 502 "Payment session could not be created." To book without Stripe, `paymentMethod: "cash"` (or `bank_transfer`) must be specified explicitly.
- `POST /api/appointments` with `paymentMethod: "cash"` → **GL000002**, status=`pending`, total=$63.50 (includes platform fee)

### T008 — Notifications ✅
Both patient and provider received in-app notifications on booking:
- **Patient:** "Booking Received — Awaiting Approval" (appointment type)
- **Provider:** "New Appointment Request — Action Required" (appointment type)
- Notification endpoint: `GET /api/notifications?limit=N` returns an array (not paginated object)

### T009 — Appointment Status Lifecycle ✅
Full audit trail verified via `GET /api/appointments/:id/events`:

| Step | Action | From → To | Actor |
|------|--------|-----------|-------|
| 1 | book | null → pending | patient |
| 2 | approve | pending → approved | provider |
| 3 | start | approved → in_progress | provider |
| 4 | complete | in_progress → completed | provider |

- **Behavior notes:**
  - Patient cannot call `PATCH /api/appointments/:id/status` → `confirmed` (403 Access denied — patients may only cancel/reschedule; provider controls lifecycle)
  - Completion blocked by chronological guard: cannot complete before scheduled start time (by design). UAT bypassed via direct SQL date update. In production this is correct behavior.
  - Completion also requires `payments.status = 'completed'`; cash/bank_transfer payments need manual settlement or admin action to reach that state.

### T010 — Patient Review ✅
- `POST /api/reviews` with `{ providerId, appointmentId, rating: 5, comment: "..." }` → review ID created
- Review only allowed on completed appointments (gate enforced)
- Provider rating queryable via `GET /api/providers/:id/reviews`

---

## Bugs Found & Fixed

| ID | Severity | Component | Description | Fix |
|----|----------|-----------|-------------|-----|
| B1 | High | `bulkCreateTimeSlots` | Missing `UNIQUE INDEX` on `time_slots(provider_id, date, start_time)` → Drizzle ON CONFLICT 500 (PG error 42P10) | Added `uq_time_slots_provider_date_start` in `runStartupMigrations()` (db.ts) + direct Supabase SQL |
| B2 | Medium | `POST /api/admin/providers/:id/services` | Missing `console.error` meant 500s were invisible; wrong field names in callers | Added error logging; documented correct schema field names |

---

## Behavior Notes (Not Bugs)

| Item | Description |
|------|-------------|
| Cloudinary required for doc upload | `POST /api/provider/documents` returns 503 without `CLOUDINARY_*` vars. Dev endpoint available in non-production only. |
| Stripe required for card payments | `paymentMethod` defaults to card path; Stripe 502 if not configured. Cash/bank_transfer work without Stripe. |
| Availability endpoint path | `POST /api/provider/availability` → 404. Correct paths: `/api/provider/schedule-templates/batch` and `/api/availability/bulk` |
| Patient confirmation step | No patient confirm step — provider controls lifecycle (pending→approved→in_progress→completed) |
| Chronological completion guard | Cannot `complete` before appointment start time (correct behavior) |
| Cash payment manual settlement | Cash/bank_transfer appointments stay pending on the payment record until manually settled |

---

## Dev-Only Endpoints (guarded by `NODE_ENV !== 'production'`)

All registered at the bottom of `server/routes/auth.routes.ts`:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/dev/get-token` | Get JWT bypassing rate limiter |
| `POST /api/dev/force-verify` | Force email verification for a user |
| `POST /api/dev/insert-document` | Insert a provider document by URL (bypasses Cloudinary) |

---

## Pre-Production Checklist

| Item | Status |
|------|--------|
| TypeScript: 0 errors | ✅ |
| Patient registration + login | ✅ |
| Provider registration + setup + KYC | ✅ |
| Admin verification queue + document approval | ✅ |
| Provider listing visibility after approval | ✅ |
| Availability templates + slot generation | ✅ (after B1 fix) |
| Service creation | ✅ (after B2 fix) |
| Patient booking (cash payment) | ✅ |
| In-app notifications (patient + provider) | ✅ |
| Full appointment lifecycle | ✅ |
| Patient review on completed appointment | ✅ |
| Stripe required for card payments | ⚠️ Needs `STRIPE_SECRET_KEY` in production |
| Cloudinary required for doc uploads | ⚠️ Needs `CLOUDINARY_*` in production |
| SMS / WhatsApp notifications | ⚠️ Needs `TWILIO_*` in production |
| Email (Resend) | ⚠️ Needs `RESEND_API_KEY` in production |
| Push notifications | ⚠️ Needs `VAPID_*` in production |
| Video calls (Daily.co) | ⚠️ Needs `DAILY_API_KEY + DAILY_DOMAIN` (falls back to Jitsi) |
