# GoldenLife — Appointment & Booking Lifecycle Forensic Audit

**Date:** 2026-06-12  
**Scope:** End-to-end forensic mapping of the GoldenLife appointment and booking system — database, backend, frontend, automation, billing, telehealth, and communication.  
**Method:** Direct code inspection of all relevant files. No assumptions made.

---

## Table of Contents

1. [Appointment Lifecycle Overview](#1-appointment-lifecycle-overview)
2. [Status Definitions](#2-status-definitions)
3. [Patient Actions](#3-patient-actions)
4. [Provider Actions](#4-provider-actions)
5. [Admin Actions](#5-admin-actions)
6. [Automation Map](#6-automation-map)
7. [Communication Integration Map](#7-communication-integration-map)
8. [Telehealth Integration Map](#8-telehealth-integration-map)
9. [Billing & Revenue Map](#9-billing--revenue-map)
10. [Workflow Diagram](#10-workflow-diagram)
11. [Gap Analysis](#11-gap-analysis)
12. [Additional Defects Found & Fixed](#12-additional-defects-found--fixed)
13. [Launch Readiness Assessment](#13-launch-readiness-assessment)

---

## 1. Appointment Lifecycle Overview

### How Appointments Are Created

Entry point: `POST /api/appointments` (requires authentication).

**Pre-flight validations (in order):**
1. Idempotency key check (10-minute TTL, stored in `idempotency_keys` table) — replays return cached response.
2. User exists and email is verified (`user.isEmailVerified`).
3. Patient has accepted "terms" and "privacy" legal policies.
4. Date/time is in the future.
5. Provider status is `approved` or `active`.
6. Patient and provider `countryCode` match (multi-tenant isolation).
7. Provider is not on time-off for the requested date.
8. Provider's `maxPatientsPerDay` limit has not been reached.
9. Provider's `minGapMinutes` burnout protection is respected.
10. Conflict engine (`server/conflictEngine.ts`) checks: overlapping appointments, service buffers (`bufferBefore`/`bufferAfter`), manual blocks, active `slot_holds` (excluding the requesting patient's own hold).
11. Duplicate booking check — same patient, same slot.

**Financial computation:** `runRevenueEngine()` calculates base price → promo/gift-card/membership discounts → travel surcharges (home visits) → payment method surcharges → platform fees → taxes → provider net earnings. All amounts stored internally in USD.

**Records created on success:**
| Record | Table | Notes |
|--------|-------|-------|
| Appointment | `appointments` | Initial status: `pending` |
| Audit event | `appointment_events` | `action: "book"` |
| Financial snapshot | `appointments` (inline columns) | Revenue engine output persisted |
| Revenue share entries | `booking_revenue_shares` | Multi-party payout tracking |
| Payment record | `payments` | Status: `pending` |
| Chat conversation | `realtime_conversations` | Auto-created between patient and provider |
| Intake responses | `appointments.intakeResponses` (jsonb) | Patient questionnaire data |

**Payment branching at creation:**
- **Wallet (full coverage):** Wallet debited → appointment immediately promoted to `confirmed`, payment set to `completed`.
- **Wallet (partial):** Partial debit → Stripe Checkout Session created for the remainder → appointment stays `pending`.
- **Card:** Stripe Checkout Session created → appointment stays `pending` until webhook fires.
- **Cash/Bank Transfer:** No immediate payment action → appointment stays `pending`, provider manually marks payment received later.

**Post-creation side effects:**
- Multi-channel notifications dispatched to both patient and provider (`appointment.booked` event).
- Confirmation email with ICS calendar attachment sent via Resend.
- Active waitlist entries for that provider are auto-cancelled for the patient.
- Promo code `usedCount` incremented.
- Membership wallet bonus credited (fire-and-forget, post-response).
- Child appointments created if `additionalSlots` provided (linked via `parentAppointmentId`, amount = 0 / bundled).

---

## 2. Status Definitions

**Source of truth:** `server/lib/appointmentStatus.ts`

### Terminal vs. Non-Terminal

**Terminal statuses** (no further transitions allowed except admin override):
`completed`, `cancelled`, `cancelled_by_patient`, `cancelled_by_provider`, `rejected`, `expired`, `no_show`

**Non-terminal statuses:**
`pending`, `approved`, `confirmed`, `in_progress`, `rescheduled`, `reschedule_requested`, `reschedule_proposed`

---

### `pending`
**Meaning:** Booking submitted, awaiting provider approval. Payment may or may not be complete.  
**Entry:** Created by `POST /api/appointments` (default). Also reached from `approved`/`confirmed` via admin override.  
**Exit:** → `approved`, `confirmed`, `in_progress`, any cancel/reject/reschedule branch.  
**Patient can:** Cancel (if >6h before start), reschedule (if >2h before start).  
**Provider can:** Approve, confirm (skip approve), reject, cancel.  
**Admin can:** Force any status.  
**Automation:** Auto-expires to `expired` after `PENDING_APPT_EXPIRY_HOURS` (default 24h) via `expireStalePending()` cron.

---

### `approved`
**Meaning:** Provider has acknowledged the request and approved it, but explicit final confirmation has not yet been given.  
**Entry:** Provider calls `PATCH /api/appointments/:id/status` with `status: "approved"` from `pending`.  
**Exit:** → `confirmed`, `in_progress`, any cancel/reschedule branch.  
**Patient can:** Cancel, reschedule.  
**Provider can:** Confirm, start, cancel, reschedule, no-show (after start time).  
**Admin can:** Any transition.  
**Automation:** Reminders sent (24h, 1h, 15m tiers). Auto-cancelled by `cancelStaleConfirmed()` if date passes >24h ago without completion.

---

### `confirmed`
**Meaning:** Appointment is locked in. Payment is complete or will be collected at time of visit.  
**Entry:** Wallet full-payment at booking time. Stripe webhook `checkout.session.completed`. Provider/admin explicitly sets confirmed. From `reschedule_requested`/`reschedule_proposed`.  
**Exit:** → `in_progress`, `completed`, any cancel/reschedule branch.  
**Patient can:** Cancel, reschedule.  
**Provider can:** Start, complete, cancel, reschedule, no-show.  
**Admin can:** Any transition.  
**Automation:** Reminders sent. Auto-cancelled by `cancelStaleConfirmed()` if date passes >24h ago.

---

### `in_progress`
**Meaning:** Provider has explicitly started the visit.  
**Entry:** Provider calls status endpoint with `in_progress` from `approved` or `confirmed`.  
**Exit:** → `completed`, `cancelled`, `cancelled_by_provider`, `no_show`.  
**Patient can:** No status transitions available; can still message and join video call (online visits).  
**Provider can:** Complete, cancel, mark no-show.  
**Admin can:** Any transition.  
**Automation:** Post-visit reminder sent 1h after `endTime`.

---

### `completed`
**Meaning:** Visit finished and marked complete. Terminal state.  
**Entry:** Provider calls status endpoint with `completed`. Payment must be in `completed` status (enforced for non-admin).  
**Exit:** None (terminal).  
**Patient can:** Leave review, download invoice, file dispute, book follow-up.  
**Provider can:** Add outcome notes, recommend follow-up, add SOAP notes/diagnoses/treatment plans in Clinical Workspace.  
**Automation triggered on completion:**
- Invoice auto-generated (`createInvoiceForAppointment()`).
- Provider earnings recorded (`storage.recordProviderEarning()`).
- Linked conversation scheduled to lock 48 hours after completion.
- Post-visit notification sent to patient.
- Appointment events log updated (`action: "complete"`).

---

### `cancelled`
**Meaning:** Cancelled by an automated system process (stale/orphan cleanup). Generic cancel. Terminal state.  
**Entry:** `cancelStaleConfirmed()` cron auto-cancels approved/confirmed/rescheduled appointments whose date passed >24h ago without completion.  
**Exit:** None (terminal).  
**Notes:** This is the only status set by automated cron without a specific actor identifier. Distinguishable from actor-specific cancels via `appointments.cancelledBy` and `appointments.privateNote` (which contains `[AUTO]` prefix).

---

### `cancelled_by_patient`
**Meaning:** Patient explicitly cancelled. Terminal state.  
**Entry:** Patient calls `POST /api/appointments/:id/action` with `action: "cancel"`.  
**Constraints:** Blocked within 6 hours of start time (unless patient has `free_cancellations` membership benefit).  
**Exit:** None (terminal).  
**Automation:** Refund calculated and issued (see Section 9). Conversation locked after 2h. Notification sent to patient and provider.

---

### `cancelled_by_provider`
**Meaning:** Provider (or admin acting on provider side) explicitly cancelled. Terminal state.  
**Entry:** Provider/admin calls `POST /api/appointments/:id/action` with `action: "cancel"`. Also set by admin status override.  
**Exit:** None (terminal).  
**Automation:** Full refund issued to patient automatically. Conversation locked after 2h. Notification sent.

---

### `rejected`
**Meaning:** Provider refused the booking request outright. Terminal state.  
**Entry:** Provider calls `PATCH /api/appointments/:id/status` with `status: "rejected"` from `pending`.  
**Exit:** None (terminal).  
**Automation:** Patient notified. Time slot released.

---

### `rescheduled`
**Meaning:** Provider or admin has directly changed the appointment to a new time.  
**Entry:** Provider/admin calls `POST /api/appointments/:id/action` with `action: "reschedule"`.  
**Exit:** → `approved`, `confirmed`, `in_progress`, any cancel branch.  
**Notes:** Funds carry to the new slot (no refund). Patient notified of the new time.

---

### `reschedule_requested`
**Meaning:** Patient has requested a reschedule but has not proposed a specific new time.  
**Entry:** Patient calls `POST /api/appointments/:id/action` with `action: "reschedule"` (blocked within 2h of start).  
**Exit:** → `reschedule_proposed`, `rescheduled`, `confirmed`, any cancel branch.  
**Notes:** Puts the ball in the provider's court to propose or confirm a new time.

---

### `reschedule_proposed`
**Meaning:** Provider has proposed a specific new time in response to a patient reschedule request.  
**Entry:** Via `PATCH /api/appointments/:id/status` with `status: "reschedule_proposed"`.  
**Exit:** → `rescheduled`, `confirmed`, any cancel branch.  
**⚠ GAP:** No dedicated endpoint exists to set this status with a new proposed time payload. The path `reschedule_requested → reschedule_proposed → patient accepts → rescheduled` is modelled in the state machine but not fully implemented in routes. See Gap Analysis.

---

### `no_show`
**Meaning:** Patient did not attend and provider marked the absence. Terminal state.  
**Entry:** Provider/admin calls `POST /api/appointments/:id/action` with `action: "no_show"`. Blocked until after appointment start time.  
**Exit:** None (terminal).  
**Automation:** No refund issued. Patient notified. Appointment events logged.

---

### `expired`
**Meaning:** Pending appointment was not acted on by the provider within the expiry window. Terminal state.  
**Entry:** `expireStalePending()` cron after `PENDING_EXPIRY_HOURS` (default 24h, configurable via env var).  
**Exit:** None (terminal).  
**Automation:** Time slot released. Patient receives in-app notification to rebook.

---

## 3. Patient Actions

**Source:** `POST /api/appointments/:id/action`, `server/lib/appointmentActions.ts`

| Action | Endpoint | Allowed From | Time Constraint | Result Status | Refund |
|--------|----------|-------------|----------------|---------------|--------|
| Cancel | POST `/action` | Any non-terminal | Must be >6h before start (waived with `free_cancellations` membership) | `cancelled_by_patient` | Time-based (see Section 9) |
| Reschedule Request | POST `/action` | Any non-terminal | Must be >2h before start | `reschedule_requested` | None — funds carry |
| Join Video Call | GET `/api/video/token` or `/api/video/room/:id` | Non-terminal, `visitType=online` | None | — | — |
| Message Provider | WS / REST `/api/chat/messages` | Any non-locked conversation | Conversation not locked | — | — |
| Upload Files | POST `/api/chat/upload` | Any | — | — | — |
| Leave Review | POST `/api/reviews` | After `completed` | — | — | — |
| Download Invoice | GET `/api/invoices/:id/pdf` | After `completed` | — | — | — |
| File Dispute | POST `/api/disputes` | After `completed` or `cancelled` | — | — | — |
| View Refund Quote | GET `/api/appointments/:id/action-quote` | Any non-terminal | — | — | Preview only |
| Cleanup Stale Own Bookings | POST `/api/appointments/cleanup` | Own past-due `pending` | — | `cancelled`/`expired` | — |

**Patients CANNOT:**
- Approve, confirm, reject, or start their own appointments.
- Mark no-show (403 returned by `checkAction()`).
- Override time constraints without a qualifying membership benefit.
- Transition any appointment in a terminal status.

---

## 4. Provider Actions

**Sources:** `PATCH /api/appointments/:id/status`, `POST /api/appointments/:id/action`, `POST /api/appointments/:id/recommend-followup`

| Action | Endpoint | Allowed From | Notes |
|--------|----------|-------------|-------|
| Approve | PATCH `/status` (`approved`) | `pending` | Acknowledges request |
| Confirm | PATCH `/status` (`confirmed`) | `pending`, `approved`, `reschedule_requested`, `reschedule_proposed` | Locks appointment in |
| Reject | PATCH `/status` (`rejected`) | `pending` | Terminal; time slot released |
| Start | PATCH `/status` (`in_progress`) | `approved`, `confirmed` | Marks visit as actively underway |
| Complete | PATCH `/status` (`completed`) | `confirmed`, `in_progress` | Requires payment `completed`; triggers invoice + earnings |
| Cancel | POST `/action` (`cancel`) | Any non-terminal | Full refund issued to patient automatically |
| Reschedule | POST `/action` (`reschedule`) | Any non-terminal, >0h | Directly moves to `rescheduled`; funds carry |
| No-Show | POST `/action` (`no_show`) | Any non-terminal | Must be after appointment start time; no refund |
| Mark Payment Received | PATCH `/payment-status` | Any | Marks `payments.status = completed` for cash/bank transfer |
| Recommend Follow-Up | POST `/recommend-followup` | Provider owns appointment | Sets `follow_up_recommended = true`; notifies patient |
| Add Clinical Notes | POST `/api/care/*` (SOAP, diagnoses, treatment plans) | Any active | Requires patient relationship gate |
| Add Private Note | PATCH `/api/appointments/:id` | Any | Auto-save sticky note, not visible to patient |
| Bulk Confirm/Reject | POST `/api/appointments/bulk-status` | Multiple `pending` | Batch action |

**Provider-accessible status dropdown on frontend** is limited to valid `PROVIDER_STATUS_TRANSITIONS` (cancel/reschedule use the `/action` endpoint, not the dropdown).

---

## 5. Admin Actions

**Sources:** `PATCH /api/appointments/:id/status` (admin bypass), `PATCH /api/appointments/:id/payment-status`, admin monitoring panel

| Action | Notes |
|--------|-------|
| Force any status | Admin bypasses `canTransition()` check entirely |
| Mark payment completed | Manually overrides payment status; triggers invoice + earnings if appointment already `completed` |
| Global cleanup | `POST /api/appointments/cleanup` with admin token auto-expires all stale system-wide bookings |
| View all appointments | `GET /api/admin/bookings` — returns `{ bookings, appointments, total }` object with all countries or filtered by `countryCode` |
| Delete/Modify | Via admin dashboard monitoring panel |

---

## 6. Automation Map

**Cron runner:** `server/reminderCron.ts`  
**Frequencies:** 5-minute tick + hourly tick (sequential subtasks via `runSubtask()` to respect pool limit of 12 connections)

### 5-Minute Tick (`tick()`)

| Subtask | Function | Trigger Condition | Action |
|---------|----------|-------------------|--------|
| 1h reminder | `sendForTier("1h")` | Appointment in `approved`/`confirmed`/`rescheduled` starts in ~60 min | Notify patient + provider via all channels |
| 15m reminder | `sendForTier("15m")` | Appointment starts in ~15 min | Notify patient + provider via all channels |
| Post-visit prompt | `sendPostVisit()` | Appointment `endTime` was 60–75 min ago, status = `completed`/`confirmed`/`approved` | Notify patient to leave review |
| Expire pending | `expireStalePending()` | `pending` appointment older than `PENDING_EXPIRY_HOURS` (24h default) | Set `expired`, release slot, notify patient |
| Cancel stale confirmed | `cancelStaleConfirmed()` | `approved`/`confirmed`/`rescheduled` with date >24h ago | Set `cancelled`, release slot, notify patient *(fixed — was silent before)* |
| Slot hold expiry | `expireAndNotifySlotHolds()` | `appointment_slot_holds.expires_at < NOW()` | Delete holds, notify top-N waitlist users |
| Group sessions | `storage.tickGroupSessionStatuses()` | Group session timing | Transition `to_live` and `to_completed` |

### Hourly Tick (`tickHourly()`)

| Subtask | Function | Trigger Condition | Action |
|---------|----------|-------------------|--------|
| 24h reminder | `sendForTier("24h")` | Appointment starts in ~24h | Notify patient + provider (in-app + email + push) |
| 48h prep reminder | `sendPrepReminders()` | Appointment starts in ~48h | Notify patient with preparation instructions |
| Overdue invoice nudge | `sendOverdueInvoiceReminders()` | Invoice overdue, cooldown elapsed (7d default), under max retries (4 default) | Notify patient via dispatcher |
| Package expiry | `expirePackages()` | `user_packages.expiresAt < NOW()` | Deactivate, charge renewal via wallet, notify user |
| Waitlist cleanup | `cleanupExpiredWaitlist()` | Waitlist entry expired | Notify patient, release entry |
| Wallet audit | `runWalletAudit()` | Scheduled | Flag/clear wallet anomalies |
| Pending user cleanup | — | Unverified accounts older than threshold | Delete stale unverified accounts |

### Stripe Webhook Automation (`server/stripeWebhook.ts`)

| Webhook Event | Action |
|---------------|--------|
| `checkout.session.completed` | Set payment `completed`, set appointment `confirmed`, credit membership wallet bonus |
| `checkout.session.async_payment_succeeded` | Same as above |
| `checkout.session.async_payment_failed` | Log failure; appointment stays `pending` |
| `customer.subscription.*` | Membership lifecycle management |
| `invoice.payment_succeeded` | Wallet top-up confirmation |

---

## 7. Communication Integration Map

**Sources:** `server/routes/communication.routes.ts`, `server/chat/ws.ts`, `server/storage/database-storage.ts`

### Conversation Lifecycle

| Event | What Happens |
|-------|-------------|
| **Booking created** | `storage.startOrContinueConversation()` auto-creates or reuses a conversation between patient and provider, linked to `appointmentId` |
| **Subsequent booking (same pair)** | Existing conversation reused; `appointmentId` updated to latest booking context |
| **Appointment `completed`** | Conversation scheduled to lock **48 hours** after completion (`lockConversation()` with `Date.now() + 48h`) |
| **Appointment cancelled (any variant)** | Conversation scheduled to lock **2 hours** after cancellation |
| **Lock time reached** | All new messages rejected by both WS handler (`CONVERSATION_LOCKED` error) and REST handler (409 response) |
| **User deleted** | All conversations and messages permanently purged (PII protection) |

### Messaging Permissions

| Actor | Can Send | Blocked When |
|-------|----------|-------------|
| Patient | Yes | Conversation `lockedAt` is in the past |
| Provider | Yes | Conversation `lockedAt` is in the past |
| Admin | Not applicable | — |

### Channels Available

- **WebSocket** (`server/chat/ws.ts`): Real-time delivery, typing indicators, read receipts. Authenticated via `accessToken` cookie.
- **REST** (`POST /api/chat/messages`): Fallback and history fetch.
- **File Upload** (`POST /api/chat/upload`): Handled via `saveChatUpload()`.

### Notification Channels (per EventKey)

**Source:** `server/services/notification-dispatcher.ts`

| Event | In-App | Email | SMS | WhatsApp | Push |
|-------|--------|-------|-----|----------|------|
| `appointment.booked` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `appointment.confirmed` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `appointment.rescheduled` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `appointment.cancelled` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `appointment.reminder.24h` | ✓ | ✓ | — | — | ✓ |
| `appointment.reminder.1h` | ✓ | — | ✓ | ✓ | ✓ |
| `appointment.reminder.15m` | ✓ | — | ✓ | ✓ | ✓ |
| `appointment.postvisit` | ✓ | ✓ | — | — | ✓ |

Channels respect user notification preferences and quiet hours. Delivery logged to `notification_delivery_logs` with `eventKey`.

---

## 8. Telehealth Integration Map

**Source:** `server/services/video.ts`, `server/routes/communication.routes.ts`

### Providers

1. **Daily.co** — Used when `VIDEO_PROVIDER=daily`, `DAILY_API_KEY`, and `DAILY_DOMAIN` are all set. Creates HIPAA-compliant rooms.
2. **Jitsi Meet** (public fallback) — Used when Daily.co is not configured or its API call fails. Room URL: `https://meet.jit.si/gl-<appointmentId_prefix>`. No authentication.

### Video Room Lifecycle

| Trigger | What Happens |
|---------|-------------|
| Patient or provider requests token | `GET /api/video/token?appointmentId=X` or `GET /api/video/room/:id` called |
| Room check | `getOrCreateVideoSession(appointmentId)` — checks `video_sessions` table for existing session |
| No existing session | New room created via Daily.co API (4-hour expiry) or Jitsi URL generated |
| Existing session | Existing session returned (no new room created) |
| Session stored | Persisted to `video_sessions` table |

### Access Gate (after fixes applied)

Both video endpoints (`/api/video/token`, `/api/video/room/:id`) now enforce:
1. User must be authenticated.
2. User must be the patient, the provider, or an admin.
3. `visitType` must be `online`.
4. **Appointment must not be in a terminal status** (`completed`, `cancelled`, `cancelled_by_patient`, `cancelled_by_provider`, `rejected`, `expired`, `no_show`) — returns 409 if so. *(Fixed during this audit — was missing before.)*

### What Happens on Cancellation

- Video sessions are **not** explicitly deleted. They expire naturally (Daily.co 4-hour TTL or Jitsi URL simply becomes unreachable after the appointment ends).
- Video endpoints now return 409 for any terminal-status appointment, preventing new room creation.

### Frontend Join Logic

A "Join Call" button appears on the patient appointment detail page when `visitType === "online"`. The provider dashboard shows a "Join Video" button for upcoming online appointments. No explicit status check blocks the button on the frontend beyond the backend 409 gate now in place.

---

## 9. Billing & Revenue Map

**Sources:** `server/lib/revenue-engine.ts`, `server/lib/appointmentActions.ts`, `server/stripeWebhook.ts`, `server/routes/appointment.routes.ts`

### Payment Flow

```
Booking Created
      │
      ├─ Gift card applied? → Redeem to wallet, then debit wallet
      │
      ├─ Wallet covers 100%? → storage.debitWallet() → payment = "completed"
      │                                               → appointment = "confirmed"
      │
      ├─ Wallet partial + remainder? → Partial wallet debit + Stripe Checkout Session
      │                              → appointment stays "pending"
      │
      ├─ Card only? → Stripe Checkout Session
      │             → appointment stays "pending"
      │
      └─ Cash/Bank Transfer? → No payment action
                             → appointment stays "pending"
                             → Provider manually marks payment received later
```

### Payment Confirmation

| Method | Trigger | Action |
|--------|---------|--------|
| Wallet (full) | At booking | Immediate: payment `completed`, appointment `confirmed` |
| Stripe | `checkout.session.completed` webhook | Payment `completed`, appointment `confirmed` |
| Cash/Bank Transfer | Provider marks `PATCH /api/appointments/:id/payment-status` | Payment `completed`; if appointment already `completed`, invoice generated |

### Refund Policy

**Source:** `quoteRefundWithRule()` in `server/lib/appointmentActions.ts`

| Actor | Scenario | Refund |
|-------|----------|--------|
| Patient cancel | >24h before start | 100% |
| Patient cancel | 6–24h before start | 50% |
| Patient cancel | <6h before start | 0% |
| Provider/Admin cancel | Any time | 100% always |
| No-show | Any | 0% |
| Reschedule | Any | 0% (funds carry to new slot) |

Rules can be overridden by DB-driven `refund_rules` table entries (by country and scenario), which take precedence over hardcoded defaults.

**Refund execution:**
- **Wallet payment:** `storage.refundWallet()` credits back immediately.
- **Card payment (Stripe):** `stripe.refunds.create()` called, refund ID stored in `payments.stripeRefundId`.
- **Duplicate refund protection:** Three independent guards — (1) `refundStatus="processed"` check, (2) `!payment.stripeRefundId` DB guard, (3) Stripe idempotency key.

### Invoice Generation

| Trigger | Mechanism |
|---------|-----------|
| Appointment marked `completed` | `createInvoiceForAppointment()` auto-called |
| Payment marked `completed` on already-`completed` appointment | `createInvoiceForAppointment()` called again (idempotent) |
| Manual admin action | Via admin invoice panel |

Invoice generated as PDF via `jsPDF` (`server/utils/invoice-gen.ts`). Stored in `invoices` + `invoice_items` tables. `appointments.invoiceGenerated` flag set to prevent duplicates.

### Provider Earnings

| Trigger | Mechanism |
|---------|-----------|
| Appointment status → `completed` | `storage.recordProviderEarning(appointmentId)` called (idempotent — unique constraint on appointmentId) |
| Payment marked `completed` on already-`completed` appointment | `storage.recordProviderEarning()` called again (idempotent) |

Earnings tracked in `provider_wallets` (balance snapshot) + `provider_ledger` (append-only audit log). Providers request payouts via the payout flow (`payout_requests` table).

### Revenue Recognition

Platform revenue = platform fees + commission + payment method surcharge. Recognized when `payments.status` moves to `completed`. Split tracked in `booking_revenue_shares` at time of booking.

---

## 10. Workflow Diagram

```
Patient Submits Booking (POST /api/appointments)
│
├─ Validation fails → 400/409/422 error returned, nothing created
│
└─ Validation passes
        │
        ├─ Revenue Engine computes pricing
        ├─ Slot reserved (atomic)
        ├─ Appointment created (status: PENDING)
        ├─ Payment record created (status: pending)
        ├─ Chat conversation auto-created
        ├─ Notifications dispatched (appointment.booked)
        │
        ├─ Wallet full pay → status: CONFIRMED, payment: completed
        │
        └─ Card/partial → Stripe Checkout created → status stays PENDING
                                │
                          Stripe webhook fires
                                │
                          status: CONFIRMED, payment: completed
                                │
                    ┌───────────┴───────────────────────┐
                    │                                   │
             Provider APPROVES                   Provider REJECTS
                    │                                   │
               status: APPROVED                   status: REJECTED ●
                    │                          (patient notified,
                    │                           slot freed)
                    │
              Provider CONFIRMS
                    │
               status: CONFIRMED
                    │
         ┌──────────┴───────────────────────────────┐
         │                                          │
  Provider STARTS visit                    Patient/Provider CANCELS
         │                                          │
    status: IN_PROGRESS                    ┌────────┴────────┐
         │                         Patient cancels    Provider cancels
         │                                │                  │
         │                     cancelled_by_patient●  cancelled_by_provider●
         │                       (time-based refund)   (full refund)
         │
  Provider COMPLETES
         │
    status: COMPLETED ●
         │
         ├─ Invoice auto-generated
         ├─ Provider earnings recorded
         ├─ Post-visit notification → patient (review prompt)
         └─ Chat conversation locked (48h window)

━━━━━━ AUTOMATION PATHS ━━━━━━

PENDING > 24h unactioned  → EXPIRED ●  (slot freed, patient notified)
APPROVED/CONFIRMED date   → CANCELLED ● (slot freed, patient notified)
  passes > 24h, not
  marked completed

Provider marks NO-SHOW    → NO_SHOW ●  (after start time, no refund)

Patient requests reschedule → RESCHEDULE_REQUESTED
                                   │
                        Provider proposes time → RESCHEDULE_PROPOSED (*)
                                   │
                        Accepted → RESCHEDULED → back to APPROVED/CONFIRMED flow
                        (or provider directly reschedules → RESCHEDULED)

(*) reschedule_proposed creation endpoint not fully implemented — see Gap Analysis
● = Terminal state
```

---

## 11. Gap Analysis

### G1 — `reschedule_proposed` is Modelled But Not Fully Routable
**Severity:** Medium  
**Finding:** The status `reschedule_proposed` exists in the state machine and transition map. The notification system has a message for it (`"A new time has been proposed"`). However, there is no dedicated API endpoint or route handler that accepts a proposed new time from the provider and sets the appointment to `reschedule_proposed`. The `PATCH /api/appointments/:id/status` endpoint can set the status, but it doesn't accept or persist a proposed new date/time alongside it.  
**Impact:** The patient-facing reschedule workflow (`reschedule_requested → reschedule_proposed → rescheduled`) is incomplete. Providers can't propose a specific alternative time through the API.  
**Recommendation:** Add `POST /api/appointments/:id/propose-reschedule` accepting `{ proposedDate, proposedStartTime, proposedEndTime }`, persisting them (requires schema columns), setting status to `reschedule_proposed`, and notifying patient.

---

### G2 — `cancelStaleConfirmed()` Used Generic `"cancelled"` and Sent No Patient Notification *(Fixed)*
**Severity:** Critical  
**Finding:** The cron that auto-cancels stale approved/confirmed/rescheduled appointments silently set status to `"cancelled"` with no patient notification. Patients with paid, confirmed appointments could wake up to a disappeared booking with no explanation.  
**Status:** Fixed in this audit — see Section 12.

---

### G3 — Video Endpoints Had No Appointment Status Gate *(Fixed)*
**Severity:** High (Security/Resource)  
**Finding:** Both `/api/video/token` and `/api/video/room/:id` checked `visitType === "online"` and participant identity but did not check appointment status. Cancelled, rejected, expired, and no-show appointments could have new video rooms created and Daily.co API calls made.  
**Status:** Fixed in this audit — see Section 12.

---

### G4 — `cancelStaleConfirmed()` Issues No Refunds
**Severity:** High  
**Finding:** When `cancelStaleConfirmed()` auto-cancels an appointment that was paid (via wallet or Stripe), no refund is processed. A patient who paid for a confirmed appointment and had it auto-cancelled 24h later by the cron receives no money back.  
**Impact:** Financial — patients lose funds on legitimate confirmed bookings that weren't marked complete.  
**Recommendation:** Before setting `cancelled`, check payment status. If `payment.status = "completed"`, issue a wallet refund (or queue a Stripe refund) equivalent to `quoteRefundWithRule` with `actorRole: "admin"` (full refund). This requires non-trivial implementation and should be a dedicated sprint item.

---

### G5 — Invoice Generation Failures Are Silent
**Severity:** Medium  
**Finding:** `createInvoiceForAppointment()` is wrapped in `try/catch` that only logs to `console.error`. If invoice generation fails (jsPDF crash, DB write failure), no admin alert is raised, no retry is queued, and the patient never receives an invoice for a completed visit. `appointments.invoiceGenerated` stays `false`, making it hard to detect missed invoices.  
**Recommendation:** On invoice generation failure, push an admin notification, add to a retry queue, or at minimum write to `system_events` so the monitoring system can detect it.

---

### G6 — Provider Earnings Recording Failure Is Silent
**Severity:** Medium  
**Finding:** `storage.recordProviderEarning()` is wrapped in the same silent `try/catch` pattern. If the earnings record fails (unique constraint issue, DB error), the provider's wallet is not credited and no alert is raised.  
**Recommendation:** Same as G5 — write to `system_events` on failure so the reconciliation cron can catch it.

---

### G7 — No Status Gate on Frontend "Join Call" Button
**Severity:** Low (UX)  
**Finding:** The "Join Call" button on the patient appointment detail page is shown based on `visitType === "online"` alone. The backend now returns 409 for terminal-status appointments, but the frontend does not suppress the button for cancelled/rejected/expired appointments, leading to a confusing user experience (button visible → click → 409 error).  
**Recommendation:** Add `&& !isTerminalStatus(appointment.status)` guard to the Join Call button render condition on the frontend.

---

### G8 — Post-Visit Reminder Sent to Non-Completed Appointments
**Severity:** Low  
**Finding:** `sendPostVisit()` queries for appointments in status `["completed", "confirmed", "approved"]` whose `endTime` was 60–75 minutes ago. This means a patient whose appointment was in `confirmed` (never started, never completed) also receives a "please leave a review" prompt after the scheduled end time. They cannot actually leave a review (no completed visit).  
**Recommendation:** Restrict `sendPostVisit()` to `status = "completed"` only, or suppress the review CTA in the notification for non-completed appointments.

---

### G9 — `rescheduled` Status Has No Clear "Back to Normal Flow" Trigger
**Severity:** Low  
**Finding:** When a provider reschedules an appointment, it moves to `rescheduled`. The state machine allows `rescheduled → approved/confirmed/in_progress`, but there is no business logic that automatically re-evaluates which status the rescheduled appointment should enter. The route handler sets it to `rescheduled` and the frontend must then separately confirm it. This can leave appointments in `rescheduled` indefinitely if the provider doesn't take a follow-up action.  
**Recommendation:** When a reschedule is performed, auto-advance to `confirmed` if payment is already complete, or `approved` if pending. This mirrors the booking auto-confirm logic for wallet payments.

---

### G10 — Duplicate `quoteRefund` Function
**Severity:** Low (Code Quality)  
**Finding:** `server/lib/appointmentActions.ts` contains both `quoteRefund()` (lines 134–185) and `quoteRefundWithRule()` (lines 62–112). `quoteRefundWithRule()` is a strict superset — it accepts an optional DB rule and falls back to the same hardcoded constants. `quoteRefund()` is never called (all routes use `quoteRefundWithRule()`).  
**Recommendation:** Remove `quoteRefund()` to eliminate dead code.

---

## 12. Additional Defects Found & Fixed

### Fix 1 — `cancelStaleConfirmed()` Silent Auto-Cancellation

**Issue:** `cancelStaleConfirmed()` in `server/reminderCron.ts` auto-cancelled approved/confirmed/rescheduled appointments that passed their date >24h ago with no patient notification. Patients discovered missing appointments with no explanation.  
**Impact:** High — patient experience and trust. Paid bookings could disappear silently.  
**Root Cause:** The function was written to only free the time slot and update the DB status, without the notification block that `expireStalePending()` correctly implemented.  
**Fix Applied:** Added `storage.createUserNotification()` call inside the per-appointment loop, matching the pattern used by `expireStalePending()`. The notification tells the patient their appointment was auto-closed and directs them to contact support if they believe it is an error. Failure to send the notification is caught independently and logged without aborting the cancellation.  
**File:** `server/reminderCron.ts`, `cancelStaleConfirmed()` function.  
**Validation:** Reviewed before and after — notification block is now present, wrapped in its own try/catch, will not abort the status update if it fails.

---

### Fix 2 — Video Room Endpoints Created Sessions for Terminal Appointments

**Issue:** `GET /api/video/token` and `GET /api/video/room/:appointmentId` in `server/routes/communication.routes.ts` had no appointment status gate. A cancelled, rejected, expired, or no-show online appointment could have a new video session created via Daily.co API, wasting API quota and potentially leaking access to rooms.  
**Impact:** High — wasted Daily.co room quota; potential UX confusion; minor security concern (room created for a cancelled appointment).  
**Root Cause:** The route checked `visitType === "online"` and participant identity but did not call `isTerminalStatus()`.  
**Fix Applied:** Imported `isTerminalStatus` from `server/lib/appointmentStatus` in `communication.routes.ts`. Added the check immediately before `getOrCreateVideoSession()` in both endpoints. Returns HTTP 409 with a clear message: `"Video session unavailable — appointment is {status}."`.  
**File:** `server/routes/communication.routes.ts`, both video route handlers.  
**Validation:** Import confirmed present. Check fires before any external API call in both handlers.

---

## 13. Launch Readiness Assessment

### ✅ Solid & Production-Ready

| Area | Assessment |
|------|------------|
| State machine | Well-defined. All transitions explicit. Terminal states enforced. Admin bypass is intentional. |
| Booking creation | Robust. Idempotency, conflict detection, duplicate protection, all validations present. |
| Refund policy | Clear and implemented. DB-driven rule override available. Duplicate refund prevention triple-layered. |
| Revenue engine | Single source of truth. Snapshots persisted at booking time. |
| Reminder system | Three-tier reminders (24h, 1h, 15m) + post-visit. In-process memo prevents duplicate sends. |
| Notification delivery | Multi-channel (in-app, email, SMS, WhatsApp, push). Respects user preferences and quiet hours. |
| Chat messaging | Auto-created on booking. Locking on completion (48h) and cancellation (2h) implemented at both WS and REST layers. |
| Authentication | JWT + role-based. Provider access owns-appointment gated. Admin bypass explicit. |
| Multi-tenancy | Country isolation enforced server-side on all appointment queries. |

### ⚠️ Issues Requiring Attention Before Launch

| Priority | Gap | Effort |
|----------|-----|--------|
| **P0** | G4 — Auto-cancelled stale confirmed appointments receive no refund (patients lose money) | Medium |
| **P1** | G1 — `reschedule_proposed` workflow is incomplete (no propose-reschedule endpoint) | Medium |
| **P1** | G7 — Frontend "Join Call" button not suppressed for terminal-status appointments | Small |
| **P2** | G5 — Invoice generation failures are silent (no alert, no retry) | Small |
| **P2** | G6 — Provider earnings recording failures are silent | Small |
| **P2** | G8 — Post-visit review prompt sent to non-completed appointments | Small |
| **P3** | G9 — Rescheduled appointments have no auto-advance logic | Medium |
| **P3** | G10 — Dead `quoteRefund()` function should be removed | Trivial |

### Critical Open Question

**G4 (stale confirmed auto-cancel + no refund)** is the most serious launch blocker. If a patient pays for an appointment and the provider neither shows up nor marks it complete, the system auto-cancels after 24h and the patient loses their money. This must be resolved before going live with real payments.

---

*This report documents actual implemented behavior as of 2026-06-12. All findings verified by direct code inspection. No assumptions made.*
