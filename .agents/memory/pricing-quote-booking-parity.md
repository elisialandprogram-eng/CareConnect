---
name: Pricing quote and booking parity
description: Promo eligibility and final booking must use identical pre-promo pricing inputs and currency normalization.
---

The pricing quote and final appointment creation paths must evaluate promo minimums against the same pre-promo taxable subtotal: practitioner-adjusted service price, visit/platform fees, membership/package adjustments, and booking currency conversion, while excluding tax and payment-method adjustments. Exchange rates must be initialized before promo eligibility logic, and the Revenue Engine remains authoritative for the final charged amount.

**Why:** A checkout drawer can show a valid promo and a discounted quote while final booking silently accepts or rejects it differently if either path uses a raw service price, a different currency, or a payment-adjusted total.

**How to apply:** When changing promo validation, update `/api/pricing/quote`, `/api/promo-codes/validate`, and `POST /api/appointments` together; prefer a shared pre-promo calculation helper if the logic grows further.