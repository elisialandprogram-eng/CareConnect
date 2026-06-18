---
name: Admin API shape normalization
description: Several admin API endpoints return paginated wrapper objects instead of plain arrays. Consuming components must normalize them.
---

## Rule
Do NOT assume an admin API endpoint returns a plain array. Always normalize at the consumption point.

## Known non-array shapes

| Endpoint | Actual shape | Safe normalization |
|----------|-------------|-------------------|
| `/api/admin/bookings` | `{ bookings, total, page, limit }` or plain array | `Array.isArray(d) ? d : d?.bookings ?? d?.appointments ?? []` |
| `/api/providers` | `{ providers, total, page, limit, totalPages }` | `data?.providers ?? []` |
| `/api/admin/wallets` | `{ wallets, total }` | `data?.wallets ?? []` |

## Anti-pattern that causes crashes
```tsx
const { data: bookings } = useQuery<any[]>({ queryKey: ["/api/admin/bookings"] });
bookings?.filter(...)  // TypeError: filter is not a function — data is an object
```

## Correct pattern
```tsx
const { data: raw } = useQuery<any>({ queryKey: ["/api/admin/bookings"] });
const bookings: any[] = Array.isArray(raw) ? raw : raw?.bookings ?? raw?.appointments ?? [];
bookings.filter(...)  // safe
```

**Why:** The admin bookings endpoint was paginated in an earlier sprint. The type annotation `useQuery<any[]>` hides the shape mismatch at compile time, causing a silent runtime crash.
