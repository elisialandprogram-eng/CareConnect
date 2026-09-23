---
name: Admin localization sweep
description: Durable conventions for extending admin translations without editing the large locale bundles directly.
---

Keep broad admin localization additions in a small overlay module that is merged into the base English locale and into each asynchronously loaded locale. Keep the `en`, `hu`, and `fa` key shapes identical, and localize dynamic notification/report labels through stable semantic keys rather than translating server-provided text blindly.

**Why:** The admin dashboard has many independently lazy-loaded panels and server-generated notification types; direct edits to large locale bundles are easy to desynchronize and dynamic raw text is not reliably localizable.

**How to apply:** When adding admin-visible copy, add the key to the overlay for all supported locales, use the existing admin namespace, and map known notification/event types to translated titles while preserving unknown server content as a fallback. Seeded catalogue names may lack localized DB columns, so resolve known medical names through the shared medical catalogue before falling back to the stored name.