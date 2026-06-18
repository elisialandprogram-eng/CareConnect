import { Suspense, lazy, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2, BarChart3, TrendingUp, DollarSign, Activity, MapPin, FileText,
  Users, Package, ShieldCheck, Headphones, Download, Globe, Crown,
  AlertTriangle, CheckCircle2, Clock, ExternalLink,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PanelErrorBoundary } from "@/components/global-error-boundary";
import { AnalyticsOverview } from "./analytics-overview";
import { useAdminCurrency } from "@/lib/currency";
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

const EnhancedAnalyticsDashboard = lazy(() => import("@/components/admin/enhanced-analytics"));
const RevenueIntelligenceDashboard = lazy(() =>
  import("./revenue-intelligence").then(m => ({ default: m.RevenueIntelligenceDashboard }))
);
const OperationsIntelligenceDashboard = lazy(() =>
  import("./operations-intelligence").then(m => ({ default: m.OperationsIntelligenceDashboard }))
);
const FinancialMasterReport = lazy(() =>
  import("./financial-master-report").then(m => ({ default: m.FinancialMasterReport }))
);
const LocationAnalyticsPanel = lazy(() =>
  import("./location-analytics").then(m => ({ default: m.LocationAnalyticsPanel }))
);

function PanelLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function KpiCard({ label, value, sub, icon: Icon, color = "text-primary" }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`mt-0.5 p-2 rounded-lg bg-muted ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold leading-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function AdminPatientsPanel() {
  const { format: fmt } = useAdminCurrency();
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/admin/analytics/enhanced"] });

  if (isLoading) return <PanelLoader />;
  if (!data) return <p className="text-sm text-muted-foreground text-center py-12">No patient data available.</p>;

  const s = data.summary || {};
  const retention = s.retentionRate ?? 0;
  const refundTotal = s.refundTotal ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={Users} label="New Patients (30d)" value={String(s.newUsers ?? 0)} sub="registered this month" color="text-blue-600" />
        <KpiCard icon={Activity} label="Active Patients (90d)" value={String(s.activePatients ?? 0)} sub="with appointments" color="text-emerald-600" />
        <KpiCard icon={TrendingUp} label="Returning Patients" value={String(s.returningPatients ?? 0)} sub={`${retention.toFixed(1)}% retention rate`} color="text-violet-600" />
        <KpiCard icon={DollarSign} label="Total Refunds" value={fmt(refundTotal)} sub={`${s.refundCount ?? 0} refund events`} color="text-rose-600" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Appointments / Patient</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{(s.avgAppointmentsPerPatient ?? 0).toFixed(1)}</p>
            <p className="text-xs text-muted-foreground mt-1">across all active patients</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cancellation Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{(s.cancelRate ?? 0).toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground mt-1">of total appointments</p>
          </CardContent>
        </Card>
      </div>

      {(data.growthSeries ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Patient Growth (6 months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={data.growthSeries}>
                <defs>
                  <linearGradient id="patGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Area type="monotone" dataKey="newUsers" name="New Patients" stroke="#6366f1" fill="url(#patGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {(data.topProviders ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Providers by Completed Appointments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(data.topProviders ?? []).slice(0, 10).map((p: any, i: number) => (
                <div key={p.providerId || i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                    <span className="font-medium truncate">{p.providerName}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-muted-foreground text-xs">
                    <span>{p.completedCount} appts</span>
                    <span className="text-emerald-600 font-medium">{fmt(p.totalRevenue ?? 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface MembershipAnalytics {
  canonical_currency: string;
  summary: {
    totalPurchases: number;
    activeCount: number;
    completedCount: number;
    cancelledCount: number;
    totalRevenueUsd: number;
    uniqueSubscribers: number;
    uniquePackages: number;
  };
  trend: { month: string; purchases: number; revenueUsd: number }[];
  packages: { name: string; currency: string; price: number; totalSales: number; activeSales: number; revenueUsd: number }[];
}

function AdminMembershipsPanel() {
  const { format: fmt } = useAdminCurrency();
  const { data, isLoading } = useQuery<MembershipAnalytics>({ queryKey: ["/api/admin/analytics/memberships"] });

  if (isLoading) return <PanelLoader />;
  if (!data) return <p className="text-sm text-muted-foreground text-center py-12">No membership data available.</p>;

  const s = data.summary;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={Crown} label="Total Sales" value={String(s.totalPurchases)} sub={`${s.uniqueSubscribers} subscribers`} color="text-amber-600" />
        <KpiCard icon={CheckCircle2} label="Active" value={String(s.activeCount)} sub="currently active" color="text-emerald-600" />
        <KpiCard icon={Clock} label="Completed" value={String(s.completedCount)} sub="expired or renewed" color="text-blue-600" />
        <KpiCard icon={DollarSign} label="Total Revenue" value={fmt(s.totalRevenueUsd)} sub={`${s.uniquePackages} packages offered`} color="text-violet-600" />
      </div>

      {data.trend.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Monthly Sales Trend (12 months)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number, name: string) => [name === "revenueUsd" ? fmt(v) : v, name === "revenueUsd" ? "Revenue" : "Purchases"]} />
                <Bar dataKey="purchases" name="purchases" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {data.packages.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Package Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-start py-2">Package</th>
                    <th className="text-end py-2">Total Sales</th>
                    <th className="text-end py-2">Active</th>
                    <th className="text-end py-2">Revenue (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.packages.map((p, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 font-medium">{p.name}</td>
                      <td className="text-end py-2">{p.totalSales}</td>
                      <td className="text-end py-2">
                        <Badge variant="secondary" className="text-xs">{p.activeSales}</Badge>
                      </td>
                      <td className="text-end py-2 text-emerald-600 font-medium">{fmt(p.revenueUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AdminPackagesPanel() {
  const { format: fmt } = useAdminCurrency();
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/admin/analytics/commercial"] });

  if (isLoading) return <PanelLoader />;
  if (!data) return <p className="text-sm text-muted-foreground text-center py-12">No package data available.</p>;

  const packages: any[] = data.packageConversion ?? [];
  const promos: any[] = data.promoEffectiveness ?? [];

  const totalPackageSales = packages.reduce((s: number, p: any) => s + (p.purchaseCount ?? 0), 0);
  const totalPackageRevenue = packages.reduce((s: number, p: any) => s + Number(p.revenueUsd ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard icon={Package} label="Total Packages" value={String(packages.length)} sub="active packages" color="text-blue-600" />
        <KpiCard icon={Users} label="Total Sales" value={String(totalPackageSales)} sub="across all packages" color="text-emerald-600" />
        <KpiCard icon={DollarSign} label="Total Revenue" value={fmt(totalPackageRevenue)} sub="USD (all time)" color="text-violet-600" />
      </div>

      {packages.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Package Conversion</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-start py-2">Package</th>
                    <th className="text-end py-2">Purchases</th>
                    <th className="text-end py-2">Revenue (USD)</th>
                    <th className="text-end py-2">Avg Savings</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.map((p: any, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 font-medium">{p.packageName}</td>
                      <td className="text-end py-2">{p.purchaseCount ?? 0}</td>
                      <td className="text-end py-2 text-emerald-600 font-medium">{fmt(Number(p.revenueUsd ?? 0))}</td>
                      <td className="text-end py-2 text-blue-600">{fmt(Number(p.avgSavingsUsd ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {promos.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Promo Code Effectiveness</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {promos.slice(0, 10).map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <span className="font-mono font-medium text-xs bg-muted px-2 py-0.5 rounded">{p.code}</span>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>{p.usageCount ?? 0} uses</span>
                    <span className="text-rose-600">-{fmt(Number(p.totalDiscountUsd ?? 0))}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface ComplianceData {
  providerStatusBreakdown: { status: string; count: number }[];
  documentStatusBreakdown: { documentType: string; verificationStatus: string; count: number }[];
  documentExpiry: { documentType: string; expiring30d: number; expiring60d: number; expiring90d: number; alreadyExpired: number }[];
  pendingKycCount: number;
  recentAuditActivity: { action: string; entityType: string; count: number; lastAt: string }[];
}

const PROVIDER_STATUS_COLOR: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  approved: "bg-emerald-100 text-emerald-700",
  pending_approval: "bg-yellow-100 text-yellow-700",
  submitted: "bg-blue-100 text-blue-700",
  under_review: "bg-purple-100 text-purple-700",
  rejected: "bg-red-100 text-red-700",
  suspended: "bg-orange-100 text-orange-700",
  deactivated: "bg-gray-100 text-gray-600",
  action_required: "bg-rose-100 text-rose-700",
};

function AdminCompliancePanel() {
  const { data, isLoading } = useQuery<ComplianceData>({ queryKey: ["/api/admin/analytics/compliance"] });

  if (isLoading) return <PanelLoader />;
  if (!data) return <p className="text-sm text-muted-foreground text-center py-12">No compliance data available.</p>;

  const totalExpiring30d = data.documentExpiry.reduce((s, d) => s + d.expiring30d, 0);
  const totalExpired = data.documentExpiry.reduce((s, d) => s + d.alreadyExpired, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard icon={Clock} label="Pending KYC" value={String(data.pendingKycCount)} sub="awaiting review" color="text-amber-600" />
        <KpiCard icon={AlertTriangle} label="Docs Expiring (30d)" value={String(totalExpiring30d)} sub="need renewal" color="text-orange-600" />
        <KpiCard icon={AlertTriangle} label="Already Expired" value={String(totalExpired)} sub="require immediate action" color="text-rose-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Provider Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.providerStatusBreakdown
                .sort((a, b) => b.count - a.count)
                .map((s, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Badge className={`text-xs capitalize ${PROVIDER_STATUS_COLOR[s.status] ?? "bg-muted text-muted-foreground"}`}>
                      {s.status.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-sm font-semibold">{s.count}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Document Expiry Status</CardTitle>
          </CardHeader>
          <CardContent>
            {data.documentExpiry.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No expiry data available.</p>
            ) : (
              <div className="space-y-3">
                {data.documentExpiry.map((d, i) => (
                  <div key={i} className="space-y-1">
                    <p className="text-xs font-medium capitalize">{d.documentType.replace(/_/g, " ")}</p>
                    <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <span className={d.expiring30d > 0 ? "text-orange-600 font-medium" : ""}>{d.expiring30d} in 30d</span>
                      <span>{d.expiring60d} in 60d</span>
                      <span className={d.alreadyExpired > 0 ? "text-rose-600 font-medium" : ""}>{d.alreadyExpired} expired</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Document Verification Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-start py-2">Document Type</th>
                  <th className="text-end py-2">Verification Status</th>
                  <th className="text-end py-2">Count</th>
                </tr>
              </thead>
              <tbody>
                {data.documentStatusBreakdown.map((d, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 capitalize">{d.documentType.replace(/_/g, " ")}</td>
                    <td className="text-end py-2 capitalize">{d.verificationStatus.replace(/_/g, " ")}</td>
                    <td className="text-end py-2 font-semibold">{d.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {data.recentAuditActivity.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recent Audit Activity (7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {data.recentAuditActivity.map((a, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <div className="min-w-0">
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{a.action}</span>
                    <span className="text-muted-foreground text-xs ml-2">{a.entityType}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">{a.count}x</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AdminSupportPanel() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/admin/support/analytics"] });

  if (isLoading) return <PanelLoader />;
  if (!data) return <p className="text-sm text-muted-foreground text-center py-12">No support data available.</p>;

  const overview = data.overview ?? {};
  const sla = data.sla ?? {};
  const trend: any[] = data.dailyTrend ?? [];

  const complianceRate = overview.total > 0
    ? Math.round((sla.resolvedWithTimestamp ?? 0) * 100 / overview.total)
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={Headphones} label="Open Tickets" value={String(overview.openCount ?? 0)} sub="awaiting resolution" color="text-amber-600" />
        <KpiCard icon={AlertTriangle} label="Escalated" value={String(overview.escalatedCount ?? 0)} sub="high priority" color="text-rose-600" />
        <KpiCard icon={CheckCircle2} label="Resolved (30d)" value={String(overview.resolvedCount ?? 0)} sub="closed this month" color="text-emerald-600" />
        <KpiCard icon={Clock} label="Avg Resolution" value={sla.avgResolutionHrs != null ? `${Number(sla.avgResolutionHrs).toFixed(1)}h` : "—"} sub={sla.p90ResolutionHrs != null ? `p90: ${Number(sla.p90ResolutionHrs).toFixed(1)}h` : undefined} color="text-blue-600" />
      </div>

      {trend.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Daily Ticket Volume (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="created" name="Created" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="resolved" name="Resolved" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Resolution Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{complianceRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">tickets have resolution timestamps</p>
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Median resolution</span>
                <span className="font-medium">{sla.medianResolutionHrs != null ? `${Number(sla.medianResolutionHrs).toFixed(1)}h` : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span>p90 resolution</span>
                <span className="font-medium">{sla.p90ResolutionHrs != null ? `${Number(sla.p90ResolutionHrs).toFixed(1)}h` : "—"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ticket Status Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-semibold">{overview.total ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Open</span><span className="font-semibold">{overview.openCount ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">In Progress</span><span className="font-semibold">{overview.inProgressCount ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Resolved</span><span className="font-semibold text-emerald-600">{overview.resolvedCount ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Closed</span><span className="font-semibold">{overview.closedCount ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Escalation Rate</span><span className="font-semibold text-rose-600">{(overview.escalationRatePct ?? 0).toFixed(1)}%</span></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const EXPORTS = [
  {
    label: "Financial Overview",
    description: "All completed appointments with revenue breakdown",
    endpoint: "/api/admin/financial/export-csv",
    currency: "USD",
  },
  {
    label: "Appointments",
    description: "Full appointment list with patient, provider, and service details",
    endpoint: "/api/admin/export/appointments.csv",
    currency: "USD",
  },
  {
    label: "Users / Patients",
    description: "All registered patient accounts",
    endpoint: "/api/admin/export/users.csv",
    currency: "N/A",
  },
  {
    label: "Revenue",
    description: "Revenue breakdown with tax and payment details",
    endpoint: "/api/admin/export/revenue.csv",
    currency: "USD",
  },
  {
    label: "Payouts",
    description: "Provider payout requests and payment status",
    endpoint: "/api/admin/export/payouts.csv",
    currency: "USD",
  },
  {
    label: "Master Report",
    description: "Forensic-grade ledger with full booking and payment lifecycle",
    endpoint: "/api/admin/financial/master-report/export/csv",
    currency: "USD",
  },
];

function AdminExportsPanel({ onGoToFinancial }: { onGoToFinancial?: () => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-sm">Platform Data Exports</h3>
        <p className="text-xs text-muted-foreground mt-1">All exports are in CSV format and include data for your country scope. All monetary amounts are in USD.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {EXPORTS.map((ex) => (
          <Card key={ex.endpoint}>
            <CardContent className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{ex.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{ex.description}</p>
                <p className="text-xs text-muted-foreground mt-1">Currency: <span className="font-medium">{ex.currency}</span></p>
              </div>
              <a
                href={ex.endpoint}
                download
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`export-link-${ex.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0">
                  <Download className="h-3.5 w-3.5" />
                  CSV
                </Button>
              </a>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card
        className="border-dashed cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
        onClick={onGoToFinancial}
        data-testid="card-master-report-filtered"
      >
        <CardContent className="p-4 flex items-center gap-3">
          <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium">Master Report (Filtered)</p>
            <p className="text-xs text-muted-foreground">Click to open the Financial tab — apply filters (date range, status, provider) then export the filtered result.</p>
          </div>
          <ExternalLink className="h-4 w-4 text-primary ml-auto shrink-0" />
        </CardContent>
      </Card>
    </div>
  );
}

const SECTIONS = [
  { value: "executive",    label: "Executive",             icon: BarChart3       },
  { value: "financial",    label: "Financial",             icon: DollarSign      },
  { value: "operations",   label: "Operations",            icon: Activity        },
  { value: "providers",    label: "Providers",             icon: Users           },
  { value: "patients",     label: "Patients",              icon: Crown           },
  { value: "memberships",  label: "Memberships",           icon: Package         },
  { value: "packages",     label: "Packages",              icon: Package         },
  { value: "revenue",      label: "Revenue Intel",         icon: TrendingUp      },
  { value: "geographic",   label: "Geographic",            icon: Globe           },
  { value: "compliance",   label: "Compliance",            icon: ShieldCheck     },
  { value: "support",      label: "Support",               icon: Headphones      },
  { value: "exports",      label: "Exports",               icon: Download        },
] as const;

type Section = (typeof SECTIONS)[number]["value"];

export function AdminReportingCenter({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [section, setSection] = useState<Section>("executive");

  return (
    <div className="space-y-4">
      <Tabs value={section} onValueChange={v => setSection(v as Section)}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          {SECTIONS.map(s => (
            <TabsTrigger
              key={s.value}
              value={s.value}
              className="flex items-center gap-1 text-xs"
              data-testid={`tab-reports-${s.value}`}
            >
              <s.icon className="h-3 w-3 shrink-0" />
              <span className="hidden md:inline">{s.label}</span>
              <span className="md:hidden">{s.label.split(" ")[0]}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="executive" className="mt-4">
          <PanelErrorBoundary>
            <AnalyticsOverview onNavigate={onNavigate} />
          </PanelErrorBoundary>
        </TabsContent>

        <TabsContent value="financial" className="mt-4">
          <PanelErrorBoundary>
            <Suspense fallback={<PanelLoader />}>
              <FinancialMasterReport />
            </Suspense>
          </PanelErrorBoundary>
        </TabsContent>

        <TabsContent value="operations" className="mt-4">
          <PanelErrorBoundary>
            <Suspense fallback={<PanelLoader />}>
              <OperationsIntelligenceDashboard />
            </Suspense>
          </PanelErrorBoundary>
        </TabsContent>

        <TabsContent value="providers" className="mt-4">
          <PanelErrorBoundary>
            <Suspense fallback={<PanelLoader />}>
              <EnhancedAnalyticsDashboard />
            </Suspense>
          </PanelErrorBoundary>
        </TabsContent>

        <TabsContent value="patients" className="mt-4">
          <PanelErrorBoundary>
            <AdminPatientsPanel />
          </PanelErrorBoundary>
        </TabsContent>

        <TabsContent value="memberships" className="mt-4">
          <PanelErrorBoundary>
            <AdminMembershipsPanel />
          </PanelErrorBoundary>
        </TabsContent>

        <TabsContent value="packages" className="mt-4">
          <PanelErrorBoundary>
            <AdminPackagesPanel />
          </PanelErrorBoundary>
        </TabsContent>

        <TabsContent value="revenue" className="mt-4">
          <PanelErrorBoundary>
            <Suspense fallback={<PanelLoader />}>
              <RevenueIntelligenceDashboard />
            </Suspense>
          </PanelErrorBoundary>
        </TabsContent>

        <TabsContent value="geographic" className="mt-4">
          <PanelErrorBoundary>
            <Suspense fallback={<PanelLoader />}>
              <LocationAnalyticsPanel />
            </Suspense>
          </PanelErrorBoundary>
        </TabsContent>

        <TabsContent value="compliance" className="mt-4">
          <PanelErrorBoundary>
            <AdminCompliancePanel />
          </PanelErrorBoundary>
        </TabsContent>

        <TabsContent value="support" className="mt-4">
          <PanelErrorBoundary>
            <AdminSupportPanel />
          </PanelErrorBoundary>
        </TabsContent>

        <TabsContent value="exports" className="mt-4">
          <PanelErrorBoundary>
            <AdminExportsPanel onGoToFinancial={() => setSection("financial")} />
          </PanelErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
