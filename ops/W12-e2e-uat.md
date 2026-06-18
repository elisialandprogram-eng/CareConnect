# W12 — End-to-End UAT: Revenue Completion Sprint

**Sprint:** P2 — Revenue Completion
**Status:** Complete
**Date:** 2026-06-11

## Scope

Define the UAT test scenarios that must pass to consider the Sprint P2 revenue workstreams shippable.

## Test Scenarios

### TC-W1: Free Cancellation Benefit

| Step | Action | Expected |
|---|---|---|
| 1 | Purchase a package with `free_cancellations: 2` | Package activates |
| 2 | Book appointment starting in 1 hour | Booking succeeds |
| 3 | Cancel appointment (within no-cancel window) | Cancel succeeds (benefit used) |
| 4 | Book again, cancel within window (2nd use) | Cancel succeeds |
| 5 | Book again, cancel within window (3rd attempt) | Cancel blocked: "Cancellation not allowed within X hours" |
| 6 | Check `membership_benefit_usage` | 2 rows with `benefit_key = 'free_cancellations'` |

### TC-W2: Benefit Usage Logging

| Step | Action | Expected |
|---|---|---|
| 1 | Activate package with 20% service discount + $5 wallet bonus | Package active |
| 2 | Book appointment | Booking succeeds |
| 3 | Query `membership_benefit_usage WHERE appointment_id = <id>` | 2 rows: `service_discount_percent`, `wallet_bonus` |

### TC-W3: Revenue Share Participant Types

| Step | Action | Expected |
|---|---|---|
| 1 | Insert revenue_share_rule with `participant_type_extended = 'affiliate'` | Row created |
| 2 | Fetch via admin API | `participant_type_extended` field present |
| 3 | Existing `participant_type = 'platform'` rules unchanged | No regression |

### TC-W4: DB-Driven Refund Rules

| Step | Action | Expected |
|---|---|---|
| 1 | Create refund rule: HU, free_window=48h, partial=75%, no_refund=4h | Rule saved |
| 2 | Book HU appointment, cancel 50h before | 100% refund |
| 3 | Cancel 20h before | 75% refund |
| 4 | Cancel 2h before | 0% refund |
| 5 | Delete the rule, cancel — should use defaults (24h/50%/2h) | Default windows apply |

### TC-W5: Gift Card Booking Integration

| Step | Action | Expected |
|---|---|---|
| 1 | Create GC with code `TEST50`, balance $50 | GC created |
| 2 | Book $60 appointment with `giftCardCode: "TEST50"` | $50 from GC, $10 from wallet/Stripe |
| 3 | Check GC row | `balance = 0, is_active = false` |
| 4 | Try to use expired GC | Silently skipped, booking proceeds |

### TC-W7: Auto-Renewal

| Step | Action | Expected |
|---|---|---|
| 1 | Set `user_package.auto_renew = true, expires_at = NOW() - 1 min` | Setup complete |
| 2 | Top up wallet to cover package price | Wallet ready |
| 3 | Trigger hourly tick | New `user_packages` row with `status = 'active'` created |
| 4 | Old row has `status = 'renewed'` | Confirmed |
| 5 | Wallet deducted by package price | Confirmed |

### TC-W8: VAT on Package Purchase

| Step | Action | Expected |
|---|---|---|
| 1 | Configure `tax_settings: HU, rate=27%` | Setting active |
| 2 | HU patient purchases $10 package | Amount charged is $12.70 |
| 3 | No tax setting for country | Package charged at face value |

### TC-W9: Gift Card + Wallet Stacking

| Step | Action | Expected |
|---|---|---|
| 1 | Patient has $20 wallet balance | — |
| 2 | Apply $15 GC to a $30 booking | GC tops up wallet: $20→$35, wallet deducted $30→$5 |
| 3 | GC balance decremented to $0, deactivated | Confirmed |

### TC-W10: Billing Center Tabs

| Step | Action | Expected |
|---|---|---|
| 1 | Navigate to Admin → Revenue & Billing Center | 12 tabs visible |
| 2 | Refund Rules tab | Lists rules, add/edit form works |
| 3 | Tax / VAT tab | Lists tax settings, add/edit form works |
| 4 | Gift Cards tab | Lists cards, issue form works, deactivate works |

## Regression Checklist

- [ ] Booking with no gift card and no package: unchanged
- [ ] Provider cancellation: unchanged
- [ ] No-show: unchanged
- [ ] Stripe checkout: unchanged
- [ ] Cash/bank-transfer bookings: unchanged
- [ ] Package with `auto_renew = false`: not renewed by cron
