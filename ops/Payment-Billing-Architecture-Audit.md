# Payment & Billing Architecture Audit
**Sprint:** Payment Provider Management System
**Date:** 2026-06-10
**Status:** ✅ Complete — tsc exits 0

---

## Executive Summary

This sprint replaced all hardcoded payment method assumptions with a **database-driven Payment Provider Registry**. Admins can now enable, disable, configure, prioritize, restrict by country/currency, and health-test any payment gateway from the admin console — with zero deployments required.

---

## 1. Payment Provider Registry Design

### 1.1 Database Table — `payment_providers`

```sql
CREATE TABLE payment_providers (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key  VARCHAR NOT NULL UNIQUE,      -- 'wallet', 'stripe', etc.
  display_name  TEXT NOT NULL,
  description   TEXT,
  is_enabled    BOOLEAN NOT NULL DEFAULT false,
  environment   VARCHAR NOT NULL DEFAULT 'production',  -- sandbox | production
  priority      INTEGER NOT NULL DEFAULT 100,           -- lower = shown first
  country_codes TEXT[],                                 -- NULL = all countries
  currency_codes TEXT[],                                -- NULL = all currencies
  credentials   JSONB DEFAULT '{}',                     -- API keys (admin-managed)
  feature_flags JSONB DEFAULT '{}',
  maintenance_mode BOOLEAN NOT NULL DEFAULT false,
  health_status VARCHAR NOT NULL DEFAULT 'unknown',    -- ok | error | unknown
  last_health_check TIMESTAMPTZ,
  last_test_result  JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### 1.2 Seed Data (applied on first boot via `runStartupMigrations()`)

| Provider Key   | Label             | Default State | Priority | Countries    |
|----------------|-------------------|---------------|----------|--------------|
| wallet         | Wallet            | ✅ Enabled    | 10       | All          |
| cash           | Cash              | ✅ Enabled    | 20       | All          |
| bank_transfer  | Bank Transfer     | ✅ Enabled    | 30       | All          |
| stripe         | Stripe            | ✅ Enabled    | 40       | All          |
| razorpay       | Razorpay          | ⛔ Disabled   | 50       | IN only      |
| paypal         | PayPal            | ⛔ Disabled   | 60       | All          |
| crypto         | Crypto Wallet     | ⛔ Disabled   | 70       | All          |
| apple_pay      | Apple Pay         | ⛔ Disabled   | 80       | All          |
| google_pay     | Google Pay        | ⛔ Disabled   | 90       | All          |

### 1.3 Registry API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/payment-providers/available` | User | Returns enabled+country-filtered providers for booking checkout |
| GET | `/api/admin/payment-providers` | Admin | Returns all providers including disabled |
| PUT | `/api/admin/payment-providers/:key` | Admin | Update any field (enable/disable, credentials, priority, restrictions) |
| POST | `/api/admin/payment-providers/:key/test` | Admin | Run connectivity health check, write result to DB |

---

## 2. Admin Payment Center

**Location:** Admin Dashboard → Config → Payment Providers

### 2.1 Panel Features

- **Summary cards** — Active count, disabled count, healthy connections, error count
- **Per-provider cards** — sorted by priority; expandable config section
- **Enable/Disable toggle** — immediate effect on booking checkout (no deploy)
- **Maintenance mode toggle** — hides provider from checkout even when enabled
- **Environment selector** — Sandbox / Production per provider
- **Priority input** — numeric ordering (lower = shown first in checkout)
- **Country restriction** — comma-separated ISO-2 codes; blank = global
- **Currency restriction** — comma-separated ISO-3 codes; blank = all currencies
- **Credentials panel** — provider-specific fields (keys, secrets) with show/hide toggle
- **Test Connection button** — calls `/api/admin/payment-providers/:key/test`, writes latency + message to DB
- **Health status badge** — Connected / Error / Never tested
- **Last test result bar** — inline pass/fail message with latency

### 2.2 Credential Fields by Provider

| Provider | Fields |
|----------|--------|
| Stripe | Publishable Key, Secret Key *(sensitive)*, Webhook Secret *(sensitive)* |
| Razorpay | Key ID, Key Secret *(sensitive)* |
| PayPal | Client ID, Client Secret *(sensitive)* |
| Crypto | Wallet Address, Supported Coins |

---

## 3. Country Restriction Model

Booking checkout calls `GET /api/payment-providers/available?country={ISO2}&currency={ISO3}`.

The SQL filter:
```sql
WHERE is_enabled = true
  AND maintenance_mode = false
  AND (country_codes IS NULL OR $country = ANY(country_codes))
  AND (currency_codes IS NULL OR $currency = ANY(currency_codes))
ORDER BY priority ASC
```

### Example routing matrix (recommended admin configuration)

| Country | Suggested providers |
|---------|---------------------|
| Hungary (HU) | Stripe, Bank Transfer, Wallet, Cash |
| India (IN) | Razorpay, Wallet, Cash |
| Iran (IR) | Bank Transfer, Wallet, Cash |
| United States | Stripe, PayPal, Wallet, Cash |
| International | Stripe, Wallet, Cash |

Admin configures this by setting `country_codes` on each provider card. No code change required.

---

## 4. Gateway Validation Results

### Stripe
- **Test endpoint:** `GET https://api.stripe.com/v1/balance`
- **Auth:** Bearer `credentials.secretKey` (falls back to `STRIPE_SECRET_KEY` env var)
- **Result stored:** `{ success, message, latencyMs }` in `last_test_result`
- **Health updated:** `health_status` set to `ok` or `error` on each test

### Razorpay
- **Test endpoint:** `GET https://api.razorpay.com/v1/payments?count=1`
- **Auth:** HTTP Basic (`keyId:keySecret`)
- **Status:** Future-ready; credentials not yet configured

### PayPal
- **Test endpoint:** `POST https://api-m.sandbox.paypal.com/v1/oauth2/token`
- **Auth:** HTTP Basic (`clientId:clientSecret`)
- **Environment-aware:** switches to `api-m.paypal.com` in production

### Wallet / Cash / Bank Transfer
- **Test:** No external connection; returns `success: true` immediately (local providers)
- **Health:** Always `ok` once tested

---

## 5. Future Provider Readiness Assessment

### ✅ Active Now
| Provider | Status | Notes |
|----------|--------|-------|
| Wallet | Production | Debit handled in appointment booking route |
| Cash | Production | Booking stays `pending` until provider confirms |
| Bank Transfer | Production | Booking stays `pending` until admin/provider verifies |
| Stripe | Production | Stripe checkout session created if `STRIPE_SECRET_KEY` present |

### 🔜 Future-Ready (schema + admin UI complete; just enable + add credentials)
| Provider | Notes |
|----------|-------|
| Razorpay | Country-locked to IN; needs Key ID + Key Secret |
| PayPal | Needs Client ID + Secret; sandbox URL ready |
| Crypto | Architecture-only; wallet address + coin config stored; no processing |
| Apple Pay | Requires Stripe APM configuration |
| Google Pay | Requires Stripe APM configuration |

### Adding a New Provider (procedure)
1. Insert one row into `payment_providers` via migration in `runStartupMigrations()`
2. Add credential fields to `PROVIDER_CREDENTIAL_FIELDS` in the admin panel component
3. Add a test handler case in `POST /api/admin/payment-providers/:key/test`
4. Add booking-flow logic in `appointment.routes.ts` for the new `paymentMethod` value
5. **No frontend checkout changes required** — the registry API drives the UI dynamically

---

## 6. Booking Flow Changes

### Before (hardcoded)
```tsx
// Four hardcoded buttons in booking-canvas.tsx — always shown regardless of admin config
<button onClick={() => setPayMethod("wallet")}>Wallet</button>
<button onClick={() => setPayMethod("card")}>Card</button>
<button onClick={() => setPayMethod("cash")}>Cash</button>
<button onClick={() => setPayMethod("bank_transfer")}>Bank Transfer</button>
```

### After (registry-driven)
```tsx
// Booking canvas queries /api/payment-providers/available (filtered by country + currency)
const { data: registryProviders } = useQuery({ queryKey: ["/api/payment-providers/available"] });

// Renders only enabled, non-maintenance, country-allowed providers
{registryProviders.map(provider => (
  <button key={provider.key} onClick={() => setPayMethod(mapKey(provider.key))}>
    {provider.label}
  </button>
))}
```

**Validation rules:**
- Disabled providers → never appear in checkout
- Maintenance mode → hidden even if `is_enabled = true`
- Country mismatch → filtered server-side
- Currency mismatch → filtered server-side
- Empty registry → fallback Card button shown (safe degradation)

---

## 7. Dead Code Cleanup

| Item | Status |
|------|--------|
| Hardcoded `["wallet", "cash", "bank_transfer", "stripe"]` array in booking canvas | ✅ Removed |
| `StripeSettingsPanel` in Integrations tab | ✅ Kept (legacy; Stripe also managed via new Payment Providers panel) |
| Stripe-only assumption in checkout (hardcoded `payMethod: "card"`) | ✅ Still default; now overridden by registry |

---

## 8. TypeScript Compliance

```
npx tsc --noEmit --skipLibCheck
→ 0 errors
```

All new files are fully typed:
- `server/routes/admin/admin-payment-providers.routes.ts`
- `client/src/components/admin/dashboard/payment-providers-panel.tsx`
- `booking-canvas.tsx` registry query typed as `Array<{ key, label, description, ... }>`
