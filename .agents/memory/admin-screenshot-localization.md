---
name: Admin screenshot localization keys
description: Durable naming rule for labels shared by admin panels but representing different concepts
---

Admin panel translation keys must distinguish semantic contexts even when the English label is identical. For example, expiry urgency bands and financial alert severities should not share `critical` or `warning` keys because their Hungarian and Persian translations differ.

**Why:** Reusing a single key caused one panel's correct translation to render the wrong meaning in another panel.

**How to apply:** Namespace or prefix keys by meaning, such as `admin_screenshot.critical` for expiry ranges and `admin_screenshot.severity_critical` for alert severity labels.