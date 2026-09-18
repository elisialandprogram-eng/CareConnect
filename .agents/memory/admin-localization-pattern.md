---
name: Admin localization pattern
description: Admin dashboard navigation and reporting tabs must use the admin i18n namespace instead of hardcoded labels.
---

Admin dashboard UI has three supported locales: English, Hungarian, and Persian. Keep shared dashboard navigation, wrapper descriptions, and reporting tabs in the `admin` translation namespace with matching keys in all three locale files.

**Why:** The admin area contains many independently loaded panels, and hardcoded labels remain English even when the rest of the application changes language.

**How to apply:** When adding an admin tab, panel wrapper, or navigation item, add all locale values first and pass the translated label through the component. Avoid using English fallback text as the only source for user-visible admin copy.