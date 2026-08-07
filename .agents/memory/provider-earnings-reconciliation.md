---
name: Provider earnings reconciliation
description: Completed paid appointments can exist without provider_earnings when completion comes from an alternate path
---

Provider earnings reads must reconcile completed appointments whose effective payment status is completed but which have no provider_earnings row. The earning writer is idempotent on appointment_id and must lock only the appointment relation (`FOR UPDATE OF a`) when its query includes outer joins.

**Why:** Completion can be written by imports, admin overrides, or recovery flows that do not invoke the normal status handler; PostgreSQL rejects `FOR UPDATE` on the nullable side of an outer join.

**How to apply:** Keep the provider earnings endpoint resilient to missing rows, and add regression coverage for a completed paid appointment with no earning record.