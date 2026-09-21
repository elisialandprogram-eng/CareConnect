---
name: Admin database enum localization
description: Rules for translating database-backed enum values in admin reports.
---

Database-backed admin values must be translated at render time, not displayed after replacing underscores. This includes appointment and payment statuses, payment methods, visit/location modes, provider categories, and lifecycle transition values.

**Why:** Raw values such as `cash`, `home_visit`, `pending`, and `approved` bypass locale changes when they are rendered directly from report rows.

**How to apply:** Prefer the shared StatusBadge for statuses. For other enum values, resolve a localized admin key with a readable fallback, and keep the stored value unchanged for filters, API requests, IDs, and exports.