# Phase 6 — Admin Configuration Governance, Legacy Settings Cleanup & Admin UI Consolidation

**Date:** 2026-06-11  
**Sprint:** P6  
**Status:** COMPLETE

---

## Executive Summary

P6 audited the entire GoldenLife admin panel across 10 workstreams covering navigation, configuration governance, fee/tax/payment ownership, integration status, dead code, and RBAC. The platform entered this sprint in a strong operational state following P1–P5; the primary issues found were **orphaned components with no nav entry**, **a misleadingly-labelled tab**, and **dead code files**. All confirmed issues have been fixed. No regressions were introduced.

---

## Admin Navigation Audit

### Structure before P6

| Group | Tabs | Count |
|---|---|---|
| Overview | Analytics, Insights, Revenue Intelligence, Ops Intelligence, Location Intelligence, Monitoring | 6 |
| People | Providers, Docs Approval, Expiry Monitor, Provider Review, Clients, Staff | 6 |
| Operations | Bookings, Calendar, Support, Title Requests | 4 |
| Finance | Financial, Wallets, Payouts, Provider Wallets, Invoices, Refunds, Provider Financials, Ledger Overrides | 8 |
| Revenue & Billing | Revenue & Billing Center, Tax & VAT, Promo Codes, Packages, Payment Providers | 5 |
| Catalog | Service Catalog, Service Requests | 2 |
| Config | Circuit Breaker, Admin Access, Permissions, Settings, Integrations, Audit Logs, Migrations (global admin) | 6–7 |
| Development | Environment Management (global admin) | 0–1 |

**Total tabs: 38–40**

### Issues found & fixed

| # | Issue | Action |
|---|---|---|
| 1 | `DatabaseHealthPanel` component existed and had a full working backend route (`GET /api/admin/health/database`) but was **not in the nav and never rendered** | Added "DB Health" to Overview group |
| 2 | "Integrations" tab label implied configurable integrations; all 3 subtabs were read-only (env-var instructions + Stripe status) | Renamed nav label to **"External Services"** |
| 3 | Integrations subtabs: "Google APIs", "Payments", "Messaging" — labelled generically | Renamed to "Stripe Status", "Google Maps", "Messaging & Push" for clarity |
| 4 | Integrations card description said "Manage API keys" — inaccurate (nothing is manageable) | Updated description: "Status of third-party services. All credentials are managed via environment secrets." |

---

## Settings Audit

### `platform_settings` table (generic key-value store)

- **Purpose:** Miscellaneous platform configuration via `GET/POST /api/admin/settings`
- **Financial keys present:** `marketplace_commission_rate` — used ONLY as a tertiary fallback in `financials.routes.ts` for legacy appointments booked before Sprint RX-01. `commission_rules` table is the authoritative source.
- **Verdict:** Settings tab is correctly named and appropriately scoped. No duplicate configuration found. The `marketplace_commission_rate` fallback is intentional and documented in code comments.

### Tax & VAT Settings

- **Single source:** `tax_settings` table via `GET/POST/PATCH/DELETE /api/admin/tax-settings`
- **Single UI:** `TaxManagement` panel in Revenue & Billing nav group
- **No duplicates found**

---

## Revenue Governance Audit

### Platform Fee Governance

The Revenue & Billing Center is confirmed as the **sole authoritative configuration system** for all financial rules:

| Rule Type | DB Table | UI Panel | Route |
|---|---|---|---|
| Platform fees | `platform_fee_rules` | Revenue & Billing Center | `/api/admin/revenue/platform-fee-rules` |
| Commission rules | `commission_rules` | Revenue & Billing Center | `/api/admin/revenue/commission-rules` |
| Payment surcharges | `payment_method_rules` | Revenue & Billing Center | `/api/admin/revenue/payment-method-rules` |
| Travel fees | `travel_fee_rules` | Revenue & Billing Center | `/api/admin/revenue/share-rules` |
| Revenue sharing | `revenue_share_rules` | Revenue & Billing Center | `/api/admin/revenue/share-rules` |
| Tax / VAT | `tax_settings` | Tax & VAT panel | `/api/admin/tax-settings` |
| Promo codes | `promo_codes` | Promo Codes panel | `/api/admin/promo-codes` |
| Packages | `packages` | Packages panel | N/A |
| Payment gateways | `payment_providers` | Payment Providers panel | `/api/admin/payment-providers` |

**No duplicate fee configuration paths found.** Revenue & Billing Center is the single financial authority. ✓

---

## Tax/VAT Audit

- One table: `tax_settings`  
- One UI panel: `TaxManagement` in Revenue & Billing group  
- One set of API routes: `GET/POST/PATCH/DELETE /api/admin/tax-settings`  
- Pricing engine fallback hierarchy: `sub_services.tax_percentage` → `tax_settings.tax_rate` (by country + year)  
- **No duplicate tax configuration locations found** ✓

---

## Payment Settings Review

### Current layout

| Panel | Group | Purpose |
|---|---|---|
| Payment Providers | Revenue & Billing | Manage Stripe, Razorpay, PayPal, Crypto gateways |
| Payouts | Finance | Provider payout requests and automation |
| Provider Wallets | Finance | Individual provider balance management |
| Wallets | Finance | Patient wallet overview |
| Refunds | Finance | Refund rules and manual refund processing |

**Assessment:** Payment screens are correctly segregated. "Payment Providers" accurately describes gateway management. "Payouts" accurately describes provider payout flows. No misleading labels, no duplicate screens. No rename needed — structure is already correct.

---

## Integrations Audit

### Before P6

| Subtab | Content | Functionality |
|---|---|---|
| Google APIs | Env var name list | Read-only info only |
| Payments | `StripeSettingsPanel` | Read-only status (configured/not) |
| Messaging | Env var name list | Read-only info only |

**Verdict:** No actual integration management was possible from any subtab. The "Integrations" label was misleading.

### After P6

- Tab renamed: **"Integrations" → "External Services"**
- Subtabs renamed: **"Google Maps"**, **"Stripe Status"**, **"Messaging & Push"**
- Card description updated to accurately state credentials are read-only from the dashboard
- Resend (`RESEND_API_KEY`) added to the Messaging & Push info panel (was missing)
- All services confirmed in active use: Stripe ✓, Google Maps ✓, Resend ✓, Twilio ✓, Cloudinary ✓, Daily.co ✓, VAPID ✓, OpenAI ✓

---

## Dead Code Audit

### Removed

| File | Reason |
|---|---|
| `client/src/components/admin/audit-log-panel.tsx` | Never imported anywhere. Admin dashboard uses `AdminAuditLogs.tsx` (different component). Dead code confirmed via full codebase grep. |

### Promoted (orphaned → navigable)

| File | Issue | Fix |
|---|---|---|
| `client/src/components/admin/dashboard/database-health-panel.tsx` | Full working panel (306 lines) backed by `GET /api/admin/health/database` — not in nav, never rendered | Added "DB Health" to Overview group in `buildNavGroups()` and added panel render |

### Backend-only routes retained

The following routes have no admin UI but serve legitimate operational purposes and are retained:

- `GET /api/admin/health/rate-limiting` — Rate limit counters, top offenders, blocked tiers
- `GET /api/admin/health/security` — Login lockout status, failed-login trends
- `GET /api/admin/health/financial` — Reconciliation summary, financial alerts, ledger drift
- `POST /api/admin/storage/scan-orphans` — Manual Cloudinary orphan scan utility
- `GET /api/admin/retention-policy` — Data retention policy status

---

## Items Removed

| Type | Item | Reason |
|---|---|---|
| React component | `client/src/components/admin/audit-log-panel.tsx` | Dead code — never imported |

---

## Items Consolidated

| Item | What changed |
|---|---|
| "External Services" panel (formerly "Integrations") | All env-var info consolidated into 3 accurate subtabs; Resend added to Messaging subtab |
| DB Health panel | Promoted from orphaned file to navigable panel in Overview group |

---

## Items Renamed

| Location | Before | After |
|---|---|---|
| Sidebar nav | "Integrations" | "External Services" |
| External Services panel title | "External Integrations" | "External Services" |
| External Services panel description | "Manage API keys and external service credentials" | "Status of third-party services. All credentials are managed via environment secrets — nothing is configurable from this panel." |
| Subtab: Google | "Google APIs" | "Google Maps" |
| Subtab: Stripe | "Payments" | "Stripe Status" |
| Subtab: Messaging | "Messaging" | "Messaging & Push" |

---

## Issues Fixed

1. **Orphaned `DatabaseHealthPanel`** — Panel existed with full backend support but was unreachable from the admin UI. Now accessible via Overview → DB Health.
2. **Misleading "Integrations" label** — Renamed to "External Services" with accurate description. Subtabs renamed to reflect actual content.
3. **Dead file `audit-log-panel.tsx`** — Removed.
4. **Missing Resend in Messaging tab** — `RESEND_API_KEY` was absent from the messaging subtab info; added.

---

## Remaining Risks

| Risk | Severity | Notes |
|---|---|---|
| Backend-only health routes have no UI | Low | Routes for rate-limiting, security, and financial health exist and return useful data but are only accessible via direct API call. Future sprint may add a unified Health Dashboard tab consuming all three. |
| `platform_settings.marketplace_commission_rate` fallback | Low | Intentional legacy fallback for pre-RX-01 appointments. Can be removed once all historical appointments are fully settled under the new commission engine. |
| `sub_services.tax_percentage` vs `tax_settings` dual-source | Low | Pricing engine applies service-level tax rate first, then falls back to country-level. This is intentional by design and correctly documented. Not a governance risk. |

---

## Final Admin Architecture Verdict

| Domain | Authority | Status |
|---|---|---|
| Platform fees | Revenue & Billing Center (`platform_fee_rules`) | ✅ Single owner |
| Commission | Revenue & Billing Center (`commission_rules`) | ✅ Single owner |
| Tax / VAT | Revenue & Billing → Tax & VAT (`tax_settings`) | ✅ Single owner |
| Payment surcharges | Revenue & Billing Center (`payment_method_rules`) | ✅ Single owner |
| Payment gateways | Revenue & Billing → Payment Providers (`payment_providers`) | ✅ Single owner |
| Provider payouts | Finance → Payouts | ✅ Single owner |
| Promo codes | Revenue & Billing → Promo Codes | ✅ Single owner |
| Packages | Revenue & Billing → Packages | ✅ Single owner |
| Wallet rules | Finance → Wallets / Provider Wallets | ✅ Single owner |
| Refund rules | Finance → Refunds (`RefundRulesPanel`) | ✅ Single owner |
| External service credentials | Config → External Services (read-only status) | ✅ Single owner |
| Platform settings | Config → Settings (`platform_settings` KV store) | ✅ Single owner |
| Navigation | `buildNavGroups()` in `admin-dashboard.tsx` | ✅ Single source |

**The platform's admin configuration governance is clean. Every configuration domain has exactly one authoritative owner. No duplicate configuration paths remain. The admin navigation reflects operational reality.**

---

*Report generated: 2026-06-11 | Sprint P6 | GoldenLife Platform*
