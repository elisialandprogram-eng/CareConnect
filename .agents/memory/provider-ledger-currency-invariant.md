---
name: Provider ledger currency invariant
description: Currency invariant for provider wallet balances, ledger entries, and reconciliation
---

Provider wallet balances and provider ledger amounts are accounting values in USD. Native booking-currency tax, platform-fee, service, or payout snapshots must be converted to USD before they are written to provider_ledger or used in wallet arithmetic.

**Why:** Reconciliation found ledger rows such as a `-1620.00` tax deduction against a USD wallet, producing large false wallet drift and risking incorrect provider balances.

**How to apply:** Treat `provider_wallets`, `provider_ledger`, `provider_earnings` settlement fields, and payout requests as USD unless a field explicitly says it is a display/local snapshot. Verify every ledger write against the booking currency and conversion rate.

Manual wallet adjustments must write the signed USD delta (negative for a debit), use a balance-affecting ledger type, and populate `currency`, `amount_usd`, `country_code`, and `balance_after`.

**Why:** An admin debit recorded as a positive amount or an unrecognized entry type makes the wallet snapshot disagree with the append-only ledger and can trigger false audit drift.

**How to apply:** Keep adjustment validation and the wallet update in the same accounting path; never silently swallow a failed ledger insert after changing the balance.