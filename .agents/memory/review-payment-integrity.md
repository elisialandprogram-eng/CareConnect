---
name: Review and gift-card integrity
description: Durable rules for moderated reviews and atomic gift-card wallet movements.
---

Review publication and provider ratings must use approved reviews only. New patient reviews start pending, existing rows are safely backfilled approved, and moderation changes must recompute the provider aggregate.

**Why:** Public ratings must not change before moderation, while legacy reviews should remain visible after the migration.

**How to apply:** Keep public/provider queries approved-only, expose moderation status in patient history, and keep admin approve/reject actions country-scoped.

Gift-card purchase and redemption must update the gift-card row and USD wallet ledger atomically with an idempotency key. Redemption is a credit and must work for a zero-balance wallet.

**Why:** A wallet or card update without its matching ledger entry can lose value or double-credit during retries or concurrent requests.

**How to apply:** Lock the gift-card and wallet rows in one transaction, insert exactly one ledger movement, commit both state changes together, and roll back all validation failures.