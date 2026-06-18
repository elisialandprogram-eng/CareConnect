import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAdminCurrency } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, TrendingDown, Users, UserCheck, RefreshCw, BarChart3, Clock, CheckCircle2 } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

interface EnhancedAnalytics {
  newUsersLast30Days: number;
  newProvidersLast30Days: number;
  activePatients: number;
  returningPatients: number;
  retentionRate: number;
  avgAppointmentsPerPatient: number;
  refundCount: number;
  refundTotal: string;
  topProviders: Array<{ providerId: string; providerName: string; appointmentCount: number; revenue: string }>;
  bookingsByType: Array<{ visitType: string; count: number }>;
  cancelRate: number;
  providerApprovalsPending: number;
  verificationPending: number;
  growthSeries: Array<{ name: string; users: number; providers: number; bookings: number }>;
}

const TYPE_COLORS: Record<string, string> = {
  online: "#6366f1",
  home: "#10b981",
  clinic: "#f59e0b",
};

const GROWTH_COLORS = { users: "#6366f1", providers: "#10b981", bookings: "#f59e0b" };

function StatCard({ icon: Icon, label, value, sub, trend }: {
  icon: any; label: string; value: string | number; sub?: string; trend?: number;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className="p-2.5 rounded-xl bg-muted">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
        {trend !== undefined && (
          <div className="mt-3 flex items-center gap-1">
            {trend >= 0
              ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              : <TrendingDown className="h-3.5 w-3.5 text-rose-500" />}
            <span className={`text-xs font-medium ${trend >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {Math.abs(trend)}%
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function EnhancedAnalyticsDashboard() {
  const { t } = useTranslation();
  const { format: fmtMoney } = useAdminCurrency();

  const { data, isLoading } = useQuery<EnhancedAnalytics>({
    queryKey: ["/api/admin/analytics/enhanced"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const visitTypeData = data.bookingsByType.map((b) => ({
    name: b.visitType.charAt(0).toUpperCase() + b.visitType.slice(1),
    value: b.count,
    color: TYPE_COLORS[b.visitType] ?? "#94a3b8",
  }));

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} label={t("admin.insights.new_patients_30d", "New clients (30d)")} value={data.newUsersLast30Days} />
        <StatCard icon={UserCheck} label={t("admin.insights.new_providers_30d", "New providers (30d)")} value={data.newProvidersLast30Days} />
        <StatCard
          icon={RefreshCw}
          label={t("admin.insights.patient_retention", "Client retention")}
          value={`${data.retentionRate}%`}
          sub={t("admin.insights.returning_active", "{{returning}} returning / {{active}} active", {
            returning: data.returningPatients,
            active: data.activePatients,
          })}
        />
        <StatCard
          icon={BarChart3}
          label={t("admin.insights.avg_appts_patient", "Avg appts / client")}
          value={data.avgAppointmentsPerPatient}
          sub={t("admin.insights.last_90_days", "(last 90 days)")}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={RefreshCw} label={t("admin.insights.refunds_issued", "Refunds issued")} value={data.refundCount} sub={fmtMoney(parseFloat(data.refundTotal))} />
        <StatCard icon={TrendingDown} label={t("admin.insights.cancellation_rate", "Cancellation rate")} value={`${data.cancelRate}%`} />
        <StatCard icon={Clock} label={t("admin.insights.approvals_pending", "Provider approvals pending")} value={data.providerApprovalsPending} />
        <StatCard icon={CheckCircle2} label={t("admin.insights.docs_pending_verify", "Documents pending verify")} value={data.verificationPending} />
      </div>

      {/* Growth series */}
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.insights.growth_trends", "Growth trends (last 6 months)")}</CardTitle>
          <CardDescription>{t("admin.insights.growth_desc", "New clients, providers, and bookings each month")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.growthSeries} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
              <defs>
                {Object.entries(GROWTH_COLORS).map(([k, c]) => (
                  <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={c} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={c} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
              <Legend />
              {(Object.entries(GROWTH_COLORS) as [string, string][]).map(([k, c]) => (
                <Area key={k} type="monotone" dataKey={k} stroke={c} strokeWidth={2} fill={`url(#grad-${k})`} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top providers */}
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.insights.top_providers", "Top providers by completed bookings")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topProviders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t("admin.insights.no_bookings", "No completed bookings yet")}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.topProviders} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="providerName" tick={{ fontSize: 11 }} width={110} />
                  <Tooltip
                    formatter={(val: any, name: string) => [name === "appointmentCount" ? val : fmtMoney(parseFloat(val)), name === "appointmentCount" ? t("admin.insights.appointments_col", "Appointments") : t("admin.insights.revenue_col", "Revenue")]}
                    contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                  />
                  <Bar dataKey="appointmentCount" fill="#6366f1" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Visit type breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.insights.visit_type_breakdown", "Bookings by visit type")}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-6">
            {visitTypeData.length === 0 ? (
              <p className="text-sm text-muted-foreground w-full text-center py-4">
                {t("admin.insights.no_booking_data", "No booking data")}
              </p>
            ) : (
              <>
                <ResponsiveContainer width="55%" height={200}>
                  <PieChart>
                    <Pie data={visitTypeData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={3} dataKey="value">
                      {visitTypeData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2">
                  {visitTypeData.map((d) => (
                    <div key={d.name} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                      <span>{d.name}</span>
                      <span className="ml-auto font-semibold tabular-nums text-muted-foreground">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Provider table */}
      {data.topProviders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.insights.provider_performance", "Provider performance detail")}</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4">{t("admin.insights.provider_col", "Provider")}</th>
                  <th className="text-right py-2 pr-4">{t("admin.insights.appointments_col", "Appointments")}</th>
                  <th className="text-right py-2">{t("admin.insights.revenue_col", "Revenue")}</th>
                </tr>
              </thead>
              <tbody>
                {data.topProviders.map((p) => (
                  <tr key={p.providerId} className="border-b last:border-0" data-testid={`row-provider-perf-${p.providerId}`}>
                    <td className="py-2.5 pr-4 font-medium">{p.providerName}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      <Badge variant="secondary">{p.appointmentCount}</Badge>
                    </td>
                    <td className="py-2.5 text-right tabular-nums font-semibold">
                      {fmtMoney(parseFloat(p.revenue))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
