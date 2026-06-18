import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { QK } from "@/lib/query-keys";
import { useLocation } from "wouter";
import { Bug, Plus, ChevronRight, Clock, MessageSquare, ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ReportBugDialog } from "@/components/report-bug-dialog";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";

interface BugReport {
  id: string;
  title: string;
  category: string;
  severity: string;
  priority: string;
  status: string;
  created_at: string;
  last_activity_at: string;
  resolution_notes?: string;
}

interface BugReportComment {
  id: string;
  user_id: string;
  role: string;
  message: string;
  created_at: string;
  author_name: string;
  author_avatar?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug / Error", ui_issue: "UI Issue", booking_issue: "Booking Issue",
  payment_issue: "Payment Issue", account_issue: "Account Issue",
  performance_issue: "Performance", feature_request: "Feature Request", other: "Other",
};

function ReportCard({ report, onClick }: { report: BugReport; onClick: () => void }) {
  return (
    <div
      className="p-4 border rounded-lg cursor-pointer hover:border-primary/40 hover:bg-muted/30 transition-all group"
      onClick={onClick}
      data-testid={`card-bug-report-${report.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground">#{report.id.slice(0, 8).toUpperCase()}</span>
            <StatusBadge status={report.status} domain="bug" />
            <StatusBadge status={report.severity} domain="bug_severity" />
          </div>
          <h3 className="font-medium text-sm truncate">{report.title}</h3>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span>{CATEGORY_LABELS[report.category] ?? report.category}</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(report.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
      </div>
    </div>
  );
}

function ReportDetail({ reportId, onBack }: { reportId: string; onBack: () => void }) {
  const { user } = useAuth();
  const [replyText, setReplyText] = useState("");
  const [isReplying, setIsReplying] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: QK.bugReport(reportId!),
    queryFn: () => apiRequest("GET", `/api/bug-reports/${reportId}`).then(r => r.json()),
  });

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setIsReplying(true);
    try {
      await apiRequest("POST", `/api/bug-reports/${reportId}/comments`, { message: replyText.trim() });
      setReplyText("");
      refetch();
    } finally {
      setIsReplying(false);
    }
  };

  if (isLoading) return <TableSkeleton rows={6} cols={1} />;
  if (!data) return null;

  const { report, comments } = data as { report: BugReport; comments: BugReportComment[] };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 -ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to reports
      </Button>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <span className="text-xs font-mono text-muted-foreground block mb-1">#{report.id.slice(0, 8).toUpperCase()}</span>
              <CardTitle className="text-lg">{report.title}</CardTitle>
            </div>
            <StatusBadge status={report.status} domain="bug" />
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <StatusBadge status={report.severity} domain="bug_severity" />
            <StatusBadge status={report.priority} domain="bug_priority" />
            <Badge variant="outline" className="text-xs">{CATEGORY_LABELS[report.category] ?? report.category}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Submitted</p>
            <p className="text-sm">{new Date(report.created_at).toLocaleString()}</p>
          </div>
          {report.resolution_notes && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Resolution</p>
              <p className="text-sm text-green-800 dark:text-green-300">{report.resolution_notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comments thread */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Conversation ({comments.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {comments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No messages yet. Add a comment below.</p>
          )}
          {comments.map((c) => {
            const isMe = c.user_id === user?.id;
            return (
              <div key={c.id} className={`flex gap-3 ${isMe ? "flex-row-reverse" : ""}`} data-testid={`comment-bug-${c.id}`}>
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                  {(c.author_name ?? "?")[0].toUpperCase()}
                </div>
                <div className={`flex-1 max-w-[80%] ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                  <div className={`text-xs text-muted-foreground mb-1 ${isMe ? "text-right" : ""}`}>
                    {isMe ? "You" : c.author_name} · {c.role}
                  </div>
                  <div className={`p-3 rounded-lg text-sm ${isMe ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {c.message}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(c.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Reply box — only for non-closed/rejected reports */}
          {!["closed","duplicate","rejected"].includes(report.status) && (
            <div className="pt-3 border-t space-y-2">
              <textarea
                className="w-full border rounded-lg p-3 text-sm resize-none min-h-[80px] bg-background"
                placeholder="Add a reply or provide more information…"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                data-testid="textarea-bug-reply"
              />
              <Button size="sm" onClick={handleReply} disabled={isReplying || !replyText.trim()} data-testid="button-send-bug-reply">
                {isReplying ? "Sending…" : "Send Reply"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function MyBugReports() {
  usePageTitle("My Reports");
  const [reportOpen, setReportOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: QK.myBugReportsPaged(page),
    queryFn: () => apiRequest("GET", `/api/bug-reports/my?limit=${limit}&offset=${(page - 1) * limit}`).then(r => r.json()),
  });

  if (selectedId) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          <div className="max-w-2xl mx-auto px-4 py-6">
            <ReportDetail reportId={selectedId} onBack={() => setSelectedId(null)} />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
      <div className="max-w-2xl mx-auto px-4 py-6">
      <PageBreadcrumbs items={[{ label: "My Reports" }]} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">My Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">Track the status of your submitted reports</p>
        </div>
        <Button onClick={() => setReportOpen(true)} size="sm" className="gap-2" data-testid="button-new-bug-report">
          <Plus className="h-4 w-4" /> New Report
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} cols={1} />
      ) : !data?.reports?.length ? (
        <EmptyState
          icon={Bug}
          title="No reports yet"
          description="Found a bug or have a suggestion? Let us know!"
          action={{ label: "Report a Problem", onClick: () => setReportOpen(true) }}
        />
      ) : (
        <div className="space-y-3">
          {data.reports.map((r: BugReport) => (
            <ReportCard key={r.id} report={r} onClick={() => setSelectedId(r.id)} />
          ))}

          {data.totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-4">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">
                Previous
              </Button>
              <span className="flex items-center text-sm text-muted-foreground px-2">
                Page {page} of {data.totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      <ReportBugDialog open={reportOpen} onOpenChange={setReportOpen} />
    </div>
      </main>
      <Footer />
    </div>
  );
}
