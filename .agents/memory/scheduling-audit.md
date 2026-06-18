---
name: Scheduling audit fixes
description: Critical bugs found and fixed in the scheduling system — field name mismatch, office-hours sync gap, rolling horizon, TS gaps
---

## Rules

**1. `maxPatientsPerDay` is the canonical field name (NOT `maxDailyAppointments`)**
The Drizzle schema column is `max_patients_per_day` → camelCase `maxPatientsPerDay`. Any route or UI that used `maxDailyAppointments` silently dropped the value (Drizzle ignores unknown keys). Fixed in:
- `server/routes/provider-schedule-admin.routes.ts` — PATCH handler now maps both names to `maxPatientsPerDay`
- `server/routes/provider-availability.routes.ts` — burnout ceiling now reads `maxPatientsPerDay`
- `server/routes/appointment.routes.ts` — daily limit check now reads `maxPatientsPerDay`
- `client/src/components/provider/dashboard/ProviderAvailabilityComponents.tsx` — WorkloadControlsCard now sends `maxPatientsPerDay`

**Why:** Drizzle's `updateProvider(id, data)` accepts `Partial<InsertProvider>`; passing an unknown key like `maxDailyAppointments` causes a silent no-op — no error, no update.

**2. SmartScheduler batch template save must sync to `provider_office_hours`**
`POST /api/provider/schedule-templates/batch` saves to `provider_schedule_templates`. The fallback slot synthesizer in `GET /api/providers/:id/available-slots` reads `provider_office_hours.weeklySchedule` (JSONB). These are TWO DIFFERENT tables with NO automatic link. After every batch save (null-modality templates only), call `syncTemplatesToOfficeHours(providerId, userId)` — it reads all active null-modality templates and rebuilds the weeklySchedule JSONB, then upserts to `provider_office_hours` via `storage.upsertProviderOfficeHours(userId, { weeklySchedule: JSON.stringify(weekly) })`.

**Why:** Without this sync, any date not yet covered by the rolling cron (first save, or dates >90d) falls through to the fallback which reads the stale/empty office-hours and returns zero slots.

**3. Rolling schedule horizon is 90 days**
`server/cron/rolling-schedule.ts` generates `time_slots` rows up to `addDays(today, 90)`. The previous value was 30 days, which left a 60-day gap vs the default `maximumBookingDays = 90`. Do not reduce this below 90 without also changing `maximumBookingDays` defaults.

**4. `DEFAULT_PER_EVENT` in notification-dispatcher.ts must cover ALL EventKey values**
`Record<EventKey, ChannelDecision>` is exhaustive. Any new event key added to the `EventKey` union must also have an entry in `DEFAULT_PER_EVENT` or TypeScript will error at compile time. Added: `review.left`, `payout.approved`, `payout.paid`, `payout.rejected`.

**5. SmartScheduler `updateWindow` accepts `keyof TimeWindow`**
The function was originally `(dow, idx, field: "start" | "end", value: string)`. Extended to `(dow, idx, field: keyof TimeWindow, value: string | number)` to support per-window `slotDurationMins`, `bufferBeforeMins`, `bufferAfterMins` editing. The Select `onValueChange` callback always returns a string, so `Number(v)` conversion is required before passing numeric fields.

**How to apply:** Any future addition of a numeric field to `TimeWindow` interface automatically works with the generalized `updateWindow` — no signature change needed.
