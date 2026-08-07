---
name: Ledger reconcile patterns
description: Entry types, drift detection, and cron COUNT window for provider_ledger / marketplace_ledger reconciliation
---

## Canonical provider_ledger entry types

The actual entry types in production are **not** the original `earning`/`adjustment`/`payout`/`reversal` set. The real types are:

| Type | Sign stored | Treatment in net calc |
|---|---|---|
| `booking_income` | positive | use `pl.amount` |
| `tax_deduction` | **negative** | use `pl.amount` (already signed) |
| `payout_returned` | positive | use `pl.amount` |
| `earning` | positive | use `pl.amount` |
| `adjustment` | positive (corrective entries) | use `pl.amount` |
| `refund` | positive | use `pl.amount` |
| `payout` | positive | use `-pl.amount` (negate) |
| `reversal` | positive | use `-pl.amount` (negate) |
| `fee` | positive | use `-pl.amount` (negate) |

**Why:** The original reconcile CASE only handled `earning`/`adjustment` (positive) and `payout`/`reversal` (negated). All real production entries (`booking_income`, `tax_deduction`, `payout_returned`) fell into `ELSE 0`, making `ledger_net` always appear as 0 and flagging every provider as drifted.

**How to apply:** Use this SIGNED expression everywhere wallet drift is calculated (cron AND startup backfill must use the same expression):

```sql
CASE WHEN pl.entry_type IN ('earning','adjustment','booking_income',
                             'payout_returned','refund','tax_deduction')
          THEN pl.amount
     WHEN pl.entry_type IN ('payout','reversal','fee')
          THEN -pl.amount
     ELSE 0 END
```

## Reconcile COUNT window pattern

The cron tracks findings count using `runStart = new Date()` captured before any checks run, then queries:
```sql
SELECT COUNT(*) FROM reconciliation_results WHERE run_at >= $1 AND severity != 'ok'
```
**Why:** Using `NOW() - INTERVAL '65 minutes'` accumulated findings from previous runs that were still in the window, making the cron always report N×previous_findings even when current run found nothing.

## Startup backfill race condition

`runStartupMigrations()` is fire-and-forget. The reconcile cron also fires immediately on startup. The cron runs ~3 seconds before the backfill completes (all the IF NOT EXISTS migration steps take time). 

Result: on first boot after a drift is fixed by backfill, the startup cron run will still see 2 warnings. The NEXT hourly cron run will be clean (0 findings). This is acceptable — it's a one-time event per fix cycle.

**How to apply:** If you see wallet drift warnings on ONLY the first cron run after a restart, it's the race condition — not a persistent bug. Verify by checking if manual backfill script finds 0 drifters.

## Backfill must handle existing-entries drift

The original backfill checked `NOT EXISTS (SELECT 1 FROM provider_ledger WHERE provider_id = ...)`. Providers with existing entries but incorrect nets were invisible to it.

The correct check: use the SIGNED HAVING clause (same as the cron). If delta > 0.01, insert an `adjustment` entry for the delta amount. This is idempotent: subsequent runs see 0 drift and insert nothing.
