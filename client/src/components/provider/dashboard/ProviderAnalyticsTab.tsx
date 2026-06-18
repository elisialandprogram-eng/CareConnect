import { useQuery } from "@tanstack/react-query";
import { useCurrency } from "@/lib/currency";
import { QK } from "@/lib/query-keys";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  TrendingUp,
  Star,
  Users,
  CalendarCheck2,
  XCircle,
  Gift,
  LayoutGrid,
  Package,
} from "lucide-react";

interface AnalyticsData {
  canonical_currency: string;
  serviceBreakdown: Array<{
    name: string;
    bookings: number;
    revenue: number;
    avgRating: number | null;
  }>;
  ratingDistribution: {
    dist: Record<number, number>;
    total: number;
    avg: number;
  };
  monthlyTrend: Array<{
    month: string;
    revenue: number;
    bookings: number;
    cancellations: number;
    noShows: number;
  }>;
  referralStats: {
    total: number;
    converted: number;
    totalEarned: number;
  };
  scheduleHealth: {
    totalSlots: number;
    bookedSlots: number;
    utilizationPct: number;
  };
  packagePerformance: Array<{
    name: string;
    bookingsUsed: number;
    totalDiscount: number;
  }>;
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="pt-5 pb-4">
        <div className={`flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2 ${accent ?? ""}`}>
          {icon}
          {label}
        </div>
        <p className={`text-2xl font-bold tracking-tight ${accent ?? ""}`} data-testid={`analytics-kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}>
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function RatingStars({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value} out of ${max} stars`}>
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i < Math.round(value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </span>
  );
}

export function ProviderAnalyticsTabContent() {
  const { format: fmt } = useCurrency();

  const { data, isLoading, isError } = useQuery<AnalyticsData>({
    queryKey: QK.providerAnalytics(),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-72 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-56 rounded-lg" />
          <Skeleton className="h-56 rounded-lg" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <TrendingUp className="h-8 w-8 mr-3 opacity-30" />
        <p className="text-sm">Analytics unavailable. Complete some appointments to see data here.</p>
      </div>
    );
  }

  const { serviceBreakdown, ratingDistribution, monthlyTrend, referralStats, scheduleHealth, packagePerformance = [] } = data;

  const totalRevenue = monthlyTrend.reduce((s, m) => s + m.revenue, 0);
  const totalBookings = monthlyTrend.reduce((s, m) => s + m.bookings, 0);
  const totalCancellations = monthlyTrend.reduce((s, m) => s + m.cancellations, 0);
  const maxRatingCount = Math.max(...Object.values(ratingDistribution.dist), 1);

  return (
    <div className="space-y-6">
      {/* ── KPI Row ─────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="12-month Revenue"
          value={fmt(totalRevenue)}
          sub="completed sessions only"
        />
        <KpiCard
          icon={<CalendarCheck2 className="h-3.5 w-3.5" />}
          label="Completed Sessions"
          value={String(totalBookings)}
          sub="last 12 months"
        />
        <KpiCard
          icon={<Star className="h-3.5 w-3.5 text-amber-500" />}
          label="Avg Rating"
          value={ratingDistribution.avg > 0 ? ratingDistribution.avg.toFixed(1) : "—"}
          sub={`${ratingDistribution.total} review${ratingDistribution.total !== 1 ? "s" : ""}`}
          accent="text-amber-600 dark:text-amber-400"
        />
        <KpiCard
          icon={<LayoutGrid className="h-3.5 w-3.5 text-violet-500" />}
          label="Slot Utilization"
          value={`${scheduleHealth.utilizationPct}%`}
          sub="last 30 days"
          accent="text-violet-600 dark:text-violet-400"
        />
      </div>

      {/* ── Monthly Revenue + Bookings Trend ─── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Monthly Performance · last 12 months
          </CardTitle>
          <CardDescription>Revenue (area) and completed bookings (bars) per month</CardDescription>
        </CardHeader>
        <CardContent style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthlyTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="analyticsRevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="rev" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <YAxis yAxisId="bkg" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                formatter={(v: any, name: string) =>
                  name === "revenue" ? [fmt(Number(v)), "Revenue"] : [v, name === "bookings" ? "Completed" : name]
                }
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area
                yAxisId="rev"
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#analyticsRevGrad)"
                name="revenue"
                dot={false}
              />
              <Bar yAxisId="bkg" dataKey="bookings" fill="hsl(var(--primary) / 0.6)" radius={[3, 3, 0, 0]} name="bookings" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Cancellation + No-show trend ─────── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <XCircle className="h-4 w-4 text-rose-500" />
            Cancellations &amp; No-shows · last 12 months
          </CardTitle>
          <CardDescription>
            {totalCancellations} total lost bookings in the period
          </CardDescription>
        </CardHeader>
        <CardContent style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="cancellations" fill="hsl(var(--destructive) / 0.7)" radius={[3, 3, 0, 0]} name="cancellations" stackId="a" />
              <Bar dataKey="noShows" fill="hsl(var(--destructive) / 0.4)" radius={[3, 3, 0, 0]} name="no-shows" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Service Breakdown + Rating Distribution ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Service performance */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarCheck2 className="h-4 w-4 text-emerald-500" />
              Service Performance
            </CardTitle>
            <CardDescription>Revenue and bookings per service · last 12 months</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {serviceBreakdown.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No completed sessions yet.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {serviceBreakdown.map((svc, i) => (
                  <div key={svc.name} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors" data-testid={`analytics-service-row-${i}`}>
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-sm font-medium truncate">{svc.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className="text-xs">{svc.bookings} session{svc.bookings !== 1 ? "s" : ""}</Badge>
                        {svc.avgRating !== null && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            {svc.avgRating}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
                      {fmt(svc.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rating Distribution */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />
              Rating Distribution
            </CardTitle>
            <CardDescription>
              {ratingDistribution.total} reviews · avg {ratingDistribution.avg > 0 ? ratingDistribution.avg.toFixed(1) : "—"} / 5
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ratingDistribution.total === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No reviews yet.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-center mb-4">
                  <div className="text-center">
                    <p className="text-5xl font-bold tracking-tight text-amber-500" data-testid="analytics-avg-rating">
                      {ratingDistribution.avg.toFixed(1)}
                    </p>
                    <RatingStars value={ratingDistribution.avg} />
                    <p className="text-xs text-muted-foreground mt-1">{ratingDistribution.total} total reviews</p>
                  </div>
                </div>
                {[5, 4, 3, 2, 1].map((star) => {
                  const cnt = ratingDistribution.dist[star] ?? 0;
                  const pct = ratingDistribution.total > 0 ? Math.round((cnt / ratingDistribution.total) * 100) : 0;
                  return (
                    <div key={star} className="flex items-center gap-2 text-sm" data-testid={`analytics-rating-bar-${star}`}>
                      <span className="w-6 text-right text-muted-foreground font-medium">{star}</span>
                      <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                      <Progress value={pct} className="flex-1 h-2" />
                      <span className="w-8 text-right text-xs text-muted-foreground">{cnt}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Referral Stats ─────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Gift className="h-4 w-4 text-indigo-500" />
            Referral Performance
          </CardTitle>
          <CardDescription>Patients you have referred to the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div data-testid="analytics-referral-total">
              <p className="text-2xl font-bold">{referralStats.total}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total Referrals</p>
            </div>
            <div data-testid="analytics-referral-converted">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{referralStats.converted}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Converted</p>
            </div>
            <div data-testid="analytics-referral-earned">
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{fmt(referralStats.totalEarned)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Referral Earnings</p>
            </div>
          </div>
          {referralStats.total > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Conversion rate</span>
                <span>{referralStats.total > 0 ? Math.round((referralStats.converted / referralStats.total) * 100) : 0}%</span>
              </div>
              <Progress
                value={referralStats.total > 0 ? Math.round((referralStats.converted / referralStats.total) * 100) : 0}
                className="h-1.5"
                data-testid="analytics-referral-progress"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Package / Membership Performance ─── */}
      {packagePerformance.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4 text-teal-500" />
              Package &amp; Membership Usage
            </CardTitle>
            <CardDescription>Which packages drive bookings · last 12 months</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {packagePerformance.map((pkg, i) => (
                <div
                  key={pkg.name}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                  data-testid={`analytics-pkg-row-${i}`}
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-sm font-medium truncate">{pkg.name}</p>
                    <Badge variant="secondary" className="text-xs mt-0.5">
                      {pkg.bookingsUsed} booking{pkg.bookingsUsed !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-teal-600 dark:text-teal-400 tabular-nums">
                      {fmt(pkg.totalDiscount)} saved
                    </p>
                    <p className="text-xs text-muted-foreground">for patients</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Schedule Health ──────────────────── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-violet-500" />
            Schedule Health · last 30 days
          </CardTitle>
          <CardDescription>How much of your available time is booked</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4 mb-3">
            <p className="text-4xl font-bold text-violet-600 dark:text-violet-400" data-testid="analytics-utilization-pct">
              {scheduleHealth.utilizationPct}%
            </p>
            <p className="text-sm text-muted-foreground pb-1">
              {scheduleHealth.bookedSlots} / {scheduleHealth.totalSlots} slots booked
            </p>
          </div>
          <Progress value={scheduleHealth.utilizationPct} className="h-3" data-testid="analytics-utilization-bar" />
          <p className="text-xs text-muted-foreground mt-2">
            {scheduleHealth.utilizationPct < 40
              ? "Consider opening more availability or promoting your services to improve utilization."
              : scheduleHealth.utilizationPct >= 80
              ? "Excellent utilization! Consider adding more availability windows."
              : "Good utilization. Keep your schedule updated to maximize bookings."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
