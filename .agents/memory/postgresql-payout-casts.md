---
name: PostgreSQL payout casts
description: Explicit SQL casts required for parameterized negative arithmetic in payout wallet updates.
---

Parameterized negative arithmetic in PostgreSQL should use an explicit numeric cast, such as `-$2::numeric`, rather than relying on `-$2` inference. The latter can resolve as an ambiguous unary operator and fail at runtime with SQLSTATE 42725.

**Why:** A provider payout request reached the transaction but failed before wallet movement because PostgreSQL could not infer the type of a negative parameter in the wallet update expression.

**How to apply:** Cast payout and ledger arithmetic parameters to `numeric` at the SQL expression site, especially in `INSERT ... VALUES` and `ON CONFLICT DO UPDATE` wallet balance calculations.