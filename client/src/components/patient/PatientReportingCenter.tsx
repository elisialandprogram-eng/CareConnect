import { formatDate, formatMonthLabel } from "@/lib/datetime";
import { reportPackageStatusLabel, reportProviderTypeLabel } from "@/lib/report-localization";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity, TrendingUp, Calendar, DollarSign, Package, Star,
  Clock, FileText, Heart, Users, Download, ChevronRight,
} from "lucide-react";
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

interface PatientAnalytics {
  stats: {
    total: number;
    completed: number;
    cancelled: number;
    upcoming: number;
    totalSpend: number;
    spend30d: number;
    spendThisMonth: number;
  };
  monthlySpend: { month: string; spend: number; completed: number; cancelled: number }[];
  topProviders: { providerId: string; name: string; type: string; visitCount: number; lastVisit: string; totalSpent: number }[];
  packages: { name: string; status: string; purchasedAt: string; expiresAt: string | null; priceNative: number; usedSessions: number; totalSessions: number | null }[];
}

const PACKAGE_STATUS_COLOR: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  expired: "bg-gray-100 text-gray-500",
  cancelled: "bg-red-100 text-red-700",
  pending: "bg-yellow-100 text-yellow-700",
  renewed: "bg-blue-100 text-blue-700",
};

function KpiCard({ icon: Icon, label, value, sub, color = "text-primary" }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`mt-0.5 p-2 rounded-lg bg-muted ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-xl font-bold leading-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="text-center py-16 text-muted-foreground">
      <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
      <p className="text-sm">{t("patient_reporting.no_activity_data", "No activity data yet. Book your first appointment to get started.")}</p>
    </div>
  );
}

function OverviewTab({ data, formatPrice }: { data: PatientAnalytics; formatPrice: (v: number) => string }) {
  const { t } = useTranslation();
  const { stats, monthlySpend, topProviders } = data;
  const localizedMonthlySpend = monthlySpend.map((month) => ({
    ...month,
    month: formatMonthLabel(month.month),
  }));
  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={DollarSign} label={t("patient_reporting.total_spent", "Total Spent")} value={formatPrice(stats.totalSpend)} sub={`${formatPrice(stats.spendThisMonth)} ${t("patient_reporting.this_month", "this month")}`} color="text-green-600" />
        <KpiCard icon={Calendar} label={t("patient_reporting.completed", "Completed")} value={String(stats.completed)} sub={`${completionRate}% ${t("patient_reporting.completion_rate", "completion rate")}`} color="text-blue-600" />
        <KpiCard icon={Activity} label={t("patient_reporting.upcoming", "Upcoming")} value={String(stats.upcoming)} sub={t("patient_reporting.scheduled_appointments", "scheduled appointments")} color="text-purple-600" />
        <KpiCard icon={TrendingUp} label={t("patient_reporting.last_30_days", "Last 30 Days")} value={formatPrice(stats.spend30d)} sub={`${stats.cancelled} ${t("patient_reporting.cancelled_total", "cancelled total")}`} color="text-orange-600" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t("patient_reporting.monthly_spending", "Monthly Spending (12 months)")}</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlySpend.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t("patient_reporting.no_spending_data", "No spending data yet.")}</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={140}>
                   <BarChart data={localizedMonthlySpend}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                    <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} tickFormatter={v => formatPrice(v)} width={55} />
                    <Tooltip formatter={(v: number) => [formatPrice(v), t("patient_reporting.spend", "Spend")]} />
                    <Bar dataKey="spend" fill="hsl(var(--primary) / 0.7)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span>{t("patient_reporting.avg", "Avg")}: {formatPrice(monthlySpend.reduce((s, m) => s + m.spend, 0) / monthlySpend.length)}</span>
                  <span>{t("patient_reporting.peak", "Peak")}: {formatPrice(Math.max(...monthlySpend.map(m => m.spend)))}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Star className="h-4 w-4 text-yellow-500" /> {t("patient_reporting.my_providers", "My Providers")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topProviders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t("patient_reporting.complete_appointment", "Complete an appointment to see your providers.")}</p>
            ) : (
              <div className="space-y-2.5">
                {topProviders.slice(0, 5).map((p, i) => (
                  <div key={p.providerId} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{reportProviderTypeLabel(t, p.type)}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                       <p className="text-xs font-semibold">{t("patient_reporting.visits", "{{count}} visits", { count: p.visitCount })}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HealthActivityTab({ data, formatPrice }: { data: PatientAnalytics; formatPrice: (v: number) => string }) {
  const { t } = useTranslation();
  const { monthlySpend, topProviders } = data;
  const localizedMonthlySpend = monthlySpend.map((month) => ({
    ...month,
    month: formatMonthLabel(month.month),
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t("patient_reporting.monthly_health_activity", "Monthly Health Activity (12 months)")}</CardTitle>
        </CardHeader>
        <CardContent>
          {monthlySpend.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t("patient_reporting.no_activity", "No activity yet.")}</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
               <BarChart data={localizedMonthlySpend}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="completed" name={t("patient_reporting.completed", "Completed")} fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" />
                <Bar dataKey="cancelled" name={t("patient_reporting.cancelled", "Cancelled")} fill="#f43f5e" radius={[4, 4, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {topProviders.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t("patient_reporting.provider_activity", "Provider Activity")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topProviders.map((p, i) => (
                <div key={p.providerId} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{reportProviderTypeLabel(t, p.type)}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold">{t("patient_reporting.visits", "{{count}} visits", { count: p.visitCount })}</p>
                    <p className="text-xs text-muted-foreground">{t("patient_reporting.last", "Last")}: {formatDate(p.lastVisit)}</p>
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

function AppointmentsTab({ data }: { data: PatientAnalytics }) {
  const { t } = useTranslation();
  const { stats, monthlySpend } = data;
  const localizedMonthlySpend = monthlySpend.map((month) => ({
    ...month,
    month: formatMonthLabel(month.month),
  }));
  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const cancelRate = stats.total > 0 ? Math.round((stats.cancelled / stats.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={Calendar} label={t("patient_reporting.total", "Total")} value={String(stats.total)} color="text-blue-600" />
        <KpiCard icon={Activity} label={t("patient_reporting.completed", "Completed")} value={String(stats.completed)} sub={`${completionRate}% ${t("patient_reporting.rate", "rate")}`} color="text-emerald-600" />
        <KpiCard icon={Clock} label={t("patient_reporting.upcoming", "Upcoming")} value={String(stats.upcoming)} color="text-purple-600" />
        <KpiCard icon={TrendingUp} label={t("patient_reporting.cancelled", "Cancelled")} value={String(stats.cancelled)} sub={`${cancelRate}% ${t("patient_reporting.cancel_rate", "cancel rate")}`} color="text-rose-600" />
      </div>

      {monthlySpend.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t("patient_reporting.booking_trends", "Booking Trends (12 months)")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
                 <AreaChart data={localizedMonthlySpend}>
                <defs>
                  <linearGradient id="cmpGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Area type="monotone" dataKey="completed" name={t("patient_reporting.completed", "Completed")} stroke="#10b981" fill="url(#cmpGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="cancelled" name={t("patient_reporting.cancelled", "Cancelled")} stroke="#f43f5e" fill="none" strokeWidth={1.5} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SpendingTab({ data, formatPrice }: { data: PatientAnalytics; formatPrice: (v: number) => string }) {
  const { t } = useTranslation();
  const { stats, monthlySpend } = data;
  const localizedMonthlySpend = monthlySpend.map((month) => ({
    ...month,
    month: formatMonthLabel(month.month),
  }));
  const yearlySpend = monthlySpend.reduce((s, m) => s + m.spend, 0);
  const avgMonthly = monthlySpend.length ? yearlySpend / monthlySpend.length : 0;
  const peak = localizedMonthlySpend.reduce((b, m) => m.spend > b.spend ? m : b, localizedMonthlySpend[0] ?? { spend: 0, month: "" });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={DollarSign} label={t("patient_reporting.lifetime_spend", "Lifetime Spend")} value={formatPrice(stats.totalSpend)} color="text-green-600" />
        <KpiCard icon={TrendingUp} label={t("patient_reporting.this_year", "This Year (12mo)")} value={formatPrice(yearlySpend)} color="text-blue-600" />
        <KpiCard icon={Activity} label={t("patient_reporting.avg_month", "Avg / Month")} value={formatPrice(avgMonthly)} color="text-purple-600" />
        <KpiCard icon={Clock} label={t("patient_reporting.last_30_days", "Last 30 Days")} value={formatPrice(stats.spend30d)} color="text-orange-600" />
      </div>

      {monthlySpend.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span>{t("patient_reporting.monthly_spending_short", "Monthly Spending")}</span>
              <span className="text-xs font-normal text-muted-foreground">{t("patient_reporting.peak", "Peak")}: {peak.month} ({formatPrice(peak.spend)})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
                 <BarChart data={localizedMonthlySpend}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => formatPrice(v)} width={60} />
                <Tooltip formatter={(v: number) => [formatPrice(v), t("patient_reporting.spend", "Spend")]} />
                <Bar dataKey="spend" fill="hsl(var(--primary) / 0.7)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MembershipsTab({ data, formatPrice }: { data: PatientAnalytics; formatPrice: (v: number) => string }) {
  const { t } = useTranslation();
  const memberships = data.packages.filter(p => p.totalSessions == null);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{t("patient_reporting.memberships_title", "Memberships & Unlimited Packages")}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{t("patient_reporting.memberships_desc", "Subscription-style plans without a fixed session count.")}</p>
      </div>

      {memberships.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Crown className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t("patient_reporting.no_memberships", "No memberships yet.")}</p>
            <p className="text-xs mt-1">{t("patient_reporting.explore_memberships", "Explore available memberships to get discounts and benefits.")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {memberships.map((m, i) => (
            <Card key={i}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{m.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("patient_reporting.purchased", "Purchased {{date}}", { date: formatDate(m.purchasedAt) })}
                    {m.expiresAt && ` · ${t("patient_reporting.expires", "Expires {{date}}", { date: formatDate(m.expiresAt) })}`}
                  </p>
                </div>
                <Badge className={`text-xs capitalize shrink-0 ${PACKAGE_STATUS_COLOR[m.status] ?? "bg-muted text-muted-foreground"}`}>
                    {reportPackageStatusLabel(t, m.status)}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Crown({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 6.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 7.019a.5.5 0 0 1 .798-.519l4.276 2.664a1 1 0 0 0 1.516-.294z"/>
      <path d="M5 21h14"/>
    </svg>
  );
}

function PackagesTab({ data, formatPrice }: { data: PatientAnalytics; formatPrice: (v: number) => string }) {
  const { t } = useTranslation();
  const packages = data.packages.filter(p => p.totalSessions != null);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{t("patient_reporting.session_packages_title", "Session Packages")}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{t("patient_reporting.session_packages_desc", "Fixed-session packages with usage tracking.")}</p>
      </div>

      {packages.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t("patient_reporting.no_session_packages", "No session packages yet.")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {packages.map((pkg, i) => {
            const pct = pkg.totalSessions ? (pkg.usedSessions / pkg.totalSessions) * 100 : 0;
            return (
              <Card key={i}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm">{pkg.name}</p>
                    <Badge className={`text-xs capitalize ${PACKAGE_STATUS_COLOR[pkg.status] ?? "bg-muted text-muted-foreground"}`}>
                    {reportPackageStatusLabel(t, pkg.status)}
                    </Badge>
                  </div>
                  {pkg.totalSessions && (
                    <>
                      <div className="flex justify-between text-xs text-muted-foreground">
                         <span>{t("patient_reporting.sessions_used", "{{used}} / {{total}} sessions used", { used: pkg.usedSessions, total: pkg.totalSessions })}</span>
                         <span>{t("patient_reporting.complete", "{{percent}}% complete", { percent: pct.toFixed(0) })}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div className="h-1.5 bg-primary rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </>
                  )}
                  <p className="text-xs text-muted-foreground">
                     {t("patient_reporting.purchased", "Purchased {{date}}", { date: formatDate(pkg.purchasedAt) })}
                     {pkg.expiresAt && ` · ${t("patient_reporting.expires", "Expires {{date}}", { date: formatDate(pkg.expiresAt) })}`}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DocumentsTab() {
  const { t } = useTranslation();
  const { data: prescriptions, isLoading: presLoading } = useQuery<any[]>({
    queryKey: ["/api/patient/prescriptions"],
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold">{t("patient_reporting.my_documents", "My Documents")}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{t("patient_reporting.documents_desc", "Prescriptions, reports, and invoices from your care team.")}</p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" /> {t("patient_reporting.prescriptions", "Prescriptions")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {presLoading ? (
              <Skeleton className="h-16" />
            ) : (prescriptions ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t("patient_reporting.no_prescriptions", "No prescriptions yet.")}</p>
            ) : (
              <div className="space-y-2">
                {(prescriptions ?? []).slice(0, 10).map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0">
                    <div className="min-w-0">
                       <p className="text-sm font-medium">{p.medication ?? t("patient_reporting.prescription", "Prescription")}</p>
                      <p className="text-xs text-muted-foreground">{p.createdAt ? formatDate(p.createdAt) : ""}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Download className="h-4 w-4" /> {t("patient_reporting.invoices", "Invoices")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t("patient_reporting.invoices_desc", "Download invoices from your appointment history in the main dashboard.")}</p>
            <Button variant="outline" size="sm" className="mt-3 gap-1.5" asChild>
              <a href="/patient-dashboard">
                {t("patient_reporting.go_appointments", "Go to My Appointments")} <ChevronRight className="h-3.5 w-3.5" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TimelineTab({ data, formatPrice }: { data: PatientAnalytics; formatPrice: (v: number) => string }) {
  const { t } = useTranslation();
  const { monthlySpend, topProviders } = data;
  const eventsFromMonthly = [...monthlySpend].reverse().map(m => ({
    type: "monthly" as const,
    month: formatMonthLabel(m.month),
    completed: m.completed,
    cancelled: m.cancelled,
    spend: m.spend,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{t("patient_reporting.health_timeline", "Health Timeline")}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{t("patient_reporting.timeline_desc", "Your healthcare journey, month by month.")}</p>
      </div>

      {eventsFromMonthly.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Heart className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t("patient_reporting.no_activity_recorded", "No activity recorded yet.")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {eventsFromMonthly.map((e, i) => (
            <Card key={i}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-16 text-center shrink-0">
                  <p className="text-xs font-semibold">{e.month}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    {e.completed > 0 && (
                      <span className="flex items-center gap-1 text-emerald-600">
                         <Activity className="h-3 w-3" />{t("patient_reporting.completed_count", "{{count}} completed", { count: e.completed })}
                      </span>
                    )}
                    {e.cancelled > 0 && (
                      <span className="flex items-center gap-1 text-rose-500">
                         <Clock className="h-3 w-3" />{t("patient_reporting.cancelled_count", "{{count}} cancelled", { count: e.cancelled })}
                      </span>
                    )}
                  </div>
                </div>
                {e.spend > 0 && (
                  <span className="text-xs font-medium text-emerald-600 shrink-0">{formatPrice(e.spend)}</span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {topProviders.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" /> {t("patient_reporting.providers_visited", "Providers Visited")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topProviders.map((p, i) => (
                <div key={p.providerId} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{reportProviderTypeLabel(t, p.type)}</p>
                    </div>
                  </div>
                   <span className="text-xs text-muted-foreground shrink-0">{t("patient_reporting.visits", "{{count}} visits", { count: p.visitCount })}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const SECTIONS = [
  { value: "overview",    labelKey: "overview",       icon: Activity   },
  { value: "activity",    labelKey: "health_activity", icon: Heart      },
  { value: "appointments", labelKey: "appointments",  icon: Calendar   },
  { value: "spending",    labelKey: "spending",        icon: DollarSign },
  { value: "memberships", labelKey: "memberships",     icon: Star       },
  { value: "packages",    labelKey: "packages",        icon: Package    },
  { value: "documents",   labelKey: "documents",       icon: FileText   },
  { value: "timeline",    labelKey: "timeline",        icon: Clock      },
] as const;

type Section = (typeof SECTIONS)[number]["value"];

export function PatientReportingCenter() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { format: formatPrice } = useCurrency();
  const [section, setSection] = useState<Section>("overview");

  const { data, isLoading } = useQuery<PatientAnalytics>({
    queryKey: ["/api/patient/analytics"],
    enabled: !!user,
  });

  if (isLoading) return <LoadingSkeleton />;
  if (!data) return <EmptyState />;

  return (
    <div className="space-y-4">
      <Tabs value={section} onValueChange={v => setSection(v as Section)}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          {SECTIONS.map(s => (
            <TabsTrigger
              key={s.value}
              value={s.value}
              className="flex items-center gap-1 text-xs"
              data-testid={`tab-patient-reports-${s.value}`}
            >
              <s.icon className="h-3 w-3 shrink-0" />
               <span className="hidden sm:inline">{t(`patient_reporting.section_${s.labelKey}`)}</span>
               <span className="sm:hidden">{t(`patient_reporting.section_${s.labelKey}`).split(" ")[0]}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab data={data} formatPrice={formatPrice} />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <HealthActivityTab data={data} formatPrice={formatPrice} />
        </TabsContent>
        <TabsContent value="appointments" className="mt-4">
          <AppointmentsTab data={data} />
        </TabsContent>
        <TabsContent value="spending" className="mt-4">
          <SpendingTab data={data} formatPrice={formatPrice} />
        </TabsContent>
        <TabsContent value="memberships" className="mt-4">
          <MembershipsTab data={data} formatPrice={formatPrice} />
        </TabsContent>
        <TabsContent value="packages" className="mt-4">
          <PackagesTab data={data} formatPrice={formatPrice} />
        </TabsContent>
        <TabsContent value="documents" className="mt-4">
          <DocumentsTab />
        </TabsContent>
        <TabsContent value="timeline" className="mt-4">
          <TimelineTab data={data} formatPrice={formatPrice} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
