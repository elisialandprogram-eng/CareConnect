# Patient Booking Flow — Golden Life

End-to-end audit of the patient journey from login through appointment completion.

---

## 1. Authentication

### Login — `POST /api/auth/login`
**File:** `server/routes.ts:648–739`

- Looks up the user by email, verifies password with `bcrypt.compare`.
- Issues a JWT `accessToken` containing `{ id, email, role }` and a random `refreshToken` (persisted to the database).
- Both tokens are set as **HTTP-only cookies** (`accessToken` lines 717–722, `refreshToken` lines 724–729).
- The access token is also returned in the JSON body for clients that prefer header auth.

### Session check — `GET /api/auth/me`
**File:** `server/routes.ts:808–826`

- Protected by the `authenticateToken` middleware (`server/routes.ts:155–215`).
- Middleware reads the token from `Authorization: Bearer …` **or** from the `accessToken` cookie.
- Verifies with `jwt.verify(token, JWT_SECRET)`.
- Uses an in-process `userAuthCache` to avoid a DB round-trip per request.
- Blocks if email is unverified, the user is suspended, or a provider is not approved.

### Client-side storage
- `client/src/lib/auth.tsx` and `client/src/lib/queryClient.ts:36, 58` use `credentials: "include"` so cookies travel automatically with every request.

---

## 2. Booking Entry Points

There are **two parallel entry points**:

| Entry point             | File                                        | When used                                                         |
| ----------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| Step-by-step wizard     | `client/src/pages/book-wizard.tsx:90` (`/book`, `/book-wizard`) | "Book" CTA from patient dashboard            |
| Direct booking page     | `client/src/pages/booking.tsx`              | Linked from a provider profile with `?providerId=…&serviceId=…`   |

The wizard drives a 6-step state machine (`step` state, line 97):

| Step | API call                                                  | Wizard line |
| ---- | --------------------------------------------------------- | ----------- |
| 0. Category        | `GET /api/categories`                              | 123 |
| 1. Sub-service     | `GET /api/sub-services?category={slug}`            | 128 |
| 2. Provider        | `GET /api/providers?subServiceId={id}`             | 134 |
| 3. Practitioner *(skipped if none)* | `GET /api/providers/{id}/practitioners` | 140 |
| 4. Date & time     | `GET /api/providers/{id}/available-slots?date=YYYY-MM-DD` | 146 |
| 5. Confirm         | `POST /api/pricing/quote`                          | 164 |
| Submit             | `POST /api/appointments`                           | 176 |

Local state: `selectedCategory`, `selectedSub`, `selectedProvider`, `selectedPract`, `selectedDate`, `selectedSlot` (lines 98–103).

---

## 3. Pricing

### Endpoint — `POST /api/pricing/quote`
**File:** `server/routes.ts:2535`

Inputs: `serviceId`, `practitionerId?`, `visitType` (`online | home | clinic`), `sessions`, `isEmergency`, `surgeMultiplier`, `discount`, `promoCode`.

Loads the per-provider service + linked global sub-service, applies any practitioner fee override, validates the promo code, then delegates to `computeFinalPrice`.

### Engine — `computeFinalPrice`
**File:** `server/lib/pricing.ts:64`

```
base        = service.price ?? subService.basePrice   (× duration if hourly)
platformFee = service.platformFeeOverride ?? subService.platformFee
visitFee    = service.{home,clinic,telemedicine}Fee   (per visitType)
emergency   = service.emergencyFee (if isEmergency)
surge       = (base + visitFee) × (surgeMultiplier - 1)
subtotal    = (base + platformFee + visitFee + surge + emergency) × sessions
discount    = fixed amount  OR  percent of pre-tax subtotal
taxable     = subtotal - discount
tax         = taxable × subService.taxPercentage
total       = taxable + tax
```

Returns a `PricingBreakdown` (numeric components + `lines[]` for UI).

---

## 4. Availability & Slot Selection

### Endpoint — `GET /api/providers/:id/available-slots?date=YYYY-MM-DD`
**File:** `server/routes.ts:1704–1732`

How the result is built:

1. `storage.getTimeSlotsByProvider(id, date)` — explicit rows from the `timeSlots` table.
2. `storage.getProviderBookedStartTimes(id, date)` — start times of all non-cancelled / non-rejected appointments on that date.
3. Merge: a slot is `isBooked` if its row says so OR its start time appears in the booked-start-times set.

How slots are created in the first place: providers publish a weekly grid (`client/src/components/weekly-schedule-grid.tsx`) which calls `POST /api/availability/bulk` (`server/routes.ts:2103`), generating explicit `timeSlots` rows for the chosen dates.

---

## 5. Booking Creation

### Endpoint — `POST /api/appointments`
**File:** `server/routes.ts:2660–3154`

**Payload accepted (line 2662):**
`providerId, serviceId, practitionerId?, date, startTime, endTime, visitType, paymentMethod, notes?, patientAddress?, patientLatitude?, patientLongitude?, totalAmount, promoCode?, contactMobile?, familyMemberId?, saveAddressToProfile?`

**Validations (in order):**

| Check                                                                              | Lines       |
| ---------------------------------------------------------------------------------- | ----------- |
| `familyMemberId` (if present) belongs to caller                                    | 2667–2673   |
| Read calling patient profile + provider                                            | 2683, 2703  |
| No overlapping appointment for the **provider** at that time                       | 2712        |
| No overlapping appointment for the **patient** at that time                        | 2727        |
| If `practitionerId` given → must be assigned to `serviceId` (`service_practitioners`) | 2748–2755 |
| Service belongs to provider, not deleted, `isActive`                               | 2768–2776   |
| Promo code valid + capacity (increments `usedCount`)                               | 2789, 2803  |

### Atomic slot reservation — `storage.reserveTimeSlot`
**File:** `server/storage.ts:2462–2514`

- Wrapped in a DB transaction.
- Acquires `pg_advisory_xact_lock(hash(provider, date, startTime))` (line 2468) — serializes any concurrent attempt for the same slot.
- `SELECT … FOR UPDATE` on existing row, refuses if `isBooked || isBlocked`.
- Updates existing row to `isBooked = true` or inserts a new one.
- Catches PG `23505` unique-constraint races and returns 409.

### Side-effects, in execution order

1. Insert `appointments` row, status = `"pending"` (line 2899).
2. Optionally update saved address on the user (line 2913).
3. Insert `payments` row, payment_status = `"pending"` (line 2926).
4. **Wallet path:** debit wallet + log txn → set payment_status = `"completed"` (lines 2945–2962).
5. **Stripe path:** create Stripe Checkout session, return `checkoutUrl` (lines 2981–2993). Status flips later via webhook.
6. Insert two `user_notifications` rows: "Booking Received" (patient), "New Appointment Request" (provider) (lines 3009–3024).
7. Open or fetch a chat conversation (line 3033).
8. `notify.appointmentBooked` + `dispatchNotification` for push/SMS/email to provider (lines 3044–3078).
9. Send patient confirmation email via Resend with an `.ics` calendar invite (lines 3106, 3141).

---

## 6. Appointment State Machine

### Source of truth — `server/lib/appointmentStatus.ts`

**Statuses (lines 14–28):** `pending`, `approved`, `confirmed`, `in_progress`, `completed`, `cancelled`, `cancelled_by_patient`, `cancelled_by_provider`, `rejected`, `expired`, `no_show`, `rescheduled`, `reschedule_requested`, `reschedule_proposed`.

**Helpers:**

- `isTerminalStatus(s)` (lines 73–75) — `completed | cancelled* | rejected | expired | no_show`.
- `canTransition(current, next)` (lines 81–86) — rejects self-transitions; consults a `TRANSITIONS` map.
- `nextStatusesFor(current)` (lines 92–94) — used by UI to enable/disable action buttons.

### Transition endpoints

| Endpoint                                | File · lines                       | Behaviour                                                                                                                                                  |
| --------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/appointments`                | routes.ts:2660–3154                | Creates with `pending`                                                                                                                                     |
| `PATCH /api/appointments/:id/status`    | routes.ts:3181–3306                | General driver: `confirm`, `complete`, `reschedule_*`, `expire`, `no_show`. Patient is restricted to `cancelled`, `cancelled_by_patient`, `reschedule_requested` (3222–3224). Triggers invoice on `completed` (3239–3241). |
| `PATCH /api/appointments/:id/cancel`    | routes.ts:3659–3694                | Sets `cancelled` and **releases the reserved slot**.                                                                                                       |
| `POST /api/appointments/cleanup`        | routes.ts:3621–3656                | Auto-cancels stale `pending` (past start) and stale `approved/confirmed/rescheduled` (>24h past end).                                                      |
| `PATCH /api/admin/bookings/:id`         | routes.ts:4167–4190                | Admin override — bypasses `canTransition`.                                                                                                                 |
| Stripe webhook                          | `server/stripeWebhook.ts:89–97`    | On `checkout.session.completed` → payment_status=`completed` and appointment→`confirmed`.                                                                  |

---

## 7. Invoicing & Payment

| Phase             | Where                          | What happens                                                                                                                            |
| ----------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Booking created   | routes.ts:2926                 | `payments` row inserted with `pending`                                                                                                  |
| Wallet flow       | routes.ts:2945–2962            | Wallet debited → payments→`completed` (appointment stays `pending`)                                                                     |
| Stripe checkout   | routes.ts:2981–2993            | `checkoutUrl` returned to client                                                                                                        |
| Stripe webhook    | stripeWebhook.ts:89–97         | payments→`completed`, appointment→`confirmed`                                                                                           |
| Marked completed  | routes.ts:3239–3241            | `createInvoiceForAppointment` (`server/utils/invoice-helper.ts:16`) computes price + tax, creates invoice record, emails patient with PDF (lines 104–139) |

---

## 8. Notifications

- **In-app** (`user_notifications` table): on booking, on status change.
- **Multi-channel** (`notify.appointmentBooked`, `dispatchNotification`): push/SMS/email to provider on new booking.
- **Email** via Resend: patient booking confirmation + `.ics` calendar invite; invoice email on completion.
- **Cron** (`reminderCron`): 5-minute tick (1h / 15m / post-visit) and hourly tick (24h) reminders.

---

## 9. End-to-End API Sequence (happy path)

```
1.  POST  /api/auth/login                       → cookie set, user object returned
2.  GET   /api/auth/me                          → session check on app boot
3.  GET   /api/categories
4.  GET   /api/sub-services?category=…
5.  GET   /api/providers?subServiceId=…
6.  GET   /api/providers/:id/practitioners      (skipped if provider has none)
7.  GET   /api/providers/:id/available-slots?date=…
8.  POST  /api/pricing/quote                    → live price breakdown
9.  POST  /api/appointments                     → status=pending, payment=pending
        ├─ wallet:  payment→completed (status stays pending)
        └─ stripe:  returns checkoutUrl
10. (Stripe) webhook /api/webhooks/stripe       → payment→completed, status→confirmed
11. PATCH /api/appointments/:id/status (provider, "confirmed")     ← wallet path
12. PATCH /api/appointments/:id/status (provider, "in_progress")   (optional)
13. PATCH /api/appointments/:id/status (provider, "completed")     → invoice generated & emailed
14. POST  /api/reviews                          (patient leaves review)
```

---

## 10. Inconsistencies & Gaps

> **Status legend:** ✅ fixed · ⏭ deferred · ⏳ open

1. ⏭ **Two parallel booking UIs.** `book-wizard.tsx` (wizard) and `booking.tsx` (direct page) both call the same APIs but with separate code paths — easy for one to drift. Consolidating into a single page is a multi-day refactor; deferred.

2. ✅ **Wallet path now auto-confirms.** After a successful wallet debit, `POST /api/appointments` calls `updateAppointment(id, { status: "confirmed" })` so wallet bookings reach the same state as a successful Stripe payment. Patient notification text is conditional on the resulting status.

3. ✅ **Stripe race / abandoned checkouts** — covered by the cleanup scheduler (#4). Stale `pending` Stripe rows now expire (and free their slot) every 5 minutes via `expireStalePending` in `reminderCron`.

4. ✅ **Cleanup is scheduled.** `expireStalePending` runs every 5 min as part of `tick()`; a new `cancelStaleConfirmed` also auto-cancels approved/confirmed/rescheduled appointments more than 24h past their date and frees their slot. The HTTP endpoint stays as a manual trigger.

5. ✅ **Practitioner required when assigned.** `POST /api/appointments` now refuses the booking if the chosen service has any active `service_practitioners` rows but the request omits `practitionerId`. If the service has none, the field stays optional.

6. ⏭ **Invoice on payment success.** Product decision — left as "invoice on completion" for now. Revisit once receipts/invoices are split into separate documents.

7. ✅ **`completed` is gated on payment.** `PATCH /api/appointments/:id/status` rejects the transition to `completed` unless `payments.status === "completed"`. Admins can override.

8. ✅ **401 console spam silenced.** `client/src/lib/auth.tsx` no longer logs the expected pre-login 401 from `/api/auth/me`; it still logs real network/parse errors.

9. ✅ **Slot release on every terminal transition.** `PATCH /api/appointments/:id/status` now releases the time slot whenever the new status is `cancelled`, `cancelled_by_patient`, `cancelled_by_provider`, `rejected`, `expired`, or `no_show`. Cron-driven expirations and stale cancellations free the slot too.

10. ✅ **Idempotency-Key supported on `POST /api/appointments`.** Clients can send `Idempotency-Key: <uuid>`; matching keys (per user) within 10 minutes return the original response instead of creating a second appointment. In-memory cache — single-process only; swap for shared storage if scaling out.
