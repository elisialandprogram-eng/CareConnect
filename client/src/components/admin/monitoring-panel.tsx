import { formatDateTime } from "@/lib/datetime";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, AlertTriangle, CheckCircle2, Activity, Zap, AlertCircle, XCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SystemEvent {
  id: string;
  eventType: string;
  severity: string;
  source: string;
  message: string;
  metadata: Record<string, unknown> | null;
  countryCode: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

interface MonitoringStats {
  totalUnresolved: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  recentErrors: SystemEvent[];
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
  error: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800",
  warning: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  info: "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
};

const SEVERITY_ICONS: Record<string, any> = {
  critical: XCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Activity,
};

const TYPE_LABELS: Record<string, string> = {
  api_error: "API Error",
  payment_failure: "Payment Failure",
  notification_failure: "Notification Failure",
  slow_endpoint: "Slow Endpoint",
  failed_job: "Failed Job",
  auth_failure: "Auth Failure",
};

const PAGE_SIZE = 30;

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${color}`}>
      <span className="text-sm font-medium">{label}</span>
      <span className="text-lg font-bold tabular-nums">{value}</span>
    </div>
  );
}

export default function MonitoringPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [page, setPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [unresolvedOnly, setUnresolvedOnly] = useState(true);

  const { data: stats, isLoading: statsLoading } = useQuery<MonitoringStats>({
    queryKey: ["/api/admin/monitoring/stats"],
    refetchInterval: 30_000,
  });

  const { data: eventsData, isLoading: eventsLoading } = useQuery<{ events: SystemEvent[]; total: number }>({
    queryKey: ["/api/admin/monitoring/events", { page, typeFilter, severityFilter, unresolvedOnly }],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        unresolvedOnly: String(unresolvedOnly),
      });
      if (typeFilter !== "all") params.set("eventType", typeFilter);
      if (severityFilter !== "all") params.set("severity", severityFilter);
      const res = await fetch(`/api/admin/monitoring/events?${params}`, {
        credentials: "include",
        headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` },
      });
      return res.json();
    },
    staleTime: 30_000,
  });

  const resolveMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/monitoring/events/${id}/resolve`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/monitoring/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/monitoring/events"] });
      toast({ title: t("admin.monitoring.event_resolved", "Event marked as resolved") });
    },
    onError: () => toast({ title: t("admin.monitoring.event_resolve_failed", "Failed to resolve event"), variant: "destructive" }),
  });

  const events = eventsData?.events ?? [];
  const total = eventsData?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={`border-2 ${(stats?.totalUnresolved ?? 0) > 0 ? "border-rose-300 dark:border-rose-800" : "border-emerald-300 dark:border-emerald-800"}`}>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("admin.monitoring.unresolved", "Unresolved events")}</p>
                <p className={`text-3xl font-bold tabular-nums mt-1 ${(stats?.totalUnresolved ?? 0) > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {statsLoading ? "…" : (stats?.totalUnresolved ?? 0)}
                </p>
              </div>
              {(stats?.totalUnresolved ?? 0) > 0
                ? <AlertCircle className="h-8 w-8 text-rose-400" />
                : <CheckCircle2 className="h-8 w-8 text-emerald-400" />}
            </div>
          </CardContent>
        </Card>

        {["critical", "error", "warning", "info"].map((sev) => {
          const Icon = SEVERITY_ICONS[sev] ?? Activity;
          const count = stats?.bySeverity[sev] ?? 0;
          return (
            <Card key={sev}>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground capitalize">{sev}</p>
                    <p className="text-2xl font-bold tabular-nums mt-1">{statsLoading ? "…" : count}</p>
                  </div>
                  <Icon className={`h-7 w-7 ${sev === "critical" ? "text-rose-400" : sev === "error" ? "text-orange-400" : sev === "warning" ? "text-amber-400" : "text-sky-400"}`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* By event type */}
      {stats && Object.keys(stats.byType).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.monitoring.unresolved_by_type", "Unresolved by type")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(stats.byType).map(([type, cnt]) => (
                <StatPill key={type} label={TYPE_LABELS[type] ?? type} value={cnt} color="bg-muted border" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Event list */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                {t("admin.monitoring.system_events", "System Events")}
              </CardTitle>
              <CardDescription>{t("admin.monitoring.system_events_desc", "API failures, slow endpoints, payment and notification issues")}</CardDescription>
            </div>
            <Badge variant="outline" className="tabular-nums">
              {t("admin.monitoring.events_count", "{{count}} events", { count: total })}
            </Badge>
          </div>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mt-3 items-center">
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
              <SelectTrigger className="w-48" data-testid="select-monitor-type">
                <SelectValue placeholder={t("admin.monitoring.all_types", "All types")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin.monitoring.all_types", "All types")}</SelectItem>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v); setPage(0); }}>
              <SelectTrigger className="w-36" data-testid="select-monitor-severity">
                <SelectValue placeholder={t("admin.monitoring.all_severities", "All severities")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin.monitoring.all_severities", "All severities")}</SelectItem>
                {["critical", "error", "warning", "info"].map((s) => (
                  <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch
                id="unresolved-only"
                checked={unresolvedOnly}
                onCheckedChange={(v) => { setUnresolvedOnly(v); setPage(0); }}
                data-testid="switch-unresolved-only"
              />
              <Label htmlFor="unresolved-only" className="text-sm cursor-pointer">
                {t("admin.monitoring.unresolved_only", "Unresolved only")}
              </Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {eventsLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <p className="text-sm">{t("admin.monitoring.no_events", "No events match your filters")}</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="divide-y">
                {events.map((ev) => {
                  const Icon = SEVERITY_ICONS[ev.severity] ?? Activity;
                  return (
                    <div
                      key={ev.id}
                      className={`px-6 py-4 flex items-start gap-3 ${ev.resolvedAt ? "opacity-50" : ""}`}
                      data-testid={`row-monitor-event-${ev.id}`}
                    >
                      <div className={`mt-0.5 p-1.5 rounded-full border flex-shrink-0 ${SEVERITY_COLORS[ev.severity] ?? "bg-muted border-muted"}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${SEVERITY_COLORS[ev.severity] ?? ""}`}>
                            {ev.severity}
                          </span>
                          <span className="text-xs font-medium bg-muted px-2 py-0.5 rounded-full">
                            {TYPE_LABELS[ev.eventType] ?? ev.eventType}
                          </span>
                          {ev.countryCode && (
                            <Badge variant="outline" className="text-xs h-5">{ev.countryCode}</Badge>
                          )}
                          {ev.resolvedAt && (
                            <Badge variant="outline" className="text-xs h-5 text-emerald-600 border-emerald-300">
                              {t("admin.monitoring.resolved", "Resolved")}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-foreground mt-1 truncate">{ev.message}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-muted-foreground font-mono">{ev.source}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(ev.createdAt)}
                          </span>
                        </div>
                      </div>
                      {!ev.resolvedAt && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-shrink-0 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                          disabled={resolveMut.isPending}
                          onClick={() => resolveMut.mutate(ev.id)}
                          data-testid={`button-resolve-event-${ev.id}`}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          {t("admin.monitoring.resolve", "Resolve")}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t">
              <span className="text-xs text-muted-foreground">
                {t("admin.monitoring.page_of", "Page {{page}} of {{total}}", { page: page + 1, total: totalPages })}
              </span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)} data-testid="button-monitor-prev">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} data-testid="button-monitor-next">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
