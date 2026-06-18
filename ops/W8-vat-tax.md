# W8 — VAT/Tax: Country-Level Tax on Package Purchases

**Sprint:** P2 — Revenue Completion
**Status:** Complete
**Date:** 2026-06-11

## Scope

Apply the country-specific tax rate from `tax_settings` when a patient purchases a membership package, so the displayed price reflects the inclusive VAT/tax obligation.

## Changes Delivered

### `server/routes/patient.routes.ts` — Package Purchase

In `POST /api/patient/packages/:id/purchase`, immediately after loading the package price:

```typescript
let taxRate = 0;
const taxSetting = await storage.getTaxSettingByCountry(userCountry).catch(() => null);
if (taxSetting) taxRate = Number(taxSetting.taxRate ?? 0);
const taxMultiplier = 1 + (taxRate / 100);
const priceWithTax = price * taxMultiplier;
```

The `priceWithTax` value then flows into `toUSDSync()` for wallet comparison and Stripe checkout creation, replacing the original `price` variable.

**Important:** Free packages (`price === 0`) bypass the tax block and remain free. The tax is only applied when `price > 0`.

### `server/db.ts` — Phase 12 Schema

Two columns added to `tax_settings` via idempotent migrations:
- `is_vat_exempt BOOLEAN DEFAULT false` — marks countries/entities as VAT-exempt
- `vat_number TEXT` — stores platform or provider VAT registration number

### Revenue Billing Center — Tax / VAT tab (W10)

A new **Tax / VAT** tab in the Revenue Billing Center allows admins to:
- View all `tax_settings` rows (country, tax name, rate, VAT number, exempt flag).
- Create new settings for a country.
- Edit existing settings (rate, name, VAT number, exempt toggle).

Backed by the existing `GET /api/admin/tax-settings`, `POST /api/admin/tax-settings`, and `PATCH /api/admin/tax-settings/:id` routes.

## Tax Rate Resolution Order

1. Look up `tax_settings WHERE country_code = userCountry AND is_active = true`.
2. If no row found (or lookup fails), `taxRate = 0` — no tax applied.
3. If `is_vat_exempt = true`, the rate should be overridden to 0 in a future enhancement.

## Testing Notes

1. Insert a tax setting: `country_code = 'HU', tax_rate = 27, tax_name = 'ÁFA'`.
2. Purchase a package priced at $10 as a Hungarian patient.
3. Verify the wallet is debited $12.70 (or the Stripe session amount reflects $12.70).
4. With no tax setting for a country, verify the original price is used unchanged.
5. Verify free packages are unaffected by tax settings.

## Known Limitation

The tax is currently included in the total price paid (`pricePaid` on the `user_packages` row) but is not broken out as a separate line item. A future VAT invoice enhancement can split the base price and tax amount for regulatory compliance.
