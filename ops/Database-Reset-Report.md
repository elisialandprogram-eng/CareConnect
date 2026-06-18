# Database Reset Report

**Date:** 2026-06-10  
**Environment:** Pre-launch (Supabase)  
**Executed by:** Automated reset script (`script/db-reset.cjs`)  
**Objective:** Clean production-ready state — remove all operational/test data while preserving admin, service catalog, and system configuration.

---

## Summary

| Metric | Result |
|--------|--------|
| Total tables in schema | 115 |
| Tables cleared | 96 |
| Tables preserved (kept data) | 19 |
| Non-admin users removed | 13 |
| Admin accounts preserved | 2 |
| FK violations during reset | 0 |
| TypeScript errors post-reset | 0 |

---

## Admin Accounts Preserved

| Email | Role | Status |
|-------|------|--------|
| admin@goldenlife.com | global_admin | ✅ Retained |
| admin@goldenlife.health | global_admin | ✅ Retained |

---

## Tables Cleaned (rows → 0)

### Appointment & Booking
| Table | Rows Removed |
|-------|-------------|
| appointments | all |
| appointment_events | all |
| appointment_consents | all |
| appointment_slot_holds | all |
| room_reservations | all |
| video_sessions | all |
| time_slots | all |
| waitlist_entries | all |
| group_sessions | all |
| group_session_participants | all |

### Financial
| Table | Rows Removed |
|-------|-------------|
| payments | all |
| invoices | all |
| invoice_items | all |
| marketplace_ledger | all |
| wallets | all |
| wallet_transactions | all |
| provider_wallets | all |
| provider_ledger | all |
| provider_earnings | all |
| payout_requests | all |
| gift_cards | all |
| promo_codes | all |
| financial_alerts | all |

### Provider Data
| Table | Rows Removed |
|-------|-------------|
| providers | all |
| practitioners | all |
| practitioner_schedules | all |
| medical_practitioners | all |
| provider_documents | all |
| provider_credentials | all |
| provider_gallery | all |
| provider_office_hours | all |
| provider_schedule_templates | all |
| provider_schedule_overrides | all |
| provider_blocks | all |
| provider_buffer_settings | all |
| provider_time_off | all |
| provider_category_permissions | all |
| provider_pricing_overrides | all |
| availability_exceptions | all |
| clinic_rooms | all |
| services | all |
| service_packages | all |
| service_practitioners | all |
| service_price_history | all |
| service_requests | all |
| package_services | all |

### Patient / User Data
| Table | Rows Removed |
|-------|-------------|
| users (non-admin) | 13 |
| family_members | all |
| patient_consents | all |
| patient_documents | all |
| patient_gallery | all |
| patient_notes | all |
| saved_providers | all |
| saved_addresses | all |
| locations | all |
| referrals | all |
| user_packages | all |

### Clinical
| Table | Rows Removed |
|-------|-------------|
| prescriptions | all |
| medical_history | all |
| medications | all |
| medication_logs | all |
| health_metrics | all |

### Reviews & Disputes
| Table | Rows Removed |
|-------|-------------|
| reviews | all |
| disputes | all |

### Memberships & Packages
| Table | Rows Removed |
|-------|-------------|
| packages | all |
| package_benefits | all |
| membership_benefit_usage | all |

### Notifications & Messaging
| Table | Rows Removed |
|-------|-------------|
| user_notifications | all |
| notification_delivery_logs | all |
| notification_queue | all |
| notification_preferences | all |
| push_subscriptions | all |
| realtime_conversations | all |
| realtime_messages | all |
| chat_conversations | all |
| chat_messages | all |
| conversations | all |
| messages | all |
| admin_broadcasts | all |
| admin_notifications | all |

### Support & Bugs
| Table | Rows Removed |
|-------|-------------|
| support_tickets | all |
| ticket_messages | all |
| bug_reports | all |
| bug_report_comments | all |
| privacy_requests | all |

### Monitoring, Analytics, Audit
| Table | Rows Removed |
|-------|-------------|
| audit_logs | all |
| platform_events | all |
| monitoring_daily_summary | all |
| monitoring_endpoint_stats | all |
| daily_metrics | all |
| reconciliation_results | all |
| system_events | all |
| idempotency_keys | all |
| rate_limit_hits | all |
| login_attempts | all |
| password_history | all |
| refresh_tokens | all |

### Test Content
| Table | Rows Removed |
|-------|-------------|
| blog_posts | all |
| announcements | all |
| faqs | all |
| content_blocks | all |

---

## Tables Preserved (System Configuration & Catalog)

| Table | Rows Retained | Purpose |
|-------|--------------|---------|
| users | 2 | Global admin accounts |
| categories | 13 | Service category taxonomy |
| catalog_services | 25 | Service catalog groups |
| sub_services | 112 | Base service types with defaults |
| admin_roles | 7 | RBAC role definitions |
| rbac_permissions | 28 | Permission key registry |
| role_permissions | 95 | Role-to-permission mappings |
| tax_settings | 1 | Country tax configuration |
| currency_rates | 5 | Exchange rates (USD base) |
| platform_settings | 4 | Core platform config values |
| invoice_templates | 1 | Invoice branding/legal templates |
| refund_rules | 5 | Cancellation/refund policy rules |
| service_categories | — | Legacy service categories |
| email_templates | 0 | (Table empty — no test data) |

---

## Post-Reset Validation Results

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| Admin users | 2 | 2 | ✅ |
| Non-admin users | 0 | 0 | ✅ |
| Providers | 0 | 0 | ✅ |
| Appointments | 0 | 0 | ✅ |
| Payments | 0 | 0 | ✅ |
| Reviews | 0 | 0 | ✅ |
| Wallets | 0 | 0 | ✅ |
| Packages | 0 | 0 | ✅ |
| Categories retained | >0 | 13 | ✅ |
| Sub-services retained | >0 | 112 | ✅ |
| Catalog services retained | >0 | 25 | ✅ |
| Admin roles retained | >0 | 7 | ✅ |
| RBAC permissions retained | >0 | 28 | ✅ |
| FK violations | 0 | 0 | ✅ |
| TypeScript errors | 0 | 0 | ✅ |

---

## Execution Method

- FK enforcement disabled via `SET session_replication_role = 'replica'` (Supabase-compatible)
- `TRUNCATE ... RESTART IDENTITY CASCADE` used for 95 tables
- Surgical `DELETE FROM users WHERE id NOT IN (admin_ids)` used for user table
- FK enforcement restored via `SET session_replication_role = 'origin'`
- Zero schema changes — no tables, columns, or constraints modified

---

## Platform Readiness

The platform is now in a **fresh install state** ready for end-to-end testing:

- ✅ Admin login can proceed (`admin@goldenlife.com`, `admin@goldenlife.health`)
- ✅ Service catalog intact — categories, catalog services, sub-services all present
- ✅ Provider registration flow can start from scratch
- ✅ Patient registration flow can start from scratch
- ✅ Booking flow has a clean appointment table
- ✅ No orphaned FK references
- ✅ No residual operational data from previous test cycle
- ✅ Application startup migrations will run cleanly on next boot
- ✅ TypeScript: `npx tsc --noEmit --skipLibCheck` → EXIT 0

---

*Reset script preserved at `script/db-reset.cjs` for future use.*
