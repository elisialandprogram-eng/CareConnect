---
name: Canonical settlement and readiness
description: Rules for settlement authority, migration readiness, and recurring job ownership after Phase 1 consolidation
---

The current settlement authority is `runRevenueEngine()` → `provider_earnings` → `provider_wallets`/`provider_ledger`; `marketplace_ledger` is historical compatibility data and must not be used for new settlement or current reconciliation checks. Provider wallet and ledger balances are USD, while booking/display values remain in their booking currency.

**Why:** Multiple legacy paths could otherwise create duplicate or conflicting financial records, and treating a listening HTTP port as fully ready allowed requests to race schema migrations.

**How to apply:** Keep `/health` degraded until startup migrations finish, register recurring jobs with the shared scheduler, and preserve independent migration guards for wallet/ledger compatibility changes.

Provider-ledger reconciliation must sum only signed balance-affecting movements. `platform_fee_deduction` and `tax_deduction` are informational settlement snapshots because `booking_income` already includes the provider gross payout; summing them again creates false drift. Missing appointment references should remain visible as classified historical/orphaned warnings, not be silently deleted or treated as active settlement.

**Why:** Historical rows included native-currency tax values mislabeled as USD and caused apparent wallet drift when informational rows were included in the net.

**How to apply:** Reuse the shared provider-ledger movement definitions for wallet audits, reconciliation SQL, and regression tests. Do not repair historical rows without an explicit data-repair decision.