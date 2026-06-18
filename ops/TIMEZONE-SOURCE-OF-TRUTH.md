# GoldenLife — Timezone Source of Truth

**Created:** 2026-06-18  
**Sprint:** Platform-Wide Currency & Timezone Forensic Audit  
**Status:** AUTHORITATIVE — do not override without updating this document

---

## 1. Single Timezone Architecture

There is ONE timezone architecture for the platform. Any code that deviates from this document is a bug.

---

## 2. Timezone Source by Actor

| Actor | Timezone Source | Column | Notes |
|---|---|---|---|
| **Provider** | `users.timezone` | TEXT (IANA zone string) | Written by setup form; `getProviderTimezone()` reads this first |
| **Provider (fallback)** | `provider_office_hours.timezone` | TEXT | Written by schedule admin route |
| **Provider (fallback 2)** | Country-code inference via `COUNTRY_TZ` map | — | HU → Europe/Budapest, IR → Asia/Tehran |
| **Provider (fallback 3)** | `"UTC"` | — | Last resort |
| **Patient** | `users.timezone` | TEXT | Set at registration or profile update |
| **Patient (fallback)** | `Intl.DateTimeFormat().resolvedOptions().timeZone` | — | Browser detection |
| **Admin** | Browser timezone | — | Viewer's timezone + UTC reference shown |

**Rule: `getProviderTimezone(providerId, providerUserId)` in `server/lib/tzUtils.ts` is the authoritative function for resolving a provider's timezone. Never inline timezone resolution.**

---

## 3. Storage Rules

| Data Type | Storage Format | Column Type | Notes |
|---|---|---|---|
| Appointment date | `"YYYY-MM-DD"` TEXT | TEXT | Provider local wall-clock date |
| Appointment time | `"HH:MM"` TEXT | TEXT | Provider local wall-clock time |
| Appointment UTC | ISO 8601 with Z | TIMESTAMPTZ | `start_at`, `end_at` on appointments |
| Provider timezone | IANA zone string | TEXT | `users.timezone`, `provider_office_hours.timezone` |
| Slot date/time | `"YYYY-MM-DD"` / `"HH:MM"` TEXT | TEXT | Provider local wall-clock |
| Cron timestamps | UTC (`new Date()`) | TIMESTAMPTZ | Server always runs UTC |
| Audit/ledger timestamps | UTC | TIMESTAMPTZ | `created_at`, `updated_at` etc. |

**Rule: ALL new time columns must be `TIMESTAMPTZ` (not `TIMESTAMP WITHOUT TIME ZONE`). The existing TEXT date/time columns are legacy — do not add new ones.**

---

## 4. Timezone Functions (Canonical List)

### 4.1 Server (`server/lib/tzUtils.ts`)

| Function | Purpose | Notes |
|---|---|---|
| `localToUTC(dateStr, timeStr, tz)` | Convert provider wall-clock to UTC Date | Used at booking time |
| `getProviderTimezone(providerId, providerUserId, fallback?)` | Authoritative provider TZ lookup | Checks users → office_hours → COUNTRY_TZ → UTC |
| `providerLocalNowMs(tz)` | UTC-adjusted "now" for wall-clock comparisons | Legacy slot paths only |
| `todayInTz(tz)` | Local midnight Date in a timezone | Rolling schedule cron |
| `tzAbbr(tz, refDate?)` | Short label e.g. "CEST" | Display only |

### 4.2 Client (`client/src/lib/datetime.ts`)

| Function | Purpose | Notes |
|---|---|---|
| `getUserTimezone()` | Active user's IANA timezone | localStorage → browser Intl |
| `setUserTimezone(tz)` | Persist timezone preference | Called after auth/profile load |
| `formatDate(value, options?)` | Date string in user timezone | Always passes `timeZone: getUserTimezone()` |
| `formatTime(value, options?)` | Time string in user timezone | Same |
| `formatDateTime(value, options?)` | Date+time string in user timezone | **Use this instead of `toLocaleString()`** |
| `tzShortLabel(tz?)` | Short zone name | Display badge |

**Rule: Never call `new Date(x).toLocaleString()`, `.toLocaleDateString()`, or `.toLocaleTimeString()` directly for appointment/session times. Always use `formatDateTime()` / `formatDate()` / `formatTime()` from `@/lib/datetime` — they inject `getUserTimezone()` automatically.**

---

## 5. Display Rules by Context

### 5.1 Appointment Display

| Screen | Timezone Used | Implementation |
|---|---|---|
| Book Wizard — slot cards | Provider timezone (UTC `startAtUtc` + convert) | `startAtUtc` from API response |
| Book Wizard — urgency/past-filter | **UTC** via `startAtUtc` | Never use naive date+time string |
| Booking Confirmation | Provider timezone | `appt.date` + `appt.start_time` (provider wall-clock) |
| Patient Dashboard | Patient timezone | `formatDateTime(startAtUtc)` |
| Provider Dashboard | Provider timezone | `formatDateTime(startAtUtc)` with provider TZ |
| Admin Dashboard | Viewer timezone + UTC reference | Show both |
| Notifications | Recipient timezone | Use stored wall-clock strings for same-country; convert for cross-TZ |
| Calendar Export (.ics) | UTC (DTSTART:YYYYMMDDTHHMMSSZ) | `formatCalDt()` in booking-confirmation.tsx |

### 5.2 Group Sessions

Group session `startTime` / `endTime` are `TIMESTAMP WITHOUT TIME ZONE` stored as UTC-equivalent (server runs UTC).

- **Display:** `formatDateTime(s.startTime)` — uses `getUserTimezone()` for correct local rendering
- **Never:** `new Date(s.startTime).toLocaleString()` — uses browser-ambient timezone, ignores user preference

### 5.3 Reminder Cron

- Reminder windows are calculated in UTC (`start_at TIMESTAMPTZ` comparisons)
- Notification body uses stored `appt.date` / `appt.start_time` (provider wall-clock strings)
- This is intentional — wall-clock strings are already localized for the provider/patient's country

---

## 6. Known Legacy Issues (Accepted Risk — Low Priority)

These use browser-ambient timezone for non-critical metadata dates (upload timestamps, "joined" dates). They are cosmetically inconsistent but do not affect financial or scheduling correctness:

| Location | Field | Risk |
|---|---|---|
| `wallet.tsx` | `tx.createdAt` toLocaleString | Cosmetic |
| `patient-dashboard.tsx` | Invoice dates | Cosmetic |
| `referrals.tsx` | `r.createdAt` | Cosmetic |
| `waitlist.tsx` | `r.createdAt` | Cosmetic |
| `provider-payout-panel.tsx` | Payout dates | Cosmetic |
| `consent.tsx` | `consentedAt` | Cosmetic |
| `care.routes.ts` | PDF prescription dates | Server UTC — acceptable for legal docs |

These are acceptable because:
1. They display metadata, not appointment times
2. The timezone difference for a "joined 3 days ago" label is never critical
3. Server `toLocaleDateString()` runs in UTC on Replit — consistent and predictable

---

## 7. Non-Negotiable Rules

1. **No `new Date(apptTime).toLocaleString()` for appointment/session times** — use `formatDateTime()`
2. **No `new Date().toLocaleDateString()` for slot display** — use `formatDate()`
3. **No country-based timezone assumptions** — `country_code !== timezone`
4. **No hardcoded timezone offsets** (`+02:00`, `+03:30`) — always use IANA zone strings
5. **No browser-only timezone assumption** for server-side rendering — server runs UTC
6. **All new cron logic uses `start_at` (TIMESTAMPTZ)** — never compute windows from TEXT date/time
7. **`startAtUtc` must be returned** on every availability API response — frontend uses it for urgency/past-filtering
8. **Calendar exports always use UTC format** — `YYYYMMDDTHHMMSSZ` via `formatCalDt()`
