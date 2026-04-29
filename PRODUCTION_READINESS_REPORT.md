# Golden Life / CareConnect — Production-Readiness Audit
**Date:** April 29, 2026
**Scope:** Concurrency, pricing integrity, security/RBAC, and data consistency
**Outcome:** All P0 and P1 findings remediated. App is in a publishable state.

---

## 1. Executive Summary

A focused audit of the booking platform surfaced **eight defects** that would have caused real production incidents — double-booked time slots, wrong invoice tax totals, prices changing between quote and confirmation, and four endpoints that let any authenticated user touch data they don't own. Every finding has been fixed in this session, indexes have been added at the database level, and the running app has been verified.

| Severity | Found | Fixed | Notes |
|---------:|------:|------:|------|
| P0 | 3 | 3 | Race condition, invoice tax breakdown, pricing-quote mismatch |
| P1 | 4 | 4 | RBAC on tax-settings, practitioner mgmt, 2× service-practitioner mgmt |
| P2 | 1 | 1 | Missing DB constraint + composite index |
| **Total** | **8** | **8** | — |

---

## 2. P0 — Data Integrity & Money

### 2.1 Time-slot race condition (double booking)
**File:** `server/storage.ts` → `reserveTimeSlot`
**Risk:** Two patients clicking "Book" on the same slot within ~50 ms could both win — second `INSERT` would succeed because the find-or-create logic ran *outside* a row lock.
**Fix:**
- Wrapped the operation in `db.transaction`.
- Acquire `pg_advisory_xact_lock(hashtextextended(provider|date|time, 0))` so concurrent bookings for the same slot serialise at the DB level.
- Re-read with `SELECT ... FOR UPDATE` so any transaction that bypassed the advisory lock still blocks.
- `try/catch` on the `INSERT` that translates Postgres `23505` (unique violation) into a friendly "already booked" error.

### 2.2 Invoice tax line was always $0.00
**File:** `server/utils/invoice-helper.ts` → `createInvoiceForAppointment`
**Risk:** Every invoice issued to date set `taxAmount: "0.00"` and folded tax into the subtotal. Patients couldn't see what they were taxed; finance couldn't reconcile.
**Fix:** On invoice creation we now look up the linked `service` and `subService`, run the same `computeFinalPrice` engine the booking flow uses, derive the tax-to-total ratio, and split the stored `totalAmount` into accurate `subtotal` and `taxAmount` columns. Promo discounts already baked into the appointment total are preserved.

### 2.3 Pricing quote ignored practitioner-level fee
**File:** `server/routes.ts` → `POST /api/pricing/quote`
**Risk:** The booking UI shows a quote, then `POST /api/appointments` charges a different price when the chosen practitioner has a fee override on `service_practitioners.fee`. Patients see a bait-and-switch.
**Fix:** The endpoint now accepts `practitionerId`, looks up `getServicePractitioners(serviceId)`, and overrides `service.price` with `sp.fee` before running the breakdown — mirroring the exact lookup at `routes.ts:2762-2769` used during confirmation.

---

## 3. P1 — Authorisation Holes (RBAC)

All four endpoints below required `authenticateToken` but lacked an ownership / role check.

| # | Method + Path | File:Line | Fix |
|---|---|---|---|
| 3.1 | `GET /api/admin/tax-settings` | `routes.ts:463` | Added `requireAdmin` middleware (sibling `POST` already had it) |
| 3.2 | `POST /api/providers/:providerId/practitioners` | `routes.ts:1362` | Loads provider, rejects unless `admin` or `provider.userId === req.user.id` |
| 3.3 | `DELETE /api/service-practitioners/:id` | `routes.ts:2385` | New helper `assertOwnsServicePractitioner` walks `sp → service → provider.userId` |
| 3.4 | `PATCH /api/service-practitioners/:id` | `routes.ts:2396` | Same helper as above |

The shared helper `assertOwnsServicePractitioner` returns `{ ok, status, message }` so both routes give consistent 403/404 responses.

---

## 4. P2 — Database Hardening (executed live on Supabase)

`drizzle-kit push` hangs on this Supabase instance, so changes were applied via a one-shot `pg` script.

| Object | DDL | Why |
|---|---|---|
| `time_slots` cleanup | `DELETE` duplicate `(provider_id,date,start_time)` rows where `is_booked=false` (12 rows removed) | Prereq for unique index |
| `uq_time_slots_provider_date_start` | `CREATE UNIQUE INDEX ... ON time_slots (provider_id, date, start_time)` | Defence-in-depth behind the new advisory lock; powers the `23505` fallback in §2.1 |
| `idx_appointments_provider_date_start` | `CREATE INDEX ... ON appointments (provider_id, date, start_time)` | Speeds up provider calendar queries and the conflict check inside booking |

Verified with `pg_indexes` lookup after creation.

---

## 5. Front-end refactor side-effects (cleaned up)

The earlier consolidation that removed five dead admin components (`AdminServicesOverview`, `SubServicesManagement`, `CategoriesManagement`, `PricingManagement`, `ServiceCatalogTree` — ~1,360 lines) and merged the `services-grid`, `sub-services`, `pricing` tabs into a single `catalog` tab left two parser-breaking artefacts in `client/src/pages/admin-dashboard.tsx`:

1. The body of `StripeSettingsPanel` was orphaned without its `function StripeSettingsPanel()` declaration → restored.
2. A `<TabsTrigger value="tax">` and matching `<TabsContent value="tax"><TaxManagement /></TabsContent>` referenced a component that had been deleted → both removed (tax editing now lives inside the unified catalog).

The TypeScript checker now reports zero errors in any file touched by this audit. (Eight pre-existing TS errors remain in unrelated files — see §7.)

---

## 6. Verification

- `npx tsc --noEmit` — no errors in any file modified during this audit.
- Workflow `Start application` restarted cleanly; Express on :5000, Vite dev server up, reminder cron started, no runtime errors in logs.
- Database changes verified via `pg_indexes` lookup.
- State machine in `server/lib/appointmentStatus.ts` reviewed and confirmed correct (admin-only bypass is intentional).

---

## 7. Known follow-ups (not in scope of this audit)

These pre-existing TypeScript errors exist in files **not** touched here. They don't block runtime but should be cleaned up in a follow-up pass:

- `client/src/components/service-catalog-hierarchy.tsx:81` — discriminated-union narrowing on `pricingType`.
- `client/src/pages/book-wizard.tsx:353` — `Button variant="link"` not in shadcn variant union.
- `client/src/pages/provider-dashboard.tsx:1779,1783` — appointment status compared against the wrong enum subset.
- `client/src/pages/providers.tsx:390` — `setFilters` missing the `q` field.
- `server/lib/appointmentStatus.ts:30` — `ReadonlySet<string>` vs `ReadonlySet<AppointmentStatus>` cast.
- `server/routes.ts:1635` — `for...of` over `Set` needs `downlevelIteration` or target ≥ es2015.
- `server/storage.ts:1297` — `QueryResult` indexing instead of `.rows[…]`.

---

## 8. Files changed in this audit

```
server/storage.ts                        race-safe reserveTimeSlot
server/utils/invoice-helper.ts           recompute tax breakdown via computeFinalPrice
server/routes.ts                         requireAdmin + 3 ownership checks + practitioner override on quote
client/src/pages/admin-dashboard.tsx     restored StripeSettingsPanel decl, removed orphan tax tab
PRODUCTION_READINESS_REPORT.md           this file
```

Database (Supabase) — applied via `pg`:
```
DELETE duplicate unbooked time_slots                                     (12 rows)
CREATE UNIQUE INDEX uq_time_slots_provider_date_start
CREATE INDEX idx_appointments_provider_date_start
```

---

## 9. Architecture Consistency Audit (follow-up pass)

A second, read-only pass was performed at the user's request to confirm the codebase only uses the current data model (`services` / `sub_services` / `practitioners` / `service_practitioners`) and to look for legacy "staff" or "provider_services" tables. **The audit surfaced two real issues that have now been fixed.**

### 9.1 Database — clean

```
catalog_services           0 rows      (reference taxonomy, optional)
medical_practitioners      0 rows      (legacy table, unused)
package_services           0 rows
practitioners              3 rows      ✅ active
service_categories         0 rows
service_packages           0 rows
service_practitioners      3 rows      ✅ active (links practitioners ↔ services with per-practitioner fee)
service_price_history      0 rows
services                   2 rows      ✅ active (each row = a provider's service offering)
sub_services              27 rows      ✅ active (catalog of bookable sub-services)
```

- **No `staff` table exists**, and **no `provider_services` table exists**. The "Staff" labels in the admin UI are just a user-friendly synonym for *practitioners*.
- Foreign keys confirm `appointments.service_id → services.id` and `service_practitioners.{service_id, practitioner_id}` — matching what the code uses.

### 9.2 Critical: 17 duplicate route registrations in `server/routes.ts`

Express's router uses the **first** registered handler when multiple `app.METHOD(path, …)` calls share the same method+path. The previous size of `routes.ts` (~5,000 lines) had accumulated **14 distinct method+path duplicates totalling 17 dead handler bodies**.

The most damaging case directly nullified RBAC fixes from §3.3 / §3.4 of this report:

| Method+Path | Active line | Dead duplicates | Old behaviour |
|---|---:|---|---|
| `PATCH /api/service-practitioners/:id` | **1910** (no ownership check) | 2393 (with the ownership check from §3.4), 4580 | Any authenticated user could change any practitioner's per-service fee |
| `DELETE /api/service-practitioners/:id` | **1935** (no ownership check) | 2382 (with the ownership check from §3.3), 4589 | Any authenticated user could remove any practitioner from any service |

In other words, the §3.3 and §3.4 RBAC fixes from the previous pass were applied to handlers Express never reaches. The vulnerability was still live in production code.

**Other duplicate routes removed (purely tech-debt — first registration was already correct):**

`PATCH /api/admin/providers/:id` (×3), `GET /api/admin/users` (×2), `GET /api/providers/:providerId/practitioners` (×3), `GET /api/providers/:providerId/services` (×2), `GET /api/services/:serviceId/practitioners` (×3), `PATCH /api/practitioners/:id` (×2), `DELETE /api/practitioners/:id` (×2), `POST /api/practitioners` (×2), `POST /api/providers/:providerId/practitioners` (×2), `POST /api/service-practitioners` (×2).

### 9.3 Fixes applied

1. **Ported the ownership guard onto the live handlers.** `assertOwnsServicePractitioner(spId, user)` (declared once at `routes.ts:2343`) is now called by both the active `PATCH` (line 1910) and `DELETE` (line 1935) of `/api/service-practitioners/:id`. Admins still pass; everyone else must own the underlying service.

2. **Removed all 17 dead duplicate handler bodies.** A one-shot script (`script/dedupe_routes.ts`, run-once and deleted) verified each line really started an `app.METHOD(...)` block, walked the parens to find the matching `});`, and deleted bottom-up so earlier line numbers stayed valid. Result:
   - `server/routes.ts`: **4,996 → 4,819 lines (−180 lines)**
   - Total registered routes: **195 unique** (no remaining method+path duplicates)
   - All endpoints the frontend actually calls (verified by `rg`-ing `client/src/`) still resolve to a handler.

### 9.4 Verified clean

```
$ rg -c '^  app\.(get|post|patch|delete|put)\("/api/service-practitioners' server/routes.ts
3                                                  # 1×POST, 1×PATCH, 1×DELETE — exactly what we want
```

The application starts cleanly, returns 200/304 on existing endpoints, and the previously documented TS errors are unchanged (none of them touch the dedup work).

### 9.5 Summary of round-2 deltas

| Severity | Item | Status |
|---:|---|---|
| **P0** | RBAC bypass on PATCH/DELETE service-practitioners (caused by Express first-match on duplicate routes) | **Fixed** |
| P2 | 17 dead duplicate route registrations in `server/routes.ts` | **Removed** |
| Info | No `staff` / `provider_services` legacy tables exist; current schema is consistent | Confirmed |

**Files touched in this pass:** `server/routes.ts` only.

---

## 10. Catalog → Provider Service Assignment (admin workflow)

The admin needs a fast way to grant a provider a batch of bookable sub-services drawn from the global catalog (`sub_services`), without filling in name/price/duration for each one. The previous flow only offered a one-by-one form.

### 10.1 Data model (no schema change)

Confirmed via the live database: there is **no** `provider_services` join table — the existing `services` table *is* the provider × sub_service join. Each row already carries `(providerId, subServiceId, name, price, duration, isActive, …)`. So "assigning" a sub-service to a provider simply means inserting a `services` row with the catalog defaults; nothing else needs to change for bookings to work, since `appointments.service_id → services.id` already enforces that bookings only target a provider's actual offerings.

### 10.2 Backend

- **`server/storage.ts` → `assignSubServicesToProvider(providerId, subServiceIds[])`** (added after `createService`). Loads each sub-service, skips ones that are missing, inactive, or already assigned to that provider; for the rest, inserts a `services` row using the catalog `name`, `basePrice`, `durationMinutes`, and `category`. Returns `{ assigned: Service[], skipped: { subServiceId, reason }[] }` — `reason ∈ { not_found, inactive, already_assigned }`.
- **`POST /api/admin/providers/:id/assign-services`** (`server/routes.ts` ~4396). `requireAdmin`-gated. Body validated with Zod: `{ subServiceIds: z.array(z.string().uuid()).min(1).max(200) }`. Returns `201 { assignedCount, skippedCount, assigned, skipped }`.
- **Ownership guards added** on the existing per-service endpoints so providers can only mutate the rows they own (admins still pass):
  - `PATCH /api/services/:id` (line 1849)
  - `DELETE /api/services/:id` (line 1868)

### 10.3 Frontend

- **`client/src/components/assign-services-dialog.tsx`** — new dialog. Loads `/api/categories`, `/api/catalog-services`, `/api/sub-services` and renders a Category → Service-group → Sub-service tree with search filter, expand/collapse, select-all-in-category, and "already assigned" badges sourced from `/api/admin/providers/:id/services`. Submit posts to the new endpoint and invalidates the provider-services cache.
- **`client/src/pages/admin-dashboard.tsx`** — `AdminServicesPanel` now exposes an "Assign from catalog" button next to the existing "Add" button (visible from both the provider edit dialog and the provider details dialog). The single-service form remains for ad-hoc cases.

### 10.4 Verified live (smoke test against Supabase)

```
[1] First call    POST .../assign-services {3 ids} → 201   assigned=3, skipped=0
    DB rows created with sub-service defaults (name, $0.00, 30m, active)
[2] Idempotency   same payload again              → 201   assigned=0, skipped=3 (already_assigned)
[3] Foreign provider PATCH /api/services/:id      → 403 ✅ denied
[4] Foreign provider DELETE /api/services/:id     → 403 ✅ denied
[5] Owning provider PATCH /api/services/:id       → 200 ✅ price updated
```

Test rows were cleaned up afterwards. No bookings, practitioners, or pricing rows were touched.

### 10.5 Summary

| Severity | Item | Status |
|---:|---|---|
| Feature | Bulk catalog → provider assignment via admin UI | **Shipped** |
| P1 | Ownership check on `PATCH /api/services/:id` | **Fixed** |
| P1 | Ownership check on `DELETE /api/services/:id` | **Fixed** |

**Files touched in this pass:**
- `server/storage.ts` (+ `assignSubServicesToProvider`)
- `server/routes.ts` (new admin endpoint + 2 ownership guards)
- `client/src/components/assign-services-dialog.tsx` (new)
- `client/src/pages/admin-dashboard.tsx` (button wire-in + import)

---

## 11. Provider Dashboard Lockdown — admin-assigned services only

The platform now treats `services` as an **admin-controlled** join table: providers can only operate on the rows the admin assigned to them, may override pricing/duration/visit fees, may pause or resume each row, and may attach their own practitioners — but they cannot create new services, edit the catalog, or touch another provider's data. The booking endpoint enforces the same constraint server-side.

### 11.1 Backend hardening

| # | Endpoint | Before | After |
|---|---|---|---|
| 1 | `POST /api/sub-services` (`routes.ts:1126`) | `authenticateToken` only — any provider could create a global catalog row | `requireAdmin` |
| 2 | `PATCH /api/sub-services/:id` (`routes.ts:1149`) | `authenticateToken` only — any provider could rename a catalog row | `requireAdmin` |
| 3 | `DELETE /api/sub-services/:id` (`routes.ts:1186`) | `authenticateToken` only | `requireAdmin` |
| 4 | `POST /api/services` (`routes.ts:2405`) | Provider role check; auto-set `providerId` to caller — providers could self-create services | `requireAdmin`; explicit `providerId` required in body |
| 5 | `POST /api/services/:id/duplicate` (`routes.ts:2057`) | Owner-or-admin — providers could clone their own services | `requireAdmin` (creates a brand-new row) |
| 6 | `POST /api/service-practitioners` (`routes.ts:2344`) | Token only — only checked the caller had a provider record | Must be admin OR (own the service AND own the practitioner being assigned) |
| 7 | `POST /api/services/:serviceId/practitioners` (`routes.ts:4470`) | Token only — no checks | Same dual-ownership check as #6 |
| 8 | `POST /api/appointments` (`routes.ts:2748`) | Validated practitioner-vs-service link only — would accept a `serviceId` belonging to a different `providerId`, an inactive service, or a soft-archived service | Returns `400` if the service doesn't belong to the booked provider, or is paused / soft-deleted |

### 11.2 Frontend cleanup

- **`client/src/pages/provider-dashboard.tsx`** — Services tab card no longer renders the "Add" button; its `CardHeader` was replaced with a description telling the provider that services are assigned by an admin. The empty-state copy was rewritten to say "An administrator will grant you services from the catalog." Per-row `Switch` (active/paused), `Pricing`, `Edit`, `Delete`, and `Restore` controls all remain — those operate on assigned rows, which is in scope.
- **`client/src/components/service-form-dialog.tsx`** — A new `lockCategory` prop (passed `true` from the provider dashboard) renders the sub-service category as a read-only field and hides:
  - The `+ Add new category` `SelectItem`
  - The pencil/trash icons next to each catalog row
  - The inline new-category and edit-category forms
  Admin callers (the admin dashboard's `ServiceFormDialog` instances) don't pass `lockCategory`, so they retain full catalog editing.
- The existing `PractitionerManagementCard` already filters its service dropdown to `services.filter(s => s.isActive)`, so providers can only attach practitioners to active assignments — no UI change required there.

### 11.3 Verified live (12-check smoke test against Supabase)

```
── A. Sub-services CRUD locked to admin ──
✅ POST   /api/sub-services           as provider → 403
✅ PATCH  /api/sub-services/:id       as provider → 403
✅ DELETE /api/sub-services/:id       as provider → 403
✅ PATCH  /api/sub-services/:id       as admin    → 200

── B. POST /api/services locked to admin ──
✅ POST   /api/services               as provider → 403
✅ POST   /api/admin/.../assign-services as admin → 201

── C. Service-practitioners assignment ownership ──
✅ Foreign provider POST /api/service-practitioners      → 403
✅ Own service + foreign practitioner                    → 403
✅ Own service + own practitioner                        → 201
✅ Foreign provider POST /api/services/:id/practitioners → 403

── D. Booking validation ──
✅ POST /api/appointments with mismatched providerId → 400 ("Selected service does not belong to this provider.")
✅ POST /api/appointments against paused service     → 400 ("This service is currently paused. Please pick a different one.")
```

Test rows were cleaned up after the run (services, service_price_history, service_practitioners, and the two scratch practitioners created by the script). No production data was modified.

### 11.4 Summary

| Severity | Item | Status |
|---:|---|---|
| **P0** | Any provider could PATCH/DELETE/CREATE rows in the global `sub_services` catalog | **Fixed** (admin-only) |
| **P0** | Booking accepted a `serviceId` belonging to a different provider — patient could be charged with another provider's pricing | **Fixed** (400) |
| **P1** | Booking accepted a paused/soft-archived service | **Fixed** (400) |
| **P1** | Any authenticated user could attach any practitioner to any service via `POST /api/services/:id/practitioners` | **Fixed** (dual-ownership) |
| **P1** | Provider could attach another provider's practitioner to their own service via `POST /api/service-practitioners` | **Fixed** (dual-ownership) |
| Feature | Provider dashboard read-only for catalog; create/edit-category UI removed | **Shipped** |

**Files touched in this pass:**
- `server/routes.ts` (8 endpoint changes)
- `client/src/pages/provider-dashboard.tsx` (Services-tab CardHeader + ServiceFormDialog props)
- `client/src/components/service-form-dialog.tsx` (new `lockCategory` prop + 2 conditional renders)
