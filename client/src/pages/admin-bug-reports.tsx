import { formatDateTime } from "@/lib/datetime";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bug, Search, RefreshCw, UserCheck, CheckCircle, XCircle, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { usePageTitle } from "@/hooks/use-page-title";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { QK } from "@/lib/query-keys";

interface BugReport {
  id: string;
  title: string;
  category: string;
  severity: string;
  priority: string;
  status: string;
  country_code: string;
  reported_by_user_id: string;
  reporter_name: string;
  reporter_email: string;
  assignee_name?: string;
  assigned_to?: string;
  created_at: string;
  last_activity_at: string;
  resolution_notes?: string;
  admin_notes?: string;
}

interface BugReportComment {
  id: string;
  user_id: string;
  role: string;
  message: string;
  created_at: string;
  author_name: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug", ui_issue: "UI", booking_issue: "Booking", payment_issue: "Payment",
  account_issue: "Account", performance_issue: "Performance", feature_request: "Feature Request",
  service_issue: "Service", other: "Other",
};

function BugDetailPanel({ reportId, onClose }: { reportId: string; onClose: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: QK.adminBugReports(reportId),
    queryFn: () => apiRequest("GET", `/api/admin/bug-reports/${reportId}`).then(r => r.json()),
  });

  const statusMutation = useMutation({
    mutationFn: (body: any) => apiRequest("PATCH", `/api/bug-reports/${reportId}/status`, body).then(r => r.json()),
    onSuccess: () => { refetch(); queryClient.invalidateQueries({ queryKey: QK.adminBugReports() }); },
    onError: (err: Error) => toast({ variant: "destructive", title: "Failed", description: err.message }),
  });

  const assignMutation = useMutation({
    mutationFn: (body: any) => apiRequest("PATCH", `/api/bug-reports/${reportId}/assign`, body).then(r => r.json()),
    onSuccess: () => { refetch(); queryClient.invalidateQueries({ queryKey: QK.adminBugReports() }); toast({ title: "Assigned" }); },
    onError: (err: Error) => toast({ variant: "destructive", title: "Failed", description: err.message }),
  });

  const priorityMutation = useMutation({
    mutationFn: (priority: string) => apiRequest("PATCH", `/api/bug-reports/${reportId}/priority`, { priority }).then(r => r.json()),
    onSuccess: () => { refetch(); queryClient.invalidateQueries({ queryKey: QK.adminBugReports() }); },
    onError: (err: Error) => toast({ variant: "destructive", title: "Failed", description: err.message }),
  });

  const commentMutation = useMutation({
    mutationFn: (message: string) => apiRequest("POST", `/api/bug-reports/${reportId}/comments`, { message }).then(r => r.json()),
    onSuccess: () => { setReplyText(""); refetch(); },
    onError: (err: Error) => toast({ variant: "destructive", title: "Failed", description: err.message }),
  });

  if (isLoading) return <TableSkeleton rows={8} cols={1} />;
  if (!data) return null;

  const { report, comments } = data as { report: BugReport; comments: BugReportComment[] };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onClose}>← Back</Button>
        <span className="text-xs font-mono text-muted-foreground">#{report.id.slice(0, 8).toUpperCase()}</span>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-lg">{report.title}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{report.reporter_name} · {report.reporter_email}</p>
            </div>
            <StatusBadge status={report.status} domain="bug" />
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <StatusBadge status={report.severity} domain="bug_severity" />
            <StatusBadge status={report.priority} domain="bug_priority" />
            <Badge variant="outline" className="text-xs">{CATEGORY_LABELS[report.category] ?? report.category}</Badge>
            <Badge variant="outline" className="text-xs">{report.country_code}</Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <p className="text-xs text-muted-foreground">
            Created {formatDateTime(report.created_at)} · Last activity {formatDateTime(report.last_activity_at)}
          </p>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => assignMutation.mutate({ assignedTo: user?.id })} data-testid="button-assign-to-me">
              <UserCheck className="h-3 w-3" /> Assign to Me
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => statusMutation.mutate({ status: "triaged" })} data-testid="button-status-triaged">
              Triaged
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-amber-600" onClick={() => statusMutation.mutate({ status: "in_progress" })} data-testid="button-status-in-progress">
              In Progress
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-green-600" onClick={() => {
              statusMutation.mutate({ status: "resolved", resolutionNotes: resolutionNote || undefined });
            }} data-testid="button-status-resolve">
              <CheckCircle className="h-3 w-3" /> Resolve
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-muted-foreground" onClick={() => statusMutation.mutate({ status: "closed" })} data-testid="button-status-close">
              <Archive className="h-3 w-3" /> Close
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-red-600" onClick={() => statusMutation.mutate({ status: "rejected" })} data-testid="button-status-reject">
              <XCircle className="h-3 w-3" /> Reject
            </Button>
          </div>

          {/* Priority change */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Priority:</span>
            <Select value={report.priority} onValueChange={(v) => priorityMutation.mutate(v)}>
              <SelectTrigger className="h-7 w-28 text-xs" data-testid="select-bug-priority-admin">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Resolution notes field */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Resolution note (shown to user)</label>
            <textarea
              className="w-full border rounded-md p-2 text-sm mt-1 min-h-[60px] bg-background"
              placeholder="Briefly explain what was done…"
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              data-testid="textarea-resolution-notes"
            />
          </div>
        </CardContent>
      </Card>

      {/* Comments */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Conversation ({comments.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {comments.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">No messages yet.</p>
          )}
          {comments.map((c) => {
            const isMe = c.user_id === user?.id;
            return (
              <div key={c.id} className={`flex gap-3 ${isMe ? "flex-row-reverse" : ""}`}>
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                  {(c.author_name ?? "?")[0].toUpperCase()}
                </div>
                <div className={`flex-1 max-w-[80%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                  <span className={`text-xs text-muted-foreground mb-1 ${isMe ? "text-right" : ""}`}>
                    {c.author_name} · {c.role}
                  </span>
                  <div className={`p-3 rounded-lg text-sm ${isMe ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {c.message}
                  </div>
                  <span className="text-xs text-muted-foreground mt-1">{formatDateTime(c.created_at)}</span>
                </div>
              </div>
            );
          })}
          <div className="pt-2 border-t space-y-2">
            <textarea
              className="w-full border rounded-lg p-2 text-sm resize-none min-h-[70px] bg-background"
              placeholder="Reply to reporter…"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              data-testid="textarea-admin-bug-reply"
            />
            <Button size="sm" onClick={() => commentMutation.mutate(replyText)} disabled={commentMutation.isPending || !replyText.trim()} data-testid="button-send-admin-reply">
              {commentMutation.isPending ? "Sending…" : "Send Reply"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminBugReports() {
  usePageTitle("Bug Queue — Admin");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("last_activity");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const limit = 20;

  const queryParams = new URLSearchParams({
    limit: String(limit),
    offset: String((page - 1) * limit),
    ...(search ? { search } : {}),
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    ...(severityFilter !== "all" ? { severity: severityFilter } : {}),
    ...(priorityFilter !== "all" ? { priority: priorityFilter } : {}),
    ...(categoryFilter !== "all" ? { category: categoryFilter } : {}),
    ...(countryFilter !== "all" ? { country: countryFilter } : {}),
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: QK.adminBugReports(queryParams.toString()),
    queryFn: () => apiRequest("GET", `/api/admin/bug-reports?${queryParams}`).then(r => r.json()),
  });

  const bulkStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/bug-reports/${id}/status`, { status }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: QK.adminBugReports() }); toast({ title: "Updated" }); },
    onError: (err: Error) => toast({ variant: "destructive", title: "Failed", description: err.message }),
  });

  if (selectedId) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <BugDetailPanel reportId={selectedId} onClose={() => setSelectedId(null)} />
      </div>
    );
  }

  const reports: BugReport[] = data?.reports ?? [];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <PageBreadcrumbs items={[{ label: "Admin" }, { label: "Bug Queue" }]} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bug className="h-6 w-6 text-orange-500" />
            Bug Queue
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {data?.total ?? 0} report{data?.total !== 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2" data-testid="button-refresh-bugs">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search reports…"
                className="pl-8 h-9"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                data-testid="input-bug-search"
              />
            </div>

            {[
              { value: statusFilter, onChange: (v: string) => { setStatusFilter(v); setPage(1); }, placeholder: "Status", options: [
                { value: "all", label: "All statuses" },
                { value: "new", label: "New" }, { value: "triaged", label: "Triaged" },
                { value: "in_progress", label: "In Progress" }, { value: "waiting_for_user", label: "Waiting" },
                { value: "resolved", label: "Resolved" }, { value: "closed", label: "Closed" },
                { value: "duplicate", label: "Duplicate" }, { value: "rejected", label: "Rejected" },
              ], testId: "select-filter-status" },
              { value: severityFilter, onChange: (v: string) => { setSeverityFilter(v); setPage(1); }, placeholder: "Severity", options: [
                { value: "all", label: "All severity" },
                { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
                { value: "high", label: "High" }, { value: "critical", label: "Critical" },
              ], testId: "select-filter-severity" },
              { value: priorityFilter, onChange: (v: string) => { setPriorityFilter(v); setPage(1); }, placeholder: "Priority", options: [
                { value: "all", label: "All priority" },
                { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
                { value: "high", label: "High" }, { value: "urgent", label: "Urgent" },
              ], testId: "select-filter-priority" },
              { value: categoryFilter, onChange: (v: string) => { setCategoryFilter(v); setPage(1); }, placeholder: "Category", options: [
                { value: "all", label: "All categories" },
                { value: "bug", label: "Bug" }, { value: "ui_issue", label: "UI" },
                { value: "booking_issue", label: "Booking" }, { value: "payment_issue", label: "Payment" },
                { value: "account_issue", label: "Account" }, { value: "feature_request", label: "Feature Request" },
              ], testId: "select-filter-category" },
              ...(user?.role === "global_admin" ? [{ value: countryFilter, onChange: (v: string) => { setCountryFilter(v); setPage(1); }, placeholder: "Country", options: [
                { value: "all", label: "All countries" }, { value: "HU", label: "Hungary" }, { value: "IR", label: "Iran" },
              ], testId: "select-filter-country" }] : []),
            ].map((f) => (
              <Select key={f.testId} value={f.value} onValueChange={f.onChange}>
                <SelectTrigger className="h-9 w-36" data-testid={f.testId}>
                  <SelectValue placeholder={f.placeholder} />
                </SelectTrigger>
                <SelectContent>
                  {f.options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton rows={8} cols={8} />
      ) : !reports.length ? (
        <EmptyState
          icon={Bug}
          title="No bug reports found"
          description="No reports match the current filters."
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">ID</TableHead>
                  <TableHead>Reporter</TableHead>
                  {user?.role === "global_admin" && <TableHead className="w-16">Country</TableHead>}
                  <TableHead className="w-24">Category</TableHead>
                  <TableHead className="w-24">Severity</TableHead>
                  <TableHead className="w-20">Status</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead className="w-32">Last Activity</TableHead>
                  <TableHead className="w-28">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedId(r.id)}
                    data-testid={`row-bug-${r.id}`}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      #{r.id.slice(0, 8).toUpperCase()}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="text-sm font-medium truncate max-w-[140px]">{r.reporter_name}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[140px]">{r.title}</div>
                      </div>
                    </TableCell>
                    {user?.role === "global_admin" && (
                      <TableCell><Badge variant="outline" className="text-xs">{r.country_code}</Badge></TableCell>
                    )}
                    <TableCell className="text-xs">{CATEGORY_LABELS[r.category] ?? r.category}</TableCell>
                    <TableCell><StatusBadge status={r.severity} domain="bug_severity" /></TableCell>
                    <TableCell><StatusBadge status={r.status} domain="bug" /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.assignee_name ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(r.last_activity_at)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); bulkStatusMutation.mutate({ id: r.id, status: "triaged" }); }} data-testid={`button-quick-triage-${r.id}`}>
                          Triage
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-green-600" onClick={(e) => { e.stopPropagation(); bulkStatusMutation.mutate({ id: r.id, status: "resolved" }); }} data-testid={`button-quick-resolve-${r.id}`}>
                          Resolve
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Pagination */}
      {data?.totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-4">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">Previous</Button>
          <span className="flex items-center text-sm text-muted-foreground px-2">Page {page} of {data.totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">Next</Button>
        </div>
      )}
    </div>
  );
}
