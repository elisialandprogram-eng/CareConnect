import { formatInCurrency } from "@/lib/currency";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CheckCircle, ChevronDown, ChevronRight, RefreshCw, ClipboardList, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Field label maps ──────────────────────────────────────────────────────────
const SVC_FIELD_LABELS: Record<string, string> = {
  name: "Name", description: "Description", duration: "Duration (min)",
  price: "Base price", home_visit_fee: "Home visit fee", clinic_fee: "Clinic fee",
  telemedicine_fee: "Online fee", emergency_fee: "Emergency fee",
  deposit_amount: "Deposit", enable_deposit: "Deposit on?",
  location_mode: "Location mode", buffer_before: "Buffer before (min)",
  buffer_after: "Buffer after (min)",
};
const NEW_SVC_FIELD_LABELS: Record<string, string> = {
  name: "Name", description: "Description", price: "Base price",
  duration: "Duration (min)", location_mode: "Location mode",
  home_visit_fee: "Home visit fee", clinic_fee: "Clinic fee",
  telemedicine_fee: "Online fee", buffer_before: "Buffer before (min)",
  buffer_after: "Buffer after (min)",
};

const LOCATION_MODE_LABELS: Record<string, string> = {
  clinic_only:    "Clinic",
  home_only:      "Home Visit",
  online_only:    "Online",
  clinic_online:  "Clinic & Online",
  home_online:    "Home Visit & Online",
  both:           "Home Visit & Clinic",
  all:            "Home Visit, Clinic & Online",
};
const formatLocationMode = (v: string) => LOCATION_MODE_LABELS[v] ?? v.replace(/_/g, " ");

const renderVal = (field: string, v: any) => {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (field === "location_mode") return formatLocationMode(String(v));
  return String(v);
};

// ── Unified item shape ────────────────────────────────────────────────────────
interface UnifiedItem {
  id: string;
  source: "service" | "request";
  name: string;
  typeBadge: string;
  status: "pending" | "approved" | "rejected";
  providerId: string;
  providerName: string;
  providerEmail?: string;
  providerCategory?: string;
  isNewService: boolean;
  // service source
  raw?: any;
  // request source extras
  category?: string;
  subServiceName?: string;
  description?: string;
  adminNotes?: string;
  rejectionReason?: string;
  suggestedPrice?: string;
  durationMinutes?: number;
  locationMode?: string;
  currency?: string;
  submittedAt?: string;
}

function statusBadge(status: string, c: (key: string, fallback: string) => string) {
  if (status === "pending")
    return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">{c("pending", "Pending")}</Badge>;
  if (status === "approved")
    return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">{c("approved", "Approved")}</Badge>;
  return <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300">{c("rejected", "Rejected")}</Badge>;
}

function typeBadge(label: string, c: (key: string, fallback: string) => string) {
  const isNew = label === "New Service";
  const isEdit = label === "Edit Request";
  return (
    <span className={cn(
      "inline-block text-[10px] font-medium px-1.5 py-0.5 rounded",
      isNew ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
        : isEdit ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
          : "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    )}>
       {isNew ? c("new_service", "New service") : isEdit ? c("edit_request", "Edit request") : c("service_request", "Service request")}
    </span>
  );
}

// ── Approve form for service-requests (needs duration/price) ──────────────────
const DEFAULT_APPROVE = { duration: "30", finalPrice: "", bufferBefore: "0", bufferAfter: "0" };

export function ServicePendingChangesPanel() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const c = (key: string, fallback: string, options?: Record<string, unknown>) =>
    String(t(`admin.config.${key}`, { defaultValue: fallback, ...options }));

  const svcQuery = useQuery<any[]>({ queryKey: ["/api/admin/services/pending-changes"], staleTime: 30_000 });
  const reqQuery = useQuery<any[]>({ queryKey: ["/api/admin/service-requests"], staleTime: 30_000 });

  const [filter, setFilter] = useState("pending");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState<UnifiedItem | null>(null);
  const [approveForm, setApproveForm] = useState(DEFAULT_APPROVE);
  const [rejecting, setRejecting] = useState<UnifiedItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const isLoading = svcQuery.isLoading || reqQuery.isLoading;

  const refetch = () => { svcQuery.refetch(); reqQuery.refetch(); };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/services/pending-changes"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/service-requests"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics"] });
  };

  // ── Mutations ───────────────────────────────────────────────────────────────

  const approveSvcMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/services/${id}/approve-changes`, {});
      return res.json();
    },
    onSuccess: () => { toast({ title: c("approved", "Approved"), description: c("service_live", "Service is now live.") }); setApproving(null); invalidate(); },
    onError: (e: any) => toast({ title: c("approve_failed", "Approve failed"), description: e?.message, variant: "destructive" }),
  });

  const approveReqMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("POST", `/api/admin/service-requests/${id}/approve`, data);
      return res.json();
    },
    onSuccess: () => { toast({ title: c("approved", "Approved"), description: c("service_created_notified", "Service created and provider notified.") }); setApproving(null); invalidate(); },
    onError: (e: any) => toast({ title: c("approve_failed", "Approve failed"), description: e?.message, variant: "destructive" }),
  });

  const rejectSvcMut = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/admin/services/${id}/reject-changes`, { reason });
      return res.json();
    },
    onSuccess: () => { toast({ title: c("rejected", "Rejected") }); setRejecting(null); setRejectionReason(""); invalidate(); },
    onError: (e: any) => toast({ title: c("reject_failed", "Reject failed"), description: e?.message, variant: "destructive" }),
  });

  const rejectReqMut = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/admin/service-requests/${id}/reject`, { rejectionReason: reason });
      return res.json();
    },
    onSuccess: () => { toast({ title: c("rejected", "Rejected") }); setRejecting(null); setRejectionReason(""); invalidate(); },
    onError: (e: any) => toast({ title: c("reject_failed", "Reject failed"), description: e?.message, variant: "destructive" }),
  });

  const handleApprove = (item: UnifiedItem) => {
    if (item.source === "service") {
      approveSvcMut.mutate(item.id);
    } else {
      setApproving(item);
      setApproveForm({ duration: String(item.durationMinutes ?? 30), finalPrice: item.suggestedPrice ?? "", bufferBefore: "0", bufferAfter: "0" });
    }
  };

  const handleReject = (item: UnifiedItem) => {
    setRejecting(item);
    setRejectionReason("");
  };

  const confirmReject = () => {
    if (!rejecting || !rejectionReason.trim()) return;
    if (rejecting.source === "service") {
      rejectSvcMut.mutate({ id: rejecting.id, reason: rejectionReason.trim() });
    } else {
      rejectReqMut.mutate({ id: rejecting.id, reason: rejectionReason.trim() });
    }
  };

  const confirmApproveRequest = () => {
    if (!approving) return;
    approveReqMut.mutate({
      id: approving.id,
      data: {
        duration: Number(approveForm.duration) || 30,
        finalPrice: approveForm.finalPrice || undefined,
        bufferBefore: Number(approveForm.bufferBefore) || 0,
        bufferAfter: Number(approveForm.bufferAfter) || 0,
      },
    });
  };

  // ── Normalize ───────────────────────────────────────────────────────────────

  const svcItems: UnifiedItem[] = (svcQuery.data ?? []).map((row: any) => {
    const isNew = !row.pending_changes;
    const userName = `${row.provider_first_name || ""} ${row.provider_last_name || ""}`.trim();
    const provName = userName || row.provider_clinic_name || row.provider_email || "—";
    const status = row.pending_change_status === "pending" ? "pending"
      : row.pending_change_status === "rejected" ? "rejected" : "approved";
    return {
      id: row.id,
      source: "service",
      name: row.name,
      typeBadge: isNew ? "New Service" : "Edit Request",
      status,
      providerId: row.provider_id ?? row.provider_db_id ?? "—",
      providerName: provName,
      providerEmail: row.provider_email,
      providerCategory: row.provider_category,
      isNewService: isNew,
      raw: row,
      submittedAt: row.pending_change_submitted_at || row.created_at,
    };
  });

  const reqItems: UnifiedItem[] = (reqQuery.data ?? []).map((row: any) => {
    const provName = row.provider?.user?.name || row.provider?.clinicName || row.provider?.user?.email || "—";
    const status = row.status === "pending_review" ? "pending"
      : row.status === "approved" ? "approved" : "rejected";
    return {
      id: row.id,
      source: "request",
      name: row.serviceName,
      typeBadge: "Service Request",
      status,
      providerId: row.provider?.id ?? "—",
      providerName: provName,
      providerEmail: row.provider?.user?.email,
      providerCategory: row.provider?.providerCategory,
      isNewService: true,
      raw: row,
      category: row.category,
      subServiceName: row.subServiceName,
      description: row.description,
      adminNotes: row.adminNotes,
      rejectionReason: row.rejectionReason,
      suggestedPrice: row.suggestedPrice,
      durationMinutes: row.durationMinutes,
      locationMode: row.locationMode,
      submittedAt: row.createdAt,
    };
  });

  const allItems = [...svcItems, ...reqItems].sort((a, b) => {
    const pa = a.status === "pending" ? 0 : 1;
    const pb = b.status === "pending" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return new Date(b.submittedAt ?? 0).getTime() - new Date(a.submittedAt ?? 0).getTime();
  });

  const filtered = filter === "all" ? allItems : allItems.filter(r => r.status === filter);
  const pendingCount = allItems.filter(r => r.status === "pending").length;

  const toggleExpand = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── Row detail content ───────────────────────────────────────────────────────
  const renderDetail = (item: UnifiedItem) => {
    const row = item.raw;
    if (item.source === "service") {
      const isNew = item.isNewService;
      const staged: Record<string, any> = row.pending_changes || {};
      return (
        <div className="mt-3 border-t pt-3 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            {isNew
              ? Object.entries(NEW_SVC_FIELD_LABELS).map(([k, label]) => {
                  const val = row[k];
                  if (val == null || val === "") return null;
                  return (
                    <div key={k} className="flex items-center justify-between gap-2 border rounded px-2 py-1.5 bg-muted/30">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-semibold text-primary">{renderVal(k, val)}</span>
                    </div>
                  );
                })
              : Object.keys(staged).filter(k => SVC_FIELD_LABELS[k]).map(k => (
                  <div key={k} className="flex items-center justify-between gap-2 border rounded px-2 py-1.5 bg-muted/30">
                    <span className="text-muted-foreground">{SVC_FIELD_LABELS[k] ?? k}</span>
                    <span>
                      <span className="line-through text-muted-foreground mr-2">{renderVal(k, row[k])}</span>
                      <span className="font-semibold text-primary">{renderVal(k, staged[k])}</span>
                    </span>
                  </div>
                ))
            }
          </div>
          {row.pending_change_reason && (
             <p className="text-xs text-muted-foreground"><strong>{c("reason", "Reason")}:</strong> {row.pending_change_reason}</p>
          )}
        </div>
      );
    }
    // request source
    return (
      <div className="mt-3 border-t pt-3 space-y-2">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
          {[
            { field: "category",      label: c("category", "Category"),         val: item.category },
            { field: "subServiceName",label: c("sub_service", "Sub-service"),      val: item.subServiceName },
            { field: "suggestedPrice",label: c("suggested_price", "Suggested price"),  val: item.suggestedPrice ? formatInCurrency(Number(item.suggestedPrice), item.currency ?? "USD") : undefined },
            { field: "duration",      label: c("duration_min", "Duration (min)"),   val: item.durationMinutes },
            { field: "location_mode", label: c("delivery_mode", "Delivery mode"),    val: item.locationMode },
          ].filter(f => f.val != null && f.val !== "").map(f => (
            <div key={f.label} className="flex items-center justify-between gap-2 border rounded px-2 py-1.5 bg-muted/30">
              <span className="text-muted-foreground">{f.label}</span>
              <span className="font-semibold text-primary">{renderVal(f.field, f.val)}</span>
            </div>
          ))}
        </div>
         {item.description && <p className="text-xs"><strong>{c("description", "Description")}:</strong> {item.description}</p>}
         {item.adminNotes && <p className="text-xs text-muted-foreground"><strong>{c("admin_notes", "Admin notes")}:</strong> {item.adminNotes}</p>}
         {item.rejectionReason && <p className="text-xs text-rose-600 dark:text-rose-400"><strong>{c("rejection_reason", "Rejection reason")}:</strong> {item.rejectionReason}</p>}
      </div>
    );
  };

  const anyMutPending = approveSvcMut.isPending || approveReqMut.isPending || rejectSvcMut.isPending || rejectReqMut.isPending;

  return (
    <>
      <Card data-testid="card-service-requests-unified">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                 {c("service_requests", "Service requests")}
                {pendingCount > 0 && (
                  <span className="inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[11px] font-bold w-5 h-5">
                    {pendingCount}
                  </span>
                )}
              </CardTitle>
              <CardDescription className="mt-0.5">
                 {c("new_services_edit_requests", "New services and edit requests from providers. Click a row to expand details.")}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={refetch} data-testid="button-refresh-service-requests">
               <RefreshCw className="h-4 w-4 mr-1.5" /> {c("refresh", "Refresh")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-request-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                 <SelectItem value="pending">{c("pending", "Pending")}</SelectItem>
                 <SelectItem value="approved">{c("approved", "Approved")}</SelectItem>
                 <SelectItem value="rejected">{c("rejected", "Rejected")}</SelectItem>
                 <SelectItem value="all">{c("all", "All")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <TableSkeleton rows={3} cols={3} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
               title={filter === "pending" ? c("no_pending_requests", "No pending requests") : c("no_requests_view", "No requests in this view")}
               description={c("switch_filter", "Switch the filter above to see requests with a different status.")}
            />
          ) : (
            <div className="space-y-2">
              {filtered.map(item => {
                const isOpen = expanded.has(item.id);
                return (
                  <div
                    key={`${item.source}-${item.id}`}
                    className="rounded-lg border bg-card overflow-hidden"
                    data-testid={`row-service-request-${item.id}`}
                  >
                    {/* ── Clickable header row ── */}
                    <button
                      type="button"
                      className="w-full text-left px-4 py-3 flex items-start justify-between gap-3 hover:bg-muted/30 transition-colors"
                      onClick={() => toggleExpand(item.id)}
                      data-testid={`button-expand-${item.id}`}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        {/* Row 1: name + type + status */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {isOpen
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          }
                          <span className="font-semibold text-sm" data-testid={`text-request-name-${item.id}`}>
                            {item.name}
                          </span>
                           {typeBadge(item.typeBadge, c)}
                           {statusBadge(item.status, c)}
                        </div>
                        {/* Row 2: provider name + ID */}
                        <div className="ml-6 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          <span>
                             {c("provider", "Provider")}:{" "}
                            <span className="font-medium text-foreground" data-testid={`text-provider-name-${item.id}`}>
                              {item.providerName}
                            </span>
                          </span>
                          {item.providerId && item.providerId !== "—" && (
                            <>
                              <span>·</span>
                              <span className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded" data-testid={`text-provider-id-${item.id}`}>
                                ID: {String(item.providerId).slice(0, 8)}…
                              </span>
                            </>
                          )}
                          {item.providerEmail && (
                            <><span>·</span><span>{item.providerEmail}</span></>
                          )}
                          {item.providerCategory && (
                            <><span>·</span><span className="text-foreground/70">{item.providerCategory}</span></>
                          )}
                        </div>
                      </div>
                      {/* Approve/Reject — only for pending, stops click propagation */}
                      {item.status === "pending" && (
                        <div
                          className="flex items-center gap-2 shrink-0"
                          onClick={e => e.stopPropagation()}
                        >
                          <Button
                            size="sm"
                            disabled={anyMutPending}
                            onClick={() => handleApprove(item)}
                            data-testid={`button-approve-${item.id}`}
                          >
                            {(approveSvcMut.isPending || approveReqMut.isPending) && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                             {item.isNewService ? c("activate", "Activate") : c("approve", "Approve")}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={anyMutPending}
                            onClick={() => handleReject(item)}
                            data-testid={`button-reject-${item.id}`}
                          >
                             {c("reject", "Reject")}
                          </Button>
                        </div>
                      )}
                    </button>

                    {/* ── Expandable detail section ── */}
                    {isOpen && (
                      <div className="px-4 pb-4">
                        {renderDetail(item)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approve dialog — for service-request source only (needs duration/price) */}
      <Dialog open={!!approving} onOpenChange={v => !v && setApproving(null)}>
        <DialogContent>
          <DialogHeader>
             <DialogTitle>{c("approve_create_service", "Approve & create service")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
               {c("creates_catalog_service", "This creates")} <strong>"{approving?.name}"</strong> {c("assigns_provider", "in the catalog and assigns it to the provider.")}
            </p>
            <div>
               <label className="text-sm font-medium">{c("duration_minutes", "Duration (minutes)")}</label>
              <Input type="number" min={5} max={480} value={approveForm.duration}
                onChange={e => setApproveForm({ ...approveForm, duration: e.target.value })}
                data-testid="input-approve-duration" />
            </div>
            <div>
               <label className="text-sm font-medium">{c("final_price", "Final price")}</label>
              <Input type="number" step="0.01" value={approveForm.finalPrice}
                onChange={e => setApproveForm({ ...approveForm, finalPrice: e.target.value })}
                data-testid="input-approve-price" />
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
               <p className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{c("buffer_time", "Buffer time")}</p>
              <div>
                 <label className="text-xs font-medium">{c("before_min", "Before (min)")}</label>
                <Input type="number" min={0} max={60} value={approveForm.bufferBefore}
                  onChange={e => setApproveForm({ ...approveForm, bufferBefore: e.target.value })}
                  data-testid="input-approve-buffer-before" />
              </div>
              <div>
                 <label className="text-xs font-medium">{c("after_min", "After (min)")}</label>
                <Input type="number" min={0} max={60} value={approveForm.bufferAfter}
                  onChange={e => setApproveForm({ ...approveForm, bufferAfter: e.target.value })}
                  data-testid="input-approve-buffer-after" />
              </div>
            </div>
          </div>
          <DialogFooter>
             <Button variant="outline" onClick={() => setApproving(null)}>{c("cancel", "Cancel")}</Button>
            <Button onClick={confirmApproveRequest} disabled={approveReqMut.isPending} data-testid="button-confirm-approve">
              {approveReqMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
               {c("approve", "Approve")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog — for both sources */}
      <Dialog open={!!rejecting} onOpenChange={v => { if (!v) { setRejecting(null); setRejectionReason(""); } }}>
        <DialogContent>
          <DialogHeader>
             <DialogTitle>{c("reject_request", "Reject request")} — {rejecting?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
           <p className="text-sm text-muted-foreground">{c("provider_notified_reason", "The provider will be notified with this reason.")}</p>
            <div>
               <label className="text-sm font-medium">{c("reason", "Reason")}</label>
              <Textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                rows={3}
                 placeholder={c("rejection_reason_placeholder", "Explain why this service request is being rejected…")}
                data-testid="textarea-reject-reason"
              />
            </div>
          </div>
          <DialogFooter>
           <Button variant="outline" onClick={() => { setRejecting(null); setRejectionReason(""); }}>{c("cancel", "Cancel")}</Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={(rejectSvcMut.isPending || rejectReqMut.isPending) || !rejectionReason.trim()}
              data-testid="button-confirm-reject"
            >
              {(rejectSvcMut.isPending || rejectReqMut.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
               {c("reject", "Reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
