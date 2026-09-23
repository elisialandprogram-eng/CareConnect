---
name: Language switching reliability
description: Prevent lazy-resource fallback and stale async language changes from breaking locale selection.
---

Supported locale resources should be available before React renders, and every UI language selector should use one shared change helper. Compare a requested language with `i18n.language` (normalized to its base code), not `resolvedLanguage`; the latter can still report the fallback language while a locale resource is loading. Persist the explicit choice before auth/profile hydration and serialize rapid changes so the latest selection wins.

**Why:** Lazy locale loading allowed the UI to render English temporarily, and the resolved-language guard could treat selecting English as a no-op while another locale was active. Separate callers could also race during auth/profile synchronization.

**How to apply:** Add new supported locales to the startup resource map and route header, settings, profile, consent, and hydration changes through the shared language-change helper.