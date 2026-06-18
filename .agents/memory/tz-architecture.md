---
name: UTC Timezone Architecture
description: How the Global TZ Hardening Sprint wired UTC-authoritative timestamps throughout the booking platform
---

## Canonical design

- **Single TZ source of truth:** `users.timezone` (IANA string, set by provider setup form). `providers.timezone` is legacy/deprecated — never use it.
- **Utility module:** `server/lib/tzUtils.ts` — `localToUTC(date, hhmm, tz)`, `getProviderTimezone(providerId, userId)`, `providerLocalNowMs(tz)`, `todayInTz(tz)`, `tzAbbr(tz)`.
- **`localToUTC` algorithm:** parse naively (no Z) → format back in target TZ → compute drift → apply. Handles DST correctly. Returns an invalid Date on bad input — always guard with `!isNaN(result.getTime())`.

## DB columns on appointments

- `start_at TIMESTAMPTZ` + `end_at TIMESTAMPTZ` + `provider_timezone TEXT` — added via C16.0 migration in `db.ts`.
- A SQL backfill in `db.ts` populates these for legacy rows using `AT TIME ZONE`.
- New bookings, reschedules, and reschedule-response accepts write these via fire-and-forget `pool.query()` after the main DB write.
- **Never** `await` these TZ writes synchronously — they run in detached IIFEs so they never delay the booking response.

## Server-side slot engine (`provider-availability.routes.ts`)

- `isBlockedByBlock()` converts slot wall-clock → `localToUTC` → compares vs stored TIMESTAMPTZ blocks (apples-to-apples UTC).
- Past-slot filter uses `localToUTC(date, startTime, providerTz).getTime()` vs `Date.now() + noticeMs` (pure UTC, no shifted clock).
- Day-range guard uses `localToUTC(date, "00:00", providerTz)` / `"23:59"` for UTC day boundaries vs `Date.now()`.
- `providerLocalNowMs()` is **not** used in the slot engine — only `Date.now()` + UTC slot times are compared.

## Booking route (`appointment.routes.ts`)

- Past-slot validation is split: format-only guard first (before provider load), then TZ-aware guard after provider is loaded so `getProviderTimezone()` can be called.
- `getProviderTimezone` is imported from `server/lib/tzUtils.ts`.

## Reminder cron (`reminderCron.ts`)

- All three reminder functions (`sendForTier`, `sendPostVisit`, `sendPrepReminders`) use a dual-query pattern: primary on `start_at TIMESTAMPTZ`, fallback on `start_at IS NULL` with text window via `windowAheadMinutes()`.
- `pool.query` returns snake_case: `appt.patient_id`, `appt.provider_id`, `appt.start_time`.

## Completed-before-start guard

- Prefers `(existing as any).startAt` (Drizzle camelCase TIMESTAMPTZ) over text-parse fallback. Drizzle returns `startAt` as a JS `Date`.

## Frontend countdown components

- `AppointmentTimingCard`, `AppointmentTimeContext`, `PreparationPanel` all accept `startAtUtc?: string | null`.
- When present, `new Date(startAtUtc)` is used instead of wall-clock parse.
- All call sites pass `(appt as any).startAt` (Drizzle camelCase from API).
- Appointment-details time row shows the provider's timezone city: `providerTimezone.split("/").pop()?.replace(/_/g, " ")`.

**Why:** without UTC-authoritative timestamps, providers in Budapest (UTC+2) saw wrong past-slot filters, countdown tickers showed wrong times for patients in different TZs, and reminder crons fired at wrong wall-clock hours.
