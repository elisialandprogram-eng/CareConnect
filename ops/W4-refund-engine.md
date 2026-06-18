# W4 — Refund Engine: DB-Driven Rules

**Sprint:** P2 — Revenue Completion
**Status:** Complete
**Date:** 2026-06-11

## Scope

Replace the hardcoded `quoteRefund()` logic in the appointment action handler with a DB-driven version that reads the active `refund_rules` row for the appointment's country.

## Background

`server/lib/appointmentActions.ts` contained a `quoteRefund()` function with hardcoded windows:
- Free refund: > 24 hours before start
- Partial refund (50%): 2–24 hours before start
- No refund: < 2 hours before start

These windows could not be adjusted without a code deploy. The `refund_rules` table (created in Sprint P1) already supports per-country rule rows but was never consulted at refund-quote time.

## Changes Delivered

### `server/lib/appointmentActions.ts`

**New `RefundRule` interface:**
```typescript
interface RefundRule {
  free_window_hours: number;
  partial_refund_window_hours: number;
  partial_refund_percent: number;
  no_refund_window_hours: number;
  is_active: boolean;
}
```

**New `quoteRefundWithRule()` function:**
- Accepts an optional `RefundRule | null` second argument.
- When a rule is provided, uses `rule.free_window_hours`, `rule.partial_refund_window_hours`, `rule.partial_refund_percent`, and `rule.no_refund_window_hours` for bracket calculation.
- When `rule` is `null`, falls back to hardcoded defaults (24 / 48 / 50% / 2) — identical to original `quoteRefund()` behaviour.
- Both `quoteRefund` (legacy export) and `quoteRefundWithRule` are exported so callers can migrate incrementally.

### `server/routes/appointment.routes.ts`

Before computing the refund quote for a `cancel` action:

1. Reads `appointments.country_code` from the existing row.
2. Queries `refund_rules` for an `is_active = true` row matching that country (or `country_code = 'all'`), ordered so the country-specific row takes precedence.
3. Passes the loaded rule (or `null`) to `quoteRefundWithRule()`.
4. Any DB error falls back gracefully — the refund quote uses defaults.

### Revenue Billing Center — Refund Rules tab (W10)

A new **Refund Rules** tab was added to the Revenue Billing Center. Admins can:
- View all configured rules in a table (country, free window, partial %, active status).
- Add new rules via an inline form.
- Edit existing rules via the PUT route.

## Fallback Behaviour

If `refund_rules` is empty or no rule matches the appointment country, `quoteRefundWithRule(params, null)` is called, which is mathematically identical to the old `quoteRefund()`. No behaviour change occurs on existing deployments until an admin creates a rule.

## Testing Notes

1. Create a rule: `country_code = 'HU', free_window_hours = 48, partial_refund_percent = 75`.
2. Book an appointment in HU, cancel 30 hours before start.
3. Verify refund quote returns 100% (within free window).
4. Cancel 10 hours before — verify 75% partial refund.
5. With no rule in DB, verify old 24h/50% defaults apply.
