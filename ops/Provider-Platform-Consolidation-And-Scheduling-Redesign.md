# Provider Platform Consolidation & Scheduling Redesign

**Date:** 2026-06-10  
**Sprint:** Verification Consolidation + Smart Scheduler  

---

## Summary

Two-part platform improvement:

1. **Verification System Consolidation** — normalised document types, added Business License slot, made insurance non-blocking everywhere.
2. **Provider Availability & Smart Scheduling Redesign** — replaced seven scattered availability components with a single `SmartScheduler` component featuring quick templates, bulk apply, multi-modality scheduling, break management, time-off with categories, and scheduling insights.

---

## Part 1 — Verification System Fixes

### Changes Made

| File | Change |
|------|--------|
| `client/src/components/provider/dashboard/ProviderKYC.tsx` | Added `business_license` document slot (optional) between `address_proof` and `insurance` |
| `client/src/components/provider-verification-tracker.tsx` | Renamed `business_registration` → `business_license` in `DOCUMENT_SLOTS`; added backwards-compatible alias lookup in `documentStatus()` |
| `server/db.ts` | Added two startup migrations: (1) rename `business_registration` → `business_license` in `provider_documents`, (2) `ALTER TABLE provider_schedule_templates ADD COLUMN IF NOT EXISTS modality TEXT DEFAULT NULL` |

### Document Type Canonical Set (post-fix)

| Type | Required for Approval | Notes |
|------|----------------------|-------|
| `id_card` | ✅ Yes | Government ID / Passport |
| `medical_license` | ✅ Yes | Professional licence |
| `address_proof` | ✅ Yes | Recent proof of address |
| `business_license` | ❌ No (optional) | Business entity registration; replaces legacy `business_registration` key |
| `insurance` | ❌ No (optional) | Malpractice / liability insurance |
| `police_clearance` | ❌ No (informational) | Police clearance certificate |

### Data Repair

Legacy `business_registration` document type records are automatically renamed to `business_license` on the next server boot via `runStartupMigrations()`. Idempotent — runs as `UPDATE ... WHERE document_type = 'business_registration'` (no-op after first run).

The `documentStatus()` helper in the verification tracker also accepts `business_registration` as an alias for `business_license` during the transition period.

### Insurance — Non-Blocking Confirmed

`server/lib/verification.ts`:  
`MANDATORY_DOC_TYPES = ["id_card", "address_proof", "medical_license"]`  
Insurance is **not** in this array and has never been required for `documents_verified` status. Confirmed correct.

---

## Part 2 — Smart Scheduling Redesign

### New Component

**`client/src/components/provider/SmartScheduler.tsx`** (~570 lines)

Replaces all of the following in the provider dashboard Availability tab:
- `RecurringTemplateWizard`
- `BulkVacationBlockout`
- `ProviderOfficeHoursCard` (+ bulk availability mutation)
- `ProviderTimeOffCard`
- `AvailabilityExceptionsCard` (still used — re-embedded in Time Off tab)
- `CancellationPolicyCard` (re-embedded in Settings tab)
- `WorkloadControlsCard` (re-embedded in Settings tab)

### SmartScheduler Tabs

#### Schedule Tab
- **Modality Selector** — pill tabs: All Appointments | Clinic Visits | Home Visits | Video Consults. Each modality stores separate template rows via the new `modality` column.
- **Quick Templates** — 5 one-click presets (Mon–Fri 9–5, Mon–Sat 9–5, Mon–Fri 8–4, Weekends Only, Evenings). Instantly populates the weekly grid and prompts save.
- **Bulk Apply** — collapsible panel. Select any combination of days via toggle chips, set shared start/end time, press "Apply" to patch those days in the matrix.
- **Weekly Schedule Grid** — Mon-first, mobile-friendly rows. Each day: on/off toggle + multiple time windows (= implied breaks). "Add break" button adds a second window. No `min-w` overflow.
- **Save Schedule** button — sends `POST /api/provider/schedule-templates/batch` for enabled days, `DELETE /api/provider/schedule-templates/day/:dow?modality=:m` for disabled days. Dirty-day tracking prevents unnecessary API calls.

#### Time Off Tab
- **Add Time Block** form — date range + reason category dropdown (Vacation, Training, Conference, Public Holiday, Sick Leave, Emergency, Personal, Other). Calls `POST /api/provider/time-off`.
- Block list with category badges and delete buttons.
- `AvailabilityExceptionsCard` for single-day exceptions.

#### Settings Tab
- **Slot Settings** — Slot Duration (15/20/30/45/60 min), Buffer Before (0–15 min), Buffer After (0–15 min). Defaults applied to new schedule windows.
- `CancellationPolicyCard` — unchanged.
- `WorkloadControlsCard` — unchanged.

#### Insights Tab
- Stats cards: Active Days/Week, Scheduled Hours/Week, Utilisation %, Available Slots.
- Day-by-day utilisation bars from `/api/provider/week-slots-summary`. Falls back to configuration-based view (hours per day) when no booking data exists yet.

### Backend Changes

#### New API: `POST /api/provider/schedule-templates/batch`
```
Body: {
  dayOfWeek: 0–6,
  modality?: "clinic" | "home_visit" | "video" | null,
  windows: [{ startTime, endTime, slotDurationMins?, bufferBeforeMins?, bufferAfterMins? }]
}
```
- Atomically clears all existing templates for `provider + day + modality` (transaction).
- Inserts all windows in one round-trip.
- Fire-and-forgets `regenerateSlotsForDayOfWeek` for each window.
- Registered **before** `/:id` and `day/:dow` routes (Express first-match safe).

#### Updated: `GET /api/provider/schedule-templates`
Added `?modality=all|none|clinic|home_visit|video` query param:
- `all` (default, omitted) → returns all templates regardless of modality
- `none` → returns only rows where `modality IS NULL`
- named modality → `WHERE modality = $2`

#### Updated: `DELETE /api/provider/schedule-templates/day/:dow`
Added `?modality=` query param with same semantics. Backward-compatible: omitting `?modality` deletes all templates for that day.

#### DB Migration
```sql
ALTER TABLE provider_schedule_templates ADD COLUMN IF NOT EXISTS modality TEXT DEFAULT NULL;
```
Runs via `runStartupMigrations()` on every boot (idempotent `IF NOT EXISTS`).

### Dashboard Changes

`client/src/pages/provider-dashboard.tsx`:
- Removed imports: `ProviderOfficeHoursCard`, `ProviderTimeOffCard`, `AvailabilityExceptionsCard`, `CancellationPolicyCard`, `WorkloadControlsCard`, `RecurringTemplateWizard`, `BulkVacationBlockout`
- Removed: `bulkAvailabilityMutation` (now handled inside SmartScheduler)
- Added import: `SmartScheduler`
- Availability tab: `<SmartScheduler provider={providerData} />`

### Mobile Improvements
- Weekly grid rows use flex-wrap with `w-28` time inputs — no horizontal overflow.
- Quick template row uses `overflow-x-auto` for small screens.
- Modality selector uses `flex-wrap` pill layout.

---

## Testing Checklist

| Area | Status |
|------|--------|
| Business License slot visible in KYC upload panel | ✅ |
| Insurance NOT blocking approval | ✅ (not in MANDATORY_DOC_TYPES) |
| Verification tracker shows business_license (not business_registration) | ✅ |
| Legacy business_registration docs renamed on boot | ✅ (startup migration) |
| SmartScheduler renders on Availability tab | ✅ |
| Quick template applies to weekly grid | ✅ |
| Bulk apply updates selected days | ✅ |
| Add break (second window) per day | ✅ |
| Save calls batch endpoint | ✅ |
| Time Off add with category dropdown | ✅ |
| Settings tab shows slot/buffer controls | ✅ |
| Insights tab shows stats | ✅ |
| Modality tabs switch between null/clinic/home_visit/video | ✅ |
| Mobile layout without horizontal overflow | ✅ |

---

## Files Changed

```
server/db.ts                                           (+30 lines)
server/routes/provider.routes.ts                       (+80 lines)
server/lib/verification.ts                             (no change)
client/src/components/provider/dashboard/ProviderKYC.tsx     (+8 lines)
client/src/components/provider-verification-tracker.tsx      (+4 lines)
client/src/components/provider/SmartScheduler.tsx            (NEW ~570 lines)
client/src/pages/provider-dashboard.tsx                      (-20 / +2 lines)
ops/Provider-Platform-Consolidation-And-Scheduling-Redesign.md (NEW)
```
