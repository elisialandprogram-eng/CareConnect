import { formatDate } from "@/lib/datetime";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Shield, FileText, Upload, Trash2, Loader2, CheckCircle, XCircle,
  AlertTriangle, Clock, GraduationCap, Award, Eye, RefreshCw,
  Building2, CreditCard, Home, FileCheck, Lock, Camera, User,
  Receipt, Briefcase, FileBadge,
} from "lucide-react";

async function fetchMultipart(url: string, body: FormData): Promise<Response> {
  const res = await fetch(url, { method: "POST", credentials: "include", body });
  if (!res.ok) {
    const raw = await res.text().catch(() => res.statusText);
    let msg = raw;
    try { const j = JSON.parse(raw); if (j?.message) msg = j.message; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res;
}

function normStatus(raw: string): string {
  if (raw === "pending_review" || raw === "verification_pending") return "under_review";
  if (raw === "reupload_requested" || raw === "needs_reupload") return "reupload_required";
  return raw;
}

function statusBadge(raw: string) {
  const s = normStatus(raw);
  if (s === "approved")          return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1 text-xs"><CheckCircle className="h-3 w-3" />Approved</Badge>;
  if (s === "rejected")          return <Badge className="bg-red-100 text-red-700 border-red-200 gap-1 text-xs"><XCircle className="h-3 w-3" />Rejected</Badge>;
  if (s === "reupload_required") return <Badge className="bg-orange-100 text-orange-700 border-orange-200 gap-1 text-xs"><RefreshCw className="h-3 w-3" />Re-upload needed</Badge>;
  if (s === "expired")           return <Badge className="bg-muted text-muted-foreground border-border gap-1 text-xs"><Clock className="h-3 w-3" />Expired</Badge>;
  if (s === "expiring_soon")     return <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1 text-xs"><AlertTriangle className="h-3 w-3" />Expiring soon</Badge>;
  if (s === "under_review")      return <Badge className="bg-blue-100 text-blue-700 border-blue-200 gap-1 text-xs"><Clock className="h-3 w-3" />Under review</Badge>;
  if (s === "missing")           return <Badge className="bg-red-100 text-red-700 border-red-200 gap-1 text-xs"><AlertTriangle className="h-3 w-3" />Required</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 gap-1 text-xs"><Clock className="h-3 w-3" />Pending</Badge>;
}

function statusMessage(raw: string): string {
  const s = normStatus(raw);
  if (s === "approved")          return "Verified by admin";
  if (s === "rejected")          return "Please re-upload — see admin note below";
  if (s === "reupload_required") return "Admin has requested a fresh copy";
  if (s === "expired")           return "Document renewal required — upload a new version";
  if (s === "expiring_soon")     return "Renew before expiry to stay compliant";
  if (s === "under_review")      return "Under review by admin";
  if (s === "missing")           return "This document is required to complete verification";
  return "Waiting for admin verification";
}

// ── Govt Photo ID Number field (only shown for id_card slot) ──────────────────
function GovtIdNumberField() {
  const { toast } = useToast();
  const { data: providerMe } = useQuery<any>({ queryKey: ["/api/provider/me"] });
  const [value, setValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current && providerMe !== undefined) {
      initialized.current = true;
      setValue(providerMe?.nationalProviderId ?? "");
    }
  }, [providerMe]);

  async function handleSave() {
    setSaving(true);
    try {
      await apiRequest("POST", "/api/provider/setup", { nationalProviderId: value.trim() || null });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/me"] });
      toast({ title: "ID number saved" });
    } catch (err: any) {
      toast({ title: err?.message ?? "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg bg-muted/30 border p-3 space-y-2">
      <Label className="text-xs font-medium">
        ID / Document Number
        <span className="text-muted-foreground font-normal ml-1">(passport number, national ID, driver's licence number)</span>
      </Label>
      <div className="flex gap-2 items-center">
        <Input
          className="h-8 text-sm flex-1"
          placeholder="e.g. A1234567 or 123-456-789"
          value={value}
          onChange={e => setValue(e.target.value)}
          data-testid="input-gov-id-number"
        />
        <Button
          size="sm"
          className="h-8 text-xs shrink-0"
          onClick={handleSave}
          disabled={saving || !value.trim()}
          data-testid="button-save-gov-id-number"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Private — only visible to admin. Never shown on your public profile.</p>
    </div>
  );
}

interface DocSlot {
  type: string;
  label: string;
  description: string;
  icon: any;
  mandatory: boolean;
  expiryRequired: "yes" | "maybe" | "no";
  criticality: "mandatory" | "compliance-required" | "optional";
}

const DOC_SLOTS: DocSlot[] = [
  {
    type: "medical_license",
    label: "Medical / Professional Practising Licence",
    description: "Your current government-issued licence to practise medicine or your healthcare profession. Must be valid and in-scope for your practice area.",
    icon: Shield,
    mandatory: true,
    expiryRequired: "yes",
    criticality: "mandatory",
  },
  {
    type: "degree",
    label: "Primary Medical Degree / Professional Qualification",
    description: "Your primary qualification certificate — MBBS, MD, BPhysio, RN, BSc Nursing, or equivalent. This is the foundational credential for your profession.",
    icon: GraduationCap,
    mandatory: true,
    expiryRequired: "no",
    criticality: "mandatory",
  },
  {
    type: "specialization_certificate",
    label: "Specialisation / Board Certification",
    description: "Postgraduate specialisation diploma or board certification confirming expertise in a specific medical field, subspecialty, or advanced practice area.",
    icon: Award,
    mandatory: false,
    expiryRequired: "maybe",
    criticality: "optional",
  },
  {
    type: "certificate_of_good_standing",
    label: "Certificate of Good Standing",
    description: "Issued by your licensing body confirming you are in good standing, fully registered, and have no outstanding disciplinary actions or sanctions.",
    icon: FileCheck,
    mandatory: false,
    expiryRequired: "yes",
    criticality: "optional",
  },
  {
    type: "insurance",
    label: "Professional Indemnity / Malpractice Insurance",
    description: "Current professional indemnity or malpractice insurance certificate covering your entire clinical practice period. Must clearly show the policy period and coverage scope.",
    icon: FileBadge,
    mandatory: false,
    expiryRequired: "yes",
    criticality: "optional",
  },
  {
    type: "id_card",
    label: "Government-Issued Photo Identification",
    description: "Valid national ID card, passport, or driver's licence — must be issued by a government authority and include a photo. Used to confirm your legal identity.",
    icon: CreditCard,
    mandatory: true,
    expiryRequired: "maybe",
    criticality: "mandatory",
  },
  {
    type: "address_proof",
    label: "Proof of Residential Address",
    description: "Utility bill, bank statement, or official government letter showing your current home address. Document must be dated within the last 3 months.",
    icon: Home,
    mandatory: true,
    expiryRequired: "no",
    criticality: "mandatory",
  },
  {
    type: "facility_operating_license",
    label: "Healthcare Facility Operating Licence",
    description: "Licence or permit issued by health authorities to operate a clinic, hospital, or healthcare facility. Required if you own, manage, or operate any healthcare premises.",
    icon: Building2,
    mandatory: false,
    expiryRequired: "yes",
    criticality: "optional",
  },
  {
    type: "business_registration",
    label: "Business Registration Certificate / Trade Licence",
    description: "Official government-issued certificate confirming your practice or company is legally registered. Required when operating as a business entity, partnership, or company.",
    icon: Briefcase,
    mandatory: false,
    expiryRequired: "yes",
    criticality: "optional",
  },
  {
    type: "tax_identification",
    label: "Tax Identification Number (TIN) Proof",
    description: "Official document from the tax authority showing your Tax Identification Number. Required for business entities and used for invoicing, billing, and financial compliance.",
    icon: Receipt,
    mandatory: false,
    expiryRequired: "no",
    criticality: "optional",
  },
];

// ── 0. Profile Photo ───────────────────────────────────────────────────────────
function ProfilePhotoSection() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: userData, isLoading } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const avatarUrl = userData?.avatarUrl ?? null;

  async function handleUpload(file: File) {
    const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!ALLOWED.includes(file.type)) {
      toast({ title: "Use JPG, PNG, or WebP", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Photo must be under 5 MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", credentials: "include", body: form });
      const uploadData = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) {
        throw new Error(uploadData?.message ?? "Upload failed");
      }
      const { url } = uploadData;
      await apiRequest("PATCH", "/api/auth/profile", { avatarUrl: url });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Profile photo updated" });
    } catch (err: any) {
      toast({ title: err?.message ?? "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="rounded-lg p-1.5 bg-primary/10">
          <User className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold">Profile Photo</p>
          <p className="text-xs text-muted-foreground">Visible to patients on your booking card and public profile</p>
        </div>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl bg-muted animate-pulse shrink-0" />
          <div className="h-8 w-28 bg-muted animate-pulse rounded-lg" />
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Profile photo"
                className="w-20 h-20 rounded-xl object-cover border"
                data-testid="img-profile-photo"
              />
            ) : (
              <div className="w-20 h-20 rounded-xl border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 bg-muted/30">
                <User className="h-7 w-7 text-muted-foreground/40" />
                <span className="text-[9px] text-muted-foreground">No photo</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">JPG, PNG or WebP · Max 5 MB · Shown to patients</p>
            <Button
              size="sm"
              variant={avatarUrl ? "outline" : "default"}
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="h-8 text-xs w-fit"
              data-testid="button-upload-profile-photo"
            >
              {uploading
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Uploading…</>
                : <><Camera className="h-3.5 w-3.5 mr-1.5" />{avatarUrl ? "Replace photo" : "Upload photo"}</>}
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
            data-testid="input-profile-photo-file"
          />
        </div>
      )}
    </div>
  );
}

// ── 1. Unified Documents Section ──────────────────────────────────────────────
function UnifiedDocumentsSection() {
  const { toast } = useToast();
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<string | null>(null);
  const [expiries, setExpiries] = useState<Record<string, string>>({});

  const { data: docs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/provider/documents"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/provider/documents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/documents"] });
      toast({ title: "Document removed" });
    },
    onError: (err: any) => toast({ title: err?.message ?? "Failed to remove", variant: "destructive" }),
  });

  function getDocForSlot(slot: DocSlot): any | undefined {
    return (docs as any[]).find((d: any) => d.documentType === slot.type);
  }

  function daysUntilExpiry(expiryDate: string): number {
    return Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  async function handleUpload(slot: DocSlot, file: File) {
    if (slot.expiryRequired === "yes" && !expiries[slot.type]) {
      toast({ title: "Expiry date is required", description: `Please enter the expiry date for your ${slot.label} before uploading.`, variant: "destructive" });
      return;
    }
    setUploading(slot.type);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("documentType", slot.type);
      form.append("expiryRequired", String(slot.expiryRequired !== "no"));
      form.append("documentCriticality", slot.criticality);
      form.append("reminderDaysBefore", "30");
      if (expiries[slot.type]) form.append("expiryDate", expiries[slot.type]);
      await fetchMultipart("/api/provider/documents/upload", form);
      queryClient.invalidateQueries({ queryKey: ["/api/provider/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/me"] });
      toast({ title: `${slot.label} uploaded — pending admin review` });
      setShowForm(null);
      setExpiries(p => { const n = { ...p }; delete n[slot.type]; return n; });
    } catch (err: any) {
      toast({ title: err?.message ?? "Upload failed", variant: "destructive" });
    } finally {
      setUploading(null);
      if (fileRefs.current[slot.type]) fileRefs.current[slot.type]!.value = "";
    }
  }

  const mandatoryMissing = DOC_SLOTS.filter(s => s.mandatory && !getDocForSlot(s));

  // Docs needing action (re-upload or rejected)
  const needsActionDocs = DOC_SLOTS
    .map(s => ({ slot: s, doc: getDocForSlot(s) }))
    .filter(({ doc: d }) => {
      if (!d) return false;
      const s = normStatus(d.verificationStatus ?? "");
      return s === "reupload_required" || s === "rejected";
    });

  // Docs expiring within 30 days (approved)
  const expiringDocs = DOC_SLOTS
    .map(s => ({ slot: s, doc: getDocForSlot(s) }))
    .filter(({ doc: d }) => {
      if (!d?.expiryDate) return false;
      const days = daysUntilExpiry(d.expiryDate);
      return days > 0 && days <= 30 && normStatus(d.verificationStatus ?? "") === "approved";
    })
    .map(({ slot, doc: d }) => ({ slot, days: daysUntilExpiry(d!.expiryDate) }));

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-primary" />Documents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {DOC_SLOTS.map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </CardContent>
      </Card>
    );
  }

  const mandatory = DOC_SLOTS.filter(s => s.mandatory);
  const optional  = DOC_SLOTS.filter(s => !s.mandatory);

  function renderSlot(slot: DocSlot) {
    const existing = getDocForSlot(slot);
    const SlotIcon = slot.icon;
    const isUp   = uploading === slot.type;
    const open   = showForm  === slot.type;
    const raw    = existing?.verificationStatus ?? (slot.mandatory ? "missing" : null);
    const days   = existing?.expiryDate ? daysUntilExpiry(existing.expiryDate) : null;
    const expSoon = days !== null && days <= 30 && days > 0 && raw === "approved";
    const displayStatus = expSoon ? "expiring_soon" : (raw ?? undefined);
    const s      = displayStatus ? normStatus(displayStatus) : null;
    const needsAction = s && ["rejected", "reupload_required", "expired", "expiring_soon"].includes(s);

    return (
      <div
        key={slot.type}
        className={`rounded-xl border p-4 space-y-2 ${
          s === "approved" ? "border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/10"
          : s === "expired" ? "border-red-200 bg-red-50/30 dark:border-red-900/40 dark:bg-red-950/10"
          : expSoon ? "border-amber-200 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/10"
          : needsAction ? "border-orange-200 bg-orange-50/20 dark:border-orange-900/40 dark:bg-orange-950/10"
          : s === "missing" ? "border-dashed border-red-200 dark:border-red-900"
          : "border-border"
        }`}
        data-testid={`doc-slot-${slot.type}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`mt-0.5 rounded-lg p-1.5 shrink-0 ${
              s === "approved" ? "bg-emerald-100 dark:bg-emerald-900/40"
              : s === "expired" ? "bg-red-100 dark:bg-red-900/40"
              : existing ? "bg-primary/10"
              : "bg-muted"
            }`}>
              <SlotIcon className={`h-4 w-4 ${
                s === "approved" ? "text-emerald-600"
                : s === "expired" ? "text-red-500"
                : existing ? "text-primary"
                : "text-muted-foreground"
              }`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium leading-snug">{slot.label}</p>
                {slot.mandatory ? (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">
                    Required
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">
                    Optional
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{slot.description}</p>

              {slot.type === "id_card" && <GovtIdNumberField />}

              {displayStatus && (
                <div className="mt-1.5 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {statusBadge(displayStatus)}
                    {existing?.expiryDate && (
                      <span className={`text-xs ${expSoon ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                        {days !== null && days <= 0 ? "Expired" : `Expires ${existing.expiryDate}`}
                        {expSoon && days !== null && ` (${days}d)`}
                      </span>
                    )}
                  </div>
                  {needsAction ? (
                    <div className="flex items-start gap-1.5 rounded-md bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 px-2.5 py-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-orange-700 dark:text-orange-300 font-medium">
                        {statusMessage(displayStatus)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">{statusMessage(displayStatus)}</p>
                  )}
                </div>
              )}

              {existing?.adminNote && (
                <div className="mt-1.5 rounded-md bg-muted/60 border px-2.5 py-1.5">
                  <p className="text-xs text-muted-foreground"><span className="font-medium">Admin note:</span> {existing.adminNote}</p>
                </div>
              )}
              {existing?.createdAt && (
                <p className="text-xs text-muted-foreground mt-1">
                  Uploaded {formatDate(existing.createdAt)}
                  {existing.fileName && ` · ${existing.fileName}`}
                </p>
              )}
              {s === "approved" && existing?.verifiedAt && (
                <p className="text-xs text-emerald-600 mt-1">
                  Verified {formatDate(existing.verifiedAt)}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {existing?.documentUrl && (
              <Button size="icon" variant="ghost" className="h-8 w-8" asChild data-testid={`button-view-doc-${slot.type}`}>
                <a href={existing.documentUrl} target="_blank" rel="noopener noreferrer"><Eye className="h-3.5 w-3.5" /></a>
              </Button>
            )}
            {existing ? (
              <>
                <Button
                  size="sm"
                  variant={needsAction ? "default" : "ghost"}
                  className={`h-8 text-xs px-2 ${needsAction ? "bg-primary text-primary-foreground" : ""}`}
                  onClick={() => setShowForm(open ? null : slot.type)}
                  data-testid={`button-replace-doc-${slot.type}`}
                >
                  {needsAction ? <><Upload className="h-3.5 w-3.5 mr-1.5" />Re-upload</> : "Replace"}
                </Button>
                <Button
                  size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                  onClick={() => deleteMutation.mutate(existing.id)}
                  disabled={deleteMutation.isPending}
                  data-testid={`button-delete-doc-${slot.type}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant={slot.mandatory ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => setShowForm(open ? null : slot.type)}
                data-testid={`button-upload-doc-${slot.type}`}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />Upload
              </Button>
            )}
          </div>
        </div>

        {open && (
          <div className="rounded-lg bg-muted/40 border p-3 space-y-2 mt-1">
            {slot.expiryRequired !== "no" && (
              <div className="space-y-1 max-w-[220px]">
                <Label className="text-xs">
                  Expiry date
                  {slot.expiryRequired === "yes" && <span className="text-red-500 ml-1">*</span>}
                  {slot.expiryRequired === "maybe" && <span className="text-muted-foreground ml-1">(if applicable)</span>}
                </Label>
                <Input
                  type="date"
                  value={expiries[slot.type] ?? existing?.expiryDate ?? ""}
                  onChange={e => setExpiries(p => ({ ...p, [slot.type]: e.target.value }))}
                  className="h-8 text-sm rounded-lg"
                  data-testid={`input-doc-expiry-${slot.type}`}
                />
                {slot.expiryRequired === "yes" && (
                  <p className="text-xs text-muted-foreground">You'll receive a reminder 30 days before expiry.</p>
                )}
              </div>
            )}
            <div className="flex gap-2 flex-wrap items-center">
              <Button
                size="sm" className="h-8 text-xs" disabled={isUp}
                onClick={() => fileRefs.current[slot.type]?.click()}
                data-testid={`button-choose-doc-file-${slot.type}`}
              >
                {isUp ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Uploading…</> : <><Upload className="h-3.5 w-3.5 mr-1.5" />Choose file & upload</>}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowForm(null)}>Cancel</Button>
            </div>
            <p className="text-xs text-muted-foreground">PDF, JPG, PNG, WebP · Max 10 MB</p>
            <input
              ref={el => { fileRefs.current[slot.type] = el; }}
              type="file"
              accept=".pdf,image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(slot, f); }}
              data-testid={`input-doc-file-${slot.type}`}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-5 w-5 text-primary" />
          Documents
        </CardTitle>
        <CardDescription className="flex items-start gap-1.5">
          <Lock className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
          Private documents reviewed by admin only — never shown on your public profile or shared with patients.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Action-required banner — re-upload or rejected documents */}
        {needsActionDocs.length > 0 && (
          <div className="rounded-xl border border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800 p-3.5 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-orange-600 dark:text-orange-400" />
              <div className="space-y-1.5 flex-1 min-w-0">
                <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">
                  {needsActionDocs.length} document{needsActionDocs.length > 1 ? "s" : ""} need{needsActionDocs.length === 1 ? "s" : ""} your attention
                </p>
                <ul className="space-y-1">
                  {needsActionDocs.map(({ slot, doc: d }) => (
                    <li key={slot.type} className="text-xs text-orange-700 dark:text-orange-400">
                      <span className="font-medium">• {slot.label}</span>
                      {d?.adminNote && (
                        <span className="block pl-3 text-orange-600 dark:text-orange-500 italic">"{d.adminNote}"</span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-orange-600 dark:text-orange-500">
                  Use the <strong>Re-upload</strong> button next to each flagged document below.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Expiring-soon banner */}
        {expiringDocs.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3.5 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="space-y-1 flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {expiringDocs.length} document{expiringDocs.length > 1 ? "s" : ""} expiring soon
              </p>
              <ul className="space-y-0.5">
                {expiringDocs.map(({ slot, days }) => (
                  <li key={slot.type} className="text-xs text-amber-700 dark:text-amber-400">
                    • <span className="font-medium">{slot.label}</span>
                    <span className="ml-1 text-amber-600">— {days} day{days === 1 ? "" : "s"} left</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Upload a renewed copy before expiry to stay compliant.
              </p>
            </div>
          </div>
        )}

        {/* Missing mandatory documents banner */}
        {mandatoryMissing.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400 flex gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              <strong>Missing required documents:</strong>{" "}
              {mandatoryMissing.map(s => s.label).join(", ")}.
              Upload these to complete your verification.
            </span>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Required Documents</p>
          <div className="space-y-2">
            {mandatory.map(slot => renderSlot(slot))}
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Optional Documents</p>
          <p className="text-xs text-muted-foreground -mt-1">Upload where applicable to strengthen your profile and meet compliance requirements.</p>
          <div className="space-y-2">
            {optional.map(slot => renderSlot(slot))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Exported panel ─────────────────────────────────────────────────────────────
export function ProviderDocumentsPanel() {
  return (
    <div className="space-y-4">
      <ProfilePhotoSection />
      <UnifiedDocumentsSection />
    </div>
  );
}
