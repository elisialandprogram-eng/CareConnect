# GoldenLife Healthcare — Feature Inventory Audit
**Date:** 2026-06-08
**Scope:** Full codebase analysis — features, workflows, integrations, roles, gaps
**Type:** Analysis only — no code changes made

---

## SECTION 1 — PATIENT FEATURES

### 1.1 Registration
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Email/password sign-up with optional referral code, OTP email verification, and country selection (HU/IR). |
| **Pages** | `/register` |
| **APIs** | `POST /api/auth/register`, `POST /api/auth/resend-email-otp`, `GET /api/auth/lookup-pending`, `GET /api/referrals/lookup/:code` |
| **Tables** | `users`, `user_notifications` |

---

### 1.2 Login
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Email/password login returning a signed JWT. Refresh token rotation. Password reset via OTP email flow. |
| **Pages** | `/login` |
| **APIs** | `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/reset-password`, `POST /api/auth/forgot-password` |
| **Tables** | `users`, `refresh_tokens` |

---

### 1.3 Profile Management
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Patients can update name, phone, address, avatar (Cloudinary), language, currency, and country preferences. |
| **Pages** | `/profile`, `/settings` |
| **APIs** | `GET /api/auth/me`, `PATCH /api/auth/me`, `POST /api/upload` |
| **Tables** | `users` |

---

### 1.4 Provider Discovery & Search
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Full-text search (tsvector) with filters by category, city, language, visit type, price range. Smart recommendation engine using city/language/budget/history signals. Paginated results. |
| **Pages** | `/providers` |
| **APIs** | `GET /api/providers`, `GET /api/providers/recommended`, `GET /api/categories` |
| **Tables** | `providers`, `users`, `sub_services`, `services` |

---

### 1.5 Provider Profile View
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Public profile showing bio, services, credentials, gallery, reviews, ratings, available slots. Save/unsave provider. |
| **Pages** | `/provider/:id` |
| **APIs** | `GET /api/providers/:id`, `GET /api/providers/:id/credentials`, `GET /api/providers/:id/reviews`, `GET /api/providers/:id/packages`, `POST /api/saved-providers`, `DELETE /api/saved-providers/:id` |
| **Tables** | `providers`, `users`, `provider_credentials`, `reviews`, `provider_packages`, `saved_providers` |

---

### 1.6 Appointment Booking
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Multi-step wizard: select provider → service → slot → sessions → payment → confirm. Advisory slot holds prevent double-booking. Auto-assigns practitioner by load. Supports clinic/home-visit/telemedicine. |
| **Pages** | `/book-wizard`, `/booking/confirmation/:appointmentId` |
| **APIs** | `POST /api/appointments`, `GET /api/providers/:id/available-slots`, `POST /api/slot-holds`, `DELETE /api/slot-holds/:id`, `POST /api/pricing/quote`, `GET /api/services/:id/auto-practitioner` |
| **Tables** | `appointments`, `time_slots`, `slot_holds`, `services`, `practitioners`, `appointment_events` |

---

### 1.7 Appointment Management
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | View upcoming and past appointments. Cancel (with refund path). Reschedule. Add private notes. Re-book. Leave review on completed visits. |
| **Pages** | `/dashboard`, `/appointments`, `/appointments/:id` |
| **APIs** | `GET /api/appointments/patient`, `GET /api/appointments/:id`, `POST /api/appointments/:id/cancel`, `POST /api/appointments/:id/reschedule`, `PATCH /api/appointments/:id/status` |
| **Tables** | `appointments`, `appointment_events`, `payments`, `wallets` |

---

### 1.8 Wallet
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Patient credit wallet with Stripe top-up, transaction ledger, balance display, currency conversion. Wallet balance can be used at checkout (full or partial). |
| **Pages** | `/wallet` |
| **APIs** | `GET /api/wallet`, `GET /api/wallet/transactions`, `POST /api/wallet/topup` |
| **Tables** | `wallets`, `wallet_transactions` |

---

### 1.9 Payments
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Stripe Checkout for bookings and wallet top-ups. Webhook-driven confirmation. Dual-path: wallet deduction or Stripe. Partial wallet + Stripe remainder supported. Invoice PDF generated on completion. |
| **Pages** | `/book-wizard` (checkout step), `/wallet` |
| **APIs** | `POST /api/payments/checkout`, `POST /api/stripe/webhook`, `POST /api/invoices/generate/:appointmentId`, `GET /api/invoices/me` |
| **Tables** | `payments`, `wallets`, `wallet_transactions`, `invoices`, `idempotency_keys` |

---

### 1.10 Video Consultation
| Attribute | Detail |
|---|---|
| **Status** | Complete (Beta) |
| **Description** | Patients join video sessions from appointment detail page. Daily.co-backed room with Jitsi fallback. Screen sharing supported. |
| **Pages** | `/appointments/:id` (inline room embed) |
| **APIs** | `GET /api/video/room/:appointmentId` |
| **Tables** | `appointments` (visit_type = telemedicine) |

---

### 1.11 Notifications
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Multi-channel delivery: in-app, email (Resend), SMS (Twilio), WhatsApp (Twilio), push (VAPID). Notification feed with mark-read and mark-all-read. Preference management. |
| **Pages** | `/notifications`, `/settings` |
| **APIs** | `GET /api/notifications`, `PATCH /api/notifications/:id/read`, `POST /api/notifications/mark-all-read`, `GET /api/notifications/preferences`, `PATCH /api/notifications/preferences` |
| **Tables** | `user_notifications`, `notification_delivery_logs`, `push_subscriptions` |

---

### 1.12 Reviews & Ratings
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Patients submit star rating + comment after completed appointments. Providers can reply publicly. |
| **Pages** | `/review/:appointmentId`, `/provider/:id` |
| **APIs** | `POST /api/reviews`, `GET /api/providers/:id/reviews`, `PATCH /api/reviews/:id/reply` |
| **Tables** | `reviews` |

---

### 1.13 Family Accounts
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Patients can add family members (with consent records), book appointments on their behalf, and view per-member appointment and document history. |
| **Pages** | `/family-members`, `/family-members/:id` |
| **APIs** | `GET/POST/PATCH/DELETE /api/family-members`, `GET /api/family-members/:id/appointments`, `GET/POST /api/family-members/:id/consents`, `GET /api/family-members/:id/documents` |
| **Tables** | `family_members`, `family_member_consents`, `appointments` |

---

### 1.14 Medical Records & Documents
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Patient can upload personal gallery/medical images. View documents linked to appointments and family members. |
| **Pages** | `/my-documents`, `/dashboard` |
| **APIs** | `GET /api/patient/documents`, `GET /api/patient/gallery`, `POST /api/patient/gallery/upload`, `DELETE /api/patient/gallery/:id` |
| **Tables** | `patient_documents`, `patient_gallery` |

---

### 1.15 Referrals
| Attribute | Detail |
|---|---|
| **Status** | Partial |
| **Description** | Each user has a unique referral code. Registration accepts `referredByUserId`. Referral page shows code and referral count. **Missing:** automated wallet credit on referee's first appointment completion. |
| **Pages** | `/referrals` |
| **APIs** | `GET /api/referrals/me`, `GET /api/referrals/lookup/:code` |
| **Tables** | `users` (referral_code, referred_by_user_id) |

---

### 1.16 Promo Codes / Coupons
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Discount codes (fixed or percentage) with validity windows, usage limits, provider restrictions, and service restrictions. Applied at booking checkout via pricing engine. |
| **Pages** | `/book-wizard` (checkout step) |
| **APIs** | `POST /api/promo-codes/validate`, `POST /api/pricing/quote` |
| **Tables** | `promo_codes`, `promo_code_usages` |

---

### 1.17 Messaging / Chat
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Real-time WebSocket chat between patient and provider. File/image/audio attachments via Cloudinary. Message read receipts. |
| **Pages** | `/messages` |
| **APIs** | `GET /api/chat/conversations-rich`, `GET /api/chat/messages/:id`, WebSocket (`/ws/chat`) |
| **Tables** | `chat_conversations`, `chat_messages` |

---

### 1.18 Waitlist
| Attribute | Detail |
|---|---|
| **Status** | Partial |
| **Description** | Patient can join a waitlist for a provider. View and cancel waitlist entries. **Missing:** automated slot-available fan-out notification to waitlist patients when a slot opens. (Cron logic is stubbed but circular-import-safe version not wired.) |
| **Pages** | `/waitlist` |
| **APIs** | `GET /api/waitlist/me`, `DELETE /api/waitlist/:id` |
| **Tables** | `waitlist` |

---

### 1.19 Support Tickets
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Patients submit support tickets. AI-assisted classification and FAQ suggestions. Threaded messages with admin. Status tracking. |
| **Pages** | `/support/tickets` |
| **APIs** | `GET/POST /api/support/tickets`, `POST /api/support/tickets/:id/messages` |
| **Tables** | `support_tickets`, `support_ticket_messages` |

---

### 1.20 Bug Reports
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Users can submit bug reports with screenshots (Cloudinary). Admin tracks with severity/priority/status. |
| **Pages** | `/my-reports` |
| **APIs** | `GET/POST /api/bug-reports`, `GET /api/bug-reports/me` |
| **Tables** | `bug_reports`, `bug_report_comments` |

---

### 1.21 Group Sessions
| Attribute | Detail |
|---|---|
| **Status** | Partial |
| **Description** | Patients can discover and book group sessions via wallet payment. Can "join" during live window. **Missing:** full video integration (only 1:1 has Daily.co-backed rooms), cancellation/refund handling for group bookings. |
| **Pages** | `/providers` (discovery), booking via session.routes |
| **APIs** | `GET /api/group-sessions`, `POST /api/group-sessions/:id/book` |
| **Tables** | `group_sessions`, `group_session_bookings` |

---

### 1.22 Membership Packages
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Providers offer session bundles (e.g., 5-session packs) with discount logic. Package discount applied by pricing engine at booking. Stored on appointment. |
| **Pages** | `/provider/:id` (packages tab), `/book-wizard` |
| **APIs** | `GET /api/providers/:id/packages`, `POST /api/user-packages/:id/use` |
| **Tables** | `provider_packages`, `user_packages`, `package_benefits` |

---

## SECTION 2 — PROVIDER FEATURES

### 2.1 Registration & Onboarding
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | 4-step setup wizard: Clinical Persona (type, speciality, bio) → Credentials (license, documents) → Logistics (address, visit types, fees, availability) → Legal (terms acceptance). |
| **Pages** | `/provider/setup` |
| **APIs** | `POST /api/provider/setup`, `GET /api/provider/me`, `POST /api/provider/documents/upload` |
| **Tables** | `providers`, `practitioners`, `users` |

---

### 2.2 KYC / Document Verification
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Document upload for ID, medical license, insurance. Status: `action_required` → `pending_approval` → `approved`/`rejected`. Re-upload on rejection auto-advances to pending. Criticality and expiry tracked. |
| **Pages** | `/provider/setup`, `/provider/dashboard` |
| **APIs** | `POST /api/provider/documents/upload`, `GET /api/provider/documents`, `PATCH /api/admin/provider-documents/:id/status` |
| **Tables** | `provider_documents`, `providers` (status column) |

---

### 2.3 Availability & Scheduling
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Hybrid scheduling: weekly office-hour templates + explicit time slots (forward-synced 30 days). Conflict engine enforces buffers (clinic/home/online), travel time, and max daily caps. Vacation/block-out support. |
| **Pages** | `/provider/dashboard` (availability tab) |
| **APIs** | `GET/POST /api/provider/availability`, `POST /api/provider/availability/bulk`, `POST /api/provider/vacation-blocks`, `GET /api/providers/:id/available-slots` |
| **Tables** | `time_slots`, `provider_availability_templates`, `vacation_blocks` |

---

### 2.4 Service Management
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Providers define custom services or request additions to admin-managed catalog. Prices set per visit type (clinic/home/online). Service reordering. Service request queue. |
| **Pages** | `/provider/dashboard` (services tab) |
| **APIs** | `GET/POST/PATCH/DELETE /api/services`, `PATCH /api/services/reorder`, `POST /api/service-requests` |
| **Tables** | `services`, `sub_services`, `service_requests` |

---

### 2.5 Practitioner Management
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Clinic-type providers can manage multiple practitioners under one provider account. Auto-assignment by load balancing at booking time. |
| **Pages** | `/provider/dashboard` (practitioners tab) |
| **APIs** | `GET/POST/PATCH/DELETE /api/practitioners` |
| **Tables** | `practitioners` |

---

### 2.6 Appointment Management
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Provider view of all appointments with status transitions (approve, start, complete). Private notes. Cancel/reschedule with patient notification. State machine enforced server-side. |
| **Pages** | `/provider/dashboard`, `/appointments`, `/appointments/:id` |
| **APIs** | `GET /api/appointments/provider`, `PATCH /api/appointments/:id/status`, `POST /api/appointments/:id/cancel`, `POST /api/appointments/:id/reschedule` |
| **Tables** | `appointments`, `appointment_events` |

---

### 2.7 Earnings & Wallet
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Real-time earnings dashboard. Available vs held balance. Append-only ledger for full audit trail. Revenue breakdown by service/period. Payout request initiation. |
| **Pages** | `/provider/earnings`, `/provider/dashboard` |
| **APIs** | `GET /api/provider/earnings`, `GET /api/provider/wallet/ledger`, `GET /api/provider/wallet/balance` |
| **Tables** | `provider_wallets`, `provider_ledger`, `provider_earnings` |

---

### 2.8 Payout Requests
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Serialized payout flow with `FOR UPDATE` row-level locking. Moves balance from `available` to `held` on request. Admin marks paid, settles ledger. |
| **Pages** | `/provider/earnings` |
| **APIs** | `POST /api/provider/payout-requests`, `GET /api/provider/payout-requests` |
| **Tables** | `payout_requests`, `provider_wallets`, `provider_ledger` |

---

### 2.9 Video Consultations
| Attribute | Detail |
|---|---|
| **Status** | Complete (Beta) |
| **Description** | Provider joins WebRTC video room from appointment detail. Daily.co or Jitsi fallback. Screen sharing. |
| **Pages** | `/appointments/:id` |
| **APIs** | `GET /api/video/room/:appointmentId` |
| **Tables** | `appointments` |

---

### 2.10 Reviews
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Providers view patient ratings and can post one public reply per review. Aggregate rating shown on public profile. |
| **Pages** | `/provider/dashboard`, `/provider/:id` |
| **APIs** | `GET /api/reviews/provider`, `PATCH /api/reviews/:id/reply` |
| **Tables** | `reviews` |

---

### 2.11 Profile & Media Management
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Provider can update bio, photo (Cloudinary), gallery images, credentials, specialties, languages, and prices. Sanitization strips PII from public profile. |
| **Pages** | `/provider/dashboard` (profile tab) |
| **APIs** | `PATCH /api/provider/me`, `POST /api/provider/gallery`, `DELETE /api/provider/gallery/:id` |
| **Tables** | `providers`, `provider_gallery`, `users` |

---

### 2.12 Membership Package Management
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Providers create/edit session bundles with discount rates, session counts, and validity windows. |
| **Pages** | `/provider/dashboard` (packages tab) |
| **APIs** | `GET/POST/PATCH/DELETE /api/provider/packages` |
| **Tables** | `provider_packages`, `package_benefits` |

---

### 2.13 Notifications
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Providers receive multi-channel notifications for new bookings, cancellations, patient messages, and review alerts. |
| **Pages** | `/notifications` |
| **APIs** | Same as patient notification APIs |
| **Tables** | `user_notifications`, `notification_delivery_logs` |

---

## SECTION 3 — ADMIN FEATURES

### 3.1 User Management
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Search, view, suspend/reinstate patient accounts. Paginated list with country filter. Direct notification capability. |
| **Panel** | `ClientOperationsConsole` |
| **APIs** | `GET /api/admin/users`, `PATCH /api/admin/users/:id/suspend`, `POST /api/admin/users/:id/notify` |
| **Tables** | `users` |

---

### 3.2 Provider Management
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | 360° provider console: services, revenue, audit logs, documents, practitioners. Country-scoped access for country admins. |
| **Panel** | `ProviderOperationsConsole` |
| **APIs** | `GET /api/admin/providers`, `GET /api/admin/providers/:id/console`, `PATCH /api/admin/providers/:id` |
| **Tables** | `providers`, `services`, `provider_earnings`, `provider_documents` |

---

### 3.3 KYC Review
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Verification queue for new provider registrations. Per-document approve/reject. Auto-advances provider status. Expiry tracking. |
| **Panel** | `ProviderReviewQueue`, `DocumentQueue` |
| **APIs** | `GET /api/admin/verification-queue`, `PATCH /api/admin/provider-documents/:id/status`, `POST /api/admin/providers/:id/finalize-verification` |
| **Tables** | `provider_documents`, `providers` |

---

### 3.4 Appointments / Bookings Management
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Paginated booking view with admin-override of statuses. Calendar view. Stale/expired booking cleanup. |
| **Panel** | `BookingsManagementComponent`, `AdminCalendarView` |
| **APIs** | `GET /api/admin/bookings`, `PATCH /api/admin/bookings/:id` |
| **Tables** | `appointments` |

---

### 3.5 Payments & Refunds
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | View all payments. Manual refund initiation via Stripe. Three-layer duplicate-refund prevention (DB flag, Stripe idempotency, refundStatus check). |
| **Panel** | `PlatformFinancials` |
| **APIs** | `GET /api/admin/payments`, `POST /api/admin/payments/:id/refund` |
| **Tables** | `payments` |

---

### 3.6 Platform Ledger & Reconciliation
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Double-entry `marketplace_ledger`. Financial overview with gross revenue, platform fees, refunds, net. Automated reconciliation scan with discrepancy detection and repair. |
| **Panel** | `LedgerOverrides`, `FinancialReports` |
| **APIs** | `GET /api/admin/financial/reconciliation`, `POST /api/admin/financial/reconcile`, `GET /api/admin/financial/ledger` |
| **Tables** | `marketplace_ledger`, `provider_earnings`, `reconciliation_results` |

---

### 3.7 Patient Wallets
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | View all patient wallets. Admin credit/debit adjustments with audit logging. Search by user. |
| **Panel** | `AdminWallets` |
| **APIs** | `GET /api/admin/wallets`, `POST /api/admin/wallets/:userId/adjust` |
| **Tables** | `wallets`, `wallet_transactions` |

---

### 3.8 Provider Wallets & Payouts
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | View provider wallet balances and ledger. Approve/process payout requests. Mark as paid. |
| **Panel** | `AdminProviderWalletsPanel`, `AdminPayoutsPanel` |
| **APIs** | `GET /api/admin/payout-requests`, `PATCH /api/admin/payout-requests/:id` |
| **Tables** | `payout_requests`, `provider_wallets`, `provider_ledger` |

---

### 3.9 Notifications & Broadcasts
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Send targeted or broadcast notifications (in-app/email) to specific roles or all users. Admin notification feed for compliance alerts. |
| **Panel** | `AdminNotificationCenter` |
| **APIs** | `POST /api/admin/broadcasts`, `POST /api/admin/users/:id/notify`, `GET /api/admin/notifications` |
| **Tables** | `user_notifications`, `notification_delivery_logs` |

---

### 3.10 Service Catalog (CMS)
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Admin manages category hierarchy, sub-services, and global catalog. Approves/rejects provider service requests. |
| **Panel** | `ServiceCatalogHierarchy`, `AdminServiceRequestsPanel` |
| **APIs** | `GET/POST/PATCH/DELETE /api/admin/sub-services`, `GET /api/admin/service-requests`, `PATCH /api/admin/service-requests/:id` |
| **Tables** | `categories`, `sub_services`, `service_requests` |

---

### 3.11 Promo Code Management
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Create/edit/deactivate promo codes with validity, discount type, usage limits, and provider/service restrictions. |
| **Panel** | `PromoCodeManagement` |
| **APIs** | `GET/POST/PATCH/DELETE /api/admin/promo-codes` |
| **Tables** | `promo_codes` |

---

### 3.12 Package Management
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Admin-level management of membership packages. |
| **Panel** | `PackageManagement` |
| **APIs** | `GET/POST/PATCH /api/admin/packages` |
| **Tables** | `provider_packages` |

---

### 3.13 Analytics & Reporting
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Business KPIs: bookings by period, revenue trends, top providers, conversion rates. Enhanced analytics dashboard with segment breakdowns. Uses single-client pattern to prevent pool exhaustion. |
| **Panel** | `AnalyticsOverview`, `EnhancedAnalyticsDashboard` |
| **APIs** | `GET /api/admin/analytics`, `GET /api/admin/analytics/enhanced`, `GET /api/admin/analytics/providers` |
| **Tables** | `appointments`, `payments`, `providers`, `users` |

---

### 3.14 Monitoring & Alerting
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Real-time system health stats. Error trend charts (4xx/5xx rates). Slow endpoint detection and logging. System event log. AsyncLocalStorage request tracing. |
| **Panel** | `MonitoringPanel` |
| **APIs** | `GET /api/admin/monitoring/stats`, `GET /api/admin/monitoring/events`, `GET /api/admin/monitoring/error-trends` |
| **Tables** | `system_events`, `reconciliation_results` |

---

### 3.15 Audit Logs
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Forensic trail of all admin actions. Searchable by actor, entity, action type, and time range. |
| **Panel** | `AdminAuditLogs` |
| **APIs** | `GET /api/admin/audit-logs` |
| **Tables** | `audit_logs` |

---

### 3.16 Support Ticket Management
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Admin views, filters, and responds to all support tickets. Internal notes. Status lifecycle management. AI-assisted classification context visible. |
| **Panel** | `SupportTickets` |
| **APIs** | `GET /api/admin/support/tickets`, `POST /api/admin/support/tickets/:id/messages`, `PATCH /api/admin/support/tickets/:id` |
| **Tables** | `support_tickets`, `support_ticket_messages` |

---

### 3.17 Bug Report Management
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Admin bug dashboard with severity/priority classification, comments, status lifecycle, and screenshot review. |
| **Panel** | `AdminBugReports` |
| **APIs** | `GET /api/admin/bug-reports`, `PATCH /api/admin/bug-reports/:id`, `POST /api/admin/bug-reports/:id/comments` |
| **Tables** | `bug_reports`, `bug_report_comments` |

---

### 3.18 Admin Staff & Access Management
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Create and manage admin accounts with role assignments. RBAC permissions matrix UI. Country-scoped admin roles. |
| **Panel** | `AdminStaffOverview`, `AdminAccessPanel`, `RbacPermissionsMatrix` |
| **APIs** | `GET /api/admin/admin-users`, `POST /api/admin/admin-users`, `GET /api/rbac/roles`, `GET /api/rbac/permissions` |
| **Tables** | `admin_roles`, `rbac_permissions`, `role_permissions`, `admin_assignments` |

---

### 3.19 Invoice Management
| Attribute | Detail |
|---|---|
| **Status** | Complete |
| **Description** | Admin view of all generated invoices. Status tracking (draft/sent/paid/overdue). Reminder scheduling. Overdue detection. |
| **Panel** | `InvoiceManagement` |
| **APIs** | `GET /api/admin/invoices`, `PATCH /api/admin/invoices/:id` |
| **Tables** | `invoices` |

---

### 3.20 Privacy Requests
| Attribute | Detail |
|---|---|
| **Status** | Backend Only |
| **Description** | GDPR-style data deletion/export request table exists. No admin UI panel present and no patient-facing request flow wired up. |
| **Panel** | None |
| **APIs** | None confirmed |
| **Tables** | `privacy_requests` |

---

## SECTION 4 — HEALTHCARE WORKFLOWS

### 4.1 Patient Booking Flow
```
Patient → Search Providers → View Profile → Select Service →
Pick Time Slot (slot hold) → Pricing Quote (promo/package applied) →
Pay (Stripe Checkout or Wallet) → Webhook Confirmation →
Appointment Confirmed → Provider Notified → Appointment Completed →
Invoice Generated (PDF) → Review Prompted
```
| Step | Status |
|---|---|
| Search & Discovery | ✅ Complete |
| Slot reservation with advisory lock | ✅ Complete |
| Pricing engine (promos, packages, tax) | ✅ Complete |
| Stripe payment path | ✅ Complete |
| Wallet payment path | ✅ Complete |
| Partial wallet + Stripe | ✅ Complete |
| Webhook-driven confirmation | ✅ Complete |
| Invoice PDF generation | ✅ Complete |
| Post-visit review | ✅ Complete |

**Overall: Complete**

---

### 4.2 Provider Onboarding / KYC Lifecycle
```
Register → 4-Step Setup Wizard → Document Upload →
Status: pending_approval → Admin Review Queue →
Per-Document Approve/Reject → All Critical Docs Approved →
Status: documents_verified → Provider Approved → Goes Live
```
| Step | Status |
|---|---|
| Registration | ✅ Complete |
| 4-step onboarding wizard | ✅ Complete |
| Document upload (Cloudinary) | ✅ Complete |
| Document criticality & expiry tracking | ✅ Complete |
| Admin review queue | ✅ Complete |
| Auto status advancement on approval | ✅ Complete |
| Rejection → re-upload → re-submit loop | ✅ Complete |

**Overall: Complete**

---

### 4.3 Wallet Top-Up Flow
```
Patient → Top-Up Request → Stripe Checkout Session Created →
Stripe Hosted Checkout → Payment Complete →
Stripe Webhook (checkout.session.completed) →
Wallet Balance Credited → Transaction Logged → Patient Notified
```
| Step | Status |
|---|---|
| Checkout session creation | ✅ Complete |
| Stripe Checkout redirect | ✅ Complete |
| Webhook processing + idempotency | ✅ Complete |
| Balance credit + ledger entry | ✅ Complete |

**Overall: Complete**

---

### 4.4 Cancellation & Refund Flow
```
Patient/Provider Cancels Appointment →
Refund Eligibility Check (timing rules) →
[If wallet paid] → Wallet Balance Restored →
[If Stripe paid] → Stripe Refund Initiated (3-layer duplicate guard) →
Appointment Status: cancelled → Both Parties Notified →
Provider Earning Reversed
```
| Step | Status |
|---|---|
| Cancellation by patient | ✅ Complete |
| Cancellation by provider | ✅ Complete |
| Wallet refund path | ✅ Complete |
| Stripe refund path with duplicate guards | ✅ Complete |
| Provider earning reversal | ✅ Complete |
| Notification to both parties | ✅ Complete |
| Admin manual adjustment fallback | ✅ Complete |
| Time-based refund policy rules | ⚠️ Partial (basic; no tiered partial-refund schedule) |

**Overall: Mostly Complete**

---

### 4.5 Provider Payout Flow
```
Appointment Completed → Provider Earning Recorded →
Balance Available in Wallet → Provider Requests Payout →
Available Balance → Held Balance (row-lock) →
Admin Reviews Queue → Admin Marks Paid →
Ledger Settled → Provider Notified
```
| Step | Status |
|---|---|
| Earning record on completion | ✅ Complete |
| Payout request with row-level lock | ✅ Complete |
| Admin approval queue | ✅ Complete |
| Ledger settlement | ✅ Complete |
| Actual bank transfer automation | ❌ Missing (manual process; no Stripe Connect or bank API) |

**Overall: Partial** — The internal flow is complete, but actual disbursement to providers' bank accounts is a manual external process.

---

### 4.6 Video Consultation Flow
```
Appointment Confirmed (telemedicine type) →
Both Parties Join via Appointment Page →
Video Room Created on-demand (Daily.co or Jitsi) →
Session in Progress → Appointment Completed →
Invoice Generated
```
| Step | Status |
|---|---|
| Room creation on-demand | ✅ Complete |
| Daily.co integration | ✅ Complete (requires DAILY_API_KEY) |
| Jitsi fallback | ✅ Complete |
| Screen sharing | ✅ Complete |
| Waiting room / access control | ⚠️ Partial (token-gated but no lobby UI) |
| Session recording | ❌ Missing |

**Overall: Beta-Complete**

---

### 4.7 Support Ticket Flow
```
User Submits Ticket → AI Classification + FAQ Suggestion →
Ticket Queued → Admin Responds (internal notes) →
Threaded Exchange → Ticket Resolved/Closed →
User Notified
```
| Step | Status |
|---|---|
| Ticket submission | ✅ Complete |
| AI classification | ✅ Complete |
| Admin response with internal notes | ✅ Complete |
| Status lifecycle | ✅ Complete |
| User notification on update | ✅ Complete |
| SLA tracking | ❌ Missing |
| Ticket assignment to specific admin | ❌ Missing |

**Overall: Mostly Complete**

---

### 4.8 Referral Flow
```
User Generates Code → Shares Link →
New User Registers with Code → Referral Recorded →
[MISSING] Reward Trigger on First Appointment →
[MISSING] Wallet Credit Issued
```
| Step | Status |
|---|---|
| Code generation (lazy) | ✅ Complete |
| Registration with referral code | ✅ Complete |
| Referral tracking page | ✅ Complete |
| Reward logic on first appointment | ❌ Missing |
| Wallet credit on reward | ❌ Missing |

**Overall: Partial — data model done, reward logic absent**

---

### 4.9 Group Session Flow
```
Provider Creates Session (capacity, price, time) →
Patients Discover → Patients Book (wallet payment) →
Session Live → Patients Join →
Session Ends → [Missing] Automated Completion + Invoicing
```
| Step | Status |
|---|---|
| Provider session creation | ✅ Complete |
| Patient discovery | ✅ Complete |
| Wallet-based booking | ✅ Complete |
| Patient join during live window | ✅ Complete |
| Video room integration | ⚠️ Partial (no Daily.co room for group) |
| Automated completion + earning | ❌ Missing |
| Cancellation/refund for group | ❌ Missing |

**Overall: Partial**

---

## SECTION 5 — INTEGRATIONS

### 5.1 Stripe
| Attribute | Detail |
|---|---|
| **Usage** | Appointment payments (Checkout), wallet top-ups, refunds |
| **Features Using It** | Booking wizard, wallet, admin refund panel |
| **Status** | Production-ready |
| **Notes** | Two-layer idempotency (LRU cache + DB). Webhook metrics/diagnostics. `getStripe()` returns null gracefully if key missing. Three-layer duplicate-refund guard. **No Stripe Connect** — provider payouts are manual. |

---

### 5.2 Daily.co
| Attribute | Detail |
|---|---|
| **Usage** | Telemedicine video session rooms |
| **Features Using It** | 1:1 video consultations |
| **Status** | Active with Jitsi fallback |
| **Notes** | Requires `DAILY_API_KEY`. Falls back to deterministic Jitsi URLs when key absent or API fails. Group sessions not yet wired to Daily.co rooms. |

---

### 5.3 Cloudinary
| Attribute | Detail |
|---|---|
| **Usage** | Provider avatars, gallery images, KYC documents, chat attachments, bug report screenshots |
| **Features Using It** | Provider setup, patient gallery, chat, bug reports |
| **Status** | Production-ready |
| **Notes** | Uses signed/authenticated URLs for sensitive KYC documents. Falls back to local disk for chat attachments in dev. |

---

### 5.4 Supabase (PostgreSQL)
| Attribute | Detail |
|---|---|
| **Usage** | Primary database (PostgreSQL via PgBouncer pooling) |
| **Features Using It** | All features |
| **Status** | Core — all data lives here |
| **Notes** | `drizzle-kit push` hangs on Supabase introspection; all migrations use `runStartupMigrations()` with raw SQL. `db:push` is for Replit local DB only. |

---

### 5.5 Resend (Email)
| Attribute | Detail |
|---|---|
| **Usage** | Transactional emails: OTP verification, appointment confirmations, reminders, invoice delivery |
| **Features Using It** | Auth, booking, notifications, invoice system |
| **Status** | Active with exponential back-off retry |
| **Notes** | Silently skips delivery if `RESEND_API_KEY` missing (logs warning). No bounce/delivery tracking integrated. |

---

### 5.6 Twilio (SMS & WhatsApp)
| Attribute | Detail |
|---|---|
| **Usage** | SMS and WhatsApp transactional notifications |
| **Features Using It** | Notification dispatcher (booking alerts, reminders) |
| **Status** | Active |
| **Notes** | Part of multi-channel dispatcher. WhatsApp uses Twilio sandbox for dev. E.164 number formatting required. |

---

### 5.7 Web Push (VAPID)
| Attribute | Detail |
|---|---|
| **Usage** | Browser push notifications |
| **Features Using It** | Notification system |
| **Status** | Functional |
| **Notes** | Stale subscription cleanup on 404/410. Requires `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`. Patient must grant browser permission. |

---

### 5.8 OpenAI (AI Chat)
| Attribute | Detail |
|---|---|
| **Usage** | GoldenLife AI Support Assistant (GPT-4o, streaming SSE) |
| **Features Using It** | AI chat box, support ticket classification |
| **Status** | Functional |
| **Notes** | Keyword guard deflects off-topic or complex queries to human support. Uses `AI_INTEGRATIONS_OPENAI_API_KEY` via Replit integration. |

---

## SECTION 6 — ROLE MATRIX

### Roles Overview

| Role | Type | Scope |
|---|---|---|
| `patient` | End User | Own data only |
| `provider` | End User | Own practice data |
| `super_admin` | Admin | All countries, all modules |
| `country_admin` | Admin | Single country, most modules |
| `operations_admin` | Admin | Providers, services, appointments |
| `finance_admin` | Admin | Payments, ledger, revenue |
| `support_admin` | Admin | Support tickets, users (view) |
| `verification_admin` | Admin | KYC, documents, providers |
| `read_only_admin` | Admin | View-only, all modules |

---

### Detailed Permission Matrix

| Permission | super_admin | country_admin | operations_admin | finance_admin | support_admin | verification_admin | read_only_admin |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| users:view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| users:create | ✅ | ✅ | — | — | — | — | — |
| users:edit | ✅ | ✅ | — | — | — | — | — |
| users:delete | ✅ | — | — | — | — | — | — |
| users:suspend | ✅ | ✅ | — | — | — | — | — |
| providers:view | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| providers:approve | ✅ | ✅ | ✅ | — | — | ✅ | — |
| providers:reject | ✅ | ✅ | ✅ | — | — | ✅ | — |
| providers:verify | ✅ | ✅ | ✅ | — | — | ✅ | — |
| providers:delete | ✅ | — | — | — | — | — | — |
| documents:view | ✅ | ✅ | — | — | ✅ | ✅ | ✅ |
| documents:verify | ✅ | ✅ | — | — | — | ✅ | — |
| appointments:view | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| appointments:manage | ✅ | ✅ | ✅ | — | — | — | — |
| payments:view | ✅ | ✅ | — | ✅ | — | — | ✅ |
| payments:refund | ✅ | — | — | ✅ | — | — | — |
| payments:manage | ✅ | — | — | ✅ | — | — | — |
| tickets:view | ✅ | ✅ | — | — | ✅ | — | ✅ |
| tickets:respond | ✅ | ✅ | — | — | ✅ | — | — |
| tickets:resolve | ✅ | ✅ | — | — | ✅ | — | — |
| content:view | ✅ | ✅ | ✅ | — | — | — | ✅ |
| content:edit | ✅ | ✅ | ✅ | — | — | — | — |
| analytics:view | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| settings:view | ✅ | ✅ | ✅ | — | — | — | ✅ |
| settings:edit | ✅ | ✅ | — | — | — | — | — |
| admins:manage | ✅ | — | — | — | — | — | — |
| audit:view | ✅ | ✅ | — | ✅ | — | ✅ | ✅ |
| monitoring:view | ✅ | ✅ | — | — | — | — | ✅ |

### Missing Capabilities by Role
- **country_admin:** Cannot manage admin users (`admins:manage`) or issue refunds (`payments:refund`) — may be intentional isolation.
- **operations_admin:** No financial visibility — cannot see payments or revenue data even for operational decisions.
- **support_admin:** Cannot view provider profiles, limiting ability to resolve provider-related patient complaints.
- **All roles:** No self-service role-switching; no temporary elevated access / time-limited permission grants.
- **No MFA enforcement** at the role level for privileged admin actions (e.g., refunds, user deletion).

---

## SECTION 7 — FEATURE GAP ANALYSIS

### P0 — Production Critical

| # | Feature | Why Missing | Groundwork Present? | Estimated Effort |
|---|---|---|---|---|
| P0-1 | **Stripe Connect for Provider Payouts** | Provider disbursement currently manual; no actual bank transfer API | `payout_requests` table, `provider_wallets` ledger fully ready | Large (3–5 days): Add Stripe Connect onboarding, connected accounts, Transfer API |
| P0-2 | **Tiered Refund Policy** | Cancellation always issues full refund; no partial refund by cancellation window | Cancellation handler exists, Stripe refund API wired | Medium (1–2 days): Add time-delta logic + partial refund amount calculation |
| P0-3 | **Session Recording (Video)** | No recording for telemedicine; legal/compliance risk | Daily.co integration exists | Medium (1–2 days): Enable Daily.co recording API, store recording URL on appointment |
| P0-4 | **GDPR Privacy Request Handling** | `privacy_requests` table exists, zero API or UI wired | Table created | Medium (2–3 days): Admin review UI + data export/deletion job |

---

### P1 — Revenue Impact

| # | Feature | Why Missing | Groundwork Present? | Estimated Effort |
|---|---|---|---|---|
| P1-1 | **Referral Reward Automation** | Code and tracking exist; reward credit logic never wired into appointment completion | `referral_code`, `referred_by_user_id` on users, wallet credit API exists | Small (1 day): Hook `recordProviderEarning` equivalent into appointment completion for referrer |
| P1-2 | **Group Session Video Room** | Group sessions use wallet booking but aren't connected to Daily.co room creation | Group session tables complete, 1:1 video fully wired | Medium (1–2 days): Generalize `getOrCreateVideoSession` to accept group session ID |
| P1-3 | **Group Session Completion & Earnings** | No automated earning record or invoice on group session end | Provider earnings infrastructure exists | Small (1 day): Mirror appointment completion handler for group sessions |
| P1-4 | **Waitlist Fan-Out Notification** | Cron stub exists but circular-import-safe wiring removed | `waitlist` table, notification dispatcher, slot event WebSocket all present | Small (1 day): Wire slot-release event → waitlist query → `dispatchNotification` in cron |
| P1-5 | **Subscription / Recurring Appointments** | No recurring booking logic | Packages/bundles exist; time slot engine capable | Large (3–4 days): Add recurrence rules, auto-booking cron, and payment scheduling |

---

### P2 — Operational Efficiency

| # | Feature | Why Missing | Groundwork Present? | Estimated Effort |
|---|---|---|---|---|
| P2-1 | **Support Ticket Assignment** | Tickets visible to all support admins; no assignment to specific agent | Ticket table, admin user table exist | Small (1 day): Add `assigned_to` column, assignment UI, and filter by assignee |
| P2-2 | **SLA Tracking for Support Tickets** | No first-response-time or resolution-time SLA | Ticket timestamps exist | Small–Medium (1–2 days): Add SLA deadline calculation and overdue flagging in admin |
| P2-3 | **Google Calendar Sync** | `google_calendar_event_id` column exists on appointments but no sync logic | Column present | Medium (2 days): Google Calendar API integration for provider appointment sync |
| P2-4 | **MFA / 2FA for Admin Accounts** | No MFA enforced on admin login | JWT auth system in place | Medium (2 days): TOTP via `otplib`, QR setup flow for admin users |
| P2-5 | **Automated Email Bounce Tracking** | Resend used but no delivery/bounce webhook processing | Resend library in place | Small (1 day): Add Resend webhook endpoint for bounce/complaint events |
| P2-6 | **Video Lobby / Waiting Room UI** | Room token is valid but no lobby screen before host joins | TelehealthRoom component exists | Small (1 day): Add waiting state with polling until provider joins |
| P2-7 | **Provider Calendar Export (iCal)** | No `.ics` export for provider appointments | Appointment data fully accessible | Small (< 1 day): Generate iCal feed from appointment list |

---

### P3 — Nice to Have

| # | Feature | Why Missing | Groundwork Present? | Estimated Effort |
|---|---|---|---|---|
| P3-1 | **Patient Health Dashboard / Analytics** | No aggregated health metrics or visit history charts for patients | Appointment history API exists | Medium (2 days): Add charting layer on patient dashboard |
| P3-2 | **Provider Credential Expiry Alerts** | Expiry columns exist but no proactive reminder to provider | Document expiry stored; reminder cron in place | Small (1 day): Add expiry-check to hourly cron → notify provider |
| P3-3 | **Invoice Customization by Provider** | `invoice_templates` table referenced but no full editor | Table exists | Medium (2 days): Invoice template editor UI + dynamic PDF generation |
| P3-4 | **Multi-language Admin UI** | Admin dashboard is English-only; patient UI is i18next-enabled | i18next wired globally | Large (3–5 days): Extract admin strings to i18n keys |
| P3-5 | **Native Mobile App** | Web-only; no React Native / Expo layer | None | Very Large |

---

## SECTION 8 — FRONTEND / BACKEND PARITY

### Backend Exists, Frontend Missing
| Backend Capability | Status |
|---|---|
| `POST /api/admin/privacy-requests` — GDPR data export/deletion | No admin UI panel exists |
| `google_calendar_event_id` column + planned sync | No calendar sync UI or provider opt-in flow |
| `TWILIO_WHATSAPP_FROM` — WhatsApp channel | No patient preference UI for WhatsApp vs SMS |
| Push notification subscription management | No UI to view/revoke push subscriptions per device |
| Provider credential expiry tracking (DB) | No proactive expiry warning on provider dashboard |
| `reconciliation_results` table | Results visible in monitoring but no drill-down per discrepancy |
| `waitlist` fan-out (cron stub) | No patient-facing UX to browse/join waitlists for specific providers |

---

### Frontend Exists, Backend Missing / Incomplete
| Frontend Element | Status |
|---|---|
| Referral reward display on `/referrals` | Shows count but no reward status; backend reward logic absent |
| Group session "Join" button | Button exists; no Daily.co room created for group sessions |
| "My Reports" bug report screenshots | Upload wired to Cloudinary; admin view exists but no status-change notification to reporter |

---

### APIs Unused by UI
| API | Notes |
|---|---|
| `GET /api/admin/financial/repair-earnings/apply` | Admin repair tool with no dedicated UI button; callable but hidden |
| `POST /api/admin/financial/reconcile` (scan + repair) | Accessible via `FinancialReports` but full discrepancy drill-down not surfaced |
| `GET /api/providers/recommended` | Recommendation engine built; not prominently featured in provider search UI |

---

### UI with Mock / Placeholder Data
| UI Area | Notes |
|---|---|
| `EnhancedAnalyticsDashboard` | Some chart segments fall back to zero-state if data sparse; not mock but may appear empty on fresh install |
| Platform Settings panel (`platform-settings.tsx`) | Contains documentation text referencing `VITE_STRIPE_PUBLISHABLE_KEY` — this is explanatory text, not a live env var exposure |
| Provider earnings chart on fresh accounts | Renders empty state gracefully; no mock data injected |

---

## SECTION 9 — RECOMMENDED ROADMAP

Ranked by: **Business Value × User Impact ÷ Effort**

| Rank | Feature | Category | Business Value | User Impact | Effort | Rationale |
|---|---|---|---|---|---|---|
| 1 | **Referral Reward Automation** | Revenue | High | High | Very Low | Schema done, wallet API exists. One hook in appointment completion. Immediate viral growth lever. |
| 2 | **Waitlist Fan-Out Notification** | Retention | High | High | Very Low | Cron stub exists. One wiring call. Reduces no-show revenue loss, fills provider capacity gaps. |
| 3 | **Provider Credential Expiry Alerts** | Compliance | High | Medium | Very Low | Hourly cron running. One DB query + `dispatchNotification`. Prevents KYC lapses blocking revenue. |
| 4 | **Tiered Cancellation Refund Policy** | Revenue | High | Medium | Low | Cancellation handler fully wired. Add time-window logic. Protects provider revenue on late cancellations. |
| 5 | **Group Session Completion + Earnings** | Revenue | High | Medium | Low | Mirrors the appointment completion handler. Unlocks the group session revenue model. |
| 6 | **Group Session Video Room (Daily.co)** | Product | High | High | Low | Generalize existing `getOrCreateVideoSession`. Makes group sessions a real product feature. |
| 7 | **Support Ticket Assignment + SLA** | Operations | Medium | Medium | Low | Add `assigned_to` column + SLA deadline. Improves support team efficiency and response accountability. |
| 8 | **Video Lobby / Waiting Room UI** | UX | Medium | High | Low | Small UI addition to `TelehealthRoom.tsx`. Significantly improves patient telemedicine experience. |
| 9 | **Provider Payout via Stripe Connect** | Revenue | Critical | High | Large | `payout_requests` fully wired. Add Stripe Connect onboarding + Transfer API. Eliminates manual payout process. |
| 10 | **GDPR Privacy Request Handling** | Compliance | Critical | Medium | Medium | `privacy_requests` table exists. Needs admin review UI + data job. Legal obligation in HU/IR markets. |
| 11 | **iCal Export for Providers** | UX | Medium | Medium | Very Low | One endpoint generating `.ics`. High-value for provider workflow integration. |
| 12 | **MFA for Admin Accounts** | Security | Critical | Low | Medium | TOTP via `otplib`. Protects against admin account compromise. |
| 13 | **Session Recording (Daily.co)** | Product | High | Medium | Medium | Enable Daily.co recording API. Store URL on appointment. Required for HIPAA-adjacent compliance. |
| 14 | **Google Calendar Sync for Providers** | UX | Medium | High | Medium | `google_calendar_event_id` column already on appointments. Google Calendar API wiring needed. |
| 15 | **Recommended Providers (UI Prominence)** | Revenue | Medium | High | Very Low | API fully built. Surfacing it prominently in search increases conversion. |
| 16 | **Resend Bounce/Complaint Webhook** | Operations | Medium | Low | Very Low | Protects sender reputation. Prevents repeated delivery to invalid emails. |
| 17 | **WhatsApp Preference UI** | UX | Low | Medium | Low | Channel configured. Just needs patient preference toggle in settings. |
| 18 | **Subscription / Recurring Appointments** | Revenue | High | High | Large | Complex but high-value. Packages infra provides a foundation. Drives predictable revenue. |
| 19 | **Provider Invoice Template Editor** | Product | Medium | Medium | Medium | `invoice_templates` table referenced. Unlocks provider branding and custom invoicing. |
| 20 | **Patient Health Analytics Dashboard** | Product | Medium | Medium | Medium | Appointment history fully accessible. Adds long-term patient retention through health visibility. |

---

## AUDIT SUMMARY

| Category | Complete | Partial | Missing |
|---|---|---|---|
| Patient Features | 16 | 4 | 0 |
| Provider Features | 12 | 0 | 0 |
| Admin Features | 18 | 0 | 1 (Privacy) |
| Workflows | 5 | 4 | 0 |
| Integrations | 8 | 0 | 0 |

**Overall system maturity: ~85% production-ready.**
The core booking, payment, KYC, wallet, and admin monitoring surfaces are all production-grade. The primary gaps are: automated provider disbursement (Stripe Connect), referral rewards, group session completion, and GDPR tooling — all of which have substantial groundwork already in place and represent low-to-medium effort to close.
