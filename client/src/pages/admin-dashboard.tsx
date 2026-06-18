import { useState, lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import { PanelErrorBoundary } from "@/components/global-error-boundary";
import { useQuery } from "@tanstack/react-query";
import { QK } from "@/lib/query-keys";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";
import PackageManagement from "@/components/admin/package-management";
import AdminAccessPanel from "@/components/admin/admin-access-panel";
import { ProviderOperationsConsole } from "@/components/admin/provider-operations-console";
import { ClientOperationsConsole } from "@/components/admin/client-operations-console";
import { AdminNotificationCenter } from "@/components/admin/admin-notification-center";
import { DocumentQueue } from "@/components/admin/document-queue";
import { DocumentExpiryMonitor } from "@/components/admin/document-expiry-monitor";
import { ProviderReviewQueue } from "@/components/admin/ProviderReviewQueue";
import { ServiceCatalogHierarchy } from "@/components/service-catalog-hierarchy";
import { useLocation } from "wouter";
import type { ProviderWithUser } from "@shared/schema";
import {
  Shield, Users, Building, Calendar, FileText, Settings, MessageSquare,
  Activity, BarChart3, Tag, DollarSign, ListTree, UserCheck,
  Wallet as WalletIcon, Banknote, Gift, TrendingUp, Lock,
  Globe, Percent, Clock, ChevronRight, Wallet, Zap, BookOpen, MapPin, Layers,
  AlertTriangle, CreditCard, Database, Sprout, RotateCcw,
} from "lucide-react";
import { RefundManagementPanel, RefundRulesPanel } from "@/components/admin/refund-management";
import { RevenueBillingCenter } from "@/components/admin/dashboard/revenue-billing-center";
import { DatabaseHealthPanel } from "@/components/admin/dashboard/database-health-panel";
import { SystemBreaker } from "@/components/admin/SystemBreaker";
import { LedgerOverrides } from "@/components/admin/LedgerOverrides";
import AdminAuditLogs from "@/components/admin/AdminAuditLogs";
import { EnvironmentManagementConsole } from "@/components/admin/dashboard/EnvironmentManagementConsole";
import { LegalCompliancePanel } from "@/components/admin/dashboard/legal-compliance-panel";
import { FinancialAlertsPanel } from "@/components/admin/dashboard/financial-alerts-panel";

// ── Extracted panel components ────────────────────────────────────────────────
import { StripeSettingsPanel } from "@/components/admin/dashboard/platform-settings";
import { PaymentProvidersPanel } from "@/components/admin/dashboard/payment-providers-panel";
import { ServicePendingChangesPanel } from "@/components/admin/dashboard/service-pending-changes";

// ── Lazy-loaded heavy panels ──────────────────────────────────────────────────
const BookingsManagementComponent = lazy(() =>
  import("@/components/admin/dashboard/bookings-management").then(m => ({ default: m.BookingsManagementComponent }))
);
import { AdminReportingCenter } from "@/components/admin/dashboard/admin-reporting-center";
const MigrationHistory = lazy(() =>
  import("@/components/admin/dashboard/migration-history").then(m => ({ default: m.MigrationHistory }))
);
const InvoiceManagement = lazy(() =>
  import("@/components/admin/dashboard/invoice-management").then(m => ({ default: m.InvoiceManagement }))
);
const SupportTickets = lazy(() =>
  import("@/components/admin/dashboard/support-tickets").then(m => ({ default: m.SupportTickets }))
);
const PromoCodeManagement = lazy(() =>
  import("@/components/admin/dashboard/promo-code-management").then(m => ({ default: m.PromoCodeManagement }))
);
const AdminCalendarView = lazy(() =>
  import("@/components/admin/dashboard/admin-calendar-view").then(m => ({ default: m.AdminCalendarView }))
);
const AdminStaffOverview = lazy(() =>
  import("@/components/admin/dashboard/admin-staff-overview").then(m => ({ default: m.AdminStaffOverview }))
);
const AdminWallets = lazy(() =>
  import("@/components/admin/dashboard/admin-wallets").then(m => ({ default: m.AdminWallets }))
);
const AdminPayoutsPanel = lazy(() =>
  import("@/components/admin/dashboard/admin-payouts").then(m => ({ default: m.AdminPayoutsPanel }))
);
const AdminProviderWalletsPanel = lazy(() =>
  import("@/components/admin/dashboard/admin-provider-wallets").then(m => ({ default: m.AdminProviderWalletsPanel }))
);
const AdminCategoryRequests = lazy(() =>
  import("@/components/admin/dashboard/admin-category-requests").then(m => ({ default: m.AdminCategoryRequests }))
);
const ProviderFinancialReports = lazy(() => import("@/components/admin/provider-financial-reports"));
const MonitoringPanel = lazy(() => import("@/components/admin/monitoring-panel"));
const RbacPermissionsMatrix = lazy(() => import("@/components/admin/rbac-permissions-matrix"));

// ── Suspense fallback ─────────────────────────────────────────────────────────
function PanelSkeleton() {
  return (
    <div className="space-y-3 p-1" aria-busy="true" aria-label="Loading panel">
      <div className="h-8 rounded-lg bg-muted animate-pulse w-1/3" />
      <div className="h-4 rounded bg-muted animate-pulse w-2/3" />
      <div className="h-48 rounded-xl bg-muted animate-pulse" />
    </div>
  );
}

// ── Provider Review wrapper (includes Docs Approval as inner tab) ─────────────
function ProviderReviewPanel({ onSelectProvider }: { onSelectProvider: (id: string) => void }) {
  const [innerTab, setInnerTab] = useState<"review" | "docs">("review");
  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-border pb-0">
        <button
          onClick={() => setInnerTab("review")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
            innerTab === "review"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          data-testid="tab-provider-review"
        >
          Provider Review
        </button>
        <button
          onClick={() => setInnerTab("docs")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
            innerTab === "docs"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          data-testid="tab-docs-approval"
        >
          Docs Approval
        </button>
      </div>
      {innerTab === "review" && <ProviderReviewQueue />}
      {innerTab === "docs" && <DocumentQueue onSelectProvider={onSelectProvider} />}
    </div>
  );
}

// ── Nav groups definition ─────────────────────────────────────────────────────
type NavItem = { value: string; label: string; icon: React.ElementType; badge?: number };
type NavGroup = { label: string; icon: React.ElementType; items: NavItem[] };

function buildNavGroups(isGlobalAdmin: boolean, t: (k: string, d?: string) => string, alertCount = 0): NavGroup[] {
  return [
    {
      label: "Overview",
      icon: BarChart3,
      items: [
        { value: "reports", label: "Reports", icon: BarChart3 },
        { value: "monitoring", label: t("admin.tab_monitoring", "Monitoring"), icon: Activity },
        { value: "db-health", label: "DB Health", icon: Database },
      ],
    },
    {
      label: "People",
      icon: Users,
      items: [
        { value: "providers", label: t("admin.providers", "Providers"), icon: Building },
        { value: "doc-expiry", label: "Expiry Monitor", icon: AlertTriangle },
        { value: "verification-queue", label: "Provider Review", icon: UserCheck },
        { value: "users", label: "Clients", icon: Users },
        { value: "staff", label: t("admin.staff", "Staff"), icon: UserCheck },
        { value: "category-requests", label: "Category Requests", icon: Layers },
      ],
    },
    {
      label: "Operations",
      icon: Calendar,
      items: [
        { value: "bookings", label: t("admin.bookings", "Bookings"), icon: Calendar },
        { value: "calendar", label: t("admin.calendar", "Calendar"), icon: Calendar },
        { value: "support", label: t("admin.support_tickets", "Support"), icon: MessageSquare },
      ],
    },
    {
      label: "Finance",
      icon: DollarSign,
      items: [
        { value: "financial-alerts", label: "Financial Alerts", icon: AlertTriangle, badge: alertCount > 0 ? alertCount : undefined },
        { value: "wallets", label: t("admin.wallets", "Wallets"), icon: WalletIcon },
        { value: "payouts", label: "Payouts", icon: Banknote },
        { value: "provider-wallets", label: "Provider Wallets", icon: Wallet },
        { value: "invoices", label: t("admin.invoices", "Invoices"), icon: FileText },
        { value: "financial-reports", label: "Provider Financials", icon: BarChart3 },
        { value: "ledger-overrides", label: "Ledger Overrides", icon: BookOpen },
        { value: "refunds", label: "Refunds", icon: RotateCcw },
      ],
    },
    {
      label: "Revenue & Billing",
      icon: Layers,
      items: [
        { value: "revenue-billing", label: "Revenue & Billing Center", icon: DollarSign },
        { value: "promos", label: t("admin.promo_codes", "Promo Codes"), icon: Tag },
        { value: "packages", label: "Packages", icon: Gift },
        { value: "payment-providers", label: "Payment Providers", icon: CreditCard },
      ],
    },
    {
      label: "Catalog",
      icon: ListTree,
      items: [
        { value: "catalog", label: t("admin.service_catalog", "Service Catalog"), icon: ListTree },
        { value: "service-requests", label: t("admin.service_requests", "Service Requests"), icon: ListTree },
      ],
    },
    {
      label: "Config",
      icon: Settings,
      items: [
        { value: "legal-compliance", label: "Legal & Compliance", icon: BookOpen },
        { value: "circuit-breaker", label: "Circuit Breaker", icon: Zap },
        { value: "admin-access", label: "Admin Access", icon: Shield },
        { value: "rbac-matrix", label: t("admin.tab_permissions", "Permissions"), icon: Lock },
        { value: "integrations", label: "External Services", icon: Globe },
        { value: "audit-enhanced", label: t("admin.audit_logs", "Audit Logs"), icon: Activity },
        ...(isGlobalAdmin ? [{ value: "migrations", label: t("admin.migrations_tab", "Migrations"), icon: Globe }] : []),
      ],
    },
    ...(isGlobalAdmin ? [{
      label: "Development",
      icon: Database,
      items: [
        { value: "env-management", label: "Environment Management", icon: Database },
      ],
    }] : []),
  ];
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const initialTab = (() => {
    try {
      const p = new URLSearchParams(window.location.search);
      return p.get("tab") ?? "reports";
    } catch {
      return "reports";
    }
  })();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [jumpToProviderId, setJumpToProviderId] = useState<string | null>(null);
  const isGlobalAdmin = user?.role === "global_admin";

  const openProvider = (id: string) => {
    setJumpToProviderId(id);
    setActiveTab("providers");
  };

  const { data: _providersPage } = useQuery<{ providers: ProviderWithUser[] }>({
    queryKey: QK.providers(),
  });
  const providers = _providersPage?.providers ?? [];

  const { data: financialHealth } = useQuery<{
    alerts: { unresolved: number; bySeverity: { severity: string; count: number }[] };
  }>({
    queryKey: QK.adminFinancialHealth(),
    refetchInterval: 120_000,
  });
  const unresolvedAlerts = financialHealth?.alerts.unresolved ?? 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navGroups = buildNavGroups(isGlobalAdmin, t as any, unresolvedAlerts);

  if (!isAdminRole(user?.role)) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <Card className="max-w-md w-full mx-4">
            <CardHeader className="text-center">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <CardTitle>{t("admin.admin_access_required")}</CardTitle>
              <CardDescription>
                {t("admin.no_permission")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/")} className="w-full" data-testid="button-go-home">
                {t("admin.go_home")}
              </Button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <PageBreadcrumbs items={[{ label: "Admin Dashboard" }]} />
      <main className="flex-1 container mx-auto px-4 py-8 overflow-x-hidden">
        {/* ── Header row ── */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-admin-title">
              <Shield className="h-8 w-8" />
              {t("admin.dashboard")}
            </h1>
            <p className="text-muted-foreground">{t("admin.bookings_management")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/admin/stale-bookings")}
              data-testid="link-stale-bookings"
            >
              <Clock className="h-4 w-4 me-1.5" />
              Stale bookings
            </Button>
            {isAdminRole(user?.role) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/admin/users")}
                data-testid="link-admin-users"
              >
                <Users className="h-4 w-4 me-1.5" />
                Manage Admins
              </Button>
            )}
            <AdminNotificationCenter
              onSelectProvider={(id) => openProvider(id)}
              onOpenDocQueue={() => setActiveTab("doc-queue")}
              onNavigate={setActiveTab}
            />
          </div>
        </div>

        {/* ── Priority queue banner ── */}
        {(() => {
          const pendingProviders = (providers ?? []).filter((p: any) => p.status === "pending");
          const criticalAlerts = financialHealth?.alerts.bySeverity.find(s => s.severity === "critical")?.count ?? 0;
          const items = [
            { label: "Providers pending verification", count: pendingProviders.length, tab: "providers", color: "amber" },
            { label: "Critical financial alerts", count: criticalAlerts, tab: "financial-alerts", color: "red" },
          ].filter(i => i.count > 0);
          if (items.length === 0) return null;
          return (
            <div className="mb-4 flex flex-wrap gap-3" data-testid="admin-priority-queue">
              <p className="w-full text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Priority Queue</p>
              {items.map((item) => (
                <button
                  key={item.tab}
                  onClick={() => setActiveTab(item.tab)}
                  data-testid={`priority-${item.tab}`}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                    item.color === "red"
                      ? "border-red-300/50 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-700/40 dark:bg-red-900/10 dark:text-red-300 dark:hover:bg-red-900/20"
                      : "border-amber-300/50 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700/40 dark:bg-amber-900/10 dark:text-amber-300 dark:hover:bg-amber-900/20"
                  )}
                >
                  <span className={cn(
                    "inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold",
                    item.color === "red"
                      ? "bg-red-200/80 dark:bg-red-800/50"
                      : "bg-amber-200/80 dark:bg-amber-800/50"
                  )}>
                    {item.count}
                  </span>
                  {item.label}
                  <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                </button>
              ))}
            </div>
          );
        })()}

        {/* ── Main layout: sidebar + content ── */}
        <div className="flex gap-6 items-start">

          {/* ── Desktop sidebar nav ── */}
          <aside className="hidden lg:flex flex-col w-48 xl:w-52 flex-shrink-0 sticky top-20 self-start gap-5 max-h-[calc(100vh-8rem)] overflow-y-auto pb-4 pe-1">
            {navGroups.map(group => (
              <div key={group.label}>
                <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest px-2.5 mb-1.5">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map(item => (
                    <button
                      key={item.value}
                      onClick={() => setActiveTab(item.value)}
                      data-testid={`sidenav-${item.value}`}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors text-start",
                        activeTab === item.value
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      )}
                    >
                      <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate flex-1">{item.label}</span>
                      {item.badge != null && item.badge > 0 && (
                        <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none flex-shrink-0">
                          {item.badge > 99 ? "99+" : item.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </aside>

          {/* ── Mobile nav: group pills + current group items ── */}
          <div className="lg:hidden w-full mb-4 space-y-2">
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {navGroups.map(group => {
                const isActive = group.items.some(i => i.value === activeTab);
                return (
                  <button
                    key={group.label}
                    onClick={() => setActiveTab(group.items[0].value)}
                    className={cn(
                      "flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap",
                      isActive
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:border-primary/40"
                    )}
                  >
                    <group.icon className="h-3 w-3" />
                    {group.label}
                  </button>
                );
              })}
            </div>
            {navGroups.map(group => {
              if (!group.items.some(i => i.value === activeTab)) return null;
              return (
                <div key={group.label} className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {group.items.map(item => (
                    <button
                      key={item.value}
                      onClick={() => setActiveTab(item.value)}
                      className={cn(
                        "flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors whitespace-nowrap",
                        activeTab === item.value
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      )}
                    >
                      <item.icon className="h-3 w-3" />
                      {item.label}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>

          {/* ── Panel content area ── */}
          <div className="flex-1 min-w-0">

            {activeTab === "financial-alerts" && (
              <PanelErrorBoundary>
                <FinancialAlertsPanel />
              </PanelErrorBoundary>
            )}

            {activeTab === "reports" && <AdminReportingCenter onNavigate={setActiveTab} />}

            {activeTab === "providers" && (
              <ProviderOperationsConsole jumpToProviderId={jumpToProviderId} />
            )}

            {activeTab === "doc-expiry" && (
              <DocumentExpiryMonitor onSelectProvider={(id) => openProvider(id)} />
            )}

            {activeTab === "verification-queue" && (
              <ProviderReviewPanel onSelectProvider={(id) => openProvider(id)} />
            )}

            {activeTab === "users" && <ClientOperationsConsole />}

            {activeTab === "bookings" && (
              <PanelErrorBoundary>
                <Suspense fallback={<PanelSkeleton />}>
                  <BookingsManagementComponent />
                </Suspense>
              </PanelErrorBoundary>
            )}

            {activeTab === "calendar" && (
              <PanelErrorBoundary>
                <Suspense fallback={<PanelSkeleton />}>
                  <AdminCalendarView />
                </Suspense>
              </PanelErrorBoundary>
            )}

            {activeTab === "staff" && (
              <PanelErrorBoundary>
                <Suspense fallback={<PanelSkeleton />}>
                  <AdminStaffOverview />
                </Suspense>
              </PanelErrorBoundary>
            )}

            {activeTab === "catalog" && <ServiceCatalogHierarchy />}

            {activeTab === "service-requests" && <ServicePendingChangesPanel />}




            {activeTab === "wallets" && (
              <PanelErrorBoundary>
                <Suspense fallback={<PanelSkeleton />}>
                  <AdminWallets />
                </Suspense>
              </PanelErrorBoundary>
            )}

            {activeTab === "invoices" && (
              <PanelErrorBoundary>
                <Suspense fallback={<PanelSkeleton />}>
                  <InvoiceManagement />
                </Suspense>
              </PanelErrorBoundary>
            )}

            {activeTab === "promos" && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("admin.promo_codes")}</CardTitle>
                  <CardDescription>{t("admin.promo_codes_desc") || "Create and manage promotional codes"}</CardDescription>
                </CardHeader>
                <CardContent>
                  <PanelErrorBoundary>
                    <Suspense fallback={<PanelSkeleton />}>
                      <PromoCodeManagement providers={providers || []} />
                    </Suspense>
                  </PanelErrorBoundary>
                </CardContent>
              </Card>
            )}

            {activeTab === "packages" && (
              <Card>
                <CardHeader>
                  <CardTitle>Membership Packages</CardTitle>
                  <CardDescription>Create and manage membership packages for clients and providers. Set benefits, pricing, and country targeting.</CardDescription>
                </CardHeader>
                <CardContent>
                  <PackageManagement />
                </CardContent>
              </Card>
            )}

            {activeTab === "admin-access" && <AdminAccessPanel />}


            {activeTab === "financial-reports" && (
              <Card>
                <CardHeader>
                  <CardTitle>Provider Financial Reports</CardTitle>
                  <CardDescription>View revenue, platform fees, net earnings, and payout status for each provider. Click any row to see a detailed monthly breakdown.</CardDescription>
                </CardHeader>
                <CardContent>
                  <PanelErrorBoundary>
                    <Suspense fallback={<PanelSkeleton />}>
                      <ProviderFinancialReports />
                    </Suspense>
                  </PanelErrorBoundary>
                </CardContent>
              </Card>
            )}

            {activeTab === "payouts" && (
              <PanelErrorBoundary>
                <Suspense fallback={<PanelSkeleton />}>
                  <AdminPayoutsPanel />
                </Suspense>
              </PanelErrorBoundary>
            )}

            {activeTab === "provider-wallets" && (
              <PanelErrorBoundary>
                <Suspense fallback={<PanelSkeleton />}>
                  <AdminProviderWalletsPanel />
                </Suspense>
              </PanelErrorBoundary>
            )}


            {activeTab === "support" && (
              <PanelErrorBoundary>
                <Suspense fallback={<PanelSkeleton />}>
                  <SupportTickets />
                </Suspense>
              </PanelErrorBoundary>
            )}


            {activeTab === "integrations" && (
              <Card>
                <CardHeader>
                  <CardTitle>External Services</CardTitle>
                  <CardDescription>Status of third-party services. All credentials are managed via environment secrets — nothing is configurable from this panel.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="stripe" className="w-full">
                    <TabsList className="tabs-colorful tabs-warm grid w-full grid-cols-3">
                      <TabsTrigger value="stripe">Stripe Status</TabsTrigger>
                      <TabsTrigger value="google">Google Maps</TabsTrigger>
                      <TabsTrigger value="messaging">Messaging & Push</TabsTrigger>
                    </TabsList>

                    <TabsContent value="stripe" className="space-y-4 py-4">
                      <StripeSettingsPanel />
                    </TabsContent>

                    <TabsContent value="google" className="space-y-4 py-4">
                      <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-4 text-sm text-blue-800 dark:text-blue-300 space-y-2">
                        <p className="font-semibold">Configured via environment secrets</p>
                        <p>Google Maps API keys are managed server-side and cannot be changed from the dashboard. Contact your deployment administrator to update the following secrets:</p>
                        <ul className="list-disc list-inside space-y-1 text-blue-700 dark:text-blue-400">
                          <li><code className="font-mono">GOOGLE_MAPS_API_KEY</code> — server-side geocoding &amp; distance calculations</li>
                          <li><code className="font-mono">VITE_GOOGLE_MAPS_API_KEY</code> — frontend Places Autocomplete</li>
                        </ul>
                      </div>
                    </TabsContent>

                    <TabsContent value="messaging" className="space-y-4 py-4">
                      <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-4 text-sm text-blue-800 dark:text-blue-300 space-y-2">
                        <p className="font-semibold">Configured via environment secrets</p>
                        <p>Messaging and push notification credentials are managed server-side. Contact your deployment administrator to update the following secrets:</p>
                        <ul className="list-disc list-inside space-y-1 text-blue-700 dark:text-blue-400">
                          <li><code className="font-mono">RESEND_API_KEY</code> — transactional email (OTP, booking confirmations, reminders)</li>
                          <li><code className="font-mono">TWILIO_ACCOUNT_SID</code> + <code className="font-mono">TWILIO_AUTH_TOKEN</code> + <code className="font-mono">TWILIO_FROM_NUMBER</code> — SMS notifications</li>
                          <li><code className="font-mono">TWILIO_WHATSAPP_FROM</code> — WhatsApp Business notifications</li>
                          <li><code className="font-mono">VAPID_PUBLIC_KEY</code> + <code className="font-mono">VAPID_PRIVATE_KEY</code> — Web Push (browser notifications)</li>
                        </ul>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}

            {activeTab === "revenue-billing" && <RevenueBillingCenter />}

            {activeTab === "payment-providers" && <PaymentProvidersPanel />}

            {activeTab === "legal-compliance" && (
              <PanelErrorBoundary>
                <LegalCompliancePanel />
              </PanelErrorBoundary>
            )}

            {activeTab === "circuit-breaker" && <SystemBreaker />}

            {activeTab === "ledger-overrides" && <LedgerOverrides />}

            {activeTab === "refunds" && (
              <PanelErrorBoundary>
                <div className="space-y-6">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <RotateCcw className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">Refunds</h2>
                      <p className="text-sm text-muted-foreground">
                        Review and process refunds, and manage refund policy rules per country and scenario.
                      </p>
                    </div>
                  </div>
                  <RefundManagementPanel />
                  <RefundRulesPanel />
                </div>
              </PanelErrorBoundary>
            )}

            {activeTab === "audit-enhanced" && <AdminAuditLogs />}


            {activeTab === "monitoring" && (
              <PanelErrorBoundary>
                <Suspense fallback={<PanelSkeleton />}>
                  <MonitoringPanel />
                </Suspense>
              </PanelErrorBoundary>
            )}

            {activeTab === "db-health" && (
              <PanelErrorBoundary>
                <DatabaseHealthPanel />
              </PanelErrorBoundary>
            )}


            {activeTab === "rbac-matrix" && (
              <PanelErrorBoundary>
                <Suspense fallback={<PanelSkeleton />}>
                  <RbacPermissionsMatrix />
                </Suspense>
              </PanelErrorBoundary>
            )}


            {activeTab === "category-requests" && (
              <PanelErrorBoundary>
                <Suspense fallback={<PanelSkeleton />}>
                  <AdminCategoryRequests />
                </Suspense>
              </PanelErrorBoundary>
            )}

            {isGlobalAdmin && activeTab === "migrations" && (
              <PanelErrorBoundary>
                <Suspense fallback={<PanelSkeleton />}>
                  <MigrationHistory />
                </Suspense>
              </PanelErrorBoundary>
            )}

            {isGlobalAdmin && activeTab === "env-management" && (
              <PanelErrorBoundary>
                <EnvironmentManagementConsole />
              </PanelErrorBoundary>
            )}

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
