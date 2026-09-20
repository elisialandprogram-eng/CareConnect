import { formatDate } from "@/lib/datetime";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Loader2, TrendingUp, BarChart2, BarChart3, DollarSign, Users, Star,
  Calendar, Clock, Activity, Briefcase, CreditCard, Download, Globe,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QK } from "@/lib/query-keys";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface AnalyticsData {
  canonical_currency: string;
  serviceBreakdown: { serviceId: string; name: string; bookings: number; revenue: number; avgRating: number }[];
  ratingDistribution: { star: number; count: number }[];
  monthlyTrend: { month: string; revenue: number; bookings: number; cancellations: number; noShows: number }[];
  scheduleHealth: { utilizationPct: number; bookedSlots: number; totalSlots: number };
  referralStats: { total: number; converted: number; earned: number };
  packagePerformance: { packageId: string; name: string; bookingsUsed: number }[];
}

interface InsightsData {
  canonical_currency: string;
  weeklyRevenue: { week: string; revenue: number; count: number }[];
  heatmap: number[][];
  kpi: {
    cancellationRate: number;
    utilizationPct: number;
    repeatPatientPct: number;
    lostBookings: number;
    totalCompleted: number;
    totalBookings: number;
  };
  popularServices: { name: string; count: number }[];
  repeatPatients: { patientId: string; name: string; visitCount: number; lastVisit: string }[];
  growthTips: string[];
}

interface EarningsData {
  earnings: any[];
  summary: {
    totalEarnings: number;
    pendingEarnings: number;
    pendingAmount?: number;
    paidEarnings: number;
    grossProviderPayout?: number;
  };
}

interface WalletData {
  available_balance: number;
  held_balance: number;
  pending_balance: number;
  lifetime_earnings: number;
  monthly: { month: string; net: number }[];
}

interface PayoutSummaryData {
  walletBalance: number;
  inFlight: number;
  lifetimePaid: number;
  pendingCount: number;
  completedCount: number;
}

const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function PanelLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function KpiCard({ label, value, sub, icon: Icon, color = "text-primary" }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 flex items-start gap-3">
        <div className={`mt-0.5 p-2 rounded-lg bg-muted ${color}`}>
          <Icon className="h-3.5 w-3.5" />
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

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-muted-foreground">
        <Icon className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">{message}</p>
      </CardContent>
    </Card>
  );
}

function OverviewTab({ analytics, insights, fmtMoney }: { analytics?: AnalyticsData; insights?: InsightsData; fmtMoney: (v: number) => string }) {
  const { t } = useTranslation();
  if (!analytics && !insights) return <EmptyState icon={BarChart3} message={t("provider_dashboard.reporting_complete_appointments", "Complete some appointments to see your overview.")} />;

  const kpi = insights?.kpi;
  const totalRevenue = (analytics?.monthlyTrend ?? []).reduce((s, m) => s + m.revenue, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={DollarSign} label={t("provider_dashboard.reporting_total_revenue", "Total Revenue (12mo)")} value={fmtMoney(totalRevenue)} color="text-emerald-600" />
        <KpiCard icon={Calendar} label={t("provider_dashboard.reporting_completed", "Completed")} value={String(kpi?.totalCompleted ?? 0)} sub={t("provider_dashboard.reporting_appointments", "appointments")} color="text-blue-600" />
        <KpiCard icon={Users} label={t("provider_dashboard.reporting_repeat_patients", "Repeat Members")} value={`${(kpi?.repeatPatientPct ?? 0).toFixed(1)}%`} sub={t("provider_dashboard.reporting_come_back", "come back")} color="text-violet-600" />
        <KpiCard icon={Activity} label={t("provider_dashboard.reporting_utilization", "Utilization")} value={`${(kpi?.utilizationPct ?? 0).toFixed(1)}%`} sub={t("provider_dashboard.reporting_slots_filled", "of slots filled")} color="text-amber-600" />
      </div>

      {(analytics?.monthlyTrend ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> {t("provider_dashboard.reporting_monthly_performance", "Monthly Performance (12 months)")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={analytics!.monthlyTrend}>
                <defs>
                  <linearGradient id="revOvGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtMoney(v)} width={65} />
                <Tooltip formatter={(v: number, name: string) => [name === "revenue" ? fmtMoney(v) : v, name]} />
                <Area type="monotone" dataKey="revenue" name={t("provider_dashboard.analytics_revenue", "Revenue")} stroke="#10b981" fill="url(#revOvGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {(insights?.growthTips ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("provider_dashboard.growth_recommendations", "Growth Recommendations")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {insights!.growthTips.map((tip, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="text-amber-500 shrink-0">💡</span>
                  <p className="text-muted-foreground leading-relaxed">{tip}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RevenueTab({ analytics, insights, fmtMoney }: { analytics?: AnalyticsData; insights?: InsightsData; fmtMoney: (v: number) => string }) {
  const { t } = useTranslation();
  if (!analytics) return <EmptyState icon={DollarSign} message={t("provider_dashboard.reporting_no_revenue", "No revenue data yet.")} />;

  const trend = analytics.monthlyTrend ?? [];
  const totalRevenue = trend.reduce((s, m) => s + m.revenue, 0);
  const avgMonthly = trend.length ? totalRevenue / trend.length : 0;
  const bestMonth = trend.reduce((b, m) => m.revenue > b.revenue ? m : b, trend[0] ?? { revenue: 0, month: "" });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard icon={DollarSign} label={t("provider_dashboard.reporting_total_revenue", "Total Revenue (12mo)")} value={fmtMoney(totalRevenue)} color="text-emerald-600" />
        <KpiCard icon={TrendingUp} label={t("provider_dashboard.reporting_avg_month", "Avg / Month")} value={fmtMoney(avgMonthly)} color="text-blue-600" />
        <KpiCard icon={BarChart3} label={t("provider_dashboard.reporting_best_month", "Best Month")} value={bestMonth.month} sub={fmtMoney(bestMonth.revenue)} color="text-violet-600" />
      </div>

      {trend.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("provider_dashboard.reporting_monthly_revenue", "Monthly Revenue Trend")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtMoney(v)} width={65} />
                <Tooltip formatter={(v: number) => [fmtMoney(v), t("provider_dashboard.analytics_revenue", "Revenue")]} />
                <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {(insights?.weeklyRevenue ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("provider_dashboard.reporting_12_week_revenue", "12-Week Revenue")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={insights!.weeklyRevenue}>
                <defs>
                  <linearGradient id="wkRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtMoney(v)} width={65} />
                <Tooltip formatter={(v: number) => [fmtMoney(v), t("provider_dashboard.analytics_revenue", "Revenue")]} />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#wkRevGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {(analytics.serviceBreakdown ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("provider_dashboard.reporting_revenue_by_service", "Revenue by Service")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analytics.serviceBreakdown.slice(0, 8).map((s, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <span className="truncate max-w-[200px]">{s.name}</span>
                  <span className="text-emerald-600 font-medium">{fmtMoney(s.revenue)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PatientsTab({ insights, fmtMoney }: { insights?: InsightsData; fmtMoney: (v: number) => string }) {
  const { t } = useTranslation();
  if (!insights) return <EmptyState icon={Users} message={t("provider_dashboard.reporting_no_patient_data", "No member data yet.")} />;

  const kpi = insights.kpi;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard icon={Users} label={t("provider_dashboard.reporting_total_patients", "Total Members")} value={String(kpi.totalBookings)} sub={t("provider_dashboard.reporting_unique_visits", "unique visits")} color="text-blue-600" />
        <KpiCard icon={TrendingUp} label={t("provider_dashboard.reporting_repeat_rate", "Repeat Rate")} value={`${kpi.repeatPatientPct.toFixed(1)}%`} sub={t("provider_dashboard.reporting_return_patients", "return members")} color="text-emerald-600" />
        <KpiCard icon={Activity} label={t("provider_dashboard.reporting_lost_bookings", "Lost Bookings")} value={String(kpi.lostBookings)} sub={t("provider_dashboard.reporting_cancelled_rejected", "cancelled / rejected")} color="text-rose-600" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
             {t("provider_dashboard.loyal_patients", "Loyal Members")}
            <Badge variant="secondary">{insights.repeatPatients.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {insights.repeatPatients.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t("provider_dashboard.reporting_no_repeat_patients", "No repeat members yet.")}</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {insights.repeatPatients.map(p => (
                <div key={p.patientId} className="flex justify-between items-center text-sm py-1.5 border-b last:border-0">
                  <div className="min-w-0">
                    <p className="font-medium truncate max-w-[160px]">{p.name}</p>
                     <p className="text-xs text-muted-foreground">{t("provider_dashboard.last_visit", "Last visit")}: {formatDate(p.lastVisit)}</p>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-3">
                     <Badge variant="secondary">{t("provider_dashboard.visits_count", "{{count}} visits", { count: p.visitCount })}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BookingsTab({ analytics, fmtMoney }: { analytics?: AnalyticsData; fmtMoney: (v: number) => string }) {
  const { t } = useTranslation();
  if (!analytics) return <EmptyState icon={Calendar} message={t("provider_dashboard.reporting_no_booking_data", "No booking data yet.")} />;

  const trend = analytics.monthlyTrend ?? [];
  const totalBookings = trend.reduce((s, m) => s + m.bookings, 0);
  const totalCancellations = trend.reduce((s, m) => s + m.cancellations, 0);
  const totalNoShows = trend.reduce((s, m) => s + m.noShows, 0);
  const cancelRate = totalBookings > 0 ? ((totalCancellations / totalBookings) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={Calendar} label={t("provider_dashboard.reporting_total_bookings", "Total Bookings")} value={String(totalBookings)} sub={t("provider_dashboard.reporting_12_months", "12 months")} color="text-blue-600" />
        <KpiCard icon={Activity} label={t("provider_dashboard.reporting_cancellations", "Cancellations")} value={String(totalCancellations)} sub={t("provider_dashboard.reporting_cancel_rate", "{{rate}}% cancel rate", { rate: cancelRate })} color="text-rose-600" />
        <KpiCard icon={Clock} label={t("provider_dashboard.reporting_no_shows", "No-Shows")} value={String(totalNoShows)} color="text-amber-600" />
        <KpiCard icon={TrendingUp} label={t("provider_dashboard.reporting_avg_month", "Avg/Month")} value={(totalBookings / Math.max(trend.length, 1)).toFixed(1)} color="text-emerald-600" />
      </div>

      {trend.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("provider_dashboard.reporting_bookings_trend", "Bookings Trend (12 months)")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="bookings" name={t("provider_dashboard.analytics_bookings", "Bookings")} fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cancellations" name={t("provider_dashboard.reporting_cancellations", "Cancellations")} fill="#f43f5e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="noShows" name={t("provider_dashboard.reporting_no_shows", "No-Shows")} fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ServicesTab({ analytics, fmtMoney }: { analytics?: AnalyticsData; fmtMoney: (v: number) => string }) {
  const { t } = useTranslation();
  if (!analytics || !(analytics.serviceBreakdown ?? []).length) {
    return <EmptyState icon={Briefcase} message={t("provider_dashboard.reporting_no_service_data", "No service data yet. Complete appointments to see performance.")} />;
  }

  const services = analytics.serviceBreakdown;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{t("provider_dashboard.analytics_service_performance", "Service Performance")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-start py-2">{t("provider_dashboard.service", "Service")}</th>
                  <th className="text-end py-2">{t("provider_dashboard.analytics_bookings", "Bookings")}</th>
                  <th className="text-end py-2">{t("provider_dashboard.analytics_revenue", "Revenue")}</th>
                  <th className="text-end py-2">{t("provider_dashboard.analytics_avg_rating", "Avg Rating")}</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 font-medium max-w-[200px] truncate">{s.name}</td>
                    <td className="text-end py-2">{s.bookings}</td>
                    <td className="text-end py-2 text-emerald-600 font-medium">{fmtMoney(s.revenue)}</td>
                    <td className="text-end py-2">
                      {s.avgRating > 0 ? (
                        <span className="flex items-center justify-end gap-1">
                          <Star className="h-3 w-3 text-yellow-500" />
                          {s.avgRating.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{t("provider_dashboard.bookings_by_service", "Bookings by Service")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={Math.min(services.length * 40 + 20, 300)}>
            <BarChart data={services.slice(0, 8)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={120} />
              <Tooltip />
              <Bar dataKey="bookings" name={t("provider_dashboard.analytics_bookings", "Bookings")} fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function ScheduleTab({ analytics, insights, fmtMoney }: { analytics?: AnalyticsData; insights?: InsightsData; fmtMoney: (v: number) => string }) {
  const { t } = useTranslation();
  const health = analytics?.scheduleHealth;
  const heatmap = insights?.heatmap;

  if (!health && !heatmap) return <EmptyState icon={Clock} message={t("provider_dashboard.reporting_no_schedule_data", "No schedule data yet.")} />;

  const peakHour = (() => {
    if (!heatmap) return null;
    let best = { dow: 0, hour: 0, cnt: 0 };
    heatmap.forEach((hours, dow) => {
      hours.forEach((cnt, hour) => {
        if (cnt > best.cnt) best = { dow, hour, cnt };
      });
    });
    return best.cnt > 0 ? `${t(`provider_dashboard.day_${DOW_KEYS[best.dow]}_short`, DOW_KEYS[best.dow])} ${best.hour}:00` : null;
  })();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {health && (
          <>
            <KpiCard icon={Activity} label={t("provider_dashboard.analytics_slot_utilization", "Slot Utilization")} value={`${(health.utilizationPct ?? 0).toFixed(1)}%`} color="text-blue-600" />
            <KpiCard icon={Calendar} label={t("provider_dashboard.reporting_booked_slots", "Booked Slots")} value={String(health.bookedSlots ?? 0)} sub={t("provider_dashboard.reporting_of_total", "of {{count}} total", { count: health.totalSlots ?? 0 })} color="text-emerald-600" />
          </>
        )}
        {peakHour && (
          <KpiCard icon={Clock} label={t("provider_dashboard.reporting_peak_hour", "Peak Hour")} value={peakHour} sub={t("provider_dashboard.reporting_busiest_slot", "busiest slot")} color="text-amber-600" />
        )}
      </div>

      {heatmap && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("provider_dashboard.reporting_busy_heatmap", "Busy Hours Heatmap (last 6 months)")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="min-w-[500px]">
                <div className="grid grid-cols-[60px_repeat(24,1fr)] gap-0.5 text-xs">
                  <div />
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="text-center text-muted-foreground">{h}</div>
                  ))}
                  {heatmap.map((hours, dow) => {
                    const maxCnt = Math.max(...hours, 1);
                    return (
                      <div key={dow} className="contents">
                        <div className="text-muted-foreground py-0.5">{t(`provider_dashboard.day_${DOW_KEYS[dow]}_short`, DOW_KEYS[dow])}</div>
                        {hours.map((cnt, hour) => (
                          <div
                            key={hour}
                            className="h-6 rounded"
                            style={{ backgroundColor: cnt > 0 ? `rgba(99,102,241,${Math.max(0.1, cnt / maxCnt)})` : "transparent", border: "1px solid rgba(0,0,0,0.05)" }}
                            title={`${t(`provider_dashboard.day_${DOW_KEYS[dow]}_short`, DOW_KEYS[dow])} ${hour}:00 — ${t("provider_dashboard.appointments_count", "{{count}} appointment(s)", { count: cnt })}`}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ReviewsTab({ analytics }: { analytics?: AnalyticsData }) {
  const { t } = useTranslation();
  const dist = analytics?.ratingDistribution ?? [];
  if (!dist.length) return <EmptyState icon={Star} message={t("provider_dashboard.analytics_no_reviews", "No reviews yet.")} />;

  const total = dist.reduce((s, d) => s + d.count, 0);
  const weighted = dist.reduce((s, d) => s + d.star * d.count, 0);
  const avgRating = total > 0 ? weighted / total : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <KpiCard icon={Star} label={t("provider_dashboard.analytics_avg_rating", "Avg Rating")} value={avgRating.toFixed(2)} sub={t("provider_dashboard.reporting_from_reviews", "from {{count}} reviews", { count: total })} color="text-yellow-600" />
        <KpiCard icon={Activity} label={t("provider_dashboard.reporting_total_reviews", "Total Reviews")} value={String(total)} color="text-blue-600" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{t("provider_dashboard.analytics_rating_distribution", "Rating Distribution")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map(star => {
              const row = dist.find(d => d.star === star);
              const count = row?.count ?? 0;
              const pct = total > 0 ? (count / total) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-sm">
                  <span className="w-8 text-right text-muted-foreground">{star}★</span>
                  <div className="flex-1 bg-muted rounded-full h-2">
                    <div className="h-2 bg-yellow-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-10 text-right font-medium">{count}</span>
                  <span className="w-10 text-right text-muted-foreground text-xs">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{t("provider_dashboard.reporting_rating_by_service", "Rating by Service")}</CardTitle>
        </CardHeader>
        <CardContent>
          {(analytics?.serviceBreakdown ?? []).filter(s => s.avgRating > 0).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t("provider_dashboard.reporting_no_service_ratings", "No service ratings yet.")}</p>
          ) : (
            <div className="space-y-2">
              {(analytics?.serviceBreakdown ?? [])
                .filter(s => s.avgRating > 0)
                .sort((a, b) => b.avgRating - a.avgRating)
                .map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <span className="truncate max-w-[200px]">{s.name}</span>
                    <span className="flex items-center gap-1 text-yellow-600 font-medium">
                      <Star className="h-3 w-3" />
                      {s.avgRating.toFixed(1)}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FinancialsTab({ fmtMoney, enabled }: { fmtMoney: (v: number) => string; enabled: boolean }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery<EarningsData>({
    queryKey: QK.providerEarnings(),
    enabled,
  });

  if (isLoading) return <PanelLoader />;
  if (!data) return <EmptyState icon={DollarSign} message={t("provider_dashboard.reporting_no_earnings", "No earnings data yet.")} />;

  const s = data.summary ?? {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={DollarSign} label={t("provider_dashboard.reporting_actual_net_payout", "Actual Net Payout")} value={fmtMoney(s.totalEarnings ?? 0)} color="text-emerald-600" />
        <KpiCard icon={TrendingUp} label={t("provider_dashboard.reporting_gross_payout", "Gross Provider Payout")} value={fmtMoney(s.grossProviderPayout ?? s.totalEarnings ?? 0)} color="text-blue-600" />
        <KpiCard icon={Clock} label={t("provider_dashboard.reporting_pending_payout", "Pending Net Payout")} value={fmtMoney(s.pendingAmount ?? s.pendingEarnings ?? 0)} sub={t("provider_dashboard.reporting_not_paid", "not yet paid")} color="text-amber-600" />
      </div>

      {(data.earnings ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("provider_dashboard.reporting_recent_earnings", "Recent Earnings")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-start py-2">{t("provider_dashboard.date", "Date")}</th>
                    <th className="text-start py-2">{t("provider_dashboard.service", "Service")}</th>
                    <th className="text-end py-2">{t("provider_dashboard.reporting_provider_earning", "Provider Earning")}</th>
                    <th className="text-end py-2">{t("provider_dashboard.payment_status", "Payment status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.earnings.slice(0, 15).map((e: any, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 text-muted-foreground text-xs">{e.date ? formatDate(e.date) : "—"}</td>
                      <td className="py-2 truncate max-w-[150px]">{e.serviceName ?? "—"}</td>
                      <td className="text-end py-2 font-medium text-emerald-600">{fmtMoney(Number(e.providerNetEarningsUsd ?? 0))}</td>
                      <td className="text-end py-2">
                        <Badge variant={["paid", "completed"].includes(e.paymentStatus) ? "default" : "secondary"} className="text-xs capitalize">
                          {e.paymentStatus === "paid" || e.paymentStatus === "completed"
                            ? t("provider_dashboard.payment_paid", "Paid")
                            : String(t(`provider_dashboard.payment_${e.paymentStatus ?? "pending"}`, e.paymentStatus ?? t("provider_dashboard.payment_pending", "Pending")))}
                        </Badge>
                      </td>
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

function PayoutsTab({ fmtMoney, enabled }: { fmtMoney: (v: number) => string; enabled: boolean }) {
  const { t } = useTranslation();
  const { data: wallet, isLoading: walletLoading } = useQuery<WalletData>({
    queryKey: QK.providerWallet(),
    enabled,
  });
  const { data: payout, isLoading: payoutLoading } = useQuery<PayoutSummaryData>({
    queryKey: ["/api/provider/payout-summary"],
    enabled,
  });

  if (walletLoading || payoutLoading) return <PanelLoader />;

  return (
    <div className="space-y-6">
      {wallet && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard icon={DollarSign} label={t("provider_dashboard.reporting_available_balance", "Available Balance")} value={fmtMoney(Number(wallet.available_balance ?? 0))} color="text-emerald-600" />
          <KpiCard icon={Clock} label={t("provider_dashboard.reporting_held", "Held")} value={fmtMoney(Number(wallet.held_balance ?? 0))} sub={t("provider_dashboard.reporting_in_escrow", "in escrow")} color="text-amber-600" />
          <KpiCard icon={Activity} label={t("provider_dashboard.reporting_pending", "Pending")} value={fmtMoney(Number(wallet.pending_balance ?? 0))} color="text-blue-600" />
          <KpiCard icon={TrendingUp} label={t("provider_dashboard.reporting_lifetime_earned", "Lifetime Earned")} value={fmtMoney(Number(wallet.lifetime_earnings ?? 0))} color="text-violet-600" />
        </div>
      )}

      {payout && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <KpiCard icon={CreditCard} label={t("provider_dashboard.reporting_in_flight", "In-Flight Payouts")} value={fmtMoney(payout.inFlight ?? 0)} sub={t("provider_dashboard.reporting_pending_count", "{{count}} pending", { count: payout.pendingCount ?? 0 })} color="text-blue-600" />
          <KpiCard icon={TrendingUp} label={t("provider_dashboard.reporting_lifetime_paid", "Lifetime Paid")} value={fmtMoney(payout.lifetimePaid ?? 0)} sub={t("provider_dashboard.reporting_completed_count", "{{count}} completed", { count: payout.completedCount ?? 0 })} color="text-emerald-600" />
        </div>
      )}

      {(wallet?.monthly ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("provider_dashboard.reporting_wallet_credits", "Monthly Wallet Credits (12 months)")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={wallet!.monthly}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtMoney(v)} width={65} />
                <Tooltip formatter={(v: number) => [fmtMoney(v), t("provider_dashboard.net_credits", "Net Credits")]} />
                <Bar dataKey="net" name={t("provider_dashboard.reporting_credits", "Credits")} fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function GrowthTab({ insights, fmtMoney }: { insights?: InsightsData; fmtMoney: (v: number) => string }) {
  const { t } = useTranslation();
  if (!insights) return <EmptyState icon={TrendingUp} message={t("provider_dashboard.reporting_no_growth", "No growth data yet.")} />;

  const kpi = insights.kpi;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard icon={Activity} label={t("provider_dashboard.reporting_cancellation_rate", "Cancellation Rate")} value={`${kpi.cancellationRate.toFixed(1)}%`} color={kpi.cancellationRate > 20 ? "text-rose-600" : "text-amber-600"} />
        <KpiCard icon={Users} label={t("provider_dashboard.reporting_repeat_patients", "Repeat Members")} value={`${kpi.repeatPatientPct.toFixed(1)}%`} color="text-emerald-600" />
        <KpiCard icon={Clock} label={t("provider_dashboard.reporting_lost_bookings", "Lost Bookings")} value={String(kpi.lostBookings)} sub={t("provider_dashboard.analytics_last_12_months", "last 12 months")} color="text-rose-600" />
      </div>

      {insights.weeklyRevenue.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("provider_dashboard.reporting_12_week_trend", "12-Week Revenue Trend")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={insights.weeklyRevenue}>
                <defs>
                  <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtMoney(v)} width={65} />
                <Tooltip formatter={(v: number) => [fmtMoney(v), t("provider_dashboard.analytics_revenue", "Revenue")]} />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#growthGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {insights.popularServices.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("provider_dashboard.reporting_popular_services", "Popular Services")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.min(insights.popularServices.length * 40 + 20, 240)}>
              <BarChart data={insights.popularServices.slice(0, 6)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={110} />
                <Tooltip />
                <Bar dataKey="count" name={t("provider_dashboard.analytics_bookings", "Bookings")} fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {insights.growthTips.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("provider_dashboard.growth_recommendations", "Growth Recommendations")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {insights.growthTips.map((tip, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="text-amber-500 shrink-0">💡</span>
                  <p className="text-muted-foreground leading-relaxed">{tip}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ExportsTab({ fmtMoney }: { fmtMoney: (v: number) => string }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-sm">{t("provider_dashboard.reporting_my_reports", "My Reports")}</h3>
        <p className="text-xs text-muted-foreground mt-1">{t("provider_dashboard.reporting_download_desc", "Download your earnings and appointment data. All amounts shown in your display currency.")}</p>
      </div>
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{t("provider_dashboard.reporting_earnings_csv", "Earnings CSV")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("provider_dashboard.reporting_earnings_csv_desc", "Provider-only earnings and settlement columns.")}</p>
          </div>
          <a href="/api/provider/earnings/export" download data-testid="export-provider-earnings-csv">
            <Button size="sm" variant="outline" className="gap-1.5 shrink-0">
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

const SECTIONS = [
  { value: "overview", label: "Overview", icon: BarChart3 },
  { value: "revenue", label: "Revenue", icon: DollarSign },
  { value: "patients", label: "Members", icon: Users },
  { value: "bookings", label: "Bookings", icon: Calendar },
  { value: "services", label: "Services", icon: Briefcase },
  { value: "schedule", label: "Schedule", icon: Clock },
  { value: "reviews", label: "Reviews", icon: Star },
  { value: "financials", label: "Financials", icon: DollarSign },
  { value: "payouts", label: "Payouts", icon: CreditCard },
  { value: "growth", label: "Growth", icon: TrendingUp },
  { value: "exports", label: "Exports", icon: Download },
] as const;

type Section = (typeof SECTIONS)[number]["value"];

export function ProviderReportingCenter({
  fmtMoney,
  defaultSection = "overview",
}: {
  fmtMoney: (v: number) => string;
  defaultSection?: string;
}) {
  const { t } = useTranslation();
  const validatedDefault: Section = SECTIONS.find(s => s.value === defaultSection)?.value ?? "overview";
  const [section, setSection] = useState<Section>(validatedDefault);

  const analyticsEnabled = ["overview", "revenue", "bookings", "services", "schedule", "reviews"].includes(section);
  const insightsEnabled = ["overview", "patients", "schedule", "growth"].includes(section);
  const financialsEnabled = section === "financials";
  const payoutsEnabled = section === "payouts";

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery<AnalyticsData>({
    queryKey: QK.providerAnalytics(),
    enabled: analyticsEnabled,
  });

  const { data: insightsData, isLoading: insightsLoading } = useQuery<InsightsData>({
    queryKey: QK.providerInsights(),
    enabled: insightsEnabled,
  });

  const loading = (analyticsEnabled && analyticsLoading) || (insightsEnabled && insightsLoading);

  return (
    <div className="space-y-4">
      <Tabs value={section} onValueChange={v => setSection(v as Section)}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          {SECTIONS.map(s => (
            <TabsTrigger
              key={s.value}
              value={s.value}
              className="flex items-center gap-1 text-xs"
              data-testid={`tab-provider-reports-${s.value}`}
            >
              <s.icon className="h-3 w-3 shrink-0" />
              <span className="hidden sm:inline">{t(`provider_sweep.reports.${s.value}`, s.label)}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {loading ? (
          <div className="mt-4"><PanelLoader /></div>
        ) : (
          <>
            <TabsContent value="overview" className="mt-4">
              <OverviewTab analytics={analyticsData} insights={insightsData} fmtMoney={fmtMoney} />
            </TabsContent>
            <TabsContent value="revenue" className="mt-4">
              <RevenueTab analytics={analyticsData} insights={insightsData} fmtMoney={fmtMoney} />
            </TabsContent>
            <TabsContent value="patients" className="mt-4">
              <PatientsTab insights={insightsData} fmtMoney={fmtMoney} />
            </TabsContent>
            <TabsContent value="bookings" className="mt-4">
              <BookingsTab analytics={analyticsData} fmtMoney={fmtMoney} />
            </TabsContent>
            <TabsContent value="services" className="mt-4">
              <ServicesTab analytics={analyticsData} fmtMoney={fmtMoney} />
            </TabsContent>
            <TabsContent value="schedule" className="mt-4">
              <ScheduleTab analytics={analyticsData} insights={insightsData} fmtMoney={fmtMoney} />
            </TabsContent>
            <TabsContent value="reviews" className="mt-4">
              <ReviewsTab analytics={analyticsData} />
            </TabsContent>
            <TabsContent value="financials" className="mt-4">
              <FinancialsTab fmtMoney={fmtMoney} enabled={financialsEnabled} />
            </TabsContent>
            <TabsContent value="payouts" className="mt-4">
              <PayoutsTab fmtMoney={fmtMoney} enabled={payoutsEnabled} />
            </TabsContent>
            <TabsContent value="growth" className="mt-4">
              <GrowthTab insights={insightsData} fmtMoney={fmtMoney} />
            </TabsContent>
            <TabsContent value="exports" className="mt-4">
              <ExportsTab fmtMoney={fmtMoney} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
