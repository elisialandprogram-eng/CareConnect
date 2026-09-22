---
name: Client localization parity
description: Durable convention for keeping patient-facing client translations complete across supported locales
---

All client-facing UI text, including public pages, legal-page navigation/headings, patient dashboards, form labels, and empty states, should be rendered through `useTranslation` rather than literal JSX text. The `en`, `fa`, and `hu` translation files must maintain identical flattened key sets.

**Why:** A previous translation sweep covered the primary booking and dashboard flows but left public pages and small patient-facing labels as hardcoded English, so language switching was visibly incomplete.

**How to apply:** When adding or auditing client UI, search for rendered JSX text and string-valued UI props, add one namespaced key to all three locale files, and verify flattened key parity before finishing.

**Current implementation note:** The member dashboard sweep keeps its new shared keys in `client/src/i18n/member-sweep.ts`, merged into each locale resource during i18n initialization; keep the `en`/`hu`/`fa` object shapes identical when extending it.

**Medical catalogue note:** Canonical member-facing categories and seeded service names should pass through `client/src/lib/medical-localization.ts`; preserve raw database values for filtering and search, and fall back to the stored label for provider-authored custom names that have no translation metadata.

**Why:** Medical catalogue values are dynamic database data rather than static JSX, so translating only page copy leaves services, specialties, and appointment context visibly in English after a member changes locale.

**How to apply:** Use `localizeMedicalTerm(value, t)` at member render boundaries for categories, services, provider specialties, waitlist rows, messages, reviews, family appointments, and booking/appointment summaries; keep admin/provider authoring screens untouched.