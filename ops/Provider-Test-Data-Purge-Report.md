# Provider Test Data Purge Report

**Date:** 2026-06-10  
**Executed by:** Agent (automated purge)  
**Status:** ✅ COMPLETE — All test provider data removed

---

## Providers Removed

| Provider ID | User ID | Name | Email | Type | Country | Status at Deletion |
|---|---|---|---|---|---|---|
| `47f52a52-5d0f-4c15-9112-c7ed008bd336` | `3230132a-0a3e-45b7-9b24-bcc77f586eac` | Cista Lark | cistalark@gmail.com | dietitian | HU | approved |
| `d0b0dbed-d1a5-48cb-8853-208667834cb6` | `d9175e58-815b-42d2-86ec-19e942956a21` | Espanuy Helena | puneeth.sap89@gmail.com | physiotherapist | HU | approved |

---

## Dependency Audit (Pre-Deletion)

Full dependency scan performed across all provider-related tables before any deletion.  
Deletion executed inside a single transaction with `BEGIN / COMMIT`.

---

## Records Deleted Per Table

| Table | Records Deleted |
|---|---|
| `provider_documents` | **6** |
| `provider_credentials` | **3** |
| `user_notifications` | **8** |
| `audit_logs` | **6** |
| `refresh_tokens` | **3** |
| `providers` | **2** |
| `users` | **2** |
| `appointment_events` | 0 |
| `prescriptions` | 0 |
| `medical_history` | 0 |
| `invoices` | 0 |
| `disputes` | 0 |
| `reviews` | 0 |
| `waitlist_entries` | 0 |
| `appointments` | 0 |
| `provider_category_permissions` | 0 |
| `provider_gallery` | 0 |
| `provider_buffer_settings` | 0 |
| `provider_blocks` | 0 |
| `provider_schedule_templates` | 0 |
| `provider_time_off` | 0 |
| `provider_office_hours` | 0 |
| `patient_notes` | 0 |
| `service_requests` | 0 |
| `saved_providers` | 0 |
| `group_session_participants` | 0 |
| `group_sessions` | 0 |
| `provider_earnings` | 0 |
| `provider_ledger` | 0 |
| `payout_requests` | 0 |
| `provider_wallets` | 0 |
| `medical_practitioners` | 0 |
| `practitioners` | 0 |
| `time_slots` | 0 |
| `availability_exceptions` | 0 |
| `services` | 0 |
| `chat_conversations` | 0 |
| `notification_delivery_logs` | 0 |
| `wallet_transactions` | 0 |
| `wallets` | 0 |
| `user_packages` | 0 |

**Total records deleted: 30**

---

## Deletion Order

Executed in strict dependency order to avoid FK violations:

1. `appointment_events` → `prescriptions` → `medical_history` → `invoices` → `disputes` → `reviews` → `waitlist_entries` → `appointments`
2. `provider_documents` → `provider_credentials` → `provider_category_permissions` → `provider_gallery` → `provider_buffer_settings` → `provider_blocks` → `provider_schedule_templates` → `provider_time_off` → `provider_office_hours` → `patient_notes` → `service_requests` → `saved_providers` → `group_session_participants` → `group_sessions`
3. `provider_earnings` → `provider_ledger` → `payout_requests` → `provider_wallets`
4. `medical_practitioners` → `practitioners`
5. `time_slots` → `availability_exceptions` → `services`
6. `chat_conversations`
7. `providers`
8. `user_notifications` → `audit_logs` → `notification_delivery_logs`
9. `refresh_tokens` → `wallet_transactions` → `wallets` → `user_packages`
10. `users`

**FK issue encountered and resolved:** `refresh_tokens` has a FK to `users` — deleted 3 refresh token rows before removing the user accounts.

---

## Validation Results

| Check | Result |
|---|---|
| Provider users remaining | ✅ 0 |
| Provider profiles remaining | ✅ 0 |
| Provider documents remaining | ✅ 0 |
| Provider credentials remaining | ✅ 0 |
| Provider schedules remaining | ✅ 0 |
| Provider wallet records remaining | ✅ 0 |
| Provider payout records remaining | ✅ 0 |
| Users with role='provider' remaining | ✅ 0 |

---

## Orphan Check Results

| Table | Orphaned Rows (provider_id → NULL) | Status |
|---|---|---|
| `provider_documents` | 0 | ✅ Clean |
| `provider_credentials` | 0 | ✅ Clean |
| `provider_wallets` | 0 | ✅ Clean |
| `payout_requests` | 0 | ✅ Clean |
| `time_slots` | 0 | ✅ Clean |
| `reviews` | 0 | ✅ Clean |
| `services` | 0 | ✅ Clean |
| `appointments` | 0 | ✅ Clean |

---

## Final Provider Counts

| Metric | Count |
|---|---|
| Total providers in `providers` table | **0** |
| Total users with `role = 'provider'` | **0** |
| Orphaned provider-linked rows | **0** |

---

## Database Health Status

✅ **No FK violations detected**  
✅ **No orphaned records remain**  
✅ **Transaction committed cleanly**  
✅ **All provider-related tables verified empty for purged IDs**  
✅ **Platform reference data untouched** (categories, sub_services, tax_settings, packages, RBAC roles/permissions, admin accounts, system config)

---

## Items NOT Deleted (as required)

- Admin accounts and users
- RBAC roles, permissions, and mappings
- Service categories and sub-services (platform catalog)
- Platform settings, tax configuration, currency configuration
- Email and notification templates
- Application schema / migrations
- Any non-provider production data
