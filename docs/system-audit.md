# Golden Life — Full System Audit

_Date: 2026-04-29_

A full-stack audit of the frontend, backend, and database. This report is organized by section and ends with a prioritized fix list.

---

## 1. Frontend Routing

### Routes registered in `client/src/App.tsx`
All 32 page files in `client/src/pages` are registered. There are **no orphaned pages**. Routing uses `wouter` with lazy-loading.

### Notable routing observations
- **No route-level guards**: `App.tsx` does not wrap routes in auth/role guards. Protection is done implicitly inside individual pages via `useAuth()`. This is fragile — a forgotten check leaves a page unauthenticated. Consider adding `<RequireAuth role="admin">` style wrappers.
- **Duplicate aliases**: `/dashboard` and `/patient/dashboard` both render `PatientDashboard`. `/book` and `/book-wizard` both render `BookWizard`. `/booking` redirects to `/book`. These are intentional but could be consolidated.
- **Hash fragments**: `support-tickets.tsx` links to `/about#contact`. `wouter` does not natively scroll to hash anchors — this link does nothing visible.
- **Admin sub-routes are sparse**: only `/admin` and `/admin/stale-bookings` exist. Many admin features live as tabs inside `/admin` rather than addressable URLs (no deep-linking).

---

## 2. API Audit

### Endpoint inventory
~110 endpoints registered, primarily in `server/routes.ts`. They cover: auth (11), appointments (8), invoices (5), services & providers (12), health & medical (10), chat (7), wallet (3), admin (12), Stripe webhook, AI integrations.

### Frontend → Backend mismatches (BROKEN CALLS)

| Frontend Call | Status | Notes |
|---|---|---|
| `POST /api/wallet/topup` (used in `wallet.tsx`) | ❌ Missing | No handler. Wallet can be debited, but the user-facing top-up flow has no server route. |
| `POST /api/chat/messages` (used in `messages.tsx`) | ❌ Missing | Chat sends are routed through WebSocket only. The HTTP fallback is dead. |
| `POST /api/auth/change-password` (used in `settings.tsx`) | ⚠ Mismatch | Real route is `POST /api/auth/reset-password`. The settings page silently fails. |
| `GET /api/appointments/:id/action-quote` (used in `AppointmentActionDialog.tsx`) | ❌ Missing | Frontend tries to fetch refund/reschedule fee preview; logic exists in `appointmentActions.ts` but isn't exposed. Cancel/reschedule UI shows no quote. |

### Backend → Frontend mismatches (DEAD CODE)

| Backend Endpoint | Issue |
|---|---|
| `POST /api/admin/invoices/generate-pending` | Implemented, no UI trigger |
| `POST /api/sub-services/:id/restore` | Restore archived sub-services — no UI |
| `GET /api/admin/catalog-services` | Frontend uses public `/api/catalog-services` instead |
| `POST /api/admin/categories/:id/restore` | No UI |
| `GET /api/admin/notification-logs` | No admin UI panel |
| `GET /api/invoices/by-appointment/:appointmentId/download` | Convenience route never called |

### Inconsistent admin/non-admin endpoint pairs
- Bookings: `GET /api/appointments/{patient,provider}` vs `GET /api/admin/bookings` and `PATCH /api/appointments/:id` vs `PATCH /api/admin/bookings/:id` (admin path bypasses state-transition validation).
- Status transitions: legacy `PATCH /api/appointments/:id/status` coexists with newer `POST /api/appointments/:id/action`. Mix of approaches across the codebase.

---

## 3. Database Validation

Schema: **59 tables**, **16 enums**.

### (a) Columns referenced in code but NOT in schema — runtime risk
- `routes.ts` line 570 reads `provider.experienceYears`, but the `providers` table only has `yearsExperience`. **Will crash at runtime when this branch executes.**
- `routes.ts` lines 550–606 reference `appointments.*` (status, date, practitionerId, updatedAt, privateNote) directly, but the table is **not imported**. TypeScript flags 12 errors here. **Runtime: any request hitting `GET /api/services/:serviceId/auto-practitioner` or the stale-cleanup branch will throw.**

### (b) Tables referenced in code that don't exist
None.

### (c) Dead tables
- `video_sessions` — imported in `storage.ts` but no read/write paths. (Video uses Daily.co room IDs cached on the appointment instead.)
- `service_categories` — has `IStorage` methods but is shadowed by `categories`, which is what the UI uses.

### (d) Magic-string / enum drift
- `providers.status` is plain `text`. Code compares against the literals `"active"`, `"approved"`, `"pending"`. Should be a Postgres enum to prevent typos.
- `payment.status` checked against `"paid"` in code; the enum value is `"completed"`.
- `invoices.status` is plain `text` with default `"paid"` — not constrained.

### (e) Missing foreign keys (referential integrity gaps)
- `appointments.family_member_id` → no FK to `family_members.id`. Orphan rows possible.
- `appointments.parent_appointment_id` → no self-FK to `appointments.id`. Reschedule history can dangle.
- `medication_logs` does not carry `family_member_id`; only reachable through the parent medication.

---

## 4. Feature Map: UI → API → DB

| Feature | UI page/component | API | Tables | Status |
|---|---|---|---|---|
| **Patient — Discover providers** | `providers.tsx`, `provider-profile.tsx` | `GET /api/providers`, `GET /api/providers/:id`, `GET /api/providers/:id/reviews` | `providers`, `users`, `reviews` | ✔ Working |
| **Patient — Browse services** | `services.tsx` | `GET /api/browse/services`, `GET /api/categories` | `categories`, `catalog_services`, `sub_services`, `services` | ✔ Working |
| **Patient — Booking wizard** | `book-wizard.tsx` | `GET /api/providers/:id/available-slots`, `POST /api/appointments` | `appointments`, `time_slots`, `services`, `practitioners` | ✔ Working |
| **Patient — Cancel/Reschedule appointment** | `AppointmentActionDialog.tsx` | `POST /api/appointments/:id/action`, **`GET /api/appointments/:id/action-quote` (missing)** | `appointments` | 🧩 Quote endpoint missing → no fee preview |
| **Patient — Pay with wallet** | `wallet.tsx`, `book-wizard.tsx` | `POST /api/wallet/pay-appointment` works; **`POST /api/wallet/topup` missing** | `wallets`, `wallet_transactions` | ❌ Top-up broken |
| **Patient — Reviews** | `review.tsx` | `POST /api/reviews` | `reviews` | ✔ Working |
| **Patient — Health metrics / family / meds** | `patient-dashboard.tsx` tabs | `/api/health-metrics`, `/api/family-members`, `/api/medications`, `/api/medication-logs` | `health_metrics`, `family_members`, `medications`, `medication_logs` | ✔ Working (FK gap on family_member_id) |
| **Patient — Chat with provider** | `messages.tsx` | WebSocket via `/ws/chat`; **HTTP `POST /api/chat/messages` is dead** | `chat_conversations`, `chat_messages` | ⚠ Frontend HTTP fallback broken |
| **Patient — Settings password change** | `settings.tsx` | Calls `POST /api/auth/change-password`; **real path is `/reset-password`** | `users` | ❌ Broken |
| **Patient — Support tickets** | `support-tickets.tsx` | `/api/support/tickets/*` | `support_tickets`, `support_messages` | ✔ Working |
| **Provider — Onboarding** | `provider-setup.tsx` | `POST /api/provider/setup` | `providers` | ✔ Working (just fixed checkbox bug) |
| **Provider — Manage services** | `provider-dashboard.tsx` services tab | `GET/POST/PATCH/DELETE /api/services` | `services`, `sub_services` | ✔ Working |
| **Provider — Office hours / availability** | `provider-dashboard.tsx`, `assign-services-dialog.tsx` | `GET/PATCH /api/provider/office-hours`, `/api/availability/*` | `availability_slots`, `time_slots` | ✔ Working |
| **Provider — Approve/complete appointment** | `provider-dashboard.tsx` | `PATCH /api/appointments/:id/status` (legacy) and `POST /api/appointments/:id/action` (new) | `appointments` | ⚠ Two parallel transition paths |
| **Provider — Analytics** | `provider-dashboard.tsx` | `GET /api/provider/me` (stats inside) | `appointments`, `invoices` | ✔ Working |
| **Provider — Mark payment received** | `provider-dashboard.tsx` | `PATCH /api/appointments/:id/payment-status` | `appointments` | ✔ Working |
| **Admin — User management** | `admin-dashboard.tsx` | `GET /api/admin/users`, `PATCH /api/admin/users/:id/suspend` | `users` | ✔ Working |
| **Admin — Provider verification** | `admin-dashboard.tsx` | `GET /api/admin/providers`, `PATCH /api/admin/providers/:id` | `providers` | ✔ Working (string-based status) |
| **Admin — Service catalog** | `service-catalog-hierarchy.tsx`, `assign-services-dialog.tsx` | `GET/POST /api/categories`, `/api/catalog-services`, `/api/sub-services`; admin variants exist but unused | `categories`, `catalog_services`, `sub_services` | ⚠ Duplicate admin endpoints unused |
| **Admin — Stale bookings** | `admin-stale-bookings.tsx` | `GET /api/admin/stale-bookings` | `appointments` | ❌ Likely 500 — uses unimported `appointments` symbol in routes.ts (lines 595–606) |
| **Admin — Broadcasts** | `admin-dashboard.tsx` | `POST /api/admin/broadcasts` | `notifications` | ✔ Working |
| **Admin — Analytics** | `admin-dashboard.tsx` | `GET /api/admin/analytics` | many | ✔ Working |
| **Admin — Notification logs** | _no UI_ | `GET /api/admin/notification-logs` | `notification_logs` | 🧩 Backend exists, no frontend |

---

## 5. Duplication Check

1. **Service definitions live at four levels**: `categories` → `catalog_services` → `sub_services` → provider-specific `services`. Pricing can be set at every level (defaults on sub-service, overrides on provider service, and `admin_price_override` on top). The hierarchy is justified, but the override resolution is implicit and undocumented. **Recommendation**: document the resolution order in `pricing.ts`; centralize all reads through `computeFinalPrice`.
2. **Booking flows**: a single `BookWizard` exists; `/booking` legacy alias redirects. The `replit.md` doc still mentions a "classic" flow that no longer exists.
3. **Pricing computation**: `computeFinalPrice` is called from `routes.ts` on appointment creation and from `invoice-helper.ts` on invoice generation. Client-side preview likely re-computes. Consider exposing `GET /api/services/:id/price-preview?visitType=…&promoCode=…` and consuming it everywhere.
4. **Appointment state transitions**: legacy `PATCH /api/appointments/:id/status` and new `POST /api/appointments/:id/action`. The legacy path partially guards against bad transitions, the new one validates centrally. **Recommendation**: deprecate the PATCH route; have it forward to the action handler.
5. **Admin vs public endpoint pairs** (categories/catalog-services/bookings/users): the admin variants frequently duplicate the public ones with looser checks. Consolidate behind one route + role-aware response.
6. **Direct `db.select()` in routes.ts** vs the storage abstraction. ~12 places in `routes.ts` (especially line 550+) bypass storage. This is also the source of the `appointments` import bug.

---

## 6. End-to-End Flow Verification

| Flow | Steps verified | Result |
|---|---|---|
| Patient: book → cancel | `POST /api/appointments` → `POST /api/appointments/:id/action` | ✔ Works, but no fee preview (missing quote endpoint) |
| Patient: book → reschedule | `POST /api/appointments` → action `reschedule` | ✔ Works. `parent_appointment_id` set without FK enforcement. |
| Patient: book → complete → review | provider triggers complete; patient routes to `/review/:id` | ✔ Works |
| Patient: wallet top-up → pay | top-up endpoint missing | ❌ Top-up broken |
| Provider: receive request → approve → in-progress → complete | `POST /api/appointments/:id/action` | ✔ Works |
| Admin: create category → assign sub-service → assign to provider | `/api/categories` + `/api/sub-services` + `/api/admin/providers/:id/assign-services` | ✔ Works |
| Admin: monitor stale bookings | `GET /api/admin/stale-bookings` | ❌ Broken — `appointments` table not imported in `routes.ts` (TypeScript errors confirm runtime crash) |

---

## 7. Error Check (Runtime / TypeScript)

### Critical (will crash in production)
- `server/routes.ts` lines 550–606: 12× `Cannot find name 'appointments'`. Two endpoint branches affected:
  - `GET /api/services/:serviceId/auto-practitioner` (auto-pick best practitioner)
  - The "stale bookings" admin listing
- `server/routes.ts` line 570: `provider.experienceYears` does not exist; column is `yearsExperience`. Same handler will throw `undefined` access in non-strict mode but is mis-typed in TS.

### Important (typing / state errors)
- `server/lib/appointmentStatus.ts:30` — `Set<string>` not assignable to `ReadonlySet<AppointmentStatus>`. Status validation may accept invalid values.
- `client/src/pages/provider-dashboard.tsx:1746–1750` — passes `"confirmed"` to a status setter typed only for `"approved" | "cancelled" | "rejected"`. The "confirm" button likely no-ops for some appointments.
- `client/src/pages/providers.tsx:390` — filter state set without `q` field. Search filter resets when other filters change.
- `client/src/components/service-catalog-hierarchy.tsx:81` — `pricingType` typed as `string` but expected `"fixed"`.
- `client/src/pages/book-wizard.tsx:479` — `<Button variant="link">` not in the variant union.
- `client/src/components/assign-services-dialog.tsx:79,85` — Map iteration without downlevel iteration; sort callbacks lack types.
- `server/routes.ts:1881` — Set iteration without downlevel iteration.

### tsconfig
- `target` is below `es2015`, hence the iteration warnings. Bumping to `ES2020` (or enabling `downlevelIteration`) removes a class of issues.

---

## 8. Output Report — Summary

### ✔ Working features
- Auth (register, login, JWT refresh, email OTP, forgot/reset password)
- Provider directory & search
- Service catalog browsing & booking wizard
- Appointment creation, approve/complete via action route
- Reviews, family members, health metrics, medications
- Wallet pay-for-appointment
- Invoices generation & download
- Provider onboarding, service & availability management
- Admin user management, broadcasts, analytics, service catalog hierarchy
- Multi-language UI, dark mode, notifications fan-out

### ❌ Broken features
1. **Wallet top-up** — frontend calls a non-existent endpoint.
2. **Settings password change** — wrong endpoint name; silently fails.
3. **Admin stale-bookings page** — handler references unimported `appointments` table → runtime crash.
4. **Provider auto-practitioner picker** — same import bug; will throw on call.
5. **Cancel/Reschedule fee quote** — frontend expects an endpoint that doesn't exist; user has no visibility into the fee.

### ⚠ Inconsistent logic
- Two parallel appointment-transition routes (`PATCH …/status` vs `POST …/action`).
- Provider/payment/invoice statuses use plain `text` columns with magic-string comparisons.
- Admin endpoints mirror public ones inconsistently.
- `provider.experienceYears` vs `provider.yearsExperience` naming mismatch.
- `pricingType` typed as `string` in some components, enum in schema.

### 🧩 Missing connections / dead code
- Admin notification-logs UI — backend exists, no frontend.
- Bulk invoice generation — backend exists, no admin trigger.
- Sub-service / category restore — backend exists, no UI.
- `video_sessions` table — defined, never read or written.
- `service_categories` table — shadowed by `categories`.
- HTTP `POST /api/chat/messages` not implemented (chat is WS-only — fine, but the dead call in `messages.tsx` should be removed).

---

## 9. Prioritized Fix List

### 🔴 Critical (fix immediately — runtime crashes or broken core flow)
1. **Import `appointments` in `server/routes.ts`** (top of file). Eliminates 12 TS errors; fixes admin stale-bookings and auto-practitioner endpoints.
2. **Fix `experienceYears` → `yearsExperience`** in `server/routes.ts:570`.
3. **Implement `POST /api/wallet/topup`** (Stripe Checkout session → webhook → wallet credit). Without it, the wallet is one-way.
4. **Rename `POST /api/auth/change-password`** call in `settings.tsx` to `POST /api/auth/reset-password` (or add the alias on the server).

### 🟠 Important (within the next sprint)
5. **Add `GET /api/appointments/:id/action-quote`** to surface refund/reschedule fees in the dialog.
6. **Add route guards in `App.tsx`** so admin pages can't be reached unauthenticated, even briefly.
7. **Convert `providers.status`, `invoices.status`, free-text statuses to proper Postgres enums.** Add a migration.
8. **Add missing FKs**: `appointments.family_member_id`, `appointments.parent_appointment_id`.
9. **Deprecate `PATCH /api/appointments/:id/status`** — forward to the action handler to consolidate state transitions.
10. **Bump tsconfig target to ES2020** (or set `downlevelIteration: true`) to clear iteration errors.
11. **Fix the typed bug in `provider-dashboard.tsx:1746`** — extend the union to include `"confirmed"` (or use a shared `AppointmentStatus` type).
12. **Fix `providers.tsx:390` filter setter** to keep `q` in state.

### 🟡 Minor (cleanup / clarity)
13. **Drop dead tables**: `video_sessions`, `service_categories` (after confirming no dormant feature).
14. **Drop dead frontend call** to `POST /api/chat/messages` and rely on WebSocket only.
15. **Add admin UI** for notification logs and bulk invoice generation, OR remove the unused endpoints.
16. **Document pricing override resolution order** in `server/lib/pricing.ts`.
17. **Update `replit.md`** to remove the reference to the "classic single-page booking flow" that no longer exists.
18. **Add deep-linkable admin sub-routes** (e.g., `/admin/users`, `/admin/providers`, `/admin/catalog`).
19. **Refactor direct `db.select()` calls in `routes.ts`** into `storage.ts` methods for consistency.
20. **Add `q` filter scroll-to-top behavior** and review hash anchor (`/about#contact`) handling.
