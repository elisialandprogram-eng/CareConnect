# Sprint RX-03 — Legacy Financial Cleanup Report
**Date:** 2026-06-11
**Status:** Complete
**Build:** ✅ PASS
**TypeScript:** ✅ EXIT 0

---

## Objective
Remove all legacy financial code, routes, helpers, components, and admin artifacts that were replaced by the RevenueEngine. Consolidate all financial configuration into the Revenue & Billing Center as the single authoritative location.

---

## Deleted Files

| File | Reason |
|------|--------|
| `client/src/components/admin/PlatformFinancials.tsx` | Entirely legacy — contained a commission rate slider writing to the deprecated `platform_settings.marketplace_commission_rate` key, and consumed only the removed `GET /api/admin/financials/platform-summary` endpoint. |
| `client/src/pages/admin-earnings.tsx` | Duplicate of Finance → Provider Financials tab. Exposed the same `provider_earnings` data and mark-paid action via a second standalone page. |

---

## Deleted Routes

### `server/routes/financials.routes.ts`

| Method | Path | Reason |
|--------|------|--------|
| `GET` | `/api/admin/financials/platform-summary` | Legacy — served only `PlatformFinancials` component (now deleted); escrow/revenue KPIs available through the Revenue Engine |
| `GET` | `/api/admin/financials/commission-rate` | Legacy — superseded by `GET /api/admin/revenue/commission-rules`; `commission_rules` is the source of truth |
| `PUT` | `/api/admin/financials/commission-rate` | Legacy — wrote to `platform_settings.marketplace_commission_rate` (fallback only); superseded by commission_rules CRUD |

**Retained in this file:**
- `POST /api/financials/capture-escrow` — active booking escrow flow
- `POST /api/financials/settle-appointment` — active settlement (still uses `getCommissionRate()` as internal-only fallback for pre-RX-01 appointments)
- `GET /api/provider/wallet-summary` — active provider wallet dashboard

### `server/routes/admin/admin-financial.routes.ts`

| Method | Path | Reason |
|--------|------|--------|
| `GET` | `/api/admin/pricing-overrides` | Orphaned — no UI ever consumed this endpoint; `pricing_overrides` table has no admin panel |
| `POST` | `/api/admin/pricing-overrides` | Same |
| `DELETE` | `/api/admin/pricing-overrides/:id` | Same |

---

## Deleted Helpers

| Helper | File | Reason |
|--------|------|--------|
| `getCommissionRate()` — **admin API exposure** | `server/routes/financials.routes.ts` | Removed the 2 admin endpoints that exposed it. The function itself is retained as an internal private helper used only by `settle-appointment` for legacy pre-RX-01 appointment fallback. |

> **Note:** `recordProviderEarning()` in `database-storage.ts` is **retained** — it is still called from `appointment.routes.ts` and `admin-monitoring.routes.ts` for active post-completion earnings recording. It is not legacy.

---

## Deleted Components / Pages

| Item | Type | Notes |
|------|------|-------|
| `PlatformFinancials` (commission slider + KPI cards) | React component | Lazy import removed from `admin-dashboard.tsx`; nav item removed; render block removed |
| `AdminEarnings` (standalone earnings page) | React page | Lazy import removed from `App.tsx`; `/admin/earnings` route removed; header quick-link button removed from dashboard |

---

## Deleted Menu Items

| Nav Group | Item Removed | Tab Value | Reason |
|-----------|-------------|-----------|--------|
| Finance | Platform Ledger | `platform-ledger` | Component deleted; no longer needed |

**Navigation consolidation — items moved to Revenue & Billing group:**

| Item | From Group | To Group |
|------|-----------|---------|
| Tax & VAT | Finance | Revenue & Billing |
| Promo Codes | Catalog | Revenue & Billing |
| Packages | Catalog | Revenue & Billing |
| Payment Providers | Config | Revenue & Billing |

**Final Revenue & Billing group (5 items):**
1. Revenue & Billing Center (canonical config: platform fees, commissions, payment rules, travel fees, payout config, revenue share, wallet rules, simulator)
2. Tax & VAT
3. Promo Codes
4. Packages
5. Payment Providers

**Final Finance group (8 items, all operational):**
1. Financial (revenue KPI reports)
2. Wallets (patient wallet operations)
3. Payouts (provider payout approvals)
4. Provider Wallets (provider ledger + freeze)
5. Invoices (invoice list + template)
6. Refunds (refund queue + rules)
7. Provider Financials (per-provider earnings reporting + mark-paid)
8. Ledger Overrides (escrow management)

**Final Catalog group (2 items):**
1. Service Catalog
2. Service Requests

---

## Deleted Hooks / Queries

| Item | File | Reason |
|------|------|--------|
| `useQuery(["/api/admin/financials/platform-summary"])` | `PlatformFinancials.tsx` (deleted) | File deleted |
| `useQuery(["/api/admin/financials/commission-rate"])` | `PlatformFinancials.tsx` (deleted) | File deleted |
| `useMutation → PUT /api/admin/financials/commission-rate` | `PlatformFinancials.tsx` (deleted) | File deleted |
| `useQuery(QK.adminEarnings())` | `admin-earnings.tsx` (deleted) | File deleted |
| `useMutation → PATCH /api/admin/earnings/:id/pay` | `admin-earnings.tsx` (deleted) | File deleted |
| `useMutation → POST /api/admin/earnings/backfill` | `admin-earnings.tsx` (deleted) | File deleted |

---

## Deleted i18n Keys

Removed from `client/src/i18n/locales/{en,hu,fa}/translation.json`:

| Key | Reason |
|-----|--------|
| `admin.pricing_overrides` | Orphaned — referenced only by the unbuilt pricing overrides UI |
| `admin.manage_custom_pricing` | Same |
| `pricing_save_failed` | Orphaned pricing overrides UI key |
| `pricing_updated` | Orphaned pricing overrides UI key |
| `pricing_created` | Orphaned pricing overrides UI key |
| `pricing_deleted` | Orphaned pricing overrides UI key |
| `active_pricing_overrides` | Orphaned pricing overrides UI key |

---

## Deleted Columns / Tables

None removed. The `pricing_overrides` table is retained in the database (data preservation) — only the API endpoints managing it were removed. The `platform_settings.marketplace_commission_rate` key is retained as a read-only fallback in the `settle-appointment` legacy path; no new data is written to it after this sprint.

---

## Remaining Financial Architecture

```
Revenue Engine (canonical authority)
│
├─ commission_rules          ← Commission config (single source of truth)
├─ platform_fee_rules        ← Platform fee config
├─ payment_method_rules      ← Payment surcharge config
├─ travel_fee_rules          ← Travel fee config
├─ payout_configs            ← Payout threshold/frequency config
├─ revenue_share_rules       ← Revenue share config
├─ wallet_rules              ← Wallet topup/cashout rules
│
├─ booking_revenue_shares    ← Per-booking engine output snapshot
└─ appointments.{commission_amount, platform_fee_amount, ...}
                             ← Financial snapshot on each appointment

Operational Finance
│
├─ wallets                   ← Patient wallet balances
├─ provider_wallets          ← Provider wallet balances
├─ provider_ledger           ← Provider earnings audit log
├─ provider_earnings         ← Per-appointment provider earning records
├─ payout_requests           ← Provider payout approval workflow
├─ invoices                  ← Patient invoices
├─ invoice_templates         ← Invoice customization
├─ marketplace_ledger        ← Double-entry escrow ledger
├─ tax_settings              ← VAT/tax rates by country+year
└─ refund_rules              ← Refund policy thresholds

Catalog / Promotions
├─ promo_codes               ← Promotional discount codes
└─ packages + package_benefits ← Membership packages (incl. revenue engine benefit keys)

Admin UI
├─ Revenue & Billing Center  ← ALL financial configuration
├─ Finance (Operations)      ← ALL financial operations/approvals
└─ Catalog                   ← Service catalog and service requests only
```

**Active Server Route Files:**
- `server/routes/financials.routes.ts` — escrow capture, settlement, provider wallet summary
- `server/routes/admin/admin-financial.routes.ts` — wallets, payouts, invoices, refunds, provider earnings, tax, ledger overrides, exports, escrow management
- `server/routes/admin/revenue-billing.routes.ts` — Revenue Engine CRUD (canonical config)
- `server/routes/admin/admin-payment-providers.routes.ts` — payment gateway registry
- `server/routes/admin/financial-reconcile.routes.ts` — reconciliation/integrity checks

---

## Validation Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit --skipLibCheck` | ✅ EXIT 0 — no errors |
| `npm run build` | ✅ PASS — client + server built successfully |
| Dev server startup | ✅ Running — all migrations applied, no errors in logs |
| Browser console | ✅ Clean — no JS errors |

---

## Success Criteria Checklist

- [x] RevenueEngine remains the only financial authority
- [x] No duplicate financial systems remain (commission rate: one location only)
- [x] No legacy financial admin UI remains (PlatformFinancials deleted, earnings page deleted)
- [x] No dead financial code remains (3 legacy API routes removed, 3 orphaned pricing-override routes removed)
- [x] TypeScript EXIT 0
- [x] Build PASS
