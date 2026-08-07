# GL-AUDIT

## GoldenLife current-project forensic audit

**Audit type:** Fresh, standalone current-state audit  
**Audit scope:** Full repository, application runtime, frontend, backend, database model, financial systems, security boundaries, operations, deployment configuration, tests, legacy code, and architecture drift  
**Audited revision:** `c58153c`  
**Audit date:** 2026-08-06  
**Mutation policy:** Read-only audit. No application code, database records, schema, secrets, workflows, or deployment configuration were changed as part of this audit.

> This report evaluates the project as it exists. It does not compare the project to another architecture, release, or implementation. “Legacy” below means code, schema, route, configuration, or behavior that is retained inside the current project but is no longer the clearest active authority.

---

## 1. Executive conclusion

GoldenLife is a broad healthcare marketplace application with:

- Patient, provider, administrator, country administrator, verification administrator, finance, and support concepts
- Provider onboarding and KYC
- Service catalog and practitioner scheduling
- Appointment booking, rescheduling, cancellation, waitlists, slot holds, and group sessions
- Online, clinic, and home visits
- Wallets, Stripe payments, offline payments, refunds, gift cards, packages, memberships, invoices, provider earnings, provider wallets, payouts, and reconciliation
- Patient health records and provider clinical workspace
- Chat, notifications, email, SMS, WhatsApp, push notifications, video rooms, and AI chat
- Multi-country support for Hungary and Iran
- Admin governance, RBAC, compliance, reporting, content, support, monitoring, and legal consent

The project is functionally substantial, but the current codebase has accumulated multiple overlapping authorities. The largest risks are not a missing feature; they are conflicts between systems that can produce different answers about authorization, currency, tax, payment state, settlement, migrations, scheduled work, or operational health.

### Overall disposition

**Application functionality:** Broad and largely implemented  
**Build/start readiness:** The application typechecks, builds, and starts  
**Financial correctness:** Not safe to treat as consolidated until the provider-ledger drift and settlement authority conflict are resolved  
**Security posture:** Good baseline controls, but several important boundaries depend on route-by-route discipline  
**Data/schema readiness:** High schema breadth with meaningful migration and authority drift  
**Operational readiness:** Not production-ready as an automated multi-instance system  
**Testing confidence:** Insufficient; current green checks do not prove end-to-end correctness  
**Recovery readiness:** Unverified; backup and restore are documented but not demonstrated  

### Highest-priority blockers

1. Secure or disable the marketplace escrow capture endpoint.
2. Stop marketplace-ledger settlement from interpreting native booking amounts as USD.
3. Select and enforce one provider settlement authority.
4. Repair or quarantine provider-wallet ledger rows that contain native-currency values in USD ledgers.
5. Make payment method, tax, currency, and financial snapshots consistent and atomic.
6. Make migrations, scheduled jobs, tests, and deployment configuration single-authority and fail-visible.

---

## 2. Audit methodology and evidence standard

The audit used:

- Current source tree inspection
- Route and module inventory
- Frontend route and page inventory
- Shared schema and startup migration inspection
- Current package/build/configuration inspection
- Existing read-only runtime/database observations available during the audit
- Existing executable tests and build/typecheck commands
- Focused searches for legacy, fallback, non-fatal, fire-and-forget, hardcoded, duplicate, and deprecated behavior

Each finding is classified as:

- **Confirmed:** Directly visible in current code/configuration or observed in current runtime/database state.
- **High-risk:** The code path creates a credible failure or security condition, but exploitation or production impact needs a targeted runtime test.
- **Gap:** A required control, test, automation, or operational proof is absent.
- **Drift:** Two current authorities, types, defaults, schemas, or deployment configurations disagree.
- **Informational:** A design limitation or maintainability concern that is not itself a production defect.

---

## 3. System inventory

### 3.1 Runtime and application composition

| Area | Current implementation | Location |
|---|---|---|
| Server runtime | Express + Node HTTP server | `server/index.ts:15-29` |
| Frontend runtime | React 18 + Wouter | `client/src/main.tsx:1-17`, `client/src/App.tsx:1-306` |
| API data layer | Drizzle ORM and direct `pg` pool queries | `server/db.ts:18-107`, `server/storage/` |
| Database | Supabase PostgreSQL | `server/db.ts:23-36`, `DATABASE.md:1-38` |
| Build | esbuild-driven custom build script | `package.json:8`, `script/build.ts` |
| Development server | `tsx server/index.ts` and Vite middleware | `package.json:7`, `server/vite.ts` |
| Production server | `node dist/index.cjs` | `package.json:9` |
| Auth | JWT access token in cookie or Authorization header; refresh token tables | `server/middleware/auth.ts`, `server/routes/auth.routes.ts` |
| Authorization | Role checks, admin scopes, permission catalog, assignments | `server/middleware/rbac.ts`, `server/middleware/country.ts` |
| Realtime | Chat WebSocket and slot-event WebSocket | `server/chat/ws.ts`, `server/lib/slotEvents.ts` |
| Payments | Stripe, wallet, cash, bank transfer, gift cards | `server/stripe.ts`, `server/stripeWebhook.ts`, `server/routes/wallet.routes.ts`, `server/routes/payment.routes.ts` |
| Media | Cloudinary plus local `/uploads` fallback | `server/services/cloudinary.ts`, `server/services/uploads.ts`, `server/index.ts:125-130` |
| Video | Daily/video session service | `server/services/video.ts`, `client/src/components/video/TelehealthRoom.tsx` |
| Messaging | Email, SMS, WhatsApp, push, in-app notifications | `server/services/channels/`, `server/services/notification-dispatcher.ts` |
| AI | OpenAI-backed chat and image route integrations | `server/ai_integrations/`, `client/src/components/ai-chat-box.tsx` |
| Scheduling | Slots, holds, office hours, templates, time-off, rolling schedule | `server/routes/provider-availability.routes.ts`, `server/routes/provider-schedule-admin.routes.ts`, `server/cron/rolling-schedule.ts` |
| Scheduled jobs | Reminder, reconciliation, metrics, wallet audit, rolling schedule | `server/reminderCron.ts`, `server/crons/`, `server/cron/` |

### 3.2 Repository-level configuration and deployment files

| File | Purpose | Audit observation |
|---|---|---|
| `package.json` | Scripts and dependencies | No test, lint, format, migration-apply, or smoke-test script |
| `tsconfig.json` | TypeScript configuration | Tests excluded from typecheck |
| `vite.config.ts` | Vite configuration | Development frontend serving |
| `.replit` | Replit workflow/deployment settings | Application runs through `npm run dev` |
| `Dockerfile` | Container build | `public` copy is commented out; verify all production assets are bundled |
| `fly.toml` | Fly deployment | Upload volume is commented out |
| `render.yaml` | Render deployment | Provisions `DATABASE_URL`, conflicting with the database module’s required variable |
| `railway.json` | Railway deployment | Uses `/health` |
| `Procfile` | Generic process command | Additional deployment authority |
| `DATABASE.md` | Database policy | Declares Supabase-only, while dependency/config residue remains |
| `ops/deployment-checklist.md` | Deployment checklist | References tests and migration preparation not represented by a single executable pipeline |
| `ops/backup-recovery.md` | Recovery plan | PITR, backup verification, restore testing, and asset recovery remain operational tasks |

---

## 4. Backend inventory

### 4.1 Server startup and request pipeline

**File:** `server/index.ts`

| Lines | Responsibility |
|---:|---|
| `10-13` | Environment validation before application imports |
| `15-29` | Express app, HTTP server dependencies, route and DB wiring |
| `31-95` | Proxy trust, Helmet, CSP, HSTS, security headers, correlation ID |
| `96-98` | HTTP server and WebSocket setup |
| `106-112` | Raw Stripe webhook mounted before JSON parsing |
| `114-123` | JSON and URL-encoded body parsing |
| `125-130` | Local uploads directory creation and static serving |
| `132-134` | Global `/api` rate limiter |
| `145-184` | Request logging, response-size capture, latency metrics, slow endpoint persistence |
| `186-200` | Route registration, error sink, static/Vite setup |
| `202-240` | Listen, background migrations, catalog seed, and cron startup |

#### Startup strengths

- The server opens the port before migrations so the runtime health check can respond.
- Stripe raw-body handling is correctly placed before `express.json()`.
- Security headers are centralized at the application boundary.
- Correlation IDs are attached before request handling.
- Slow requests are persisted as system events.

#### Startup gaps

- The server can continue serving after startup migration failures.
- Cron startup occurs after migration failure as well as success.
- The error sink is registered after route registration, so earlier registration/startup failures may bypass it.
- There is no visible centralized graceful-shutdown path that stops timers, closes WebSockets, drains the HTTP server, and closes the database pool.
- The 50 MB JSON and URL-encoded limits create avoidable memory/DoS exposure for endpoints that do not need large bodies.

### 4.2 Route registration and backend domains

**Central registration:** `server/routes.ts:7-50,99-145`

#### Identity and access

- `server/routes/auth.routes.ts`
- `server/routes/mfa.routes.ts`
- `server/routes/session.routes.ts`

Responsibilities include registration, login, logout, refresh, email verification, password reset, profile changes, MFA, session state, and development/admin authentication helpers.

#### Patient and family

- `server/routes/patient.routes.ts`
- `server/routes/family.routes.ts`
- `server/routes/care.routes.ts`
- `server/routes/legal-public.routes.ts`

Responsibilities include patient profile, health metrics, records, prescriptions, reviews, referrals, family members, clinical timeline, care outcomes, legal documents, and consent acceptance.

#### Provider lifecycle

- `server/routes/provider.routes.ts`
- `server/routes/provider-media.routes.ts`
- `server/routes/provider-availability.routes.ts`
- `server/routes/provider-schedule-admin.routes.ts`

Responsibilities include provider profile, onboarding, service management, practitioners, office hours, schedules, time off, buffers, documents, credentials, gallery/media, patients, notes, analytics, visibility, and provider operations.

#### Booking and appointment lifecycle

- `server/routes/appointment.routes.ts`
- `server/routes/appointment-resources.routes.ts`
- `server/routes/appointment-waitlist.routes.ts`
- `server/routes/session.routes.ts`

Responsibilities include quote context, slot holds, booking, confirmation, approval, confirmation, start, completion, cancellation, refunds, rescheduling, proposals, waitlists, session resources, outcome capture, invoice generation, and provider earning creation.

#### Catalog and location

- `server/routes/catalog.routes.ts`
- `server/routes/location.routes.ts`

Responsibilities include service catalog, sub-services, provider search, pricing quote, tax context, currency context, geocoding, autocomplete, and location intelligence.

#### Communication and realtime

- `server/routes/communication.routes.ts`
- `server/routes/notification.routes.ts`
- `server/routes/support.routes.ts`
- `server/chat/ws.ts`
- `server/routes/webhook.routes.ts`

Responsibilities include conversations, messages, notifications, support tickets, bug reports, package/payment webhooks, and chat realtime delivery.

#### Commerce and finance

- `server/routes/payment.routes.ts`
- `server/routes/wallet.routes.ts`
- `server/routes/financials.routes.ts`
- `server/routes/stripe-connect.routes.ts`
- `server/routes/provider-wallet-payouts.routes.ts`

Responsibilities include Stripe checkout, wallet top-ups, wallet debits, refunds, gift cards, packages, invoices, escrow/ledger routes, connected accounts, provider wallet views, payout requests, payout cancellation, provider ledger views, and financial summaries.

#### Admin control plane

- `server/routes/admin/admin-home.routes.ts`
- `server/routes/admin/admin-users.routes.ts`
- `server/routes/admin/admin-providers.routes.ts`
- `server/routes/admin/admin-content.routes.ts`
- `server/routes/admin/admin-financial.routes.ts`
- `server/routes/admin/revenue-billing.routes.ts`
- `server/routes/admin/admin-currency-rates.routes.ts`
- `server/routes/admin/admin-payment-providers.routes.ts`
- `server/routes/admin/admin-compliance.routes.ts`
- `server/routes/admin/admin-monitoring.routes.ts`
- `server/routes/admin/admin-health.routes.ts`
- `server/routes/admin/admin-dev-tools.routes.ts`
- `server/routes/admin/financial-reconcile.routes.ts`
- `server/routes/admin/full-reconciliation.routes.ts`
- `server/routes/admin/payout-automation.routes.ts`
- `server/routes/admin/legal.routes.ts`

Responsibilities include users, providers, documents, service approval, tax, refunds, revenue rules, currency rates, payment providers, monitoring, analytics, reconciliation, payouts, legal content, RBAC, and development tools.

### 4.3 Backend engines and services

| Engine/service | Location | Purpose |
|---|---|---|
| Pricing kernel | `server/lib/pricing.ts:1-210` | Base price, fees, membership, promo, tax, line items |
| Revenue Engine | `server/lib/revenue-engine.ts:1-591` | Rules, commission, payment adjustments, patient payable, provider earnings, USD conversion |
| Appointment actions | `server/lib/appointmentActions.ts:1-295` | Action permissions, cancellation/reschedule rules, refund quote |
| Appointment status | `server/lib/appointmentStatus.ts:1-94` | Status transition support |
| Conflict engine | `server/lib/conflictEngine.ts` | Slot and appointment conflict detection |
| Provider settlement | `server/lib/provider-settlement.ts:1-139` | Local and USD settlement, offline payment treatment |
| Payout lifecycle | `server/lib/provider-payout-lifecycle.ts:1-206` | Payout state transitions and wallet holds |
| Payout automation | `server/services/payout-automation.service.ts:1-450` | Eligible providers, payout batches, Stripe transfers, retries |
| Currency service | `server/services/currency.ts:1-210` | Rate loading, conversion, formatting, Stripe amount conversion |
| Timezone engine | `server/lib/tzUtils.ts:1-207` | Local provider time to UTC and calendar formatting |
| Verification engine | `server/lib/verification.ts:1-207` | Provider verification and document state |
| Provider visibility | `server/lib/provider-visibility.ts:1-176` | Provider discoverability and eligibility |
| Service currency guard | `server/lib/service-currency-guard.ts:1-79` | Native pricing enforcement |
| Notification dispatcher | `server/services/notification-dispatcher.ts:1-400` | In-app/email/SMS/push dispatch and delivery logs |
| Full reconciliation | `server/services/financial-reconciliation-full.service.ts:1-350` | Broad financial consistency checks |
| Analytics tracker | `server/services/analyticsTracker.ts:1-150` | Event tracking and reporting |
| Ticket automation | `server/services/ticketAutomation.ts:1-220` | Support classification and FAQ recommendations |
| Provider matcher | `server/services/providerMatcher.ts` | Provider matching/search support |
| Location service | `server/services/location.service.ts` | Geocoding and location normalization |
| Video service | `server/services/video.ts` | Daily/video room creation |
| Cloudinary/uploads | `server/services/cloudinary.ts`, `server/services/uploads.ts` | Image and document media |
| MFA service | `server/services/mfa.service.ts` | MFA generation and verification |
| Database reset | `server/services/database-reset.service.ts` | Admin/test reset profiles and destructive reset execution |

### 4.4 Storage architecture

| Layer | Location |
|---|---|
| Thin storage facade | `server/storage.ts` |
| Main database implementation | `server/storage/database-storage.ts:1-4593` |
| Appointment storage | `server/storage/appointments.storage.ts` |
| User storage | `server/storage/users.storage.ts` |
| Financial storage | `server/storage/financial.storage.ts` |
| Group-session mixin | `server/storage/group-sessions.mixin.ts` |
| Packages mixin | `server/storage/packages.mixin.ts` |
| Provider-media mixin | `server/storage/provider-media.mixin.ts` |

The storage decomposition is useful for organization, but direct SQL also appears across route and service modules. That creates multiple data-access styles and increases the chance that one path bypasses shared authorization, transaction, or unit rules.

---

## 5. Frontend inventory

### 5.1 Application shell

**Files:** `client/src/main.tsx`, `client/src/App.tsx`

The shell includes:

- React StrictMode
- React Query
- Auth provider
- Global error boundaries
- Tooltip provider
- Toast bridge and toaster
- Cookie consent banner
- Scroll progress and scroll-to-top
- Page transitions
- Chat and AI chat widgets
- i18n and direction handling

The page router uses Wouter `Switch` and lazy-loaded pages.

### 5.2 Public pages

- `client/src/pages/home.tsx`
- `login.tsx`
- `register.tsx`
- `providers.tsx`
- `services.tsx`
- `provider-profile.tsx`
- `group-sessions.tsx`
- `packages.tsx`
- `become-provider.tsx`
- `about.tsx`
- `terms.tsx`
- `privacy.tsx`
- `cookie-policy.tsx`
- `forgot-password.tsx`
- `verify-email.tsx`
- `consent.tsx`
- `not-found.tsx`

### 5.3 Patient pages

- `patient-home.tsx`
- `patient-dashboard.tsx`
- `appointments.tsx`
- `appointment-details.tsx`
- `booking-confirmation.tsx`
- `book-wizard.tsx`
- `wallet.tsx`
- `membership-dashboard.tsx`
- `referrals.tsx`
- `waitlist.tsx`
- `health-records.tsx`
- `my-reviews.tsx`
- `review.tsx`
- `messages.tsx`
- `notifications.tsx`
- `gift-cards.tsx`
- `my-documents.tsx`
- `family-members.tsx`
- `family-member-dashboard.tsx`
- `support-tickets.tsx`
- `my-bug-reports.tsx`
- `profile.tsx`
- `settings.tsx`

### 5.4 Provider pages

- `provider-home.tsx`
- `provider-dashboard.tsx`
- `provider-clinical-dashboard.tsx`
- `provider-earnings.tsx`
- `provider-profile.tsx`
- `appointments.tsx`
- `appointment-details.tsx`
- `messages.tsx`
- `notifications.tsx`
- `support-tickets.tsx`

Provider dashboard components include:

- `client/src/components/provider/ProviderServicesTab.tsx`
- `ProviderScheduleTab.tsx`
- `ProviderAppointmentsTabs.tsx`
- `ProviderPatientsTab.tsx`
- `ProviderEarningsTab.tsx`
- `ProviderInsightsTab.tsx`
- `ProviderKYC.tsx`
- `provider-documents-panel.tsx`
- `ProviderNotesPanel.tsx`
- `ClinicalWorkspacePanel.tsx`
- `weekly-schedule-grid.tsx`

### 5.5 Admin pages and panels

Pages:

- `admin-home.tsx`
- `admin-dashboard.tsx`
- `admin-users.tsx`
- `admin-stale-bookings.tsx`
- `admin-bug-reports.tsx`
- `admin/compliance-queue.tsx`

Major admin components:

- `client/src/components/admin/dashboard/revenue-billing-center.tsx`
- `financial-master-report.tsx`
- `admin-payouts.tsx`
- `admin-provider-wallets.tsx`
- `payment-providers-panel.tsx`
- `currency-rates-panel.tsx`
- `refund-management.tsx`
- `document-queue.tsx`
- `provider-operations-console.tsx`
- `client-operations-console.tsx`
- `ProviderReviewQueue.tsx`
- `provider-financial-reports.tsx`
- `enhanced-analytics.tsx`
- `monitoring-panel.tsx`
- `AdminAuditLogs.tsx`
- `rbac-permissions-matrix.tsx`
- `admin-access-panel.tsx`
- `admin-notification-center.tsx`
- `document-expiry-monitor.tsx`
- `package-management.tsx`
- `LedgerOverrides.tsx`
- `SystemBreaker.tsx`

### 5.6 Shared component families

- Booking: `client/src/components/booking/`
- Appointment state/time: `client/src/components/appointment/`
- Chat and video: `client/src/components/chat/`, `client/src/components/video/`
- Family and membership: family tabs, package and membership components
- Location/maps: `client/src/components/location/`
- UI primitives: `client/src/components/ui/`
- Global error and protected routes: `global-error-boundary.tsx`, `protected-route.tsx`
- Media: provider image/gallery and upload components

### 5.7 Frontend findings

#### Confirmed or high-risk

1. **Role drift:** `App.tsx:210,213,216,219,264,267` permits `verification_admin`, but `shared/schema.ts:7` does not include that role in `userRoleEnum`. The database and frontend/backend role model must be verified as one authority.
2. **Client route protection is inconsistent:** several user-sensitive pages such as messages, notifications, appointments, wallet, support tickets, documents, and family pages are registered as public Wouter routes and rely on page/API behavior for protection. Server-side authorization must remain authoritative and should be explicitly verified for each route.
3. **Lazy loading failure recovery is weak:** `App.tsx:153-159,169-172` shows only a spinner. Chunk load errors have no retry, refresh, or recovery action.
4. **Global error boundaries are nested, but recovery ownership is unclear:** `App.tsx:278-290` wraps the router twice without an application-level reset or route-specific fallback strategy.
5. **Legacy aliases remain active:** `/booking`, `/book-wizard`, `/provider/setup`, `/patient/workspace`, and `/patient/records` redirect to newer destinations. This is useful compatibility behavior but increases route and test surface.
6. **`apiRequest()` returns a `Response`, not parsed JSON:** mutation handlers must call `.json()`. Any mutation that assumes the response is already data can silently receive `undefined` fields. This pattern is documented in project memory and should be mechanically audited across all mutations.
7. **RTL is only partially guaranteed by document direction:** `App.tsx:164-167` sets `dir`, but component-level physical margins, borders, left/right positioning, and icons still require systematic logical-property review.
8. **The root wrapper uses `overflow-x-hidden`:** `App.tsx:283`. This can hide layout overflow and make responsive failures difficult to observe.
9. **Sensitive-context widgets are globally mounted:** Chat and AI chat are rendered from `App.tsx:291-293`, so patient/provider/admin visibility and privacy behavior must be enforced inside the widgets and API routes.
10. **Frontend loading/error/empty state quality varies by page:** many pages use local query and mutation handling rather than a uniform state contract.

#### Strengths

- Heavy pages are lazy-loaded.
- Protected route component exists and is used for role-gated pages.
- Global error boundaries exist.
- i18n direction and language are updated at the document level.
- Currency helpers are centralized in `client/src/lib/currency.ts`.
- Booking time-awareness components exist for urgency and UTC-aware slot behavior.
- Status badges and shared UI primitives reduce visual inconsistency.

---

## 6. Data model and schema inventory

### 6.1 Enum domains

**File:** `shared/schema.ts:6-55`

Current enums include:

- User roles
- Country codes
- Provider types
- Appointment statuses
- Visit types
- Payment statuses and methods
- Group-session statuses and attendance
- Support ticket statuses and priorities
- Audit actions
- System event types and severities
- Appointment actions
- Content and announcement types
- Medical history types
- Wallet transaction types and statuses
- Pricing types
- Earning status
- Package target/status
- Benefit keys
- Provider block types
- Bug category/severity/priority/status

### 6.2 Core identity and provider tables

**File:** `shared/schema.ts:58-274`

- `users`
- `providers`
- `categories`
- provider profiles, country, verification, status, preferences, and legacy fee fields

### 6.3 Catalog and pricing tables

**File:** `shared/schema.ts:287-456`

- `catalog_services`
- `sub_services`
- `services`
- `service_price_history`
- `service_packages`
- `package_services`
- `practitioners`
- `service_practitioners`
- `practitioner_schedules`
- `provider_pricing_overrides`

### 6.4 Scheduling and appointments

**File:** `shared/schema.ts:456-572`

- `time_slots`
- `provider_time_off`
- `appointments`
- appointment UTC timestamps, local/date/time compatibility columns, payment status, financial snapshots, reschedule metadata, visit type, country, and provider/practitioner references

### 6.5 Billing and earnings

**File:** `shared/schema.ts:572-699`

- `invoices`
- `invoice_items`
- `provider_earnings`
- `payments`
- `promo_codes`
- gift-card, package, membership, wallet, refund, and dispute tables in later schema sections

### 6.6 Group sessions and communication

**File:** `shared/schema.ts:699-801`

- `group_sessions`
- `group_session_participants`
- `chat_conversations`
- `chat_messages`
- `conversations`
- `messages`
- `refresh_tokens`

The simultaneous presence of `chat_conversations/chat_messages` and `conversations/messages` is a current duplicate messaging model. The schema comments identify some of the older chat tables as legacy.

### 6.7 Packages and memberships

**File:** `shared/schema.ts:1826-1904`

- `packages`
- `package_benefits`
- `user_packages`
- `membership_benefit_usage`

Benefits include discount, free cancellation, wallet bonus, and reduced commission concepts.

### 6.8 Compliance and governance

**File:** `shared/schema.ts:1647-1779`

- `provider_documents`
- `provider_credentials`
- `provider_category_permissions`
- `admin_roles`
- `rbac_permissions`
- `role_permissions`
- `admin_assignments`
- provider buffer settings and blocks

### 6.9 Wallets, payouts, and ledgers

**File:** `shared/schema.ts:2108-2199,2353-2530`

- `payout_requests`
- `provider_wallets`
- `provider_ledger`
- `marketplace_ledger`
- `platform_fee_rules`
- `commission_rules`
- `payment_method_rules`
- `travel_fee_rules`
- `payout_config`
- `revenue_share_rules`
- `wallet_rules`

### 6.10 Legal, analytics, support, and incidents

**File:** `shared/schema.ts:1396-1454,2199-2305,2552-2589`

- patient notes and documents
- gift cards
- disputes
- waitlist entries
- bug reports and comments
- platform events
- legal documents, versions, acceptances
- notification and audit/event tables in the remainder of the schema

---

## 7. Database and migration architecture

### 7.1 Active database connection

**File:** `server/db.ts:18-107`

The runtime requires `SUPABASE_DATABASE_URL`, creates a `pg` pool, configures UTC at the protocol level, and exports both `pool` and Drizzle `db`.

The module states that all database access should use this connection, but the project still contains configuration and dependency residue for alternate database providers.

### 7.2 Migration authorities

The project currently has multiple schema mechanisms:

1. Checked-in SQL migrations in `migrations/`
2. `drizzle-kit push` exposed by `package.json:11`
3. Large imperative startup migration chain in `server/db.ts`
4. Seed scripts and reset scripts under `script/` and `scripts/`

Startup migration sections are visible throughout `server/db.ts`, beginning at `:133` and continuing through the later migration blocks.

### 7.3 Confirmed migration gaps

1. **Startup migration errors are non-fatal.** `server/index.ts:217-239` logs migration failure and still starts catalog seed and cron jobs.
2. **Port availability precedes schema readiness.** This is operationally useful, but `/health` does not distinguish “server listening but migrations incomplete” from “application ready.”
3. **Schema authority is split.** A developer or deployment can use Drizzle push, startup DDL, checked-in migrations, or scripts, with no single enforced path.
4. **Business-data mutations exist inside startup migration code.** `server/db.ts` documents backfills and one-time operations, but they remain part of process startup.
5. **A failed early block can leave partial schema state.** Although many individual statements use `IF NOT EXISTS`, not every migration unit is transactionally grouped.
6. **Drizzle schema additions can precede database columns.** Any new column in `shared/schema.ts` is immediately selected by Drizzle queries; if startup DDL has not completed, requests can fail.
7. **Index creation needs independent failure isolation.** A bad index statement can block later statements if grouped together.

### 7.4 Database environment drift

- `server/db.ts:23-32` requires `SUPABASE_DATABASE_URL`.
- `DATABASE.md:7-12` documents that variable as authoritative.
- `render.yaml:11-13` provisions `DATABASE_URL`.
- `package.json:20` retains `@neondatabase/serverless`.

This is confirmed configuration/dependency drift. Runtime use of the Neon package should be removed or explicitly justified.

---

## 8. Pricing, currency, payments, and financial systems

### 8.1 Currency model

The active financial design uses two units:

- Booking-facing values in provider-native currency such as HUF or IRR
- Accounting, wallet, provider earnings, payouts, and Stripe values in USD

Relevant files:

- `server/services/currency.ts`
- `server/lib/pricing.ts`
- `server/lib/revenue-engine.ts`
- `server/lib/provider-settlement.ts`
- `server/routes/appointment.routes.ts`
- `server/routes/wallet.routes.ts`
- `server/stripe.ts`
- `server/services/payout-automation.service.ts`

### 8.2 Pricing kernel

**File:** `server/lib/pricing.ts:78-210`

Calculates:

- Base service/package price
- Fixed, hourly, and session pricing
- Visit fees
- Platform fee
- Emergency fee
- Surge
- Membership discount
- Promo discount
- Tax
- Pricing lines

### 8.3 Revenue Engine

**File:** `server/lib/revenue-engine.ts:1-591`

Calculates:

- Configured platform fee
- Commission
- Payment method adjustment
- Travel fee
- Revenue share
- Patient payable
- Provider earnings
- Platform revenue
- USD equivalent

The Revenue Engine still calls the pricing kernel as its base calculation, while quote, booking, and invoice code also call pricing logic independently. This is a current duplicate calculation authority.

### 8.4 Pricing and financial findings

#### Critical: marketplace escrow capture is insufficiently authorized

**File:** `server/routes/financials.routes.ts:40-63`

The escrow capture endpoint accepts appointment and amount input without sufficiently proving:

- Caller ownership or administrative authority
- Payment completion
- Amount matching the appointment/payment
- Currency
- Duplicate capture status
- Appointment eligibility

**Impact:** An authenticated caller may be able to create an arbitrary pending escrow record.

#### Critical: marketplace ledger interprets native booking amounts as USD

**File:** `server/routes/financials.routes.ts:65-139`

The settlement route reads appointment amounts, multiplies them by 100, and writes USD-like cents. Current appointment amounts are booking currency values, so HUF/IRR amounts can be overstated by orders of magnitude.

#### High: two provider settlement authorities

Current systems include:

1. Revenue Engine → `provider_earnings` → `provider_wallets` → `provider_ledger`
2. `marketplace_ledger` escrow/split/settlement

Normal completion records provider earnings in `server/routes/appointment.routes.ts:1942-1963`; marketplace settlement is a separate route. The architecture can produce divergent provider/platform results for the same appointment.

#### Critical: confirmed provider-ledger currency mixing

Provider wallets and provider ledgers are USD. Observed provider-ledger tax deductions contained values such as:

- `-1620.00`
- `-270.00`
- `-540.00`

The reconciliation process reported provider drift of approximately `$1,620.00` and `$3,439.11`.

Relevant files:

- `server/storage/database-storage.ts:3014-3180`
- `server/crons/ledger-reconcile.ts:149-199`

#### High: payment-method defaults disagree

| Path | Default | Location |
|---|---|---|
| Quote | `card` | `server/routes/catalog.routes.ts:597` |
| Booking Revenue Engine | `cash` | `server/routes/appointment.routes.ts:901,927` |
| Booking metadata | `card` | `server/routes/appointment.routes.ts:1016` |
| Payment row | `card` | `server/routes/appointment.routes.ts:1309` |
| Internal engine lookup | `cash` | `server/lib/revenue-engine.ts:382` |

This can change surcharges, discounts, payment state, and settlement expectations.

#### High: financial snapshots are not atomic with appointment creation

**Files:** `server/routes/appointment.routes.ts:970-1020,1068-1093`

The appointment is created before all financial snapshots are written. Snapshot failure is logged but does not necessarily roll back the booking.

#### High: hardcoded exchange-rate fallback

**File:** `server/services/currency.ts:27-70`

Hardcoded rates are used when the database/rate path fails. Current observed database rates differed materially from several fallback values.

#### High: tax is recomputed outside the booking snapshot

**Files:**

- `server/routes/appointment.routes.ts:871-877`
- `server/utils/invoice-helper.ts:69-102`

Invoice reconstruction can use current service/sub-service tax data instead of the exact rate used at booking time.

#### Medium: quote and booking country context can differ

Quote derives currency from service country:

- `server/routes/catalog.routes.ts:484-487`

Booking derives currency from provider country:

- `server/routes/appointment.routes.ts:864-866`

#### Medium: percentage promo base includes platform fees

**File:** `server/lib/pricing.ts:139-153`

Percentage promos can discount a base containing platform-owned fees.

#### Medium: refund preview and cancellation can diverge

**Files:**

- `server/routes/appointment.routes.ts:2542-2567`
- `server/routes/appointment.routes.ts:2910-2960`

The two paths do not load the same rule context consistently and should use the same UTC appointment timestamp.

### 8.5 Payment lifecycle

#### Stripe

- Checkout and payment creation: `server/routes/appointment.routes.ts:1465-1503`
- Raw webhook: `server/index.ts:106-112`
- Webhook processing: `server/stripeWebhook.ts:1-342`

Strengths:

- Raw body is preserved before JSON parsing.
- Stripe signature verification is attempted when configured.
- Event idempotency is recorded.
- Appointment and payment status are synchronized on successful payment.

Gaps:

- If the webhook secret is absent, signature verification is skipped with a development-only warning: `server/stripeWebhook.ts:103-116`.
- Database idempotency failure degrades to in-process protection: `server/stripeWebhook.ts:42-49`.
- In-process idempotency is not safe as the only guard across multiple instances.

#### Wallet

- Wallet routes: `server/routes/wallet.routes.ts`
- Wallet storage and ledger operations: `server/storage/database-storage.ts:3688-3781`

Strengths:

- Row locking
- Cent arithmetic
- Idempotency keys
- Insufficient-funds checks
- Frozen-wallet checks

#### Cash and bank transfer

- Booking creation: `server/routes/appointment.routes.ts:1520-1523`
- Payment status confirmation: `server/routes/appointment.routes.ts:2086-2157`

Offline payments remain pending until explicitly confirmed. Payment and appointment payment status are synchronized.

#### Refunds

- Refund rules: `server/db.ts:751-779`
- Refund action logic: `server/lib/appointmentActions.ts:58-131`
- Cancellation/refund processing: `server/routes/appointment.routes.ts:2656-2770`

Strengths:

- Appointment refund status guard
- Wallet idempotency key
- Stripe refund ID guard
- Stripe idempotency key

### 8.6 Provider settlement and payout

- Settlement: `server/lib/provider-settlement.ts`
- Earning recording: `server/storage/database-storage.ts:3014-3180`
- Lifecycle: `server/lib/provider-payout-lifecycle.ts`
- Automation: `server/services/payout-automation.service.ts`
- Routes: `server/routes/provider-wallet-payouts.routes.ts`, `server/routes/admin/payout-automation.routes.ts`

Offline cash/bank-transfer bookings are intentionally treated differently from completed online payments. That policy must remain explicit in reporting, reconciliation, and provider UX.

---

## 9. Authentication, authorization, and security

### 9.1 Authentication

**File:** `server/middleware/auth.ts:1-263`

Capabilities:

- JWT verification
- Cookie or Authorization header extraction
- 30-day access token
- 90-day refresh token policy
- Email-verification gate
- Provider-verification gate
- Auth cache
- Provider verification cache
- Login protection integration

### 9.2 Authentication findings

1. **In-process auth cache is not replica-shared:** `auth.ts:44-73`. Role, suspension, email verification, and provider verification changes can remain stale for up to 30 seconds per process.
2. **Provider onboarding bypass is route-prefix based:** `auth.ts:134-160`. The allowed list depends on path prefixes; any newly added `/api/provider/*` route must be reviewed so it cannot expose unintended functionality to unverified providers.
3. **Optional authentication treats database failure as anonymous:** `auth.ts:218-220`. Public routes using `optionalAuth` may lose tenant context during database failure.
4. **Legacy plaintext refresh-token column remains in the schema:** `shared/schema.ts:792-800` comments it as nullable legacy storage. Token-hash-only enforcement should be verified in all write paths.
5. **MFA has a fallback secret expression:** `server/routes/mfa.routes.ts:29` uses `SESSION_SECRET ?? "mfa-fallback-dev-secret"`. Startup validation should guarantee this path is impossible in every environment.

### 9.3 RBAC

**File:** `server/middleware/rbac.ts:1-283`

Permission catalog covers:

- Users
- Providers
- Documents
- Appointments
- Payments
- Tickets
- Content
- Analytics
- Settings
- Admin management
- Audit
- Monitoring

Role definitions include:

- `super_admin`
- `country_admin`
- `operations_admin`
- `finance_admin`
- `support_admin`
- `verification_admin`
- `read_only_admin`

#### RBAC findings

1. `admin` and `global_admin` bypass all permission checks: `rbac.ts:237-243`. This is an intentional compatibility rule but creates a super-admin bypass outside the named `super_admin` role.
2. Specialized role defaults are used when no assignment exists: `rbac.ts:254-258`. Absence of an assignment does not always fail closed.
3. `loadUserPermissions()` uses `LIMIT 500`: `rbac.ts:207-216`. Large assignment/permission sets are artificially capped.
4. Permission state is cached in-process for 30 seconds: `rbac.ts:183-225`.
5. The frontend permits `verification_admin`, while the shared user-role enum does not: `client/src/App.tsx:210-267`, `shared/schema.ts:7`.

### 9.4 Country isolation

**File:** `server/middleware/country.ts:1-127`

Countries:

- HU
- IR

Helpers:

- `isCountryCode`
- `normalizeCountry`
- `canAccessCountry`
- `assertCanAccessCountry`
- `listingCountryFilter`
- `countryCurrency`
- `requireCountryContext`

#### Country findings

1. Isolation is helper/convention based, not a universal data-layer policy.
2. Every new route must remember to call `listingCountryFilter()` or `assertCanAccessCountry()`.
3. Per-resource endpoints are especially easy to miss because listing filters do not protect individual fetches.
4. `admin` is treated as global in `adminScopeFor`: `country.ts:40-43`.
5. Unknown user countries default to HU in authentication cache: `auth.ts:108-112`, which is a safe operational fallback only if all country assignment failures are surfaced and corrected.

### 9.5 Rate limiting and request controls

**File:** `server/middleware/rateLimiter.ts:1-191`

Limiters include:

- Global API
- Authentication
- OTP
- Booking
- Payment
- Admin writes
- Slot operations
- Gift cards
- Public API

The project memory records that express-rate-limit v8 requires special configuration when global and route-specific limiters stack. This should remain covered by the existing rate-limit audit.

Risks:

- In-process rate-limit state is not shared across replicas.
- 50 MB request bodies are accepted globally.
- `/health` is outside `/api` rate limiting.

### 9.6 Webhook security

**Stripe:** `server/stripeWebhook.ts:87-140`

Strengths:

- Signature construction when secret exists
- Event idempotency
- Webhook metrics
- System-event logging

Gaps:

- Missing secret can skip signature verification in development behavior.
- DB idempotency failure falls back to process-local memory.
- Non-fatal ledger bridge errors are logged rather than making the webhook outcome fail: `server/stripeWebhook.ts:194-195`.

### 9.7 Upload and media security

Relevant files:

- `server/services/cloudinary.ts`
- `server/services/uploads.ts`
- `server/routes/provider-media.routes.ts`
- `server/index.ts:125-130`

Cloudinary supports image and document uploads. Local uploads are served from the application filesystem when Cloudinary is not configured.

Risks:

- Local files are ephemeral in container/multi-machine deployments.
- Upload limits and MIME/content validation must be checked independently per route.
- Documents and clinical files require strict authorization and audit coverage.
- Cloudinary asset backup is not covered by database backup.

### 9.8 AI integrations

Relevant files:

- `server/ai_integrations/chat/routes.ts`
- `server/ai_integrations/chat/storage.ts`
- `server/ai_integrations/image/routes.ts`
- `client/src/components/ai-chat-box.tsx`

Review requirements:

- Ensure prompts cannot expose cross-user clinical or financial data.
- Ensure AI requests are rate-limited and cost-bounded.
- Ensure generated image/file URLs do not bypass access policy.
- Ensure conversations are scoped to the authenticated user.

---

## 10. Provider lifecycle, KYC, clinical, and privacy

### 10.1 Provider onboarding

Primary locations:

- `server/routes/provider.routes.ts`
- `server/routes/provider-media.routes.ts`
- `server/lib/verification.ts`
- `client/src/components/provider/ProviderKYC.tsx`
- `client/src/components/provider/provider-documents-panel.tsx`

The current flow includes:

- Profile completeness
- Identity document
- Address proof
- Insurance/license documents
- Mobile verification gate
- Workplace/location gate
- Admin verification queue
- Document approve/reject/reupload/expire
- Resubmission tracking
- Provider activation and visibility

Important finding:

- Provider setup and provider document panels use different endpoints and responsibilities. They must remain coordinated so a document uploaded in one flow is visible to verification logic in the other.
- License document dual-write behavior and provider document status must be tested against the current database schema.

### 10.2 Clinical workspace

Relevant files:

- `server/routes/care.routes.ts`
- `server/routes/provider-schedule-admin.routes.ts`
- `client/src/components/provider/ClinicalWorkspacePanel.tsx`
- `client/src/pages/provider-clinical-dashboard.tsx`
- `client/src/pages/health-records.tsx`

Clinical features include:

- Medical history
- Prescriptions
- Patient timeline
- Care outcomes
- Patient notes
- Provider-patient relationship gates
- Clinical workspace tabs

Critical privacy requirements:

- Patient-provider relationship must be enforced server-side for every history/timeline endpoint.
- Admin access must be permission and country scoped.
- Audit logs must record document and clinical-data access.
- Frontend route protection must not be relied upon for clinical privacy.

### 10.3 Public profile and PII

`server/utils/sanitize.ts` is the PII stripping authority. Public provider lists and profiles must use the public sanitizer rather than returning full user rows.

The project has a specific distinction between:

- Public field stripping
- Sensitive token/password stripping

Any new provider or patient endpoint that returns joined users/providers must use the sanitizer and avoid `SELECT *` response serialization.

---

## 11. Scheduling, time, booking, and notifications

### 11.1 Time architecture

Relevant files:

- `server/lib/tzUtils.ts`
- `server/routes/provider-availability.routes.ts`
- `server/routes/appointment.routes.ts`
- `server/reminderCron.ts`
- `client/src/components/booking/SlotAvailabilityWidget.tsx`
- `client/src/components/appointment/AppointmentTimeContext.tsx`

The intended authority is:

- UTC `start_at` / `end_at`
- Provider timezone
- Local display date/time
- `startAtUtc` returned by slot APIs

Strengths:

- Slot availability has UTC timestamps.
- Frontend urgency and past filtering can use `startAtUtc`.
- Calendar formatting prefers UTC/Z values.
- Provider timezone fallback exists.

Risks:

- Legacy rows can have null UTC fields and fall back to browser-local parsing.
- `reminderCron.ts` contains legacy fallback paths for appointments without UTC fields.
- Any new route or component that parses date + time without timezone can reintroduce country-dependent booking errors.

### 11.2 Slot and hold integrity

Relevant files:

- `server/routes/provider-availability.routes.ts`
- `server/routes/appointment.routes.ts`
- `server/lib/conflictEngine.ts`
- `server/reminderCron.ts`

Known control areas:

- Slot holds
- Appointment conflict checks
- Stale hold expiry
- Unique time-slot index
- Stale `is_booked` healing
- Excluding the current patient’s own hold

Operational gaps:

- Hold-expiry notification fan-out is best effort and fire-and-forget.
- In-memory reminder deduplication is not safe across restarts or replicas.
- Cron failures can be swallowed and parent job status can remain successful.

### 11.3 Notifications

Relevant files:

- `server/services/notification-dispatcher.ts`
- `server/services/channels/email.ts`
- `server/services/channels/sms.ts`
- `server/services/channels/whatsapp.ts`
- `server/services/channels/push.ts`
- `server/routes/notification.routes.ts`

Strengths:

- Multiple channel adapters
- Event-based dispatcher
- Delivery logging
- Push subscription support

Gaps:

- Fire-and-forget delivery can complete the user-facing transaction before delivery failure is known.
- Notification duplication must remain controlled by event-key and dispatcher ownership.
- Channel configuration and retry behavior must be visible in operations monitoring.

---

## 12. Admin, reporting, governance, and compliance

### 12.1 Admin navigation and panels

**File:** `client/src/pages/admin-dashboard.tsx`

The admin dashboard uses custom sidebar navigation with conditionally rendered panels rather than a single Radix Tabs structure.

Major reporting and control domains:

- Home and health
- Providers and verification
- Users and roles
- Appointments and stale bookings
- Revenue and billing
- Financial master report
- Payouts and provider wallets
- Payment providers
- Currency rates
- Refunds
- Packages and promotions
- Legal compliance
- Support and bug reports
- Monitoring
- Audit logs
- Content
- RBAC

### 12.2 Admin findings

1. **Legacy admin roles bypass permission checks:** `server/middleware/rbac.ts:237-243`.
2. **Country filtering must be reviewed per resource:** listing filters are not sufficient for document, credential, provider, or wallet detail endpoints.
3. **Admin API shapes vary:** some endpoints return arrays while others return paginated objects. Frontend normalization exists in places but must remain consistent.
4. **Panels are heavily lazy-loaded:** named/default export conventions and error boundaries must be tested for every panel.
5. **Financial reports have multiple currency domains:** local booking values and USD accounting values require different formatters.
6. **Admin configuration writes must invalidate Revenue Engine/rate/provider caches:** otherwise UI changes can appear saved while active calculations continue using old values.
7. **Destructive reset/dev tools exist:** `server/services/database-reset.service.ts`, `server/routes/admin/admin-dev-tools.routes.ts`. These require strict production permission and audit review.

### 12.3 Legal/compliance

Relevant files:

- `shared/schema.ts:2552-2589`
- `server/routes/admin/legal.routes.ts`
- `server/routes/legal-public.routes.ts`
- `client/src/components/admin/dashboard/legal-compliance-panel.tsx`
- `client/src/pages/consent.tsx`

The legal model includes documents, versions, acceptances, and public retrieval. Required audit checks:

- Version immutability
- Acceptance timestamp and document-version binding
- Country/language handling
- Consent revocation or re-acceptance behavior
- Patient/provider access to their own acceptance history

---

## 13. Cron, scheduler, observability, and operations

### 13.1 Scheduled jobs

| Job | Location | Behavior |
|---|---|---|
| Reminders, stale holds, waitlist, rate sync | `server/reminderCron.ts` | Timer-based |
| Rolling schedule | `server/cron/rolling-schedule.ts` | Schedule generation |
| Wallet audit | `server/cron/wallet-audit.ts` | Wallet consistency |
| Ledger reconciliation | `server/crons/ledger-reconcile.ts` | Financial checks |
| Metrics snapshot and alerts | `server/crons/metrics-snapshot.ts` | Scheduled analytics/alerts |
| Generic scheduler registry | `server/lib/scheduler.ts` | New-job registry |
| Job tracking | `server/lib/cronState.ts` | In-process run state |

### 13.2 Confirmed scheduler gaps

1. **Jobs are process-local.** Multiple deployed instances can execute the same jobs.
2. **Reminder deduplication is process-local.** `server/reminderCron.ts:34-38,114-132`.
3. **Cron state resets on restart.** `server/lib/cronState.ts`.
4. **There are two scheduler patterns.** Dedicated timer chains coexist with `server/lib/scheduler.ts`.
5. **Subtask failure can be hidden.** `server/reminderCron.ts:453-469,489-492`.
6. **Notification fan-out is not awaited.** `server/reminderCron.ts:396-447`.
7. **No visible leader lease or distributed lock exists.**
8. **No visible shutdown cleanup stops all registered timers.**

### 13.3 Health and monitoring

**Health route:** `server/routes.ts:56-81`

It checks database reachability and returns basic environment/version data.

It does not verify:

- Startup migration completion
- Catalog seed completion
- Cron health
- Queue backlog
- WebSocket health
- Stripe readiness
- Cloudinary readiness
- Notification channel readiness
- Rate freshness
- Reconciliation status

Request metrics:

- `server/lib/requestMetrics.ts`
- In-memory
- Capped route buckets
- Reset on restart

This is useful for local diagnostics but not durable fleet-wide observability.

### 13.4 Backups and disaster recovery

**File:** `ops/backup-recovery.md`

The document identifies:

- PITR enablement
- Backup verification
- Quarterly restore testing
- Cloudinary asset recovery
- Manual migration and smoke testing

These are documented procedures, not demonstrated automated controls. Recovery readiness is therefore unverified.

---

## 14. Testing and quality

### 14.1 Current scripts

**File:** `package.json:6-14`

Available:

- `dev`
- `build`
- `start`
- `check`
- `db:push`
- `seed`
- `postinstall`

Missing:

- `test`
- lint
- format
- migration apply
- smoke test
- integration test with controlled fixtures
- CI command

### 14.2 Test inventory

Current test files:

- `server/tests/critical-paths.test.ts`
- `server/tests/financial-flows.test.ts`
- `server/tests/platform-coverage.test.ts`
- `server/tests/provider-domain.test.ts`
- `server/tests/provider-payout-lifecycle.integration.test.ts`
- `server/tests/provider-settlement-unit.test.ts`
- `server/tests/security-flows.test.ts`
- `server/tests/security-regression.test.ts`
- `tests/location.service.test.ts`

### 14.3 Testing gaps

1. Tests are not wired to `npm test`.
2. Tests are excluded from TypeScript checking: `tsconfig.json:3`.
3. Several custom tests skip when users, tokens, or database fixtures are absent.
4. No CI workflow is present under `.github`.
5. No stable isolated test database or fixture lifecycle is enforced.
6. No complete end-to-end booking/payment/refund/payout test is guaranteed.
7. No multi-instance scheduler test is present.
8. No migration-from-empty-database test is present.
9. No cross-country authorization matrix is proven across every admin resource endpoint.
10. No clinical-data access matrix is proven across patient/provider/admin roles.
11. No test proves that one appointment cannot create duplicate provider credit across all ledgers.
12. No test proves invoice output remains identical after live pricing/tax configuration changes.

### 14.4 Verified at audit time

- `npm run check` passed.
- `npm run build` passed.
- Provider settlement unit test passed.
- Provider payout lifecycle integration test passed.
- Workflow was running successfully.

These results prove compilation/startup and selected flows only; they do not establish full production correctness.

---

## 19. Phase 1.1 foundation stabilization and validation addendum

**Validation date:** 2026-08-06  
**Scope:** Phase 1 architecture consolidation and Phase 1.1 foundation stabilization  
**Mutation policy:** Application code and tests were updated. No financial records were repaired, deleted, or reclassified in the database.

### 19.1 Canonical financial architecture

The current settlement authority is:

```text
runRevenueEngine()
  -> provider_earnings
  -> provider_wallets (canonical USD balance)
  -> provider_ledger (append-only signed USD movements)
  -> payout lifecycle
```

- `runRevenueEngine()` is the booking pricing and settlement input authority.
- `provider_earnings` is the appointment-level settlement snapshot and idempotency record.
- `provider_wallets` is the withdrawable provider balance authority and is stored in USD.
- `provider_ledger.amount` is signed: positive values credit the wallet and negative values debit it.
- `provider_ledger.amount_usd` and `currency` preserve the USD audit representation.
- `marketplace_ledger` remains readable historical compatibility data only. It is not a current settlement, wallet, or reconciliation authority.
- Legacy escrow capture and appointment settlement endpoints remain discoverable for compatibility and return `410 Gone`.

### 19.2 Ledger reconciliation semantics

Wallet reconciliation sums only balance-affecting, already-signed ledger movements:

- `booking_income`
- `refund_deduction`
- `payout_held`
- `payout_deduction`
- `payout_returned`
- `manual_correction`
- `wallet_adjustment`
- `commission_deduction`
- `cash_platform_fee_deduction`
- `membership_charge`
- `package_charge`

`platform_fee_deduction` and `tax_deduction` are informational booking-settlement rows. They are excluded because `booking_income` already contains the provider gross payout, including patient-paid tax. Summing them again creates false wallet drift and can incorrectly freeze providers.

The reconciler now reports missing-appointment booking ledger references as explicit `warning` findings classified as historical/orphaned compatibility data. It does not suppress or mutate those rows.

### 19.3 Observed data classification

The first Phase 1.1 reconciliation investigation found two apparent wallet-drift cases. After applying the canonical movement model:

- Provider `01bc2509-dc57-46ed-b0a5-63dd167c67d9`: wallet `25.49 USD`; balance-affecting ledger net `25.49 USD`; informational rows included a legacy `1620.00` tax value recorded as if it were USD.
- Provider `b99e9e6d-b310-47ba-95fc-09e5ed15bf7c`: wallet `49.79 USD`; balance-affecting ledger net `49.79 USD`; informational tax/platform rows accounted for the apparent drift, with payout hold/return movements included correctly.

The referenced appointment IDs were absent from the current `appointments` table. These rows are therefore historical/orphaned compatibility data. They remain visible to reconciliation and were not silently repaired or deleted. No active canonical booking path was found to be writing native booking-currency tax values into balance-affecting USD movements.

### 19.4 Readiness and scheduler controls

- The HTTP server listens before migrations so the process can be observed.
- `/health` returns `503` with degraded readiness until migrations complete, and `200` only when the database is reachable and readiness is `ready`.
- The shared scheduler owns recurring timers and records named jobs. Current recurring registrations include reminder, hourly, ledger reconciliation, metrics snapshot, and financial alert jobs.
- Shutdown stops scheduler timers, closes the HTTP server, and ends the database pool.
- Scheduler subtasks run sequentially where pool pressure matters; one task failure does not prevent later tasks from running.

### 19.5 Phase 1.1 regression coverage

Validated coverage now includes:

- Canonical provider earning → wallet → provider ledger flow
- Signed ledger movement semantics
- Informational tax/platform-fee exclusion from wallet reconciliation
- Provider ledger USD audit columns
- Retired settlement endpoint behavior
- Readiness state transitions
- Scheduler registration and shutdown
- Existing payout lifecycle idempotency and reconciliation regression suites

`npm run check`, the pure Phase 1 foundation tests, and the database-backed canonical financial-flow tests are release-gate checks. Production build and workflow restart are performed after this addendum is committed.

### 19.6 Deferred scope

Phase 2 authorization and country-isolation consolidation was not started. No broad cleanup was performed beyond confirmed foundation debt and the obsolete escrow assertions in the financial-flow regression test.

---

## 15. Legacy code, drift, and duplicate authorities

### 15.1 Current legacy routes and compatibility behavior

- `/booking` → `/book`: `client/src/App.tsx:203-205`
- `/book-wizard` → `/book`: `client/src/App.tsx:207-208`
- `/provider/setup` → provider dashboard profile: `client/src/App.tsx:196-198`
- `/patient/workspace` and `/patient/records` → patient dashboard: `client/src/App.tsx:185-186`

These routes are valid compatibility paths but should be explicitly included in route tests and documentation.

### 15.2 Current legacy schema elements

- Legacy appointment status values remain in `shared/schema.ts:19-23`.
- Provider-level fee columns are marked deprecated in `shared/schema.ts:166`.
- Legacy plaintext refresh-token column is retained in `shared/schema.ts:795`.
- Legacy messaging tables coexist with current messaging tables around `shared/schema.ts:745-784`.
- Legacy local date/time appointment fields coexist with UTC fields.

### 15.3 Duplicate authorities

| Concern | Current competing authorities |
|---|---|
| Database schema | Drizzle migrations, `drizzle-kit push`, startup DDL, scripts |
| Database variable | `SUPABASE_DATABASE_URL`, `DATABASE_URL` |
| Database driver | `pg`/Supabase and retained Neon dependency |
| Pricing | `computeFinalPrice()`, Revenue Engine, quote checks, booking checks, invoice reconstruction |
| Settlement | Provider earnings/provider wallet and marketplace ledger |
| Commission | Revenue rules, provider fee fields, legacy settlement fallback |
| Currency | Database rates, hardcoded fallbacks, caller-selected booking context |
| Tax | Country tax, sub-service tax, invoice reconstruction |
| Scheduling | Dedicated cron timers and scheduler registry |
| File storage | Cloudinary and local uploads |
| Authorization | JWT role, admin role, RBAC assignments, frontend route roles, manual country checks |
| Messaging | Legacy and current conversation/message tables |
| Admin navigation | Custom sidebar and many independent lazy panels |

### 15.4 Drift findings

1. Frontend role `verification_admin` vs shared enum role list.
2. Render database variable vs Supabase-required runtime variable.
3. Neon dependency vs Supabase-only database policy.
4. Native booking currency vs marketplace-ledger USD assumption.
5. USD provider wallet vs native-currency provider-ledger deductions.
6. Quote payment default vs booking/payment-row default.
7. Country tax selection vs invoice tax reconstruction.
8. Startup migration readiness vs traffic readiness.
9. In-process cron state vs multi-instance deployment.
10. Cloudinary durability vs local filesystem fallback.
11. Legacy and current messaging table models.
12. Client route protection vs server authorization responsibility.

---

## 16. Current observed database and configuration state

Read-only observations available during the audit:

| Area | Observed state |
|---|---|
| Active/non-terminal bookings | None observed |
| Appointment financial snapshots | None observed |
| Platform fee rules | 2 rows, 2 active |
| Commission rules | 2 rows, 2 active |
| Payment-method rules | 9 rows |
| Travel-fee rules | 0 rows |
| Revenue-share rules | 0 rows |
| Tax rows | 3 rows, 2 active |
| Currency-rate rows | 5 rows |
| Provider-wallet drift | 2 reconciliation findings |

The absence of active bookings at inspection time reduces the ability to prove duplicate settlement behavior against live appointments. It does not remove the code-path risk.

---

## 17. Remediation plan

### Phase 0 — Financial safety and access control

1. Disable or fully authorize `POST /api/financials/capture-escrow`.
2. Block marketplace settlement until currency and ownership validation are correct.
3. Freeze affected provider payouts.
4. Quarantine and classify mixed-currency ledger rows.
5. Reconcile provider wallet balances from a canonical USD source.
6. Make payment method mandatory and pass one validated value through quote, booking, payment, and settlement.

### Phase 1 — Establish canonical financial data

1. Choose one provider settlement authority.
2. Make financial snapshot creation atomic with appointment creation.
3. Store booking currency, USD equivalent, tax rate, tax name, commission, platform fee, and applied rule identifiers in immutable snapshots.
4. Generate invoices from snapshots only.
5. Eliminate hardcoded exchange-rate fallback or enforce a maximum stale-rate age.
6. Define the exact promo discount base.
7. Add database constraints and idempotency around every financial transition.

### Phase 2 — Authorization and privacy

1. Reconcile role enums, frontend roles, database roles, and RBAC role names.
2. Audit every admin list and per-resource endpoint for country isolation.
3. Replace path-prefix onboarding bypasses with explicit route permission groups.
4. Verify token-hash-only refresh-token writes.
5. Ensure clinical and document endpoints enforce relationship/permission checks server-side.
6. Make webhook signature verification mandatory outside an explicit local-development mode.
7. Move webhook idempotency and rate-limit state to shared durable storage for multi-instance deployments.

### Phase 3 — Schema and deployment authority

1. Select one migration mechanism.
2. Separate DDL migrations from startup seeding.
3. Make required schema readiness observable through `/health/ready`.
4. Make migration failures fail deployment or mark readiness unhealthy.
5. Remove or justify Neon dependency and legacy database variables.
6. Choose one supported deployment target and keep other manifests explicitly archival or tested.
7. Choose Cloudinary or durable object storage as the production upload authority.

### Phase 4 — Scheduler and operations

1. Use one scheduler implementation.
2. Add distributed job leases/idempotency.
3. Make reminder and notification delivery durable and retryable.
4. Propagate subtask failures to job status.
5. Add graceful shutdown for HTTP, WebSockets, timers, and database pool.
6. Expand health checks to migrations, jobs, rate freshness, payment configuration, and queue status.
7. Add durable metrics and alert history.

### Phase 5 — Test and release gates

1. Add `npm test`.
2. Add CI for check, build, tests, migration boot, and smoke tests.
3. Stop silently skipping critical tests; distinguish unavailable external integrations from passed tests.
4. Add controlled database fixtures.
5. Add end-to-end tests for:
   - Registration/login/MFA
   - Provider onboarding/KYC
   - Service creation and approval
   - Slot hold and booking
   - Stripe payment/webhook
   - Wallet payment
   - Cash/bank transfer confirmation
   - Cancellation/refund
   - Reschedule proposal
   - Invoice generation
   - Provider earnings
   - Payout request and failed transfer retry
   - Gift-card purchase/redemption
   - Membership benefits
   - Group session booking/refund
   - Cross-country access
   - Clinical data authorization
   - Duplicate webhook and duplicate settlement attempts

---

## 18. Final audit verdict

GoldenLife is a broad, feature-rich healthcare platform with meaningful working infrastructure and strong implementation in several individual areas, especially wallet idempotency, Stripe body handling, payout lifecycle control, provider verification concepts, UTC scheduling support, and shared UI architecture.

The project’s main weakness is system consolidation. The current application contains multiple active ways to calculate, authorize, store, settle, schedule, migrate, and monitor the same business operation. The most serious consequences are:

- Financial overstatement or duplicate provider settlement
- Currency-unit corruption in provider ledgers
- Cross-country or per-resource authorization omissions
- Partial schema startup with traffic still accepted
- Duplicate scheduled work under multiple instances
- False-positive operational health
- Incomplete recovery confidence

The project should be treated as **feature-complete in breadth but not yet control-complete in financial, authorization, migration, scheduler, and operational authority**. The remediation plan above should be executed in priority order before relying on the application for production financial settlement or multi-instance healthcare operations.
