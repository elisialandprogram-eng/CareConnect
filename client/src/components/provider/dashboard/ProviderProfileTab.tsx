import React, { useState, useEffect, Component } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, invalidateProviderProfile } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, User, Briefcase, MapPin, Image as ImageIcon, Shield, Settings,
  CheckCircle, Globe, Lock, Bell, Mail, MessageSquare, Smartphone,
  Monitor, Banknote, Award, Edit, Eye, EyeOff, AlertTriangle, ChevronDown,
  LayoutDashboard, Stethoscope, FileCheck, ExternalLink, ChevronRight,
  Settings2, Info,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AvatarSM } from "@/components/ui/provider-image";
import { ProviderGalleryManager } from "@/components/provider-gallery-manager";
import { ProviderDocumentsPanel } from "@/components/provider-documents-panel";
import { ProviderKYC } from "@/components/provider/dashboard/ProviderKYC";
import { showErrorModal } from "@/components/error-modal";
import { QK } from "@/lib/query-keys";
import { subscribeToPush, unsubscribeFromPush, getPushCapability } from "@/lib/push";

// ── Constants ─────────────────────────────────────────────────────────────────
const LANGUAGE_OPTIONS = ["English", "Hungarian", "Persian", "Arabic", "German", "French", "Spanish", "Turkish", "Russian"];

const SERVICE_MODE_LABELS: Record<string, string> = {
  clinic_visit: "Clinic / Office Visit",
  home_visit: "Home Visit",
  telemedicine: "Telemedicine / Video",
};

// ── Provider Taxonomy — 3-level hierarchy ─────────────────────────────────
export const PROVIDER_TAXONOMY = [
  {
    category: "Medical Doctors & Specialists",
    subcategories: [
      { name: "Primary Care & General Medicine", specializations: ["General Practitioner (GP) / Family Physician", "Internal Medicine Specialist (Internist)", "Geriatrician (Elderly care specialist)"] },
      { name: "Dermatology & Aesthetics", specializations: ["General Dermatologist (Skin/Hair/Nails)", "Cosmetic Dermatologist / Aesthetic Doctor", "Trichologist (Hair and scalp specialist)"] },
      { name: "Pediatrics (Child Health)", specializations: ["General Pediatrician", "Neonatologist (Newborn specialist)", "Pediatric Developmental Specialist"] },
      { name: "Women's Health & Obstetrics", specializations: ["Gynecologist (Reproductive health)", "Obstetrician (Pregnancy & childbirth care)", "Fertility / IVF Specialist"] },
      { name: "Internal Medicine Sub-Specialists", specializations: ["Cardiologist (Heart specialist)", "Endocrinologist (Hormones & diabetes)", "Gastroenterologist (Digestive tract / stomach)", "Neurologist (Brain and nervous system)", "Oncologist (Cancer treatment specialist)", "Pulmonologist (Lungs & breathing)", "Nephrologist (Kidney care)", "Rheumatologist (Autoimmune & joint disorders)", "Allergist / Immunologist"] },
      { name: "Surgical Specialists", specializations: ["General Surgeon", "Orthopedic Surgeon (Bone and joint surgery)", "Plastic / Reconstructive Surgeon", "Ophthalmologist (Eye surgeon/specialist)", "ENT Specialist (Otolaryngologist)", "Urologist (Urinary tract & male reproductive)"] },
    ],
    displayTitles: ["Dr.", "Specialist", "Consultant", "Surgeon", "Physician", "Professor Dr."],
  },
  {
    category: "Mental Health & Behavioral Professionals",
    subcategories: [
      { name: "Psychiatry (Medical)", specializations: ["Adult Psychiatrist", "Child & Adolescent Psychiatrist", "Addiction Psychiatrist"] },
      { name: "Psychology & Therapy (Clinical)", specializations: ["Clinical Psychologist", "Neuropsychologist", "Cognitive Behavioral Therapist (CBT Specialist)"] },
      { name: "Counseling & Coaching (Supportive)", specializations: ["Licensed Professional Counselor (LPC)", "Marriage & Family Therapist (LMFT)", "Addiction / Substance Abuse Counselor", "Grief Counselor", "Career / Corporate Wellness Coach", "Life Coach / Motivational Coach"] },
    ],
    displayTitles: ["Dr.", "Psychologist", "Psychiatrist", "Therapist", "Counselor", "Coach"],
  },
  {
    category: "Nutrition, Dietetics & Metabolic Wellness",
    subcategories: [
      { name: "Clinical & Medical Nutrition", specializations: ["Clinical Dietitian (Diabetic, renal, oncological diets)", "Pediatric Nutritionist", "Bariatric Nutritionist (Weight loss surgery support)"] },
      { name: "Performance & Wellness", specializations: ["Sports Nutritionist / Fitness Dietitian", "Holistic Nutritionist", "Metabolic Health Coach"] },
    ],
    displayTitles: ["Dietitian", "Nutritionist", "Clinical Dietitian", "Metabolic Health Coach"],
  },
  {
    category: "Physical Therapy & Rehabilitation",
    subcategories: [
      { name: "Physical Therapy & Rehabilitation", specializations: ["Physiotherapist / Physical Therapist (General)", "Sports Physiotherapist (Athletic injuries)", "Pediatric / Geriatric Physical Therapist", "Occupational Therapist (Daily living/motor skills recovery)"] },
      { name: "Chiropractic & Osteopathic Care", specializations: ["Chiropractor (Spine and musculoskeletal alignment)", "Osteopath (Whole-body structural therapist)"] },
      { name: "Speech & Hearing", specializations: ["Speech-Language Pathologist (Speech therapist)", "Audiologist (Hearing loss specialist)"] },
    ],
    displayTitles: ["Physiotherapist", "Physical Therapist", "Chiropractor", "Osteopath", "Occupational Therapist", "Speech Therapist", "Audiologist"],
  },
  {
    category: "Dental Care Professionals",
    subcategories: [
      { name: "General & Cosmetic Dentistry", specializations: ["General Dentist", "Cosmetic Dentist (Veneers, teeth whitening)"] },
      { name: "Dental Sub-Specialties", specializations: ["Orthodontist (Braces & aligners)", "Endodontist (Root canal specialist)", "Pedodontist / Pediatric Dentist", "Periodontist (Gum disease specialist)", "Oral & Maxillofacial Surgeon (Jaw & mouth surgery)"] },
    ],
    displayTitles: ["Dr.", "Dentist", "Orthodontist", "Oral Surgeon", "Specialist"],
  },
  {
    category: "Alternative, Holistic & Integrative Medicine",
    subcategories: [
      { name: "Traditional & Natural Medicine", specializations: ["Ayurvedic Practitioner", "Homeopath / Homeopathic Doctor", "Naturopathic Doctor (ND)", "Traditional Chinese Medicine (TCM) Practitioner"] },
      { name: "Bodywork & Energy Therapies", specializations: ["Acupuncturist", "Licensed Massage Therapist (Clinical / Deep Tissue)", "Reflexologist", "Yoga Therapist / Meditation Instructor"] },
    ],
    displayTitles: ["Practitioner", "Therapist", "Doctor (ND)", "Instructor", "Coach"],
  },
  {
    category: "Maternal, Nursing & Allied Health Support",
    subcategories: [
      { name: "Nursing Professionals", specializations: ["Nurse Practitioner (NP)", "Registered Nurse (RN) / Home Care Nurse", "Certified Nursing Assistant (CNA) / Caregiver"] },
      { name: "Maternal & Newborn Support", specializations: ["Certified Doula (Birth support)", "Lactation Consultant (Breastfeeding support)", "Midwife (CNM)"] },
    ],
    displayTitles: ["Nurse Practitioner", "Registered Nurse (RN)", "Midwife", "Caregiver", "Doula", "Lactation Consultant"],
  },
] as const;

type TaxonomyEntry = typeof PROVIDER_TAXONOMY[number];

const CURRENCY_OPTIONS = [
  { code: "USD", label: "USD ($) — US Dollar" },
  { code: "HUF", label: "HUF (Ft) — Hungarian Forint" },
  { code: "IRR", label: "IRR (﷼) — Iranian Rial" },
  { code: "GBP", label: "GBP (£) — British Pound" },
  { code: "EUR", label: "EUR (€) — Euro" },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────
export type ProfileSubSection =
  | "overview"
  | "personal"
  | "professional"
  | "workplace"
  | "services"
  | "verification"
  | "settings";

/** @deprecated use ProfileSubSection */
export type ProfileSection =
  | ProfileSubSection
  | "service-delivery"
  | "preferences"
  | "security";

export function normalizeSection(s: ProfileSection | ProfileSubSection | undefined): ProfileSubSection {
  if (!s) return "overview";
  if (s === "service-delivery") return "services";
  if (s === "preferences" || s === "security") return "settings";
  return s as ProfileSubSection;
}

// ── Error Boundary ─────────────────────────────────────────────────────────────
class SectionErrorBoundary extends Component<{ children: React.ReactNode; section: string }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode; section: string }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <strong>Error loading {this.props.section} section.</strong> {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Section header (consistent per-panel header) ──────────────────────────────
function SectionHeader({
  icon: Icon,
  color,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3 pb-4 border-b mb-5">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h3 className="font-semibold text-base">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// ── Profile Strength Indicator ────────────────────────────────────────────────
function ProfileStrength({
  provider: providerProp,
  user,
  onOpenSection,
  locked,
}: {
  provider: any;
  user: any;
  onOpenSection: (section: ProfileSubSection) => void;
  locked?: boolean;
}) {
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const { toast } = useToast();
  // Always pull the freshest provider data directly — don't rely solely on the
  // prop which may be an older snapshot passed down before the cache updated.
  const { data: providerMe } = useQuery<any>({ queryKey: QK.providerMe() });
  const provider = providerMe ?? providerProp;

  const { data: docs = [] } = useQuery<any[]>({
    queryKey: ["/api/provider/documents"],
    staleTime: 30_000,
  });

  const BLOCKED_STATUSES = ["submitted", "pending_approval", "approved", "active", "suspended", "deactivated"];
  const [agreedToProvider, setAgreedToProvider] = useState(false);
  const [agreedToData, setAgreedToData] = useState(false);
  const consentComplete = agreedToProvider && agreedToData;
  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/provider/submit-review", {
        providerAgreementAccepted: true,
        dataProcessingAgreementAccepted: true,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw err;
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.providerMe() });
      void invalidateProviderProfile();
      toast({ title: "Submitted for review!", description: "Our team will review your profile within 1–3 business days." });
    },
    onError: (e: any) => {
      const msg = e?.message || "Submission failed";
      toast({ title: "Submission failed", description: msg, variant: "destructive" });
    },
  });

  const items: { label: string; done: boolean; section: ProfileSubSection; pts: number }[] = [
    { label: "First and last name", done: !!(user?.firstName?.trim() && user?.lastName?.trim()), section: "personal", pts: 5 },
    { label: "Phone number", done: !!((user as any)?.phone?.trim()), section: "personal", pts: 5 },
    { label: "Profile photo", done: !!(user as any)?.avatarUrl, section: "verification", pts: 5 },
    { label: "Mobile number", done: !!((user as any)?.mobileNumber?.trim()), section: "verification", pts: 5 },
    { label: "City / location", done: !!((user as any)?.city?.trim() || provider?.city?.trim()), section: "personal", pts: 5 },
    { label: "Professional bio (50+ chars)", done: (provider?.bio?.length ?? 0) >= 50, section: "professional", pts: 8 },
    { label: "Provider Category & Specialization", done: !!provider?.providerCategory?.trim(), section: "professional", pts: 5 },
    { label: "Language(s) spoken", done: Array.isArray(provider?.languages) && provider.languages.length > 0, section: "professional", pts: 4 },
    { label: "License number", done: !!provider?.licenseNumber?.trim(), section: "professional", pts: 4 },
    { label: "Years of experience", done: !!provider?.yearsExperience, section: "professional", pts: 4 },
    { label: "Service mode selected", done: Array.isArray(provider?.serviceModes) && provider.serviceModes.length > 0, section: "services", pts: 10 },
    { label: "Practice city / location", done: !!provider?.city?.trim(), section: "workplace", pts: 5 },
    { label: "Permanent address", done: !!provider?.permanentAddressLine1?.trim(), section: "workplace", pts: 5 },
    { label: "Medical / Professional Practising Licence", done: docs.some((d: any) => d.documentType === "medical_license" && d.verificationStatus !== "rejected"), section: "verification", pts: 10 },
    { label: "Primary Medical Degree / Professional Qualification", done: docs.some((d: any) => d.documentType === "degree" && d.verificationStatus !== "rejected"), section: "verification", pts: 8 },
    { label: "Government-Issued Photo ID", done: docs.some((d: any) => d.documentType === "id_card" && d.verificationStatus !== "rejected"), section: "verification", pts: 5 },
    { label: "Proof of Residential Address", done: docs.some((d: any) => d.documentType === "address_proof" && d.verificationStatus !== "rejected"), section: "verification", pts: 5 },
    { label: "Payment methods accepted", done: Array.isArray(provider?.paymentMethods) && provider.paymentMethods.length > 0, section: "settings", pts: 5 },
    { label: "Emergency contact", done: !!provider?.emergencyContact?.trim(), section: "settings", pts: 5 },
  ];

  const totalPts = items.reduce((s, i) => s + i.pts, 0);
  const earnedPts = items.filter((i) => i.done).reduce((s, i) => s + i.pts, 0);
  const pct = Math.round((earnedPts / totalPts) * 100);
  const incomplete = items.filter((i) => !i.done);
  const canSubmit = !locked && pct >= 60 && !BLOCKED_STATUSES.includes(provider?.status ?? "");
  const isExpanded = expanded === null ? pct < 80 : expanded;

  const strengthLabel = pct >= 80 ? "Strong" : pct >= 50 ? "Good" : "Needs work";
  const ringColor = pct >= 80 ? "text-emerald-500" : pct >= 50 ? "text-amber-500" : "text-rose-500";
  const barColor = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500";
  const borderColor = pct >= 80 ? "border-emerald-200 dark:border-emerald-800" : pct >= 50 ? "border-amber-200 dark:border-amber-800" : "border-rose-200 dark:border-rose-800";
  const cardBg = pct >= 80 ? "bg-emerald-50/50 dark:bg-emerald-950/20" : pct >= 50 ? "bg-amber-50/50 dark:bg-amber-950/20" : "bg-rose-50/50 dark:bg-rose-950/20";
  const circumference = 2 * Math.PI * 15.5;

  if (pct === 100) {
    return (
      <div className={`rounded-xl border ${borderColor} ${cardBg} px-4 py-3 flex items-center gap-3`} data-testid="profile-strength-complete">
        <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Profile 100% complete</p>
          <p className="text-xs text-muted-foreground mt-0.5">All required information has been filled in. You're ready to submit for review.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${borderColor} ${cardBg} overflow-hidden`} data-testid="profile-strength-card">
      <button
        className="w-full px-5 py-4 flex items-center justify-between gap-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
        onClick={() => setExpanded(!isExpanded)}
        data-testid="button-profile-strength-toggle"
      >
        <div className="flex items-center gap-4">
          <div className="relative h-14 w-14 shrink-0">
            <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" className="text-muted-foreground/20" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" className={ringColor} strokeWidth="3"
                strokeDasharray={`${(pct / 100) * circumference} ${circumference}`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-xs font-bold tabular-nums leading-none ${ringColor}`}>{pct}%</span>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold">Profile Strength: <span className={ringColor}>{strengthLabel}</span></p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {incomplete.length === 0 ? "All complete!" : `${incomplete.length} item${incomplete.length !== 1 ? "s" : ""} still need${incomplete.length === 1 ? "s" : ""} attention`}
            </p>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
      </button>

      {isExpanded && (
        <div className="border-t border-border/60 px-5 pb-5 pt-4">
          <div className="space-y-1.5">
            {items.map((item) => (
              <div key={item.label}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${item.done ? "opacity-50" : "bg-background/70 border border-border/50 hover:border-primary/30"}`}
                data-testid={`strength-item-${item.label.toLowerCase().replace(/\W+/g, "-")}`}>
                <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${item.done ? "bg-emerald-500/10" : "bg-muted"}`}>
                  {item.done ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> : <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />}
                </div>
                <span className={`flex-1 ${item.done ? "line-through text-muted-foreground" : ""}`}>{item.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">+{item.pts}pts</span>
                {!item.done && !locked && (
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs shrink-0 text-primary hover:text-primary"
                    onClick={(e) => { e.stopPropagation(); onOpenSection(item.section); }}
                    data-testid={`button-strength-fix-${item.section}`}>
                    Fix →
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-border/60">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>Overall progress</span>
              <span className={`font-semibold tabular-nums ${ringColor}`}>{earnedPts} / {totalPts} pts</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className={`h-full ${barColor} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
            </div>
          </div>

          {!locked && !BLOCKED_STATUSES.includes(provider?.status ?? "") && (
            <div className="mt-3 pt-3 border-t border-border/60 space-y-3">
              {canSubmit ? (
                <>
                  <div className="space-y-2.5 px-0.5">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none" data-testid="label-strength-consent-provider">
                      <Checkbox
                        id="strength-consent-provider"
                        checked={agreedToProvider}
                        onCheckedChange={(v) => setAgreedToProvider(!!v)}
                        className="mt-0.5 shrink-0"
                        data-testid="checkbox-strength-provider-agreement"
                      />
                      <span className="text-xs leading-snug text-muted-foreground">
                        I agree to the{" "}
                        <a href="/legal/provider-agreement" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 font-medium">Provider Agreement</a>
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 cursor-pointer select-none" data-testid="label-strength-consent-data">
                      <Checkbox
                        id="strength-consent-data"
                        checked={agreedToData}
                        onCheckedChange={(v) => setAgreedToData(!!v)}
                        className="mt-0.5 shrink-0"
                        data-testid="checkbox-strength-data-processing"
                      />
                      <span className="text-xs leading-snug text-muted-foreground">
                        I agree to the{" "}
                        <a href="/legal/data-processing-agreement" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 font-medium">Data Processing Agreement</a>
                      </span>
                    </label>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => submitMutation.mutate()}
                    disabled={submitMutation.isPending || !consentComplete}
                    data-testid="button-profile-strength-submit"
                  >
                    {submitMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2 shrink-0" />}
                    Submit Profile for Review
                  </Button>
                  {!consentComplete && (
                    <p className="text-[10px] text-center text-muted-foreground">Accept both agreements above to enable submission.</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-center text-muted-foreground">
                  Complete more sections to reach 60% and unlock the <span className="font-medium">Submit for Review</span> button.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Overview Panel ─────────────────────────────────────────────────────────────
function OverviewPanel({
  provider,
  user,
  locked,
  onNavigate,
}: {
  provider: any;
  user: any;
  locked: boolean;
  onNavigate: (section: ProfileSubSection) => void;
}) {
  const statusColors: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    action_required: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
    pending_approval: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    under_review: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    rejected: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
    suspended: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    deactivated: "bg-muted text-muted-foreground",
  };

  const statusLabels: Record<string, string> = {
    draft: "Draft",
    action_required: "Action Required",
    pending_approval: "Under Review",
    under_review: "Documents Approved",
    approved: "Approved",
    active: "Active",
    rejected: "Changes Required",
    suspended: "Suspended",
    deactivated: "Deactivated",
  };

  const status = provider?.status ?? "draft";

  const quickSections: {
    id: ProfileSubSection;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    description: string;
    color: string;
  }[] = [
    { id: "personal", icon: User, label: "Personal Info", description: "Name, phone, photo, city", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    { id: "professional", icon: Briefcase, label: "Professional", description: "Bio, category, experience, languages", color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
    { id: "workplace", icon: MapPin, label: "Workplace", description: "Clinic address, location", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    { id: "services", icon: Stethoscope, label: "Services", description: "Service modes & delivery", color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" },
    { id: "verification", icon: FileCheck, label: "Documents", description: "KYC, license, identity", color: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
    { id: "settings", icon: Settings2, label: "Settings", description: "Notifications, currency, security", color: "bg-slate-500/10 text-slate-600 dark:text-slate-400" },
  ];

  return (
    <div className="space-y-5">
      {/* Profile header card */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-6 pt-6 pb-4">
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <AvatarSM
                src={(user as any)?.avatarUrl}
                name={`${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim()}
                className="h-16 w-16 text-xl border-2 border-background shadow-sm"
              />
              {provider?.isVerified && (
                <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-emerald-500 border-2 border-background flex items-center justify-center">
                  <CheckCircle className="h-2.5 w-2.5 text-white" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold truncate">
                  {user?.firstName} {user?.lastName}
                </h2>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[status] ?? statusColors.draft}`}>
                  {statusLabels[status] ?? status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{user?.email}</p>
              {(provider?.displayTitle || provider?.providerCategory) ? (
                <p className="text-xs text-primary mt-1 font-medium">
                  {[provider?.displayTitle, provider?.providerSubcategory || provider?.providerCategory].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              {provider?.city && (
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />{provider.city}
                </p>
              )}
            </div>
            <Button size="sm" variant="outline" className="shrink-0 gap-1.5 text-xs" onClick={() => onNavigate("personal")} data-testid="button-overview-edit-profile">
              <Edit className="h-3.5 w-3.5" />Edit
            </Button>
          </div>
        </div>

        {/* Verification / visibility pills */}
        <div className="px-6 pb-4 flex flex-wrap gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${provider?.isVerified ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "border-border bg-muted/50 text-muted-foreground"}`}>
            <Shield className="h-3 w-3" />{provider?.isVerified ? "Verified provider" : "Not yet verified"}
          </span>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${provider?.isPubliclyVisible !== false && ["approved", "active"].includes(status) ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-400" : "border-border bg-muted/50 text-muted-foreground"}`}>
            <Globe className="h-3 w-3" />
            {provider?.isPubliclyVisible !== false && ["approved", "active"].includes(status) ? "Visible to patients" : "Not publicly visible"}
          </span>
          {provider?.licenseNumber && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950/40 dark:text-purple-400">
              <Award className="h-3 w-3" />Licensed
            </span>
          )}
        </div>
      </div>

      {/* Profile strength widget */}
      <ProfileStrength provider={provider} user={user} locked={locked} onOpenSection={onNavigate} />

      {/* Quick section navigation */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Profile Sections</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {quickSections.map((sec) => (
            <button
              key={sec.id}
              onClick={() => onNavigate(sec.id)}
              className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:border-primary/40 hover:shadow-sm transition-all text-left group"
              data-testid={`button-overview-nav-${sec.id}`}
            >
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${sec.color}`}>
                <sec.icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{sec.label}</p>
                <p className="text-xs text-muted-foreground truncate">{sec.description}</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 group-hover:text-primary transition-colors" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function ProviderProfileTab({
  providerData,
  isUnderReview,
  activeSection: activeSectionProp,
  onSectionChange,
  openSection, // legacy compat
}: {
  providerData: any;
  isUnderReview?: boolean;
  activeSection?: ProfileSubSection;
  onSectionChange?: (s: ProfileSubSection) => void;
  openSection?: ProfileSection;
}) {
  const { user, refreshUser } = useAuth();
  const { i18n } = useTranslation();
  const { toast } = useToast();

  const { data: providerMe } = useQuery<any>({ queryKey: QK.providerMe(), staleTime: 30_000 });
  const provider = providerMe ?? providerData;

  // Normalize legacy openSection prop
  const activeSection = activeSectionProp ?? normalizeSection(openSection) ?? "overview";

  // Providers can always edit their profile — even during review.
  // Changes during review are flagged for the admin team automatically.
  const complianceLocked = false;

  // ── Push notification capability ─────────────────────────────────────────
  const [pushCap, setPushCap] = useState<{ supported: boolean; configured: boolean }>({ supported: false, configured: false });
  const [pushSubscribed, setPushSubscribed] = useState(false);

  useEffect(() => {
    getPushCapability().then((c) => setPushCap({ supported: c.supported, configured: c.configured }));
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then(async (reg) => {
        const sub = await reg?.pushManager.getSubscription();
        setPushSubscribed(!!sub);
      });
    }
  }, []);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: notifPrefs } = useQuery<any>({ queryKey: QK.notificationPreferences() });
  const { data: commsCaps } = useQuery<any>({ queryKey: QK.commsCapabilities() });

  // ── Password form ─────────────────────────────────────────────────────────
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [showPasswords, setShowPasswords] = useState({ current: false, new: false, confirm: false });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1 — Personal Information
  // Note: personal fields are NEVER locked (even under review)
  // ═══════════════════════════════════════════════════════════════════════════
  const [personalDraft, setPersonalDraft] = useState<{
    firstName: string; lastName: string; phone: string; city: string; timezone: string;
  } | null>(null);

  const personalData = personalDraft ?? {
    firstName: user?.firstName ?? "",
    lastName: user?.lastName ?? "",
    phone: (user as any)?.phone ?? "",
    city: (user as any)?.city ?? "",
    timezone: (user as any)?.timezone ?? "",
  };

  const savePersonalMutation = useMutation({
    mutationFn: async (data: typeof personalData) => {
      const res = await apiRequest("PATCH", "/api/auth/profile", data);
      return res.json();
    },
    onSuccess: async () => {
      await refreshUser();
      setPersonalDraft(null);
      toast({ title: "Personal info saved" });
    },
    onError: (e: any) => showErrorModal({ title: "Couldn't save personal info", description: e?.message, context: "profile.personal" }),
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1b — Mobile Number Verification
  // Stored separately on users.mobileNumber (required before submit-review)
  // ═══════════════════════════════════════════════════════════════════════════
  const [mobileDraft, setMobileDraft] = useState<string | null>(null);
  const [mobileStatus, setMobileStatus] = useState<"idle" | "saved" | "sms_unavailable">("idle");
  const currentMobile = (user as any)?.mobileNumber ?? "";
  const mobileValue = mobileDraft !== null ? mobileDraft : currentMobile;

  const saveMobileMutation = useMutation({
    mutationFn: async (mobileNumber: string) => {
      const res = await apiRequest("PATCH", "/api/auth/profile", { mobileNumber });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || "Failed to save mobile number");
      }
      // Try to trigger SMS — gracefully ignore 503 (Twilio not configured)
      try {
        const smsRes = await apiRequest("POST", "/api/provider/verify-mobile/send", { mobileNumber });
        if (smsRes.status === 503) {
          setMobileStatus("sms_unavailable");
        } else {
          setMobileStatus("saved");
        }
      } catch {
        setMobileStatus("sms_unavailable");
      }
      return res.json();
    },
    onSuccess: async () => {
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setMobileDraft(null);
      toast({ title: "Mobile number saved" });
    },
    onError: (e: any) => toast({ title: "Couldn't save mobile number", description: e?.message, variant: "destructive" }),
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2 — Professional Information
  // License credentials are locked during review; soft fields are always editable
  // ═══════════════════════════════════════════════════════════════════════════
  const [proBioDraft, setProBioDraft] = useState<{
    bio: string; languages: string[]; yearsExperience: string; education: string;
    licenseNumber: string; licensingAuthority: string; licenseExpiryDate: string;
  } | null>(null);

  const proBioData = proBioDraft ?? {
    bio: provider?.bio ?? "",
    languages: Array.isArray(provider?.languages) ? provider.languages : [],
    yearsExperience: provider?.yearsExperience != null ? String(provider.yearsExperience) : "",
    education: provider?.education ?? "",
    licenseNumber: provider?.licenseNumber ?? "",
    licensingAuthority: provider?.licensingAuthority ?? "",
    licenseExpiryDate: provider?.licenseExpiryDate
      ? new Date(provider.licenseExpiryDate).toISOString().split("T")[0]
      : "",
  };

  // ── Category / Specialization state ──────────────────────────────────────
  const [categoryDraft, setCategoryDraft] = useState<{
    providerCategory: string;
    providerSubcategory: string;
    providerSpecialization: string;
    displayTitle: string;
  } | null>(null);

  const categoryData = categoryDraft ?? {
    providerCategory: provider?.providerCategory ?? "",
    providerSubcategory: provider?.providerSubcategory ?? "",
    providerSpecialization: provider?.specialization ?? "",
    displayTitle: provider?.displayTitle ?? "",
  };

  // Category is locked once the provider is approved — changes require admin approval
  const providerStatus = provider?.status ?? "draft";
  const isCategoryLocked = ["approved", "active", "suspended", "deactivated"].includes(providerStatus);

  // ── Category change request (approved providers only) ─────────────────────
  // categoryUnlocked = true means the card is in inline-edit mode
  const [categoryUnlocked, setCategoryUnlocked] = useState(false);
  const [categoryChangeDraft, setCategoryChangeDraft] = useState<{
    newCategory: string; newSubcategory: string; newSpecialization: string; newDisplayTitle: string; reason: string;
  }>({ newCategory: "", newSubcategory: "", newSpecialization: "", newDisplayTitle: "", reason: "" });

  const requestCategoryChangeMutation = useMutation({
    mutationFn: async (data: { newCategory: string; newSubcategory: string; newSpecialization: string; newDisplayTitle: string; reason: string }) => {
      const res = await apiRequest("POST", "/api/provider/request-category-change", {
        requestedCategory: data.newCategory,
        requestedSubcategory: data.newSubcategory,
        requestedSpecialization: data.newSpecialization,
        requestedDisplayTitle: data.newDisplayTitle,
        reason: data.reason,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message || "Request failed");
      }
      return res.json();
    },
    onSuccess: () => {
      void invalidateProviderProfile();
      setCategoryUnlocked(false);
      setCategoryChangeDraft({ newCategory: "", newSubcategory: "", newSpecialization: "", newDisplayTitle: "", reason: "" });
      toast({ title: "Change request submitted", description: "An admin will review and respond within 1–3 business days." });
    },
    onError: (e: any) => toast({ title: "Request failed", description: e?.message, variant: "destructive" }),
  });

  const saveCategoryMutation = useMutation({
    mutationFn: async (data: typeof categoryData) => {
      const [setupRes, prefRes] = await Promise.all([
        apiRequest("POST", "/api/provider/setup", {
          providerCategory: data.providerCategory || null,
          providerSubcategory: data.providerSubcategory || null,
          specialization: data.providerSpecialization || null,
        }),
        apiRequest("PATCH", "/api/provider/preferences", {
          displayTitle: data.displayTitle || null,
        }),
      ]);
      return { setup: await setupRes.json(), pref: await prefRes.json() };
    },
    onSuccess: () => {
      void invalidateProviderProfile();
      setCategoryDraft(null);
      toast({ title: "Category & specialization saved" });
    },
    onError: (e: any) => toast({ title: "Couldn't save category", description: e?.message, variant: "destructive" }),
  });

  const saveProfessionalMutation = useMutation({
    mutationFn: async (data: typeof proBioData) => {
      const payload = { ...data, yearsExperience: data.yearsExperience ? parseInt(data.yearsExperience) : 0 };
      const res = await apiRequest("POST", "/api/provider/setup", payload);
      return res.json();
    },
    onSuccess: async (_, variables) => {
      void invalidateProviderProfile();
      setProBioDraft(null);
      // Detect if license credentials changed — inform user that admin team will be notified
      const credentialsChanged =
        variables.licenseNumber !== (provider?.licenseNumber ?? "") ||
        variables.licensingAuthority !== (provider?.licensingAuthority ?? "") ||
        variables.licenseExpiryDate !== (provider?.licenseExpiryDate ?? "");
      if (credentialsChanged) {
        toast({
          title: "Professional info & credentials saved",
          description: "License credential changes have been recorded and the admin team will be informed.",
        });
      } else {
        toast({ title: "Professional info saved" });
      }
    },
    onError: (e: any) => showErrorModal({ title: "Couldn't save professional info", description: e?.message, context: "profile.professional" }),
  });

  const toggleLanguage = (lang: string) => {
    setProBioDraft((d) => {
      const base = d ?? proBioData;
      const langs = base.languages.includes(lang) ? base.languages.filter((l: string) => l !== lang) : [...base.languages, lang];
      return { ...base, languages: langs };
    });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3 — Workplace & Location
  // ═══════════════════════════════════════════════════════════════════════════
  const [workplaceDraft, setWorkplaceDraft] = useState<{
    clinicName: string; primaryServiceLocation: string; city: string; country: string;
    permanentAddressLine1: string; permanentAddressLine2: string; permanentCity: string;
    permanentStateRegion: string; permanentPostalCode: string; permanentCountry: string;
    maxTravelDistanceKm: string;
  } | null>(null);

  const workplaceData = workplaceDraft ?? {
    clinicName: provider?.clinicName ?? "",
    primaryServiceLocation: provider?.primaryServiceLocation ?? provider?.clinicFormattedAddress ?? "",
    city: provider?.city ?? (user as any)?.city ?? "",
    country: provider?.country ?? provider?.countryCode ?? user?.countryCode ?? "",
    permanentAddressLine1: provider?.permanentAddressLine1 ?? "",
    permanentAddressLine2: provider?.permanentAddressLine2 ?? "",
    permanentCity: provider?.permanentCity ?? "",
    permanentStateRegion: provider?.permanentStateRegion ?? "",
    permanentPostalCode: provider?.permanentPostalCode ?? "",
    permanentCountry: provider?.permanentCountry ?? "",
    maxTravelDistanceKm: provider?.maxTravelDistanceKm != null ? String(provider.maxTravelDistanceKm) : "",
  };

  const saveWorkplaceMutation = useMutation({
    mutationFn: async (data: typeof workplaceData) => {
      const [setupRes, addrRes] = await Promise.all([
        apiRequest("POST", "/api/provider/setup", {
          clinicName: data.clinicName,
          primaryServiceLocation: data.primaryServiceLocation,
          city: data.city,
          country: data.country,
          maxTravelDistanceKm: data.maxTravelDistanceKm ? parseInt(data.maxTravelDistanceKm, 10) : null,
        }),
        apiRequest("PATCH", "/api/provider/preferences", {
          permanentAddressLine1: data.permanentAddressLine1 || null,
          permanentAddressLine2: data.permanentAddressLine2 || null,
          permanentCity: data.permanentCity || null,
          permanentStateRegion: data.permanentStateRegion || null,
          permanentPostalCode: data.permanentPostalCode || null,
          permanentCountry: data.permanentCountry || null,
        }),
      ]);
      return { setup: await setupRes.json(), addr: await addrRes.json() };
    },
    onSuccess: async () => {
      void invalidateProviderProfile();
      setWorkplaceDraft(null);
      toast({ title: "Workplace & location saved" });
    },
    onError: (e: any) => showErrorModal({ title: "Couldn't save workplace", description: e?.message, context: "profile.workplace" }),
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4 — Service Delivery
  // ═══════════════════════════════════════════════════════════════════════════
  const [servicesDraft, setServicesDraft] = useState<{
    serviceModes: string[];
  } | null>(null);

  const servicesData = servicesDraft ?? {
    serviceModes: Array.isArray(provider?.serviceModes) ? provider.serviceModes : [],
  };

  const saveServicesMutation = useMutation({
    mutationFn: async (data: typeof servicesData) => {
      const res = await apiRequest("POST", "/api/provider/setup", { serviceModes: data.serviceModes });
      return res.json();
    },
    onSuccess: async () => {
      void invalidateProviderProfile();
      setServicesDraft(null);
      toast({ title: "Service delivery settings saved" });
    },
    onError: (e: any) => showErrorModal({ title: "Couldn't save service delivery", description: e?.message, context: "profile.services" }),
  });

  const toggleServiceMode = (mode: string) => {
    setServicesDraft((d) => {
      const base = d ?? servicesData;
      const modes = base.serviceModes.includes(mode) ? base.serviceModes.filter((m: string) => m !== mode) : [...base.serviceModes, mode];
      return { ...base, serviceModes: modes };
    });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6 — Settings & Preferences
  // Settings fields are NEVER locked — always editable
  // Currency: users.preferredCurrency is the single source of truth (display currency)
  // ═══════════════════════════════════════════════════════════════════════════
  const PAYMENT_METHOD_OPTIONS = [
    { value: "card", label: "Credit / Debit Card" },
    { value: "cash", label: "Cash" },
    { value: "bank_transfer", label: "Bank Transfer" },
    { value: "insurance", label: "Insurance" },
  ];

  const [prefDraft, setPrefDraft] = useState<{
    paymentMethods: string[];
    preferredContactMethod: string;
    onCallAvailability: boolean;
    maxPatientsPerDay: string;
    emergencyContact: string;
  } | null>(null);

  const prefData = prefDraft ?? {
    paymentMethods: Array.isArray(provider?.paymentMethods) ? provider.paymentMethods : [],
    preferredContactMethod: provider?.preferredContactMethod || "email",
    onCallAvailability: !!provider?.onCallAvailability,
    maxPatientsPerDay: provider?.maxPatientsPerDay ? String(provider.maxPatientsPerDay) : "",
    emergencyContact: provider?.emergencyContact || "",
  };

  const savePreferencesMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", "/api/provider/preferences", data);
      return res.json();
    },
    onSuccess: async () => {
      await refreshUser();
      void invalidateProviderProfile();
      toast({ title: "Practice settings saved" });
      setPrefDraft(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message || "Failed to save preferences", variant: "destructive" }),
  });

  const updateNotifPrefs = useMutation({
    mutationFn: async (patch: Record<string, any>) => apiRequest("PATCH", "/api/notification-preferences", patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QK.notificationPreferences() }),
    onError: () => showErrorModal({ title: "Failed to save notification preference", context: "provider.updateNotifPrefs" }),
  });

  // Display currency — users.preferredCurrency is the single authority
  const updateCurrencyMutation = useMutation({
    mutationFn: async (preferredCurrency: string) => apiRequest("PATCH", "/api/auth/profile", { preferredCurrency }),
    onSuccess: async () => {
      await refreshUser();
      toast({ title: "Display currency updated" });
    },
    onError: (e: any) => showErrorModal({ title: "Failed to update currency", description: e?.message, context: "provider.updateCurrency" }),
  });

  const updateCountryMutation = useMutation({
    mutationFn: async (countryCode: "HU" | "IR") => apiRequest("PATCH", "/api/auth/profile", { countryCode }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({ title: "Country updated" });
    },
    onError: (e: any) => showErrorModal({ title: "Failed to switch country", description: e?.message, context: "provider.updateCountry" }),
  });

  const togglePush = async (on: boolean) => {
    try {
      if (on) {
        const r = await subscribeToPush();
        if (!r.ok) { showErrorModal({ title: "Push not enabled", description: r.reason, context: "provider.subscribePush" }); return; }
        setPushSubscribed(true);
        updateNotifPrefs.mutate({ pushEnabled: true });
        toast({ title: "Push notifications enabled" });
      } else {
        await unsubscribeFromPush();
        setPushSubscribed(false);
        updateNotifPrefs.mutate({ pushEnabled: false });
        toast({ title: "Push notifications disabled" });
      }
    } catch (e: any) {
      showErrorModal({ title: "Push toggle failed", description: e?.message, context: "provider.togglePush" });
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7 — Account Security
  // ═══════════════════════════════════════════════════════════════════════════
  const changePasswordMutation = useMutation({
    mutationFn: async (data: typeof passwordForm) => {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to change password");
      }
      return response.json();
    },
    onSuccess: () => {
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast({ title: "Password changed", description: "Your password has been updated." });
    },
    onError: (error: any) => showErrorModal({ title: "Couldn't change password", description: error.message, context: "provider.changePassword" }),
  });

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showErrorModal({ title: "Passwords don't match", description: "New passwords do not match.", context: "provider.passwordMismatch" });
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      showErrorModal({ title: "Password too short", description: "Password must be at least 8 characters.", context: "provider.passwordTooShort" });
      return;
    }
    changePasswordMutation.mutate(passwordForm);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  const navigate = onSectionChange;

  // ── Under-review banner ───────────────────────────────────────────────────
  const ReviewBanner = () => (
    <div className="flex items-start gap-3 rounded-xl border border-blue-500/40 bg-blue-500/8 px-4 py-3.5 text-sm mb-4" data-testid="banner-profile-review">
      <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold text-blue-700 dark:text-blue-300">Profile is under review</p>
        <p className="text-blue-700/80 dark:text-blue-400/80 text-xs mt-0.5">
          You can still update any section. Changes you make will be flagged for the admin team to re-check.
        </p>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION PANELS
  // ═══════════════════════════════════════════════════════════════════════════

  const renderPersonal = () => (
    <div>
      <SectionHeader icon={User} color="bg-blue-500/10 text-blue-600" title="Personal Information" description="Your name, contact details, profile photo, and city" />
      <div className="space-y-5">
        {/* Avatar — display only; upload via Documents → Profile Photo */}
        <div className="flex items-center gap-4">
          <AvatarSM
            src={(user as any)?.avatarUrl}
            name={`${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim()}
            className="h-16 w-16 text-lg shrink-0"
          />
          <div>
            <p className="text-sm font-medium">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
            <p className="text-xs text-muted-foreground mt-1">To change your photo, go to <strong>Documents → Profile Photo</strong></p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">First Name</Label>
            <Input id="firstName" value={personalData.firstName}
              onChange={(e) => setPersonalDraft((d) => ({ ...(d ?? personalData), firstName: e.target.value }))}
              data-testid="input-first-name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Last Name</Label>
            <Input id="lastName" value={personalData.lastName}
              onChange={(e) => setPersonalDraft((d) => ({ ...(d ?? personalData), lastName: e.target.value }))}
              data-testid="input-last-name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone Number</Label>
            <Input id="phone" value={personalData.phone}
              onChange={(e) => setPersonalDraft((d) => ({ ...(d ?? personalData), phone: e.target.value }))}
              placeholder="+1 555 000 0000" data-testid="input-phone" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">City</Label>
            <Input id="city" value={personalData.city}
              onChange={(e) => setPersonalDraft((d) => ({ ...(d ?? personalData), city: e.target.value }))}
              placeholder="Budapest" data-testid="input-city" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="timezone">Timezone</Label>
            <p className="text-xs text-muted-foreground">
              Used for accurate slot scheduling and appointment times. Select the timezone where you practice.
            </p>
            <Select
              value={personalData.timezone || "_none"}
              onValueChange={(v) =>
                setPersonalDraft((d) => ({ ...(d ?? personalData), timezone: v === "_none" ? "" : v }))
              }
            >
              <SelectTrigger id="timezone" data-testid="select-timezone">
                <SelectValue placeholder="Select your timezone…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Not set (platform will infer from country) —</SelectItem>
                <SelectItem value="Europe/Budapest">Europe/Budapest — Hungary (CEST/CET)</SelectItem>
                <SelectItem value="Asia/Tehran">Asia/Tehran — Iran (IRST/IRDT)</SelectItem>
                <SelectItem value="UTC">UTC — Coordinated Universal Time</SelectItem>
                <SelectItem value="Europe/London">Europe/London — UK (GMT/BST)</SelectItem>
                <SelectItem value="Europe/Berlin">Europe/Berlin — Germany/Central Europe (CET/CEST)</SelectItem>
                <SelectItem value="Europe/Paris">Europe/Paris — France/Belgium (CET/CEST)</SelectItem>
                <SelectItem value="Europe/Rome">Europe/Rome — Italy (CET/CEST)</SelectItem>
                <SelectItem value="Europe/Athens">Europe/Athens — Greece/Eastern Europe (EET/EEST)</SelectItem>
                <SelectItem value="Europe/Istanbul">Europe/Istanbul — Turkey (TRT)</SelectItem>
                <SelectItem value="Asia/Dubai">Asia/Dubai — UAE/Gulf (GST)</SelectItem>
                <SelectItem value="Asia/Riyadh">Asia/Riyadh — Saudi Arabia (AST)</SelectItem>
                <SelectItem value="Asia/Kolkata">Asia/Kolkata — India (IST)</SelectItem>
                <SelectItem value="Asia/Singapore">Asia/Singapore — Singapore/Malaysia (SGT)</SelectItem>
                <SelectItem value="Asia/Tokyo">Asia/Tokyo — Japan (JST)</SelectItem>
                <SelectItem value="Australia/Sydney">Australia/Sydney — Sydney (AEDT/AEST)</SelectItem>
                <SelectItem value="America/New_York">America/New_York — US Eastern (ET)</SelectItem>
                <SelectItem value="America/Chicago">America/Chicago — US Central (CT)</SelectItem>
                <SelectItem value="America/Denver">America/Denver — US Mountain (MT)</SelectItem>
                <SelectItem value="America/Los_Angeles">America/Los_Angeles — US Pacific (PT)</SelectItem>
                <SelectItem value="America/Toronto">America/Toronto — Canada Eastern (ET)</SelectItem>
                <SelectItem value="America/Sao_Paulo">America/Sao_Paulo — Brazil (BRT)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button size="sm" onClick={() => savePersonalMutation.mutate(personalData)}
            disabled={savePersonalMutation.isPending || !personalDraft} data-testid="button-save-personal">
            {savePersonalMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
            Save Personal Info
          </Button>
        </div>
      </div>
    </div>
  );

  const renderProfessional = () => {
    return (
    <div>
      <SectionHeader icon={Briefcase} color="bg-indigo-500/10 text-indigo-600" title="Professional Information" description="Bio, specialization, experience, languages, and credential titles" />
      <div className="space-y-6">

        {/* ── Provider Category and Specialization ─────────────────────── */}
        {(() => {
          // ── LOCKED: approved / active / suspended / deactivated ─────────
          if (isCategoryLocked) {
            const pendingCategory = (provider as any)?.pendingProviderCategory as string | undefined;
            const pendingSubcat = (provider as any)?.pendingProviderSubcategory as string | undefined;
            const pendingSpecialization = (provider as any)?.pendingSpecialization as string | undefined;
            const pendingDisplayTitle = (provider as any)?.pendingDisplayTitle as string | undefined;
            const hasPending = !!(pendingCategory || pendingSpecialization || pendingDisplayTitle);
            // Fall back to the provider's current category so the Specialization
            // and Display Title selects are visible even when the provider only
            // wants to change those fields (without picking a new category).
            const effectiveEditCategory = categoryChangeDraft.newCategory || provider?.providerCategory || "";
            const effectiveEditSubcat   = categoryChangeDraft.newSubcategory || provider?.providerSubcategory || "";
            const editTaxonomy = PROVIDER_TAXONOMY.find(t => t.category === effectiveEditCategory) as TaxonomyEntry | undefined;
            const editSubcat = editTaxonomy?.subcategories.find((sc: any) => sc.name === effectiveEditSubcat);

            return (
              <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 p-4 space-y-4 bg-indigo-50/30 dark:bg-indigo-950/10">

                {/* ── Header row ─────────────────────────────────────────── */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <Stethoscope className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      Provider Category and Specialization
                      {!categoryUnlocked && <Lock className="h-3.5 w-3.5 text-amber-500" />}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {categoryUnlocked
                        ? "Edit any combination of category, specialization, or display title below, then click Submit for admin review."
                        : "Category, specialization, and display title are locked after approval. Click Unlock to request a change — an admin will review within 1–3 business days."}
                    </p>
                  </div>
                  {!categoryUnlocked && (
                    <Button size="sm" variant="outline"
                      onClick={() => {
                        setCategoryChangeDraft({
                          newCategory: provider?.providerCategory ?? "",
                          newSubcategory: provider?.providerSubcategory ?? "",
                          newSpecialization: (provider as any)?.specialization ?? "",
                          newDisplayTitle: (provider as any)?.displayTitle ?? "",
                          reason: "",
                        });
                        setCategoryUnlocked(true);
                      }}
                      disabled={hasPending}
                      data-testid="button-unlock-category"
                    >
                      <Lock className="h-3.5 w-3.5 mr-1.5" />
                      {hasPending ? "Change Pending…" : "Unlock"}
                    </Button>
                  )}
                </div>

                {/* ── Pending banner (always visible if pending) ─────────── */}
                {hasPending && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Profile change pending admin review</p>
                      {pendingCategory && (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          Category: <span className="font-medium">{pendingCategory}</span>
                          {pendingSubcat && <> → <span className="font-medium">{pendingSubcat}</span></>}
                        </p>
                      )}
                      {pendingSpecialization && (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          Specialization: <span className="font-medium">{pendingSpecialization}</span>
                        </p>
                      )}
                      {pendingDisplayTitle && (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          Display Title: <span className="font-medium">{pendingDisplayTitle}</span>
                        </p>
                      )}
                      <p className="text-xs text-amber-700/70 dark:text-amber-400/70 pt-0.5">Your current values stay active until this is approved.</p>
                    </div>
                  </div>
                )}

                {categoryUnlocked ? (
                  /* ── Inline edit mode ──────────────────────────────────── */
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>New Category <span className="text-muted-foreground text-xs">(optional if only changing specialization/title)</span></Label>
                      <Select
                        value={categoryChangeDraft.newCategory || "__none__"}
                        onValueChange={(v) => setCategoryChangeDraft(d => ({
                          ...d, newCategory: v === "__none__" ? "" : v, newSubcategory: "", newSpecialization: "",
                        }))}
                      >
                        <SelectTrigger data-testid="select-new-category">
                          <SelectValue placeholder="Select new category..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Select category —</SelectItem>
                          {PROVIDER_TAXONOMY.map((t) => (
                            <SelectItem key={t.category} value={t.category}>{t.category}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {editTaxonomy && (
                      <div className="space-y-1.5">
                        <Label>New Sub-Category</Label>
                        <Select
                          value={categoryChangeDraft.newSubcategory || "__none__"}
                          onValueChange={(v) => setCategoryChangeDraft(d => ({ ...d, newSubcategory: v === "__none__" ? "" : v, newSpecialization: "" }))}
                        >
                          <SelectTrigger data-testid="select-new-subcategory">
                            <SelectValue placeholder="Select sub-category..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— None —</SelectItem>
                            {editTaxonomy.subcategories.map((sc: any) => (
                              <SelectItem key={sc.name} value={sc.name}>{sc.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {editSubcat && (
                      <div className="space-y-1.5">
                        <Label>New Specialization</Label>
                        <Select
                          value={categoryChangeDraft.newSpecialization || "__none__"}
                          onValueChange={(v) => setCategoryChangeDraft(d => ({ ...d, newSpecialization: v === "__none__" ? "" : v }))}
                        >
                          <SelectTrigger data-testid="select-new-specialization">
                            <SelectValue placeholder="Select specialization..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— None —</SelectItem>
                            {(editSubcat as any).specializations.map((sp: string) => (
                              <SelectItem key={sp} value={sp}>{sp}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {editTaxonomy && (
                      <div className="space-y-1.5">
                        <Label>New Display Title</Label>
                        <p className="text-xs text-muted-foreground">Title shown on your public provider card (e.g. "Dr.", "Physiotherapist").</p>
                        <Select
                          value={categoryChangeDraft.newDisplayTitle || "__none__"}
                          onValueChange={(v) => setCategoryChangeDraft(d => ({ ...d, newDisplayTitle: v === "__none__" ? "" : v }))}
                        >
                          <SelectTrigger data-testid="select-new-display-title">
                            <SelectValue placeholder="Select display title..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— None —</SelectItem>
                            {(editTaxonomy.displayTitles ?? []).map((t: string) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label>Reason <span className="text-muted-foreground text-xs">(optional but helpful)</span></Label>
                      <Textarea rows={2}
                        placeholder="e.g. completed additional training, expanding scope of practice..."
                        value={categoryChangeDraft.reason}
                        onChange={(e) => setCategoryChangeDraft(d => ({ ...d, reason: e.target.value }))}
                        data-testid="input-category-change-reason"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button size="sm" variant="outline"
                        onClick={() => { setCategoryUnlocked(false); setCategoryChangeDraft({ newCategory: "", newSubcategory: "", newSpecialization: "", newDisplayTitle: "", reason: "" }); }}
                        data-testid="button-cancel-category-change"
                      >
                        Cancel
                      </Button>
                      <Button size="sm"
                        onClick={() => requestCategoryChangeMutation.mutate(categoryChangeDraft)}
                        disabled={
                          requestCategoryChangeMutation.isPending ||
                          (
                            categoryChangeDraft.newCategory === (provider?.providerCategory ?? "") &&
                            categoryChangeDraft.newSubcategory === (provider?.providerSubcategory ?? "") &&
                            categoryChangeDraft.newSpecialization === ((provider as any)?.specialization ?? "") &&
                            categoryChangeDraft.newDisplayTitle === ((provider as any)?.displayTitle ?? "")
                          )
                        }
                        data-testid="button-submit-category-change"
                      >
                        {requestCategoryChangeMutation.isPending
                          ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          : <CheckCircle className="h-4 w-4 mr-2" />}
                        Submit for Admin Review
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* ── Read-only view ─────────────────────────────────────── */
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Category</p>
                      <p className="text-sm font-medium">{provider?.providerCategory || <span className="italic text-muted-foreground/60">Not set</span>}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Sub-Category</p>
                      <p className="text-sm font-medium">{provider?.providerSubcategory || <span className="italic text-muted-foreground/60">Not set</span>}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Specialization</p>
                      <p className="text-sm font-medium">{provider?.specialization || <span className="italic text-muted-foreground/60">Not set</span>}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Display Title</p>
                      <p className="text-sm font-medium">{provider?.displayTitle || <span className="italic text-muted-foreground/60">Not set</span>}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          }

          // ── UNLOCKED: editable selects (not yet approved) ───────────────
          const selTaxonomy = PROVIDER_TAXONOMY.find(t => t.category === categoryData.providerCategory) as TaxonomyEntry | undefined;
          const selSubcat = selTaxonomy?.subcategories.find((sc: any) => sc.name === categoryData.providerSubcategory);
          return (
            <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 p-4 space-y-4 bg-indigo-50/30 dark:bg-indigo-950/10">
              <div>
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  Provider Category and Specialization
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Select your professional category, sub-category, and specialization. This appears on your public profile and helps patients find you.</p>
              </div>

              <div className="space-y-1.5">
                <Label>Provider Category <span className="text-destructive">*</span></Label>
                <Select
                  value={categoryData.providerCategory || "__none__"}
                  onValueChange={(v) => {
                    const val = v === "__none__" ? "" : v;
                    setCategoryDraft((_d) => ({ providerCategory: val, providerSubcategory: "", providerSpecialization: "", displayTitle: categoryData.displayTitle }));
                  }}
                >
                  <SelectTrigger data-testid="select-provider-category">
                    <SelectValue placeholder="Select your category..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Select category —</SelectItem>
                    {PROVIDER_TAXONOMY.map((t) => (
                      <SelectItem key={t.category} value={t.category}>{t.category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selTaxonomy && (
                <div className="space-y-1.5">
                  <Label>Sub-Category <span className="text-destructive">*</span></Label>
                  <Select
                    value={categoryData.providerSubcategory || "__none__"}
                    onValueChange={(v) => {
                      const val = v === "__none__" ? "" : v;
                      setCategoryDraft((_d) => ({ ...(categoryDraft ?? categoryData), providerSubcategory: val, providerSpecialization: "" }));
                    }}
                  >
                    <SelectTrigger data-testid="select-provider-subcategory">
                      <SelectValue placeholder="Select sub-category..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Select sub-category —</SelectItem>
                      {selTaxonomy.subcategories.map((sc: any) => (
                        <SelectItem key={sc.name} value={sc.name}>{sc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selSubcat && (
                <div className="space-y-1.5">
                  <Label>Specialization <span className="text-destructive">*</span></Label>
                  <Select
                    value={categoryData.providerSpecialization || "__none__"}
                    onValueChange={(v) => {
                      const val = v === "__none__" ? "" : v;
                      setCategoryDraft((_d) => ({ ...(categoryDraft ?? categoryData), providerSpecialization: val }));
                    }}
                  >
                    <SelectTrigger data-testid="select-provider-specialization">
                      <SelectValue placeholder="Select specialization..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Select specialization —</SelectItem>
                      {(selSubcat as any).specializations.map((sp: string) => (
                        <SelectItem key={sp} value={sp}>{sp}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {categoryData.providerCategory && (
                <div className="space-y-1.5">
                  <Label>Display Title</Label>
                  <p className="text-xs text-muted-foreground">Title shown on your public provider card (e.g. "Dr.", "Physiotherapist"). Options are tailored to your category.</p>
                  <Select
                    value={categoryData.displayTitle || "__none__"}
                    onValueChange={(v) => {
                      const val = v === "__none__" ? "" : v;
                      setCategoryDraft((_d) => ({ ...(categoryDraft ?? categoryData), displayTitle: val }));
                    }}
                  >
                    <SelectTrigger data-testid="select-display-title">
                      <SelectValue placeholder="— Select display title —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      {(selTaxonomy?.displayTitles ?? []).map((t: string) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex justify-end">
                <Button size="sm" onClick={() => saveCategoryMutation.mutate(categoryData)}
                  disabled={saveCategoryMutation.isPending || !categoryDraft} data-testid="button-save-category">
                  {saveCategoryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  Save Category
                </Button>
              </div>
            </div>
          );
        })()}

        <div className="space-y-1.5">
          <Label htmlFor="bio">Professional Bio</Label>
          <p className="text-xs text-muted-foreground">Minimum 20 characters. Shown on your public profile.</p>
          <Textarea id="bio" rows={5} value={proBioData.bio}
            onChange={(e) => setProBioDraft((d) => ({ ...(d ?? proBioData), bio: e.target.value }))}
            placeholder="Describe your expertise, approach, and what patients can expect..." data-testid="input-bio" />
          <p className="text-xs text-muted-foreground text-right">{proBioData.bio.length} characters</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="yearsExperience">Years of Experience</Label>
            <Input id="yearsExperience" type="number" min={0} max={60}
              value={proBioData.yearsExperience}
              onChange={(e) => setProBioDraft((d) => ({ ...(d ?? proBioData), yearsExperience: e.target.value }))}
              placeholder="5" data-testid="input-years-experience" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="education">Education / Degree</Label>
            <Input id="education" value={proBioData.education}
              onChange={(e) => setProBioDraft((d) => ({ ...(d ?? proBioData), education: e.target.value }))}
              placeholder="e.g. M.D., University of Budapest" data-testid="input-education" />
          </div>
        </div>

        {/* License credentials */}
        <div className="rounded-xl border border-border/60 p-4 space-y-4 bg-muted/20">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">License Credentials</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="licenseNumber">License Number</Label>
              <Input id="licenseNumber" value={proBioData.licenseNumber}
                onChange={(e) => setProBioDraft((d) => ({ ...(d ?? proBioData), licenseNumber: e.target.value }))}
                disabled={complianceLocked} placeholder="e.g. HU-12345" data-testid="input-license-number" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="licenseExpiryDate">License Expiry Date</Label>
              <Input id="licenseExpiryDate" type="date" value={proBioData.licenseExpiryDate}
                onChange={(e) => setProBioDraft((d) => ({ ...(d ?? proBioData), licenseExpiryDate: e.target.value }))}
                disabled={complianceLocked} data-testid="input-license-expiry" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="licensingAuthority">Licensing Authority</Label>
              <Input id="licensingAuthority" value={proBioData.licensingAuthority}
                onChange={(e) => setProBioDraft((d) => ({ ...(d ?? proBioData), licensingAuthority: e.target.value }))}
                disabled={complianceLocked} placeholder="e.g. Hungarian Medical Chamber" data-testid="input-licensing-authority" />
            </div>
          </div>
          {!complianceLocked && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
              <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">Changes to license credentials are logged and the admin team is notified for compliance tracking.</p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Languages Spoken</Label>
          <p className="text-xs text-muted-foreground">Select all languages you can consult in.</p>
          <div className="flex flex-wrap gap-2">
            {LANGUAGE_OPTIONS.map((lang) => {
              const selected = proBioData.languages.includes(lang);
              return (
                <button key={lang} type="button" onClick={() => toggleLanguage(lang)}
                  data-testid={`lang-toggle-${lang}`}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${selected ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"}`}>
                  {lang}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={() => saveProfessionalMutation.mutate(proBioData)}
            disabled={saveProfessionalMutation.isPending || !proBioDraft} data-testid="button-save-professional">
            {saveProfessionalMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
            Save Professional Info
          </Button>
        </div>


        <Separator />

        {/* ── Practice Currency — Required for approval ─────────────────── */}
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <p className="text-sm font-semibold">Practice Currency <span className="text-red-500 ml-0.5">*</span></p>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800">Required for approval</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Select the currency you will charge patients in. This affects all service prices, wallet balance, payouts, and invoicing. You must set this before submitting for review.
          </p>
          <Select
            value={(user as any)?.preferredCurrency || ""}
            onValueChange={(v) => updateCurrencyMutation.mutate(v)}
            disabled={updateCurrencyMutation.isPending}
          >
            <SelectTrigger data-testid="select-provider-practice-currency">
              <SelectValue placeholder="— Select your practice currency —" />
            </SelectTrigger>
            <SelectContent>
              {CURRENCY_OPTIONS.map((opt) => <SelectItem key={opt.code} value={opt.code}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {!(user as any)?.preferredCurrency && (
            <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Currency must be set before submitting for review.
            </p>
          )}
          {updateCurrencyMutation.isPending && <p className="text-xs text-muted-foreground">Saving…</p>}
          {updateCurrencyMutation.isSuccess && <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" />Currency saved.</p>}
        </div>

        <Separator />

        {/* Profile Gallery */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary" />Profile Gallery</p>
            <p className="text-xs text-muted-foreground mt-0.5">Photos of your clinic or practice space shown on your public profile.</p>
          </div>
          <SectionErrorBoundary section="gallery"><ProviderGalleryManager /></SectionErrorBoundary>
        </div>
      </div>
    </div>
  );
  };

  const renderWorkplace = () => (
    <div>
      <SectionHeader icon={MapPin} color="bg-emerald-500/10 text-emerald-600" title="Workplace & Location" description="Clinic/practice address and your permanent legal address" />
      <div className="space-y-5">
        <div>
          <p className="text-sm font-semibold mb-3">Practice / Clinic</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="clinicName">Clinic / Practice Name</Label>
              <Input id="clinicName" value={workplaceData.clinicName}
                onChange={(e) => setWorkplaceDraft((d) => ({ ...(d ?? workplaceData), clinicName: e.target.value }))}
                placeholder="e.g. HealthFirst Physiotherapy" data-testid="input-clinic-name" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="primaryServiceLocation">Practice Address</Label>
              <Input id="primaryServiceLocation" value={workplaceData.primaryServiceLocation}
                onChange={(e) => setWorkplaceDraft((d) => ({ ...(d ?? workplaceData), primaryServiceLocation: e.target.value }))}
                placeholder="Street address" data-testid="input-practice-address" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="workplaceCity">City</Label>
              <Input id="workplaceCity" value={workplaceData.city}
                onChange={(e) => setWorkplaceDraft((d) => ({ ...(d ?? workplaceData), city: e.target.value }))}
                placeholder="Budapest" data-testid="input-workplace-city" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="workplaceCountry">Country</Label>
              <Input id="workplaceCountry" value={workplaceData.country}
                onChange={(e) => setWorkplaceDraft((d) => ({ ...(d ?? workplaceData), country: e.target.value }))}
                placeholder="Hungary" data-testid="input-workplace-country" />
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <p className="text-sm font-semibold mb-1 flex items-center gap-2">
            <span className="text-lg">🏠</span> Home Visit Coverage
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            Set the maximum distance (km) you are willing to travel for home visits, measured from your practice address. Leave blank for no distance restriction.
          </p>
          <div className="flex items-center gap-3 max-w-xs">
            <Input
              type="number"
              min={0}
              max={500}
              placeholder="e.g. 20"
              value={workplaceData.maxTravelDistanceKm}
              onChange={(e) => setWorkplaceDraft((d) => ({ ...(d ?? workplaceData), maxTravelDistanceKm: e.target.value }))}
              data-testid="input-max-travel-distance"
              className="w-36"
            />
            <span className="text-sm text-muted-foreground">km</span>
            {workplaceData.maxTravelDistanceKm && Number(workplaceData.maxTravelDistanceKm) > 0 && (
              <Badge variant="secondary" className="text-xs">
                Up to {workplaceData.maxTravelDistanceKm} km
              </Badge>
            )}
          </div>
        </div>

        <Separator />

        <div>
          <p className="text-sm font-semibold mb-1">Permanent / Legal Address</p>
          <p className="text-xs text-muted-foreground mb-3">Your home address for invoicing and compliance. Not shown publicly.</p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Address Line 1</Label>
              <Input placeholder="Street and house number" value={workplaceData.permanentAddressLine1}
                onChange={(e) => setWorkplaceDraft((d) => ({ ...(d ?? workplaceData), permanentAddressLine1: e.target.value }))}
                data-testid="input-permanent-address-line1" />
            </div>
            <div className="space-y-1.5">
              <Label>Address Line 2 <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Input placeholder="Apartment, floor, suite" value={workplaceData.permanentAddressLine2}
                onChange={(e) => setWorkplaceDraft((d) => ({ ...(d ?? workplaceData), permanentAddressLine2: e.target.value }))}
                data-testid="input-permanent-address-line2" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input placeholder="Budapest" value={workplaceData.permanentCity}
                  onChange={(e) => setWorkplaceDraft((d) => ({ ...(d ?? workplaceData), permanentCity: e.target.value }))}
                  data-testid="input-permanent-city" />
              </div>
              <div className="space-y-1.5">
                <Label>Region / State</Label>
                <Input placeholder="Pest County" value={workplaceData.permanentStateRegion}
                  onChange={(e) => setWorkplaceDraft((d) => ({ ...(d ?? workplaceData), permanentStateRegion: e.target.value }))}
                  data-testid="input-permanent-state-region" />
              </div>
              <div className="space-y-1.5">
                <Label>Postal Code</Label>
                <Input placeholder="1051" value={workplaceData.permanentPostalCode}
                  onChange={(e) => setWorkplaceDraft((d) => ({ ...(d ?? workplaceData), permanentPostalCode: e.target.value }))}
                  data-testid="input-permanent-postal-code" />
              </div>
              <div className="space-y-1.5">
                <Label>Country</Label>
                <Input placeholder="Hungary" value={workplaceData.permanentCountry}
                  onChange={(e) => setWorkplaceDraft((d) => ({ ...(d ?? workplaceData), permanentCountry: e.target.value }))}
                  data-testid="input-permanent-country" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button size="sm"
            onClick={() => {
              const isClinicMode = servicesData.serviceModes.includes("clinic_visit");
              if (isClinicMode && !workplaceData.primaryServiceLocation.trim()) {
                toast({ title: "Practice address required", description: "You have Clinic Visit enabled — please provide a practice address.", variant: "destructive" });
                return;
              }
              if (isClinicMode && !workplaceData.city.trim()) {
                toast({ title: "City required", description: "You have Clinic Visit enabled — please provide a city.", variant: "destructive" });
                return;
              }
              saveWorkplaceMutation.mutate(workplaceData);
            }}
            disabled={saveWorkplaceMutation.isPending || !workplaceDraft} data-testid="button-save-workplace">
            {saveWorkplaceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
            Save Workplace
          </Button>
        </div>
      </div>
    </div>
  );

  const renderServices = () => (
    <div>
      <SectionHeader icon={Stethoscope} color="bg-cyan-500/10 text-cyan-600" title="Service Delivery" description="How you see patients — in-clinic, home visit, or video — and consultation fees" />
      <div className="space-y-5">
        {complianceLocked && (
          <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
            <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">Service modes and fees are locked during compliance review.</p>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Select the modes you offer. Pricing is set per-service in the Services tab.</p>
        <div className="space-y-3">
          {[
            { key: "clinic_visit", icon: "🏥" },
            { key: "home_visit", icon: "🏠" },
            { key: "telemedicine", icon: "💻" },
          ].map(({ key, icon }) => {
            const active = servicesData.serviceModes.includes(key);
            return (
              <div key={key} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${active ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                <button type="button" onClick={() => toggleServiceMode(key)}
                  data-testid={`toggle-mode-${key}`}
                  className={`flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center text-lg border-2 transition-colors ${active ? "border-primary bg-primary/10" : "border-border bg-muted"}`}>
                  {icon}
                </button>
                <div className="flex-1">
                  <p className="text-sm font-medium">{SERVICE_MODE_LABELS[key]}</p>
                  <p className="text-xs text-muted-foreground">{active ? "Active" : "Inactive"}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => saveServicesMutation.mutate(servicesData)}
            disabled={saveServicesMutation.isPending || !servicesDraft} data-testid="button-save-services">
            {saveServicesMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
            Save Service Delivery
          </Button>
        </div>
      </div>
    </div>
  );

  const renderVerification = () => (
    <div>
      <SectionHeader icon={FileCheck} color="bg-rose-500/10 text-rose-600" title="Verification & Documents" description="Upload your professional documents, ID, and track your verification status" />
      <div className="space-y-6">

        {/* ── Mobile Number Verification ─────────────────────────────── */}
        <div className="rounded-xl border bg-card p-4 space-y-3" data-testid="section-mobile-verification">
          <div className="flex items-center gap-2">
            <div className="rounded-lg p-1.5 bg-primary/10 shrink-0">
              <Smartphone className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Mobile Number</p>
              <p className="text-xs text-muted-foreground">Required before submitting for review. Used for appointment alerts and compliance notifications.</p>
            </div>
            {currentMobile && mobileDraft === null && (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1 text-xs shrink-0">
                <CheckCircle className="h-3 w-3" />Saved
              </Badge>
            )}
          </div>

          <div className="flex gap-2">
            <Input
              value={mobileValue}
              onChange={(e) => { setMobileDraft(e.target.value); setMobileStatus("idle"); }}
              placeholder="+36 20 000 0000"
              className="flex-1"
              data-testid="input-mobile-number"
            />
            <Button
              size="sm"
              onClick={() => { if (mobileValue.trim().length >= 7) saveMobileMutation.mutate(mobileValue.trim()); }}
              disabled={saveMobileMutation.isPending || mobileValue.trim().length < 7 || (mobileDraft === null && !!currentMobile && mobileValue === currentMobile)}
              data-testid="button-save-mobile"
            >
              {saveMobileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>

          {mobileStatus === "sms_unavailable" && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>Number saved. SMS verification is not yet active on this server — your number is on file and will be verified automatically when the feature is enabled.</span>
            </div>
          )}
          {mobileStatus === "saved" && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5" />A verification code has been sent to your number.
            </p>
          )}
        </div>

        <Separator />
        <SectionErrorBoundary section="kyc"><ProviderKYC /></SectionErrorBoundary>
        <Separator />
        <SectionErrorBoundary section="documents"><ProviderDocumentsPanel /></SectionErrorBoundary>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div>
      <SectionHeader icon={Settings2} color="bg-slate-500/10 text-slate-600" title="Settings" description="Practice settings, notifications, language, and account security" />
      <div className="space-y-6">
        <SectionErrorBoundary section="preferences">
          <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/20 px-4 py-3 text-xs text-blue-700 dark:text-blue-400 flex items-start gap-2">
            <Banknote className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>To change your <strong>Practice Currency</strong>, go to <strong>Professional Information</strong> → Practice Currency.</span>
          </div>
          <Separator />

          {/* Interface Language */}
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Interface Language</p>
            <p className="text-xs text-muted-foreground">Choose the language for the platform UI.</p>
            <select data-testid="select-provider-language"
              className="w-full border border-input rounded-md h-10 px-3 bg-background text-sm"
              defaultValue={notifPrefs?.language || i18n.language?.slice(0, 2) || "en"}
              onChange={(e) => updateNotifPrefs.mutate({ language: e.target.value })}>
              <option value="en">English</option>
              <option value="hu">Magyar (Hungarian)</option>
              <option value="fa">فارسی (Persian)</option>
            </select>
          </div>

          <Separator />

          {/* Country Context */}
          <div className="space-y-1.5">
            <p className="text-sm font-semibold flex items-center gap-2"><Globe className="h-4 w-4 text-primary" />Country Context</p>
            <p className="text-xs text-muted-foreground">Switch your active country — affects which providers and services you see.</p>
            <select data-testid="select-provider-country"
              className="w-full border border-input rounded-md h-10 px-3 bg-background text-sm"
              value={(user as any)?.countryCode || "HU"}
              disabled={updateCountryMutation.isPending}
              onChange={(e) => updateCountryMutation.mutate(e.target.value as "HU" | "IR")}>
              <option value="HU">🇭🇺 Hungary</option>
              <option value="IR">🇮🇷 Iran</option>
            </select>
          </div>

          <Separator />

          {/* Practice Settings */}
          <div className="space-y-4">
            <p className="text-sm font-semibold">Practice Settings</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Max Clients Per Day</Label>
                <Input type="number" min={1} max={100} placeholder="e.g. 10"
                  value={prefData.maxPatientsPerDay}
                  onChange={(e) => setPrefDraft(p => ({ ...(p ?? prefData), maxPatientsPerDay: e.target.value }))}
                  data-testid="input-pref-max-patients" />
              </div>
              <div className="space-y-1.5">
                <Label>Preferred Contact Method</Label>
                <Select value={prefData.preferredContactMethod}
                  onValueChange={(v) => setPrefDraft(p => ({ ...(p ?? prefData), preferredContactMethod: v }))}>
                  <SelectTrigger data-testid="select-pref-contact"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Emergency Contact Number</Label>
              <Input placeholder="+36 …" value={prefData.emergencyContact}
                onChange={(e) => setPrefDraft(p => ({ ...(p ?? prefData), emergencyContact: e.target.value }))}
                data-testid="input-pref-emergency-contact" />
            </div>

            <div className="space-y-2">
              <Label>Payment Methods Accepted</Label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHOD_OPTIONS.map(opt => {
                  const checked = prefData.paymentMethods.includes(opt.value);
                  return (
                    <button key={opt.value} type="button"
                      onClick={() => {
                        const next = checked ? prefData.paymentMethods.filter((v: string) => v !== opt.value) : [...prefData.paymentMethods, opt.value];
                        setPrefDraft(p => ({ ...(p ?? prefData), paymentMethods: next }));
                      }}
                      className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border text-sm font-medium transition-all text-left ${checked ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:border-primary/40"}`}
                      data-testid={`button-pref-payment-${opt.value}`}>
                      <div className={`w-4 h-4 rounded-[4px] border flex items-center justify-center flex-shrink-0 ${checked ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                        {checked && <CheckCircle className="w-3 h-3 text-white" />}
                      </div>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={`flex items-center gap-3 p-4 rounded-xl border transition-colors cursor-pointer ${prefData.onCallAvailability ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              onClick={() => setPrefDraft(p => ({ ...(p ?? prefData), onCallAvailability: !prefData.onCallAvailability }))}
              data-testid="toggle-pref-oncall">
              <Checkbox checked={prefData.onCallAvailability} onCheckedChange={() => {}} />
              <div>
                <p className="text-sm font-medium">On-call Availability</p>
                <p className="text-xs text-muted-foreground">Available for emergency or after-hours calls</p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button size="sm" disabled={savePreferencesMutation.isPending || !prefDraft}
                onClick={() => savePreferencesMutation.mutate({
                  paymentMethods: prefData.paymentMethods,
                  preferredContactMethod: prefData.preferredContactMethod,
                  onCallAvailability: prefData.onCallAvailability,
                  maxPatientsPerDay: prefData.maxPatientsPerDay ? Number(prefData.maxPatientsPerDay) : undefined,
                  emergencyContact: prefData.emergencyContact,
                })}
                data-testid="button-save-preferences">
                {savePreferencesMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Save Practice Settings
              </Button>
            </div>
          </div>

          <Separator />

          {/* Notifications */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Notifications</p>
            {[
              { icon: Mail, label: "Email", desc: "Appointment confirmations and reminders", key: "emailEnabled", cap: commsCaps?.email, capLabel: "(not configured)", checked: notifPrefs?.emailEnabled !== false },
              { icon: MessageSquare, label: "SMS", desc: "Text message alerts", key: "smsEnabled", cap: commsCaps?.sms, capLabel: "(not configured)", checked: !!notifPrefs?.smsEnabled },
              { icon: MessageSquare, label: "WhatsApp", desc: "WhatsApp notifications", key: "whatsappEnabled", cap: commsCaps?.whatsapp, capLabel: "(not configured)", checked: !!notifPrefs?.whatsappEnabled },
              { icon: Monitor, label: "In-App", desc: "Notifications inside the platform", key: "inAppEnabled", cap: true, capLabel: "", checked: notifPrefs?.inAppEnabled !== false },
            ].map(({ icon: Icon, label, desc, key, cap, capLabel, checked }) => (
              <div key={key}>
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-start gap-3">
                    <Icon className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc} {cap === false && capLabel}</p>
                    </div>
                  </div>
                  <Switch data-testid={`switch-provider-${key}`} checked={checked} disabled={cap === false}
                    onCheckedChange={(c) => updateNotifPrefs.mutate({ [key]: c })} />
                </div>
                <Separator />
              </div>
            ))}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-start gap-3">
                <Smartphone className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Browser Push</p>
                  <p className="text-xs text-muted-foreground">
                    {pushCap.supported ? (pushCap.configured ? "Real-time push alerts" : "(push not configured on server)") : "(not supported in this browser)"}
                  </p>
                </div>
              </div>
              <Switch data-testid="switch-provider-push" checked={pushSubscribed}
                disabled={!pushCap.supported || !pushCap.configured} onCheckedChange={togglePush} />
            </div>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">Quiet Hours</p>
              <p className="text-xs text-muted-foreground">No notifications will be sent during these hours</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="provQhStart" className="text-xs">From</Label>
                  <Input id="provQhStart" type="time" data-testid="input-provider-quiet-start"
                    defaultValue={notifPrefs?.quietHoursStart || ""}
                    onBlur={(e) => updateNotifPrefs.mutate({ quietHoursStart: e.target.value || null })} />
                </div>
                <div>
                  <Label htmlFor="provQhEnd" className="text-xs">To</Label>
                  <Input id="provQhEnd" type="time" data-testid="input-provider-quiet-end"
                    defaultValue={notifPrefs?.quietHoursEnd || ""}
                    onBlur={(e) => updateNotifPrefs.mutate({ quietHoursEnd: e.target.value || null })} />
                </div>
              </div>
            </div>
          </div>
        </SectionErrorBoundary>

        <Separator />

        {/* Account Security */}
        <div className="space-y-4">
          <p className="text-sm font-semibold flex items-center gap-2"><Lock className="h-4 w-4 text-primary" />Account Security</p>
          <p className="text-xs text-muted-foreground">Choose a strong password of at least 8 characters.</p>
          <form onSubmit={handlePasswordSubmit} className="space-y-3">
            {(["currentPassword", "newPassword", "confirmPassword"] as const).map((field) => {
              const labels = { currentPassword: "Current Password", newPassword: "New Password", confirmPassword: "Confirm New Password" };
              const ids = { currentPassword: "input-current-password", newPassword: "input-new-password", confirmPassword: "input-confirm-password" };
              const showKey = field === "currentPassword" ? "current" : field === "newPassword" ? "new" : "confirm";
              return (
                <div key={field} className="space-y-1.5">
                  <Label htmlFor={field}>{labels[field]}</Label>
                  <div className="relative">
                    <Input id={field} type={showPasswords[showKey] ? "text" : "password"}
                      value={passwordForm[field]}
                      onChange={(e) => setPasswordForm(f => ({ ...f, [field]: e.target.value }))}
                      className="pr-10" data-testid={ids[field]} />
                    <button type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPasswords(s => ({ ...s, [showKey]: !s[showKey] }))}>
                      {showPasswords[showKey] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="flex justify-end pt-1">
              <Button type="submit" size="sm"
                disabled={changePasswordMutation.isPending || !passwordForm.currentPassword || !passwordForm.newPassword}
                data-testid="button-change-password">
                {changePasswordMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Change Password
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {!!isUnderReview && activeSection !== "overview" && <ReviewBanner />}

      {activeSection === "overview" && (
        <OverviewPanel
          provider={provider}
          user={user}
          locked={complianceLocked}
          onNavigate={(s) => navigate?.(s)}
        />
      )}
      {activeSection === "personal" && renderPersonal()}
      {activeSection === "professional" && renderProfessional()}
      {activeSection === "workplace" && renderWorkplace()}
      {activeSection === "services" && renderServices()}
      {activeSection === "verification" && renderVerification()}
      {activeSection === "settings" && renderSettings()}
    </div>
  );
}
