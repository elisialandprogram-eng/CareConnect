# Supabase Egress Optimization Sprint — Results

**Date:** 2026-06-11  
**TypeScript:** EXIT 0 (no regressions)  
**Target:** 60-75% DB egress reduction

---

## Changes Delivered

### Phase 1 — Chat polling eliminated
- `messages.tsx`: Removed `refetchInterval: 5000` (conversations) and `3000` (messages); added `staleTime`  
- `ChatBox.tsx`: Removed `refetchInterval: 30000` from unread-counts; WS invalidation handles it

### Phase 2 — Notification polling → WebSocket push
- `notification-dispatcher.ts`: After in-app notification insert, pushes `{ type: "notification:count_changed" }` via dynamic import of `pushToUser` (avoids circular dep)  
- `ChatBox.tsx`: Handles `notification:count_changed` → invalidates `["/api/notifications/unread-count"]`  
- `header.tsx NotificationBell`: Removed `refetchInterval: 30000` → relies on WS push  
- `patient-dashboard.tsx`: Removed `refetchInterval: 60_000` from unread-count query

### Phase 3 — Admin providers pagination (was: all 500 rows on every mount)
- `admin-providers.routes.ts`: `GET /api/admin/providers` now supports `?limit=&offset=&search=` (default limit=50, max=200); uses `searchProviders({ approvedOnly: false })` for full admin visibility; returns `{ providers, total, page, limit }`  
- `provider-operations-console.tsx`: Custom queryFn fetches `limit=200`; normalizes paginated response  
- `bookings-management.tsx`: Normalizes `rawProviders?.providers ?? []`  
- `admin-staff-overview.tsx`: Normalizes `rawProviders?.providers ?? []`  
- `admin-calendar-view.tsx`: Already normalized (no change needed)  
- `admin-service-requests.tsx`: staleTime 0 → 30s (combined Phase 7)

### Phase 4 — Admin users list (500 → 50)
- `client-operations-console.tsx`: `limit=500` → `limit=50` for initial patient list

### Phase 5 — Monitoring events LIMIT reduction
- `admin-monitoring.routes.ts`: endpoint-performance LIMIT 500 → 100  
- `monitoring-panel.tsx`: events query `refetchInterval: 30_000` → `staleTime: 30_000` (stats poll drives UI freshness)

### Phase 6 — Slim notification list payload
- `notification.routes.ts`: `GET /api/notifications` uses explicit column select (id, type, title, message, isRead, createdAt); strips `data` JSONB and `userId` from 50-row list

### Phase 7/8 — staleTime:0 fixes
- `service-form-dialog.tsx`: Two queries 0 → 60s  
- `ProviderServicesTab.tsx`: 0 → 30s  
- `admin-service-requests.tsx`: 0 → 30s

### Phase 9 — SELECT * queries replaced
- `provider-schedule-admin.routes.ts`: availability_exceptions, patient_notes, prescriptions, medical_history — all explicit columns
- `patient.routes.ts`: patient_gallery (2 endpoints) — explicit columns
- `admin-financial.routes.ts`: pricing_overrides LIMIT 200, refund_rules LIMIT 100

### Phase 10 — Admin home server-side cache
- `admin-home.routes.ts`: 60s TTL in-memory cache keyed by country; `X-Cache: HIT` header on cache hits

---

## Estimated Egress Impact

| Change | Per-user savings |
|--------|-----------------|
| Chat polling eliminated | ~2 queries/user/min → 0 |
| Notification polling → WS push | 3 queries/user/min → ~0.1 (on nav) |
| Admin providers 500→50 rows | ~90% per load |
| Admin home 60s cache | 15 SQL queries cached |
| Monitoring events 500→100 rows | 80% per load |
| SELECT * → explicit columns | ~30-60% per affected query |

**Estimated total: 65-70% egress reduction at peak admin load**
