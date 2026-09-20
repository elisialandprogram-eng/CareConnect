import { formatDate, formatTime } from "@/lib/datetime";
import { formatCount } from "@/lib/format-utils";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, ChevronLeft, ChevronRight, Search, RefreshCw,
  ChevronDown, ChevronUp, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  beforeState: string | null;
  afterState: string | null;
  payload: string | null;
  ipAddress: string | null;
  countryCode: string | null;
  createdAt: string;
}

interface AuditLogResponse {
  logs: AuditLog[];
  total: number;
}

const PAGE_SIZE = 20;

const ACTION_PILL: Record<string, string> = {
  create:          "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300",
  update:          "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300",
  delete:          "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300",
  approve:         "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300",
  reject:          "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300",
  refund:          "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300",
  wallet_adjust:   "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300",
  ledger_override: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300",
  circuit_breaker: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300",
  role_change:     "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300",
  document_verify: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300",
  suspend:         "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300",
  verify:          "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300",
  login:           "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
  export:          "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300",
  repair_earnings: "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300",
};

function actionClass(action: string): string {
  return ACTION_PILL[action] ?? "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300";
}

function formatState(v: unknown): string | null {
  if (!v) return null;
  try { return JSON.stringify(typeof v === "string" ? JSON.parse(v) : v, null, 2); }
  catch { return String(v); }
}

function LogRow({ log }: { log: AuditLog }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();
  const tr = (key: string, fallback: string) => String(t(`admin.audit_panel.${key}`, { defaultValue: fallback }));
  const hasDetail = !!(log.details || log.beforeState || log.afterState);

  return (
    <div
      className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
      data-testid={`audit-row-${log.id}`}
    >
      <div
        className={cn("flex items-center gap-3 px-4 py-3", hasDetail && "cursor-pointer")}
        onClick={() => hasDetail && setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                actionClass(log.action)
              )}
            >
              {tr(log.action, log.action.replace(/_/g, " "))}
            </span>
            <span className="text-xs font-medium text-foreground">{tr(log.entityType, log.entityType.replace(/_/g, " "))}</span>
            {log.entityId && (
              <span className="text-xs text-muted-foreground font-mono">#{log.entityId.slice(0, 10)}</span>
            )}
            {log.countryCode && (
              <Badge variant="outline" className="text-xs px-1.5 py-0">{log.countryCode}</Badge>
            )}
          </div>
          {log.details && (() => {
            try {
              const parsed = JSON.parse(log.details);
              const preview = Object.entries(parsed).slice(0, 3).map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`).join(" · ");
              return <p className="text-xs text-muted-foreground mt-0.5 truncate">{preview}</p>;
            } catch {
              return <p className="text-xs text-muted-foreground mt-0.5 truncate">{log.details.slice(0, 100)}</p>;
            }
          })()}
        </div>

        <div className="flex-shrink-0 text-right flex items-center gap-2">
          <div>
            <p className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</p>
            <p className="text-xs text-muted-foreground/60">{formatTime(log.createdAt)}</p>
          </div>
          {hasDetail && (
            expanded
              ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </div>

      {expanded && hasDetail && (
        <div className="px-4 pb-4 space-y-3 bg-muted/20">
          {log.details && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">{tr("details", "Details")}</p>
              <pre className="text-xs bg-background rounded-lg border p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-48">
                {formatState(log.details)}
              </pre>
            </div>
          )}
          {(log.beforeState || log.afterState) && (
            <div className="grid grid-cols-2 gap-3">
              {log.beforeState && (
                <div>
                  <p className="text-xs font-semibold text-rose-600 mb-1">{tr("before", "Before")}</p>
                  <pre className="text-xs bg-rose-50 dark:bg-rose-950/20 rounded-lg border border-rose-100 p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-40">
                    {formatState(log.beforeState)}
                  </pre>
                </div>
              )}
              {log.afterState && (
                <div>
                  <p className="text-xs font-semibold text-emerald-600 mb-1">{tr("after", "After")}</p>
                  <pre className="text-xs bg-emerald-50 dark:bg-emerald-950/20 rounded-lg border border-emerald-100 p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-40">
                    {formatState(log.afterState)}
                  </pre>
                </div>
              )}
            </div>
          )}
          {log.ipAddress && (
            <p className="text-xs text-muted-foreground">IP: <span className="font-mono">{log.ipAddress}</span></p>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminAuditLogs() {
  const { t } = useTranslation();
  const tr = (key: string, fallback: string, options?: Record<string, unknown>) =>
    String(t(`admin.audit_panel.${key}`, { defaultValue: fallback, ...options }));
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch } = useQuery<AuditLogResponse>({
    queryKey: ["/api/admin/audit-logs", { limit: PAGE_SIZE, offset: page * PAGE_SIZE, action: actionFilter === "all" ? undefined : actionFilter, entityType: entityFilter === "all" ? undefined : entityFilter }],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (actionFilter !== "all") params.set("action", actionFilter);
      if (entityFilter !== "all") params.set("entityType", entityFilter);
      const res = await fetch(`/api/admin/audit-logs?${params}`, { credentials: "include" });
      return res.json();
    },
  });

  const allLogs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const logs = search
    ? allLogs.filter((l) => {
        const q = search.toLowerCase();
        return l.action.includes(q) || l.entityType.includes(q) || (l.entityId ?? "").toLowerCase().includes(q) || (l.details ?? "").toLowerCase().includes(q);
      })
    : allLogs;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              {tr("title", "Admin Activity Log")}
            </CardTitle>
            <CardDescription>
              {tr("description", "Structural administration changes: identity updates, fee mutations, document decisions, role changes.")}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-audit">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            {tr("refresh", "Refresh")}
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 pt-2">
          <div className="relative">
            <Search className="absolute start-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={tr("filter_logs", "Filter logs…")}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="pl-8 h-8 text-sm w-48"
              data-testid="input-audit-search"
            />
          </div>

          <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
            <SelectTrigger className="h-8 text-sm w-44" data-testid="select-audit-action">
              <SelectValue placeholder={tr("all_actions", "All actions")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr("all_actions", "All actions")}</SelectItem>
              <SelectItem value="create">{tr("create", "Create")}</SelectItem>
              <SelectItem value="update">{tr("update", "Update")}</SelectItem>
              <SelectItem value="delete">{tr("delete", "Delete")}</SelectItem>
              <SelectItem value="approve">{tr("approve", "Approve")}</SelectItem>
              <SelectItem value="reject">{tr("reject", "Reject")}</SelectItem>
              <SelectItem value="refund">{tr("refund", "Refund")}</SelectItem>
              <SelectItem value="wallet_adjust">{tr("wallet_adjust", "Wallet adjust")}</SelectItem>
              <SelectItem value="ledger_override">{tr("ledger_override", "Ledger override")}</SelectItem>
              <SelectItem value="circuit_breaker">{tr("circuit_breaker", "Circuit breaker")}</SelectItem>
              <SelectItem value="role_change">{tr("role_change", "Role change")}</SelectItem>
              <SelectItem value="document_verify">{tr("document_verify", "Document verify")}</SelectItem>
              <SelectItem value="suspend">{tr("suspend", "Suspend")}</SelectItem>
              <SelectItem value="export">{tr("export", "Export")}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v); setPage(0); }}>
            <SelectTrigger className="h-8 text-sm w-44" data-testid="select-audit-entity">
              <SelectValue placeholder={tr("all_entities", "All entities")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr("all_entities", "All entities")}</SelectItem>
              <SelectItem value="user">{tr("user", "User")}</SelectItem>
              <SelectItem value="provider">{tr("provider", "Provider")}</SelectItem>
              <SelectItem value="appointment">{tr("appointment", "Appointment")}</SelectItem>
              <SelectItem value="wallet">{tr("wallet", "Wallet")}</SelectItem>
              <SelectItem value="provider_document">{tr("provider_document", "Provider document")}</SelectItem>
              <SelectItem value="payout_request">{tr("payout_request", "Payout request")}</SelectItem>
              <SelectItem value="tax_setting">{tr("tax_setting", "Tax setting")}</SelectItem>
              <SelectItem value="platform_settings">{tr("platform_settings", "Platform settings")}</SelectItem>
            </SelectContent>
          </Select>

          {total > 0 && (
            <span className="text-xs text-muted-foreground self-center ml-auto">
              {formatCount(total)} {tr("total_records", "total records")}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">{tr("no_entries", "No audit log entries found")}</p>
            <p className="text-xs mt-1">{tr("adjust_filters", "Try adjusting your filters.")}</p>
          </div>
        ) : (
          <div>
            {logs.map((log) => <LogRow key={log.id} log={log} />)}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-xs text-muted-foreground">
              {tr("page_entries", `Page ${page + 1} of ${totalPages} · ${formatCount(total)} entries`, {
                page: page + 1,
                totalPages,
                total: formatCount(total),
              })}
            </p>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                data-testid="button-audit-prev"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                const pg = Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
                return (
                  <Button
                    key={pg}
                    variant={pg === page ? "default" : "outline"}
                    size="sm"
                    className="h-7 w-7 text-xs p-0"
                    onClick={() => setPage(pg)}
                  >
                    {pg + 1}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                data-testid="button-audit-next"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
