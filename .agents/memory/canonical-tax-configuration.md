---
name: Canonical tax configuration
description: Rules for distinguishing configured zero tax from missing tax configuration and validating the startup behavior around pricing changes.
---

An explicit active tax rule with `tax_rate = 0` is a valid configured result. An absent service-tax or platform-tax rule is not equivalent to 0% for quote and final booking paths; it must remain identifiable and produce a clear configuration error.

**Why:** Treating missing configuration as zero silently under-collects tax and makes a missing country/sub-service rule indistinguishable from a deliberate exemption.

**How to apply:** Keep rule resolution centralized in the tax engine, enforce configuration in both async booking/quote and sync simulation paths when rules are explicitly supplied, and never restore legacy `sub_services.tax_percentage` as an active fallback.

The first development boot after schema changes can spend over a minute in historical startup migrations while still serving HTTP. `/health` may return `503` with `readiness: "migrating"` during that interval; verify the final state after migration completion rather than weakening readiness checks.

**Why:** The application intentionally listens before migrations finish so the preview port opens promptly, while readiness is only marked after the full migration chain completes.

**How to apply:** After a restart, inspect migration logs and recheck `/health` before diagnosing a pricing change as a startup regression.