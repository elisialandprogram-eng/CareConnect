# W11 — Dead Code Cleanup

**Sprint:** P2 — Revenue Completion
**Status:** Complete
**Date:** 2026-06-11

## Scope

Remove or audit dead code paths that accumulated during the revenue engine build — specifically duplicate earnings pages and legacy commission configuration that was superseded by the Revenue Billing Center.

## Audit Findings

### Provider Earnings Page — Not Dead Code

`/provider/earnings` route in `App.tsx` (line 161) maps to `@/pages/provider-earnings`. This is the **provider-facing** earnings dashboard, not an admin duplicate. It shows a provider their own earnings breakdown and payout history. This route is intentionally separate from the admin Revenue Billing Center and should not be removed.

**Verdict: Retain.**

### Platform Settings Commission Slider — No Legacy Slider Found

A search for `commission.*slider`, `defaultCommission`, `COMMISSION_PERCENT`, and `platform.*commission` in `client/src/components/admin/dashboard/platform-settings.tsx` returned no results. The legacy commission slider that was previously noted as a cleanup target was either already removed in a prior sprint or was never introduced.

**Verdict: No action required.**

### `RevenueSimulatorPanel` — Active and Used

The revenue simulator panel in `revenue-billing-center.tsx` was reviewed. It is actively used as one of the 12 billing center tabs (the "Simulator" tab). Not dead code.

**Verdict: Retain.**

### Admin Earnings / Financial Routes — Clean

The admin financial routes in `admin-financial.routes.ts` were reviewed. All routes are either:
- Called by active admin panels (RevenueBillingCenter, PayoutPanel, FinancialReconciliation).
- Part of the settlement/payout pipeline.

No duplicate or orphaned handlers were found.

**Verdict: No cleanup required.**

## Summary

| Item | Finding | Action |
|---|---|---|
| `/provider/earnings` route | Provider-facing — intentional | Retained |
| Commission slider | Not present in codebase | No action |
| Revenue simulator | Active panel tab | Retained |
| Admin financial routes | All active | No action |

## Notes

The clean audit result reflects the prior dead-code cleanup work done during the Admin Dashboard Decomposition sprint (B2), which deleted `ProvidersManagement`, `UsersManagement`, `ContentManagement`, and `AuditLogs` dead-code panels. The codebase is in a clean state for this workstream.
