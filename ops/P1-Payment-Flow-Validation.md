# P1 — Payment Flow Validation
**Sprint:** P1 Launch Blockers | **Workstream:** 6 — Payment Flow  
**Status:** ✅ Validated | **Date:** 2026-06-11

---

## Validation Summary

All 6 payment methods validated end-to-end. No blocking issues found.

---

## Payment Method Matrix

### 1. Stripe Card (Online)
**Path:** `POST /api/appointments` → `runRevenueEngine()` → Stripe Checkout session  
**Flow:**
1. Revenue engine calculates `patientPayable`
2. `stripe.checkout.sessions.create()` with amount in cents
3. Patient redirected to Stripe-hosted checkout
4. `POST /api/webhooks/stripe` receives `checkout.session.completed`
5. `payment.status = 'completed'`
6. `recordProviderEarning(appointmentId)` credits provider wallet

**Status:** ✅ OK  
**Risks:**
- Stripe optional at startup — graceful 502 if `STRIPE_SECRET_KEY` absent. Clear error returned.
- Webhook signature verified via `stripe.webhooks.constructEvent()`

---

### 2. Wallet Payment
**Path:** `POST /api/appointments` with `paymentMethod: 'wallet'`  
**Flow:**
1. Revenue engine calculates `patientPayable`
2. Check `wallet.balance_usd >= patientPayable`
3. `FOR UPDATE` lock on wallet row
4. Deduct balance + insert `wallet_transactions` entry
5. Appointment created with `payment_status = 'completed'`
6. `recordProviderEarning()` triggered immediately

**Status:** ✅ OK  
**Risks:** Partial payment (wallet < total) falls back to `cash` — documented in booking wizard

---

### 3. Cash Payment
**Path:** `POST /api/appointments` with `paymentMethod: 'cash'`  
**Flow:**
1. Appointment created with `payment_status = 'pending'`
2. Provider confirms receipt at appointment: `PATCH /api/appointments/:id/status` → `completed`
3. `recordProviderEarning()` triggered on completion

**Status:** ✅ OK  
**Risks:** No automatic revenue recognition — dependent on provider action

---

### 4. Bank Transfer
**Path:** `POST /api/appointments` with `paymentMethod: 'bank_transfer'`  
**Flow:**
1. Appointment created with `payment_status = 'pending'`
2. Admin manually verifies transfer: `PATCH /api/admin/appointments/:id`
3. `payment_status → 'completed'` triggers `recordProviderEarning()`

**Status:** ✅ OK  
**Risks:** Manual verification required — admin bottleneck

---

### 5. POS (Point of Sale)
**Path:** `POST /api/appointments` with `paymentMethod: 'pos'`  
**Flow:**
1. Same as cash — `payment_status = 'pending'`
2. Provider marks complete after POS terminal charges
3. `recordProviderEarning()` triggered on completion

**Status:** ✅ OK  
**Risks:** No POS terminal integration — relies on provider honor system

---

### 6. Bundled (Multi-session)
**Path:** Internal — created by group/package booking  
**Flow:**
1. Parent appointment created via group session route
2. Child appointments created with `paymentMethod: 'bundled'`
3. Payment processed on parent only
4. `recordProviderEarning()` called per child appointment

**Status:** ✅ OK  

---

## Stripe Refund Safety

Three independent guards prevent double-refunds (validated in RX-01):
1. `payment.refund_status = 'processed'` check
2. `!payment.stripeRefundId` DB guard
3. Stripe idempotency key

---

## Revenue Recognition Timeline

| Payment Method | Recognition Trigger | Delay |
|----------------|---------------------|-------|
| card | Stripe webhook `checkout.session.completed` | ~seconds |
| wallet | Immediate on booking | 0 |
| cash | Provider marks appointment `completed` | Variable |
| bank_transfer | Admin manual verification | Variable |
| pos | Provider marks appointment `completed` | Variable |
| bundled | Parent appointment `completed` | Variable |

---

## Open Items for Future Sprints

| Item | Priority | Notes |
|------|----------|-------|
| Partial wallet payment → Stripe top-up bridge | Medium | Wallet deficit → Stripe for remainder |
| Bank transfer OCR reference matching | Low | Auto-verify transfers via bank API |
| POS terminal integration (Stripe Terminal) | Low | Hardware reader integration |
| Stripe Connect — patient-to-provider-direct | Future | Marketplace model |
