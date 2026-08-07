---
name: apiRequest returns Response not JSON
description: apiRequest() returns a raw fetch Response — callers must call .json() to get parsed data
---

## Rule
`apiRequest(method, url, body?)` in `client/src/lib/queryClient.ts` returns a `Promise<Response>`, not parsed JSON.

Mutation `mutationFn`s that need the response body **must** parse it explicitly:

```tsx
// CORRECT
const cloneWeekMut = useMutation({
  mutationFn: async (target: string) => {
    const res = await apiRequest("POST", "/api/availability/clone", { ... });
    return res.json() as Promise<{ clonedCount: number; ... }>;
  },
  onSuccess: (data) => {
    // data is now { clonedCount: 5, ... } ✓
  },
});

// WRONG — data in onSuccess is a Response object; data?.clonedCount is always undefined
const cloneWeekMut = useMutation({
  mutationFn: (target: string) => apiRequest("POST", "/api/availability/clone", { ... }),
  onSuccess: (data: any) => { /* data?.clonedCount === undefined */ },
});
```

**Why:** apiRequest only throws on non-ok responses; it does not auto-parse JSON. This matches the pattern used in `bulkAvailabilityMutation` in provider-dashboard.tsx (reference implementation).

**How to apply:** Whenever a mutation needs fields from the API response (counts, IDs, etc.), always `await res.json()` inside the mutationFn. If the response body is irrelevant, the bare `apiRequest(...)` return is fine.
