import { formatDate, formatDateTime } from "@/lib/datetime";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AvatarSM } from "@/components/ui/provider-image";
import {
  CheckCircle2, XCircle, AlertTriangle, Clock, FileText,
  ChevronRight, RefreshCw, ShieldCheck, Users, Eye,
  ExternalLink, ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface KycDoc {
  id: string;
  documentType: string;
  documentUrl: string | null;
  fileName: string | null;
  verificationStatus: string;
  adminNote: string | null;
  createdAt: string;
}

interface QueueEntry {
  id: string;
  status: string;
  provider_type: string;
  country_code: string;
  rejection_reason: string | null;
  is_verified: boolean;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
  documents: KycDoc[] | null;
  // Profile fields (now returned by enhanced endpoint)
  professional_title?: string | null;
  specialization?: string | null;
  provider_category?: string | null;
  provider_subcategory?: string | null;
  clinic_name?: string | null;
  license_number?: string | null;
  licensing_authority?: string | null;
  license_expiry_date?: string | null;
  license_document_url?: string | null;
  national_provider_id?: string | null;
  bio?: string | null;
  provider_agreement_accepted?: boolean | null;
  data_processing_agreement_accepted?: boolean | null;
  updated_at?: string | null;
  submitted_at?: string | null;
  last_resubmitted_at?: string | null;
  profile_updated_after_submission?: boolean | null;
}

// ── Display helpers ───────────────────────────────────────────────────────────
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

interface StatusCfg { label: string; cls: string; Icon: React.ElementType }
// Canonical status display config — only canonical values here.
const STATUS_CFG: Record<string, StatusCfg> = {
  approved:          { label: "Approved",          cls: "text-green-700 bg-green-50 border-green-200",    Icon: CheckCircle2 },
  rejected:          { label: "Rejected",          cls: "text-red-700 bg-red-50 border-red-200",          Icon: XCircle },
  reupload_required: { label: "Re-upload required",cls: "text-orange-700 bg-orange-50 border-orange-200", Icon: AlertTriangle },
  under_review:      { label: "Under review",      cls: "text-blue-700 bg-blue-50 border-blue-200",       Icon: Clock },
  pending:           { label: "Pending",           cls: "text-yellow-700 bg-yellow-50 border-yellow-200", Icon: Clock },
  expired:           { label: "Expired",           cls: "text-gray-500 bg-gray-50 border-gray-200",       Icon: FileText },
  missing:           { label: "Not uploaded",      cls: "text-gray-500 bg-gray-50 border-gray-200",       Icon: FileText },
};
// Maps legacy/alias values to canonical before lookup.
const LEGACY_DOC_STATUS_MAP: Record<string, string> = {
  pending_review:      "under_review",
  reupload_requested:  "reupload_required",
  verification_pending:"under_review",
};
function sStatus(raw: string): StatusCfg {
  const s = LEGACY_DOC_STATUS_MAP[raw] ?? raw;
  return STATUS_CFG[s] ?? { label: raw, cls: "text-gray-500 bg-gray-50 border-gray-200", Icon: FileText };
}

const PROVIDER_STATUS_BADGE: Record<string, string> = {
  draft:              "bg-gray-100 text-gray-600 border-gray-200",
  submitted:          "bg-blue-100 text-blue-700 border-blue-200",
  pending_approval:   "bg-blue-100 text-blue-700 border-blue-200",   // legacy alias
  action_required:    "bg-orange-100 text-orange-700 border-orange-200",
  under_review:       "bg-teal-100 text-teal-700 border-teal-200",
  documents_verified: "bg-teal-100 text-teal-700 border-teal-200",   // legacy alias
};

const STATUS_LABEL: Record<string, string> = {
  draft:              "Draft",
  submitted:          "Submitted",
  pending_approval:   "Pending Approval",
  action_required:    "Action Required",
  under_review:       "Under Review",
  documents_verified: "Under Review",
};

// ── Click-to-reveal license document preview ─────────────────────────────────
// Documents are NOT loaded until the admin clicks "Preview" to avoid
// auto-downloading large files on every queue load (bandwidth hardening).
function LicenseDocPreview({ url }: { url: string | null }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-background">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">License Document</p>
      </div>
      <div className="p-4">
        {url ? (
          <div className="space-y-3">
            {revealed ? (
              url.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i) ? (
                <img
                  src={url}
                  alt="License document"
                  loading="lazy"
                  className="w-full rounded-xl border border-border object-contain max-h-48"
                  data-testid="img-license-document"
                />
              ) : (
                <div className="w-full h-36 rounded-xl border-2 border-dashed border-border bg-background flex flex-col items-center justify-center gap-2">
                  <FileText className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">PDF / Document file</p>
                </div>
              )
            ) : (
              <button
                type="button"
                onClick={() => setRevealed(true)}
                className="w-full h-24 rounded-xl border-2 border-dashed border-border bg-background hover:bg-muted/40 transition-colors flex flex-col items-center justify-center gap-2 cursor-pointer"
                data-testid="button-preview-license-doc"
              >
                <Eye className="h-6 w-6 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">Click to preview document</p>
              </button>
            )}
            <Button variant="outline" size="sm" className="w-full rounded-xl gap-2" asChild data-testid="button-open-license-doc">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Open Full Document
              </a>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-36 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-500 mb-2" />
            <p className="text-sm font-medium text-foreground">No license document uploaded</p>
            <p className="text-xs text-muted-foreground mt-1">Provider has not uploaded their license yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Single doc row in the detail panel ───────────────────────────────────────
interface DocRowProps {
  doc: KycDoc;
  providerId: string;
  onDone: () => void;
}
function DocRow({ doc, providerId, onDone }: DocRowProps) {
  const { toast } = useToast();
  const [note, setNote] = useState(doc.adminNote ?? "");
  const [showNote, setShowNote] = useState(false);
  const [noteMode, setNoteMode] = useState<"reject" | "reupload">("reject");
  const s = sStatus(doc.verificationStatus);

  const { mutate: update, isPending } = useMutation({
    mutationFn: ({ status, adminNote }: { status: string; adminNote?: string }) =>
      apiRequest("PATCH", `/api/admin/providers/${providerId}/verify-document`, {
        documentId: doc.id,
        status,
        adminNote: adminNote ?? undefined,
      }),
    onSuccess: () => {
      toast({ title: "Document updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/verification-queue"] });
      onDone();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const isLocked = doc.verificationStatus === "approved";

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2",
        doc.verificationStatus === "rejected" || doc.verificationStatus === "reupload_required"
          ? "border-red-200 bg-red-50/30"
          : "border-border bg-card",
      )}
      data-testid={`doc-row-${doc.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{DOC_LABELS[doc.documentType] ?? doc.documentType.replace(/_/g, " ")}</p>
          {doc.fileName && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <FileText className="h-3 w-3" />{doc.fileName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", s.cls)}>
            <s.Icon className="h-3 w-3" />{s.label}
          </span>
          {doc.documentUrl && (
            <a
              href={doc.documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              data-testid={`link-view-doc-${doc.id}`}
            >
              <Eye className="h-3.5 w-3.5" /> View
            </a>
          )}
        </div>
      </div>

      {doc.adminNote && (
        <p className="text-xs text-muted-foreground italic">Note: {doc.adminNote}</p>
      )}

      {!isLocked && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50"
              disabled={isPending}
              onClick={() => update({ status: "approved", adminNote: note || undefined })}
              data-testid={`button-approve-doc-${doc.id}`}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-red-700 border-red-300 hover:bg-red-50"
              disabled={isPending}
              onClick={() => { setNoteMode("reject"); setShowNote(true); }}
              data-testid={`button-reject-doc-${doc.id}`}
            >
              <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-orange-700 border-orange-300 hover:bg-orange-50"
              disabled={isPending}
              onClick={() => { setNoteMode("reupload"); setShowNote(true); }}
              data-testid={`button-reupload-doc-${doc.id}`}
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Request re-upload
            </Button>
          </div>

          {showNote && (
            <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
              <Label className="text-xs font-medium">
                {noteMode === "reject"
                  ? "Rejection reason (required — sent to provider)"
                  : "Re-upload instructions (required — sent to provider)"}
              </Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  noteMode === "reject"
                    ? "Explain why this document is being rejected…"
                    : "Explain what needs to be corrected (e.g. image resolution too low, document expired)…"
                }
                className="text-xs min-h-[64px]"
                data-testid={`textarea-rejection-note-${doc.id}`}
              />
              {!note.trim() && (
                <p className="text-xs text-red-500">A reason is required before proceeding.</p>
              )}
              <div className="flex gap-2">
                {noteMode === "reject" ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs"
                    disabled={isPending || !note.trim()}
                    onClick={() => update({ status: "rejected", adminNote: note })}
                    data-testid={`button-confirm-reject-${doc.id}`}
                  >
                    {isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Confirm rejection"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-orange-700 border-orange-300 hover:bg-orange-50"
                    disabled={isPending || !note.trim()}
                    onClick={() => update({ status: "reupload_required", adminNote: note })}
                    data-testid={`button-confirm-reupload-${doc.id}`}
                  >
                    {isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Send re-upload request"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => { setShowNote(false); setNote(doc.adminNote ?? ""); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Checklist item ────────────────────────────────────────────────────────────
function ChecklistItem({ label, value, verified, onToggle }: {
  label: string;
  value?: string;
  verified: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer",
        verified
          ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30"
          : "border-border bg-muted/20 hover:border-primary/30"
      )}
      onClick={onToggle}
      data-testid={`checklist-item-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className={cn(
        "w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors",
        verified ? "bg-emerald-500 border-emerald-500" : "border-border"
      )}>
        {verified && <CheckCircle2 className="w-3 h-3 text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        {value && <p className="text-xs text-muted-foreground mt-0.5 break-all">{value}</p>}
      </div>
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────
interface DetailPanelProps {
  entry: QueueEntry;
  onClose: () => void;
}
function DetailPanel({ entry, onClose }: DetailPanelProps) {
  const { toast } = useToast();
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [verifiedFields, setVerifiedFields] = useState<Set<string>>(new Set());

  const { mutate: finalize, isPending: finalizing } = useMutation({
    mutationFn: ({ decision, reason }: { decision: string; reason?: string }) =>
      apiRequest("POST", `/api/admin/providers/${entry.id}/finalize-verification`, { decision, reason }),
    onSuccess: (_data, vars) => {
      toast({ title: vars.decision === "approve" ? "Provider approved ✓" : "Provider rejected" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/verification-queue"] });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const docs = entry.documents ?? [];
  const allDocsApproved = docs.length > 0 && docs.every((d) => d.verificationStatus === "approved");
  const ps = PROVIDER_STATUS_BADGE[entry.status] ?? "bg-gray-100 text-gray-600 border-gray-200";

  // Profile checklist items
  const checklistItems = [
    { key: "professional_title", label: "Professional Title", value: entry.professional_title ?? undefined },
    { key: "license_number", label: "License Number", value: entry.license_number ?? undefined },
    { key: "licensing_authority", label: "Licensing Authority", value: entry.licensing_authority ?? undefined },
    { key: "license_expiry", label: "License Expiry Date", value: entry.license_expiry_date ? formatDate(entry.license_expiry_date, { day: "numeric", month: "short", year: "numeric" }) : undefined },
    { key: "national_id", label: "National Provider ID / Govt. Photo ID", value: entry.national_provider_id ?? (entry.documents?.find(d => d.documentType === "id_card") ? `✓ Govt. Photo ID uploaded` : undefined) },
    { key: "provider_agreement", label: "Provider Agreement", value: entry.provider_agreement_accepted ? "✓ Accepted" : "✗ Not accepted" },
    { key: "gdpr_agreement", label: "GDPR / Data Processing Agreement", value: entry.data_processing_agreement_accepted ? "✓ Accepted" : "✗ Not accepted" },
    { key: "bio", label: "Bio (≥ 20 chars)", value: entry.bio ? `${entry.bio.slice(0, 100)}${entry.bio.length > 100 ? "…" : ""}` : undefined },
  ];

  const toggleField = (key: string) => {
    setVerifiedFields((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const allChecklistVerified = checklistItems.length > 0 && checklistItems.every((i) => verifiedFields.has(i.key));
  const canApprove = allDocsApproved && allChecklistVerified;

  return (
    <div className="space-y-5" data-testid="verification-detail-panel">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AvatarSM src={entry.avatar_url ?? undefined} name={`${entry.first_name} ${entry.last_name}`} />
          <div>
            <p className="font-semibold">{entry.first_name} {entry.last_name}</p>
            <p className="text-xs text-muted-foreground">{entry.email}</p>
            {(entry.professional_title || entry.specialization) && (
              <p className="text-xs text-muted-foreground">{entry.professional_title ?? entry.specialization}</p>
            )}
          </div>
        </div>
        <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", ps)}>
          {entry.status.replace(/_/g, " ")}
        </span>
      </div>

      {/* Updated after submission warning */}
      {entry.profile_updated_after_submission && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800 dark:text-amber-300">Profile updated after submission</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              The provider edited their profile after submission. The information below reflects their latest version.
              {entry.last_resubmitted_at && (
                <> Last resubmitted: <strong>{formatDateTime(entry.last_resubmitted_at)}</strong>.</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Submission timestamps row */}
      {(entry.submitted_at || entry.last_resubmitted_at) && (
        <div className="rounded-lg border border-border bg-muted/20 px-4 py-2.5 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          {entry.submitted_at && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Originally submitted: <strong className="ml-0.5">{formatDate(entry.submitted_at, { day: "numeric", month: "short", year: "numeric" })}</strong>
            </span>
          )}
          {entry.last_resubmitted_at && (
            <span className="flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3" />
              Last resubmitted: <strong className="ml-0.5">{formatDateTime(entry.last_resubmitted_at)}</strong>
            </span>
          )}
        </div>
      )}

      {/* ── SECTION 1: Profile & Credentials ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Profile & Credentials</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Submitted profile text */}
          <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-background">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Submitted Profile Data</p>
            </div>
            <div className="p-4 space-y-2.5 text-sm">
              {[
                { label: "Provider Category", value: entry.provider_category },
                { label: "Sub-Category", value: entry.provider_subcategory },
                { label: "Specialization", value: entry.specialization },
                { label: "Clinic / Practice", value: entry.clinic_name },
                { label: "License Number", value: entry.license_number },
                { label: "Licensing Authority", value: entry.licensing_authority },
                { label: "License Expiry", value: entry.license_expiry_date ? formatDate(entry.license_expiry_date) : null },
                { label: "National Provider ID / Govt. Photo ID", value: entry.national_provider_id ?? (entry.documents?.find(d => d.documentType === "id_card") ? `✓ Govt. Photo ID uploaded (${entry.documents!.find(d => d.documentType === "id_card")!.verificationStatus})` : null) },
                { label: "Provider Agreement", value: entry.provider_agreement_accepted ? "✓ Accepted" : "✗ Not accepted" },
                { label: "GDPR Agreement", value: entry.data_processing_agreement_accepted ? "✓ Accepted" : "✗ Not accepted" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-2">
                  <span className="text-xs text-muted-foreground font-medium flex-shrink-0">{label}</span>
                  <span className={`text-xs text-right break-all ${value ? "text-foreground font-medium" : "text-muted-foreground/50 italic"}`}>
                    {value || "Not provided"}
                  </span>
                </div>
              ))}
              {entry.bio && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">Bio</p>
                  <p className="text-xs text-foreground leading-relaxed bg-background rounded-lg p-2.5 border border-border">{entry.bio}</p>
                </div>
              )}
            </div>
          </div>

          {/* License document preview — click-to-reveal to avoid auto-downloading the file */}
          <LicenseDocPreview url={entry.license_document_url ?? null} />
        </div>

        {/* Verification checklist */}
        <div className="rounded-xl border border-border bg-muted/10 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Credential Verification Checklist</p>
            </div>
            <span className="text-xs text-muted-foreground">
              {verifiedFields.size} / {checklistItems.length} verified
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Tick each item once you've confirmed it matches the submitted document. All must be checked before final approval.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {checklistItems.map((item) => (
              <ChecklistItem
                key={item.key}
                label={item.label}
                value={item.value}
                verified={verifiedFields.has(item.key)}
                onToggle={() => toggleField(item.key)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── SECTION 2: KYC Documents ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">KYC Documents</p>
          {docs.length > 0 && (
            <span className="text-xs text-muted-foreground ml-auto">
              {docs.filter(d => d.verificationStatus === "approved").length} / {docs.length} approved
            </span>
          )}
        </div>
        {docs.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-4 text-center">
            <AlertTriangle className="h-6 w-6 text-amber-500 mx-auto mb-1.5" />
            <p className="text-sm font-medium text-foreground">No documents uploaded yet</p>
            <p className="text-xs text-muted-foreground mt-0.5">Provider hasn't submitted any KYC documents.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {docs.map((doc) => (
              <DocRow
                key={doc.id}
                doc={doc}
                providerId={entry.id}
                onDone={() => {}}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── SECTION 3: Final Decision ── */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
        <p className="text-sm font-semibold">Final Decision</p>

        {/* Gate explanations */}
        <div className="space-y-1.5">
          <div className={cn("flex items-center gap-2 text-xs", allChecklistVerified ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
            {allChecklistVerified
              ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
              : <Clock className="h-3.5 w-3.5 flex-shrink-0" />}
            Credential checklist: {allChecklistVerified ? "Complete" : `${verifiedFields.size}/${checklistItems.length} items verified`}
          </div>
          <div className={cn("flex items-center gap-2 text-xs", allDocsApproved ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
            {allDocsApproved
              ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
              : <Clock className="h-3.5 w-3.5 flex-shrink-0" />}
            KYC documents: {allDocsApproved
              ? "All approved"
              : docs.length === 0
                ? "No documents uploaded"
                : `${docs.filter(d => d.verificationStatus === "approved").length}/${docs.length} approved`}
          </div>
        </div>

        {showReject && (
          <div className="space-y-1.5">
            <Label className="text-xs">Rejection reason (sent to provider)</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why the application is being rejected…"
              className="text-xs min-h-[64px]"
              data-testid="textarea-final-rejection"
            />
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white h-8 text-xs"
            disabled={finalizing || !canApprove}
            onClick={() => finalize({ decision: "approve" })}
            data-testid="button-finalize-approve"
          >
            {finalizing ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
            Approve Application
          </Button>

          {!showReject ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs text-red-700 border-red-300 hover:bg-red-50"
              disabled={finalizing}
              onClick={() => setShowReject(true)}
              data-testid="button-finalize-reject-open"
            >
              <XCircle className="h-3.5 w-3.5 mr-1" /> Reject Application
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="destructive"
                className="h-8 text-xs"
                disabled={finalizing || !rejectReason.trim()}
                onClick={() => finalize({ decision: "reject", reason: rejectReason })}
                data-testid="button-finalize-reject-confirm"
              >
                Confirm Rejection
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowReject(false)}>
                Cancel
              </Button>
            </>
          )}
        </div>

        {!canApprove && (
          <p className="text-xs text-muted-foreground italic">
            {!allChecklistVerified && !allDocsApproved
              ? "Complete the credential checklist and approve all documents before finalizing."
              : !allChecklistVerified
                ? "Tick all checklist items above before finalizing."
                : "Approve all KYC documents above before finalizing."}
          </p>
        )}
      </div>

      <Button variant="ghost" size="sm" className="text-xs w-full" onClick={onClose} data-testid="button-back-queue">
        ← Back to queue
      </Button>
    </div>
  );
}

// ── Main ProviderReviewQueue component ────────────────────────────────────────
export function ProviderReviewQueue() {
  const [selected, setSelected] = useState<QueueEntry | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: queue = [], isLoading, refetch } = useQuery<QueueEntry[]>({
    queryKey: ["/api/admin/verification-queue"],
  });

  const filtered = queue.filter((e) => {
    const matchesStatus = statusFilter === "all" || (() => {
      if (statusFilter === "submitted") return ["submitted", "pending_approval"].includes(e.status);
      if (statusFilter === "under_review") return ["under_review", "documents_verified"].includes(e.status);
      return e.status === statusFilter;
    })();
    if (!matchesStatus) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      e.status.includes(q)
    );
  });

  if (selected) {
    const live = queue.find((e) => e.id === selected.id) ?? selected;
    return (
      <div className="max-w-2xl mx-auto">
        <DetailPanel entry={live} onClose={() => setSelected(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="provider-review-queue">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Provider Review Queue
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review credentials, verify documents, and give final approval — all in one place
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm w-56"
            data-testid="input-queue-search"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => refetch()}
            data-testid="button-refresh-queue"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Submitted",        key: "submitted",      statuses: ["submitted", "pending_approval"],      cls: "text-blue-700"   },
          { label: "Under Review",     key: "under_review",   statuses: ["under_review", "documents_verified"], cls: "text-teal-700"   },
          { label: "Action Required",  key: "action_required",statuses: ["action_required"],                    cls: "text-orange-700" },
          { label: "Draft",            key: "draft",          statuses: ["draft"],                              cls: "text-gray-600"   },
        ].map(({ label, key, statuses, cls }) => (
          <Card
            key={label}
            className={cn("py-3 cursor-pointer transition-all hover:border-primary/50", statusFilter === key && "border-primary ring-1 ring-primary/30")}
            onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
          >
            <CardContent className="p-0 px-4 text-center">
              <p className={cn("text-2xl font-bold", cls)}>
                {queue.filter((e) => statuses.includes(e.status)).length}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Active filter pill */}
      {statusFilter !== "all" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtering by:</span>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", PROVIDER_STATUS_BADGE[statusFilter] ?? "bg-gray-100 text-gray-600 border-gray-200")}>
            {STATUS_LABEL[statusFilter] ?? statusFilter}
          </span>
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground underline" onClick={() => setStatusFilter("all")}>
            Clear
          </button>
        </div>
      )}

      {/* Queue list */}
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground" data-testid="empty-queue">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No providers in review queue</p>
          <p className="text-xs mt-1">{search ? "Try a different search." : "All applications are up to date."}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => {
            const docs = entry.documents ?? [];
            const pendingDocs = docs.filter((d) => {
              const s = LEGACY_DOC_STATUS_MAP[d.verificationStatus] ?? d.verificationStatus;
              return s === "pending" || s === "under_review";
            }).length;
            const rejectedDocs = docs.filter((d) => {
              const s = LEGACY_DOC_STATUS_MAP[d.verificationStatus] ?? d.verificationStatus;
              return s === "rejected" || s === "reupload_required";
            }).length;
            const approvedDocs = docs.filter((d) => d.verificationStatus === "approved").length;
            const ps = PROVIDER_STATUS_BADGE[entry.status] ?? "bg-gray-100 text-gray-600 border-gray-200";
            const submittedAt = (entry.submitted_at ?? entry.updated_at) ? formatDate((entry.submitted_at ?? entry.updated_at)!, { day: "numeric", month: "short" }) : null;
            const resubmittedAt = entry.last_resubmitted_at ? formatDateTime(entry.last_resubmitted_at) : null;
            const updatedAfterSubmit = entry.profile_updated_after_submission === true;

            return (
              <Card
                key={entry.id}
                className="cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all"
                onClick={() => setSelected(entry)}
                data-testid={`queue-row-${entry.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <AvatarSM src={entry.avatar_url ?? undefined} name={`${entry.first_name} ${entry.last_name}`} />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{entry.first_name} {entry.last_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {entry.email}
                          {entry.professional_title ? ` · ${entry.professional_title}` : ""}
                        </p>
                        {submittedAt && (
                          <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1 mt-0.5">
                            <Clock className="h-3 w-3" /> Submitted {submittedAt}
                          </p>
                        )}
                        {resubmittedAt && (
                          <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1 mt-0.5">
                            <RefreshCw className="h-3 w-3" /> Resubmitted {resubmittedAt}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {approvedDocs > 0 && (
                        <span className="text-xs text-green-700 flex items-center gap-0.5">
                          <CheckCircle2 className="h-3.5 w-3.5" />{approvedDocs}
                        </span>
                      )}
                      {pendingDocs > 0 && (
                        <span className="text-xs text-blue-700 flex items-center gap-0.5">
                          <Clock className="h-3.5 w-3.5" />{pendingDocs}
                        </span>
                      )}
                      {rejectedDocs > 0 && (
                        <span className="text-xs text-red-700 flex items-center gap-0.5">
                          <XCircle className="h-3.5 w-3.5" />{rejectedDocs}
                        </span>
                      )}
                      {updatedAfterSubmit && (
                        <span className="rounded-full border border-amber-300 bg-amber-50 text-amber-700 px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1">
                          <RefreshCw className="h-2.5 w-2.5" /> Updated
                        </span>
                      )}
                      <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", ps)}>
                        {STATUS_LABEL[entry.status] ?? entry.status.replace(/_/g, " ")}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
