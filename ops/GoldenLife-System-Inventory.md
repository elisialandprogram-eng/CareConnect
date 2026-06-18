# GoldenLife — System Inventory
**Generated:** 2026-06-11 | **Sprint:** GX-02 | **Status:** Pre-Production

---

## Subsystem Overview

| Subsystem | Routes | Tables | Jobs | Classification |
|-----------|--------|--------|------|----------------|
| Patient System | 25+ | 18 | 1 | Production Ready |
| Provider System | 40+ | 22 | 2 | Production Ready |
| Booking Engine | 20+ | 10 | 2 | Production Ready |
| Revenue Engine | 15+ | 12 | 1 | Production Ready |
| Wallet / Payments | 20+ | 8 | 1 | Production Ready |
| Payouts | 8 | 4 | 1 | Needs Refinement |
| Notifications | 10+ | 5 | 1 | Production Ready |
| Messaging | 8 | 6 | 0 | Needs Refinement |
| Memberships | 6 | 4 | 1 | Needs Refinement |
| Packages | 8 | 3 | 1 | Production Ready |
| Promotions | 6 | 2 | 0 | Production Ready |
| Scheduling | 15+ | 8 | 1 | Production Ready |
| Analytics | 8 | 5 | 1 | Needs Refinement |
| Admin Dashboard | 80+ | — | 0 | Production Ready |
| Development Tools | 12 | — | 0 | Production Ready |
| Localization | — | 1 | 0 | Production Ready |
| Security / Auth | 10 | 4 | 0 | Production Ready |
| Performance | — | 6 | 1 | Needs Refinement |

---

## 1. Patient System

### Routes (server/routes/)
- `GET /api/auth/me` — current user profile
- `POST /api/auth/register` — patient registration
- `POST /api/auth/login` — login (JWT)
- `POST /api/auth/logout` — logout / token revoke
- `GET /api/patients/:id/profile` — patient profile
- `PATCH /api/patients/:id` — update profile
- `GET /api/patients/:id/family-members` — family members
- `POST /api/patients/:id/family-members` — add family member
- `GET /api/patients/:id/health-metrics` — health metrics
- `GET /api/patients/:id/medical-history` — medical history
- `GET /api/patients/:id/medications` — medications
- `GET /api/patients/:id/appointments` — appointment history
- `GET /api/patients/:id/consents` — consent records
- `POST /api/patients/:id/consents` — record consent
- `GET /api/patients/saved-addresses` — saved addresses
- `POST /api/patients/saved-addresses` — add address
- `GET /api/patients/saved-providers` — bookmarked providers
- `POST /api/patients/saved-providers` — bookmark provider

### Database Tables
| Table | Rows (est.) | Purpose |
|-------|-------------|---------|
| users | varies | Core identity (patients role) |
| wallets | varies | Patient wallet balance |
| family_members | varies | Family booking support |
| saved_addresses | varies | Saved visit locations |
| saved_providers | varies | Bookmarked providers |
| patient_consents | varies | Consent audit trail |
| patient_gallery | varies | Patient photo uploads |
| health_metrics | varies | Biometric tracking |
| medications | varies | Medication list |
| medication_logs | varies | Dose tracking |
| medical_history | varies | Clinical history |
| prescriptions | varies | Provider prescriptions |
| patient_notes | varies | Clinical notes |
| intake_responses | varies | Pre-visit intake forms |
| refresh_tokens | varies | JWT refresh store |
| login_attempts | varies | Rate-limit / brute-force |
| password_history | varies | Password reuse prevention |
| privacy_requests | varies | GDPR/CCPA requests |

### Classification: **Production Ready**

---

## 2. Provider System

### Routes
- `GET /api/providers` — paginated provider listing with search/filter
- `GET /api/providers/:id` — public provider profile
- `POST /api/provider/setup` — onboarding setup (5 sections)
- `GET /api/provider/me` — authenticated provider profile
- `PATCH /api/provider/me` — update profile
- `GET /api/provider/services` — provider's services
- `POST /api/provider/services` — add service
- `GET /api/provider/documents` — KYC documents
- `POST /api/provider/documents/upload` — upload KYC doc
- `GET /api/provider/credentials` — professional credentials
- `GET /api/provider/gallery` — gallery images
- `POST /api/provider/gallery` — upload gallery image
- `GET /api/provider/earnings` — earnings summary
- `GET /api/provider/stats` — booking statistics
- `GET /api/provider/reviews` — received reviews
- `GET /api/provider/patients` — patient list

### Database Tables
| Table | Purpose |
|-------|---------|
| providers | Core provider record |
| practitioners | Professional practitioner data |
| provider_documents | KYC documents (ID, insurance, license) |
| provider_credentials | Professional credentials |
| provider_gallery | Profile gallery |
| provider_category_permissions | Service-type permissions |
| provider_pricing_overrides | Custom pricing |
| provider_office_hours | Weekly availability |
| provider_schedule_templates | Reusable schedule templates |
| provider_schedule_overrides | One-off exceptions |
| provider_wallets | Wallet balance snapshot |
| provider_ledger | Append-only earnings ledger |
| provider_earnings | Per-appointment earnings |
| provider_admin_notes | Internal admin notes |
| clinic_rooms | Clinic room definitions |
| room_reservations | Room booking reservations |
| sub_services | Sub-service variations |
| services | Provider service catalog |

### Classification: **Production Ready**

---

## 3. Booking Engine

### Routes
- `POST /api/appointments` — create booking
- `GET /api/appointments/:id` — booking detail
- `PATCH /api/appointments/:id/status` — status update
- `POST /api/appointments/:id/cancel` — patient cancel
- `POST /api/appointments/:id/reschedule` — reschedule
- `GET /api/availability/:providerId` — available slots
- `POST /api/time-slots/bulk` — bulk slot generation
- `GET /api/group-sessions` — group session listing
- `POST /api/group-sessions` — create group session
- `POST /api/group-sessions/:id/join` — join group session
- `GET /api/waitlist` — waitlist entries
- `POST /api/waitlist` — join waitlist
- `GET /api/slot-hold` — slot hold status
- `POST /api/slot-hold` — create slot hold (conflict prevention)

### Database Tables
| Table | Purpose |
|-------|---------|
| appointments | Core appointment records |
| appointment_events | Status transition audit log |
| time_slots | Available/booked slots |
| provider_blocks | Blocked time periods |
| availability_exceptions | Holiday/exception overrides |
| group_sessions | Group appointment sessions |
| group_session_participants | Group session enrollment |
| waitlist_entries | Provider waitlist |
| video_sessions | Telemedicine session records |
| appointment_consents | Per-appointment consent records |

### WebSocket Events
- `slot:updated` — real-time slot availability updates
- `appointment:status` — booking status change push

### Classification: **Production Ready**

---

## 4. Revenue Engine

### Routes
- `GET /api/admin/revenue/rules` — commission rules
- `POST /api/admin/revenue/rules` — create rule
- `GET /api/admin/revenue/platform-fees` — platform fee rules
- `GET /api/admin/revenue/payout-config` — payout configuration
- `GET /api/admin/revenue/wallet-rules` — wallet rules
- `POST /api/admin/revenue/simulate` — price simulation
- `GET /api/admin/revenue/shares` — booking revenue shares

### Database Tables
| Table | Purpose |
|-------|---------|
| commission_rules | Provider commission rates by type |
| platform_fee_rules | Platform markup rules |
| revenue_share_rules | Revenue split rules |
| booking_revenue_shares | Per-booking revenue snapshot |
| payout_config | Payout schedule configuration |
| wallet_rules | Wallet credit rules |
| payment_method_rules | Payment method eligibility |
| travel_fee_rules | Home visit travel fee rules |

### Jobs
- `cron_financial_alerts` — daily financial anomaly detection
- `cron_ledger_reconcile` — hourly ledger reconciliation

### Classification: **Production Ready**

---

## 5. Wallet / Payments

### Routes
- `GET /api/wallet` — patient wallet balance
- `POST /api/wallet/topup` — add wallet credit
- `GET /api/wallet/transactions` — transaction history
- `GET /api/payments/:id` — payment detail
- `POST /api/payments/stripe/checkout` — Stripe checkout session
- `POST /api/payments/stripe/webhook` — Stripe webhook handler
- `GET /api/payment-providers/available` — active payment providers
- `POST /api/payments/refund` — process refund

### Database Tables
| Table | Purpose |
|-------|---------|
| payments | Payment records |
| wallets | Patient wallet (balance snapshot) |
| wallet_transactions | Wallet credit/debit ledger |
| payment_providers | Available payment methods by country |
| disputes | Payment dispute records |
| idempotency_keys | Stripe webhook dedup |
| marketplace_ledger | Platform marketplace accounting |

### Classification: **Production Ready**

---

## 6. Payouts

### Routes
- `GET /api/provider/payouts` — payout request list
- `POST /api/provider/payouts/request` — request payout
- `PATCH /api/admin/payouts/:id/process` — admin process payout
- `GET /api/admin/payouts` — admin payout queue

### Database Tables
| Table | Purpose |
|-------|---------|
| payout_requests | Provider payout requests |
| provider_wallets | Balance snapshot before payout |
| provider_ledger | Post-payout ledger entry |

### Classification: **Needs Refinement**
- Automated payout disbursement not yet implemented
- Manual approval flow only

---

## 7. Notifications

### Routes
- `GET /api/notifications` — user notifications
- `PATCH /api/notifications/:id/read` — mark as read
- `POST /api/admin/notifications` — admin broadcast
- `GET /api/admin/notifications` — admin notification log
- `POST /api/push/subscribe` — web push subscription
- `DELETE /api/push/subscribe` — unsubscribe

### Database Tables
| Table | Purpose |
|-------|---------|
| user_notifications | Notification records |
| notification_queue | Dispatch queue |
| notification_delivery_logs | Delivery status per channel |
| push_subscriptions | Web Push VAPID subscriptions |
| admin_notifications | Admin broadcast records |

### Jobs
- `cron_tick_5min` — appointment reminders, notification dispatch
- `cron_tick_hourly` — digest notifications, membership expiry

### Channels
- In-app, Email (Resend), SMS (Twilio), WhatsApp (Twilio), Web Push (VAPID)

### Classification: **Production Ready**

---

## 8. Messaging

### Routes
- `GET /api/messages/:providerId` — conversation thread
- `POST /api/messages` — send message
- `GET /api/conversations` — conversation list
- `GET /api/chat/ai` — AI assistant chat (stream)

### Database Tables
| Table | Purpose |
|-------|---------|
| messages | Direct messages |
| conversations | Conversation metadata |
| chat_conversations | AI chat conversations |
| chat_messages | AI chat message history |
| realtime_conversations | WebSocket real-time threads |
| realtime_messages | Real-time message records |

### WebSocket Events
- `message:new` — real-time message delivery
- `conversation:typing` — typing indicators

### Classification: **Needs Refinement**
- Real-time WebSocket messaging works but lacks read receipts
- No media/file attachment support in messages

---

## 9. Memberships & Packages

### Routes
- `GET /api/packages` — available packages
- `POST /api/packages/purchase` — purchase package
- `GET /api/user-packages` — patient's packages
- `GET /api/admin/packages` — admin package management
- `POST /api/admin/packages` — create package

### Database Tables
| Table | Purpose |
|-------|---------|
| packages | Membership package definitions |
| package_benefits | Per-package benefit key-values |
| user_packages | Patient package enrollment |
| membership_benefit_usage | Benefit usage tracking |

### Jobs
- `package.expired` — daily package expiry check

### Classification: **Needs Refinement**
- Package benefit enforcement partially implemented
- Group discounts not yet implemented

---

## 10. Promotions

### Routes
- `GET /api/promo-codes/validate` — validate promo code
- `POST /api/admin/promo-codes` — create promo code
- `GET /api/admin/promo-codes` — list promo codes
- `PATCH /api/admin/promo-codes/:id` — update promo code
- `GET /api/admin/gift-cards` — gift card management
- `POST /api/admin/gift-cards` — issue gift card

### Database Tables
| Table | Purpose |
|-------|---------|
| promo_codes | Discount codes |
| gift_cards | Gift card records |

### Classification: **Production Ready**

---

## 11. Scheduling

### Routes
- `GET /api/provider/schedule` — weekly schedule
- `POST /api/provider/schedule/template` — save schedule template
- `GET /api/provider/office-hours` — office hours
- `PUT /api/provider/office-hours` — update office hours
- `POST /api/provider/blocks` — add blocked time
- `DELETE /api/provider/blocks/:id` — remove block
- `GET /api/provider/availability-exceptions` — exceptions
- `POST /api/rolling-schedule/run` — trigger rolling slot generation

### Database Tables
| Table | Purpose |
|-------|---------|
| provider_office_hours | Weekly availability template |
| provider_schedule_templates | Named schedule templates |
| provider_schedule_overrides | One-off day overrides |
| provider_blocks | Blocked time ranges |
| availability_exceptions | Holiday/exception dates |
| time_slots | Generated availability slots |
| clinic_rooms | Room definitions |
| room_reservations | Room slot reservations |

### Jobs
- `rolling-schedule` — generates slots 90 days ahead, runs every 6 hours

### Classification: **Production Ready**

---

## 12. Analytics

### Routes
- `GET /api/admin/analytics` — platform analytics overview
- `GET /api/admin/analytics/enhanced` — enhanced analytics with trends
- `GET /api/admin/analytics/financial` — financial analytics
- `GET /api/admin/analytics/geographic` — geographic breakdown
- `GET /api/admin/monitoring/daily-summary` — daily monitoring summary
- `GET /api/admin/monitoring/endpoint-stats` — API endpoint performance

### Database Tables
| Table | Purpose |
|-------|---------|
| monitoring_daily_summary | Daily aggregated metrics |
| monitoring_endpoint_stats | Per-endpoint latency/error stats |
| platform_events | Platform lifecycle events |
| reconciliation_results | Scheduler job results |
| financial_alerts | Automated financial anomaly alerts |

### Jobs
- `cron_metrics_snapshot_hourly` — hourly metric snapshots

### Classification: **Needs Refinement**
- Real-time analytics not implemented
- Export to CSV/Excel not implemented

---

## 13. Admin Dashboard

### Panels
- Overview (stats + quick actions)
- Bookings Management
- Provider Operations Console (KYC, profiles, earnings)
- Client Operations Console (patients, wallets, tickets)
- Document Queue (KYC approval)
- Document Expiry Monitor
- Provider Review Queue
- Revenue & Billing Center (commission, fees, payouts, promo, packages, payment providers)
- Notification Center
- Service Catalog Hierarchy
- Settings (platform, Stripe, integrations)
- Audit Logs
- DB Health
- Environment Management Console (GX-02)

### Classification: **Production Ready**

---

## 14. Development Tools (Environment Management)

### Routes (all under `/api/admin/dev/`)
- `GET /reset/profiles` — list reset profiles
- `POST /reset/preview` — full reset dry-run
- `POST /reset/execute` — full destructive reset
- `POST /reset/profile/preview` — profile dry-run
- `POST /reset/profile/execute` — profile execute
- `GET /reset/history` — audit log
- `GET /seed/status` — UAT seed account status
- `POST /seed/execute` — seed UAT data
- `GET /env/snapshot` — environment snapshot
- `GET /env/test-data` — test data detection
- `GET /env/platform-stats` — platform stats
- `GET /env/db-health` — database health metrics

### Reset Profiles
1. Operational Data Reset
2. Financial Data Reset
3. Clinical Data Reset
4. Communication Data Reset
5. Patient Data Reset
6. Provider Data Reset
7. Booking Data Reset
8. Full Non-System Reset

### Classification: **Production Ready**

---

## 15. Security & Auth

### Routes
- `POST /api/auth/register` — registration with validation
- `POST /api/auth/login` — login + rate limiting + brute force detection
- `POST /api/auth/refresh` — JWT refresh
- `POST /api/auth/logout` — token revocation
- `POST /api/auth/change-password` — authenticated password change

### Database Tables
| Table | Purpose |
|-------|---------|
| refresh_tokens | Hashed refresh token store |
| login_attempts | Brute-force tracking |
| password_history | Reuse prevention |
| rate_limit_hits | Rate limit event log |

### Middleware
- `authenticateToken` — JWT verification
- `requireAdmin` / `requireGlobalAdmin` — role gates
- `requirePermission(perm)` — RBAC permission check
- `listingCountryFilter` — multi-country isolation
- `canAccessCountry` — per-resource country check
- Global rate limiter + per-route limiters

### Classification: **Production Ready**

---

## 16. Localization

### Supported Languages
- English (en) — default
- Hungarian (hu)
- Persian / Farsi (fa)

### Coverage
- Frontend i18n via i18next
- RTL support for Persian
- Currency display via `useCurrency()` hook (USD, HUF, EUR, IRR)

### Classification: **Production Ready**

---

## External Dependencies

| Service | Purpose | Required |
|---------|---------|---------|
| Supabase PostgreSQL | Primary database | YES |
| Stripe | Payments | Optional (degrades gracefully) |
| Cloudinary | File/image storage | Optional |
| Resend | Email delivery | Optional |
| Twilio | SMS / WhatsApp | Optional |
| Daily.co | Video rooms | Optional (falls back to Jitsi) |
| OpenAI | AI chat assistant | Optional |
| Google Maps | Geocoding / Places | Optional |

---

*Generated by GX-02 Environment Management Console Sprint*
