---
name: Stripe webhook idempotency schema compatibility
description: Legacy deployments may have a different idempotency_keys shape than the current migration
---

Stripe webhook event claiming must insert only the portable `key`, `scope`, and `expires_at` fields and use an untargeted `ON CONFLICT DO NOTHING`.

**Why:** Some deployed databases use `response_status` plus a unique `key`, while the current migration defines `status` plus a `(key, scope)` key. Referencing either the newer status column or conflict target makes webhook deduplication silently fall back to process memory.

**How to apply:** Keep webhook claiming independent of response-storage fields; verify the live claim row is written in integration coverage before relying on cross-restart or multi-instance deduplication.