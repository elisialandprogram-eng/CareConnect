---
name: Payment status action values
description: The provider cash-payment action API uses action values distinct from persisted payment statuses.
---

# Payment Status Action Values

**Rule:** The provider payment-receipt endpoint accepts `paid`, `pending`, or `failed`; `paid` is an action input and the server persists the payment as `completed`.

**Why:** The provider UI previously sent the persisted status value `completed`, causing the endpoint validation to reject cash and bank-transfer receipt updates.

**How to apply:** Keep UI mutations aligned with the endpoint's accepted action values; do not substitute database enum values for request command values.