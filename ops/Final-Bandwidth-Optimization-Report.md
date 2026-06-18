# Bandwidth Optimization & Platform Validation Sprint — Final Report

**Date:** 2026-06-11
**Status:** ✅ Complete

---

## Executive Summary

A 9-phase sprint to reduce server-side egress, client-side network chatter, and
admin-triggered document downloads — with no new user-visible features.

---

## Phase 1 — Image Lazy Loading

**Goal:** Stop the browser from fetching provider avatars and doc thumbnails that
are below the fold on first render.

| File | Change |
|---|---|
| `client/src/pages/book-wizard.tsx` | `loading="lazy"` on provider avatar `<img>` |
| `client/src/pages/patient-home.tsx` | `loading="lazy"` on provider card avatar |
| `client/src/pages/patient-dashboard.tsx` | `loading="lazy"` on provider avatar |
| `client/src/components/chat/ChatBox.tsx` | `loading="lazy"` on avatar `<img>` |
| `client/src/components/admin/ProviderReviewQueue.tsx` | Image only rendered after click (Phase 2) |

**Estimated saving:** 40–200 KB per page load depending on provider list length.

---

## Phase 2 — Document Preview Hardening (Click-to-Reveal)

**Goal:** Prevent license document images from auto-loading when admins open the
verification queue.

| File | Change |
|---|---|
| `client/src/components/admin/ProviderReviewQueue.tsx` | `LicenseDocPreview` component: renders a placeholder until admin clicks "Click to preview document"; image tagged `loading="lazy"` once revealed |
| `client/src/components/admin/document-queue.tsx` | Already gated behind Dialog open state (no change needed) |

**Estimated saving:** 100–500 KB per verification queue load (avoids loading every
provider's license doc upfront).

---

## Phase 3 — React Query Stale-Time & Focus-Refetch Audit

**Goal:** Stop React Query from refetching reference/config data on every window
focus event and on reconnect.

| File | Change |
|---|---|
| `client/src/lib/queryClient.ts` | Added `REFERENCE_PREFIXES` (staleTime 10 min): `/api/categories`, `/api/exchange-rates`, `/api/payment-providers`, `/api/packages`, `/api/services/catalogue`, `/api/sub-services` |
| `client/src/lib/queryClient.ts` | Added `NO_REFOCUS_PREFIXES` (disables refetchOnWindowFocus): all admin, provider, patient endpoints |
| `client/src/lib/queryClient.ts` | `refetchOnReconnect: false` for all non-auth queries |
| `client/src/components/add-service-catalogue-dialog.tsx` | Fixed `staleTime: 0` → `staleTime: 10 * 60 * 1000` |

**Estimated saving:** 10–50 redundant API calls eliminated per active session.

---

## Phase 4 — Server-Side Reference Data Caching

**Goal:** Cache stable reference data in-process so database hits are avoided on
repeated reads.

| Cache | TTL | Route |
|---|---|---|
| `subServicesCache` | 10 min | `GET /api/sub-services` |
| `packagesCache` | 10 min | `GET /api/packages` |

Cache invalidation on every write (POST / PATCH / DELETE / clone) for both
resources. `getCacheStats()` now reports both caches.

Files changed: `server/lib/cache.ts`, `server/routes/catalog.routes.ts`,
`server/routes/patient.routes.ts`.

**Estimated saving:** Eliminates repeated DB queries for package/sub-service
lookups during booking flows (these are fetched by every patient and provider
session).

---

## Phase 5 — Admin Overfetch Review

All reviewed admin list endpoints already use server-side filtering and pagination
(limit/offset). No redundant full-table scans found. No changes needed.

---

## Phase 6 — WebSocket & Presence Polling Review

Provider presence poll interval is 25 seconds — within acceptable range. Chat WS
uses event-driven pushes (no polling). No changes needed.

---

## Phase 7 — Query Telemetry (Response Size Tracking)

**Goal:** Give the metrics endpoint visibility into response payload sizes so
high-egress routes can be identified in production.

| File | Change |
|---|---|
| `server/lib/requestMetrics.ts` | `RouteBucket` gains `totalBytes`; `recordRequest` accepts optional `bytes` param; `getMetricsSummary` returns `avgBytes`, `totalBytes`, `estimatedDailyKB` per route |
| `server/index.ts` | Response middleware captures `Content-Length` header or falls back to `JSON.stringify` byte count; passes `bytes` to `recordRequest` |

**How to use:** `GET /api/admin/metrics` (requires admin auth) now shows per-route
`avgBytes` and `estimatedDailyKB` — use this to find the next high-egress target.

---

## Phase 8 — TypeScript & Build Validation

TypeScript `--noEmit --skipLibCheck` check run. All sprint changes passed without
introducing new type errors. Server runs without startup errors (confirmed via
workflow logs).

---

## Phase 9 — Summary & Next Steps

### What was changed

1. **Lazy images** on 5 pages/components (browser defers off-screen image loads)
2. **Click-to-reveal** for license doc previews in admin verification queue
3. **React Query tuning** — 10-min stale time for reference data, no focus-refetch for admin/provider/patient endpoints
4. **Server caching** for `/api/packages` and `/api/sub-services` (10-min in-process TTL)
5. **Response-size telemetry** wired into the metrics endpoint

### What was not changed (intentional)

- WebSocket presence interval (25s is acceptable)
- Admin list endpoints (already paginated)
- Any product feature or UI flow

### Recommended next monitoring steps

1. Check `/api/admin/metrics` after a day of real traffic — look for routes with `estimatedDailyKB > 10 000` (10 MB/day) and target them next.
2. Consider adding HTTP `Cache-Control` headers on fully public endpoints
   (`/api/categories`, `/api/exchange-rates`) so browsers and CDN can cache them.
3. Consider compressing large admin list payloads (`/api/admin/bookings`,
   `/api/admin/providers`) with `compression` middleware if egress costs remain high.
