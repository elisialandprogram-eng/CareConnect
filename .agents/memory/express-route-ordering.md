---
name: Express route first-match pitfall
description: Literal path segments that share a prefix with a param route must be registered first or they become unreachable.
---

## Rule
When two routes share the same HTTP method and path prefix but one uses a param (`:id`) and the other uses a literal segment (e.g. `reorder`, `bulk`, `me`), the **literal must be registered first** in the file.

## Why
Express matches routes in registration order. If `PATCH /api/services/:id` appears at line 1742 and `PATCH /api/services/reorder` appears at line 2261, Express will match the string "reorder" as the value of `:id` for every `PATCH /api/services/reorder` request. The intended handler is never reached.

## Confirmed instances
- `PATCH /api/services/reorder` was shadowed by `PATCH /api/services/:id` — fixed in Sprint C11 by moving the reorder handler above the `:id` route.

## How to apply
- Before adding a new route with a literal segment like `/api/foo/bar`, grep for existing `app.{method}("/api/foo/:` registrations and confirm the new literal is inserted **before** any param route for the same method+prefix.
- When reviewing route files: if you see a literal-segment route registered after a param route with the same method+prefix, flag it immediately.
