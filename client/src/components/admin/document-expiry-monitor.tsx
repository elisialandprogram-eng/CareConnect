import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertTriangle, Clock, CheckCircle2, RefreshCw, ExternalLink,
  FileText, AlertCircle, Shield, Search, ChevronDown, ChevronUp,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
interface ExpiryDoc {
  id: string | null;
  provider_id: string;
  document_type: string;
  document_url: string | null;
  file_name: string | null;
  verification_status: string;
  expiry_date: string;
  document_criticality: string | null;
  admin_note: string | null;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
  country_code: string;
  provider_type: string;
  is_verified: boolean;
  days_left: number;
}

interface ExpiryData {
  overdue: ExpiryDoc[];
  critical: ExpiryDoc[];
  warning: ExpiryDoc[];
  notice: ExpiryDoc[];
  upcoming: ExpiryDoc[];
}

type Tier = "all" | "overdue" | "critical" | "warning" | "notice" | "upcoming";

// ── Tier config ────────────────────────────────────────────────────────────────
const TIER_CFG: Record<Exclude<Tier, "all">, {
  label: string;
  bg: string;
  text: string;
  border: string;
  icon: React.ElementType;
  rowBg: string;
}> = {
  overdue:  { label: "Overdue",       bg: "bg-red-100 dark:bg-red-950/30",    text: "text-red-700 dark:text-red-400",    border: "border-red-200 dark:border-red-800",    icon: AlertTriangle, rowBg: "bg-red-50/40 dark:bg-red-950/10" },
  critical: { label: "0–14 days",     bg: "bg-orange-100 dark:bg-orange-950/30", text: "text-orange-700 dark:text-orange-400", border: "border-orange-200 dark:border-orange-800", icon: AlertCircle, rowBg: "bg-orange-50/40 dark:bg-orange-950/10" },
  warning:  { label: "15–30 days",    bg: "bg-amber-100 dark:bg-amber-950/30",  text: "text-amber-700 dark:text-amber-400",   border: "border-amber-200 dark:border-amber-800",  icon: Clock,        rowBg: "bg-amber-50/30 dark:bg-amber-950/10"  },
  notice:   { label: "31–60 days",    bg: "bg-blue-100 dark:bg-blue-950/30",    text: "text-blue-700 dark:text-blue-400",     border: "border-blue-200 dark:border-blue-800",    icon: Shield,       rowBg: ""                                    },
  upcoming: { label: "61–90 days",    bg: "bg-muted dark:bg-muted/30",           text: "text-muted-foreground",                border: "border-border",                           icon: CheckCircle2, rowBg: ""                                    },
};

function tierForDoc(doc: ExpiryDoc): Exclude<Tier, "all"> {
  const d = Number(doc.days_left);
  if (d < 0)            return "overdue";
  if (d <= 14)          return "critical";
  if (d <= 30)          return "warning";
  if (d <= 60)          return "notice";
  return "upcoming";
}

const DOC_TYPE_LABELS: Record<string, string> = {
  id_card:                     "Government-Issued Photo Identification",
  medical_license:             "Medical / Professional Practising Licence",
  degree:                      "Primary Medical Degree / Professional Qualification",
  address_proof:               "Proof of Residential Address",
  insurance:                   "Professional Indemnity / Malpractice Insurance",
  specialization_certificate:  "Specialisation / Board Certification",
  certificate_of_good_standing:"Certificate of Good Standing",
  facility_operating_license:  "Healthcare Facility Operating Licence",
  business_registration:       "Business Registration Certificate / Trade Licence",
  tax_identification:          "Tax Identification Number (TIN) Proof",
  police_clearance:            "Police Clearance Certificate",
  professional_certificate:    "Professional Certificate",
  education_certificate:       "Education / Qualification Certificate",
  membership:                  "Professional Membership Certificate",
  other:                       "Additional Document",
};

function docTypeLabel(t: string) {
  return DOC_TYPE_LABELS[t] ?? t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function DaysLeftBadge({ days }: { days: number }) {
  const tier = days < 0 ? "overdue" : days <= 14 ? "critical" : days <= 30 ? "warning" : days <= 60 ? "notice" : "upcoming";
  const cfg = TIER_CFG[tier];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-md border", cfg.bg, cfg.text, cfg.border)}>
      {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today!" : `${days}d left`}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved:          "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
    pending:           "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
    under_review:      "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
    rejected:          "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
    reupload_required: "bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400",
    expiring_soon:     "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
    expired:           "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded border border-transparent", map[status] ?? "bg-muted text-muted-foreground")}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ── Summary stat chip ──────────────────────────────────────────────────────────
function TierChip({ tier, count, active, onClick }: { tier: Exclude<Tier, "all">; count: number; active: boolean; onClick: () => void }) {
  const cfg = TIER_CFG[tier];
  const Icon = cfg.icon;
  return (
    <button
      onClick={onClick}
      data-testid={`button-tier-${tier}`}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
        active ? cn(cfg.bg, cfg.text, cfg.border, "shadow-sm ring-1", cfg.border.replace("border-", "ring-")) : "bg-background text-muted-foreground border-border hover:bg-muted/50",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
      <span className={cn("ml-0.5 font-bold tabular-nums", count > 0 && active ? cfg.text : "")}>{count}</span>
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function DocumentExpiryMonitor({ onSelectProvider }: { onSelectProvider?: (id: string) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTier, setActiveTier] = useState<Tier>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<"days_left" | "document_type" | "name">("days_left");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data, isLoading, refetch, isRefetching } = useQuery<ExpiryData>({
    queryKey: ["/api/admin/document-expiry"],
    refetchInterval: 60_000,
  });

  const bulkMutation = useMutation({
    mutationFn: async (docIds: string[]) => {
      const res = await apiRequest("POST", "/api/admin/document-expiry/bulk-reupload", {
        documentIds: docIds,
        adminNote: "Document expiring — please upload an up-to-date version.",
      });
      return res.json();
    },
    onSuccess: (d: any) => {
      toast({ title: `Flagged ${d.updated} document(s)`, description: "Providers have been notified to re-upload." });
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["/api/admin/document-expiry"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/document-queue"] });
    },
    onError: () => toast({ title: "Bulk action failed", variant: "destructive" }),
  });

  const singleMutation = useMutation({
    mutationFn: async (docId: string) => {
      const res = await apiRequest("PATCH", `/api/admin/provider-documents/${docId}/status`, {
        status: "reupload_required",
        adminNote: "Document expiring — please upload an up-to-date version.",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Re-upload requested", description: "Provider has been notified." });
      qc.invalidateQueries({ queryKey: ["/api/admin/document-expiry"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/document-queue"] });
    },
    onError: () => toast({ title: "Action failed", variant: "destructive" }),
  });

  // ── Flatten + filter + sort ────────────────────────────────────────────────
  const allDocs: ExpiryDoc[] = data
    ? [...data.overdue, ...data.critical, ...data.warning, ...data.notice, ...data.upcoming]
    : [];

  const tierDocs = activeTier === "all" ? allDocs : (data?.[activeTier] ?? []);

  const filtered = tierDocs.filter(d => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      `${d.first_name} ${d.last_name}`.toLowerCase().includes(q) ||
      d.email.toLowerCase().includes(q) ||
      d.document_type.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortField === "days_left")      cmp = Number(a.days_left) - Number(b.days_left);
    else if (sortField === "document_type") cmp = a.document_type.localeCompare(b.document_type);
    else                                cmp = `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
    return sortDir === "asc" ? cmp : -cmp;
  });

  // ── Select helpers ─────────────────────────────────────────────────────────
  const validIds = sorted.filter(d => d.id).map(d => d.id as string);
  const allSelected = validIds.length > 0 && validIds.every(id => selected.has(id));
  const someSelected = validIds.some(id => selected.has(id));

  function toggleAll() {
    if (allSelected) {
      setSelected(prev => { const n = new Set(prev); validIds.forEach(id => n.delete(id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); validIds.forEach(id => n.add(id)); return n; });
    }
  }

  function toggleOne(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function sortBy(field: typeof sortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  function SortIcon({ field }: { field: typeof sortField }) {
    if (sortField !== field) return null;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3 ml-0.5 inline" /> : <ChevronDown className="h-3 w-3 ml-0.5 inline" />;
  }

  const selectedArr = Array.from(selected);
  const counts = {
    overdue:  data?.overdue.length  ?? 0,
    critical: data?.critical.length ?? 0,
    warning:  data?.warning.length  ?? 0,
    notice:   data?.notice.length   ?? 0,
    upcoming: data?.upcoming.length ?? 0,
  };
  const totalUrgent = counts.overdue + counts.critical;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48 rounded-lg" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="document-expiry-monitor">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            Document Expiry Monitor
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track provider documents approaching or past their expiry date.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching} data-testid="button-refresh-expiry">
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isRefetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Urgency alert banner */}
      {totalUrgent > 0 && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/60 dark:bg-red-950/10 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">
              {totalUrgent} document{totalUrgent !== 1 ? "s" : ""} need immediate action
            </p>
            <p className="text-xs text-red-600/80 dark:text-red-400/70">
              {counts.overdue > 0 && `${counts.overdue} expired`}
              {counts.overdue > 0 && counts.critical > 0 && " · "}
              {counts.critical > 0 && `${counts.critical} expiring within 14 days`}
            </p>
          </div>
          {totalUrgent > 0 && (
            <Button
              size="sm"
              variant="destructive"
              className="shrink-0"
              data-testid="button-bulk-flag-urgent"
              disabled={bulkMutation.isPending}
              onClick={() => {
                const urgentIds = [
                  ...(data?.overdue ?? []),
                  ...(data?.critical ?? []),
                ].filter(d => d.id && d.verification_status !== "reupload_required").map(d => d.id as string);
                if (urgentIds.length > 0) bulkMutation.mutate(urgentIds);
              }}
            >
              Flag All Urgent
            </Button>
          )}
        </div>
      )}

      {/* Tier filter chips */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={() => setActiveTier("all")}
          data-testid="button-tier-all"
          className={cn(
            "flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
            activeTier === "all" ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-border hover:bg-muted/50",
          )}
        >
          All <span className="font-bold ml-0.5">{allDocs.length}</span>
        </button>
        {(Object.keys(TIER_CFG) as Exclude<Tier, "all">[]).map(tier => (
          <TierChip
            key={tier}
            tier={tier}
            count={counts[tier]}
            active={activeTier === tier}
            onClick={() => setActiveTier(t => t === tier ? "all" : tier)}
          />
        ))}
      </div>

      {/* Search + bulk bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search provider or document…"
            className="pl-8 h-8 text-xs"
            data-testid="input-expiry-search"
          />
        </div>
        {someSelected && (
          <Button
            size="sm"
            variant="outline"
            className="border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-400 dark:hover:bg-orange-950/20"
            disabled={bulkMutation.isPending}
            data-testid="button-bulk-reupload-selected"
            onClick={() => bulkMutation.mutate(selectedArr)}
          >
            <AlertCircle className="h-3.5 w-3.5 mr-1.5" />
            Request Re-upload ({selectedArr.length})
          </Button>
        )}
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">
              {activeTier === "all" ? "No documents with expiry dates tracked" : `No ${TIER_CFG[activeTier as Exclude<Tier,"all">].label} documents`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {activeTier === "all" ? "Documents with expiry dates will appear here once providers upload them." : "Try a different filter."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                  <th className="w-8 px-3 py-2.5">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      data-testid="checkbox-select-all"
                      className="h-3.5 w-3.5"
                    />
                  </th>
                  <th className="text-left px-3 py-2.5 font-medium cursor-pointer select-none" onClick={() => sortBy("name")}>
                    Provider <SortIcon field="name" />
                  </th>
                  <th className="text-left px-3 py-2.5 font-medium cursor-pointer select-none" onClick={() => sortBy("document_type")}>
                    Document <SortIcon field="document_type" />
                  </th>
                  <th className="text-left px-3 py-2.5 font-medium cursor-pointer select-none whitespace-nowrap" onClick={() => sortBy("days_left")}>
                    Expiry <SortIcon field="days_left" />
                  </th>
                  <th className="text-left px-3 py-2.5 font-medium">Status</th>
                  <th className="text-right px-3 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((doc, idx) => {
                  const tier = tierForDoc(doc);
                  const cfg = TIER_CFG[tier];
                  const isSelected = doc.id ? selected.has(doc.id) : false;
                  const alreadyFlagged = doc.verification_status === "reupload_required";
                  return (
                    <tr
                      key={doc.id ?? `${doc.provider_id}-${doc.document_type}-${idx}`}
                      className={cn(
                        "border-b border-border/50 last:border-0 transition-colors hover:bg-muted/20",
                        cfg.rowBg,
                        isSelected && "bg-primary/5",
                      )}
                      data-testid={`row-expiry-doc-${doc.id ?? idx}`}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-2.5">
                        {doc.id && (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleOne(doc.id as string)}
                            className="h-3.5 w-3.5"
                            data-testid={`checkbox-doc-${doc.id}`}
                          />
                        )}
                      </td>

                      {/* Provider */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-6 w-6 shrink-0">
                            <AvatarImage src={doc.avatar_url ?? undefined} />
                            <AvatarFallback className="text-[9px]">
                              {doc.first_name?.[0]}{doc.last_name?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <button
                              className="font-medium text-foreground hover:text-primary hover:underline truncate block max-w-[140px]"
                              onClick={() => onSelectProvider?.(doc.provider_id)}
                              data-testid={`link-provider-${doc.provider_id}`}
                            >
                              {doc.first_name} {doc.last_name}
                            </button>
                            <span className="text-muted-foreground truncate block max-w-[140px]">{doc.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Document type */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <FileText className={cn("h-3.5 w-3.5 shrink-0", cfg.text)} />
                          <span className="font-medium text-foreground whitespace-nowrap">{docTypeLabel(doc.document_type)}</span>
                          {doc.document_criticality === "mandatory" && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-red-200 text-red-600 bg-red-50 dark:bg-red-950/20 dark:text-red-400 dark:border-red-800">
                              mandatory
                            </Badge>
                          )}
                        </div>
                      </td>

                      {/* Expiry */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="space-y-0.5">
                          <DaysLeftBadge days={Number(doc.days_left)} />
                          <div className="text-muted-foreground">
                            {format(parseISO(doc.expiry_date), "dd MMM yyyy")}
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2.5">
                        <StatusBadge status={doc.verification_status} />
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center gap-1.5 justify-end">
                          {doc.document_url && (
                            <Button variant="ghost" size="icon" className="h-6 w-6" asChild data-testid={`button-view-doc-${doc.id}`}>
                              <a href={doc.document_url} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </Button>
                          )}
                          {doc.id && !alreadyFlagged && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2 border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-400 dark:hover:bg-orange-950/20"
                              disabled={singleMutation.isPending}
                              onClick={() => singleMutation.mutate(doc.id as string)}
                              data-testid={`button-reupload-${doc.id}`}
                            >
                              Request Re-upload
                            </Button>
                          )}
                          {alreadyFlagged && (
                            <span className="text-[10px] text-orange-600 dark:text-orange-400 font-medium">Flagged ✓</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sorted.length >= 10 && (
            <div className="px-4 py-2.5 border-t border-border bg-muted/20 text-center">
              <span className="text-xs text-muted-foreground">Showing {sorted.length} document{sorted.length !== 1 ? "s" : ""}</span>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
