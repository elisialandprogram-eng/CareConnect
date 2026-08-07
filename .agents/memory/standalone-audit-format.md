---
name: Standalone audit format
description: Format and scope for comprehensive GoldenLife project audits
---

For a full GoldenLife audit, treat the current repository as a fresh standalone project. Do not frame the report as a comparison to another version or architecture. Cover the whole system, not only finance: backend, frontend, routes, engines, schema, security, scheduling, admin, tests, deployment, legacy code, drift, gaps, and remediation. Deliver one canonical Markdown report at `ops/GL-AUDIT.md`.

**Why:** The user explicitly requires a complete current-state audit in one document and does not want historical architecture comparisons mixed into the findings.

**How to apply:** Keep the audit evidence-based, distinguish confirmed issues from risks and gaps, include exact file locations, and attach the canonical document when complete.