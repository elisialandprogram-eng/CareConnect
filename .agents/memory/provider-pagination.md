---
name: Provider list pagination
description: How the /api/providers endpoint and storage layer handle server-side pagination
---

## Rule
`storage.searchProviders()` returns `{ rows: ProviderWithUser[], total: number }` — NOT a plain array.
`GET /api/providers` response shape is `{ providers: [], total, page, limit, totalPages }`.
Frontend `providers.tsx` uses `ProvidersPage` interface and `result?.providers ?? []`.

## Why
Changed from array to paginated object to support true server-side pagination with total count,
enabling numbered pagination controls on the provider listing page. Count is done in parallel
with the data fetch to avoid N+1 round-trips.

## How to apply
- Any new caller of `storage.searchProviders()` must destructure `{ rows, total }`.
- Any component/page fetching `/api/providers` must type the response as `ProvidersPage`.
- Page size default is 12 (PAGE_SIZE constant in providers.tsx).
- After changing routes.ts, a full server restart is required — tsx hot-reload doesn't always
  pick up changes to that file.
