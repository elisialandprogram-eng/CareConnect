---
name: Admin lazy loading pattern
description: How React.lazy + Suspense is set up in admin-dashboard.tsx for the 16 heavy panels, and the correct import patterns for named vs default exports.
---

## Rule
16 heavy admin panels are code-split via `React.lazy` + `Suspense` in `client/src/pages/admin-dashboard.tsx`. The fallback is a local `PanelSkeleton` component (three animated pulse divs, no dependency).

## Named export pattern
```tsx
const SupportTickets = lazy(() =>
  import("@/components/admin/dashboard/support-tickets").then(m => ({ default: m.SupportTickets }))
);
```
Panels that follow this pattern: BookingsManagementComponent, FinancialReports, MigrationHistory, InvoiceManagement, SupportTickets, PromoCodeManagement, TaxManagement, AdminCalendarView, AdminStaffOverview, AdminWallets, AdminPayoutsPanel, AdminProviderWalletsPanel, AdminTitleRequests.

## Default export pattern (no `.then()` needed)
```tsx
const MonitoringPanel = lazy(() => import("@/components/admin/monitoring-panel"));
```
Panels that follow this pattern: ProviderFinancialReports, MonitoringPanel, EnhancedAnalyticsDashboard, RbacPermissionsMatrix.

## Eagerly loaded (first tab / always visible)
AnalyticsOverview, ProviderOperationsConsole, ClientOperationsConsole, DocumentQueue, AdminNotificationCenter, ServicePendingChangesPanel, AdminServiceRequestsPanel, ServiceCatalogHierarchy, AuditLogPanel, PlatformSettings, StripeSettingsPanel, RefundManagementPanel, RefundRulesPanel, PackageManagement, AdminAccessPanel.

**Why:** First-tab panels must render without a Suspense waterfall; heavy panels (wallets, financial reports, support queue, monitoring) only load when the admin switches to that tab.
