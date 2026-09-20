---
name: Analytics label locale
description: Locale handling for provider analytics chart labels.
---

Analytics and reporting APIs should return locale-neutral ISO month/week keys rather than English-formatted labels. The client owns visible formatting through the active locale.

**Why:** Server-formatted English abbreviations leak into Hungarian and Persian charts and are unreliable to parse across locales and year boundaries.

**How to apply:** Return `YYYY-MM` for monthly buckets and `YYYY-MM-DD` for weekly buckets; use the shared datetime helpers before rendering chart axes, tooltips, or summaries.