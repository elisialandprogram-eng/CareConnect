# Appointment Lifecycle Final Hardening & Reschedule Proposal Sprint — Report

**Date:** 2026-06-12  
**Status:** ✅ Complete — build + TS pass clean

---

## Objective

Complete the `reschedule_proposed` workflow end-to-end (provider proposes → patient accepts/rejects), add invoice/earnings failure recovery for admins, and fix three pre-existing TypeScript errors found during the build check.

---

## Changes Delivered

### 1. DB Enum Extension (`server/db.ts`)
- Added `"propose"` and `"reschedule_response"` to `appointment_action_enum` via `ALTER TYPE … ADD VALUE IF NOT EXISTS` in `runStartupMigrations()` (Phase 10 block).

### 2. Action Logic (`server/lib/appointmentActions.ts`)
- Extended `AppointmentAction` union type with `"propose"`.
- Added `"propose"` case to `checkAction()`: provider-only, allowed from `confirmed / rescheduled / approved` → transitions to `reschedule_proposed`.
- `quoteRefundWithRule()` returns $0 / policy `"none"` for `"propose"` (no money moves).

### 3. Server Routes (`server/routes/appointment.routes.ts`)
- **Propose action block** — same conflict checks as reschedule but does NOT change `date / start_time / end_time` on the appointment itself; stores proposed time in the `appointment_events` metadata JSON `{ proposed: { date, startTime, endTime } }`.
- **`POST /api/appointments/:id/reschedule-response`** — patient-only endpoint; `accept` transitions to `rescheduled` (applies proposed time), `reject` transitions back to `confirmed`.
- **`POST /api/admin/appointments/:id/retry-completion`** — admin retry for failed invoice + provider earnings; guarded by `requireAdmin`.
- Invoice/earnings failure paths now call `logSystemEvent("failed_job", ...)` in addition to `console.error`.

### 4. Frontend — Provider side
- **`AppointmentActionDialog.tsx`**: Added `"propose"` to `ACTION_META`, `titleByAction`, and `CalendarDays` icon import; date/time inputs shown for both `"reschedule"` and `"propose"` actions; body includes date/time for both.
- **`ProviderAppointmentsTabs.tsx`**: "Reschedule" button renamed to "Propose New Time" (fires `action="propose"`); `reschedule_proposed` status transition list is empty (provider cannot accept their own proposal).

### 5. Frontend — Patient side
- **`RescheduleProposalBanner.tsx`** (NEW) — reads the latest `"propose"` event from `/api/appointments/:id/events`, displays the proposed date/time, and provides Accept / Reject buttons that call `POST /api/appointments/:id/reschedule-response`.
- **`patient-dashboard.tsx`**: Added `RescheduleProposalBanner` import; `reschedule_proposed` added to `upcomingAppointments` filter; banner rendered inside AppointmentCard when `appointment.status === "reschedule_proposed"`.

### 6. TypeScript Bug Fixes (found during build check)
| File | Error | Fix |
|------|-------|-----|
| `AppointmentActionDialog.tsx` | `Record<AppointmentAction,string>` missing `propose` | Added `propose` key |
| `ChatBox.tsx` | `RichConv` missing `lockedAt` in inline object | Added `lockedAt: conv.lockedAt ?? null` |
| `provider-dashboard.tsx` | `ProfileSection` not assignable to `ProfileSubSection` at call site | Added `as ProfileSubSection` cast |

---

## Flow Summary

```
Provider clicks "Propose New Time"
  → POST /api/appointments/:id/action { action:"propose", newDate, newStartTime, newEndTime }
  → status: confirmed → reschedule_proposed
  → event recorded with proposed time in metadata

Patient sees RescheduleProposalBanner on dashboard
  → "Accept" → POST /reschedule-response { response:"accept" }
              → status: reschedule_proposed → rescheduled (time applied)
  → "Reject" → POST /reschedule-response { response:"reject" }
              → status: reschedule_proposed → confirmed (time unchanged)
```

---

## Build Verification

```
✓ npm run build — passed (client + server)
✓ npx tsc --noEmit --skipLibCheck — 0 errors
```

