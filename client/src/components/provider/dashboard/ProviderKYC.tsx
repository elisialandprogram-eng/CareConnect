import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2, XCircle, ShieldCheck, Star, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface KycDoc {
  documentType: string;
  documentUrl: string | null;
  verificationStatus: string;
  adminNote?: string | null;
}

interface ProviderData {
  status?: string;
  rejectionReason?: string | null;
  bio?: string | null;
  description?: string | null;
  specialty?: string | null;
  specialization?: string | null;
  providerSubcategory?: string | null;
  practitionerType?: string | null;
  clinicName?: string | null;
  location?: string | null;
  [key: string]: unknown;
}

// Mandatory document types aligned with the unified panel
const MANDATORY_DOCS = ["medical_license", "degree", "id_card", "address_proof"] as const;

const MANDATORY_LABELS: Record<string, string> = {
  medical_license: "Medical / Professional Practising Licence",
  degree:          "Primary Medical Degree",
  id_card:         "Government-Issued Photo ID",
  address_proof:   "Proof of Residential Address",
};

function computeReadinessScore(provider: ProviderData | undefined, docs: KycDoc[]) {
  const uploaded = new Set(docs.filter(d => d.documentUrl).map(d => d.documentType));
  const approved = new Set(docs.filter(d => d.verificationStatus === "approved").map(d => d.documentType));

  const checks = [
    { label: "Medical / Professional Licence uploaded",  done: uploaded.has("medical_license") },
    { label: "Primary Medical Degree uploaded",          done: uploaded.has("degree") },
    { label: "Government-Issued Photo ID uploaded",      done: uploaded.has("id_card") },
    { label: "Proof of Residential Address uploaded",    done: uploaded.has("address_proof") },
    { label: "Bio / description added",                  done: !!(provider?.bio || provider?.description) },
    { label: "Specialization set",                       done: !!(provider?.specialization || provider?.providerSubcategory || provider?.specialty || provider?.practitionerType) },
    { label: "Clinic / location set",                    done: !!(provider?.clinicName || provider?.location) },
  ];
  const done = checks.filter(c => c.done).length;
  return { checks, score: Math.round((done / checks.length) * 100), done, total: checks.length, approved };
}

interface BannerCfg {
  title: string;
  body: string;
  variant: "info" | "warning" | "success" | "error";
}
const BANNERS: Record<string, BannerCfg> = {
  draft:              { title: "Complete Your Verification",   body: "Upload the required documents in the Documents section above and submit for review to activate your account.", variant: "info" },
  pending_approval:   { title: "Application Under Review",     body: "Our compliance team is reviewing your documents. You'll be notified within 1–3 business days.",                variant: "info" },
  action_required:    { title: "Action Required",              body: "One or more documents were rejected or need attention. Re-upload the flagged documents in the section above.", variant: "warning" },
  documents_verified: { title: "Documents Verified ✓",        body: "Your documents are approved. Awaiting final compliance sign-off.",                                            variant: "success" },
  approved:           { title: "Approved ✓",                   body: "Your provider account is fully approved.",                                                                   variant: "success" },
  rejected:           { title: "Application Not Approved",     body: "Your application was not approved. See the rejection reason below.",                                          variant: "error" },
};

const BANNER_CLASSES: Record<string, string> = {
  info:    "border-blue-200 bg-blue-50 text-blue-800",
  warning: "border-orange-300 bg-orange-50 text-orange-800",
  success: "border-green-200 bg-green-50 text-green-800",
  error:   "border-red-200 bg-red-50 text-red-800",
};

export function ProviderKYC() {
  const { data: provider } = useQuery<ProviderData>({ queryKey: ["/api/provider/me"] });
  const { data: docs = [] } = useQuery<KycDoc[]>({ queryKey: ["/api/provider/documents"] });

  const status = provider?.status ?? "draft";
  const banner = BANNERS[status] ?? BANNERS.draft;
  const readiness = computeReadinessScore(provider, docs);

  const mandatoryStatuses = MANDATORY_DOCS.map(type => {
    const doc = docs.find(d => d.documentType === type);
    return { type, label: MANDATORY_LABELS[type], status: doc?.verificationStatus ?? "missing", adminNote: doc?.adminNote };
  });

  return (
    <div className="space-y-4" data-testid="provider-kyc-panel">
      {/* Status banner */}
      <Alert className={cn("border", BANNER_CLASSES[banner.variant])}>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>{banner.title}</AlertTitle>
        <AlertDescription>{banner.body}</AlertDescription>
        {status === "rejected" && provider?.rejectionReason && (
          <p className="mt-1 text-sm font-medium">Reason: {provider.rejectionReason}</p>
        )}
      </Alert>

      {status === "pending_approval" && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 flex items-start gap-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Your application is under review. You can still upload or replace documents — the compliance team will see your latest files.</span>
        </div>
      )}

      {/* Readiness score */}
      <Card className="border-border/60">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-semibold">Profile Readiness</span>
            </div>
            <span className={cn(
              "text-sm font-bold tabular-nums",
              readiness.score >= 80 ? "text-emerald-600 dark:text-emerald-400"
              : readiness.score >= 50 ? "text-amber-600 dark:text-amber-400"
              : "text-rose-600 dark:text-rose-400",
            )}>{readiness.score}%</span>
          </div>
          <Progress value={readiness.score} className="h-2 mb-3" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
            {readiness.checks.map(c => (
              <div key={c.label} className="flex items-center gap-1.5 text-xs">
                {c.done
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  : <XCircle className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 shrink-0" />}
                <span className={c.done ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
              </div>
            ))}
          </div>
          {readiness.score < 100 && (
            <p className="text-xs text-muted-foreground mt-3">
              Complete all items to maximise your profile visibility and booking rate.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Required document status snapshot */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Required Document Status</p>
          <div className="space-y-2">
            {mandatoryStatuses.map(({ type, label, status: ds, adminNote }) => {
              const norm = ds === "pending_review" || ds === "verification_pending" ? "under_review"
                         : ds === "reupload_requested" ? "reupload_required" : ds;
              const approved = norm === "approved";
              const rejected = norm === "rejected" || norm === "reupload_required";
              const pending  = norm === "under_review" || norm === "pending";
              const missing  = norm === "missing";
              return (
                <div key={type} className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-foreground">{label}</span>
                    <Badge className={cn(
                      "text-[10px] gap-1 shrink-0",
                      approved ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                      : rejected ? "bg-orange-100 text-orange-700 border-orange-200"
                      : pending  ? "bg-blue-100 text-blue-700 border-blue-200"
                      : "bg-red-100 text-red-700 border-red-200",
                    )}>
                      {approved ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {approved ? "Approved" : rejected ? "Action needed" : pending ? "Under review" : missing ? "Not uploaded" : "Pending"}
                    </Badge>
                  </div>
                  {rejected && adminNote && (
                    <p className="text-[11px] text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded px-2 py-1">
                      <span className="font-semibold">Admin note:</span> {adminNote}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground px-1">
        Documents are reviewed by our compliance team within 1–3 business days. You will be notified by email and in-app when the review is complete.
      </p>
    </div>
  );
}
