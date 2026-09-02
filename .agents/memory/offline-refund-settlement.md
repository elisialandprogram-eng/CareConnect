---
name: Offline refund settlement
description: Accounting invariant for cash and bank-transfer refunds after provider settlement
---

Cash and bank-transfer refunds must reverse the proportional provider-wallet deductions for platform fee, platform tax, and commission. Keep original settlement snapshots immutable; track cumulative reversals separately and write positive reversal ledger entries inside the same transaction as the patient refund.

**Why:** Offline bookings debit the provider wallet only after receipt/completion. Without a reversal, a refunded booking leaves the provider charged and the platform funds the patient credit. A completion retry must also reject fully refunded payments.

**How to apply:** Base proportional reversal on cumulative refunded offline allocation divided by its original allocation amount. Use refund/payment idempotency plus cumulative reversal columns so retries and partial refunds cannot double-credit the provider wallet.