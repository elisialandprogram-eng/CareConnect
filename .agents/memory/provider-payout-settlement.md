---
name: Provider payout settlement
description: Provider payout accounting rules for tax pass-through, deferred offline fees, and lifecycle safety.
---

Provider gross payout is service earnings plus patient-paid service tax. Card and wallet payouts credit provider gross income; cash and bank-transfer appointments create no wallet income, but once receipt is recorded they debit the provider wallet for the booking's platform fee, platform tax, and commission.

**Why:** Offline patients pay the provider directly, so the platform must settle its fee, platform tax, and commission from the provider wallet without creating a second wallet credit.

**How to apply:** Keep immutable booking snapshots in booking currency and convert each offline obligation to USD once inside the receipt transaction. Use the latest payment row, falling back to the appointment method, when classifying offline history. Use the shared payout lifecycle for held/paid/rejected/cancelled transitions. The wallet-debit marker is authoritative; payout creation must reconcile any older cash earning whose receipt debit was missed, covering platform fee, platform tax, and commission exactly once.

Payout requests retain the legacy aggregate cash deduction for compatibility and also store explicit platform-tax and commission components for approval screens, exports, and reconciliation.

**Why:** A single field labeled as a platform fee obscures the actual deductions and makes payout review harder, even when the wallet ledger is correct.

**How to apply:** Keep the aggregate total synchronized with the explicit components whenever deductions are applied during manual or automated payout creation, or during a later payout lifecycle reconciliation.

Provider-facing earnings statements must exclude patient platform fee, platform/service tax, gateway/surcharge, and patient total/price-line data; expose only provider gross earnings, actual provider-side deductions, net earnings/settlement, and payment status/method.

**Why:** Provider screens and APIs are not patient invoices. Exposing patient-side components or relabeling them as provider deductions creates a privacy leak and misleading settlement arithmetic.

**How to apply:** Build provider booking details, earnings APIs, exports, emails, notifications, and wallet breakouts from immutable provider settlement snapshots; keep patient `pricing_breakdown.lines` and stored patient totals confined to patient/admin surfaces.