---
name: Stripe appointment webhook linkage
description: The required link between Stripe Checkout sessions and appointment payment completion
---

Stripe Checkout sessions for appointments must include the appointment ID in session metadata. The payment webhook uses that metadata to locate the payment row and transition the appointment to confirmed with completed payment status.

**Why:** Without the appointment ID, Stripe can successfully complete a checkout while leaving the appointment and provider-facing payment state pending.

**How to apply:** Whenever a new appointment Stripe checkout path is added or changed, verify that `metadata.appointmentId` is present and that the confirmation page tolerates the webhook/redirect race.