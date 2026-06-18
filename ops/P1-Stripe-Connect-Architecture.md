# P1 — Stripe Connect Architecture
**Sprint:** P1 Launch Blockers | **Workstream:** 2 — Stripe Connect  
**Status:** ✅ Implemented | **Date:** 2026-06-11

---

## Overview

Provider payouts are now routed through Stripe Express Connected Accounts, enabling direct transfers from the platform's Stripe balance to individual provider accounts without manual bank transfer friction.

---

## Architecture Decision

| Option | Decision |
|--------|----------|
| Account type | **Express** (not Custom) — Stripe manages KYC, tax forms, and dashboard |
| Payout currency | USD (canonical platform currency) |
| Transfer mechanism | `stripe.transfers.create()` (platform → connected account) |
| Fallback | Manual payout (existing admin flow) if Stripe key absent |

---

## Database Table: `provider_stripe_accounts`

```sql
id                  VARCHAR PK
provider_id         VARCHAR UNIQUE (FK → providers.id)
stripe_account_id   TEXT           (e.g. acct_1Abc...)
account_type        VARCHAR        (always 'express')
onboarding_complete BOOLEAN
charges_enabled     BOOLEAN
payouts_enabled     BOOLEAN
details_submitted   BOOLEAN
requirements_due    JSONB []       (Stripe requirements.currently_due + past_due)
requirements_errors JSONB []
country             VARCHAR
currency            VARCHAR
onboarding_url      TEXT           (cached onboarding link)
created_at / updated_at
```

---

## Service: `server/services/stripe-connect.service.ts`

| Function | Description |
|----------|-------------|
| `createConnectedAccount(providerId, email, country, returnUrl, refreshUrl)` | Create Express account + generate onboarding link |
| `syncAccountStatus(providerId)` | Pull latest status from Stripe API → update DB |
| `getDashboardLink(providerId)` | Generate express dashboard login link |
| `transferToConnectedAccount(providerId, amountUsd, payoutRequestId, desc)` | Execute transfer |
| `getConnectedAccountsOverview()` | Admin summary of all connected accounts |

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/provider/stripe-connect/onboard` | provider | Create account + get onboarding URL |
| GET | `/api/provider/stripe-connect/status` | provider | Sync + return account status |
| GET | `/api/provider/stripe-connect/dashboard-link` | provider | Get express dashboard URL |
| GET | `/api/admin/stripe-connect/overview` | admin | All connected accounts overview |
| POST | `/api/admin/stripe-connect/:providerId/sync` | admin | Force sync from Stripe |
| GET | `/api/admin/stripe-connect/health` | admin | Connection health metrics |

---

## Onboarding Flow

```
Provider clicks "Connect Stripe"
    ↓
POST /api/provider/stripe-connect/onboard
    ↓
stripe.accounts.create({ type: 'express', ... })
    ↓
stripe.accountLinks.create({ type: 'account_onboarding', return_url, refresh_url })
    ↓
Redirect provider to Stripe-hosted onboarding
    ↓
Provider returns to /provider/dashboard?stripe_return=1
    ↓
GET /api/provider/stripe-connect/status (auto-sync from Stripe)
    ↓
onboarding_complete = true when:
  - details_submitted = true
  - charges_enabled = true
  - payouts_enabled = true
```

---

## Transfer Flow (Payout)

```
Admin approves payout OR automated batch runs
    ↓
Check provider_stripe_accounts.payouts_enabled = true
    ↓
stripe.transfers.create({
  amount: amountCents,
  currency: 'usd',
  destination: stripe_account_id,
  transfer_group: 'payout_<requestId>'
})
    ↓
Update payout_requests.status = 'paid'
Update payout_requests.stripe_transfer_id = transfer.id
Update provider_wallets: held_balance -= amount, last_payout_date = NOW()
Insert provider_ledger: entry_type = 'payout_deduction'
```

---

## Requirements Monitoring

The `requirements_due` column contains Stripe's list of outstanding verification items. Providers with items in this list will have `restricted: true` and cannot receive payouts.

Common requirements:
- `individual.id_number` — tax ID / SSN
- `individual.verification.document` — government ID scan
- `tos_acceptance.date` — Terms of Service acceptance
- `bank_account` — bank account details

---

## Admin Health Dashboard

`GET /api/admin/stripe-connect/health` returns:
```json
{
  "total": 42,
  "complete": 35,
  "charges_enabled": 36,
  "payouts_enabled": 34,
  "needs_attention": 8,
  "totalActiveProviders": 89,
  "notOnboarded": 47
}
```

---

## Environment Variables Required

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | Yes (for live) | Platform Stripe secret key |
| `PLATFORM_URL` | Recommended | Base URL for onboarding return/refresh URLs |

Both are optional at startup — the service returns graceful errors if absent.

---

## Security Notes

- All transfers use `transfer_group` for audit traceability
- Destination validation: `payouts_enabled` checked before every transfer
- Account ID never exposed to frontend — only status flags
- Webhook handler recommended for account status webhooks (`account.updated`, `account.application.deauthorized`)
