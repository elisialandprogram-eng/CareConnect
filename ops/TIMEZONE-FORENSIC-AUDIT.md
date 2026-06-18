# GoldenLife — Global Timezone & International Scheduling Forensic Audit

**Audit Date:** June 15, 2026  
**Scope:** Full platform — database, server, scheduling, reminders, countdowns, display  
**Development Location:** India (Asia/Kolkata, UTC+5:30)  
**Target Markets:** Hungary, UK, USA, Middle East, Australia, Asia  

---

## Executive Summary

GoldenLife stores appointment date and time as plain text strings (`"2026-06-15"` and `"09:00"`) with no timezone information attached. Every decision the platform makes — which slots are in the future, when to fire reminders, what countdown to show — is then made by comparing that bare string to `new Date()`, `Date.now()`, or `getHours()` in whatever timezone happens to be running at that moment (server or browser). The result is a system that appears correct during same-timezone development but contains multiple time-critical bugs that surface the moment a provider and patient are in different timezones.

---

## Section 1 — Database Time Storage Analysis

### 1.1 Core Appointment Fields

| Column | Table | Drizzle Type | PostgreSQL Type | Format Stored | TZ-Aware? |
|---|---|---|---|---|---|
| `date` | `appointments` | `text` | `TEXT` | `"2026-06-15"` | ❌ No |
| `start_time` | `appointments` | `text` | `TEXT` | `"09:00"` | ❌ No |
| `end_time` | `appointments` | `text` | `TEXT` | `"10:00"` | ❌ No |
| `created_at` | `appointments` | `timestamp` | `TIMESTAMP WITHOUT TIME ZONE` | UTC (server default) | ⚠️ Implicit only |
| `updated_at` | `appointments` | `timestamp` | `TIMESTAMP WITHOUT TIME ZONE` | UTC (server default) | ⚠️ Implicit only |
| `cancelled_at` | `appointments` | `timestamp` | `TIMESTAMP WITHOUT TIME ZONE` | Server NOW() | ⚠️ Implicit only |

### 1.2 Slot Tables

| Column | Table | Type | TZ-Aware? | Notes |
|---|---|---|---|---|
| `date` | `time_slots` | `TEXT` | ❌ No | Plain date string |
| `start_time` | `time_slots` | `TEXT` | ❌ No | "HH:MM" wall clock |
| `end_time` | `time_slots` | `TEXT` | ❌ No | "HH:MM" wall clock |
| `date` | `availability_exceptions` | `TEXT` | ❌ No | Plain date |
| `start_time` | `appointment_slot_holds` | `TEXT` | ❌ No | |
| `end_time` | `appointment_slot_holds` | `TEXT` | ❌ No | |
| `expires_at` | `appointment_slot_holds` | `TIMESTAMP` | ⚠️ Implicit | Server time |

### 1.3 Provider Block Fields

| Column | Table | Type | TZ-Aware? | Notes |
|---|---|---|---|---|
| `start_datetime` | `provider_blocks` | `TIMESTAMP WITHOUT TIME ZONE` | ❌ No | Critical — stored without TZ |
| `end_datetime` | `provider_blocks` | `TIMESTAMP WITHOUT TIME ZONE` | ❌ No | Critical — stored without TZ |

### 1.4 Scheduling Tables

| Column | Table | Type | TZ-Aware? |
|---|---|---|---|
| `start_time` | `group_sessions` | `TIMESTAMP WITHOUT TIME ZONE` | ❌ No |
| `end_time` | `group_sessions` | `TIMESTAMP WITHOUT TIME ZONE` | ❌ No |
| `start_date` | `provider_time_off` | `TEXT` | ❌ No |
| `end_date` | `provider_time_off` | `TEXT` | ❌ No |

### 1.5 Financial & Audit Timestamps

All `created_at`, `paid_at`, `sent_at`, `resolved_at`, `paidAt`, `activatedAt`, `expiresAt` columns across `payments`, `wallet_transactions`, `provider_ledger`, `provider_earnings`, `audit_logs`, `notification_delivery_logs` use Drizzle `timestamp()` which maps to PostgreSQL `TIMESTAMP WITHOUT TIME ZONE`. They are populated by `NOW()` or `new Date()` from the server, so they are effectively UTC if the server runs in UTC — but the type itself carries no guarantee.

### 1.6 Key Finding

> There are **no** `TIMESTAMPTZ` (`TIMESTAMP WITH TIME ZONE`) columns anywhere in the appointment scheduling path. The platform's core time data — date, start_time, end_time — is stored as dumb text with no timezone attached. The schema comments acknowledge two `startAt`/`endAt` TIMESTAMPTZ columns that were added to the database via migration but deliberately **excluded** from the Drizzle model "until confirmed live in Supabase". These columns are not used anywhere in the application today.

**Example — What gets stored when a Budapest provider sets 09:00:**

```
appointments.date       = "2026-06-15"   (TEXT)
appointments.start_time = "09:00"        (TEXT)
```

There is no record that this "09:00" means `09:00 Europe/Budapest` (= 07:00 UTC). The system cannot distinguish it from `09:00 UTC` or `09:00 Asia/Kolkata`.

---

## Section 2 — Provider Timezone Analysis

### 2.1 Where Is It Stored?

Provider timezone exists in **three separate locations** that can hold different values:

| Location | Column | Default | Written By |
|---|---|---|---|
| `provider_office_hours` table | `timezone TEXT` | `"UTC"` | Provider schedule settings route (`PATCH /api/provider/schedule`) |
| `users` table | `timezone TEXT` | `NULL` | Provider setup form (writes here, not to providerOfficeHours) |
| `providers` table | `timezone TEXT` | — | Legacy column; setup route is noted as deprecated |

**The setup form writes to `users.timezone`** (per comment in `server/routes/provider.routes.ts` line 2332-2335):
```typescript
// If a timezone was submitted via the setup form, store it on the user
// row (single authority) rather than on providers.timezone (deprecated).
if (providerData.timezone !== undefined) {
  await storage.updateUser(userId, { timezone: providerData.timezone });
}
```

The schedule admin route writes to `provider_office_hours.timezone`.

### 2.2 Which Source Does the Slot Engine Read?

```typescript
// server/routes/provider-availability.routes.ts, line 176
const providerTz: string = (provider as any).timezone || "UTC";
```

`provider` here is the result of `storage.getProvider(req.params.id)`, which reads from the `providers` table — **the deprecated column**, not `users.timezone` or `provider_office_hours.timezone`.

**Result:** A provider who sets their timezone via the setup form updates `users.timezone`. The slot engine reads `providers.timezone`. These are different rows in different tables. The slot engine silently falls back to `"UTC"` if `providers.timezone` is null.

### 2.3 Is Timezone Editable?

Yes — via:
1. Provider setup form → writes to `users.timezone`
2. Provider schedule settings → writes to `provider_office_hours.timezone`
3. Settings page → calls `PATCH /api/auth/profile` with `{ timezone }` → writes to `users.timezone`

### 2.4 Is Timezone Used Correctly During Scheduling?

Partially. The slot engine makes a timezone-aware "now" adjustment (described in Section 4), but it reads from the wrong column. The reminder cron ignores provider timezone entirely.

---

## Section 3 — Patient Timezone Analysis

### 3.1 Where Is It Stored?

| Location | Source | Updated By |
|---|---|---|
| `users.timezone` | Database | Settings page PATCH /api/auth/profile |
| `localStorage["userTimezone"]` | Browser | `setUserTimezone()` in `client/src/lib/datetime.ts` |

### 3.2 How Is It Detected?

```typescript
// client/src/lib/datetime.ts
export function getUserTimezone(): string {
  const stored = window.localStorage.getItem("userTimezone");
  if (stored) return stored;
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
```

On first visit, the browser's `Intl.DateTimeFormat` auto-detects timezone from the OS. If the user sets a timezone in Settings, it overrides localStorage.

### 3.3 How Is It Used?

- `formatDate()`, `formatTime()`, `formatDateTime()` in `datetime.ts` pass `getUserTimezone()` as the `timeZone` option to `Intl.DateTimeFormat`. These are used in many display components.
- The **patient's timezone is not sent to the server** at booking time. The server never knows what timezone the patient was in when they booked.
- Patient timezone is **not stored on the appointment record**.

### 3.4 Risk

Patient timezone is purely cosmetic display logic. It does not affect what is stored, what slots are shown, or when reminders fire.

---

## Section 4 — Slot Generation Analysis

### 4.1 Two Paths

**Path A — Explicit Slots (pre-generated from templates or manual entry):**
Slots exist in the `time_slots` table as TEXT date + TEXT time pairs.

**Path B — Synthetic Slots (generated on-the-fly from office hours):**
Built by walking `provider_office_hours.weeklySchedule` start→end in 30-minute steps.

Both paths share the same "past slot" filter.

### 4.2 The "Past Slot" Filter — Detailed Code Trace

```typescript
// Phase 7 — Timezone-aware "now"
const providerTz: string = (provider as any).timezone || "UTC";
let nowMs = Date.now();

// Gets provider's local wall clock as a formatted string
const refDate = new Date();
const tzFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: providerTz,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hour12: false,
});
const parts = Object.fromEntries(tzFormatter.formatToParts(refDate).map(p => [p.type, p.value]));
const providerLocalIso = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;

// Treats provider's local time string as if it were UTC
const providerLocalMs = new Date(providerLocalIso).getTime();

// Computes "how far is provider local from UTC"
const tzDriftMs = refDate.getTime() - providerLocalMs;

// Adjusts nowMs by that drift
nowMs = Date.now() - tzDriftMs;
```

Then the slot comparison:
```typescript
const slotMs = new Date(`${date}T${startTime}:00`).getTime();
if (slotMs <= nowMs + noticeMs) return false;  // filter past slots
```

### 4.3 The Core Bug in Phase 7

`new Date("2026-06-15T09:00:00")` **without a Z or offset** is parsed by Node.js as the **server's local time**, not as UTC.

The adjustment builds `nowMs` in provider-local "pseudo-UTC" (subtracting the offset). But `slotMs` is built from `"YYYY-MM-DDTHH:MM:00"` which Node.js parses as server local.

**If server is in UTC** (as Replit's containers typically are):
- `slotMs` = "09:00 UTC"
- `nowMs` = server UTC adjusted to provider TZ offset → correctly represents "what UTC instant corresponds to 09:00 provider-local"
- This works IF server = UTC

**If server were in IST (Asia/Kolkata, UTC+5:30):**
- `slotMs` = "09:00 IST" = 03:30 UTC
- `nowMs` = UTC adjusted by provider offset → represents provider-local "now"
- Comparison is wrong: "03:30 UTC" vs "provider-local-now-UTC-equivalent"

**Current state:** Replit servers run in UTC. The system works for past-slot filtering today, but only because the server happens to be UTC. This is an implicit assumption baked into the code, not a design guarantee.

### 4.4 The Day-of-Week Bug in Rolling Schedule

```typescript
// server/cron/rolling-schedule.ts
const today = new Date();
today.setHours(0, 0, 0, 0);   // Server's local midnight
const horizon = addDays(today, 90);

const dow = d.getDay();   // Server's local day-of-week
```

This uses the **server's local date** to determine what "today" is and which day of the week each date falls on. If the server is in UTC and a provider is in UTC+11 (Sydney), at 11:30 PM UTC on June 15 the cron believes it is still June 15 (Monday) but for the provider it is already June 16 (Tuesday). Slots for Tuesday would be one day late.

### 4.5 Scenario: Budapest Provider (UTC+2 summer), Patient in India

Provider sets availability: `{ tue: { start: "09:00", end: "17:00", enabled: true } }`

Server (UTC) at 18:00 UTC = 23:30 IST, 20:00 Budapest time.

Patient in India requests slots for June 16 (Tuesday Budapest).

1. `date` param = `"2026-06-16"` (passed by browser)
2. `providerTz` = falls back to `"UTC"` (providers.timezone is NULL)
3. `nowMs` = Date.now() (no adjustment, TZ unknown → UTC default)
4. `slotMs = new Date("2026-06-16T09:00:00").getTime()` = Jun 16 09:00 UTC
5. `nowMs` = Jun 15 18:00 UTC
6. `slotMs > nowMs` → slot passes filter ✓
7. But slot represents 09:00 Budapest on Jun 16 = **07:00 UTC** on Jun 16
8. Server "09:00 UTC" does not equal "07:00 UTC" — the slot time is being mis-represented

The slot passes the filter correctly because the day is in the future, but the comparison is conceptually wrong. On a day where the provider has morning slots (e.g., 07:00-08:00 Budapest time = 05:00-06:00 UTC), those slots could be incorrectly filtered as "past" if the server UTC time is after 05:00 UTC even though it is before 07:00 Budapest time.

---

## Section 5 — Past-Slot Filtering Analysis (All Contexts)

### 5.1 Slot Availability Route (server)
- Described in Section 4. Works today because server = UTC. Fragile assumption.

### 5.2 Booking Creation Route (server)
```typescript
// server/routes/appointment.routes.ts
const slotDate = new Date(`${date}T${startTime || "00:00"}:00`);
if (slotDate.getTime() < Date.now() - 60_000) {
  return res.status(400).json({ message: "Cannot book appointments in the past." });
}
```
Same bug: `new Date("2026-06-15T09:00:00")` parsed as server local (UTC). For a Budapest provider's 09:00 slot the comparison is "is 09:00 UTC in the past?" not "is 09:00 Budapest in the past?" 

**Impact:** A Budapest 09:00 slot = 07:00 UTC. If a patient tries to book at 08:30 UTC (10:30 Budapest), the check sees `slotDate` = 09:00 UTC, `Date.now()` = 08:30 UTC → "09:00 UTC is in the future" → booking allowed. The slot was in the past from the provider's perspective.

### 5.3 AppointmentTimeContext (browser countdown)
```typescript
const apptDate = new Date(`${date.slice(0, 10)}T00:00:00`);
apptDate.setHours(h, m, 0, 0);
const diffMs = apptDate.getTime() - now.getTime();
```
Creates a Date object at `"2026-06-15T00:00:00"` **in browser local timezone**, then sets hours. For an Indian patient (IST):
- "2026-06-15T00:00:00" → June 15 00:00 IST
- `.setHours(9, 0)` → June 15 09:00 IST

This means the countdown treats stored "09:00" as 09:00 in the **viewer's** browser timezone, not the provider's timezone. If the appointment is at 09:00 Budapest (= 12:30 IST), an Indian patient's countdown will be off by 3.5 hours — it will show "Starts in X" as if the appointment is at 12:30 IST (correct) only if the display says "12:30", but the countdown calculation treats the stored "09:00" as 09:00 IST (wrong by 3.5 hours).

**The countdown is wrong for cross-timezone appointments.** It is only correct when viewer and provider are in the same timezone.

### 5.4 AppointmentTimingCard (browser card)
Same construction as AppointmentTimeContext. Same bug.

---

## Section 6 — Booking Lifecycle Analysis

### 6.1 Full Trace: Patient in India books Budapest provider at 09:00 on June 16

**Step 1 — Patient opens book-wizard**
- Frontend sends `GET /api/providers/:id/available-slots?date=2026-06-16`
- Server computes slots from office hours using server UTC time
- If server is UTC, "past" filter treats stored "09:00" as UTC → behaves correctly for a future date

**Step 2 — Slot displayed to patient**
- `booking-canvas.tsx` shows `slot.startTime` ("09:00") as-is, no timezone conversion
- Patient in India sees "09:00" but no timezone label attached
- Patient does not know this is Budapest time

**Step 3 — POST /api/appointments** 
- Body: `{ date: "2026-06-16", startTime: "09:00", endTime: "10:00", ... }`
- Server stores exactly as received: `date=TEXT("2026-06-16"), start_time=TEXT("09:00"), end_time=TEXT("10:00")`
- No timezone recorded on the appointment row
- `cancelled_at`, `created_at`, `updated_at` use `new Date()` → UTC server time ✓

**Step 4 — Confirmation page**
```typescript
// booking-confirmation.tsx
return formatDate(`${appt.date}T12:00:00`, { ... });
```
Creates an artificial midday timestamp, passes to `formatDate()` which uses `getUserTimezone()` (patient's browser TZ). For IST patient: "2026-06-16T12:00:00" → treated as 12:00 IST → formats as "Jun 16, 2026" ✓ (date is correct, time is irrelevant here as only date is displayed)

**Step 5 — Patient dashboard display**
```typescript
// patient-dashboard.tsx
const target = new Date(`${dateStr}T${nextAppointment.startTime || "00:00"}:00`);
const diffMs = target.getTime() - Date.now();
```
Same bug as Step 3.3. Countdown calculates "09:00 IST" – now, but appointment is at "09:00 Budapest" = "12:30 IST". Countdown is 3.5 hours ahead of reality for this patient.

**Step 6 — What is stored vs what should be stored**

| Field | Stored | Should Be |
|---|---|---|
| `date` | `"2026-06-16"` | `"2026-06-16"` |
| `start_time` | `"09:00"` | `"09:00"` (provider wall clock) |
| Provider timezone | — (nothing) | `"Europe/Budapest"` |
| Absolute UTC start | — (nothing) | `"2026-06-16T07:00:00Z"` |

---

## Section 7 — Reschedule Analysis

### 7.1 Reschedule Proposal Flow

The reschedule proposal stores new time in `appointment_events` metadata only (no DB column change). On accept, the appointment's `date`, `start_time`, `end_time` are updated.

```typescript
// appointmentActions.ts (reschedule accept)
const apptStartMs = new Date(`${existing.date}T${existing.startTime}:00`).getTime();
if (Date.now() < apptStartMs) { ... }
```

Same pattern — `new Date("YYYY-DDTHH:MM:00")` without timezone → server local (UTC). For a future date this passes correctly; for a same-day reschedule the check is ±14h wrong depending on TZs involved.

### 7.2 Reschedule Notifications

Notifications include `date: appt.date, time: appt.startTime` as plain strings. No timezone label. A patient in India who gets a WhatsApp message saying "your appointment is rescheduled to June 16 at 09:00" has no way to know if "09:00" is local to them or local to the provider.

---

## Section 8 — Reminder Analysis

### 8.1 The windowAheadMinutes Function — Critical Bug

```typescript
function isoDate(d: Date) { return d.toISOString().slice(0, 10); }  // UTC date
function hhmm(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  // ^ .getHours() is SERVER LOCAL TIME
}

function windowAheadMinutes(minutes: number, span: number = 5): ReminderWindow {
  const target = new Date(Date.now() + minutes * 60 * 1000);
  const start = new Date(target.getTime() - (span / 2) * 60 * 1000);
  const end = new Date(target.getTime() + (span / 2) * 60 * 1000);
  return { date: isoDate(target), startMin: hhmm(start), endMin: hhmm(end) };
}
```

`isoDate()` extracts the **UTC date** via `.toISOString()`.
`hhmm()` extracts the **server local hours and minutes** via `.getHours()`.

**If server is UTC:** both are UTC → consistent ✓
**If server were in IST (+5:30):** `isoDate` returns the UTC date (possibly a different calendar day), while `hhmm` returns the IST time → the `date` and `startMin/endMin` fields refer to different points in time.

The query then does:
```sql
WHERE date = $win.date
  AND start_time >= $win.startMin
  AND start_time <= $win.endMin
```

Since `appointments.date` and `appointments.start_time` store provider wall-clock time, and the cron window is built from UTC/server-local values, the cron will query **the wrong date or wrong time window** when the server is not in UTC, or when appointment times cross midnight UTC.

**Currently:** Replit servers are UTC → this works. But it is a latent bug — one server migration or time change exposes it.

### 8.2 Reminder Times Are Not Localized

The reminder fires when `"target date and time"` matches the window — but "target date and time" is UTC (server). The appointment's `date` and `start_time` are provider wall-clock values. If a Budapest provider has an appointment at 09:00 local (07:00 UTC), the 24h reminder fires when the UTC clock shows 07:00 the day before — which is 09:00 Budapest the day before. This is actually correct in UTC-only terms, but only because both "UTC clock matches stored time" when server = UTC.

For a Sydney provider (UTC+10): appointment at 09:00 AEST = 23:00 UTC the prior day. The reminder for "09:00 next day AEST" would fire when the UTC clock hits 09:00 the day of the calendar date — which is 19:00 AEST, 10 hours late.

### 8.3 Post-Visit Reminder

```typescript
const now = new Date();
const lookFrom = new Date(now.getTime() - 75 * 60 * 1000);
const lookTo = new Date(now.getTime() - 60 * 60 * 1000);
if (isoDate(lookFrom) !== isoDate(lookTo)) return 0;  // skip midnight UTC crossings
const win = { date: isoDate(lookFrom), startMin: hhmm(lookFrom), endMin: hhmm(lookTo) };
```

Same UTC/local mismatch. Additionally, the `if (isoDate(lookFrom) !== isoDate(lookTo)) return 0` guard means **no post-visit reminders are sent when the 60–75 minute window crosses UTC midnight**. For a Sydney provider whose appointments end around 23:00-01:00 local time, this guard fires on many nights.

---

## Section 9 — Countdown Analysis

### 9.1 AppointmentTimeContext

```typescript
const apptDate = new Date(`${date.slice(0, 10)}T00:00:00`);
apptDate.setHours(h, m, 0, 0);
const now = new Date();
const diffMs = apptDate.getTime() - now.getTime();
```

The `new Date("YYYY-MM-DDT00:00:00")` without a Z is parsed as **browser local time**. Then `.setHours(h, m)` sets browser-local hours. `now` is also browser time. So the countdown is entirely in the browser's timezone.

For a patient in India viewing a Budapest appointment at "09:00":
- Browser interprets "09:00" as 09:00 IST (since browser = IST)
- Real appointment is 09:00 Budapest = 12:30 IST
- Countdown shows "Starts in X" based on 09:00 IST — **3h 30m wrong**
- When the browser clock hits 09:00 IST, countdown shows "Now" — 3.5 hours before the actual appointment

### 9.2 AppointmentTimingCard

Uses the identical `msUntil()` function. Same bug.

### 9.3 "Current Time" Display

```typescript
function localTimeStr(): string {
  const n = new Date();
  const h = String(n.getHours()).padStart(2, "0");
  const m = String(n.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
```

This shows the browser's current local time. This is **correct** — it shows the user's own current time.

### 9.4 Provider Dashboard "Today" Calculation

```typescript
// provider-dashboard.tsx
const userTz = (user as any)?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: userTz }).format(new Date());
```

This correctly uses the provider's stored timezone to compute "today" for the provider's dashboard. This is **correct**.

---

## Section 10 — International Scenario Testing

### Scenario A: Provider Budapest (UTC+2 summer), Patient India (IST UTC+5:30)

**Slot Visibility:**
Provider sets availability 09:00–17:00. Server generates slots "09:00", "09:30", ... "16:30". Patient in India sees these labeled as times, with no indication they are Budapest times. Past-slot filtering (server UTC) works correctly for future dates.

**Booking:**
Patient books "09:00" (Budapest) = 12:30 IST. Booking stored as `date="2026-06-16", start_time="09:00"`. No TZ recorded.

**Display after booking:**
Patient's confirmation page and dashboard show "09:00". Patient thinks appointment is at 09:00 IST. Actual appointment is at 12:30 IST. **Patient misses appointment or arrives 3.5h early.**

**Countdown:**
Shows countdown to 09:00 IST, not 12:30 IST. Wrong by 3.5 hours.

**Reminder:**
24h reminder fires based on UTC server. 09:00 Budapest = 07:00 UTC. Server fires reminder "24h before 07:00 UTC" = 07:00 UTC the day before = 12:30 IST the day before. Patient receives reminder correctly timed from server perspective, but notification says "Your appointment is tomorrow at 09:00" — no timezone. Patient interprets "09:00" as IST. **Misleading notification.**

**Verdict: ❌ BROKEN**

---

### Scenario B: Provider Budapest (UTC+2), Patient New York (EDT UTC-4)

**Display:**
Patient sees "09:00" — interprets as 09:00 EDT. Actual is 09:00 Budapest = 03:00 EDT. **Patient misses appointment.**

**Countdown:**
Wrong by 6 hours.

**Verdict: ❌ BROKEN**

---

### Scenario C: Provider Sydney (AEST UTC+10), Patient Budapest (UTC+2)

**Slot generation:**
Rolling schedule cron uses server UTC "today". At 22:00 UTC on June 15, server thinks it is June 15 (Tuesday) but provider is in June 16 (Wednesday). Slots generated for the wrong day.

**Reminder:**
Sydney appointment at 09:00 AEST = 23:00 UTC. 24h reminder fires when UTC clock = 23:00 the day before, which is 09:00 AEST the day before. Reminder fires correctly on timing but at 01:00 Budapest time (middle of the night for the patient).

**Post-visit reminder:**
Appointment ends ~10:00 AEST = 00:00 UTC. The `isoDate(lookFrom) !== isoDate(lookTo)` guard triggers (crosses UTC midnight) → post-visit reminder is never sent.

**Countdown (patient in Budapest):**
Sees "09:00" → interprets as 09:00 Budapest. Actual is 09:00 Sydney = 01:00 Budapest. Countdown is wrong by 8 hours.

**Verdict: ❌ BROKEN**

---

### Scenario D: Provider India (IST UTC+5:30), Patient Budapest (UTC+2)

**Slot generation:**
Provider IST, server UTC. Slots generated for "today" on server UTC = "today" on provider IST because IST > UTC. Cron running at 23:00 UTC = 04:30 IST next day — so cron generates slots for June 16 IST "today" when it is still June 15 UTC. Minor 1-day horizon drift.

**Display (Budapest patient):**
Sees "09:00" → interprets as 09:00 Budapest = 07:00 UTC. Actual appointment is 09:00 IST = 03:30 UTC. Countdown and display are wrong by 3.5 hours.

**Verdict: ❌ BROKEN**

---

## Section 11 — Daylight Saving Analysis

### 11.1 Hungary (Europe/Budapest)
- Last Sunday of March: clocks spring forward from 02:00 to 03:00 (CET → CEST, UTC+1 → UTC+2)
- Last Sunday of October: clocks fall back from 03:00 to 02:00 (CEST → CET, UTC+2 → UTC+1)

**Impact on GoldenLife:**
- `Intl.DateTimeFormat` used in the Phase 7 slot filter IS DST-aware → correctly handles Hungary DST for the "now" computation when `providers.timezone = "Europe/Budapest"`
- `provider_blocks.start_datetime` is `TIMESTAMP WITHOUT TIME ZONE` → stored without UTC offset. A block entered at "02:30" on a DST-transition night is ambiguous: it could mean either 01:30 UTC or 02:30 UTC. PostgreSQL stores it as-is, no ambiguity resolution.
- Reminders use server UTC clock → DST in patient/provider TZ has no effect on when reminders fire

### 11.2 USA — America/New_York
- Second Sunday of March: 02:00 → 03:00 (EST → EDT, UTC-5 → UTC-4)
- First Sunday of November: 02:00 → 01:00 (EDT → EST, UTC-4 → UTC-5)

**Impact:** Same as Hungary. Block timestamps stored without TZ are ambiguous. Reminder timing based on UTC is unaffected.

### 11.3 Australia — Australia/Sydney
- First Sunday of April: 03:00 → 02:00 (AEDT → AEST, UTC+11 → UTC+10) — clocks fall back
- First Sunday of October: 02:00 → 03:00 (AEST → AEDT, UTC+10 → UTC+11) — clocks spring forward

**Impact:** Australia is in the southern hemisphere, so DST transitions are opposite to Europe/USA. `Intl.DateTimeFormat` handles this correctly. However, the rolling schedule cron's server-UTC "today" vs. provider AEST "today" drift is worst here (up to 11 hours in summer).

### 11.4 Summary
DST within `Intl.DateTimeFormat` is handled correctly at the Node.js level. The bugs in the platform are structural (text storage, wrong column reads) not DST-specific. DST does cause one additional problem: any appointment booked across a DST boundary in a region using provider-block `TIMESTAMP WITHOUT TIME ZONE` has an ambiguous stored time.

---

## Section 12 — Server Time Dependency Analysis

Every usage of `new Date()` / `Date.now()` catalogued:

### 12.1 Safe Usages (relative offsets only)
```typescript
// reminderCron.ts
const cutoff = new Date(Date.now() - PENDING_EXPIRY_HOURS * 60 * 60 * 1000);
// — comparing to appointments.created_at (TIMESTAMP), which was stored by server NOW() → consistent ✓

const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
// — same pattern ✓
```

### 12.2 Unsafe Usages (parsing bare time strings as local)
```typescript
// Available-slots route — UNSAFE
const slotMs = new Date(`${date}T${startTime}:00`).getTime();  // server local

// Available-slots block check — UNSAFE  
const slotStartMs = new Date(`${date}T${fmt(slotStartMins)}:00`).getTime();  // server local
const bStart = new Date(block.start_datetime).getTime();  // server local

// Booking creation past-check — UNSAFE
const slotDate = new Date(`${date}T${startTime || "00:00"}:00`);  // server local

// Multi-session booking — UNSAFE
const t = new Date(`${extra.date}T${extra.startTime}:00`);  // server local

// AppointmentTimeContext (browser) — UNSAFE for cross-TZ
const apptDate = new Date(`${date.slice(0, 10)}T00:00:00`);
apptDate.setHours(h, m, 0, 0);  // browser local

// AppointmentTimingCard (browser) — UNSAFE for cross-TZ
const d = new Date(`${date.slice(0, 10)}T00:00:00`);
d.setHours(h, m, 0, 0);  // browser local
```

### 12.3 Reminder Cron Mixed Usage
```typescript
function isoDate(d: Date) { return d.toISOString().slice(0, 10); }  // UTC — consistent with DB
function hhmm(d: Date) { return `${d.getHours()}...`; }  // SERVER LOCAL — inconsistent
```
The two functions extract date and time from different timezones. Works only if server = UTC (Replit containers are UTC today).

### 12.4 Rolling Schedule "Today"
```typescript
const today = new Date();
today.setHours(0, 0, 0, 0);  // server midnight — not provider midnight
```
For UTC+10/+11 providers, "today" drifts by up to 11 calendar hours from the provider's perspective.

---

## Section 13 — Risk Assessment

### 🔴 Critical

**C1 — Appointment time displayed in wrong timezone**
- All appointment display, countdowns, and "starts in" labels interpret stored "HH:MM" as the viewer's local time (browser TZ), not the provider's timezone.
- Impact: Patient in India books Budapest 09:00 slot — sees countdown to 09:00 IST (3.5h before actual appointment). Provider sees countdown in their own TZ (correct for them). Patient and provider see **different** times for the same appointment.
- Booking risk: Patient attends at wrong time or misses appointment entirely.

**C2 — No timezone recorded on appointment row**
- When the appointment is stored, no `provider_timezone` or `utc_start_at` column is written.
- The stored "09:00" is forever ambiguous — is it Budapest? UTC? India? There is no way to reconstruct the correct absolute time after the fact.
- Operational risk: No way to detect or correct mismatched appointments in retrospect.

**C3 — Reminder cron `hhmm()` uses server local time**
- `getHours()` returns server local hours; `toISOString()` returns UTC date.
- On a UTC server these happen to agree, but the mismatch means the reminder code is not expressing the correct intent. One deployment change (server TZ or UTC offset correction) breaks all reminders.

---

### 🟠 High

**H1 — Provider timezone reads from wrong database column**
- Slot engine reads `providers.timezone` (deprecated, often NULL).
- Setup form writes to `users.timezone`.
- Majority of providers likely have `providers.timezone = NULL` → engine defaults to UTC → timezone-aware slot filter disabled for most providers.

**H2 — Rolling schedule cron ignores provider timezone**
- "Today" and day-of-week computed from server UTC clock.
- Providers in UTC+10/+11 may have wrong slots generated for the current day.
- Slots for UTC-10/−12 providers may be generated a day early.

**H3 — provider_blocks stored as TIMESTAMP WITHOUT TIME ZONE**
- Manual blocks created by providers in non-UTC timezones are stored ambiguously.
- A block at "02:00" during a DST transition night represents two different absolute times.
- Block comparison in `isBlockedByBlock` uses `new Date(block.start_datetime)` → parsed as server local → consistent today but fragile.

**H4 — Booking past-time check uses server local**
- `new Date("YYYY-MM-DDTHH:MM:00")` without timezone → server local (UTC on Replit).
- For non-UTC providers, same-day bookings where the slot time is in the past (provider TZ) but future (UTC) are allowed. Providers receive bookings for times they already passed.

---

### 🟡 Medium

**M1 — All DB timestamps are TIMESTAMP WITHOUT TIME ZONE**
- `created_at`, `paid_at`, `issued_at`, `sent_at` etc. are stored without timezone.
- They are effectively UTC because Node.js `new Date()` is UTC-based and Postgres defaults to session TZ for display.
- Risk: If Supabase session timezone is ever changed, all timestamp comparisons and display values shift.

**M2 — Post-visit reminder skipped at UTC midnight**
- Appointments ending 60–75 min before UTC midnight (23:00–23:45 UTC) never get a post-visit reminder.
- Affects Sydney/Auckland/Auckland/east-Asia evening appointments.

**M3 — formatDate uses artificial midday anchor**
- `formatDate(\`${appt.date}T12:00:00\`)` — passes a midday timestamp to `Intl.DateTimeFormat`.
- For UTC-14 or UTC+14 users, midday UTC+0 can shift the displayed calendar date.
- Low-probability today (no UTC±14 markets) but wrong pattern.

**M4 — Three divergent timezone storage locations for providers**
- `users.timezone`, `providers.timezone`, `provider_office_hours.timezone` can all hold different values.
- No sync mechanism. New code reads one, old code reads another.

---

### 🟢 Low

**L1 — Slot display has no timezone label**
- The booking UI shows "09:00" with no "(Budapest)" label.
- Patients cannot determine what timezone the slot is in.

**L2 — Calendar invites (ICS) use `scheduledAt` which may not exist**
- `appointment-details.tsx` creates ICS using `appt.scheduledAt` → this column is not in the Drizzle model.
- ICS generation likely fails silently for most appointments.

**L3 — localStorage timezone can be stale**
- If a user travels to a new timezone and doesn't update settings, display timezone drifts from reality.
- Low operational risk (display-only), but affects countdown accuracy.

---

## Section 14 — Recommended Architecture

> This section describes the industry-standard solution. It is provided for planning purposes only — no implementation should occur without a full plan review.

### 14.1 Root Cause

The fundamental problem is that the system stores appointment date and time as timezone-naive text, then compares it to the current moment without unambiguously knowing which timezone the stored text belongs to.

### 14.2 Industry-Standard Solution

**A. Add `provider_timezone` and `start_at_utc` to every appointment at booking time.**

```sql
ALTER TABLE appointments 
  ADD COLUMN provider_timezone TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN start_at_utc TIMESTAMPTZ,
  ADD COLUMN end_at_utc TIMESTAMPTZ;
```

At booking, compute and store:
```
provider_timezone = "Europe/Budapest"
start_at_utc = convert("2026-06-16 09:00 Europe/Budapest" → UTC) = "2026-06-16T07:00:00Z"
end_at_utc   = "2026-06-16T08:00:00Z"
```

**B. Keep `date`, `start_time`, `end_time` as the provider's wall clock display values.** These never change, they define what the provider sees. They are not used for absolute time comparisons.

**C. All absolute time comparisons use `start_at_utc`:**
- Past-slot guard: `start_at_utc < NOW()`
- Reminder cron: `WHERE start_at_utc BETWEEN $window_start AND $window_end`
- Countdowns: `start_at_utc.getTime() - Date.now()`

**D. Display to patient includes their local conversion:**
```
Appointment: Jun 16, 9:00 AM (Budapest time) / 12:30 PM (your time)
```

**E. Fix provider_blocks to use TIMESTAMPTZ.**
**F. Fix the rolling schedule cron to use provider's stored timezone for "today" and day-of-week.**
**G. Consolidate provider timezone to a single source (`users.timezone`).**

### 14.3 Scope of Change

- DB migration: 1 new ALTER TABLE (appointments), 2 new ALTER TABLE (provider_blocks to timestamptz)
- Booking route: compute and store `provider_timezone`, `start_at_utc`, `end_at_utc`
- Slot filter route: replace `new Date("...T...")` comparisons with UTC column
- Reminder cron: replace `windowAheadMinutes()` with UTC-native window query
- Rolling schedule: add provider TZ lookup before `new Date()`
- Frontend: pass `provider_timezone` from API response; use `start_at_utc` in countdowns; display both provider time and patient local time
- Admin/display: update every date render that uses the artificial `T12:00:00` anchor

**Implementation risk:** Medium. DB migration is additive (non-destructive). Booking route change is contained. Frontend display changes are numerous but mechanical.

---

## Section 15 — Production Readiness Verdict

### Can GoldenLife safely operate with Provider in Hungary and Patients in India / USA / Australia?

### ❌ NO

**Reasons:**

1. **Appointment times are displayed in the wrong timezone to international patients.** A patient in India will see "09:00" for a Budapest appointment and assume it is 09:00 IST. The actual appointment is at 12:30 IST. This will cause missed appointments on day one.

2. **Countdowns are wrong for cross-timezone users.** The "Starts in X" countdown is calculated against browser-local time, treating the stored "HH:MM" as local. For an Indian patient with a Budapest appointment, the countdown hits zero 3.5 hours before the real appointment.

3. **No absolute timestamp is stored.** The "09:00" stored in the database is permanently ambiguous — there is no way to reliably derive the correct UTC time from it without knowing the provider's timezone, and `providers.timezone` is likely NULL for most providers (the setup form writes to `users.timezone` instead).

4. **Reminders work correctly today but are fragile.** The reminder cron mixes `toISOString()` (UTC) and `getHours()` (server local). This works on Replit's UTC-offset servers but will break silently on any infrastructure with a non-UTC local timezone. No reminder is ever sent in the patient's or provider's local time — reminders are UTC-clock based regardless of recipient timezone.

5. **The rolling schedule cron uses server UTC to determine "today".** For providers in UTC+10 or UTC+11, this means slots for the current provider-local day may not be generated until hours after the provider's day has started.

### What Works Correctly Today

- Booking flow basics (POST, conflict detection, payment): ✓
- Slot conflict engine (same-timezone, same-day): ✓ 
- Provider-timezone-aware slot filter (when `providers.timezone` is populated and server = UTC): ✓ 
- Financial timestamps (created_at, paid_at): ✓ (effectively UTC)
- Provider dashboard "today" calculation: ✓ (uses Intl correctly)

### What Must Be Fixed Before International Launch

1. Add `provider_timezone` + `start_at_utc` columns to appointments
2. Fix provider timezone authority (single source: `users.timezone`)
3. Fix the slot engine to read from correct timezone column
4. Fix past-slot filter to use UTC absolute times
5. Fix booking past-check to use UTC absolute time
6. Fix reminder cron `hhmm()` to use UTC (`getUTCHours()`) not local `getHours()`
7. Fix rolling schedule cron to use provider's timezone for "today" and day-of-week
8. Add timezone label to all appointment time displays (both provider's TZ and patient's TZ)
9. Fix countdowns to use `start_at_utc` instead of browser-local parsed "HH:MM"

---

*End of Forensic Audit — GoldenLife Global Timezone & International Scheduling*  
*Prepared: June 15, 2026 | Status: Findings only — no code changes made*
