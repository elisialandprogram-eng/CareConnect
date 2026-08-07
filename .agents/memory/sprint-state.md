---
name: Sprint tracking
description: Latest sprint state, closed sprints log, and health scores
---

## Sprint C12 — Patient E2E Full Sweep (closed 2026-06-06)

**Result:** GO — 60/60 patient actions PASS  
**Health score:** 99/100

### Bugs fixed this sprint

| # | Bug | Root cause | Fix |
|---|-----|------------|-----|
| A | `GET /api/patient/documents` → 500 | `family_member_id` column missing in Supabase `patient_documents` | Added via `ALTER TABLE … ADD COLUMN IF NOT EXISTS` in `runStartupMigrations()` |
| B | `GET /api/family-members/:id/documents` → 500 | Same missing column | Same fix |
| C | `GET /api/gift-cards/mine` → 404 | Route ordering: `/mine` was after `/:code` param | Moved `/mine` before `/:code` in `payment.routes.ts` |
| D | `POST /api/privacy/requests` → 500 | Invalid enum value `privacy_request_submitted` in audit_logs | Changed to `'create'` |
| E | `GET /api/patient/me/data-export` → 500 (1st) | Invalid enum `data_export_requested` + column `language` | Changed to `'export'` + `language_preference` |
| F | `GET /api/patient/me/data-export` → 500 (2nd) | `users.updated_at` doesn't exist in Supabase `users` table | Removed from SELECT |
| G | `GET /api/patient/me/data-export` → 500 (3rd) | `privacy_requests.updated_at` + patient_documents UNION wrong columns | Fixed: removed `updated_at`, used `patient_id` not `user_id`, `title` not `file_name`, `is_accepted` not `accepted` in patient_consents, removed non-existent referral columns |

### Key finding: Supabase `users` table lacks `updated_at`
The Drizzle schema defines `updatedAt: timestamp("updated_at")` on `users` but Supabase never ran that migration. Any raw SQL query selecting `updated_at` from `users` will 500. Use only `created_at` from `users` in raw SQL.

### Key finding: `patient_documents` column names
- `patient_id` (NOT `user_id`)
- `title` (NOT `file_name`)
- `visibility` (NOT `status`)
- `file_url` ✓

### Key finding: `patient_consents` column names
- `is_accepted` (NOT `accepted`)
- `user_id` ✓

## Phase-A Closure Sprint (closed 2026-06-09)

**Result:** GO — TSC exit 0, server clean, 0 browser JS errors

### Sections completed

| Section | Feature | Key files |
|---------|---------|-----------|
| A | Promo code in booking canvas — state, validatePromoMut, input+apply UI, price breakdown | booking-canvas.tsx, book-wizard.tsx |
| B | Membership badge in payment step — activePkgs query, Crown badge | booking-canvas.tsx |
| C | Notifications delete + bulk select — DELETE/:id, POST /bulk-action backend; per-item Trash2 + Select/CheckSquare toolbar | notification.routes.ts, notifications.tsx |
| D | Health records family-member parity — ?memberId= param, member banner, back button, member appointments query | health-records.tsx |
| E | Referral leaderboard — GET /api/referrals/leaderboard (anon), toggle card with medal ranks | community.routes.ts, referrals.tsx |
| F | Dashboard quick-link widgets — Health Records (sky) + Refer & Earn (amber) quick-link cards | patient-dashboard.tsx |

### Key patterns used
- `discountedTotal = max(0, totalDue - promoDiscount)` replaces `totalDue` in walletApplied/remainder/wallet-button check
- `promoResult` reset in useEffect on `open` state change
- Bulk action endpoint uses `id = ANY($1::text[]) AND user_id = $2` for safe multi-delete/mark-read
- Health records `useSearch()` from wouter to parse `?memberId=` without router param changes

## Verification Consolidation + Smart Scheduler (closed 2026-06-10)

**Result:** GO — migrations confirmed, tsc clean, server running

### What was done

| Part | Feature | Key files |
|------|---------|-----------|
| 1A | Added `business_license` KYC slot (optional) | ProviderKYC.tsx |
| 1B | Normalised `business_registration` → `business_license` in verification tracker | provider-verification-tracker.tsx |
| 1C | Data repair migration: renames old doc_type rows on boot | server/db.ts |
| 2A | `POST /api/provider/schedule-templates/batch` — atomic multi-window day replace | provider.routes.ts |
| 2B | `GET /api/provider/schedule-templates?modality=` filter | provider.routes.ts |
| 2C | `DELETE /api/provider/schedule-templates/day/:dow?modality=` filter | provider.routes.ts |
| 2D | `provider_schedule_templates.modality` column via startup migration | server/db.ts |
| 2E | `SmartScheduler.tsx` — 4-tab component replacing 7 old availability components | SmartScheduler.tsx |
| 2F | Provider dashboard Availability tab now uses `<SmartScheduler>` | provider-dashboard.tsx |

### SmartScheduler quick-reference
- 4 tabs: Schedule / Time Off / Settings / Insights
- Modality pills: All | Clinic | Home Visit | Video
- Quick templates: Mon–Fri 9–5, Mon–Sat 9–5, Mon–Fri 8–4, Weekends, Evenings
- Bulk apply: pick days + time range → applies to grid
- Add break: second window per day
- Save → PATCH batch endpoint (dirty tracking per day)

## Sprint E4 — Provider Platform Validation & Enhancement (closed 2026-06-10)

**Result:** GO — app clean, no browser JS errors, no server 500s

### What was done

| Task | Feature | Key files |
|------|---------|-----------|
| T001 | Visibility engine in catalog + appointment routes | catalog.routes.ts, appointment.routes.ts |
| T002 | Lifecycle dashboard on admin home | admin-home.routes.ts, admin-home.tsx |
| T003 | Admin internal notes (DB + 4 API endpoints + Notes tab) | db.ts, admin-providers.routes.ts, provider-operations-console.tsx |
| T004 | Provider readiness score widget in KYC panel | ProviderKYC.tsx |
| T005 | Post-approval congratulations banner | provider-dashboard.tsx |
| T006 | Document expiry automation confirmed live (pre-existing) | reminderCron.ts |

**Key pattern found:** `ProviderNotesPanel` must be a standalone function component — React rules-of-hooks forbids calling `useState`/`useQuery` inside an IIFE inside JSX.

**Audit action enum:** `provider.note_added` added to the ALTER TYPE loop in `server/db.ts`.

## P11 — Communication, Notification, Invoice & Currency Consistency Hardening (closed 2026-06-12)

**Result:** GO — TSC exit 0, zero browser errors, server clean

### What was done

| WS | Area | Fix |
|----|------|-----|
| W2 | Notification dispatcher | +7 EventKeys (refund, wallet.topup/refund, membership.*, package.purchased); +9 notify wrappers (appointmentConfirmed, waitlistSlotAvailable, payoutStatusChanged, invoiceOverdue, paymentRefunded, walletTopup, walletRefund, membershipPurchased/Expired/Renewed, packagePurchased) |
| W2 | paymentReceived | `formattedAmount` now required (was optional); raw `${amount} ${currency}` fallback removed |
| W2 | Duplicate in-app payment notification | Removed 13-line `storage.createUserNotification` block from appointment.routes.ts; dispatcher is now sole authority |
| W2 | Payout notification amounts | `admin-financial.routes.ts` now uses `formatSync(payout.amount, countryCurrency)` before notification dispatch |
| W4 | Invoice wallet deduction | `invoice-gen.ts` adds blue "Wallet credits" row; `invoice-helper.ts` converts walletAmountUsed (USD→display) via snapshot exchange rate |
| W7 | i18n ($) symbols | Removed 24 hardcoded `($)` from 8 fee-label keys across en/hu/fa translation files |
| Fix | TS errors | Fixed 2 implicit-any in ProviderProfileTab.tsx (filter callback params) |

### Key lessons
- `notify.payoutStatusChanged()` is the new convenience wrapper; old `dispatchNotification({eventKey: "payout.*"})` call-sites in admin-financial.routes.ts use inline formatting (both patterns coexist — wrapper preferred for new code)
- wallet deduction row uses `(invoice as any).walletAmountUsed` cast because the invoice object type is not extended — intentional to avoid schema change
- Report: `ops/Communication-Notification-Invoice-Hardening-Report.md`

## P10.3 — Profile Strength Indicator + Currency Authority Audit (closed 2026-06-12)

**Result:** GO — no browser JS errors, all HMR updates clean

### What was done

| Part | Feature | Key files |
|------|---------|-----------|
| 1 | `ProfileStrength` component with 18 scored items, circular ring, collapsible checklist, "Fix →" section links | ProviderProfileTab.tsx |
| 2 | Address proof split: identity (5pts) + proof-of-address (5pts) for accurate gate alignment | ProviderProfileTab.tsx |
| 3 | Submit for Review button inside ProfileStrength (enabled at ≥60%, blocked for submitted/approved/active/suspended/deactivated statuses) | ProviderProfileTab.tsx |
| W14 | Service card prices: `$` prefix → `fmtMoney()` for all 4 display sites (service price, visit fee chips, package service picker, savings line) | ProviderServicesTab.tsx |
| W14 | Service delivery section label: hardcoded `(USD)` → dynamic `(${provider.currency})` | ProviderProfileTab.tsx |
| W14 | Catalogue guardrail messages: `$X.XX USD` → `formatInCurrency(X, "USD")` for all 4 guardrail states | add-service-catalogue-dialog.tsx |

### Key lessons
- ProfileStrength component uses its own `useQuery(["/api/provider/documents"])` — cache is shared with ProviderDocumentsPanel so no extra network cost
- `BLOCKED_STATUSES` list: `["submitted","pending_approval","approved","active","suspended","deactivated"]` — submit button hidden for all of these
- `fmtMoney` in ProviderServicesTab comes from `useCurrency()` hook destructured at line 173: `const { format: fmtMoney, code } = useCurrency()`
- `formatInCurrency(amount, "USD")` from `@/lib/currency` works in components that don't call `useCurrency()` hook (like catalogue dialog)

## Sprint P9 — Booking System Audit & Bug Fixes (closed 2026-06-12)

**Result:** GO — 5 bugs fixed (3 server, 1 UI, 1 confirmed-not-a-bug); 7 workstreams audited clean; server restart EXIT:0; no browser JS errors.

### Bugs fixed

| # | Issue | Root cause | Fix file |
|---|-------|------------|----------|
| 1 | Past slots visible | `Intl.DateTimeFormat hour12:false` returns "24" for midnight → `nowMs=NaN` → all slot filters pass | `provider-availability.routes.ts` — NaN guard |
| 2 | Wrong cancel message for past appointments | `hoursBeforeStart < 0` triggers "within 6h" message | `appointmentActions.ts` — explicit `< 0` check first |
| 3 | Bank transfer bypasses payment registry | No registry check before booking creation | `appointment.routes.ts` — payment method gate |
| 4 | Wallet option missing during registry load | Wallet rendered only in `registryProviders.map()` | `booking-canvas.tsx` — standalone fallback button |
| 5 | Stripe orphan records | (Confirmed clean — slot freed + appointment cancelled on failure) | No fix needed |

### Key lessons
- `Intl.DateTimeFormat` with `hour12:false` can return "24" for midnight on some Node locales, making downstream numeric comparisons silently return false — always add `if (!Number.isFinite(nowMs))` guard after timezone drift calculation.
- Payment method registry gate: first-party methods (card/wallet/cash) bypass registry check; all others must pass `payment_providers.is_enabled + country_codes` gate.
- See full report: `ops/Booking-System-Audit-And-Fix-Report.md`

## Launch Readiness Chaos Audit (closed 2026-06-14)

**Result:** GO — 4 defects found and fixed; 12 domains audited clean; server running.

### Bugs fixed

| # | Issue | Root cause | Fix |
|---|-------|------------|-----|
| 1 | Duplicate in-app notifications on reschedule-response | `createUserNotification` called directly for both parties before `notify.appointmentRescheduled/Cancelled` which also creates in-app | Removed direct calls; notify.* handles both in-app + multi-channel |
| 2 | no_show admin branch only notified patient | `else` branch pushed only `updated.patientId`; provider silently skipped when admin triggers | Split into `else if (role==="provider")` (patient) and `else` admin (both) |
| 3 | `confirmed` status no multi-channel dispatch | `notify.appointmentConfirmed` existed but was never called from PATCH /status | Added call after in-app createUserNotification for status === "confirmed" |
| 4 | Dead-code patient whitelist in PATCH /status | `patientAllowedStatuses` entries all pre-blocked by `actionOnlyStatuses` — unreachable | Replaced with direct 403 routing to action endpoint |

### Confirmed clean (no defects)
State machine, idempotency, refund guards, IDOR, country scope, comms hub, clinical workspace, home visit radius, credential expiry, stale data cleanup.

## Operations & Billing Consolidation Sprint (closed 2026-06-18)

**Result:** GO — server clean, no browser JS errors, all 5 deliverables complete

### Deliverables

| # | Deliverable | Status |
|---|-------------|--------|
| 1 | Operations Bookings Center rewrite — 8-section A–H console, investigation drawer, column visibility, saved views, CSV/PDF export, inline status updates | DONE |
| 2 | Revenue & Billing Center — 6 new operational tabs (Refunds, Invoices, Patient Wallets, Payouts, Provider Wallets, Promo Codes) via React.lazy | DONE |
| 3 | Duplicate RefundRulesPanel eliminated — `refund-management.tsx` is sole source | DONE |
| 4 | `financial_alerts.details JSONB` column added via startup migration (fixes GET /api/admin/financial/alerts 500) | DONE |
| 5 | `ops/OPERATIONS-BILLING-CONSOLIDATION-REPORT.md` produced | DONE |

### Key patterns
- New tabs in RevenueBillingCenter use `React.lazy()` + `Suspense` + `PanelLoader` component defined in same file
- Lazy imports use `.then(m => ({ default: m.NamedExport }))` pattern since all target panels are named exports
- Bookings operations data from `/api/admin/financial/master-report` (not `/api/admin/bookings`) — richer join
- `cron_ledger_reconcile failed — 1 non-ok finding(s)` is EXPECTED behavior, not a bug

## Previous sprints
- C22.0 (2026-06-08): Provider Portal Hardening sweep (6 parts) — RecurringTemplateWizard+BulkVacationBlockout (AvailabilityTemplate.tsx); PayoutSettings IBAN/SWIFT (PayoutSettings.tsx); clinical note auto-save+beforeunload (ProviderAppointmentsTabs); multi-currency filter bar (provider-earnings.tsx); patient PIN sign-off gate (4-digit dialog intercepting "Mark Completed"); under-review lockout banner+disabled controls (ProviderPreferencesTab); all 6 wired into provider-dashboard.tsx; tsc EXIT:0
- C21.1 (2026-06-08): Client-side portal hardening sweep — TelehealthRoom.tsx + WalletTopUpModal.tsx created; ChatBox drag-drop; SlotAvailabilityWidget SVG empty state; book-wizard hold-expired Dialog; appointment-details TelehealthRoom embed; wallet.tsx modal refactor; tsc EXIT:0; 23/23 tests pass
- C21.0 (2026-06-07): Dynamic intake forms + schedule overrides + room allocation + payout splits; TSC exit 0; all 4 DB migrations confirmed in Supabase
- C20.0 (2026-06-07): OCC version column on time_slots; /ws/slots WS broadcaster; idempotency ledger verified; TSC exit 0
- C19.0 (2026-06-07): Family member selector in BookingCanvas; appointment_consents audit ledger; TSC exit 0
- C11 (2026-06-06): provider E2E+action coverage; 4 bugs fixed; 99/100
- C8 (2026-06-06): platform validation audit; 2 bugs fixed; 96/100
