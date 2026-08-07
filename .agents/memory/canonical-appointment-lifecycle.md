---
name: Canonical appointment lifecycle
description: Durable rule for appointment status transitions and lifecycle audit events.
---

All appointment status changes must pass through the canonical transition service, which locks the row, validates the state-machine edge, writes the appointment update, and appends the lifecycle event atomically. Direct status updates are intentionally rejected.

**Why:** Multiple booking, payment, admin, reschedule, and cron paths previously bypassed the same transition policy, allowing invalid transitions and inconsistent audit history.

**How to apply:** Use the transition service for every non-creation status change, including automated expiry/cancellation and payment confirmation. Use ordinary appointment updates only for non-status metadata such as notes, refund markers, and UTC scheduling fields.