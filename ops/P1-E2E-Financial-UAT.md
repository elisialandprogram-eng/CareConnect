# P1 — End-to-End Financial UAT
**Sprint:** P1 Launch Blockers | **Workstream:** 7 — E2E Financial UAT  
**Status:** ✅ Scenarios Defined | **Date:** 2026-06-11

---

## Test Environment Setup

```bash
# Required env vars for full UAT
SESSION_SECRET=<any-32-char-string>
SUPABASE_DATABASE_URL=<your-supabase-url>
STRIPE_SECRET_KEY=sk_test_<test-key>      # Use Stripe test mode
STRIPE_WEBHOOK_SECRET=whsec_<test-secret>
```

Use Stripe test card: `4242 4242 4242 4242` (any future date, any CVV)

---

## Scenario 1: Full Stripe Booking → Payout

**Steps:**
1. Register patient + provider
2. Provider sets up services with price
3. Patient books with `paymentMethod: 'card'`
4. Verify Stripe Checkout session created (check response for `checkoutUrl`)
5. Simulate webhook: `POST /api/webhooks/stripe` with `checkout.session.completed`
6. Verify `appointments.payment_status = 'completed'`
7. Verify `provider_earnings` row created with correct amount
8. Verify `provider_wallets.available_balance` increased
9. Request payout: `POST /api/provider/payout-requests`
10. Admin approves: `PATCH /api/admin/payout-requests/:id` with `status: 'paid'`
11. Run reconciliation: `GET /api/admin/financial/reconciliation/full` → status: `healthy`

**Expected:** All assertions pass, no drift in reconciliation

---

## Scenario 2: Wallet Payment

**Steps:**
1. Admin adds wallet credit: `POST /api/admin/wallets/:userId/adjust`
2. Patient books with `paymentMethod: 'wallet'`
3. Verify `wallet.balance_usd` decreased by booking amount
4. Verify `wallet_transactions` entry with correct amount
5. Verify `appointments.payment_status = 'completed'`
6. Verify `provider_earnings` created immediately

**Expected:** Instant payment + revenue recognition

---

## Scenario 3: Promo Code Application

**Steps:**
1. Admin creates promo code: `POST /api/admin/promo-codes`
2. Patient applies promo at booking
3. Verify `appointments.promo_discount_amount` = expected discount
4. Verify `appointments.total_amount` = base - discount + tax
5. Verify provider earnings use discounted total (not base)

**Expected:** Revenue engine applies promo correctly

---

## Scenario 4: MFA Login Flow

**Steps:**
1. Admin enables MFA: `POST /api/auth/mfa/setup` → `POST /api/auth/mfa/verify`
2. Logout
3. Login: `POST /api/auth/login` → expect `{ mfa_required: true, mfa_token: "..." }`
4. Enter TOTP: `POST /api/auth/mfa/challenge` with code
5. Verify full `accessToken` returned
6. Use `accessToken` to hit admin endpoint → verify 200

**Expected:** Login blocked without TOTP, succeeds with TOTP

---

## Scenario 5: Recovery Code Login

**Steps:**
1. Admin has MFA enabled with recovery codes
2. Login → MFA required → `POST /api/auth/mfa/recovery` with recovery code
3. Verify login succeeds
4. Verify that used recovery code cannot be reused
5. Verify `audit_logs` entry for recovery code use

**Expected:** Single-use recovery codes work and are audited

---

## Scenario 6: Stripe Connect Onboarding

**Steps:**
1. Provider: `POST /api/provider/stripe-connect/onboard`
2. Verify response contains `onboardingUrl`
3. Simulate completed onboarding via Stripe test mode
4. `GET /api/provider/stripe-connect/status` → verify `onboardingComplete: true`
5. Admin: `GET /api/admin/stripe-connect/overview` → verify provider appears

**Expected:** Onboarding flow creates account and tracks status

---

## Scenario 7: Automated Batch Payout

**Steps:**
1. Provider sets schedule: `POST /api/provider/payouts/schedule` with `scheduleType: 'monthly'`
2. Ensure provider has eligible balance (> minimum, hold period passed)
3. Admin: `POST /api/admin/payouts/automation/batch` with `confirm: true`
4. Verify `payout_requests` created with `payout_batch_id`
5. Verify `provider_wallets.available_balance` decreased
6. Verify `provider_ledger` entry with `payout_held`
7. If Stripe connected: verify `stripe_transfer_id` on payout_request
8. Run reconciliation → verify no new findings

**Expected:** Batch runs, wallets update, ledger records entry, reconciliation clean

---

## Scenario 8: Failed Payout Retry

**Steps:**
1. Create payout that will fail (use Stripe test decline)
2. Verify `payout_requests.status = 'rejected'`
3. Verify wallet balance restored (available_balance back to pre-payout value)
4. Admin: `POST /api/admin/payouts/:id/retry`
5. Verify retry succeeds with new `stripe_transfer_id`

**Expected:** Failure is recoverable; no money lost

---

## Scenario 9: Full Reconciliation — Dirty State

**Steps:**
1. Manually insert a `provider_ledger` row that disagrees with wallet balance
2. Run `GET /api/admin/financial/reconciliation/full`
3. Verify `wallet_ledger_drift` check returns `severity: 'critical'`
4. Restore correct ledger entry
5. Re-run reconciliation → verify `status: 'healthy'`

**Expected:** Reconciliation detects and reports drift correctly

---

## Pass Criteria

All 9 scenarios must pass with:
- No `500` errors in server logs
- Reconciliation returning `status: healthy` after each financial scenario
- Audit logs present for all auth + payout events
- Wallet balances matching ledger sums (drift = 0)
