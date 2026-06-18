# P1 — Financial Reconciliation
**Sprint:** P1 Launch Blockers | **Workstream:** 4 — Financial Reconciliation  
**Status:** ✅ Implemented | **Date:** 2026-06-11

---

## Overview

The full reconciliation engine runs 7 independent financial integrity checks and returns structured findings with severity levels. All checks are **read-only** — no data is mutated.

---

## Endpoint

```
GET /api/admin/financial/reconciliation/full
Auth: global_admin + PAYMENTS_VIEW permission
```

Response:
```json
{
  "generatedAt": "2026-06-11T12:00:00Z",
  "durationMs": 1450,
  "overallStatus": "healthy|warning|critical",
  "criticalCount": 0,
  "highCount": 0,
  "mediumCount": 1,
  "checks": [...],
  "summary": {
    "totalProviderWalletBalance": 45230.50,
    "totalLedgerBalance": 45230.50,
    "walletLedgerDrift": 0.00,
    "totalPendingPayouts": 2100.00,
    "totalCompletedPayoutsLast30d": 18450.00,
    "totalOrphanedPayments": 0,
    "frozenWallets": 0
  }
}
```

---

## 7 Integrity Checks

### 1. `wallet_ledger_drift` (Severity: critical/high/ok)
Compares each `provider_wallets.available_balance` against the sum of all `provider_ledger.amount` entries for that provider.

- **Threshold:** `> $0.05 USD`  
- **Critical:** Any drift `> $10.00`
- **Existing auto-freeze:** `wallet-audit.ts` cron already auto-freezes wallets with drift `> $0.05`

### 2. `negative_balances` (Severity: critical/ok)
Finds provider wallets where `available_balance`, `held_balance`, or `pending_balance` is negative.

- **Always critical** — negative balances indicate a financial integrity bug
- Action: Freeze wallet immediately, investigate ledger

### 3. `duplicate_payouts` (Severity: critical/ok)
Finds `payout_requests` where the same `provider_id + payout_batch_id` has more than one approved/paid record.

- **Always critical** — indicates batch idempotency failure
- Action: Review and reject duplicates immediately

### 4. `orphaned_payments` (Severity: high/medium/ok)
Finds `payments` with `status='completed'` and an `appointment_id` but no corresponding `provider_earnings` row.

- **Lookback:** Last 90 days
- **High:** > 10 orphaned payments
- Action: Run `recordProviderEarning` for each affected appointment

### 5. `marketplace_ledger_balance` (Severity: high/medium/ok)
Checks double-entry balance of `marketplace_ledger` in the last 30 days:
- Platform IN: `PLATFORM_FEE + COMMISSION`
- Platform OUT: `PROVIDER_WITHDRAWABLE + REFUND + EXTERNAL_BANK`

- **High:** imbalance `> $100`
- **Medium:** imbalance `$10–$100`

### 6. `revenue_snapshot_consistency` (Severity: high/medium/ok)
Compares `appointments.total_amount` against the corresponding `payments.amount` for completed appointments.

- **Threshold:** `> $0.50` discrepancy
- **High:** > 5 affected appointments
- Action: Investigate booking creation — possible revenue engine bypass

### 7. `patient_wallet_imbalance` (Severity: high/medium/ok)
Compares `wallets.balance_usd` against `SUM(wallet_transactions.amount)` per patient.

- **Threshold:** `> $0.01`
- **High:** > 5 affected wallets
- Action: Manual wallet adjustment + transaction audit

---

## Status Levels

| Status | Meaning |
|--------|---------|
| `healthy` | No critical or high severity findings |
| `warning` | At least one `high` severity finding |
| `critical` | At least one `critical` severity finding → requires immediate action |

---

## Existing Reconciliation

The platform also has:

| Route | Description |
|-------|-------------|
| `POST /api/admin/financial/reconcile` | Spot-checks `provider_earnings` against canonical formula; supports `?apply=true` for correction |
| `GET /api/admin/financial/reconciliation` | Financial health summary |
| Hourly cron: `ledger-reconcile.ts` | Logs findings to `reconciliation_results` |
| Hourly cron: `wallet-audit.ts` | Auto-freezes wallets with drift > $0.05 |

The new full reconciliation endpoint adds 7 deeper checks that the hourly crons don't cover.

---

## Recommended Schedule

| Check | Frequency |
|-------|-----------|
| `wallet_ledger_drift` | Hourly (already done by cron) |
| `negative_balances` | Every 15 minutes |
| `duplicate_payouts` | After every batch run |
| `orphaned_payments` | Daily |
| `marketplace_ledger_balance` | Daily |
| `revenue_snapshot_consistency` | Weekly |
| `patient_wallet_imbalance` | Daily |
