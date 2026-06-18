---
name: Payment provider registry
description: Architecture and conventions for the admin-controlled payment provider DB registry that drives booking checkout.
---

## Rule
All payment methods are stored in `payment_providers` table. Booking checkout reads from `GET /api/payment-providers/available` — never from a hardcoded list.

## Table key columns
- `provider_key` — unique slug: wallet | cash | bank_transfer | stripe | razorpay | paypal | crypto | apple_pay | google_pay
- `is_enabled` + `maintenance_mode` — both must be true/false correctly for checkout visibility
- `country_codes TEXT[]` — NULL means global; non-null restricts to those ISO-2 codes
- `priority INTEGER` — lower = shown first in checkout

## API surface
- `GET /api/payment-providers/available?country=HU&currency=HUF` — patient-facing; returns enabled+filtered rows
- `GET /api/admin/payment-providers` — admin; returns ALL rows including disabled
- `PUT /api/admin/payment-providers/:key` — update any field
- `POST /api/admin/payment-providers/:key/test` — health check; writes result to DB

## Admin UI
- File: `client/src/components/admin/dashboard/payment-providers-panel.tsx`
- Tab: Admin Dashboard → Config → Payment Providers

## Booking canvas
- Queries `/api/payment-providers/available` via TanStack Query
- Maps provider.key → payMethod: `stripe` → `"card"`, `wallet` → `"wallet"`, `cash` → `"cash"`, `bank_transfer` → `"bank_transfer"`
- Fallback card button shown when registry is empty (safe degradation)

## Adding a new provider
1. Insert row in `runStartupMigrations()` in `server/db.ts`
2. Add credential fields to `PROVIDER_CREDENTIAL_FIELDS` in the admin panel
3. Add test handler case in `POST /api/admin/payment-providers/:key/test`
4. Add booking logic in `appointment.routes.ts` for the new paymentMethod value

**Why:** Prevents hardcoded Stripe assumptions; admin can activate gateways per-country without a deployment.
