# Database Reset Tool

**Status:** Production-ready  
**Date:** 2026-06-10  
**Location in Admin:** Admin Dashboard → Development → Database Reset  
**Access:** Global Admin only

---

## Purpose

Provides a safe, audited, repeatable way to wipe all patient/provider/test data between UAT cycles without touching platform configuration or admin accounts.

---

## Safety Controls

| Control | Mechanism |
|---------|-----------|
| Auth gate | `authenticateToken` + `requireGlobalAdmin` — only `global_admin` role |
| Dry-run preview | `POST /api/admin/dev/reset/preview` — returns counts, deletes nothing |
| Checkbox acknowledgement | UI: "I understand this is destructive" must be checked |
| Typed phrase confirmation | Must type `RESET DATABASE` exactly before Execute button enables |
| Transaction wrap | All deletes in a single `BEGIN … COMMIT` — rolled back on any error |
| Audit log | Both preview and execute events written to `audit_logs` with admin ID, timestamp, counts, and IP |
| Post-reset verification | Service re-queries counts after commit and returns them in response |

---

## API Endpoints

### `POST /api/admin/dev/reset/preview`
Returns row counts for what *would* be deleted. No data modified.

**Response:**
```json
{
  "counts": {
    "patients": 42,
    "providers": 3,
    "appointments": 18,
    "payments": 12,
    "wallets": 45,
    "notifications": 87,
    "reviews": 6,
    "documents": 9,
    "messages": 34,
    "medicalRecords": 5
  }
}
```

### `POST /api/admin/dev/reset/execute`
Performs the destructive reset.

**Request body:**
```json
{
  "confirm": "RESET DATABASE",
  "understood": true
}
```

**Response:**
```json
{
  "success": true,
  "counts": { "patients": 0, "providers": 0, ... },
  "durationMs": 843,
  "errors": [],
  "executedAt": "2026-06-10T14:22:00.000Z",
  "executedBy": "admin-user-id"
}
```

### `GET /api/admin/dev/reset/history`
Returns last 20 audit log entries for preview + execute events.

---

## Preserved Tables (Never Modified)

| Category | Tables |
|----------|--------|
| Admin users | `users` WHERE role IN ('admin','global_admin','country_admin','staff') |
| Service catalog | `service_categories`, `catalog_services`, `sub_services`, `services`, `service_packages`, `package_services` |
| Practitioners | `practitioners`, `service_practitioners`, `practitioner_schedules`, `medical_practitioners` |
| Platform config | `platform_settings`, `locations`, `tax_settings` |
| Payment config | `payment_providers` |
| Promo definitions | `promo_codes` (definitions only, usages cleared) |
| Financial config | `refund_rules`, `invoice_templates` (via `email_templates`) |
| CMS | `content_blocks`, `faqs`, `blog_posts`, `announcements`, `email_templates` |
| RBAC | `admin_roles`, `role mappings` (all permission tables) |
| System | `system_events`, `migrations`, `daily_metrics` |
| Audit (admin) | `audit_logs` WHERE `user_id` is an admin OR `user_id IS NULL` |

---

## Cleared Tables (Deletion Order)

Dependency-aware order ensures FK constraints are never violated:

1. `medication_logs`
2. `realtime_messages`
3. `chat_messages`
4. `messages`
5. `ticket_messages`
6. `appointment_events`
7. `provider_earnings`
8. `video_sessions`
9. `group_session_participants`
10. `invoice_items`
11. `payments`
12. `disputes`
13. `reviews`
14. `invoices`
15. `wallet_transactions`
16. `wallets`
17. `provider_ledger`
18. `provider_wallets`
19. `notification_delivery_logs`
20. `user_notifications`
21. `notification_queue`
22. `push_subscriptions`
23. `patient_consents`
24. `saved_providers`
25. `patient_gallery`
26. `saved_addresses`
27. `health_metrics`
28. `medications`
29. `family_members`
30. `medical_history`
31. `prescriptions`
32. `patient_notes`
33. `waitlist_entries`
34. `referrals`
35. `gift_cards`
36. `user_packages`
37. `support_tickets`
38. `realtime_conversations`
39. `chat_conversations`
40. `conversations`
41. `group_sessions`
42. `appointments`
43. `time_slots`
44. `provider_blocks`
45. `availability_exceptions`
46. `provider_office_hours`
47. `provider_schedule_templates`
48. `provider_gallery`
49. `provider_pricing_overrides`
50. `provider_category_permissions`
51. `provider_documents`
52. `provider_credentials`
53. `audit_logs` (non-admin user entries only)
54. `providers` (non-admin)
55. `refresh_tokens` (non-admin)
56. `users` (non-admin, non-staff)

---

## Rollback Strategy

- All deletes execute inside a single PostgreSQL transaction (`BEGIN … COMMIT`).
- Any unhandled error triggers `ROLLBACK` automatically — the database is left unchanged.
- Per-table errors from missing optional tables (e.g., `medication_logs`) are caught via `safeDelete()`, logged as non-critical skips, and do **not** abort the transaction.
- The transaction isolation level is the PostgreSQL default (read committed), sufficient for a serial admin operation.

---

## Execution Flow

```
Admin clicks Preview
  → POST /api/admin/dev/reset/preview
  → previewReset() runs COUNT queries
  → Returns impact summary (no mutation)
  → UI shows per-category counts

Admin checks box + types "RESET DATABASE"
  → Execute button activates
  → POST /api/admin/dev/reset/execute { confirm, understood }
  → Server validates phrase
  → executeReset() runs inside BEGIN…COMMIT
  → Post-reset verification queries run
  → Audit log written
  → Response shows remaining counts + errors + duration
```

---

## Audit Log

Events written to `audit_logs`:

| action | when |
|--------|------|
| `db_reset_preview` | every dry-run preview call |
| `db_reset_executed` | every successful execution |

Both events store: `admin_id`, `ip`, `counts`, `durationMs`, `errors[]`, `timestamp`.

Queryable via `GET /api/admin/dev/reset/history`.

---

## TypeScript Validation

```
npx tsc --noEmit --skipLibCheck → EXIT 0
```
