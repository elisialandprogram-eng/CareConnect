---
name: Reporting enum localization
description: Database-backed report enums must be translated at render time through the shared reporting dictionary.
---

Report and dashboard APIs should return stable database enum values, while the client resolves statuses, payment methods, visit modes, provider categories, roles, priorities, and chart dates through shared locale-aware helpers.

**Why:** Replacing underscores or capitalizing values only makes English-readable text; it does not localize Hungarian or Persian and creates inconsistent labels across dashboards.

**How to apply:** Preserve raw values for filters, API requests, IDs, and exports. Use the shared reporting translation tree and datetime helpers for visible labels, with a readable fallback only when a genuinely new enum has no translation yet.