---
name: Provider list caching
description: In-process TTL caches for provider listings and search results
---

## Rule
Two caches in `server/lib/cache.ts`:
- `providerListCache` — 30s TTL, keyed `list:{country}:{page}:{pageSize}` — for unfiltered listings
- `providerSearchCache` — 2min TTL, keyed `search:{country}:{q}:{type}:{city}:{verifiedOnly}:{page}:{pageSize}` — for filtered search

## Why
Reduces repeated DB queries on burst traffic. Cache keys include country code to prevent
cross-country data leakage (country isolation requirement).

## How to apply
Both caches must be cleared (`providerListCache.clear(); providerSearchCache.clear()`) whenever:
- Admin updates a provider (`PATCH /api/admin/providers/:id`)
- Admin deletes a provider (`DELETE /api/admin/providers/:id`)
- Provider completes self-service setup (`POST /api/provider/setup`)
Never serve cached data across country boundaries — always include country in the cache key.
