# W10 — Revenue Billing Center Consolidation

**Sprint:** P2 — Revenue Completion
**Status:** Complete
**Date:** 2026-06-11

## Scope

Consolidate all revenue configuration screens into the single Revenue & Billing Center component. Before this sprint, three revenue areas had no admin UI: refund rules, tax/VAT settings, and gift-card management.

## Changes Delivered

### `client/src/components/admin/dashboard/revenue-billing-center.tsx`

**New imports:**
- `Gift`, `Shield`, `Receipt` added to lucide-react import.

**Three new panel components added (before `RevenueBillingCenter()`):**

#### `RefundRulesPanel` (W4)
- Displays `refund_rules` table rows: country, free window, partial %, active status.
- Inline edit form: country code, free window hours, partial window hours, partial percent, no-refund window, active toggle.
- Saves via `PUT /api/admin/refund-rules/:id` (edit) or `POST /api/admin/refund-rules` (create).
- Falls back gracefully: empty state explains defaults are used when no rules are configured.

#### `TaxSettingsPanel` (W8)
- Displays `tax_settings` rows: country, tax name, rate, VAT exempt flag, active status.
- Inline create/edit form: country code, tax name, rate, VAT number, exempt toggle, active toggle.
- Saves via `PATCH /api/admin/tax-settings/:id` (edit) or `POST /api/admin/tax-settings` (create).
- Backed by the existing admin tax routes registered in `admin-financial.routes.ts`.

#### `GiftCardsAdminPanel` (W5/W9)
- Displays all gift cards: code, balance, recipient, expiry, active status.
- One-click deactivate via `POST /api/admin/gift-cards/:id/deactivate`.
- Issue card form: amount, currency, recipient email, validity days.
- Backed by the new admin gift-card routes added to `payment.routes.ts`.

**Updated `sections` array:**
Three entries appended to the tab list:
```
{ value: "refund-rules",  label: "Refund Rules", icon: Shield,  component: <RefundRulesPanel /> }
{ value: "tax-settings",  label: "Tax / VAT",    icon: Receipt, component: <TaxSettingsPanel /> }
{ value: "gift-cards",    label: "Gift Cards",   icon: Gift,    component: <GiftCardsAdminPanel /> }
```

The tab list now has 12 tabs total (was 9), all using the existing `overflow-x-auto` scroll container so there is no layout overflow.

## Tab Inventory (Post-Sprint)

| Tab | Icon | Panel |
|---|---|---|
| Overview | BarChart3 | OverviewPanel |
| Platform Fees | Percent | PlatformFeeRulesPanel |
| Commissions | TrendingUp | CommissionRulesPanel |
| Payment Rules | CreditCard | PaymentMethodRulesPanel |
| Travel Fees | Car | TravelFeeRulesPanel |
| Payout Rules | Clock | PayoutConfigPanel |
| Revenue Sharing | Users | RevenueSharePanel |
| Wallet Rules | Wallet | WalletRulesPanel |
| Simulator | Play | RevenueSimulatorPanel |
| **Refund Rules** | Shield | **RefundRulesPanel** *(new)* |
| **Tax / VAT** | Receipt | **TaxSettingsPanel** *(new)* |
| **Gift Cards** | Gift | **GiftCardsAdminPanel** *(new)* |

## Testing Notes

- Navigate to Admin → Revenue & Billing Center.
- Confirm all 12 tabs are visible in the scrollable tab list.
- Open Refund Rules — verify empty state message, then add a rule and confirm it appears.
- Open Tax / VAT — verify existing tax settings are listed.
- Open Gift Cards — issue a card and verify it appears in the table.
