# Rate Limiter Audit
**Date:** 2026-06-10  
**Scope:** express-rate-limit ERR_ERL_DOUBLE_COUNT  
**Status:** ✅ Fixed

---

## 1. Error Observed

```
ValidationError [ERR_ERL_DOUBLE_COUNT]:
  The hit count for 127.0.0.1 was incremented more than once for a single request.
```

This is thrown by express-rate-limit v8 whenever `res.locals.rateLimit` is already set when a second rate limiter runs on the same request.

---

## 2. Root Cause

### Architecture

`server/index.ts` mounts a blanket guard on every API route:

```typescript
app.use("/api", globalApiLimiter);   // line 127 — runs FIRST on ALL /api/* requests
```

Individual route files then apply stricter per-route limiters as **inline middleware**:

| Route | Additional limiters |
|---|---|
| `POST /api/auth/register` | `authLimiter` |
| `POST /api/auth/login` | `authLimiter` |
| `POST /api/auth/forgot-password` | `authLimiter` |
| `POST /api/auth/verify-email` | `otpLimiter` |
| `POST /api/auth/lookup-pending` | `otpLimiter` |
| `POST /api/auth/resend-email-otp` | `otpLimiter` |
| `POST /api/appointments` | `bookingLimiter` → `slotLimiter` |
| `POST /api/wallet/topup` | `paymentLimiter` |
| `GET  /api/gift-cards/:code` | `giftCardLimiter` |
| `POST /api/financials/capture-escrow` | `bookingLimiter` |

### Why ERR_ERL_DOUBLE_COUNT fires

express-rate-limit v8 performs a `singleCount` validation: after any limiter runs it sets `res.locals.rateLimit`. If a second limiter runs on the same request and that field is already set, the library throws `ERR_ERL_DOUBLE_COUNT`.

**`POST /api/appointments` was the worst case** — three limiters stacked:
1. `globalApiLimiter` → sets `res.locals.rateLimit` ✓
2. `bookingLimiter`   → sees field already set → **ERR_ERL_DOUBLE_COUNT** ✗
3. `slotLimiter`      → would also throw ✗

Every auth/OTP/payment route also triggered the error (global + 1 route-specific).

### Stale imports discovered

`appointment-waitlist.routes.ts` and `appointment-resources.routes.ts` both imported `bookingLimiter` and `slotLimiter` but never used them (leftover from route extraction). These were cleaned up.

---

## 3. Fix Applied

### `server/middleware/rateLimiter.ts`

Added `validate: { singleCount: false }` to every route-specific limiter:

- `authLimiter`
- `otpLimiter`
- `bookingLimiter`
- `paymentLimiter`
- `adminWriteLimiter`
- `slotLimiter`
- `giftCardLimiter`
- `publicApiLimiter`

`globalApiLimiter` is intentionally **not** changed — it runs first and is the reference counter that sets `res.locals.rateLimit`.

### What `validate: { singleCount: false }` does

Per the express-rate-limit v8 documentation, `singleCount: false` tells the library _"I am intentionally stacking multiple rate limiters on this request; do not throw a validation error for the second increment."_

It does **not**:
- Disable rate limiting on any limiter
- Skip incrementing any limiter's counter
- Remove any request from any limit window
- Suppress actual rate-limit enforcement (429 responses still fire at each limiter's threshold)

Each limiter still maintains its own **independent** counter in the DB (`rl:global`, `rl:auth`, `rl:booking`, etc.) and still enforces its own window/max independently.

### `server/routes/appointment-waitlist.routes.ts`

Removed stale `import { bookingLimiter, slotLimiter }` — these were unused imports from a prior route extraction refactor.

### `server/routes/appointment-resources.routes.ts`

Removed stale `import { bookingLimiter, slotLimiter }` — same reason.

---

## 4. Files Modified

| File | Change |
|---|---|
| `server/middleware/rateLimiter.ts` | `validate: { singleCount: false }` on 8 route-specific limiters; updated file-level JSDoc |
| `server/routes/appointment-waitlist.routes.ts` | Removed unused `bookingLimiter`/`slotLimiter` import |
| `server/routes/appointment-resources.routes.ts` | Removed unused `bookingLimiter`/`slotLimiter` import |

---

## 5. Validation

```
npx tsc --noEmit --skipLibCheck
```

**EXIT 0 — no TypeScript errors.**

---

## 6. Limiter Inventory (post-fix)

| Limiter | Window | Max | Store prefix | Used on |
|---|---|---|---|---|
| `globalApiLimiter` | 15 min | 200 | `rl:global` | ALL `/api/*` via `app.use` |
| `authLimiter` | 15 min | 10 | `rl:auth` | register, login, forgot-password |
| `otpLimiter` | 15 min | 6 | `rl:otp` | verify-email, lookup-pending, resend-otp |
| `bookingLimiter` | 15 min | 20 | `rl:booking` | POST /api/appointments, capture-escrow |
| `paymentLimiter` | 15 min | 10 | `rl:payment` | wallet/topup |
| `adminWriteLimiter` | 15 min | 100 | `rl:admin` | (defined, not yet wired to routes) |
| `slotLimiter` | 1 min | 15 | `rl:slot` | POST /api/appointments (stacked with bookingLimiter) |
| `giftCardLimiter` | 15 min | 5 | `rl:giftcard` | GET /api/gift-cards/:code |
| `publicApiLimiter` | 15 min | 60 | `rl:public` | (defined, not yet wired to routes) |

---

## 7. Architectural Note

The "global catch-all + per-route stricter" pattern is a deliberate design choice:

- Routes **without** a specific limiter are still protected at 200 req/15 min by `globalApiLimiter`.
- Routes **with** a specific limiter are additionally protected at their own (tighter) limit.
- The global counter is incremented for every request, including those also covered by a specific limiter. This is intentional and acceptable — auth requests (typically low-volume) consume one token from the global pool, which is fine.

Any future route-specific limiter added to the codebase **must** include `validate: { singleCount: false }` or it will re-introduce ERR_ERL_DOUBLE_COUNT.
