---
name: Provider generated-copy localization
description: Provider dashboard recommendations and other server-generated user-facing copy must be returned as translation keys with interpolation data.
---

Server-generated provider-dashboard copy must expose stable translation keys and only the data needed for interpolation; the client renders the localized message. Keep the original text only as a compatibility fallback for older responses.

**Why:** Returning fully rendered English recommendation strings from an API bypasses the client locale and leaves Hungarian and Persian dashboards partially untranslated.

**How to apply:** For new provider insights, alerts, or recommendations, add a key to the shared provider translation additions for all supported locales, return the key and interpolation values from the API, and render through `t(...)` in every provider dashboard surface.