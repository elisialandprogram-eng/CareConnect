---
name: Provider payout settlement
description: Provider payout accounting rules for tax pass-through, deferred offline fees, and lifecycle safety.
---

Provider gross payout is service earnings plus patient-paid tax. Card and wallet payouts do not deduct the platform fee again; cash and bank-transfer appointments remain audit-visible but create no provider-wallet credit, withdrawable payout, or booking_income ledger income.

**Why:** Offline payments cannot reliably collect the platform fee at booking time, while tax is a provider pass-through. Applying either amount through legacy booking debits caused misleading provider statements and double deductions.

**How to apply:** Keep settlement snapshots in USD on provider earnings and payout requests. Use the latest payment row, falling back to the appointment method, when classifying offline history during reconciliation or cleanup. Use the shared payout lifecycle for held/paid/rejected/cancelled transitions. Run settlement-column DDL independently before the legacy startup backfill; the backfill may remain in the legacy chain, but schema ownership must stay single-source.

Provider-facing earnings statements must keep patient platform fee, provider commission, provider service net, tax pass-through, gross payout, offline fee, and actual net payout as separate labels; summary cards, rows, exports, and payout totals must use actual net payout consistently.

**Why:** Combining fee and commission into “platform take,” or showing gross provider earning as net payout, made otherwise correct arithmetic appear inconsistent and could double-subtract offline fees.

**How to apply:** Display `gross payout - offline fee` as actual net payout; only cash and bank-transfer methods receive the offline deduction. Keep card and wallet settlement unchanged.