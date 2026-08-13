---
name: Stripe appointment webhook linkage
description: The required link between Stripe Checkout sessions and appointment payment completion
---

Stripe Checkout sessions for appointments must include the appointment ID in session metadata. The payment webhook uses that metadata to locate the payment row and transition the appointment to confirmed with completed payment status.

**Why:** Without the appointment ID, Stripe can successfully complete a checkout while leaving the appointment and provider-facing payment state pending.

**How to apply:** Whenever a new appointment Stripe checkout path is added or changed, verify that `metadata.appointmentId` is present and that the confirmation page tolerates the webhook/redirect race.

Stripe checkout failure events must also cancel still-pending appointments, release their reserved slot, and refund any partial wallet allocation. Session creation failures must mark the payment attempt/aggregate failed before returning an error.

**Why:** Creating the appointment before Checkout is necessary to place its ID in Stripe metadata, but without compensating cleanup an abandoned or failed Checkout leaves a pending appointment that looks booked.

**How to apply:** Keep the appointment as an auditable cancelled record rather than deleting it; handle both immediate session-creation errors and `checkout.session.expired` / `checkout.session.async_payment_failed` webhooks idempotently.