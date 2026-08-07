---
name: Provider ledger currency invariant
description: Currency invariant for provider wallet balances, ledger entries, and reconciliation
---

Provider wallet balances and provider ledger amounts are accounting values in USD. Native booking-currency tax, platform-fee, service, or payout snapshots must be converted to USD before they are written to provider_ledger or used in wallet arithmetic.

**Why:** Reconciliation found ledger rows such as a `-1620.00` tax deduction against a USD wallet, producing large false wallet drift and risking incorrect provider balances.

**How to apply:** Treat `provider_wallets`, `provider_ledger`, `provider_earnings` settlement fields, and payout requests as USD unless a field explicitly says it is a display/local snapshot. Verify every ledger write against the booking currency and conversion rate.