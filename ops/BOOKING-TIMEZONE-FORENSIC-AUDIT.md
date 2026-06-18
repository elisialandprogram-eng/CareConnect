# Booking Timezone Forensic Audit

**Date:** 2026-06-18  
**Status:** All critical fixes applied  
**Reporter:** Engineering

---

## Symptom Reported

> Provider in Hungary, Patient in Hungary, booking wizard showed a slot "~10 minutes away",
> but after booking the appointment appeared "~5 hours away."

The 5-hour discrepancy is exactly Hungary CEST (UTC+2) + browser UTC offset (2h) → 4–5h shift when
`users.timezone` was null for the provider and the slot UTC conversion defaulted to UTC.

---

## System Architecture (Relevant Parts)

```
Provider sets availability
  └─ time_slots table: date TEXT, start_time TEXT  (provider wall-clock)
  └─ office_hours: weeklySchedule JSON  (provider wall-clock)

Availability API  (/api/providers/:id/available-slots)
  └─ getProviderTimezone(providerId, providerUserId)
       → users.timezone → office_hours.timezone → *** "UTC" fallback ***
  └─ localToUTC(date, startTime, providerTz)  → slotUtcMs
  └─ past-slot filter uses slotUtcMs  ✓
  └─ Returns slot objects: { date, startTime, endTime, status, … }
       → *** startAtUtc was NEVER returned ***

Booking wizard (book-wizard.tsx)
  └─ Client-side past-slot filter:
       new Date(`${s.date}T${s.startTime}:00`)  ← *** no TZ suffix → browser-local ***

SlotAvailabilityWidget
  └─ Urgency ("9m away") and countdown:
       new Date(`${slot.date}T${slot.startTime}:00`)  ← *** browser-local parse ***

Booking confirmation (booking-confirmation.tsx)
  └─ Calendar exports (Google Cal / ICS):
       formatLocalDateTime → YYYYMMDDTHHMMSS  ← *** floating time, no TZID/Z ***
```

---

## Root Causes

### T1 — CRITICAL: Slot urgency & past-filter use browser-local time parsing

**Files affected:**
- `client/src/components/booking/SlotAvailabilityWidget.tsx` — `getUrgency()`, `minsUntilLabel()`
- `client/src/pages/book-wizard.tsx` — client-side past-slot filter

**Bug:** `new Date("2026-06-18T09:00:00")` has **no timezone suffix** → the browser
interprets it as local browser time. If the provider is in Budapest (CEST = UTC+2) and
the patient's browser reports UTC, the slot "09:00 Budapest" is parsed as "09:00 UTC"
(= 2h in the future instead of in the past). Urgency labels ("9m away", "soon") show
the wrong offset.

**Root:** The server never sent the authoritative UTC instant for the slot, only the
wall-clock string. The frontend had no choice but to parse it naively.

**Fix applied:**
- Availability API now returns `startAtUtc` (ISO UTC string) on every slot object.
- `SlotAvailabilityWidget` added `resolveSlotMs()` helper: prefers `startAtUtc`, falls
  back to browser-local parse for legacy slots.
- `book-wizard.tsx` past-filter uses `s.startAtUtc` when present.

---

### T2 — CRITICAL: Provider timezone defaults to "UTC" when `users.timezone` is null

**File affected:** `server/lib/tzUtils.ts` — `getProviderTimezone()`

**Bug:** Authority chain was: `users.timezone → office_hours.timezone → "UTC"`.
A Hungarian provider who never explicitly set their timezone gets `providerTz = "UTC"`.
When `localToUTC("2026-06-18", "09:00", "UTC")` runs, it produces `09:00Z` (= 11:00
Budapest CEST). The API's past-slot filter is correct in UTC (slots before `Date.now()`
are dropped) but the slot is labelled "09:00" on the screen when it actually starts at
11:00 Budapest — a 2-hour presentation error.

**Root:** No country-code fallback existed. Providers in Hungary or Iran who never
visited Settings → Timezone got silently assigned UTC.

**Fix applied:**
- Added `COUNTRY_TZ` map: `{ HU: "Europe/Budapest", IR: "Asia/Tehran", GB: "Europe/London", … }`.
- Added a third lookup step in `getProviderTimezone`: if both `users.timezone` and
  `office_hours.timezone` are null/empty, query `providers.country_code` and use the map.
- This is a "best-effort inference", not an override — an explicit `users.timezone`
  always wins.

---

### T3 — MEDIUM: Calendar exports use floating local time (no TZID / no Z)

**File affected:** `client/src/pages/booking-confirmation.tsx`

**Bug:** `formatLocalDateTime` produced `YYYYMMDDTHHMMSS` (no Z suffix, no TZID).
iCalendar spec treats such strings as "floating" — the event shifts to whatever the
recipient's local time is. A Hungarian patient exporting the appointment to a calendar
on a device set to UTC would see the event 2 hours early.

**Fix applied:**
- Added `formatUtcForCal(isoUtc)` helper → produces `YYYYMMDDTHHMMSSZ` (UTC).
- Added `formatCalDt(utcIso, date, time)` wrapper: uses UTC if `utcIso` present,
  falls back to floating local for legacy rows without `start_at`/`end_at`.
- `buildGoogleCalendarUrl` and `buildIcsContent` now accept optional `startAtUtc` /
  `endAtUtc` fields.
- Call sites pass `appt.startAt` and `appt.endAt` (populated asynchronously after
  booking; available by the time the patient reaches the confirmation page).

---

### T4 — MINOR: Admin "today" appointments use server-UTC `CURRENT_DATE`

**File:** `server/routes/admin/admin-home.routes.ts`

**Bug:** `start_at::date = CURRENT_DATE` uses the PostgreSQL server's UTC date. An
appointment at 23:30 Budapest (21:30 UTC) is counted as "today" in the server's UTC
day but displayed as "tomorrow" in the Budapest UI. Discrepancy is ≤ 1 appointment
per day per timezone.

**Decision: No fix.** This is an admin dashboard display issue only (not a scheduling
or patient-facing bug). The counter is a rough "today at a glance" stat — exact
boundary alignment with provider timezone is low value, high complexity. Document and
monitor.

---

## Fix Inventory

| # | File | Change | Severity |
|---|------|--------|----------|
| F1 | `server/lib/tzUtils.ts` | Add `COUNTRY_TZ` map + country-code fallback to `getProviderTimezone` | Critical |
| F2 | `server/routes/provider-availability.routes.ts` | Return `startAtUtc` on explicit slot `.map()` | Critical |
| F3 | `server/routes/provider-availability.routes.ts` | Return `startAtUtc` on both synthetic slot `push()` sites | Critical |
| F4 | `client/src/components/booking/SlotAvailabilityWidget.tsx` | Add `startAtUtc` to `WidgetSlot`; add `resolveSlotMs()`; update `getUrgency` + `minsUntilLabel` | Critical |
| F5 | `client/src/pages/book-wizard.tsx` | Add `startAtUtc` to `TimeSlot`; update past-slot filter to prefer `startAtUtc` | Critical |
| F6 | `client/src/pages/booking-confirmation.tsx` | Add `formatUtcForCal` + `formatCalDt`; add `startAtUtc`/`endAtUtc` to calendar builders; pass `appt.startAt`/`appt.endAt` at call sites | Medium |

---

## Regression Matrix

| Scenario | Before | After |
|----------|--------|-------|
| HU provider, HU patient, browser UTC | Slot "09:00" shown as 9h away (browser UTC parse) | Slot shown correctly via `startAtUtc` |
| HU provider with no timezone set | Slots shifted 2h (UTC fallback) | Country-code fallback → Europe/Budapest |
| IR provider with no timezone set | Slots shifted 3.5h (UTC fallback) | Country-code fallback → Asia/Tehran |
| ICS export, HU provider | Floating time (shifts by recipient TZ) | UTC with Z suffix (absolute instant) |
| Google Calendar export | Floating time | UTC with Z suffix |
| Provider with explicit `users.timezone` | Correct | Unchanged (still correct, explicit wins) |
| Legacy appointments (no `start_at`/`end_at`) | Floating calendar time | Falls back to same floating time (no regression) |
| Browser TZ = Provider TZ (common case) | Correct (by coincidence) | Correct (by design, via `startAtUtc`) |

---

## What Was NOT Changed

- `shared/schema.ts` — no schema changes needed.
- `server/routes/appointment.routes.ts` — `start_at` / `end_at` already populated
  fire-and-forget after booking (existing behavior).
- `AppointmentTimeContext.tsx` — fallback from `startAtUtc` to browser-local parse is
  intentional for legacy rows; no change needed.
- Database migrations — no new columns added.

---

## Follow-up Recommendations

1. **Populate `users.timezone` during provider onboarding** — add a timezone selector
   to the Provider Setup form so the country-code fallback is rarely needed.
2. **Backfill `users.timezone`** — for all existing providers where `users.timezone IS
   NULL` and `providers.country_code` is known, run:
   ```sql
   UPDATE users u
   SET timezone = CASE p.country_code
     WHEN 'HU' THEN 'Europe/Budapest'
     WHEN 'IR' THEN 'Asia/Tehran'
   END
   FROM providers p
   WHERE p.user_id = u.id
     AND u.timezone IS NULL
     AND p.country_code IN ('HU', 'IR');
   ```
3. **`end_at` fire-and-forget** — verify `appointments.end_at` is also written
   asynchronously after booking (same place as `start_at` in `appointment.routes.ts`)
   so ICS `DTEND` has a UTC source.
