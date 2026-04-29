# CareConnect - Healthcare Booking Platform

## Overview

CareConnect is a healthcare booking platform designed to connect patients with verified physiotherapists, doctors, and home care nurses. It facilitates searching for healthcare providers, booking various types of appointments (online or home visits), secure online payments, and submitting patient reviews. Healthcare providers can utilize a dedicated dashboard to manage their profiles, services offered, availability, and scheduled appointments. The platform aims to provide a reliable and aesthetically pleasing user experience, drawing inspiration from leading booking platforms, and includes a business vision to capture a significant share of the healthcare booking market by offering a seamless and trustworthy service.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

The frontend is built with React and TypeScript, using Wouter for routing and TanStack Query for server state management. Tailwind CSS, Radix UI primitives, and shadcn/ui are used for styling and accessible UI components. Forms are managed with React Hook Form and Zod for validation. The design system features Inter and DM Sans fonts, supports light/dark modes, and is mobile-first responsive. Key pages include Home, Provider listing, Provider Profile, Patient Dashboard, Provider Dashboard, and Authentication flows. The platform supports English, Hungarian, and Persian/Farsi via i18next, with currency formatting based on user preferences or language. User language and currency preferences are persistent and applied dynamically.

Both Patient and Provider Dashboards offer comprehensive appointment management, search, filtering, and export capabilities. The Provider Dashboard includes statistics, a "Today's Schedule" highlight, calendar view, reviews management with inline replies, availability management with bulk slot creation, and analytics for revenue and appointment counts. The Patient Dashboard includes medical records and invoices. Profile management is organized into tabs (Personal, Address, Medical, Insurance, Emergency, Provider, Gallery, Security) with a sticky save bar for updates. Registration handles unverified accounts by deleting prior records to prevent lockouts. Admin dashboard management mutations use TanStack Query for efficient cache invalidation and optimistic updates.

### Backend

The backend is developed with Node.js and TypeScript, using Express.js and Drizzle ORM for database interactions. Authentication is JWT-based with bcrypt for password hashing and supports role-based access control (patient, provider, admin). The API is RESTful, uses JSON, and includes centralized error handling and request logging. A Data Access Layer (DAL) abstracts database operations.

### Performance & Response Sanitization

To keep payloads small and avoid leaking sensitive data, list endpoints that return `User` objects pass them through `server/utils/sanitize.ts` before responding. `sanitizeUser` strips `password`, OTP fields, OAuth tokens, and similar credentials; the `public` strip mode also drops bulky/private fields (medical history, insurance, emergency contact, etc.) for list views, and inlined data-URL avatars longer than 2 KB are dropped from list responses (full-size avatars stay available on the user's own `/api/auth/me` and individual record reads). The providers list (`GET /api/providers`), provider detail (`GET /api/providers/:id`), and admin user list (`GET /api/admin/users`) all use these helpers; the providers list response went from ~5 MB to ~15 KB after this change.

To eliminate slow page loads caused by Supabase round-trip latency, three additional optimizations are in place:

1. **Database indexes** — `scripts/add-performance-indexes.sql` creates 48 `CREATE INDEX IF NOT EXISTS` indexes on every foreign key and common sort/filter column (providers, services, appointments, reviews, payments, chat, notifications, audit_logs, wallets, etc.). Re-run with `node -e "require('pg')..."` style script if migrating to a fresh database. Indexes are NOT yet declared in `shared/schema.ts`; if you regenerate the database from scratch via `db:push`, re-apply this SQL afterwards.
2. **Connection pool tuning** — `server/db.ts` configures the pg pool with `max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000, keepAlive: true` so connections survive between requests instead of reconnecting on every call.
3. **Auth middleware in-process cache** — `authenticateToken` in `server/routes.ts` caches per-user `{ isEmailVerified, role, isSuspended, full user record }` and the per-provider `isVerified` flag for 30 seconds. This removes 1–2 Supabase round-trips (~400–800 ms) from every authenticated request. `/api/auth/me` reads directly from this cache so subsequent calls drop from ~370 ms to ~5 ms. Cache entries are invalidated via the exported `invalidateAuthCache(userId)` helper from login, logout, email verification, profile updates, suspension toggles, role changes, admin user deletion, and provider updates.

The cookie-parser middleware is registered at the top of `registerRoutes` so every auth-protected route (including the early invoice endpoints) can read the JWT cookie.

### Appointment Number System

Every appointment is assigned a unique, human-readable reference number in the format `GL000001` (prefix "GL" + 6-digit zero-padded sequence). This is generated at appointment creation using a PostgreSQL sequence (`appointment_number_seq`) stored in the `appointment_number` column. All 41 historical appointments were backfilled. The number appears on:
- Booking confirmation screen (replaces the old hash-based number)
- Appointments list page (badge next to service name)
- Patient dashboard appointment cards
- Provider dashboard appointment rows
- Admin bookings management table (searchable by reference # or patient name)
- Confirmation emails (as a styled banner block)
- Completion/payment receipt emails
- Invoice PDF (as "Appt. ref." in the meta panel)
- In-app notifications (appended as parenthetical)

The startup migration in `server/db.ts` → `runStartupMigrations()` ensures all schema changes (enum additions, new columns, sequence creation, backfill) run idempotently on every deployment. Called from `server/index.ts` before the reminder cron starts.

Additional schema additions: `paymentStatus` (text, default `pending`), `parentAppointmentId` (varchar, for reschedule chains), `isRescheduled` (boolean, default false).

New status values added to `appointment_status` enum: `cancelled_by_patient`, `cancelled_by_provider`, `reschedule_requested`, `reschedule_proposed`, `expired`. These are reflected in the status select dropdowns on provider and admin dashboards.

### Booking & Promo Codes

The booking flow charges per-service platform fees (sourced from each service's sub-service `platformFee`) and supports promo codes. Patients can enter a promo code in the booking summary; the backend `/api/promo-codes/validate` endpoint validates the code (active state, expiration, min purchase, per-user usage cap) and returns the discount amount. The booking creation endpoint persists `promoCode`, `promoDiscount`, and `platformFeeAmount` on the appointment, increments `usedCount` on the promo, and includes the discount and platform fee in the patient confirmation and provider notification emails (which list patient and clinic addresses, all amounts in USD).

### Solar Hijri Calendar

The frontend includes a `client/src/lib/persian-calendar.ts` utility that converts between Gregorian and Persian (Jalali) dates using `Intl.DateTimeFormat` with the `persian` calendar. When the active language is `fa`, booking date displays render in Solar Hijri format with Persian digits.

### Booking Wizard (6-step flow)

A guided booking wizard at `/book` (alias `/book-wizard`, page in `client/src/pages/book-wizard.tsx`) implements the spec's 6-step flow: **Category → Service → Provider → Practitioner (optional) → Date & Time → Confirm**. It uses the centralised pricing engine `server/lib/pricing.ts` (`computeFinalPrice`) so the patient sees a full breakdown (base, platform fee, visit-type fee, surge, emergency, discount, tax, total) before confirming. The classic single-page `/booking` flow is still available.

### Service Form

Provider service add/edit uses `client/src/components/service-form-dialog.tsx`, a modal styled after the reference design with image upload, calendar color swatches, sub-service category, price + deposit toggle, duration / time-slot length / buffer-before / buffer-after, custom-duration toggle, and hide-price / hide-duration toggles. The schema's `services` table holds `imageUrl`, `calendarColor`, `enableDeposit`, `depositAmount`, `timeSlotLength`, `bufferBefore`, `bufferAfter`, `customDuration`, `hidePrice`, `hideDuration`, and `sortOrder`.

### Catalog → Provider Service Assignment

Important: there is **no `provider_services` join table**. The `services` table *is* the (provider × sub_service) join — each row carries `providerId`, `subServiceId`, plus the per-provider `name`, `price`, `duration`, `isActive`, etc. Bookings are constrained to assigned services via `appointments.service_id → services.id`.

**Only admins may grant a provider new services.** The provider dashboard is read-only for the catalog and for service creation; the "Add" button has been removed and the sub-service category in `service-form-dialog.tsx` is locked when the dialog is opened from the provider dashboard (via the `lockCategory` prop). Providers retain full control over their assigned rows: pause/resume, override `price` / `duration` / visit fees, hide-price/hide-duration toggles, archive, restore, and attach their own practitioners. Backend enforces this:

- `POST /api/services`, `POST /api/services/:id/duplicate`, and all of `POST/PATCH/DELETE /api/sub-services` require **admin** (no provider can mutate the global catalog or self-create a service).
- `POST /api/service-practitioners` and `POST /api/services/:serviceId/practitioners` enforce **dual ownership**: the caller must be admin OR own both the service AND the practitioner being assigned.
- `PATCH` and `DELETE /api/services/:id` are guarded so only the owning provider (or an admin) can mutate or remove a row.
- `POST /api/appointments` rejects (`400`) any booking whose `serviceId` does not belong to the booked `providerId`, or whose service is paused (`isActive=false`) or soft-archived (`deletedAt` set).

Admins assign services via the dialog at `client/src/components/assign-services-dialog.tsx` ("Assign from catalog" button in the admin Services panel). It posts to `POST /api/admin/providers/:id/assign-services` with `{ subServiceIds: uuid[] }`; the storage method `assignSubServicesToProvider` (in `server/storage.ts`) inserts a `services` row per sub-service using the catalog defaults, and skips any that are missing, inactive, or already assigned (returning `skipped[]` with a `reason`).

### Wallet System

An in-app wallet allows patients to pre-load credits and pay for services. The system includes a `wallets` table and an append-only `wallet_transactions` ledger with snapshot balances and idempotency keys. Transaction operations are safeguarded by database transactions and row locking. The API supports wallet balance retrieval, transaction history, top-ups via Stripe, and payment for appointments. The frontend provides a dedicated wallet page, integrates wallet payment options into the booking flow, and the admin dashboard allows for wallet adjustments. A reminder cron generates in-app notifications for upcoming appointments.

### Database

The project exclusively uses Supabase (PostgreSQL) for all data storage. The schema includes core tables for users, providers, services, time slots, appointments, reviews, payments, and refresh tokens, with UUID primary keys, foreign key constraints, and cascading deletes. Enums are used for data integrity.

### Unified Service Catalog (Admin)

The admin dashboard exposes a single **Service Catalog** tab that renders `client/src/components/service-catalog-hierarchy.tsx`. It manages the full **Category → Service Group (`catalog_services`) → Sub-service** hierarchy in one tree view, with inline pricing fields (`basePrice`, `platformFee`, `durationMinutes`, `taxPercentage`, `pricingType`) directly inside each sub-service row. Add / edit / delete / restore / activate-toggle work at every level. The previous standalone admin tabs **Categories & Fees** (`sub-services`) and **Pricing Overrides** (`pricing`), and the duplicate Service Catalog tab inside Content Management, have been removed. The separate **Tax Settings** tab is preserved as it is unrelated to per-sub-service tax.

### Safe Delete & Pricing Versioning

`categories`, `sub_services`, and `services` carry both `is_active` and `deleted_at` columns. Delete handlers do a **usage check** first: if the row is referenced by appointments (or by provider services for sub-services / by sub-services for categories), the row is **soft-archived** (`is_active=false`, `deleted_at=now()`) instead of hard deleted. Past bookings keep their original `total_amount` snapshot, so historical pricing is never lost. Admins can pass `?force=true` for a real DELETE when allowed by FKs. `POST /api/{services|sub-services|admin/categories}/:id/restore` un-archives a row. A dedicated `service_price_history` table records every change to price/visit-fees/platform-fee-override on a service, exposed via `GET /api/services/:id/price-history`.

### Route Hygiene (Express first-match)

`server/routes.ts` is registered top-down and Express invokes the **first** handler matching method+path; later registrations are dead code. A 2026-04-29 audit found 14 distinct duplicate method+path pairs (17 dead handler bodies, ~180 lines), including two cases where ownership-check fixes had been applied to dead duplicates while the live handlers had no RBAC guard. All duplicates were removed; the file is now 4,819 lines with 195 unique routes. Helper `assertOwnsServicePractitioner` (in `server/routes.ts`) gates the live `PATCH` and `DELETE /api/service-practitioners/:id` so only the owning provider (or an admin) can mutate per-service practitioner assignments. **When adding a new route, search for the same `app.METHOD("/path"` first to avoid re-introducing duplicates.**

### Recent Fixes (2026-04-29)

A round of UX & data fixes addressing eight reported issues:

1. **Admin Edit Provider dialog scroll** — replaced shadcn `<ScrollArea>` with a plain `overflow-y-auto` div inside a flex column so the long fees/services form scrolls reliably (`client/src/pages/admin-dashboard.tsx`).
2. **Dashboard slowness** — provider appointments query now polls every 60s with a 30s `staleTime` (was 30s with no stale time); patient dashboard's stale-appointment cleanup is deferred 1.5s after mount so it never blocks initial paint; admin support-ticket polling relaxed (60s/30s).
3. **Booking auto-skipping the service step** — the deep-link service `useEffect` in `book-wizard.tsx` now uses a `useRef` flag so it fires only on initial mount. Picking a different provider no longer triggers an auto-jump to the slot step.
4. **Admin per-provider availability** — added admin endpoints `GET/PATCH /api/admin/providers/:providerId/office-hours` and `POST /api/admin/providers/:providerId/availability/bulk`, and wired the WeeklyScheduleGrid into the previously-empty **Time Sheet** tab inside Edit Provider → Services. Admins can now set a provider's weekly schedule and publish bookable slots without logging in as the provider.
5. **Two "Save changes" buttons in Preferences** — added `preferences` to the sticky-save-bar exclusion list in `client/src/pages/profile.tsx`; the in-card button is now the only save control on that tab.
6. **EUR + GBP currencies** — added EUR (€, en-IE, ~0.92 USD) and GBP (£, en-GB, ~0.79 USD) to `client/src/lib/currency.ts` (via a new `EXTRA_CURRENCIES` map) and surfaced them as options in the Preferences select.
7. **Health-metrics save Zod error** — drizzle-zod typed the `decimal` columns (`weightKg`, `bloodGlucose`, `temperatureC`) as required strings, so the form's numeric values produced a confusing 400. `insertHealthMetricSchema` now extends with a `decimalFromAny` preprocessor that accepts numbers, strings or empties.
8. **Invoice PDF revamp** — `server/utils/invoice-gen.ts` is no longer hardcoded to HUF. It now resolves currency from `invoice.currency || provider.currency`, supports USD/EUR/GBP/HUF/IRR with locale-aware formatting, switches the palette to Golden Life's gold + slate brand, adds an Appointment ref row, optional platform-fee and discount rows in the totals, and a paid/payment-instructions panel. `invoice-helper.ts` now passes the resolved currency when creating the invoice.

### Recent Fixes (2026-04-29 — round 2)

Three follow-ups after the first round of fixes:

9. **Slot fallback from office hours** — `GET /api/providers/:id/available-slots` now falls back to synthesizing 30-min slots from the provider's `provider_office_hours.weeklySchedule` when no explicit `time_slots` rows exist for that date. Previously a provider had to click "Publish this week's slots" before any slot showed up. Now, the moment an admin or provider sets the weekly grid, slots become bookable; admin/provider can still hard-publish to override or block specific times. The synthetic IDs are prefixed `virtual-…` to make them easy to distinguish from persisted slot rows.
10. **Booking still auto-skipping the Service step** — root cause was `provider-profile.tsx` line 57: `effectiveService = selectedService || provider.services[0]`. Even when no service was clicked, it auto-picked the first one and pushed `?serviceId=…` into the URL, which the wizard correctly honored as a deep-link → jumped to Slot. Removed the fallback so `serviceId` is only forwarded when the user explicitly selected one on the profile page.
11. **Customizable invoice template editor** — added `server/utils/invoice-template.ts` (load/save with `platform_settings` rows under `category="invoice_template"`, plus default values) and admin endpoints `GET /api/admin/invoice-template`, `PUT /api/admin/invoice-template`, and `POST /api/admin/invoice-template/preview` (returns a sample PDF). `generateInvoicePDF` now accepts an `options.template` arg and applies it to the brand bands, header, status pill, footer, and payment-instructions panel — including admin-defined `brandColorHex` and `accentColorHex` (parsed via `hexToRgb`). New `InvoiceTemplateEditor` component lives inside the admin Invoices tab as a sub-tab "Template", with two-column form, color pickers, and a "Preview PDF" button that opens a sample invoice in a new tab using the unsaved values. Schema-free: stored as key/value strings, so no migrations.
12. **Invoice logo upload** — extended the editor with a dedicated logo card (preview tile + file picker + remove button + collapsible "paste a hosted URL" fallback). Files up to 1 MB are read with `FileReader` and stored as a `data:image/(png|jpeg);base64,…` URL in the `logoUrl` field. In `server/utils/invoice-gen.ts` a new `resolveLogoData` helper returns a jsPDF-compatible `{ dataUrl, format }` for both data URLs (parsed inline) and remote http(s) URLs (server-side fetch, content-type sniffed, capped at 3 MB). When present, the logo renders in a 16×16 mm box at the top-left of every invoice and the company name shifts right to make room. Failures are swallowed so the rest of the PDF still renders.
13. **Overdue invoice reminders (cron + manual)** — added `invoices.last_reminder_at` (timestamp) and `invoices.reminder_count` (int default 0) to track per-invoice nudges. New storage methods `getOverdueInvoicesNeedingReminder({cooldownDays, limit})`, `markInvoiceReminderSent`, and `getInvoiceById`. `server/reminderCron.ts` now also runs `sendOverdueInvoiceReminders()` on the hourly tick: walks all unpaid invoices past `due_date`, honors a per-invoice cooldown (`INVOICE_REMINDER_COOLDOWN_DAYS`, default 7) and a hard cap (`INVOICE_REMINDER_MAX_PER_INVOICE`, default 4), and dispatches via `dispatchNotification({eventKey:"invoice.overdue"})` so it fan-outs to in-app + email. Admin endpoints: `GET /api/admin/overdue-invoices` (lists eligible invoices hydrated with patient name/email) and `POST /api/admin/invoices/:id/send-reminder` (manual override that bypasses the cooldown).
14. **Referral program with wallet credits** — added `users.referral_code` (unique text, lazy-generated 8-char Crockford base32) and `users.referred_by_user_id`, plus a new `referrals` table (`referrer_user_id`, `referred_user_id` UNIQUE, `status` pending|qualified, `reward_amount/currency`, `qualifying_appointment_id`, `qualified_at`). Storage methods: `getOrCreateReferralCode`, `getUserByReferralCode`, `createReferral`, `getReferralByReferredUser`, `getReferralsByReferrer`, `qualifyReferral`. Flow: (a) `/register?ref=CODE` validates via `GET /api/referrals/lookup/:code` and shows a "Referred by Jane D." chip; (b) `POST /api/auth/register` accepts `referralCode` in the body, sets `referredByUserId` and creates a pending row; (c) when the referred patient's first appointment hits `status=completed`, `maybeQualifyReferralForAppointment` (in `server/routes.ts`) promotes the row to qualified and credits both wallets via `topUpWallet` with idempotency keys (`referral-referrer:<id>` / `referral-referred:<id>`) so retries are safe; (d) both parties get an in-app `wallet` notification. Defaults are USD 5 / USD 5, configurable via `REFERRAL_REFERRER_REWARD`, `REFERRAL_REFERRED_REWARD`, `REFERRAL_REWARD_CURRENCY`. New patient page `client/src/pages/referrals.tsx` (route `/referrals`, linked from the Wallet header) shows the code, share link with native `navigator.share` fallback, total earned, and per-friend status (Pending first visit / Rewarded). Backed by `GET /api/referrals/me`, which returns code + share URL (built from `x-forwarded-host`/`x-forwarded-proto` so it works in dev and prod), reward config, and a hydrated referral history.

**DB note**: This project uses Supabase (`SUPABASE_DATABASE_URL`) — Replit's built-in `executeSql` tool hits the local `heliumdb` instead, so additive migrations must be applied via `pg.Pool` against `SUPABASE_DATABASE_URL` (or `npm run db:push --force` once the prompt issue is resolved).

### Build Process

The client-side React app is bundled using Vite, and the server-side Express app with esbuild. Shared types and schemas are maintained in a `shared/` directory.

## External Dependencies

-   **Supabase (PostgreSQL)**: Primary database solution.
-   **`pg` + `drizzle-orm/node-postgres`**: PostgreSQL driver for database interactions.
-   **Radix UI**: Accessible, unstyled UI primitives.
-   **shadcn/ui**: Styled UI components built on Radix UI.
-   **Vite**: Frontend bundling.
-   **esbuild**: Server-side bundling.
-   **Drizzle Kit**: Database migrations.
-   **TypeScript**: Type safety across the codebase.
-   **Stripe**: Secure online payment processing.
-   **Google Maps JavaScript API**: For map functionalities, address search (Places Autocomplete), and location picking.
-   **Resend**: Email communication.
-   **Twilio**: SMS and WhatsApp communication.
-   **Web Push**: Web-push notifications.
-   **Daily.co**: Video conferencing for online appointments.