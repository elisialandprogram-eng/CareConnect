# GoldenLife — Appointment Time Context & Slot Filtering Forensic Audit

**Date:** 2026-06-15  
**Scope:** Sprint Appointment Experience Enhancement — post-implementation forensic audit

---

## 1. Root Cause: Missing / Incorrect Time Context Labels

### Finding
`AppointmentTimeContext` was correctly **imported and rendered** at all five claimed integration points:

| Location | File | Line | Status before fix |
|---|---|---|---|
| Patient appointment cards | `patient-dashboard.tsx` | 527 | ✅ wired — label could be misleading |
| Provider appointment rows | `ProviderAppointmentsTabs.tsx` | 356 | ✅ wired — label could be misleading |
| Provider appointment modal | `ProviderAppointmentsTabs.tsx` | 1007 | ✅ wired — label could be misleading |
| Appointment details header | `appointment-details.tsx` | 425 | ✅ wired — label could be misleading |
| Provider dashboard next-appt banner | `provider-dashboard.tsx` | 1044 | ❌ widget excluded `in_progress` appointments |

### Root Cause A — Logic bug in `getRelativeLabel`
For **non-terminal, non-in-progress** appointments whose start time had **already passed** (e.g. confirmed at 9 AM, viewed at 3 PM), the function returned `"Starting now"` unconditionally — regardless of how many hours or days had elapsed. This made the label appear frozen or wrong.

**Fix applied (`AppointmentTimeContext.tsx`):**
```
Before: if (diffMs <= 0) return "Starting now";
After:  if (diffMs <= 0) {
          if (mins < 5)   return "Starting now";
          if (mins < 60)  return `${mins}m overdue`;
          if (hrs < 24)   return `${hrs}h overdue`;
          return `${days}d overdue`;
        }
```

### Root Cause B — Provider dashboard widget excluded `in_progress` sessions
The "Next appointment" banner filtered to only `["pending","confirmed","approved"]`. When a session was **actively in progress** (`in_progress`), the widget showed nothing at all. The `AppointmentTimeContext` it contained never rendered.

**Fix applied (`provider-dashboard.tsx`):**
- Added `"in_progress"` to the status filter.
- `in_progress` appointments sort to the TOP of the list (float above pending/future).

---

## 2. Root Cause: Past Appointment Slots Visible During Booking

### Finding
Backend slot generation (`/api/providers/:id/available-slots`) correctly filters past slots server-side using a timezone-aware `nowMs` + `noticeMs` comparison. However, **three independent gaps** in the frontend allowed past slots to reach patients:

### Root Cause A — No client-side past-slot safety net
The `availableSlots` filter in `book-wizard.tsx` only removed `isBooked`, `isBlocked`, and `status === "BOOKED"` slots. If the backend returned a past slot for **any reason** (stale server cache, timezone edge-case, NaN fallback in Intl formatting), it appeared to patients as bookable.

**Fix applied (`book-wizard.tsx`):**
```js
// New client-side guard added to availableSlots filter:
const slotMs = new Date(`${s.date}T${s.startTime}:00`).getTime();
if (Number.isFinite(slotMs) && slotMs <= nowMs) return false;
```

### Root Cause B — Slots query used a 60-second stale cache
`book-wizard.tsx` slots query inherited the global `staleTime: 60_000`. During a same-day booking session, the first fetch's response could be served from cache for up to 60 seconds on subsequent renders, including a re-visit to the date picker where time had continued advancing.

**Fix applied (`book-wizard.tsx`):**
```js
staleTime: 0,  // slot data is time-sensitive — always fetch fresh
```

### Root Cause C — Calendar day and "today" strings used UTC date
```js
// Before (wrong for UTC− timezone users near midnight):
return d.toISOString().split("T")[0];
```
For patients in UTC−5 at 11:59 PM local (= 04:59 UTC next day), `toISOString()` returned the NEXT day's date. The booking calendar showed "tomorrow" as today, causing the wrong day's slots to load and potentially showing non-existent same-day slots.

**Fix applied (`book-wizard.tsx`):**
```js
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
```
Both `calendarDays` and `todayStr` now use local wall-clock date.

---

## 3. Additional Defects Found and Fixed

### D1 — Reschedule dialog accepted past dates (AppointmentActionDialog)
The date input for the reschedule/propose action had no `min` attribute, allowing providers or patients to type a past date. The backend might reject it, but the UI allowed it silently.

**Fix:** Added `min={new Date().toISOString().split("T")[0]}` to the date input.

### D2 — Pre-existing TypeScript errors in AppointmentTimeline (JSX unknown type)
`meta: Record<string, unknown>` meant `meta.reason` and `meta.proposedDate` were typed as `unknown`. Using them directly in `{meta.reason && <p>...</p>}` made the `&&` expression evaluate to `unknown` (not `ReactNode`), causing a TS2322 compilation error.

**Fix:** Changed conditions to `!!meta.reason` and `!!meta.proposedDate` (explicit boolean coercion).

---

## 4. Fixes Applied — Summary

| # | File | Fix |
|---|---|---|
| 1 | `AppointmentTimeContext.tsx` | Replace perpetual "Starting now" with tiered overdue labels |
| 2 | `provider-dashboard.tsx` | Include `in_progress` in next-appt widget; sort to top |
| 3 | `book-wizard.tsx` | Add `staleTime: 0` to slots query |
| 4 | `book-wizard.tsx` | Add client-side past-slot filter as safety net |
| 5 | `book-wizard.tsx` | Fix UTC date drift — use local wall-clock for calendar days & todayStr |
| 6 | `AppointmentActionDialog.tsx` | Add `min` date attribute to prevent past-date reschedule input |
| 7 | `AppointmentTimeline.tsx` | Fix pre-existing TS2322 `unknown` type in JSX `&&` conditions |

---

## 5. Validation Results

| Check | Result |
|---|---|
| `npx tsc --noEmit --skipLibCheck` | ✅ 0 errors |
| `npm run build` | ✅ 0 errors, built in 39s |
| Dev server | ✅ Running, HMR applied all changes |
| AppointmentTimeContext renders in all 5 locations | ✅ Confirmed by code audit |
| Past slot client-side filter | ✅ Applied to `availableSlots` in book-wizard |
| Slots staleTime = 0 | ✅ Applied |
| Local date for calendar | ✅ Applied |
| Min date on reschedule input | ✅ Applied |

---

## 6. Remaining Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Backend timezone NaN fallback on exotic provider TZ strings | Low | NaN guard exists at line 202; client-side filter now provides redundant protection |
| Reschedule text-input for start/end time has no min-time enforcement | Low | Backend conflict engine validates and rejects past times server-side |
| Slot staleTime=0 increases server requests for the booking flow | Negligible | Slots query is only enabled when `selectedProvider && selectedDate && step >= 2` |
| Provider in UTC+ extreme zones (>12h) could see minute-level drift | Very Low | Client filter uses `slotMs <= nowMs` (no grace margin) — any truly past slot blocked |

