import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAdminCurrency, formatInCurrency } from "@/lib/currency";
import { formatCount } from "@/lib/format-utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from "recharts";
import { TrendingUp, Tag, Gift, Users, ArrowUpRight, Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface RevenueTrend {
  month: string;
  gross_usd: number;
  fees_usd: number;
  refunds_usd: number;
  net_usd: number;
  completed_count: number;
  cancelled_count: number;
  total_appointments: number;
}

interface CommercialAnalytics {
  promoEffectiveness: { code: string; discountType: string; discountValue: number; usageCount: number; grossRevenueUsd: number; totalDiscountUsd: number }[];
  packageConversion: { packageName: string; priceNative: number; purchases: number; activeCount: number; expiredCount: number; totalRevenueUsd: number }[];
  referralConversion: { pending: number; qualified: number; rewarded: number; total: number; conversionRatePct: number } | null;
  waitlistConversion: { active: number; fulfilled: number; expired: number; total: number; fulfillmentRatePct: number } | null;
  giftCards: { activeCards: number; redeemedCards: number; expiredCards: number; totalIssued: number; totalValueUsd: number; redeemedValueUsd: number } | null;
}

const CHART_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function StatTile({ label, value, sub, icon: Icon, color = "text-indigo-500" }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <Icon className={`h-5 w-5 mt-0.5 ${color}`} />
        </div>
      </CardContent>
    </Card>
  );
}

export function RevenueIntelligenceDashboard() {
  const { t } = useTranslation();
  const { format: fmtMoney } = useAdminCurrency();

  const { data: trendsData, isLoading: trendsLoading } = useQuery<{ trends: RevenueTrend[] }>({
    queryKey: ["/api/admin/financial/revenue-trends"],
  });

  const { data: commercialData, isLoading: commercialLoading } = useQuery<CommercialAnalytics>({
    queryKey: ["/api/admin/analytics/commercial"],
  });

  const trends = trendsData?.trends ?? [];
  const totalGross = trends.reduce((s, r) => s + (r.gross_usd ?? 0), 0);
  const totalFees = trends.reduce((s, r) => s + (r.fees_usd ?? 0), 0);
  const totalRefunds = trends.reduce((s, r) => s + (r.refunds_usd ?? 0), 0);
  const totalCompleted = trends.reduce((s, r) => s + (r.completed_count ?? 0), 0);

  const referral = commercialData?.referralConversion;
  const waitlist = commercialData?.waitlistConversion;
  const giftCards = commercialData?.giftCards;

  const pieData = [
    { name: "Active", value: giftCards?.activeCards ?? 0 },
    { name: "Redeemed", value: giftCards?.redeemedCards ?? 0 },
    { name: "Expired", value: giftCards?.expiredCards ?? 0 },
  ];

  if (trendsLoading || commercialLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Revenue Intelligence</h2>
        <p className="text-sm text-muted-foreground">12-month revenue trends, commercial conversion, and growth analytics</p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile label="Gross Revenue (12mo)" value={fmtMoney(totalGross)} icon={TrendingUp} color="text-green-500" />
        <StatTile label="Platform Fees (12mo)" value={fmtMoney(totalFees)} sub={`${totalGross > 0 ? Math.round(totalFees * 100 / totalGross) : 0}% take rate`} icon={ArrowUpRight} color="text-indigo-500" />
        <StatTile label="Total Refunds (12mo)" value={fmtMoney(totalRefunds)} icon={Package} color="text-amber-500" />
        <StatTile label="Completed Sessions" value={formatCount(totalCompleted)} icon={Users} color="text-blue-500" />
      </div>

      <Tabs defaultValue="trends">
        <TabsList className="mb-4">
          <TabsTrigger value="trends">Revenue Trends</TabsTrigger>
          <TabsTrigger value="promo">Promo Codes</TabsTrigger>
          <TabsTrigger value="packages">Packages</TabsTrigger>
          <TabsTrigger value="conversion">Conversion</TabsTrigger>
        </TabsList>

        {/* ── Revenue Trends ── */}
        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly Revenue (12 months)</CardTitle>
              <CardDescription>Gross, fees, and refunds — USD</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={trends} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradGross" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradFees" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} tickFormatter={(v) => formatInCurrency(Number(v), "USD")} />
                  <Tooltip formatter={(v: any) => [formatInCurrency(Number(v), "USD"), ""]} />
                  <Legend />
                  <Area type="monotone" dataKey="gross_usd" name="Gross" stroke="#6366f1" fill="url(#gradGross)" strokeWidth={2} />
                  <Area type="monotone" dataKey="fees_usd" name="Fees" stroke="#22c55e" fill="url(#gradFees)" strokeWidth={2} />
                  <Area type="monotone" dataKey="refunds_usd" name="Refunds" stroke="#ef4444" fill="none" strokeDasharray="4 2" strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Booking Volume</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trends} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="completed_count" name="Completed" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="cancelled_count" name="Cancelled" fill="#f87171" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Promo Code Effectiveness ── */}
        <TabsContent value="promo">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Tag className="h-4 w-4" /> Promo Code Effectiveness</CardTitle>
              <CardDescription>Usage count and revenue impact per code</CardDescription>
            </CardHeader>
            <CardContent>
              {!commercialData?.promoEffectiveness?.length ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No promo code usage data</p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-4 text-xs font-medium text-muted-foreground pb-1 border-b">
                    <span>Code</span><span className="text-right">Uses</span><span className="text-right">Gross Rev</span><span className="text-right">Discount</span>
                  </div>
                  {commercialData.promoEffectiveness.map((p) => (
                    <div key={p.code} className="grid grid-cols-4 text-sm items-center py-1.5 hover:bg-muted/30 rounded px-1">
                      <span className="font-mono font-medium">{p.code}</span>
                      <span className="text-right tabular-nums">{p.usageCount}</span>
                      <span className="text-right tabular-nums">{fmtMoney(p.grossRevenueUsd)}</span>
                      <span className="text-right tabular-nums text-amber-600">{fmtMoney(p.totalDiscountUsd)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Package Conversion ── */}
        <TabsContent value="packages">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Gift className="h-4 w-4" /> Package & Membership Conversion</CardTitle>
              <CardDescription>Purchases, active subscriptions, and revenue per package</CardDescription>
            </CardHeader>
            <CardContent>
              {!commercialData?.packageConversion?.length ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No package data</p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-5 text-xs font-medium text-muted-foreground pb-1 border-b">
                    <span className="col-span-2">Package</span><span className="text-right">Sold</span><span className="text-right">Active</span><span className="text-right">Revenue</span>
                  </div>
                  {commercialData.packageConversion.map((p, i) => (
                    <div key={i} className="grid grid-cols-5 text-sm items-center py-1.5 hover:bg-muted/30 rounded px-1">
                      <span className="col-span-2 font-medium">{p.packageName}</span>
                      <span className="text-right tabular-nums">{p.purchases}</span>
                      <span className="text-right tabular-nums">
                        <Badge variant="secondary" className="text-xs">{p.activeCount}</Badge>
                      </span>
                      <span className="text-right tabular-nums">{fmtMoney(p.totalRevenueUsd)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Conversion Funnel ── */}
        <TabsContent value="conversion" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Referral */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Referral Conversion</CardTitle>
              </CardHeader>
              <CardContent>
                {!referral ? <p className="text-xs text-muted-foreground">No data</p> : (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Referrals</span><span className="font-semibold">{referral.total}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Qualified</span><span className="font-semibold text-green-600">{referral.qualified}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Rewarded</span><span className="font-semibold text-indigo-600">{referral.rewarded}</span></div>
                    <div className="pt-2 border-t flex justify-between text-sm font-semibold">
                      <span>Conversion Rate</span>
                      <Badge variant="secondary">{referral.conversionRatePct}%</Badge>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Waitlist */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Waitlist Conversion</CardTitle>
              </CardHeader>
              <CardContent>
                {!waitlist ? <p className="text-xs text-muted-foreground">No data</p> : (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Entries</span><span className="font-semibold">{waitlist.total}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Active</span><span className="font-semibold">{waitlist.active}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Fulfilled</span><span className="font-semibold text-green-600">{waitlist.fulfilled}</span></div>
                    <div className="pt-2 border-t flex justify-between text-sm font-semibold">
                      <span>Fulfillment Rate</span>
                      <Badge variant="secondary">{waitlist.fulfillmentRatePct}%</Badge>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Gift Cards */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Gift Card Performance</CardTitle>
              </CardHeader>
              <CardContent>
                {!giftCards ? <p className="text-xs text-muted-foreground">No data</p> : (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Issued</span><span className="font-semibold">{giftCards.totalIssued}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Redeemed</span><span className="font-semibold text-green-600">{giftCards.redeemedCards}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Value Issued</span><span className="font-semibold">{fmtMoney(giftCards.totalValueUsd)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Value Redeemed</span><span className="font-semibold text-indigo-600">{fmtMoney(giftCards.redeemedValueUsd)}</span></div>
                    {giftCards.totalIssued > 0 && (
                      <div className="pt-2 border-t">
                        <ResponsiveContainer width="100%" height={80}>
                          <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={20} outerRadius={35} dataKey="value">
                              {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i]} />)}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
