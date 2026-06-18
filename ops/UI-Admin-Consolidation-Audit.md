# UI & Admin Consolidation Audit
**Date:** 2026-06-11
**Status:** Audit Complete — No code was modified.
**Scope:** All admin UI elements related to Revenue, Pricing, Fees, Commissions, Taxes, Wallets, Promotions, Membership Benefits, Travel Fees, Payment Methods, and Payouts.

---

## Executive Summary

The admin portal has **grown organically** — the Revenue & Billing Center was introduced as the canonical home for all financial configuration, but **10+ older panels still exist** alongside it. The most critical issue is a **live duplicate** for commission rate configuration: an admin can set the rate in two separate places that write to different tables. There is also one orphaned API group (`/api/admin/pricing-overrides`) with translation strings but zero admin UI.

The `/admin/earnings` standalone page duplicates the Finance → Provider Financials tab. The Finance sidebar group has 10 items — a mix of operational tools, reporting screens, and one residual config screen — causing cognitive overload.

---

## Phase 1 — Admin UI Inventory

### Finance Group (sidebar)

| # | Nav Label | Tab Value | Component | Purpose | Route / API | Status |
|---|-----------|-----------|-----------|---------|-------------|--------|
| 1 | Financial | `financial` | `FinancialReports` | Revenue KPI cards + payment method breakdown + trend chart | `GET /api/admin/analytics` | **ACTIVE** (read-only reporting) |
| 2 | Tax & VAT | `tax` | `TaxManagement` | CRUD VAT/tax rates by country + year | `GET/POST/PATCH/DELETE /api/admin/tax-settings` | **ACTIVE** — config not in Revenue & Billing Center |
| 3 | Wallets | `wallets` | `AdminWallets` | Patient wallet list, transaction history, manual adjust/credit | `GET /api/admin/wallets`, `POST /api/admin/wallets/:id/adjust` | **ACTIVE** — operational |
| 4 | Payouts | `payouts` | `AdminPayoutsPanel` | Approve/reject/mark-paid provider payout requests | `GET/PATCH /api/admin/payout-requests` | **ACTIVE** — operational |
| 5 | Provider Wallets | `provider-wallets` | `AdminProviderWalletsPanel` | Provider wallet balances, full ledger history, freeze/unfreeze | `GET /api/admin/provider-wallets`, `/ledger`, `/adjust`, `/freeze` | **ACTIVE** — operational |
| 6 | Invoices | `invoices` | `InvoiceManagement` | Invoice list + invoice template editor | `GET /api/admin/invoices`, `GET/PUT /api/admin/invoice-template` | **ACTIVE** — operational |
| 7 | Refunds | `refunds` | `RefundManagementPanel` + `RefundRulesPanel` | Refund queue (operational) + refund policy rules (config) | `GET /api/admin/refunds`, `POST /api/admin/refunds/:id/process`, `GET/PUT /api/admin/refund-rules` | **ACTIVE** — mixed operational + config (rules config does not belong here) |
| 8 | Provider Financials | `financial-reports` | `ProviderFinancialReports` | Per-provider earnings table, monthly breakdown, mark-paid action | `GET /api/admin/financial/providers-overview`, `/providers/:id/detail`, `/providers/:id/mark-paid` | **ACTIVE** — operational reporting |
| 9 | Platform Ledger | `platform-ledger` | `PlatformFinancials` | Platform KPI metrics (escrow, net revenue, GMV) + commission rate **slider** | `GET /api/admin/financials/platform-summary`, `GET/PUT /api/admin/financials/commission-rate` | **DUPLICATE** — commission rate slider duplicates Revenue & Billing Center → Commissions tab |
| 10 | Ledger Overrides | `ledger-overrides` | `LedgerOverrides` | Release stuck escrow entries, log manual ledger corrections | `GET /api/admin/financial/ledger-overrides`, `POST /api/admin/financial/ledger-override` | **ACTIVE** — specialist tool |

### Revenue & Billing Group (sidebar)

| # | Nav Label | Tab Value | Component | Purpose | Route / API | Status |
|---|-----------|-----------|-----------|---------|-------------|--------|
| 11 | Revenue & Billing Center | `revenue-billing` | `RevenueBillingCenter` | 9-tab config center: Platform Fees, Commissions, Payment Rules, Travel Fees, Payout Config, Revenue Share, Wallet Rules, Simulator, Overview | `GET/POST/PATCH/DELETE /api/admin/revenue/*` | **ACTIVE** — canonical home for all financial config |

### Catalog Group (financial items)

| # | Nav Label | Tab Value | Component | Purpose | Route / API | Status |
|---|-----------|-----------|-----------|---------|-------------|--------|
| 12 | Promo Codes | `promos` | `PromoCodeManagement` | CRUD promo codes (percent/fixed discounts, expiry, usage limits) | `GET/POST/PATCH/DELETE /api/admin/promo-codes` | **ACTIVE** — logically should be under Revenue & Billing |
| 13 | Packages | `packages` | `PackageManagement` | CRUD membership packages + benefits (discount %, reduced_commission, wallet_bonus) | `GET/POST/PATCH/DELETE /api/admin/packages` | **ACTIVE** — has direct financial impact, logically should be under Revenue & Billing |

### Config Group (financial items)

| # | Nav Label | Tab Value | Component | Purpose | Route / API | Status |
|---|-----------|-----------|-----------|---------|-------------|--------|
| 14 | Payment Providers | `payment-providers` | `PaymentProvidersPanel` | Enable/disable payment gateways, set country/currency restrictions, health checks | `GET /api/admin/payment-providers`, `PUT /api/admin/payment-providers/:key`, `POST .../test` | **ACTIVE** — logically billing infrastructure, could move to Revenue & Billing |
| 15 | Settings | `settings` | `PlatformSettings` | Generic key-value platform_settings table editor (includes `marketplace_commission_rate` key) | `GET/POST /api/admin/settings` | **PARTIAL DUPLICATE** — `marketplace_commission_rate` key is a legacy fallback for commission; editable here but superseded by commission_rules |

### Overview Group (financial analytics)

| # | Nav Label | Tab Value | Component | Purpose | Route / API | Status |
|---|-----------|-----------|-----------|---------|-------------|--------|
| 16 | Revenue Intelligence | `revenue-intelligence` | `RevenueIntelligenceDashboard` | Revenue trend charts, promo effectiveness, package conversion, gift cards, referrals | `GET /api/admin/financial/revenue-trends`, `GET /api/admin/analytics/commercial` | **ACTIVE** — read-only analytics |
| 17 | Analytics | `overview` | `AnalyticsOverview` | Platform KPIs including revenue, payouts, booking counts | `GET /api/admin/analytics`, `GET /api/admin/analytics/monthly` | **ACTIVE** — read-only overview |

### Standalone Admin Pages (outside the dashboard)

| # | Route | Component | Purpose | API | Status |
|---|-------|-----------|---------|-----|--------|
| 18 | `/admin/earnings` | `AdminEarnings` | Per-appointment earnings list + mark-paid action for all providers | `GET /api/admin/earnings`, `POST /api/admin/earnings/:id/mark-paid` | **DUPLICATE** — same data and mark-paid functionality exists in Finance → Provider Financials tab |
| 19 | `/admin/home` | `AdminHome` | Action-required overview dashboard with financial health summary cards | `GET /api/admin/home-summary` | **ACTIVE** — overview/landing, acceptable |

---

## Phase 2 — Duplicate Settings Audit

### 1. Commission Rate — 3 entry points

| Location | Component | API | DB Table Written | Notes |
|----------|-----------|-----|-----------------|-------|
| Finance → Platform Ledger | `PlatformFinancials` | `PUT /api/admin/financials/commission-rate` | `platform_settings` (key `marketplace_commission_rate`) | **LEGACY** — fallback only; RX-01 declared commission_rules as source of truth |
| Revenue & Billing → Commissions | `RevenueBillingCenter` | `POST/PATCH /api/admin/revenue/commission-rules` | `commission_rules` | **CANONICAL** — source of truth post RX-01 |
| Config → Settings | `PlatformSettings` | `POST /api/admin/settings` | `platform_settings` | **LEGACY** — same legacy fallback key; editable via generic key-value editor |

**Risk:** An admin who finds the Platform Ledger slider may believe they are setting the commission rate, while the actual Revenue Engine reads from `commission_rules`. Changes via the slider only affect the legacy fallback path.

### 2. Provider Earnings / Mark-Paid — 2 entry points

| Location | Component | API | Notes |
|----------|-----------|-----|-------|
| `/admin/earnings` (standalone page) | `AdminEarnings` | `GET /api/admin/earnings`, mark-paid mutation | Flat table of all earnings records |
| Finance → Provider Financials | `ProviderFinancialReports` | `GET /api/admin/financial/providers-overview`, `/providers/:id/mark-paid` | Grouped by provider, same mark-paid action |

Both panels allow marking provider earnings as paid. They read from the same `provider_earnings` table via slightly different query shapes.

### 3. Refund Rules — mixed with operational refunds

| Location | Component | Notes |
|----------|-----------|-------|
| Finance → Refunds | `RefundRulesPanel` (embedded inside `refund-management.tsx`) | Policy config (time thresholds, partial-refund %) mixed into the same tab as the operational refund approval queue |

Refund Rules are configuration, not operations — they define platform policy and should live alongside Platform Fees and Commission Rules in the Revenue & Billing Center.

### 4. Promo Codes — placement mismatch

| Location | Group | Notes |
|----------|-------|-------|
| Catalog → Promo Codes | Catalog | Promo codes directly reduce booking revenue (financial impact) |
| (not present) | Revenue & Billing | Not currently surfaced in Revenue & Billing Center |

### 5. Membership Benefits — placement mismatch

| Location | Group | Benefit Keys with Financial Impact |
|----------|-------|-------------------------------------|
| Catalog → Packages | Catalog | `service_discount_percent`, `reduced_commission`, `wallet_bonus`, `platform_fee_discount` |
| (not present) | Revenue & Billing | Not currently surfaced in Revenue & Billing Center |

Packages configure `reduced_commission` and `platform_fee_discount` — these directly affect the Revenue Engine's commission calculation. They are currently buried under Catalog.

### 6. Payment Providers vs Payment Method Rules

| Location | Component | Scope |
|----------|-----------|-------|
| Config → Payment Providers | `PaymentProvidersPanel` | Gateway registry — which gateways are enabled, credentials, country restrictions |
| Revenue & Billing → Payment Rules | `RevenueBillingCenter` (Payment Rules tab) | Surcharge and processing-fee rules per payment method |

These are related but distinct. Both live in different sections. Could create confusion about where to configure payment-related fees.

---

## Phase 3 — Revenue Center Consolidation

### Currently inside Revenue & Billing Center ✅

| Config Type | Tab | Status |
|-------------|-----|--------|
| Platform Fee Rules | `platform-fees` | ✅ Canonical |
| Commission Rules | `commissions` | ✅ Canonical |
| Payment Method Surcharge Rules | `payment-rules` | ✅ Canonical |
| Travel Fee Rules | `travel-fees` | ✅ Canonical |
| Payout Configuration | `payout-rules` | ✅ Canonical |
| Revenue Share Rules | `revenue-sharing` | ✅ Canonical |
| Wallet Rules | `wallet-rules` | ✅ Canonical |
| Revenue Simulator | `simulator` | ✅ Only location |
| Rules Overview / Metrics | `overview` | ✅ Only location |

### Still managed elsewhere — should move ⚠️

| Config Type | Current Location | Reason to Move |
|-------------|-----------------|----------------|
| Tax & VAT | Finance → Tax & VAT | Tax rates are billing configuration, not operations |
| Refund Policy Rules | Finance → Refunds (mixed) | Policy config; currently mixed with the operational refund approval queue |
| Promo Codes | Catalog → Promo Codes | Directly affects booking revenue and discounts |
| Membership Packages + Benefits | Catalog → Packages | Contains `reduced_commission`, `platform_fee_discount`, `wallet_bonus` — Revenue Engine inputs |
| Payment Providers registry | Config → Payment Providers | Billing infrastructure; defines which payment methods are available |

### Residual duplicate — should be removed 🔴

| Config Type | Current Duplicate Location | Canonical Location |
|-------------|---------------------------|-------------------|
| Commission Rate | Finance → Platform Ledger (`PlatformFinancials` slider) | Revenue & Billing → Commissions |
| `marketplace_commission_rate` key | Config → Settings (generic key-value editor) | Revenue & Billing → Commissions |

---

## Phase 4 — Frontend Component Audit

### Orphaned Components / Dead UI

| Component/Feature | File | Status | Notes |
|-------------------|------|--------|-------|
| Commission rate slider | `PlatformFinancials.tsx` (lines 70–260) | **LEGACY** — duplicate | The slider writes to the legacy `platform_settings` fallback. Revenue Engine reads `commission_rules` first. The KPI metrics section of this component is still useful, but the slider itself is a live duplicate. |
| `RefundRulesPanel` | `refund-management.tsx` | **MISPLACED** | Exported and rendered alongside `RefundManagementPanel` in the Refunds tab. Should be a standalone panel in Revenue & Billing Center. |
| Pricing Overrides UI | *(does not exist)* | **ORPHANED API** | i18n keys `pricing_overrides`, `active_pricing_overrides`, `pricing_created`, `pricing_deleted`, `pricing_save_failed` exist in `en/hu/fa` translation files. The API (`GET/POST/DELETE /api/admin/pricing-overrides`) exists. But there is **no admin panel** that renders or manages `pricing_overrides`. This is dead translation + live orphaned API. |
| `StripeSettingsPanel` | `platform-settings.tsx` | **DUPLICATE** | Embedded inside Config → Integrations → Payments tab. Stripe is also shown in Config → Payment Providers. Two places to check Stripe status. |

### Unused Hooks / Queries

None found that are specific to financial systems — all hooks used in the panels above are actively called.

---

## Phase 5 — Route Audit

### Client-side Routes

| Route | Component | Status | Notes |
|-------|-----------|--------|-------|
| `/admin` | `AdminDashboard` | ACTIVE | Main tabbed dashboard |
| `/admin/home` | `AdminHome` | ACTIVE | Action-required landing page |
| `/admin/earnings` | `AdminEarnings` | **DUPLICATE** | Overlaps with Finance → Provider Financials tab (same data, same mark-paid action) |
| `/admin/stale-bookings` | `AdminStaleBookings` | ACTIVE | Operations tool |
| `/admin/users` | `AdminUsers` | UNKNOWN | Separate page but dashboard also has a Clients tab (`ClientOperationsConsole`); unclear if both are maintained |
| `/admin/bug-reports` | `AdminBugReports` | ACTIVE | |
| `/admin/compliance-queue` | `AdminComplianceQueue` | ACTIVE | |

### Server-side Route Files

| File | Status | Notes |
|------|--------|-------|
| `server/routes/admin/revenue-billing.routes.ts` | ACTIVE | New Revenue Engine CRUD |
| `server/routes/admin/admin-financial.routes.ts` | ACTIVE + **LEGACY SECTIONS** | Contains both active operational routes AND legacy commission rate endpoints |
| `server/routes/financials.routes.ts` | **LEGACY** | `GET/PUT /api/admin/financials/commission-rate` and `GET /api/admin/financials/platform-summary` — serves the legacy `PlatformFinancials` slider only |
| `server/routes/admin/admin-payment-providers.routes.ts` | ACTIVE | |
| `server/routes/admin/financial-reconcile.routes.ts` | ACTIVE | Reconciliation / integrity checks |

---

## Phase 6 — API Audit

### Revenue & Billing Center APIs (New Engine)

| Method | Path | Classification |
|--------|------|---------------|
| GET/POST/PATCH/DELETE | `/api/admin/revenue/platform-fee-rules` | **ACTIVE** |
| GET/POST/PATCH/DELETE | `/api/admin/revenue/commission-rules` | **ACTIVE — source of truth** |
| GET/POST/PATCH/DELETE | `/api/admin/revenue/payment-method-rules` | **ACTIVE** |
| GET/POST/PATCH/DELETE | `/api/admin/revenue/travel-fee-rules` | **ACTIVE** |
| GET/POST/PATCH/DELETE | `/api/admin/revenue/payout-config` | **ACTIVE** |
| GET/POST/PATCH/DELETE | `/api/admin/revenue/share-rules` | **ACTIVE** |
| GET/POST/PATCH/DELETE | `/api/admin/revenue/wallet-rules` | **ACTIVE** |
| POST | `/api/admin/revenue/simulate` | **ACTIVE** |
| GET | `/api/admin/revenue/overview` | **ACTIVE** |

### Legacy / Replaced APIs

| Method | Path | Classification | Notes |
|--------|------|---------------|-------|
| GET | `/api/admin/financials/platform-summary` | **LEGACY** | Only consumed by `PlatformFinancials.tsx` (Platform Ledger tab). Returns escrow/revenue/GMV totals and the old `commission_rate`. |
| GET | `/api/admin/financials/commission-rate` | **LEGACY / DUPLICATE** | Reads from `commission_rules` (new) then falls back to `platform_settings` (old). Superseded by `/api/admin/revenue/commission-rules`. |
| PUT | `/api/admin/financials/commission-rate` | **LEGACY / DUPLICATE** | Writes to `platform_settings.marketplace_commission_rate`. Superseded by commission_rules CRUD. The revenue engine already ignores this in favour of commission_rules. |

### Orphaned APIs (no UI)

| Method | Path | Classification | Notes |
|--------|------|---------------|-------|
| GET | `/api/admin/pricing-overrides` | **DEAD** | No admin panel renders this. Translation keys exist in all 3 locales. `pricing_overrides` DB table exists but has no admin management UI. |
| POST | `/api/admin/pricing-overrides` | **DEAD** | See above. |
| DELETE | `/api/admin/pricing-overrides/:id` | **DEAD** | See above. |

### Financial Operations APIs (active, correct location)

| Method | Path | Classification |
|--------|------|---------------|
| GET/POST | `/api/admin/wallets` | **ACTIVE** — patient wallet operations |
| GET/POST/PATCH/DELETE | `/api/admin/tax-settings` | **ACTIVE** — tax config |
| GET/PATCH | `/api/admin/payout-requests` | **ACTIVE** — payout approval workflow |
| GET/POST/PATCH/DELETE | `/api/admin/promo-codes` | **ACTIVE** — promo management |
| GET/PATCH | `/api/admin/refunds`, `/api/admin/refund-rules` | **ACTIVE** — refund operations + policy |
| GET/POST/PATCH/DELETE | `/api/admin/provider-wallets` | **ACTIVE** — provider wallet operations |
| GET | `/api/admin/financial/providers-overview` | **ACTIVE** — provider financial reporting |
| GET/POST | `/api/admin/financial/ledger-overrides`, `/ledger-override` | **ACTIVE** — escrow management |
| GET | `/api/admin/financial/revenue-trends` | **ACTIVE** — analytics |
| GET | `/api/admin/analytics/commercial` | **ACTIVE** — promo/package/referral analytics |
| GET | `/api/admin/earnings` | **DUPLICATE** — same data available via `/api/admin/financial/providers-overview` |

---

## Phase 7 — Database UI Mapping

### Revenue & Billing Center → New Engine Tables

| Admin Screen | API | DB Table(s) |
|-------------|-----|------------|
| Revenue & Billing → Platform Fees | `/api/admin/revenue/platform-fee-rules` | `platform_fee_rules` |
| Revenue & Billing → Commissions | `/api/admin/revenue/commission-rules` | `commission_rules` (**source of truth**) |
| Revenue & Billing → Payment Rules | `/api/admin/revenue/payment-method-rules` | `payment_method_rules` |
| Revenue & Billing → Travel Fees | `/api/admin/revenue/travel-fee-rules` | `travel_fee_rules` |
| Revenue & Billing → Payout Rules | `/api/admin/revenue/payout-config` | `payout_configs` |
| Revenue & Billing → Revenue Share | `/api/admin/revenue/share-rules` | `revenue_share_rules` |
| Revenue & Billing → Wallet Rules | `/api/admin/revenue/wallet-rules` | `wallet_rules` |

### Finance Group → Operational / Legacy Tables

| Admin Screen | API | DB Table(s) | Notes |
|-------------|-----|------------|-------|
| Finance → Platform Ledger (commission slider) | `PUT /api/admin/financials/commission-rate` | `platform_settings` (key: `marketplace_commission_rate`) | **LEGACY** — commission_rules is canonical |
| Finance → Tax & VAT | `/api/admin/tax-settings` | `tax_settings` | Not in Revenue Engine tables |
| Finance → Wallets | `/api/admin/wallets` | `wallets` | Patient wallets |
| Finance → Payouts | `/api/admin/payout-requests` | `payout_requests` | Provider payout approval |
| Finance → Provider Wallets | `/api/admin/provider-wallets` | `provider_wallets`, `provider_ledger` | |
| Finance → Invoices | `/api/admin/invoices`, `/api/admin/invoice-template` | `invoices`, `invoice_templates` | |
| Finance → Refunds | `/api/admin/refunds`, `/api/admin/refund-rules` | `appointments` (refund cols), `refund_rules` | |
| Finance → Provider Financials | `/api/admin/financial/providers-overview` | `provider_earnings`, `appointments` | |
| Finance → Ledger Overrides | `/api/admin/financial/ledger-overrides` | `marketplace_ledger` | |
| Config → Settings | `/api/admin/settings` | `platform_settings` | Contains legacy `marketplace_commission_rate` |

### Catalog Group → Financial Impact Tables

| Admin Screen | API | DB Table(s) | Notes |
|-------------|-----|------------|-------|
| Catalog → Promo Codes | `/api/admin/promo-codes` | `promo_codes` | Affects booking price |
| Catalog → Packages | `/api/admin/packages` | `packages`, `package_benefits` | Benefits include commission/fee/wallet config |

### Screens Reading Old Tables (not new Revenue Engine tables)

| Screen | Reads from | Should Eventually Read from |
|--------|------------|----------------------------|
| Platform Ledger commission slider | `platform_settings.marketplace_commission_rate` (fallback) | `commission_rules` (already reads first, slider is redundant) |
| Config → Settings | `platform_settings` | `commission_rules` for commission config |

### Orphaned Table (no managing UI)

| DB Table | API | Admin UI |
|----------|-----|----------|
| `pricing_overrides` | `/api/admin/pricing-overrides` | **NONE** — no panel renders this table |

---

## Phase 8 — Menu Cleanliness Review

### Current Finance Group (10 items) — Cluttered

```
Finance
├── Financial          (read-only analytics)
├── Tax & VAT          (config — should be in Revenue & Billing)
├── Wallets            (operational — keep)
├── Payouts            (operational — keep)
├── Provider Wallets   (operational — keep)
├── Invoices           (operational — keep)
├── Refunds            (mixed: operational queue + policy config — split)
├── Provider Financials (reporting — keep)
├── Platform Ledger    (DUPLICATE commission slider — retire slider, keep KPIs)
└── Ledger Overrides   (specialist tool — keep)
```

**Problems:**
- 10 items is too many for one group
- "Financial" and "Provider Financials" have nearly identical names and overlapping content
- "Platform Ledger" has the duplicate commission slider buried inside a KPI screen
- Tax & VAT is financial *configuration* — it belongs with Revenue & Billing

### Current Revenue & Billing Group (1 item) — Under-populated

```
Revenue & Billing
└── Revenue & Billing Center  (9-tab config panel)
```

The group exists but has only one item. Tax, Refund Rules, Promos, Packages, and Payment Providers should be surfaced alongside it.

### Current Catalog Group — Misplaced financial items

```
Catalog
├── Service Catalog     (appropriate)
├── Service Requests    (appropriate)
├── Promo Codes         (should be Revenue & Billing)
└── Packages            (should be Revenue & Billing — contains commission/fee benefit keys)
```

### Recommended Final Navigation (reference, not implementation)

```
Overview
├── Analytics
├── Insights
├── Revenue Intelligence
├── Ops Intelligence
├── Location Intelligence
└── Monitoring

People
├── Providers
├── Docs Approval
├── Expiry Monitor
├── Provider Review
├── Clients
└── Staff

Operations
├── Bookings
├── Calendar
├── Support
└── Title Requests

Finance (rename: Finance Operations)
├── Wallets             (patient wallets — operational)
├── Provider Wallets    (provider ledger — operational)
├── Payouts             (payout approval — operational)
├── Invoices            (invoice management — operational)
├── Refunds             (refund queue — operational only; move Refund Rules to Revenue & Billing)
├── Provider Financials (earnings reports + mark-paid)
└── Ledger Overrides    (escrow/ledger corrections)

Revenue & Billing        ← EXPANDED
├── Revenue & Billing Center  (Platform Fees, Commissions, Payment Rules, Travel Fees,
│                              Payout Config, Revenue Share, Wallet Rules, Simulator)
├── Tax & VAT            (moved from Finance)
├── Refund Rules         (moved from inside Refunds tab)
├── Promo Codes          (moved from Catalog)
├── Packages             (moved from Catalog)
└── Payment Providers    (moved from Config)

Catalog (after financial items move)
├── Service Catalog
└── Service Requests

Config
├── Circuit Breaker
├── Admin Access
├── Permissions
├── Settings             (remove or lock the marketplace_commission_rate key)
├── Integrations
└── Audit Logs

Development (Global Admin)
├── DB Health
├── Database Reset
└── Seed UAT Data
```

---

## Phase 9 — Development Tab Review

| Tool | Tab Value | Component | Status | Notes |
|------|-----------|-----------|--------|-------|
| DB Health | `db-health` | `DatabaseHealthPanel` | **KEEP** | Pool stats, migration history, uptime — useful diagnostic |
| Database Reset | `db-reset` | `DatabaseResetTool` | **KEEP** — restricted | Destructive but guarded by global_admin role + confirmation dialog. Label clearly marks it as destructive. |
| Seed UAT Data | `seed-uat` | `SeedUatTool` | **KEEP** — dev only | Creates test patients/providers/appointments. Idempotent. Should remain global_admin only. |

No obsolete development tools found. All three are useful and appropriately restricted to `isGlobalAdmin`.

---

## Phase 10 — Final Report

### Duplicate Screens

| Item | Location A | Location B | Winner |
|------|-----------|-----------|--------|
| Commission Rate config | Finance → Platform Ledger (legacy slider) | Revenue & Billing → Commissions | **Revenue & Billing** — `commission_rules` is source of truth |
| `marketplace_commission_rate` key | Config → Settings (generic editor) | Revenue & Billing → Commissions | **Revenue & Billing** — lock or remove the key from Settings |
| Provider Earnings / Mark-Paid | `/admin/earnings` (standalone page) | Finance → Provider Financials tab | **Finance → Provider Financials** — more detail, same action |

### Legacy Screens

| Item | File | Reason |
|------|------|--------|
| Commission rate slider in Platform Ledger | `client/src/components/admin/PlatformFinancials.tsx` (lines 70–260) | Writes to `platform_settings`, which is now a fallback. Revenue Engine ignores it when `commission_rules` is populated. |
| `GET /api/admin/financials/commission-rate` | `server/routes/financials.routes.ts` | Served only by legacy `PlatformFinancials` slider |
| `PUT /api/admin/financials/commission-rate` | `server/routes/financials.routes.ts` | Same — superseded by commission_rules CRUD |
| `GET /api/admin/financials/platform-summary` | `server/routes/financials.routes.ts` | Served only by `PlatformFinancials`; the KPI display portion is still useful but can be rebuilt using revenue engine data |

### Orphaned Components

| Item | Files | Notes |
|------|-------|-------|
| Pricing Overrides (no UI) | API: `server/routes/admin/admin-financial.routes.ts` (lines 653–706) | DB table `pricing_overrides` exists, 3 API endpoints exist, i18n keys in en/hu/fa, but no admin panel renders or manages them. Either a feature that was removed mid-development or intentionally deferred. |
| `pricing_overrides` i18n keys | `client/src/i18n/locales/en/translation.json`, `hu/translation.json`, `fa/translation.json` | Keys: `pricing_overrides`, `active_pricing_overrides`, `pricing_created`, `pricing_deleted`, `pricing_save_failed`. No component uses them. |

### Duplicate Settings (same field, multiple editors)

| Setting | Editor 1 | Editor 2 | Risk |
|---------|---------|---------|------|
| Global commission rate | Platform Ledger slider → `platform_settings` | Revenue & Billing → Commission Rules → `commission_rules` | ⚠️ HIGH — admin can set both, Revenue Engine reads `commission_rules` first (slider changes are silently ignored) |
| `marketplace_commission_rate` | Config → Settings (generic editor) | Revenue & Billing → Commission Rules | ⚠️ MEDIUM — same legacy fallback, editable in generic settings UI |

### Dead Routes

| Route | Notes |
|-------|-------|
| `/admin/earnings` | Duplicate of Finance → Provider Financials tab |

### Dead APIs

| Method + Path | Notes |
|--------------|-------|
| `GET /api/admin/pricing-overrides` | No UI consumes it |
| `POST /api/admin/pricing-overrides` | No UI consumes it |
| `DELETE /api/admin/pricing-overrides/:id` | No UI consumes it |
| `GET /api/admin/financials/commission-rate` | Legacy — only serves the duplicate slider |
| `PUT /api/admin/financials/commission-rate` | Legacy — superseded by commission_rules |
| `GET /api/admin/financials/platform-summary` | Legacy — only serves `PlatformFinancials` KPI cards (which could be rebuilt against revenue engine data) |

### Menu Cleanup Recommendations

1. **Rename "Finance" group → "Finance Operations"** — signals it is for operational tasks (approvals, adjustments) not configuration.
2. **Expand "Revenue & Billing" group** — move Tax & VAT, Refund Rules, Promo Codes, Packages, and Payment Providers into it.
3. **Remove Platform Ledger nav item** (or rename to "Platform KPIs" and strip the commission slider from the component).
4. **Remove "Financial" tab** from Finance group — its analytics are covered by the Overview group's Revenue Intelligence and Analytics tabs.
5. **Remove `/admin/earnings` link** from admin header quick links; point to Finance → Provider Financials instead.
6. **Move Packages** out of Catalog into Revenue & Billing — the financial benefit keys (`reduced_commission`, `platform_fee_discount`) are Revenue Engine inputs.

### Safe-to-Delete Items

> ⚠️ DO NOT DELETE YET. This is the inventory for the next implementation phase.

| Item | File(s) | Condition for Deletion |
|------|---------|------------------------|
| Commission rate slider (UI only) | `client/src/components/admin/PlatformFinancials.tsx` lines ~70–260 | After confirming all commission config has moved to commission_rules |
| `PUT /api/admin/financials/commission-rate` route | `server/routes/financials.routes.ts` | After removing the slider UI |
| `GET /api/admin/financials/commission-rate` route | `server/routes/financials.routes.ts` | Same |
| `GET /api/admin/financials/platform-summary` route | `server/routes/financials.routes.ts` | After rebuilding KPIs against revenue engine data, or removing PlatformFinancials entirely |
| `/admin/earnings` page | `client/src/pages/admin-earnings.tsx` + App.tsx route | After confirming Provider Financials tab covers all use cases |
| Pricing overrides API | `server/routes/admin/admin-financial.routes.ts` lines 653–706 | After deciding whether the feature is intended or abandoned |
| Pricing overrides i18n keys | `en/hu/fa` translation.json files (5 keys each) | Same as above |
| `marketplace_commission_rate` key display in Settings | Implicit via `PlatformSettings` generic editor | After locking/removing the key from `platform_settings` |

### Must-Remain Items

| Item | Reason |
|------|--------|
| Revenue & Billing Center (all 9 tabs) | Canonical financial configuration |
| Finance → Wallets, Payouts, Provider Wallets, Invoices, Refunds (operational view) | Operational tools; no other location |
| Finance → Provider Financials | Detailed per-provider reporting with mark-paid |
| Finance → Ledger Overrides | Specialist escrow correction tool; no other location |
| Tax & VAT | Active config; must remain accessible (location should move) |
| Refund Rules | Active policy config; must remain accessible (should move out of mixed Refunds tab) |
| Promo Codes, Packages | Active config; location should move to Revenue & Billing |
| Payment Providers | Active billing infrastructure registry |
| All Development tools | Restricted to Global Admin; useful for maintenance |

---

*Audit complete. No code was modified.*
