---
name: Provider payout settlement
description: Provider payout accounting rules for tax pass-through, deferred offline fees, and lifecycle safety.
---

Provider gross payout is service earnings plus patient-paid tax. Card and wallet payouts do not deduct the platform fee again; cash and bank-transfer appointments remain audit-visible but create no provider-wallet credit, withdrawable payout, or booking_income ledger income.

**Why:** Offline payments cannot reliably collect the platform fee at booking time, while tax is a provider pass-through. Applying either amount through legacy booking debits caused misleading provider statements and double deductions.

**How to apply:** Keep settlement snapshots in USD on provider earnings and payout requests. Use the latest payment row, falling back to the appointment method, when classifying offline history during reconciliation or cleanup. Use the shared payout lifecycle for held/paid/rejected/cancelled transitions. Run settlement-column DDL independently before the legacy startup backfill; the backfill may remain in the legacy chain, but schema ownership must stay single-source.

Provider-facing earnings statements must exclude patient platform fee, platform/service tax, gateway/surcharge, and patient total/price-line data; expose only provider gross earnings, actual provider-side deductions, net earnings/settlement, and payment status/method.

**Why:** Provider screens and APIs are not patient invoices. Exposing patient-side components or relabeling them as provider deductions creates a privacy leak and misleading settlement arithmetic.

**How to apply:** Build provider booking details, earnings APIs, exports, emails, and notifications from immutable provider settlement snapshots; keep patient `pricing_breakdown.lines` and stored patient totals confined to patient/admin surfaces.