import { formatDate } from "@/lib/datetime";
import { formatCount } from "@/lib/format-utils";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAdminCurrency } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, Building, Calendar, DollarSign, TrendingUp, Banknote, CheckCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export function RevenueKpiCard({
  label,
  value,
  hint,
  icon: Icon,
  gradient,
  testId,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  gradient: string;
  testId?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`${gradient} text-white border-0 shadow-lg${onClick ? " cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
      data-testid={testId}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">{label}</p>
            <p className="text-2xl font-bold mt-1 tabular-nums">{value}</p>
            {hint && (
              <p className="text-xs text-white/70 mt-1">{hint}</p>
            )}
          </div>
          <div className="rounded-xl bg-white/20 p-3">
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AnalyticsOverview({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { t } = useTranslation();
  const { format: fmtMoney } = useAdminCurrency();

  const { data: analytics, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/analytics"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const series: any[] = Array.isArray(analytics?.revenueSeries) && analytics.revenueSeries.length > 0
    ? analytics.revenueSeries
    : Array.from({ length: 12 }, (_, i) => ({
        name: formatDate(new Date(0, i), { month: "short" }),
        revenue: 0,
        bookings: 0,
      }));

  const pieData = [
    {
      name: t("admin.pending", "Pending"),
      value: analytics?.pendingBookings || 0,
      color: "#f59e0b",
    },
    {
      name: t("admin.confirmed", "Confirmed"),
      value: analytics?.confirmedBookings || 0,
      color: "#6366f1",
    },
    {
      name: t("admin.completed", "Completed"),
      value: analytics?.completedBookings || 0,
      color: "#10b981",
    },
    {
      name: t("admin.cancelled", "Cancelled"),
      value: analytics?.cancelledBookings || 0,
      color: "#ef4444",
    },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">
          {t("admin.platform_overview", "Platform overview")}
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <RevenueKpiCard
            label={t("admin.total_revenue", "Total revenue")}
            value={fmtMoney(analytics?.totalRevenue || 0)}
            hint={t("admin.all_time", "All time")}
            icon={DollarSign}
            gradient="bg-gradient-to-br from-emerald-500 via-green-600 to-teal-600"
            testId="kpi-total-revenue"
          />
          <RevenueKpiCard
            label={t("admin.total_users", "Total users")}
            value={formatCount(analytics?.totalUsers || 0)}
            hint={t("admin.registered_patients", "Registered clients — click to manage")}
            icon={Users}
            gradient="bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600"
            testId="kpi-total-users"
            onClick={onNavigate ? () => onNavigate("users") : undefined}
          />
          <RevenueKpiCard
            label={t("admin.total_providers", "Total providers")}
            value={formatCount(analytics?.totalProviders || 0)}
            hint={t("admin.active_services", "Active services — click to manage")}
            icon={Building}
            gradient="bg-gradient-to-br from-rose-500 via-pink-600 to-fuchsia-600"
            testId="kpi-total-providers"
            onClick={onNavigate ? () => onNavigate("providers") : undefined}
          />
          <RevenueKpiCard
            label={t("admin.total_bookings", "Total bookings")}
            value={formatCount(analytics?.totalBookings || 0)}
            hint={t("admin.all_statuses", "All statuses — click to manage")}
            icon={Calendar}
            gradient="bg-gradient-to-br from-amber-500 via-orange-500 to-red-500"
            testId="kpi-total-bookings"
            onClick={onNavigate ? () => onNavigate("bookings") : undefined}
          />
        </div>
      </div>

      <div>
        <h3 className="text-base font-medium mb-4">
          {t("admin.financial_kpis", "Financial KPIs")}
        </h3>
        <div className="grid gap-4 md:grid-cols-3">
          <RevenueKpiCard
            label={t("admin.platform_fees", "Platform fees")}
            value={fmtMoney(analytics?.platformFees || 0)}
            hint={t("admin.fees_collected", "Fees collected from completed bookings")}
            icon={TrendingUp}
            gradient="bg-gradient-to-br from-violet-500 via-purple-600 to-fuchsia-600"
            testId="kpi-platform-fees"
          />
          <RevenueKpiCard
            label={t("admin.provider_payouts", "Provider payouts")}
            value={fmtMoney(analytics?.providerPayouts || 0)}
            hint={t("admin.owed_to_providers", "Owed to providers — click to manage")}
            icon={Banknote}
            gradient="bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-600"
            testId="kpi-provider-payouts"
            onClick={onNavigate ? () => onNavigate("payouts") : undefined}
          />
          <RevenueKpiCard
            label={t("admin.avg_booking_value", "Avg booking value")}
            value={fmtMoney(analytics?.avgBookingValue || 0)}
            hint={t("admin.based_on_completed", "Based on completed bookings")}
            icon={CheckCircle}
            gradient="bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500"
            testId="kpi-avg-booking"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t("admin.revenue_trend", "Revenue trend")}</CardTitle>
                <CardDescription>
                  {t("admin.last_12_months", "Last 12 months")}
                </CardDescription>
              </div>
              <Badge variant="secondary" className="text-xs">
                {t("admin.this_month", "This month")}:{" "}
                {fmtMoney(analytics?.revenueThisMonth || 0)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={series}>
                <defs>
                  <linearGradient
                    id="revenueGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) =>
                    fmtMoney(v).replace(/\.\d+/, "")
                  }
                />
                <Tooltip
                  formatter={(v: any) => fmtMoney(Number(v))}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid hsl(var(--border))",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="url(#revenueGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("admin.bookings_trend", "Bookings trend")}</CardTitle>
            <CardDescription>
              {t("admin.last_12_months", "Last 12 months")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid hsl(var(--border))",
                  }}
                />
                <Bar
                  dataKey="bookings"
                  fill="#6366f1"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>
              {t("admin.appointment_status", "Appointment status")}
            </CardTitle>
            <CardDescription>
              {t("admin.current_distribution", "Current distribution")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <ResponsiveContainer width="60%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2">
                {pieData.map((entry, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="font-medium">{entry.name}</span>
                    <span className="ml-auto text-muted-foreground tabular-nums">
                      {entry.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("admin.today_snapshot", "Today's snapshot")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">
                {t("admin.today_revenue", "Today's revenue")}
              </span>
              <span
                className="text-xl font-bold tabular-nums"
                data-testid="text-revenue-today"
              >
                {fmtMoney(analytics?.revenueToday || 0)}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">
                {t("admin.this_month", "This month")}
              </span>
              <span className="text-base font-semibold tabular-nums">
                {fmtMoney(analytics?.revenueThisMonth || 0)}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">
                {t("admin.last_month", "Last month")}
              </span>
              <span className="text-base font-semibold tabular-nums">
                {fmtMoney(analytics?.revenueLastMonth || 0)}
              </span>
            </div>
            <div className="border-t pt-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t("admin.growth", "Growth")}
              </span>
              <Badge
                variant="outline"
                className={
                  (analytics?.revenueGrowthPct || 0) >= 0
                    ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300"
                }
              >
                {(analytics?.revenueGrowthPct || 0) >= 0 ? "▲" : "▼"}{" "}
                {Math.abs(analytics?.revenueGrowthPct || 0).toFixed(1)}%
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
