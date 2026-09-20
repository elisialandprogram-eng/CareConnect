import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Loader2, Check, X, RefreshCw, Clock, AlertTriangle, Shield,
  ExternalLink, FileText, Eye, FileCheck, Download,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface DocQueueItem {
  id: string | null;
  provider_id: string;
  document_type: string;
  document_url: string | null;
  file_name: string | null;
  verification_status: string;
  document_criticality: string | null;
  expiry_date: string | null;
  admin_note: string | null;
  created_at: string | null;
  deleted_at?: string | null;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
  country_code: string;
  provider_type: string;
  is_verified: boolean;
}

interface DocQueueData {
  pending:  DocQueueItem[];
  expiring: DocQueueItem[];
  rejected: DocQueueItem[];
  reupload: DocQueueItem[];
  missing:  DocQueueItem[];
}

type DocAction = "approve" | "reject" | "reupload" | "expire";

const CRIT_CFG: Record<string, { label: string; cls: string }> = {
  critical: { label: "Critical",  cls: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900" },
  high:     { label: "High",      cls: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400" },
  medium:   { label: "Medium",    cls: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400" },
  optional: { label: "Optional",  cls: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400" },
};

const DOC_LABELS: Record<string, string> = {
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

// Normalize legacy/alias values to canonical for display
function normalizeStatusForDisplay(s: string): string {
  if (s === "pending_review" || s === "verification_pending") return "under_review";
  if (s === "reupload_requested") return "reupload_required";
  if (s === "missing") return "pending";
  return s;
}

function statusBadge(raw: string) {
  const s = normalizeStatusForDisplay(raw);
  if (s === "approved")          return <Badge className="text-[11px] px-1.5 py-0 h-5 bg-emerald-100 text-emerald-700 border-emerald-200">Approved</Badge>;
  if (s === "rejected")          return <Badge className="text-[11px] px-1.5 py-0 h-5 bg-red-100 text-red-700 border-red-200">Rejected</Badge>;
  if (s === "expired")           return <Badge className="text-[11px] px-1.5 py-0 h-5 bg-muted text-muted-foreground border-border">Expired</Badge>;
  if (s === "reupload_required") return <Badge className="text-[11px] px-1.5 py-0 h-5 bg-purple-100 text-purple-700 border-purple-200">Re-upload Req.</Badge>;
  if (s === "under_review")      return <Badge className="text-[11px] px-1.5 py-0 h-5 bg-blue-100 text-blue-700 border-blue-200">Under Review</Badge>;
  return                                <Badge className="text-[11px] px-1.5 py-0 h-5 bg-yellow-100 text-yellow-700 border-yellow-200">Pending</Badge>;
}

function isImageUrl(url: string, fileName?: string | null) {
  const name = fileName || url;
  return /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(name);
}

function DocRow({
  doc,
  onAction,
  onPreview,
  onSelectProvider,
}: {
  doc: DocQueueItem;
  onAction: (doc: DocQueueItem, action: DocAction) => void;
  onPreview: (doc: DocQueueItem) => void;
  onSelectProvider: (id: string) => void;
}) {
  const { t } = useTranslation();
  const c = (key: string, fallback: string, options?: Record<string, unknown>) =>
    String(t(`admin.config.${key}`, { defaultValue: fallback, ...options }));
  const crit = CRIT_CFG[doc.document_criticality ?? "optional"] ?? CRIT_CFG.optional;
  const daysLeft = doc.expiry_date
    ? differenceInDays(new Date(doc.expiry_date), new Date())
    : null;

  const s = normalizeStatusForDisplay(doc.verification_status);
  const isPending  = s === "pending" || s === "under_review";
  const isApproved = s === "approved";
  const isRejected = s === "rejected";
  const isReupload = s === "reupload_required";

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
      data-testid={`doc-row-${doc.id ?? doc.provider_id}`}
    >
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarImage src={doc.avatar_url || ""} />
        <AvatarFallback className="text-xs font-medium bg-slate-100 text-slate-600">
          {doc.first_name?.[0] ?? "P"}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="text-sm font-medium text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 transition-colors"
            onClick={() => onSelectProvider(doc.provider_id)}
            data-testid={`link-open-provider-${doc.provider_id}`}
          >
            {doc.first_name} {doc.last_name}
            <ExternalLink className="h-3 w-3 opacity-60" />
          </button>
          <Badge variant="outline" className={cn("text-[11px] px-1.5 py-0 h-5", crit.cls)}>
             {c(doc.document_criticality ?? "optional", crit.label)}
          </Badge>
          <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5">{doc.country_code}</Badge>
          {doc.deleted_at && (
            <Badge className="text-[11px] px-1.5 py-0 h-5 bg-slate-200 text-slate-600 border-slate-300 dark:bg-slate-700 dark:text-slate-400">
               {c("deleted_by_provider", "Deleted by provider")}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3 opacity-60" />
             {c(`doc_${doc.document_type}`, DOC_LABELS[doc.document_type] ?? doc.document_type)}
          </span>
          {doc.created_at && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 opacity-60" />
              {format(new Date(doc.created_at), "MMM d, yyyy")}
            </span>
          )}
          {daysLeft !== null && (
            <span className={cn(
              "flex items-center gap-1 font-medium",
              daysLeft <= 0 ? "text-red-600" : daysLeft <= 7 ? "text-red-500" : daysLeft <= 30 ? "text-amber-500" : "text-green-600"
            )}>
              <AlertTriangle className="h-3 w-3" />
               {daysLeft <= 0 ? c("expired", "Expired") : c("days_left", "{{count}}d left", { count: daysLeft })}
            </span>
          )}
          {doc.admin_note && (
            <span className="text-slate-400 italic truncate max-w-[180px]">"{doc.admin_note}"</span>
          )}
        </div>
      </div>

      {/* State-based action buttons */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {/* Preview — always when URL present */}
        {doc.document_url && (
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 text-slate-400 hover:text-blue-600"
            onClick={() => onPreview(doc)}
             title={c("preview_document", "Preview document")}
            data-testid={`button-preview-doc-${doc.id ?? doc.provider_id}`}
          >
            <Eye className="h-4 w-4" />
          </Button>
        )}
        {/* Approve — pending, rejected, expired, reupload */}
        {doc.id && !isApproved && (
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
            onClick={() => onAction(doc, "approve")}
             title={c("approve", "Approve")}
            data-testid={`button-approve-doc-${doc.id}`}
          >
            <Check className="h-4 w-4" />
          </Button>
        )}
        {/* Reject — pending, approved (revoke), reupload */}
        {doc.id && (isPending || isApproved || isReupload) && (
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
            onClick={() => onAction(doc, "reject")}
             title={isApproved ? c("revoke_approval", "Revoke approval") : c("reject", "Reject")}
            data-testid={`button-reject-doc-${doc.id}`}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        {/* Request Reupload — pending, rejected */}
        {doc.id && (isPending || isRejected) && (
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
            onClick={() => onAction(doc, "reupload")}
             title={c("request_reupload", "Request re-upload")}
            data-testid={`button-reupload-doc-${doc.id}`}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
        {/* Mark Expired — approved only */}
        {doc.id && isApproved && (
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => onAction(doc, "expire")}
             title={c("mark_expired", "Mark as expired")}
            data-testid={`button-expire-doc-${doc.id}`}
          >
            <Clock className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function DocList({
  docs,
  emptyMsg,
  emptyIcon: EmptyIcon = FileCheck,
  onAction,
  onPreview,
  onSelectProvider,
}: {
  docs: DocQueueItem[];
  emptyMsg: string;
  emptyIcon?: React.ElementType;
  onAction: (doc: DocQueueItem, action: DocAction) => void;
  onPreview: (doc: DocQueueItem) => void;
  onSelectProvider: (id: string) => void;
}) {
  if (docs.length === 0) {
    return (
      <div className="py-16 text-center">
        <EmptyIcon className="h-10 w-10 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
        <p className="text-sm text-slate-400">{emptyMsg}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {docs.map((doc, idx) => (
        <DocRow
          key={doc.id ?? `${doc.provider_id}-${doc.document_type}-${idx}`}
          doc={doc}
          onAction={onAction}
          onPreview={onPreview}
          onSelectProvider={onSelectProvider}
        />
      ))}
    </div>
  );
}

export function DocumentQueue({ onSelectProvider }: { onSelectProvider: (id: string) => void }) {
  const [activeTab, setActiveTab] = useState("pending");
  const [dialog, setDialog] = useState<{
    doc: DocQueueItem;
    action: "reject" | "reupload";
  } | null>(null);
  const [note, setNote] = useState("");
  const [previewDoc, setPreviewDoc] = useState<DocQueueItem | null>(null);
  const { toast } = useToast();
  const { t } = useTranslation();
  const c = (key: string, fallback: string, options?: Record<string, unknown>) =>
    String(t(`admin.config.${key}`, { defaultValue: fallback, ...options }));
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery<DocQueueData>({
    queryKey: ["/api/admin/document-queue"],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, status, adminNote }: { id: string; status: string; adminNote?: string; providerId: string }) =>
      apiRequest("PATCH", `/api/admin/provider-documents/${id}/status`, { status, adminNote }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/document-queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/provider-documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics"] });
      if (vars.providerId) {
        queryClient.invalidateQueries({ queryKey: [`/api/admin/providers/${vars.providerId}/documents`] });
        queryClient.invalidateQueries({ queryKey: [`/api/admin/providers/${vars.providerId}/credentials`] });
      }
      const label =
        vars.status === "approved"          ? "approved" :
        vars.status === "rejected"          ? "rejected" :
        vars.status === "expired"           ? "marked as expired" :
        "marked for re-upload";
      toast({ title: `${t("admin.document", "Document")} ${label}` });
      setDialog(null);
      setNote("");
    },
    onError: () => toast({ title: "Action failed", variant: "destructive" }),
  });

  const handleAction = (doc: DocQueueItem, action: DocAction) => {
    if (action === "approve" || action === "expire") {
      if (!doc.id) return;
      actionMutation.mutate({
        id: doc.id,
        status: action === "approve" ? "approved" : "expired",
        providerId: doc.provider_id,
      });
      return;
    }
    setDialog({ doc, action });
    setNote("");
  };

  const handlePreview = (doc: DocQueueItem) => setPreviewDoc(doc);

  const handleConfirm = () => {
    if (!dialog?.doc.id) return;
    actionMutation.mutate({
      id: dialog.doc.id,
      status: dialog.action === "reject" ? "rejected" : "reupload_required",
      adminNote: note || undefined,
      providerId: dialog.doc.provider_id,
    });
  };

  const tabs = [
     { key: "pending",  label: c("pending_review", "Pending review"),     count: data?.pending?.length  ?? 0, countCls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400" },
     { key: "expiring", label: c("expiring_soon", "Expiring soon"),       count: data?.expiring?.length ?? 0, countCls: "bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400" },
     { key: "rejected", label: c("rejected", "Rejected"),            count: data?.rejected?.length ?? 0, countCls: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400" },
     { key: "reupload", label: c("reupload_requested", "Re-upload requested"),  count: data?.reupload?.length ?? 0, countCls: "bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400" },
     { key: "missing",  label: c("missing_mandatory", "Missing mandatory"),   count: data?.missing?.length  ?? 0, countCls: "bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400" },
  ];

  const totalActionable =
    (data?.pending?.length ?? 0) +
    (data?.expiring?.length ?? 0) +
    (data?.missing?.length ?? 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            {t("admin.docs_approval")}
            {totalActionable > 0 && (
              <Badge className="bg-blue-500 hover:bg-blue-600 text-white text-xs">
                 {totalActionable} {c("need_action", "need action")}
              </Badge>
            )}
          </h2>
             <p className="text-sm text-slate-500 mt-0.5">
             {t("admin.docs_approval_desc", "Review, approve, and reject provider documents. This is the single source of truth for document decisions.")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          data-testid="button-refresh-queue"
        >
          <RefreshCw className="h-4 w-4 mr-1.5" />
           {t("admin.refresh")}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto pb-0.5">
            <TabsList className="h-auto bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1 gap-1 flex flex-nowrap w-max min-w-full">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className="text-xs px-3 py-2 rounded-md whitespace-nowrap data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm"
                  data-testid={`tab-doc-queue-${tab.key}`}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={cn("ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold", tab.countCls)}>
                      {tab.count}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="mt-4">
            <TabsContent value="pending">
              <DocList
                docs={data?.pending ?? []}
                 emptyMsg={c("no_pending_documents", "No documents pending review — all caught up!")}
                emptyIcon={FileCheck}
                onAction={handleAction}
                onPreview={handlePreview}
                onSelectProvider={onSelectProvider}
              />
            </TabsContent>
            <TabsContent value="expiring">
              <DocList
                docs={data?.expiring ?? []}
                 emptyMsg={c("no_expiring_documents", "No documents expiring soon")}
                emptyIcon={Clock}
                onAction={handleAction}
                onPreview={handlePreview}
                onSelectProvider={onSelectProvider}
              />
            </TabsContent>
            <TabsContent value="rejected">
              <DocList
                docs={data?.rejected ?? []}
                 emptyMsg={c("no_rejected_documents", "No rejected documents")}
                emptyIcon={X}
                onAction={handleAction}
                onPreview={handlePreview}
                onSelectProvider={onSelectProvider}
              />
            </TabsContent>
            <TabsContent value="reupload">
              <DocList
                docs={data?.reupload ?? []}
                 emptyMsg={c("no_reupload_requests", "No re-upload requests pending")}
                emptyIcon={RefreshCw}
                onAction={handleAction}
                onPreview={handlePreview}
                onSelectProvider={onSelectProvider}
              />
            </TabsContent>
            <TabsContent value="missing">
              <DocList
                docs={data?.missing ?? []}
                 emptyMsg={c("all_mandatory_uploaded", "All providers have their mandatory documents uploaded")}
                emptyIcon={Shield}
                onAction={handleAction}
                onPreview={handlePreview}
                onSelectProvider={onSelectProvider}
              />
            </TabsContent>
          </div>
        </Tabs>
      )}

      {/* Reject / Reupload confirm dialog */}
      <Dialog open={!!dialog} onOpenChange={() => { setDialog(null); setNote(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
               {dialog?.action === "reject" ? c("reject_document", "Reject document") : c("request_reupload", "Request re-upload")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              <span className="font-medium">
                {dialog?.doc.first_name} {dialog?.doc.last_name}
              </span>
              {" — "}
              {dialog?.doc && (DOC_LABELS[dialog.doc.document_type] ?? dialog.doc.document_type)}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="admin-note-dlg">
               {dialog?.action === "reject" ? c("rejection_reason", "Rejection reason") : c("provider_instructions", "Instructions for provider")}
                 <span className="text-slate-400 font-normal ml-1 text-xs">({c("optional", "optional")})</span>
              </Label>
              <Textarea
                id="admin-note-dlg"
                placeholder={
                  dialog?.action === "reject"
                     ? c("reject_note_placeholder", "e.g. Document appears expired or illegible")
                     : c("reupload_note_placeholder", "e.g. Please upload a clearer, higher-resolution scan")
                }
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                data-testid="input-admin-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialog(null); setNote(""); }}>
               {c("cancel", "Cancel")}
            </Button>
            <Button
              variant={dialog?.action === "reject" ? "destructive" : "default"}
              onClick={handleConfirm}
              disabled={actionMutation.isPending}
              data-testid="button-confirm-doc-action"
            >
              {actionMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
               {dialog?.action === "reject" ? c("reject_document", "Reject document") : c("request_reupload", "Request re-upload")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document preview dialog */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400" />
               {previewDoc ? c(`doc_${previewDoc.document_type}`, DOC_LABELS[previewDoc.document_type] ?? previewDoc.document_type) : c("document", "Document")}
            </DialogTitle>
          </DialogHeader>
          {previewDoc && (
            <div className="space-y-4">
              {/* Metadata grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm border rounded-lg p-3 bg-slate-50 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                   <span className="text-slate-500 text-xs w-20 flex-shrink-0">{c("provider", "Provider")}</span>
                  <span className="font-medium">{previewDoc.first_name} {previewDoc.last_name}</span>
                </div>
                <div className="flex items-center gap-2">
                   <span className="text-slate-500 text-xs w-20 flex-shrink-0">{c("status", "Status")}</span>
                   {statusBadge(previewDoc.verification_status)}
                </div>
                {previewDoc.created_at && (
                  <div className="flex items-center gap-2">
                     <span className="text-slate-500 text-xs w-20 flex-shrink-0">{c("uploaded", "Uploaded")}</span>
                    <span>{format(new Date(previewDoc.created_at), "MMM d, yyyy")}</span>
                  </div>
                )}
                {previewDoc.expiry_date && (
                  <div className="flex items-center gap-2">
                     <span className="text-slate-500 text-xs w-20 flex-shrink-0">{c("expires", "Expires")}</span>
                    <span>{previewDoc.expiry_date}</span>
                  </div>
                )}
                {previewDoc.file_name && (
                  <div className="flex items-center gap-2 col-span-2">
                     <span className="text-slate-500 text-xs w-20 flex-shrink-0">{c("file", "File")}</span>
                    <span className="font-mono text-xs truncate">{previewDoc.file_name}</span>
                  </div>
                )}
                {previewDoc.admin_note && (
                  <div className="flex items-start gap-2 col-span-2">
                     <span className="text-slate-500 text-xs w-20 flex-shrink-0 mt-0.5">{c("admin_note", "Admin note")}</span>
                    <span className="text-xs italic text-slate-600 dark:text-slate-400">{previewDoc.admin_note}</span>
                  </div>
                )}
              </div>

              {/* File preview */}
              {previewDoc.document_url ? (
                <div className="border rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-900 flex items-center justify-center" style={{ maxHeight: "52vh", minHeight: "200px" }}>
                  {isImageUrl(previewDoc.document_url, previewDoc.file_name) ? (
                    <img
                      src={previewDoc.document_url}
                       alt={c("preview_document", "Document preview")}
                      className="max-w-full max-h-[52vh] object-contain"
                    />
                  ) : (
                    <iframe
                      src={previewDoc.document_url}
                       title={c("preview_document", "Document preview")}
                      className="w-full"
                      style={{ height: "52vh" }}
                    />
                  )}
                </div>
              ) : (
                <div className="border rounded-lg p-10 text-center text-slate-400 text-sm">
                   {c("no_file_preview", "No file preview available")}
                </div>
              )}

              {/* Download / open */}
              {previewDoc.document_url && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={previewDoc.document_url} target="_blank" rel="noopener noreferrer">
                       <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> {c("open_new_tab", "Open in new tab")}
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={previewDoc.document_url} download={previewDoc.file_name || "document"} rel="noopener noreferrer">
                       <Download className="h-3.5 w-3.5 mr-1.5" /> {c("download", "Download")}
                    </a>
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
