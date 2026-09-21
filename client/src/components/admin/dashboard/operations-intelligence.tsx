import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { formatCount } from "@/lib/format-utils";
import { formatWeekLabel } from "@/lib/datetime";
import { reportPriorityLabel, reportVisitTypeLabel } from "@/lib/report-localization";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { MessageSquare, UserCheck, Clock, TrendingDown, Activity, AlertTriangle, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface SupportAnalytics {
  days: number;
  overview: {
    total: number;
    openCount: number;
    inProgressCount: number;
    resolvedCount: number;
    closedCount: number;
    escalatedCount: number;
    escalationRatePct: number;
  };
  sla: {
    resolvedWithTimestamp: number;
    avgResolutionHrs: number | null;
    medianResolutionHrs: number | null;
    p90ResolutionHrs: number | null;
  };
  dailyTrend: { day: string; created: number; resolved: number }[];
  byPriority: { priority: string; total: number; resolved: number; resolutionRate: number }[];
}

interface GrowthMetrics {
  weeks: number;
  acquisition: { weeklyTrend: { weekStart: string; newPatients: number }[] };
  repeatBooking: { repeatPatients: number; totalPatients: number; repeatRatePct: number };
  noShowAnalysis: { visitType: string; totalAppointments: number; noShowCount: number; noShowRatePct: number }[];
  retention: { activePatients: number; churnedPatients: number; totalWithAppointments: number; retentionRatePct: number };
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#ef4444",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#6b7280",
};

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

export function OperationsIntelligenceDashboard() {
  const { t } = useTranslation();
  const r = (key: string, fallback: string, options?: Record<string, unknown>) =>
    String(t(`admin.report.${key}`, { defaultValue: fallback, ...options }));

  const { data: supportData, isLoading: supportLoading } = useQuery<SupportAnalytics>({
    queryKey: ["/api/admin/support/analytics"],
  });

  const { data: growthData, isLoading: growthLoading } = useQuery<GrowthMetrics>({
    queryKey: ["/api/admin/analytics/growth-metrics"],
  });

  if (supportLoading || growthLoading) {
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

  const ov = supportData?.overview;
  const sla = supportData?.sla;
  const growth = growthData;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{r("operations_intelligence", "Operations Intelligence")}</h2>
        <p className="text-sm text-muted-foreground">{r("operations_intelligence_desc", "Support SLA, booking patterns, member growth and retention")}</p>
      </div>

      <Tabs defaultValue="support">
        <TabsList className="mb-4">
          <TabsTrigger value="support">{r("support_analytics", "Support Analytics")}</TabsTrigger>
          <TabsTrigger value="growth">{r("growth_acquisition", "Growth & Acquisition")}</TabsTrigger>
          <TabsTrigger value="marketplace">{r("marketplace_health", "Marketplace Health")}</TabsTrigger>
        </TabsList>

        {/* ── Support Analytics ── */}
        <TabsContent value="support" className="space-y-4">
          {/* KPI tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatTile label={r("open_tickets", "Open Tickets")} value={ov?.openCount ?? 0} sub={r("awaiting_response", "Awaiting response")} icon={MessageSquare} color="text-amber-500" />
            <StatTile label={r("escalated", "Escalated")} value={ov?.escalatedCount ?? 0} sub={`${ov?.escalationRatePct ?? 0}% ${r("of_total", "of total")}`} icon={AlertTriangle} color="text-red-500" />
            <StatTile
              label={r("avg_resolution", "Avg Resolution")}
              value={sla?.avgResolutionHrs != null ? `${sla.avgResolutionHrs}h` : "—"}
              sub={sla?.medianResolutionHrs != null ? `${r("median", "Median")}: ${sla.medianResolutionHrs}h` : undefined}
              icon={Clock}
              color="text-blue-500"
            />
            <StatTile
              label={r("p90_resolution", "P90 Resolution")}
              value={sla?.p90ResolutionHrs != null ? `${sla.p90ResolutionHrs}h` : "—"}
              sub={r("p90_sla", "90th percentile SLA")}
              icon={Activity}
              color="text-indigo-500"
            />
          </div>

          {/* Daily trend chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{r("daily_volume", "Daily Ticket Volume (30 days)")}</CardTitle>
              <CardDescription>{r("created_vs_resolved", "Tickets created vs resolved per day")}</CardDescription>
            </CardHeader>
            <CardContent>
              {!supportData?.dailyTrend?.length ? (
                <p className="text-sm text-muted-foreground py-8 text-center">{r("no_ticket_data", "No ticket data in window")}</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={supportData.dailyTrend} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                   <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false}
                      tickFormatter={(v) => formatWeekLabel(String(v))} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="created" name={r("created", "Created")} fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="resolved" name={r("resolved", "Resolved")} fill="#22c55e" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* By priority */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{r("tickets_by_priority", "Tickets by Priority")}</CardTitle>
            </CardHeader>
            <CardContent>
              {!supportData?.byPriority?.length ? (
                <p className="text-sm text-muted-foreground text-center py-4">{r("no_data", "No data")}</p>
              ) : (
                <div className="space-y-2">
                  {supportData.byPriority.map((p) => (
                    <div key={p.priority} className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className="w-16 justify-center text-xs capitalize"
                        style={{ borderColor: PRIORITY_COLORS[p.priority] ?? "#6b7280", color: PRIORITY_COLORS[p.priority] ?? "#6b7280" }}
                      >
                         {reportPriorityLabel(t, p.priority)}
                      </Badge>
                      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${p.resolutionRate}%`, backgroundColor: PRIORITY_COLORS[p.priority] ?? "#6b7280" }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-20 text-right">
                         {p.resolved}/{p.total} {r("resolved", "resolved")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Growth & Acquisition ── */}
        <TabsContent value="growth" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatTile
              label={r("repeat_booking_rate", "Repeat Booking Rate")}
              value={`${growth?.repeatBooking.repeatRatePct ?? 0}%`}
               sub={`${growth?.repeatBooking.repeatPatients ?? 0} ${r("repeat", "repeat")} / ${growth?.repeatBooking.totalPatients ?? 0} ${r("total_members", "total members")}`}
              icon={UserCheck}
              color="text-green-500"
            />
            <StatTile
              label={r("member_retention", "Member Retention (90d)")}
              value={`${growth?.retention.retentionRatePct ?? 0}%`}
              sub={`${growth?.retention.activePatients ?? 0} ${r("active", "active")} vs ${growth?.retention.churnedPatients ?? 0} ${r("churned", "churned")}`}
              icon={Activity}
              color="text-indigo-500"
            />
            <StatTile
              label={r("members_with_appointments", "Total Members w/ Appts")}
              value={formatCount(growth?.retention.totalWithAppointments ?? 0)}
              icon={Users as any}
              color="text-blue-500"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{r("weekly_acquisition", "Weekly New Member Acquisition")}</CardTitle>
              <CardDescription>{r("weekly_acquisition_desc", "New member registrations per week (last 12 weeks)")}</CardDescription>
            </CardHeader>
            <CardContent>
              {!growth?.acquisition?.weeklyTrend?.length ? (
                <p className="text-sm text-muted-foreground py-8 text-center">{r("no_acquisition_data", "No acquisition data")}</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={growth.acquisition.weeklyTrend} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                     <XAxis dataKey="weekStart" tick={{ fontSize: 10 }} tickLine={false}
                       tickFormatter={(v) => formatWeekLabel(String(v))} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="newPatients" name={r("new_members", "New Members")} stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Marketplace Health ── */}
        <TabsContent value="marketplace" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                 <TrendingDown className="h-4 w-4 text-red-500" /> {r("no_show_analysis", "No-Show Analysis by Visit Type")}
              </CardTitle>
               <CardDescription>{r("no_show_desc", "No-show rates broken down by appointment modality")}</CardDescription>
            </CardHeader>
            <CardContent>
              {!growth?.noShowAnalysis?.length ? (
                <p className="text-sm text-muted-foreground py-8 text-center">{r("no_data_available", "No data available")}</p>
              ) : (
                <div className="space-y-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={growth.noShowAnalysis} layout="vertical" margin={{ top: 4, right: 40, left: 40, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                     <YAxis type="category" dataKey="visitType" tick={{ fontSize: 11 }} tickLine={false}
                       tickFormatter={(v) => reportVisitTypeLabel(t, String(v))} />
                       <Tooltip formatter={(v: any) => [`${v}%`, r("no_show_rate", "No-show rate")]} />
                       <Bar dataKey="noShowRatePct" name={r("no_show_rate_pct", "No-show Rate %")} fill="#ef4444" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="grid grid-cols-3 gap-3">
                    {growth.noShowAnalysis.map((ns) => (
                      <Card key={ns.visitType} className="bg-muted/40">
                        <CardContent className="pt-3 pb-3">
                           <p className="text-xs text-muted-foreground mb-1">{reportVisitTypeLabel(t, ns.visitType)}</p>
                          <p className="text-lg font-bold">{ns.noShowRatePct}%</p>
                          <p className="text-xs text-muted-foreground">{ns.noShowCount} / {ns.totalAppointments}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
