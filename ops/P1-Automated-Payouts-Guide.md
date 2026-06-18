# P1 — Automated Provider Payouts
**Sprint:** P1 Launch Blockers | **Workstream:** 3 — Automated Payouts  
**Status:** ✅ Implemented | **Date:** 2026-06-11

---

## Overview

Automated scheduled payouts eliminate manual admin overhead for recurring provider disbursements. Providers set their own schedule (weekly/monthly/manual), and the batch engine handles eligibility checks, balance holds, Stripe transfers, and ledger entries atomically.

---

## Database Table: `payout_schedules`

```sql
provider_id         VARCHAR PK (FK → providers.id)
schedule_type       VARCHAR    ('weekly' | 'monthly' | 'manual')
minimum_amount_usd  NUMERIC    (default: $25)
hold_days           INTEGER    (days after appointment completion, default: 3)
enabled             BOOLEAN
next_payout_at      TIMESTAMPTZ
last_payout_at      TIMESTAMPTZ
```

---

## Service: `server/services/payout-automation.service.ts`

| Function | Description |
|----------|-------------|
| `getPayoutSchedule(providerId)` | Fetch provider's current schedule |
| `setPayoutSchedule(providerId, type, min, holdDays, enabled)` | Upsert schedule |
| `runBatchPayout(triggeredBy, scheduleType?)` | Execute batch payout for all eligible |
| `retryFailedPayout(payoutRequestId, adminId)` | Retry a rejected payout via Stripe |
| `getPayoutHealthSummary()` | Dashboard metrics |

---

## Eligibility Criteria

A provider is included in a batch payout when ALL of these are true:

1. `payout_schedules.enabled = true`
2. `provider_wallets.is_frozen = false`
3. `provider_wallets.available_balance >= minimum_amount_usd`
4. `payout_schedules.next_payout_at <= NOW()` (or null)
5. Earnings that completed at least `hold_days` days ago exist

The hold period protects against refund exposure — earnings from appointments less than `hold_days` old are excluded from the eligible balance.

---

## Batch Execution Flow

```
POST /api/admin/payouts/automation/batch (confirm: true)
    ↓
getEligibleProviders() — SQL join across payout_schedules + provider_wallets
    ↓
For each eligible provider:
  1. BEGIN transaction + FOR UPDATE lock on wallet
  2. INSERT payout_request (status='approved', payout_batch_id=batchId)
  3. UPDATE wallet: available_balance -= amount, held_balance += amount
  4. INSERT provider_ledger: entry_type='payout_held'
  5. COMMIT
    ↓
  If provider has Stripe connected account (payouts_enabled=true):
    stripe.transfers.create() → transferId
    UPDATE payout_request: status='paid', stripe_transfer_id=transferId
    UPDATE wallet: held_balance -= amount
    INSERT ledger: entry_type='payout_deduction'
  Else:
    Leave in 'approved' state (admin manually disburses)
    ↓
  UPDATE payout_schedules.next_payout_at (weekly/monthly)
    ↓
Return BatchPayoutResult with succeeded/skipped/failed counts
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/provider/payouts/schedule` | provider | Get my payout schedule |
| POST | `/api/provider/payouts/schedule` | provider | Set payout schedule |
| GET | `/api/admin/payouts/automation/health` | admin | Dashboard metrics |
| POST | `/api/admin/payouts/automation/batch` | global_admin | Run batch (requires confirm:true) |
| GET | `/api/admin/payouts/automation/eligible` | admin | List currently eligible providers |
| POST | `/api/admin/payouts/:id/retry` | admin | Retry failed Stripe payout |
| GET | `/api/admin/payouts/automation/history` | admin | Batch payout audit log |

---

## Schedule Configuration

| Schedule Type | Timing | Use Case |
|---------------|--------|----------|
| `weekly` | Next Monday at 09:00 | High-volume providers |
| `monthly` | 1st of next month at 09:00 | Low-volume or compliance |
| `manual` | No automatic run | Admin-triggered only |

---

## Failed Payout Handling

When a Stripe transfer fails:
1. Wallet balance is **restored** (`available_balance += amount`, `held_balance -= amount`)
2. `payout_requests.status` set to `'rejected'` with error message
3. Appears in admin retry queue
4. Admin retries via `POST /api/admin/payouts/:id/retry`

---

## Safety Guarantees

- **Atomic** — every payout uses `FOR UPDATE` wallet lock + transaction
- **Idempotent** — `payout_batch_id` on `payout_requests` prevents double execution
- **Non-destructive** — failed Stripe transfers always restore wallet balance
- **Audited** — every batch logged to `audit_logs` with full result JSON
- **Stripe optional** — service degrades gracefully to manual approval flow

---

## Monitoring

`GET /api/admin/payouts/automation/health`:
```json
{
  "pendingCount": 3,
  "pendingAmountUsd": 1250.00,
  "failedCount": 1,
  "failedAmountUsd": 85.00,
  "last24hPaid": 12,
  "last24hAmountUsd": 4320.50,
  "frozenWallets": 0,
  "providersWithSchedule": 28,
  "providersEligibleNow": 5
}
```
