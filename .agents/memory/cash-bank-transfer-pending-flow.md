---
name: Cash / bank-transfer booking payment status
description: Cash and bank-transfer bookings must stay pending until the provider marks them received; the booking route must not auto-complete them.
---

Cash and bank-transfer bookings must keep the payment row in `pending` status at booking time and must not auto-promote the appointment to `confirmed` or `paymentStatus = "completed"`.

- The provider marks these as received through the existing `PATCH /api/appointments/:id/payment-status` flow.
- The `PATCH /api/appointments/:id/payment-status` endpoint must sync the `appointments.payment_status` column with the `payments.status` row so the patient confirmation page and the provider earnings detail reflect the change.
- The provider appointments list must also invalidate the provider-earnings query (`QK.providerEarnings()`) after a successful mark-as-paid so the earnings page does not show stale data.
- Provider earnings has two separate statuses: the primary report status is patient payment status (`payments.status`), while the expanded payout status remains pending until an admin pays out the provider.
- Booking confirmation emails must format the stored appointment total (`appointments.total_amount`) directly in its booking currency, matching the confirmation page rather than reconverting the USD accounting snapshot.
- Backfill: any existing rows where `payments.status = 'completed'` but `appointments.payment_status = 'pending'` should be repaired with an `UPDATE`.
- Wallet/card flows are the only methods that auto-complete at booking.
- When a provider marks the appointment as `completed`, the status-update endpoint will auto-complete only pre-paid methods (`card`/`wallet`); cash/bank_transfer remain blocked until payment is explicitly marked completed.

**Why:** The provider earnings page shows a `Payment:` line that reads `appointments.payment_status`. If that column is not kept in sync with `payments.status`, the provider sees a completed payment as still pending in earnings. The earnings table's own `Status` column is the *payout* status (`provider_earnings.status`), which is a separate lifecycle and correctly stays pending until the admin pays out.
