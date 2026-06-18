# Launch Readiness Chaos, Edge Case & Breakpoint Audit — Sprint Report

**Date:** 2026-06-14  
**Scope:** Forensic audit of 12 domains, intentional bug-hunting before production launch.  
**Result:** 4 real defects found and fixed. No P0 issues. App architecture is solid.

---

## Domains Audited

| Domain | Status | Finding |
|---|---|---|
| T001 Booking Engine (state machine, idempotency, rapid-action) | ✅ Clean | `canTransition` enforced on both PATCH /status and POST /action. Idempotency keys on booking + refunds. Ownership checks verified. |
| T002 Payment & Revenue | ✅ Clean | Wallet double-conversion guard verified. `provider_earnings.appointment_id` has DB-level UNIQUE constraint. `recordProviderEarning` has app-level idempotency guard. Stripe refund triple-guard intact. |
| T003 Permission & Security (IDOR, role abuse) | ✅ Clean | Admin per-resource endpoints (`GET /api/admin/providers/:id/documents`, `/credentials`) all call `canAccessCountry()`. PATCH /appointments/:id/status and POST /action both verify ownership. |
| T004 Notification | ⚠️ 3 defects fixed | See Fixes 1–3 below. |
| T005 Communication Hub | ✅ Clean | Message edit checks sender ownership AND conversation lock. Message history checks participant membership. No DELETE endpoint exists but no frontend exposes it. |
| T006 Provider Profile | ✅ Clean | Category lock enforced after approval. |
| T007 Clinical Workspace | ✅ Clean | Prescription/history writes require provider-patient relationship. Diagnosis delete scoped by `provider.id`. |
| T008 Home Visit Coverage | ✅ Clean | Haversine radius enforced at booking time (lines 665–680). |
| T009 Credential Lifecycle | ✅ Clean | `reminderCron` soft-expires provider documents on `expiry_date`. |
| T010 Stale Data / Tokens | ✅ Clean | `pruneOldData()` hourly: clears idempotency_keys, slot_holds, user_notifications (90d), audit_logs (180d). |
| T011 Execute Fixes | ✅ Done | All 4 defects fixed. |
| T012 Build validation | ✅ Done | Server still running, no errors in logs. |

---

## Defects Fixed

### Fix 1 — CRITICAL: Duplicate in-app notifications in `reschedule-response`

**File:** `server/routes/appointment.routes.ts`  
**Root cause:** The reschedule-response handler called `storage.createUserNotification` directly for both provider and patient, then also called `notify.appointmentRescheduled` / `notify.appointmentCancelled` — which internally also create in-app notifications via `dispatchNotification`. Both parties received TWO in-app notifications per event.  
**Fix:** Removed the two direct `createUserNotification` calls. The `notify.*` multi-channel dispatch now covers both in-app and email/SMS/push in one pass.  
**Pattern:** Matches the known "notification duplicate" pattern documented in `.agents/memory/notification-duplicate-pattern.md`.

---

### Fix 2 — MEDIUM: `no_show` admin-triggered action only notified patient

**File:** `server/routes/appointment.routes.ts`  
**Root cause:** In the no_show notification block, the `else` branch (covering provider AND admin) only pushed `updated.patientId` to recipients. When an admin marked no_show, the provider was never notified.  
**Fix:** Split the `else` into `else if (role === "provider")` (patient only) and `else` / admin (both patient AND provider).

---

### Fix 3 — MEDIUM: `confirmed` status sent in-app notification but no multi-channel dispatch

**File:** `server/routes/appointment.routes.ts`  
**Root cause:** `PATCH /api/appointments/:id/status` used `storage.createUserNotification` (in-app only) for all status changes. `notify.appointmentConfirmed` existed in the dispatcher but was never called when status became `confirmed`. Patients weren't getting email/SMS/push confirmation of their booking.  
**Fix:** Added a `notify.appointmentConfirmed(patientId, { providerName, date, time, appointmentId, lang })` call after the in-app notification block, gated on `status === "confirmed"`.

---

### Fix 4 — LOW: Dead-code patient branch in `PATCH /api/appointments/:id/status`

**File:** `server/routes/appointment.routes.ts`  
**Root cause:** The patient branch contained a `patientAllowedStatuses` whitelist of `["cancelled", "cancelled_by_patient", "reschedule_requested"]`, but all three entries are also in the `actionOnlyStatuses` guard at the top of the handler — so the check at line ~1595 was unreachable. The whitelist was misleading, suggesting patients could set those statuses while actually blocking them earlier.  
**Fix:** Replaced the dead whitelist with a direct 403 that explicitly routes patients to the action endpoint. Behavior is identical but the intent is now clear and won't silently allow new statuses to slip through if the lists ever diverge.

---

## Architecture Patterns Confirmed Sound

- **State machine:** `canTransition` is the single source of truth. Terminal states are correctly blocked across all entry points.
- **Idempotency:** Booking, refunds, wallet credits, and provider earnings all have idempotency keys. `provider_earnings` has a DB-level `UNIQUE` constraint on `appointment_id`.
- **Ownership:** Every mutating endpoint checks patient/provider ownership before acting. Admin bypass is explicit.
- **Country isolation:** Admin per-resource endpoints all call `canAccessCountry()`. Listing endpoints use `listingCountryFilter()`.
- **Duplicate notifications:** The "direct createUserNotification before dispatchNotification" anti-pattern was cleaned up in a previous sprint; this sprint found and fixed the last surviving instance.
