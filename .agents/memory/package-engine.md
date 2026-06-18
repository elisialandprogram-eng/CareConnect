---
name: Package engine design
description: How membership packages work — tables, discount application, and integration points
---

## The rule
Packages have named benefit key-value pairs in `package_benefits`. When a patient books, `getActiveUserPackage()` looks up their active package and extracts `service_discount_percent` and `platform_fee_discount` benefit values. These are passed as `membershipDiscount` to `computeFinalPrice()` which reduces base price and platform fee accordingly. Results stored on appointments as `package_id_used` / `package_discount_amount`.

## Why
Separating benefit data into rows (rather than columns) lets new benefit types be added without schema changes.

## How to apply
- Add new benefit types: extend `benefit_key` enum in both DB migration and schema (requires ALTER TYPE or new migration).
- Booking integration is in `server/routes.ts` just before `computeFinalPrice()` call — look for the "Membership package discount" comment block.
- `server/lib/pricing.ts` has `MembershipDiscountInput` — update `PricingBreakdown` if adding new discount dimensions.
- Admin component: `client/src/components/admin/package-management.tsx`
- Patient page: `client/src/pages/packages.tsx`
- Package routes: `/api/packages`, `/api/packages/my`, `/api/packages/:id/purchase`, `/api/user-packages/:id/activate`, `/api/admin/packages` (CRUD + clone), `/api/admin/user-packages`
