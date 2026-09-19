import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, RefreshCw, ClipboardList } from "lucide-react";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useTranslation } from "react-i18next";

export function AdminServiceRequestsPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: items = [], isLoading, isError, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/service-requests"],
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const [editing, setEditing] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    category: "",
    serviceName: "",
    subServiceName: "",
    suggestedPrice: "",
    description: "",
    adminNotes: "",
    locationMode: "both" as "both" | "clinic_only" | "home_only" | "online_only" | "clinic_online" | "home_online" | "all",
  });
  const [approving, setApproving] = useState<any>(null);
  const [approveForm, setApproveForm] = useState({ duration: "30", finalPrice: "", bufferBefore: "0", bufferAfter: "0" });
  const [rejecting, setRejecting] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [filter, setFilter] = useState<string>("pending_review");

  const pendingCount = items.filter((r: any) => r.status === "pending_review").length;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/service-requests"] });
  };

  const invalidateAll = (providerId?: string) => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/service-requests"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics"] });
    if (providerId) {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/providers", providerId, "services"] });
    }
  };

  const editMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/service-requests/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("admin.service_requests.updated", "Request updated") });
      setEditing(null);
      invalidate();
    },
    onError: (e: any) => toast({ title: t("admin.service_requests.update_failed", "Update failed"), description: e?.message, variant: "destructive" }),
  });

  const approveMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any; providerId?: string }) => {
      const res = await apiRequest("POST", `/api/admin/service-requests/${id}/approve`, data);
      return res.json();
    },
    onSuccess: (_data, vars) => {
      toast({ title: t("admin.service_requests.approved", "Approved"), description: t("admin.service_requests.approved_desc", "Service was created and provider notified.") });
      setApproving(null);
      invalidateAll(vars.providerId);
    },
    onError: (e: any) => toast({ title: t("admin.service_requests.approve_failed", "Approve failed"), description: e?.message, variant: "destructive" }),
  });

  const rejectMut = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string; providerId?: string }) => {
      const res = await apiRequest("POST", `/api/admin/service-requests/${id}/reject`, { rejectionReason: reason });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      toast({ title: t("admin.service_requests.rejected", "Rejected"), description: t("admin.service_requests.rejected_desc", "Provider notified.") });
      setRejecting(null);
      setRejectionReason("");
      invalidateAll((vars as any).providerId);
    },
    onError: (e: any) => toast({ title: t("admin.service_requests.reject_failed", "Reject failed"), description: e?.message, variant: "destructive" }),
  });

  const openEdit = (r: any) => {
    setEditing(r);
    setEditForm({
      category: r.category ?? "",
      serviceName: r.serviceName ?? "",
      subServiceName: r.subServiceName ?? "",
      suggestedPrice: r.suggestedPrice ?? "",
      description: r.description ?? "",
      adminNotes: r.adminNotes ?? "",
      locationMode: (r.locationMode ?? "both") as any,
    });
  };

  const openApprove = (r: any) => {
    setApproving(r);
    setApproveForm({ duration: String(r.durationMinutes ?? 30), finalPrice: r.suggestedPrice ?? "", bufferBefore: String(r.bufferBefore ?? 0), bufferAfter: String(r.bufferAfter ?? 0) });
  };

  const filtered = items.filter((r: any) => filter === "all" || r.status === filter);

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      pending_review: { label: t("admin.service_requests.pending", "Pending"), cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
      approved: { label: t("admin.service_requests.approved", "Approved"), cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
      rejected: { label: t("admin.service_requests.rejected", "Rejected"), cls: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300" },
    };
    const m = map[status] ?? { label: status, cls: "bg-muted text-foreground" };
    return <Badge className={m.cls}>{m.label}</Badge>;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2">
              {t("admin.service_requests.title", "Service Requests")}
              {pendingCount > 0 && (
                <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-[11px] font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  {pendingCount}
                </span>
              )}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-service-requests">
              <RefreshCw className="h-4 w-4 mr-1.5" /> {t("common.refresh", "Refresh")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-request-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending_review">{t("admin.service_requests.pending_review", "Pending review")}</SelectItem>
                <SelectItem value="approved">{t("admin.service_requests.approved", "Approved")}</SelectItem>
                <SelectItem value="rejected">{t("admin.service_requests.rejected", "Rejected")}</SelectItem>
                <SelectItem value="all">{t("admin.service_requests.all", "All")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isLoading ? (
            <TableSkeleton rows={4} cols={3} />
          ) : isError ? (
            <EmptyState
              icon={ClipboardList}
              title={t("admin.service_requests.load_failed", "Failed to load service requests")}
              description={t("admin.retry_desc", "Something went wrong. Please try again.")}
              action={{ label: t("admin.retry", "Retry"), onClick: () => refetch() }}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={t("admin.service_requests.no_requests", "No requests in this view")}
              description={t("admin.service_requests.no_requests_desc", "Switch the filter above to see requests with a different status.")}
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((r: any) => {
                const provName =
                  r.provider?.accountType === "clinic"
                    ? r.provider?.clinicName ?? r.provider?.user?.name
                    : r.provider?.user?.name ?? r.provider?.businessName ?? t("admin.provider", "Provider");
                return (
                  <div key={r.id} className="rounded-lg border p-3" data-testid={`row-admin-request-${r.id}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium" data-testid={`text-admin-request-name-${r.id}`}>{r.serviceName}</span>
                          {statusBadge(r.status)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span>{r.category}</span>
                          {r.subServiceName && <><span>·</span><span>{r.subServiceName}</span></>}
                           {r.suggestedPrice ? <><span>·</span><span>{t("admin.service_requests.suggested", "Suggested")} ${r.suggestedPrice}</span></> : null}
                          {r.locationMode ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                              {({
                                 clinic_only:   t("admin.service_requests.location.clinic", "Clinic"),
                                 home_only:     t("admin.service_requests.location.home", "Home Visit"),
                                 online_only:   t("admin.service_requests.location.online", "Online"),
                                 clinic_online: t("admin.service_requests.location.clinic_online", "Clinic & Online"),
                                 home_online:   t("admin.service_requests.location.home_online", "Home Visit & Online"),
                                 both:          t("admin.service_requests.location.both", "Home Visit & Clinic"),
                                 all:           t("admin.service_requests.location.all", "Home Visit, Clinic & Online"),
                              } as Record<string, string>)[r.locationMode] ?? r.locationMode.replace(/_/g, " ")}
                            </span>
                          ) : null}
                        </div>
                        {/* Provider identity: name · email · category · sub-category */}
                        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                           <span>{t("admin.service_requests.from", "From")}: <span className="font-medium text-foreground">{provName}</span></span>
                          {r.provider?.user?.email ? <><span>·</span><span>{r.provider.user.email}</span></> : null}
                          {r.provider?.providerCategory ? <><span>·</span><span className="text-foreground/70">{r.provider.providerCategory}</span></> : null}
                          {r.provider?.providerSubcategory ? <><span>/</span><span className="text-foreground/70">{r.provider.providerSubcategory}</span></> : null}
                        </div>
                        {r.description && <div className="text-sm mt-2">{r.description}</div>}
                         {r.adminNotes && <div className="text-sm mt-1 text-muted-foreground"><strong>{t("admin.service_requests.notes", "Notes")}:</strong> {r.adminNotes}</div>}
                         {r.rejectionReason && <div className="text-sm mt-1 text-rose-600 dark:text-rose-400"><strong>{t("admin.service_requests.reason", "Reason")}:</strong> {r.rejectionReason}</div>}
                      </div>
                      {r.status === "pending_review" && (
                        <div className="flex flex-wrap gap-2">
                           <Button size="sm" variant="outline" onClick={() => openEdit(r)} data-testid={`button-edit-request-${r.id}`}>{t("common.edit", "Edit")}</Button>
                           <Button size="sm" onClick={() => openApprove(r)} data-testid={`button-approve-request-${r.id}`}>{t("admin.service_requests.approve", "Approve")}</Button>
                           <Button size="sm" variant="destructive" onClick={() => setRejecting(r)} data-testid={`button-reject-request-${r.id}`}>{t("admin.service_requests.reject", "Reject")}</Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
           <DialogHeader><DialogTitle>{t("admin.service_requests.edit_title", "Edit request")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
               <label className="text-sm font-medium">{t("admin.category", "Category")}</label>
              <Input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} data-testid="input-edit-category" />
            </div>
            <div>
               <label className="text-sm font-medium">{t("admin.service_name", "Service Name")}</label>
              <Input value={editForm.serviceName} onChange={(e) => setEditForm({ ...editForm, serviceName: e.target.value })} data-testid="input-edit-service-name" />
            </div>
            <div>
               <label className="text-sm font-medium">{t("admin.service_requests.sub_service", "Sub-service")}</label>
              <Input value={editForm.subServiceName} onChange={(e) => setEditForm({ ...editForm, subServiceName: e.target.value })} data-testid="input-edit-sub-service" />
            </div>
            <div>
               <label className="text-sm font-medium">{t("admin.service_requests.suggested_price", "Suggested price")}</label>
              <Input type="number" step="0.01" value={editForm.suggestedPrice} onChange={(e) => setEditForm({ ...editForm, suggestedPrice: e.target.value })} data-testid="input-edit-price" />
            </div>
            <div>
               <label className="text-sm font-medium">{t("admin.service_requests.description", "Description")}</label>
              <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={2} />
            </div>
            <div>
               <label className="text-sm font-medium">{t("admin.service_requests.delivery_question", "Where can this service be delivered?")}</label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {[
                   { value: "both", label: t("admin.service_requests.location.both", "Clinic & Home") },
                   { value: "clinic_only", label: t("admin.service_requests.location.clinic_only", "Clinic Only") },
                   { value: "home_only", label: t("admin.service_requests.location.home_only", "Home Only") },
                   { value: "online_only", label: t("admin.service_requests.location.online_only", "Online Only") },
                   { value: "clinic_online", label: t("admin.service_requests.location.clinic_online", "Clinic & Online") },
                   { value: "home_online", label: t("admin.service_requests.location.home_online", "Home & Online") },
                   { value: "all", label: t("admin.service_requests.location.all_modes", "All modes") },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEditForm({ ...editForm, locationMode: opt.value as any })}
                    data-testid={`button-edit-location-${opt.value}`}
                    className={`p-2 rounded-md border-2 text-xs transition-all ${editForm.locationMode === opt.value ? "border-primary bg-primary/5 font-semibold" : "border-border hover:border-primary/50"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
               <label className="text-sm font-medium">{t("admin.service_requests.admin_notes", "Admin notes")}</label>
              <Textarea value={editForm.adminNotes} onChange={(e) => setEditForm({ ...editForm, adminNotes: e.target.value })} rows={2} data-testid="textarea-edit-notes" />
            </div>
          </div>
          <DialogFooter>
             <Button variant="outline" onClick={() => setEditing(null)}>{t("common.cancel", "Cancel")}</Button>
            <Button
              onClick={() => editing && editMut.mutate({ id: editing.id, data: editForm })}
              disabled={editMut.isPending}
              data-testid="button-save-edit"
            >
              {editMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
               {t("common.save", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve dialog */}
      <Dialog open={!!approving} onOpenChange={(open) => !open && setApproving(null)}>
        <DialogContent>
           <DialogHeader><DialogTitle>{t("admin.service_requests.approve_title", "Approve & create service")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
               {t("admin.service_requests.approve_desc", "This creates \"{{name}}\" in the catalog and assigns it to the provider.", { name: approving?.serviceName })}
            </p>
            <div>
               <label className="text-sm font-medium">{t("admin.service_requests.duration", "Duration (minutes)")}</label>
              <Input type="number" min={5} max={480} value={approveForm.duration} onChange={(e) => setApproveForm({ ...approveForm, duration: e.target.value })} data-testid="input-approve-duration" />
            </div>
            <div>
               <label className="text-sm font-medium">{t("admin.service_requests.final_price", "Final price")}</label>
              <Input type="number" step="0.01" value={approveForm.finalPrice} onChange={(e) => setApproveForm({ ...approveForm, finalPrice: e.target.value })} data-testid="input-approve-price" />
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
               <p className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("admin.service_requests.buffer_time", "Buffer Time")}</p>
              <div>
                 <label className="text-xs font-medium">{t("admin.service_requests.buffer_before", "Buffer before (min)")}</label>
                 <p className="text-[11px] text-muted-foreground mb-1">{t("admin.service_requests.buffer_before_desc", "Blocked before appointment, not billed")}</p>
                <Input type="number" min={0} max={60} value={approveForm.bufferBefore} onChange={(e) => setApproveForm({ ...approveForm, bufferBefore: e.target.value })} data-testid="input-approve-buffer-before" />
              </div>
              <div>
                 <label className="text-xs font-medium">{t("admin.service_requests.buffer_after", "Buffer after (min)")}</label>
                 <p className="text-[11px] text-muted-foreground mb-1">{t("admin.service_requests.buffer_after_desc", "Recovery/prep time after session")}</p>
                <Input type="number" min={0} max={60} value={approveForm.bufferAfter} onChange={(e) => setApproveForm({ ...approveForm, bufferAfter: e.target.value })} data-testid="input-approve-buffer-after" />
              </div>
            </div>
          </div>
          <DialogFooter>
             <Button variant="outline" onClick={() => setApproving(null)}>{t("common.cancel", "Cancel")}</Button>
            <Button
              onClick={() =>
                approving &&
                approveMut.mutate({
                  id: approving.id,
                  providerId: approving.provider?.id,
                  data: {
                    duration: Number(approveForm.duration) || 30,
                    finalPrice: approveForm.finalPrice || undefined,
                    bufferBefore: Number(approveForm.bufferBefore) || 0,
                    bufferAfter: Number(approveForm.bufferAfter) || 0,
                  },
                })
              }
              disabled={approveMut.isPending}
              data-testid="button-confirm-approve"
            >
              {approveMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
               {t("admin.service_requests.approve", "Approve")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejecting} onOpenChange={(open) => { if (!open) { setRejecting(null); setRejectionReason(""); } }}>
        <DialogContent>
           <DialogHeader><DialogTitle>{t("admin.service_requests.reject_title", "Reject request")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
             <label className="text-sm font-medium">{t("admin.service_requests.reject_reason", "Reason (will be sent to provider)")}</label>
            <Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={3} data-testid="textarea-reject-reason" />
          </div>
          <DialogFooter>
             <Button variant="outline" onClick={() => { setRejecting(null); setRejectionReason(""); }}>{t("common.cancel", "Cancel")}</Button>
            <Button
              variant="destructive"
              onClick={() => rejecting && rejectionReason.trim() && rejectMut.mutate({ id: rejecting.id, reason: rejectionReason.trim(), providerId: rejecting.provider?.id })}
              disabled={rejectMut.isPending || !rejectionReason.trim()}
              data-testid="button-confirm-reject"
            >
              {rejectMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
               {t("admin.service_requests.reject", "Reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
