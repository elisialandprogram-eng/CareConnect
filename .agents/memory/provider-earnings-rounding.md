---
name: Provider earnings local-currency rounding
description: Provider earnings waterfall must use booking-currency snapshots for local display values.
---

Provider earnings UI must use the original booking-currency Revenue Engine snapshots for service net and patient tax when displaying HUF/IRR/EUR. Do not reconstruct those lines by converting rounded USD settlement values back into local currency.

**Why:** USD settlement snapshots are canonical for accounting, but round-trip conversion can change exact booking values such as 960 + 270 into 959 + 271, creating visible disagreement with the booking price detail.

**How to apply:** Keep gross/net payout tied to canonical settlement snapshots, while service net and tax display use `pricingBreakdown.providerEarnings` and the appointment tax snapshot in the selected booking currency.