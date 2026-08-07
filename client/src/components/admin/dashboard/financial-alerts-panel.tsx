import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { AlertTriangle, AlertCircle, Info, CheckCircle2, RefreshCw, Bell } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FinancialAlert {
  id: string;
  check_type: string;
  severity: "critical" | "error" | "warning" | "info";
  entity_type: string | null;
  entity_id: string | null;
  message: string;
  country_code: string | null;
  status: "open" | "acknowledged" | "resolved";
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

interface AlertsResponse {
  alerts: FinancialAlert[];
  total: number;
  page: number;
  limit: number;
}

interface HealthData {
  alerts: {
    unresolved: number;
    bySeverity: { severity: string; count: number }[];
    byStatus: Record<string, number>;
  };
}

type StatusFilter = "all" | "open" | "acknowledged" | "resolved";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<string, { label: string; classes: string; icon: typeof AlertTriangle }> = {
  critical: {
    label: "Critical",
    classes: "bg-red-100 text-red-700 border-red-200/60 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700/40",
    icon: AlertCircle,
  },
  error: {
    label: "Error",
    classes: "bg-orange-100 text-orange-700 border-orange-200/60 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700/40",
    icon: AlertTriangle,
  },
  warning: {
    label: "Warning",
    classes: "bg-amber-100 text-amber-700 border-amber-200/60 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700/40",
    icon: Info,
  },
  info: {
    label: "Info",
    classes: "bg-blue-100 text-blue-700 border-blue-200/60 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700/40",
    icon: Info,
  },
};

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  open:         { label: "Open",         classes: "bg-red-100 text-red-700 border-red-200/60 dark:bg-red-900/30 dark:text-red-400" },
  acknowledged: { label: "Acknowledged", classes: "bg-amber-100 text-amber-700 border-amber-200/60 dark:bg-amber-900/30 dark:text-amber-400" },
  resolved:     { label: "Resolved",     classes: "bg-green-100 text-green-700 border-green-200/60 dark:bg-green-900/30 dark:text-green-400" },
};

function humanCheckType(checkType: string) {
  return checkType
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FinancialAlertsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  const params = new URLSearchParams();
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (severityFilter !== "all") params.set("severity", severityFilter);
  params.set("limit", "100");

  const { data: alertsData, isLoading, refetch } = useQuery<AlertsResponse>({
    queryKey: ["/api/admin/financial/alerts", statusFilter, severityFilter],
    queryFn: () => fetch(`/api/admin/financial/alerts?${params}`).then(r => r.json()),
    refetchInterval: 60_000,
  });

  const { data: health } = useQuery<HealthData>({
    queryKey: ["/api/admin/health/financial"],
    refetchInterval: 60_000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/admin/financial/alerts/${id}`, { status }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/financial/alerts"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/health/financial"] });
    },
    onError: () => toast({ title: "Failed to update alert", variant: "destructive" }),
  });

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/financial/alerts/generate", {}).then(r => r.json()),
    onSuccess: (d: any) => {
      toast({ title: `Generated ${d.generated} new alert(s)` });
      qc.invalidateQueries({ queryKey: ["/api/admin/financial/alerts"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/health/financial"] });
    },
    onError: () => toast({ title: "Failed to generate alerts", variant: "destructive" }),
  });

  const alerts = alertsData?.alerts ?? [];
  const total  = alertsData?.total ?? 0;

  const unresolved = health?.alerts.unresolved ?? 0;
  const bySeverity: Record<string, number> = {};
  for (const s of health?.alerts.bySeverity ?? []) bySeverity[s.severity] = s.count;

  const statCards = [
    { label: "Unresolved",  value: unresolved,                 color: unresolved > 0 ? "text-red-600 dark:text-red-400" : "text-foreground" },
    { label: "Critical",    value: bySeverity["critical"] ?? 0, color: (bySeverity["critical"] ?? 0) > 0 ? "text-red-600 dark:text-red-400" : "text-foreground" },
    { label: "Errors",      value: bySeverity["error"] ?? 0,    color: (bySeverity["error"] ?? 0) > 0 ? "text-orange-600 dark:text-orange-400" : "text-foreground" },
    { label: "Warnings",    value: bySeverity["warning"] ?? 0,  color: "text-amber-600 dark:text-amber-400" },
  ];

  const STATUS_TABS: { value: StatusFilter; label: string }[] = [
    { value: "open",         label: "Open" },
    { value: "acknowledged", label: "Acknowledged" },
    { value: "resolved",     label: "Resolved" },
    { value: "all",          label: "All" },
  ];

  const SEVERITY_FILTERS = ["all", "critical", "error", "warning", "info"];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Financial Alerts
            {unresolved > 0 && (
              <Badge className="bg-red-500 text-white text-xs px-1.5 py-0.5">
                {unresolved}
              </Badge>
            )}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Anomalies detected by the financial reconciliation engine
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            data-testid="button-refresh-alerts"
          >
            <RefreshCw className="h-3.5 w-3.5 me-1.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            data-testid="button-generate-alerts"
          >
            {generateMutation.isPending ? "Generating…" : "Generate from Reconciliation"}
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map(s => (
          <Card key={s.label} className="py-3">
            <CardContent className="p-0 px-4 flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
              <span className={cn("text-2xl font-bold tabular-nums", s.color)}>
                {s.value}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Status tabs */}
        <div className="flex rounded-lg border overflow-hidden text-sm">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              data-testid={`filter-status-${tab.value}`}
              className={cn(
                "px-3 py-1.5 transition-colors",
                statusFilter === tab.value
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Severity filter */}
        <div className="flex gap-1.5 flex-wrap">
          {SEVERITY_FILTERS.map(sev => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              data-testid={`filter-severity-${sev}`}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors capitalize",
                severityFilter === sev
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              )}
            >
              {sev === "all" ? "All severities" : sev}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading alerts…</div>
          ) : alerts.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <CheckCircle2 className="h-10 w-10 mx-auto text-green-500" />
              <p className="text-sm font-medium">No alerts found</p>
              <p className="text-xs text-muted-foreground">
                {statusFilter === "open"
                  ? "All financial checks are passing — no open alerts."
                  : "No alerts match these filters."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-start font-medium text-muted-foreground px-4 py-2.5 w-[110px]">Severity</th>
                    <th className="text-start font-medium text-muted-foreground px-4 py-2.5">Check / Message</th>
                    <th className="text-start font-medium text-muted-foreground px-4 py-2.5 w-[90px]">Country</th>
                    <th className="text-start font-medium text-muted-foreground px-4 py-2.5 w-[110px]">Status</th>
                    <th className="text-start font-medium text-muted-foreground px-4 py-2.5 w-[90px]">Age</th>
                    <th className="text-end font-medium text-muted-foreground px-4 py-2.5 w-[170px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert, i) => {
                    const sev = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.info;
                    const SevIcon = sev.icon;
                    const sta = STATUS_CONFIG[alert.status] ?? STATUS_CONFIG.open;
                    const isUpdating = updateMutation.isPending;
                    return (
                      <tr
                        key={alert.id}
                        data-testid={`row-alert-${alert.id}`}
                        className={cn(
                          "border-b last:border-0 transition-colors hover:bg-muted/30",
                          i % 2 === 0 ? "" : "bg-muted/10"
                        )}
                      >
                        <td className="px-4 py-3">
                          <Badge className={cn("flex items-center gap-1 w-fit text-xs border", sev.classes)}>
                            <SevIcon className="h-3 w-3 flex-shrink-0" />
                            {sev.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 max-w-[360px]">
                          <p className="text-xs font-medium text-muted-foreground mb-0.5">
                            {humanCheckType(alert.check_type)}
                            {alert.entity_type && (
                              <span className="ms-1.5 font-normal opacity-60">
                                · {alert.entity_type}
                                {alert.entity_id ? ` #${alert.entity_id.slice(0, 8)}` : ""}
                              </span>
                            )}
                          </p>
                          <p className="text-sm leading-snug">{alert.message}</p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {alert.country_code ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={cn("text-xs border", sta.classes)}>
                            {sta.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatRelative(alert.created_at)}
                        </td>
                        <td className="px-4 py-3 text-end">
                          <div className="flex justify-end gap-1.5">
                            {alert.status === "open" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                disabled={isUpdating}
                                onClick={() => updateMutation.mutate({ id: alert.id, status: "acknowledged" })}
                                data-testid={`button-acknowledge-${alert.id}`}
                              >
                                Acknowledge
                              </Button>
                            )}
                            {alert.status !== "resolved" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700/40"
                                disabled={isUpdating}
                                onClick={() => updateMutation.mutate({ id: alert.id, status: "resolved" })}
                                data-testid={`button-resolve-${alert.id}`}
                              >
                                Resolve
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {total > alerts.length && (
                <div className="px-4 py-2.5 border-t text-xs text-muted-foreground text-center">
                  Showing {alerts.length} of {total} alerts
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
