import { formatDateTime } from "@/lib/datetime";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAdminCurrency, formatInCurrency } from "@/lib/currency";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, docStatusTextClass } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Search, Shield, ShieldCheck, ShieldAlert, Star, AlertCircle,
  CheckCircle, XCircle, Clock, Loader2, User as UserIcon, Building,
  Briefcase, Stethoscope, UserCheck, Globe, MapPin, Phone, Mail,
  Calendar, DollarSign, FileText, Users, Activity, TrendingUp,
  RefreshCw, Send, Lock, Bell, Eye, Download, AlertTriangle,
  CheckCheck, Ban, Play, Pause, Settings, ChevronRight, Filter,
  Package, BarChart3, Wallet, Receipt, TimerOff, Flag, Hash,
  Languages, ClipboardList, FileImage, ExternalLink, MoreVertical,
  Heart, CreditCard, Home, BookOpen, Banknote, Coffee, Trash2,
  RotateCcw, CalendarDays, AlarmClock, Info, EyeOff,
} from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";
import i18n from "@/lib/i18n";
import { Switch } from "@/components/ui/switch";

function formatAdminDate(value: string | Date, mode: "monthYear" | "date" | "dateTime") {
  const options: Intl.DateTimeFormatOptions = mode === "monthYear"
    ? { month: "short", year: "numeric" }
    : mode === "dateTime"
      ? { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }
      : { month: "short", day: "numeric", year: "numeric" };
  return new Intl.DateTimeFormat(i18n.language, options).format(new Date(value));
}
import { LayoutGrid } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


// ─── Types ────────────────────────────────────────────────────────────────────
interface ProviderListItem {
  id: string;
  providerType: string;
  /** Human-readable title the provider chose (e.g. "Clinical Dietitian"). camelCase from Drizzle path. */
  displayTitle?: string;
  /** Same field, snake_case, from the raw-SQL FTS path. */
  display_title?: string;
  /** Provider's chosen category label (e.g. "Nutrition, Dietetics & Metabolic Wellness"). */
  providerCategory?: string;
  provider_category?: string;
  status: string;
  isVerified: boolean;
  isActive: boolean;
  rating: string | null;
  countryCode: string;
  riskScore?: number;
  bookingsEnabled?: boolean;
  city?: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl?: string;
    isSuspended?: boolean;
    createdAt?: string;
    lastOtpSentAt?: string;
  };
}

interface ConsoleData {
  provider: any;
  user: any;
  services: any[];
  practitioners: any[];
  documents: any[];
  appointments: {
    total: number; completed: number; cancelled: number; active: number;
    recent: any[]; cancellationRate: number;
  };
  financials: { revenueUsd: string; walletBalance: string; walletCurrency: string };
  metrics: {
    servicesCount: number; staffCount: number; pendingDocs: number;
    approvedDocs: number; totalDocs: number; verificationPct: number; computedRisk: number;
  };
  timeline: any[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function riskLabel(score: number) {
  if (score >= 75) return { label: "Critical", color: "bg-red-100 text-red-700 border-red-200" };
  if (score >= 50) return { label: "High", color: "bg-orange-100 text-orange-700 border-orange-200" };
  if (score >= 25) return { label: "Medium", color: "bg-yellow-100 text-yellow-700 border-yellow-200" };
  return { label: "Low", color: "bg-green-100 text-green-700 border-green-200" };
}

/** P6: Convert raw enum / snake_case values to human-readable labels. */
const ENUM_LABEL_MAP: Record<string, string> = {
  // Visit / location modes
  clinic_visit:        "Clinic Visit",
  home_visit:          "Home Visit",
  telemedicine:        "Online Consultation",
  clinic_only:         "Clinic Only",
  home_only:           "Home Visit Only",
  both:                "Clinic & Home Visit",
  all:                 "All Modes",
  // Account / practice types
  individual:          "Individual Practice",
  individual_practice: "Individual Practice",
  clinic:              "Clinic",
  hospital:            "Hospital",
  // Provider types
  physician:           "Medical Doctor & Specialist",
  mental_health:       "Mental Health & Behavioral",
  nutrition:           "Nutrition & Dietetics",
  rehabilitation:      "Physical Therapy & Rehab",
  dental:              "Dental Care",
  alternative_medicine:"Alternative & Holistic Medicine",
  nursing:             "Maternal, Nursing & Allied",
  // Countries
  HU:                  "Hungary",
  IR:                  "Iran",
  // Currencies
  USD:                 "US Dollar (USD)",
  HUF:                 "Hungarian Forint (HUF)",
  IRR:                 "Iranian Rial (IRR)",
  EUR:                 "Euro (EUR)",
  // Status
  approved:            "Approved",
  active:              "Active",
  pending:             "Pending",
  submitted:           "Submitted",
  under_review:        "Under Review",
  documents_verified:  "Documents Verified",
  action_required:     "Action Required",
  suspended:           "Suspended",
  deactivated:         "Deactivated",
  rejected:            "Rejected",
  // Days
  "0":                 "Sunday",
  "1":                 "Monday",
  "2":                 "Tuesday",
  "3":                 "Wednesday",
  "4":                 "Thursday",
  "5":                 "Friday",
  "6":                 "Saturday",
};

function humanLabel(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  const key = String(val);
  if (ENUM_LABEL_MAP[key]) return ENUM_LABEL_MAP[key];
  // Fallback: replace underscores, title-case
  return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/** Return the native currency code for a country code. */
function currencyForCountry(cc: string | null | undefined): string {
  if (cc === "HU") return "HUF";
  if (cc === "IR") return "IRR";
  return "USD";
}

/** Format a service price using its stored currency. P5 fix. */
function fmtSvcPrice(amount: number | string | null | undefined, currency: string | null | undefined): string {
  return formatInCurrency(Number(amount ?? 0), currency || "USD");
}


function providerName(p: ProviderListItem) {
  return `${p.user?.firstName || ""} ${p.user?.lastName || ""}`.trim() || "—";
}

/** Returns the best human-readable title for a provider list item.
 *  Priority: displayTitle (camelCase Drizzle) → display_title (snake FTS) → providerCategory → providerType */
function providerLabel(p: ProviderListItem): string {
  return p.displayTitle || p.display_title || p.providerCategory || p.provider_category || p.providerType || "—";
}

function typeIcon(type: string) {
  if (type === "physician") return Stethoscope;
  if (type === "nursing") return UserCheck;
  if (type === "mental_health" || type === "rehabilitation") return Activity;
  return Briefcase;
}

// ── Document placeholders — single source of truth for criticality ────────────
// Criticality: mandatory = required for approval | compliance-required = required for some workflows | optional
// Mandatory KYC set: id_card, address_proof, medical_license (per server/lib/verification.ts MANDATORY_DOC_TYPES)
// insurance is NOT mandatory — optional per spec
const DOC_PLACEHOLDERS = [
  { type: "medical_license",          label: "Medical / Professional Practising Licence",  criticality: "mandatory",            expiryRequired: "yes"   },
  { type: "degree",                   label: "Primary Medical Degree / Professional Qualification", criticality: "mandatory",   expiryRequired: "no"    },
  { type: "id_card",                  label: "Government-Issued Photo Identification",     criticality: "mandatory",            expiryRequired: "maybe" },
  { type: "address_proof",            label: "Proof of Residential Address",               criticality: "mandatory",            expiryRequired: "no"    },
  { type: "insurance",                label: "Professional Indemnity / Malpractice Insurance", criticality: "optional",         expiryRequired: "yes"   },
  { type: "specialization_certificate",label:"Specialisation / Board Certification",       criticality: "optional",             expiryRequired: "maybe" },
  { type: "certificate_of_good_standing",label:"Certificate of Good Standing",            criticality: "optional",             expiryRequired: "yes"   },
  { type: "facility_operating_license",label:"Healthcare Facility Operating Licence",     criticality: "compliance-required",  expiryRequired: "yes"   },
  { type: "business_registration",    label: "Business Registration Certificate / Trade Licence", criticality: "compliance-required", expiryRequired: "yes" },
  { type: "tax_identification",       label: "Tax Identification Number (TIN) Proof",     criticality: "optional",             expiryRequired: "no"    },
  { type: "police_clearance",         label: "Police Clearance Certificate",               criticality: "optional",             expiryRequired: "maybe" },
  { type: "professional_certificate", label: "Professional Certificate",                  criticality: "compliance-required",  expiryRequired: "maybe" },
  { type: "education_certificate",    label: "Education / Qualification Certificate",      criticality: "optional",             expiryRequired: "no"    },
  { type: "membership",               label: "Professional Membership Certificate",        criticality: "optional",             expiryRequired: "maybe" },
  { type: "other",                    label: "Additional Document",                        criticality: "optional",             expiryRequired: "maybe" },
];

// ─── Schedule Tab (P2) — lazy-fetches from dedicated endpoint ────────────────
function ScheduleTab({ providerId }: { providerId: string }) {
  const { t } = useTranslation();
  const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  const { data, isLoading, isError } = useQuery<{
    officeHours: any | null;
    scheduleTemplates: any[];
    timeOff: any[];
    exceptions: any[];
  }>({
    queryKey: ["/api/admin/providers", providerId, "schedule"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/providers/${providerId}/schedule`);
      if (!r.ok) throw new Error("Failed to load schedule");
      return r.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) return (
    <div className="p-5 space-y-3">
      {[1,2,3].map(i => <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />)}
    </div>
  );
  if (isError || !data) return (
    <div className="p-5 text-center text-slate-400 text-sm">
      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-slate-300" />
      {t("admin_tools.ops.schedule_load_failed", "Could not load schedule data")}
    </div>
  );

  const { officeHours, scheduleTemplates, timeOff, exceptions } = data;
  const weeklySchedule: Record<string, any> = officeHours?.weekly_schedule
    ? (typeof officeHours.weekly_schedule === "string" ? JSON.parse(officeHours.weekly_schedule) : officeHours.weekly_schedule)
    : {};

  // Group templates by day
  const templatesByDay: Record<number, any[]> = {};
  for (const t of (scheduleTemplates || [])) {
    const d = Number(t.day_of_week);
    if (!templatesByDay[d]) templatesByDay[d] = [];
    templatesByDay[d].push(t);
  }

  return (
    <div className="p-5 space-y-6">
      {/* Section A: Weekly Schedule */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t("admin_tools.ops.weekly_schedule", "Weekly Schedule")}</h3>
          {!officeHours && <span className="text-xs text-slate-400">({t("admin_tools.ops.no_office_hours", "no office hours set")})</span>}
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {[1,2,3,4,5,6,0].map((dayNum) => {
            const dayKey = ["sun","mon","tue","wed","thu","fri","sat"][dayNum];
            const ws = weeklySchedule[dayKey] || weeklySchedule[DAY_NAMES[dayNum].toLowerCase()] || null;
            const tmpl = templatesByDay[dayNum] || [];
            const enabled = ws?.enabled !== false && (ws?.start || tmpl.length > 0);
            return (
              <div key={dayNum} className={`flex items-center gap-4 px-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0 ${!enabled ? "opacity-50" : ""}`}>
                <div className="w-24 flex-shrink-0">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{DAY_NAMES[dayNum]}</span>
                </div>
                {enabled ? (
                  <div className="flex-1 flex items-center gap-3 flex-wrap">
                    {ws?.start && ws?.end && (
                      <span className="text-xs bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-900 font-mono">
                        {ws.start}–{ws.end}
                      </span>
                    )}
                    {tmpl.length > 0 && tmpl.map((t, i) => (
                      <span key={i} className={`text-xs px-2 py-0.5 rounded border font-mono ${t.is_active ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-900" : "bg-slate-50 text-slate-500 border-slate-200 line-through"}`}>
                        {t.start_time}–{t.end_time}
                        {t.modality && ` (${humanLabel(t.modality)})`}
                      </span>
                    ))}
                    {ws?.breaks?.length > 0 && (
                      <span className="text-xs text-slate-400">Breaks: {ws.breaks.map((b: any) => `${b.start}–${b.end}`).join(", ")}</span>
                    )}
                    {tmpl[0]?.max_patients_per_day && (
                      <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                        <Users className="h-2.5 w-2.5" />{tmpl[0].max_patients_per_day} max/day
                      </span>
                    )}
                    {tmpl[0]?.slot_duration_mins && (
                      <span className="text-[10px] text-slate-400">{tmpl[0].slot_duration_mins}min slots</span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">{t("admin_tools.ops.not_available", "Not available")}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Section B: Schedule Templates (full list) */}
      {scheduleTemplates.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-purple-500" />
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t("admin_tools.ops.schedule_templates", "Schedule Templates")} ({scheduleTemplates.length})</h3>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {scheduleTemplates.map((t: any) => (
              <div key={t.id} className="flex items-center gap-4 px-4 py-2.5">
                <span className="w-20 text-xs font-medium text-slate-700 dark:text-slate-300 flex-shrink-0">{DAY_NAMES[t.day_of_week]}</span>
                <span className="text-xs font-mono text-slate-600 dark:text-slate-400 flex-shrink-0">{t.start_time}–{t.end_time}</span>
                {t.modality && <Badge variant="outline" className="text-[10px]">{humanLabel(t.modality)}</Badge>}
                {!t.is_active && <Badge variant="outline" className="text-[10px] text-slate-400">{t("admin_tools.ops.inactive", "Inactive")}</Badge>}
                <div className="flex-1" />
                <div className="flex items-center gap-3 text-[10px] text-slate-400 flex-wrap">
                  {t.slot_duration_mins && <span>{t.slot_duration_mins}min slots</span>}
                  {t.buffer_before_mins > 0 && <span>Buffer {t.buffer_before_mins}m before</span>}
                  {t.buffer_after_mins > 0 && <span>{t.buffer_after_mins}m after</span>}
                  {t.max_patients_per_day && <span><Users className="h-2.5 w-2.5 inline mr-0.5" />{t.max_patients_per_day}/day</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section C: Time Off */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <AlarmClock className="h-4 w-4 text-orange-500" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t("admin_tools.ops.scheduled_time_off", "Scheduled Time Off")}
          </h3>
              <span className="text-xs text-slate-400">({timeOff.length} {t("admin_extra.provider.entries", "entries")})</span>
        </div>
        {timeOff.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">{t("admin_tools.ops.no_time_off", "No time-off periods scheduled")}</p>
        ) : (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {timeOff.map((t: any) => (
              <div key={t.id} className="flex items-center gap-4 px-4 py-2.5">
                <span className="text-xs font-mono text-slate-700 dark:text-slate-300 flex-shrink-0">{t.start_date} → {t.end_date}</span>
                {t.reason && <span className="text-xs text-slate-500 truncate">{t.reason}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section D: Availability Exceptions */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-red-500" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t("admin_tools.ops.schedule_overrides", "Schedule Overrides / Blocked Dates")}
          </h3>
           <span className="text-xs text-slate-400">({exceptions.length} {t("admin_extra.provider.entries", "entries")})</span>
        </div>
        {exceptions.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">{t("admin_tools.ops.no_blocked_dates", "No blocked dates")}</p>
        ) : (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {exceptions.map((ex: any) => (
              <div key={ex.id} className="flex items-center gap-4 px-4 py-2.5">
                <span className="text-xs font-mono text-slate-700 dark:text-slate-300 flex-shrink-0">{ex.date}</span>
                {ex.reason && <span className="text-xs text-slate-500 truncate">{ex.reason}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Left Panel: Provider Directory ─────────────────────────────────────────
function ProviderDirectory({
  providers,
  selectedId,
  onSelect,
}: {
  providers: ProviderListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const d = (key: string, fallback: string, options?: Record<string, unknown>) => {
    const existing = String(t(`admin_tools.ops.${key}`, { defaultValue: "" }));
    return String(t(`admin_extra.provider.${key}`, { defaultValue: existing || fallback, ...options }));
  };
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    return providers.filter((p) => {
      if (statusFilter !== "all") {
        const normalized = (p.status === "approved" || p.status === "active") ? "approved"
          : (p.status === "submitted" || p.status === "pending_approval" || p.status === "pending") ? "submitted"
          : (p.status === "under_review" || p.status === "documents_verified") ? "under_review"
          : p.status;
        if (normalized !== statusFilter) return false;
      }
      if (typeFilter !== "all" && p.providerType !== typeFilter) return false;
      if (countryFilter !== "all" && p.countryCode !== countryFilter) return false;
      if (riskFilter !== "all") {
        const score = p.riskScore || 0;
        if (riskFilter === "critical" && score < 75) return false;
        if (riskFilter === "high" && (score < 50 || score >= 75)) return false;
        if (riskFilter === "medium" && (score < 25 || score >= 50)) return false;
        if (riskFilter === "low" && score >= 25) return false;
      }
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        providerName(p).toLowerCase().includes(q) ||
        (p.user?.email || "").toLowerCase().includes(q) ||
        (p.city || "").toLowerCase().includes(q) ||
        (p.id || "").toLowerCase().includes(q)
      );
    });
  }, [providers, search, statusFilter, typeFilter, countryFilter, riskFilter]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
            {t("admin.providers")} <span className="text-slate-400 font-normal">({filtered.length})</span>
          </h2>
          <Button size="sm" variant="ghost" onClick={() => setShowFilters(!showFilters)} className="h-7 w-7 p-0">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute start-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder={t("admin.search_providers")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        {showFilters && (
          <div className="space-y-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
               <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={t("admin.status")} /></SelectTrigger>
              <SelectContent>
                 <SelectItem value="all">{t("admin.all_statuses")}</SelectItem>
                 <SelectItem value="approved">{d("approved", "Approved")}</SelectItem>
                 <SelectItem value="submitted">{d("submitted", "Submitted")}</SelectItem>
                 <SelectItem value="under_review">{d("under_review", "Under Review")}</SelectItem>
                 <SelectItem value="action_required">{d("action_required", "Action Required")}</SelectItem>
                 <SelectItem value="suspended">{d("suspended", "Suspended")}</SelectItem>
                 <SelectItem value="deactivated">{d("deactivated", "Deactivated")}</SelectItem>
                 <SelectItem value="draft">{d("draft", "Draft")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
               <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={d("type", "Type")} /></SelectTrigger>
              <SelectContent>
                 <SelectItem value="all">{d("all_types", "All types")}</SelectItem>
                 <SelectItem value="physician">{d("physician", "Medical Doctors & Specialists")}</SelectItem>
                 <SelectItem value="mental_health">{d("mental_health", "Mental Health & Behavioral")}</SelectItem>
                 <SelectItem value="nutrition">{d("nutrition", "Nutrition & Dietetics")}</SelectItem>
                 <SelectItem value="rehabilitation">{d("rehabilitation", "Physical Therapy & Rehab")}</SelectItem>
                 <SelectItem value="dental">{d("dental", "Dental Care")}</SelectItem>
                 <SelectItem value="alternative_medicine">{d("alternative_medicine", "Alternative & Holistic")}</SelectItem>
                 <SelectItem value="nursing">{d("nursing", "Maternal, Nursing & Allied")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={countryFilter} onValueChange={setCountryFilter}>
               <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={t("admin.country")} /></SelectTrigger>
              <SelectContent>
                 <SelectItem value="all">{t("admin.all_countries")}</SelectItem>
                 <SelectItem value="HU">{d("hungary", "Hungary")}</SelectItem>
                 <SelectItem value="IR">{d("iran", "Iran")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={riskFilter} onValueChange={setRiskFilter}>
               <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={d("risk", "Risk")} /></SelectTrigger>
              <SelectContent>
                 <SelectItem value="all">{d("all_risk_levels", "All risk levels")}</SelectItem>
                 <SelectItem value="low">{d("low_risk", "Low risk")}</SelectItem>
                 <SelectItem value="medium">{d("medium_risk", "Medium risk")}</SelectItem>
                 <SelectItem value="high">{d("high_risk", "High risk")}</SelectItem>
                 <SelectItem value="critical">{d("critical_risk", "Critical risk")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-slate-400 text-sm">{t("admin.no_providers_match")}</div>
          )}
          {filtered.map((p) => {
            const Icon = typeIcon(p.providerType);
            const risk = riskLabel(p.riskScore || 0);
            const isSelected = selectedId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className={`w-full text-left px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-950/30 border-r-2 border-blue-500" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9 flex-shrink-0">
                    <AvatarImage src={p.user?.avatarUrl || ""} />
                    <AvatarFallback className="text-xs font-medium bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900 text-blue-700 dark:text-blue-300">
                      {(p.user?.firstName?.[0] || "?")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {providerName(p)}
                      </span>
                      {p.isVerified && <ShieldCheck className="h-3 w-3 text-blue-500 flex-shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StatusBadge status={p.status} domain="provider" className="text-[10px] px-1.5 py-0.5" />
                      <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                        <Icon className="h-2.5 w-2.5" />{providerLabel(p)}
                      </span>
                      {(p.riskScore || 0) >= 25 && (
                        <span className={`text-[10px] px-1 py-0.5 rounded border font-medium ${risk.color}`}>
                          {risk.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-slate-400">{p.countryCode}</span>
                      {p.user?.isSuspended && (
                         <span className="text-[10px] text-red-500 font-medium">{d("suspended", "Suspended")}</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className={`h-3.5 w-3.5 text-slate-300 flex-shrink-0 ${isSelected ? "text-blue-400" : ""}`} />
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Document Row ─────────────────────────────────────────────────────────────
function DocumentRow({
  doc, placeholder, onReload, providerId,
}: {
  doc: any | null;
  placeholder: any;
  onReload: () => void;
  providerId?: string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteInput, setNoteInput] = useState("");

  const status = doc?.verificationStatus || "missing";
  const daysLeft = doc?.expiryDate ? differenceInDays(parseISO(doc.expiryDate), new Date()) : null;
  const isExpiringSoon = daysLeft !== null && daysLeft <= 30 && daysLeft > 0 && status !== "expired";

  const STATUS_LABEL: Record<string, string> = {
    pending:           "Pending",
    under_review:      "Under Review",
    approved:          "Approved",
    rejected:          "Rejected",
    reupload_required: "Re-upload Required",
    expired:           "Expired",
    expiring_soon:     "Expiring Soon",
    missing:           "Not Uploaded",
  };
  const LEGACY_LABEL_MAP: Record<string, string> = {
    pending_review:       "under_review",
    reupload_requested:   "reupload_required",
    verification_pending: "under_review",
  };

  const criticality = doc?.documentCriticality || placeholder.criticality;
  const canonicalStatus = LEGACY_LABEL_MAP[status ?? ""] ?? status;

  const reuploadMutation = useMutation({
    mutationFn: async ({ docId, note }: { docId: string; note: string }) => {
      const r = await apiRequest("PATCH", `/api/admin/provider-documents/${docId}/extended`, {
        verificationStatus: "reupload_required",
        adminNote: note.trim() || "Please re-upload this document.",
      });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      toast({ title: t("admin_tools.ops.reupload_requested", "Re-upload requested — provider notified on next page load") });
      setShowNoteForm(false);
      setNoteInput("");
      onReload();
    },
    onError: () => toast({ title: t("admin_tools.ops.reupload_failed", "Failed to request re-upload"), variant: "destructive" }),
  });

  const reminderMutation = useMutation({
    mutationFn: async () => {
      if (!providerId) throw new Error(t("admin_tools.ops.no_provider", "No provider"));
      const body = isExpiringSoon
        ? `Your ${placeholder.label} is expiring in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Please upload a renewed copy to stay compliant.`
        : `Your ${placeholder.label} has expired. Please upload a current, valid copy to restore your compliance status.`;
      const r = await apiRequest("POST", `/api/admin/providers/${providerId}/actions`, {
        action: "send_notification",
        notificationTitle: "Document Renewal Required",
        notificationBody: body,
      });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => toast({ title: t("admin_tools.ops.renewal_sent", "Renewal reminder sent to provider") }),
    onError: () => toast({ title: t("admin_tools.ops.reminder_failed", "Failed to send reminder"), variant: "destructive" }),
  });

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${
      canonicalStatus === "approved" ? "border-green-200 dark:border-green-900/40 bg-green-50/30 dark:bg-green-950/10"
      : status === "expired" ? "border-red-200 dark:border-red-900/40 bg-red-50/30 dark:bg-red-950/10"
      : isExpiringSoon ? "border-amber-200 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/10"
      : (["rejected", "reupload_required"].includes(canonicalStatus)) ? "border-orange-200 dark:border-orange-900/40 bg-orange-50/20 dark:bg-orange-950/10"
      : status === "missing" ? "border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30"
      : "border-slate-200 dark:border-slate-700"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <FileText className={`h-4 w-4 flex-shrink-0 mt-0.5 ${docStatusTextClass(isExpiringSoon ? "expiring_soon" : status)}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{placeholder.label}</p>
            {doc ? (
              <div className="space-y-0.5 mt-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-medium ${docStatusTextClass(isExpiringSoon ? "expiring_soon" : status)}`}>
                    {String(t(`admin_tools.review.status.${canonicalStatus}`, STATUS_LABEL[status] || status))}
                    {isExpiringSoon && ` · ${t("admin_tools.expiry.days_left", "{{count}}d left", { count: daysLeft })}`}
                  </span>
                  {doc.expiryDate && (
                    <span className="text-xs text-slate-400">{t("admin_tools.ops.expires", "Expires")}: {doc.expiryDate}</span>
                  )}
                </div>
                {status === "approved" && doc.verifiedAt && (
                  <p className="text-xs text-slate-400">
                    {t("admin_tools.ops.verified", "Verified")} {formatAdminDate(doc.verifiedAt, "date")}
                    {doc.verifiedBy && <span className="ml-1">{t("admin_tools.ops.by_admin", "by admin")}</span>}
                  </p>
                )}
                {doc.adminNote && (
                  <p className="text-xs text-slate-500 italic truncate">{t("admin_tools.review.note", "Note")}: {doc.adminNote}</p>
                )}
                {doc.createdAt && (
                  <p className="text-xs text-slate-400">
                          {t("admin_tools.ops.uploaded", "Uploaded")} {formatAdminDate(doc.createdAt, "date")}
                    {doc.fileName && ` · ${doc.fileName}`}
                  </p>
                )}
              </div>
            ) : (
              <span className="text-xs text-slate-400">{t("admin_extra.provider.not_uploaded", "Not uploaded")}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
            criticality === "mandatory" ? "border-red-200 text-red-600 bg-red-50"
            : criticality === "compliance-required" ? "border-purple-200 text-purple-600 bg-purple-50"
            : "border-slate-200 text-slate-500"}`}>
            {String(t(`admin_tools.ops.criticality.${criticality}`, criticality))}
          </span>
          {doc && (
            <>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" asChild>
                <a href={doc.documentUrl} target="_blank" rel="noreferrer"><Eye className="h-3 w-3" /></a>
              </Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" asChild>
                <a href={doc.documentUrl} download><Download className="h-3 w-3" /></a>
              </Button>
              {/* Send renewal reminder — expiring or expired docs */}
              {providerId && (status === "expired" || isExpiringSoon) && (
                <Button
                  size="sm" variant="ghost"
                  className={`h-6 px-1.5 text-[10px] ${isExpiringSoon ? "text-amber-600 hover:bg-amber-50" : "text-red-600 hover:bg-red-50"}`}
                  onClick={() => reminderMutation.mutate()}
                  disabled={reminderMutation.isPending}
                  title={isExpiringSoon ? t("admin_tools.ops.send_expiry_reminder", "Send expiry reminder ({{count}}d left)", { count: daysLeft }) : t("admin_tools.ops.send_expired_reminder", "Send expired document reminder")}
                >
                  {reminderMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />}
                </Button>
              )}
              {/* Request re-upload */}
              {canonicalStatus !== "reupload_required" && (
                <Button
                  size="sm" variant="ghost"
                  className="h-6 px-1.5 text-[10px] text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                  onClick={() => setShowNoteForm(v => !v)}
                  title={t("admin_tools.review.request_reupload", "Request re-upload")}
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Per-document re-upload request form */}
      {doc && showNoteForm && (
        <div className="rounded-md bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 p-2.5 space-y-2">
          <p className="text-[11px] font-semibold text-orange-800 dark:text-orange-300">{t("admin_tools.expiry.request_reupload", "Request Re-upload")}</p>
          <Input
            placeholder={t("admin_tools.ops.reupload_reason_placeholder", "Reason (e.g. image too blurry, document expired)")}
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            className="h-7 text-xs"
          />
          <div className="flex gap-1.5">
            <Button
              size="sm" className="h-7 text-xs bg-orange-600 hover:bg-orange-700"
              onClick={() => reuploadMutation.mutate({ docId: doc.id, note: noteInput })}
              disabled={reuploadMutation.isPending}
            >
              {reuploadMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              {t("common.confirm", "Confirm")}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowNoteForm(false)}>{t("common.cancel", "Cancel")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Request Documents Dialog ─────────────────────────────────────────────────
function RequestDocumentsDialog({
  providerId,
  open,
  onOpenChange,
  onSuccess,
}: {
  providerId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [dialogReason, setDialogReason] = useState("");

  function toggle(type: string) {
    setSelected(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/providers/${providerId}/actions`, {
        action: "request_documents",
        documentTypes: selected,
        reason: dialogReason.trim() || undefined,
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: t("admin_tools.ops.document_request_sent", "Document request sent — provider will see flagged documents") });
      onOpenChange(false);
      setSelected([]);
      setDialogReason("");
      onSuccess();
    },
    onError: () => toast({ title: t("admin_tools.ops.request_failed", "Failed to send request"), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) { setSelected([]); setDialogReason(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("admin_tools.ops.request_documents", "Request Documents")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("admin_tools.ops.select_documents", "Select which documents to request")}</p>
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {DOC_PLACEHOLDERS.map(ph => (
                <label key={ph.type} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(ph.type)}
                    onChange={() => toggle(ph.type)}
                    className="h-3.5 w-3.5 rounded accent-blue-600"
                  />
                  <span className="text-sm flex-1">{ph.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium flex-shrink-0 ${
                    ph.criticality === "mandatory" ? "border-red-200 text-red-600 bg-red-50"
                    : ph.criticality === "compliance-required" ? "border-purple-200 text-purple-600 bg-purple-50"
                    : "border-slate-200 text-slate-500 bg-white"}`}>
                    {ph.criticality === "mandatory" ? t("admin_tools.ops.required", "Required")
                      : ph.criticality === "compliance-required" ? t("admin_tools.ops.compliance", "Compliance")
                      : t("admin_tools.ops.optional", "Optional")}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("admin_tools.ops.reason_note", "Reason / admin note (optional)")}</Label>
            <Textarea
              placeholder={t("admin_tools.ops.document_reason_placeholder", "e.g. Document quality too low — please re-upload a clear, legible copy.")}
              value={dialogReason}
              onChange={e => setDialogReason(e.target.value)}
              className="min-h-[70px] text-xs resize-none"
            />
            <p className="text-[11px] text-slate-400">{t("admin_tools.ops.document_reason_desc", "This note will be shown to the provider next to each flagged document.")}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button
            size="sm"
            disabled={selected.length === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            {t("admin_tools.ops.request_count", "Request {{count}} document(s)", { count: selected.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Category Permissions Tab ────────────────────────────────────────────────
function CategoryPermissionsTab({ providerId }: { providerId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const qKey = [`/api/admin/providers/${providerId}/category-permissions`];

  const { data, isLoading } = useQuery<{ permissions: any[]; allCategories: any[] }>({
    queryKey: qKey,
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/providers/${providerId}/category-permissions`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const allCategories: any[] = data?.allCategories ?? [];
  const permissions: any[] = data?.permissions ?? [];

  // draft: categoryId → boolean (undefined = no override yet / track from permissions)
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!data || initialized) return;
    const init: Record<string, boolean> = {};
    permissions.forEach((p) => { init[p.categoryId] = p.enabled; });
    // categories with no permission row default to true
    allCategories.forEach((c) => { if (!(c.id in init)) init[c.id] = true; });
    setDraft(init);
    setInitialized(true);
  }, [data, initialized, permissions, allCategories]);

  const overrideCount = permissions.length;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = Object.entries(draft).map(([categoryId, enabled]) => ({ categoryId, enabled }));
      const r = await apiRequest("PUT", `/api/admin/providers/${providerId}/category-permissions`, { permissions: payload });
      if (!r.ok) throw new Error("Save failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: t("admin_tools.ops.permissions_saved", "Category permissions saved") });
      queryClient.invalidateQueries({ queryKey: qKey });
      setInitialized(false);
    },
    onError: () => toast({ title: t("admin_tools.ops.save_failed", "Failed to save"), variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("DELETE", `/api/admin/providers/${providerId}/category-permissions`);
      if (!r.ok) throw new Error("Reset failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: t("admin_tools.ops.permissions_reset", "Permissions reset to defaults") });
      queryClient.invalidateQueries({ queryKey: qKey });
      setInitialized(false);
    },
    onError: () => toast({ title: t("admin_tools.ops.reset_failed", "Failed to reset"), variant: "destructive" }),
  });

  const permMap = new Map(permissions.map((p) => [p.categoryId, p]));
  const isDirty = allCategories.some((c) => {
    const orig = permMap.get(c.id);
    const origVal = orig ? orig.enabled : true;
    return draft[c.id] !== origVal;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400 text-sm gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("admin_tools.ops.loading_categories", "Loading categories…")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t("admin_tools.ops.service_category_access", "Service Category Access")}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{t("admin_tools.ops.service_category_desc", "Control which categories this provider can offer services in.")}</p>
        </div>
        <div className="flex items-center gap-2">
          {overrideCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-slate-500 hover:text-red-600"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              data-testid="button-reset-category-permissions"
            >
              {resetMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
              {t("admin_tools.ops.reset_defaults", "Reset to defaults")}
            </Button>
          )}
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !isDirty}
            data-testid="button-save-category-permissions"
          >
            {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />}
            {t("common.save", "Save")}
          </Button>
        </div>
      </div>

      {/* Status banner */}
      {overrideCount > 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-3 py-2">
          <Shield className="h-3.5 w-3.5 text-blue-500 shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            <span className="font-semibold">{t("admin_tools.ops.explicit_overrides", "{{count}} explicit override(s)", { count: overrideCount })}</span> {t("admin_tools.ops.active_for_provider", "active for this provider.")}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
          <LayoutGrid className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <p className="text-xs text-slate-500">{t("admin_tools.ops.platform_defaults", "Using platform defaults — all categories enabled.")}</p>
        </div>
      )}

      {/* Category rows */}
      {allCategories.length === 0 && (
        <div className="text-center py-10 text-slate-400 text-sm">{t("admin_tools.ops.no_categories", "No categories configured")}</div>
      )}
      <div className="space-y-1.5">
        {allCategories.map((cat) => {
          const hasOverride = permMap.has(cat.id);
          const isEnabled = draft[cat.id] ?? true;
          return (
            <div
              key={cat.id}
              className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors ${
                isEnabled
                  ? "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  : "border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 opacity-70"
              }`}
              data-testid={`row-category-${cat.id}`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`h-2 w-2 rounded-full shrink-0 ${isEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{cat.name}</p>
                  {cat.description && (
                    <p className="text-xs text-slate-400 truncate mt-0.5">{cat.description}</p>
                  )}
                </div>
                {hasOverride && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-blue-300 text-blue-600 dark:text-blue-400">
                    {t("admin_tools.ops.override", "Override")}
                  </Badge>
                )}
                {draft[cat.id] !== (hasOverride ? permMap.get(cat.id)!.enabled : true) && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-amber-400 text-amber-600 dark:text-amber-400">
                    {t("admin_tools.ops.unsaved", "Unsaved")}
                  </Badge>
                )}
              </div>
              <Switch
                checked={isEnabled}
                onCheckedChange={(val) => setDraft((prev) => ({ ...prev, [cat.id]: val }))}
                aria-label={t("admin_tools.ops.toggle_category", "Toggle {{name}}", { name: cat.name })}
                data-testid={`switch-category-${cat.id}`}
              />
            </div>
          );
        })}
      </div>

      {isDirty && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
           {t("admin_tools.ops.unsaved_changes", "You have unsaved changes. Click Save to apply.")}
        </p>
      )}
    </div>
  );
}


// ─── Sticky Command Header ─────────────────────────────────────────────────────
function ProviderCommandHeader({
  data,
  onRefresh,
}: {
  data: ConsoleData;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user: authUser } = useAuth();
  const qc = useQueryClient();
  const { format: fmtUSD } = useAdminCurrency();
  const { provider: prov, user, metrics, appointments, financials } = data;
  const d = (key: string, fallback: string, options?: Record<string, unknown>) => {
    const existing = String(t(`admin_tools.ops.${key}`, { defaultValue: "" }));
    return String(t(`admin_extra.provider.${key}`, { defaultValue: existing || fallback, ...options }));
  };

  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [notifTitle, setNotifTitle] = useState("");
  const [notifBody, setNotifBody] = useState("");
  const [showNotifForm, setShowNotifForm] = useState(false);
  const [showReqDocsDialog, setShowReqDocsDialog] = useState(false);

  const isGlobal = authUser?.role === "global_admin";
  const isApproved = prov.status === "approved" || prov.status === "active";
  const isDeactivated = prov.status === "deactivated";
  const isSuspended = user?.isSuspended;
  const fullName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
  const risk = riskLabel(metrics.computedRisk);
  const healthScore = Math.max(0, 100 - metrics.computedRisk);

  const CONFIRM_COPY: Record<string, { title: string; desc: string; needsReason: boolean; variant: "green" | "red" | "orange" }> = {
    approve:            { title: t("admin_tools.ops.approve_provider", "Approve Provider"), desc: t("admin_tools.ops.approve_provider_desc", "This will approve the provider and grant them access to accept bookings."), needsReason: false, variant: "green" },
    reject:             { title: t("admin_tools.ops.reject_application", "Reject Application"), desc: t("admin_tools.ops.reject_application_desc", "This will reject the provider. Please provide a reason."), needsReason: true, variant: "red" },
    suspend:            { title: t("admin_tools.ops.suspend_provider", "Suspend Provider"), desc: t("admin_tools.ops.suspend_provider_desc", "This will immediately suspend the provider account."), needsReason: true, variant: "red" },
    unsuspend:          { title: t("admin_tools.ops.unsuspend_provider", "Unsuspend Provider"), desc: t("admin_tools.ops.unsuspend_provider_desc", "This will restore the provider's account access."), needsReason: false, variant: "green" },
    deactivate:         { title: t("admin_tools.ops.deactivate_provider", "Deactivate Provider"), desc: t("admin_tools.ops.deactivate_provider_desc", "This will permanently deactivate this provider. They will not be able to log in or accept bookings."), needsReason: true, variant: "red" },
    reactivate:         { title: t("admin_tools.ops.reactivate_account", "Reactivate Account"), desc: t("admin_tools.ops.reactivate_account_desc", "This will reactivate the deactivated provider account."), needsReason: false, variant: "green" },
    request_changes:    { title: t("admin_tools.ops.request_changes", "Request Profile Changes"), desc: t("admin_tools.ops.request_changes_desc", "Provider will be moved to Action Required and notified to update their profile."), needsReason: true, variant: "orange" },
    reset_verification: { title: t("admin_tools.ops.reset_verification", "Reset Verification"), desc: t("admin_tools.ops.reset_verification_desc", "All documents will be returned to Pending and provider status set to Submitted. This cannot be undone."), needsReason: false, variant: "orange" },
    enable_bookings:    { title: t("admin_tools.ops.enable_bookings", "Enable Bookings"), desc: t("admin_tools.ops.enable_bookings_desc", "This will allow the provider to accept new member bookings."), needsReason: false, variant: "green" },
    disable_bookings:   { title: t("admin_tools.ops.disable_bookings", "Disable Bookings"), desc: t("admin_tools.ops.disable_bookings_desc", "New member bookings will be blocked for this provider. Existing appointments are unaffected."), needsReason: false, variant: "orange" },
  };

  const actionMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await apiRequest("POST", `/api/admin/providers/${prov.id}/actions`, body);
      if (!r.ok) throw new Error("Action failed");
      return r.json();
    },
    onSuccess: (_, vars) => {
      toast({ title: vars.action === "approve" ? t("admin_tools.ops.provider_approved", "Provider approved") : vars.action === "suspend" ? t("admin_tools.ops.provider_suspended", "Provider suspended") : t("admin_tools.ops.action_completed", "Action completed") });
      setConfirmAction(null);
      setReason("");
      qc.invalidateQueries({ queryKey: ["/api/admin/providers"] });
      onRefresh();
    },
    onError: (err: any) => toast({ title: err?.message || t("common.action_failed", "Action failed"), variant: "destructive" }),
  });

  const doAction = (action: string, extra?: any) => actionMutation.mutate({ action, reason, ...extra });

  return (
    <div className="sticky top-0 z-20 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 shadow-sm">
      {/* Identity row */}
      <div className="px-5 pt-4 pb-3 flex items-start gap-4">
        <Avatar className="h-14 w-14 flex-shrink-0 ring-2 ring-white dark:ring-slate-950 shadow">
          <AvatarImage src={user?.avatarUrl || ""} />
          <AvatarFallback className="text-lg font-bold bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900 text-blue-700 dark:text-blue-300">
            {user?.firstName?.[0] || "?"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{fullName}</h2>
            {prov.isVerified && <span title={t("admin_tools.ops.verified", "Verified")}><ShieldCheck className="h-4 w-4 text-blue-500" /></span>}
            {isSuspended && <Badge variant="destructive" className="text-xs">{t("admin_tools.ops.suspended", "Suspended")}</Badge>}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-sm text-slate-500 capitalize">
              {prov.displayTitle || prov.display_title || prov.providerCategory || humanLabel(prov.providerType)}
            </span>
            <span className="text-slate-300">·</span>
            <StatusBadge status={prov.status} domain="provider" className="text-xs" />
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${risk.color}`}>
              {t("admin_tools.ops.risk", "Risk")}: {t(`admin_tools.ops.risk_level.${risk.label.toLowerCase()}`, risk.label)} ({metrics.computedRisk})
            </span>
           <span className="text-xs text-slate-400">{prov.countryCode} · ID …{prov.id?.slice(-6)}</span>
          </div>
          {user?.email && (
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="text-xs text-slate-500 flex items-center gap-1"><Mail className="h-3 w-3" />{user.email}</span>
              {user?.phone && <span className="text-xs text-slate-500 flex items-center gap-1"><Phone className="h-3 w-3" />{user.phone}</span>}
              {user?.createdAt && (
                <span className="text-xs text-slate-400 flex items-center gap-1">
              <Calendar className="h-3 w-3" />{t("admin_tools.ops.joined", "Joined")} {formatAdminDate(user.createdAt, "monthYear")}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isApproved && !isDeactivated && (
            <Button
              size="sm"
              className="h-8 bg-green-600 hover:bg-green-700 text-white gap-1.5"
              onClick={() => setConfirmAction("approve")}
              disabled={actionMutation.isPending}
              data-testid="button-approve-provider"
            >
              <CheckCircle className="h-3.5 w-3.5" />{t("common.approve", "Approve")}
            </Button>
          )}
          {isApproved && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
              <CheckCircle className="h-3.5 w-3.5 text-green-600" />
              <span className="text-xs font-semibold text-green-700 dark:text-green-400">{t("admin_tools.review.status.approved", "Approved")}</span>
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" data-testid="button-more-actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs font-semibold text-slate-400 uppercase">{t("admin_tools.ops.lifecycle", "Lifecycle")}</DropdownMenuLabel>
              {!isApproved && !isDeactivated && (
                <DropdownMenuItem onClick={() => setConfirmAction("approve")} className="text-green-600 focus:text-green-600">
                  <CheckCircle className="h-3.5 w-3.5 mr-2" />{t("admin_tools.ops.approve_provider", "Approve Provider")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setConfirmAction("reject")} className="text-red-600 focus:text-red-600">
                <XCircle className="h-3.5 w-3.5 mr-2" />{t("admin_tools.ops.reject_application", "Reject Application")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setConfirmAction("request_changes")} className="text-orange-600 focus:text-orange-600">
                <AlertCircle className="h-3.5 w-3.5 mr-2" />{t("admin_tools.ops.request_changes_short", "Request Changes")}
              </DropdownMenuItem>
              {isDeactivated ? (
                <DropdownMenuItem onClick={() => setConfirmAction("reactivate")} className="text-blue-600 focus:text-blue-600">
                  <Play className="h-3.5 w-3.5 mr-2" />{t("admin_tools.ops.reactivate_account", "Reactivate Account")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => setConfirmAction("deactivate")} className="text-red-700 focus:text-red-700">
                  <TimerOff className="h-3.5 w-3.5 mr-2" />{t("admin_tools.ops.deactivate_provider", "Deactivate Provider")}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-semibold text-slate-400 uppercase">{t("admin_tools.ops.account", "Account")}</DropdownMenuLabel>
              {!isSuspended ? (
                <DropdownMenuItem onClick={() => setConfirmAction("suspend")} className="text-orange-600 focus:text-orange-600">
                  <Ban className="h-3.5 w-3.5 mr-2" />{t("admin_tools.ops.suspend_provider", "Suspend Provider")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => setConfirmAction("unsuspend")} className="text-green-600 focus:text-green-600">
                  <CheckCircle className="h-3.5 w-3.5 mr-2" />{t("admin_tools.ops.unsuspend_provider", "Unsuspend Provider")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setConfirmAction("enable_bookings")}>
                <Play className="h-3.5 w-3.5 mr-2" />{t("admin_tools.ops.enable_bookings", "Enable Bookings")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setConfirmAction("disable_bookings")}>
                <Pause className="h-3.5 w-3.5 mr-2" />{t("admin_tools.ops.disable_bookings", "Disable Bookings")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-semibold text-slate-400 uppercase">{t("admin_tools.ops.verification", "Verification")}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setConfirmAction("reset_verification")}>
                <RefreshCw className="h-3.5 w-3.5 mr-2" />{t("admin_tools.ops.reset_verification", "Reset Verification")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowReqDocsDialog(true)}>
                <ClipboardList className="h-3.5 w-3.5 mr-2" />{t("admin_tools.ops.request_documents", "Request Documents")}
              </DropdownMenuItem>
              {prov.licenseDocumentUrl && (
                <DropdownMenuItem asChild>
                  <a href={prov.licenseDocumentUrl} target="_blank" rel="noreferrer">
                    <Eye className="h-3.5 w-3.5 mr-2" />{t("admin_tools.ops.view_license", "View License")}
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-semibold text-slate-400 uppercase">{t("admin_tools.ops.communication", "Communication")}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setShowNotifForm(true)}>
                <Bell className="h-3.5 w-3.5 mr-2" />{t("admin_tools.ops.send_notification", "Send Notification")}
              </DropdownMenuItem>
              {isGlobal && (
                <>
                  <DropdownMenuSeparator />
                   <DropdownMenuItem onClick={() => toast({ title: d("impersonate_global", "Impersonate (Global)"), description: d("additional_authorization", "Requires additional authorization.") })}>
                     <UserIcon className="h-3.5 w-3.5 mr-2" />{d("impersonate_global", "Impersonate (Global)")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onRefresh} title={t("common.refresh", "Refresh")}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Executive KPI Cards */}
      <div className="px-5 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Health Score */}
        <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
          healthScore >= 80 ? "border-green-200 bg-green-50/60 dark:bg-green-950/20"
          : healthScore >= 60 ? "border-blue-200 bg-blue-50/60 dark:bg-blue-950/20"
          : healthScore >= 40 ? "border-yellow-200 bg-yellow-50/60 dark:bg-yellow-950/20"
          : "border-red-200 bg-red-50/60 dark:bg-red-950/20"
        }`}>
          <div className={`text-2xl font-bold ${healthScore >= 80 ? "text-green-600" : healthScore >= 60 ? "text-blue-600" : healthScore >= 40 ? "text-yellow-600" : "text-red-600"}`}>
            {healthScore}
          </div>
          <div>
             <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{d("health", "Health")}</p>
            <p className="text-[11px] text-slate-400">
               {healthScore >= 80 ? d("excellent", "Excellent") : healthScore >= 60 ? d("good", "Good") : healthScore >= 40 ? d("fair", "Fair") : d("poor", "Poor")}
            </p>
          </div>
        </div>
        {/* Revenue */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 px-4 py-3 flex items-center gap-3">
          <DollarSign className="h-5 w-5 text-green-500 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{fmtUSD(financials.revenueUsd)}</p>
             <p className="text-[11px] text-slate-400">{d("earnings_usd", "Earnings (USD)")}</p>
          </div>
        </div>
        {/* Appointments */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 px-4 py-3 flex items-center gap-3">
          <Calendar className="h-5 w-5 text-blue-500 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{appointments.total}</p>
             <p className="text-[11px] text-slate-400">{d("completed_count", "{{count}} completed", { count: appointments.completed })}</p>
          </div>
        </div>
        {/* Docs */}
        <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
          metrics.verificationPct === 100 ? "border-green-200 bg-green-50/60 dark:bg-green-950/20"
          : metrics.pendingDocs > 0 ? "border-yellow-200 bg-yellow-50/60 dark:bg-yellow-950/20"
          : "border-slate-200 bg-slate-50/60 dark:bg-slate-900/40"
        }`}>
          <FileText className={`h-5 w-5 flex-shrink-0 ${metrics.verificationPct === 100 ? "text-green-500" : metrics.pendingDocs > 0 ? "text-yellow-500" : "text-slate-400"}`} />
          <div>
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{metrics.approvedDocs}/{metrics.totalDocs}</p>
             <p className="text-[11px] text-slate-400">{d("verified_percent", "{{percent}}% verified", { percent: metrics.verificationPct })}</p>
          </div>
        </div>
      </div>

      {/* Send Notification inline form (conditionally shown below KPIs) */}
      {showNotifForm && (
        <div className="mx-5 mb-3 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl space-y-2">
           <div className="flex items-center justify-between">
             <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">{d("send_notification_to_provider", "Send Notification to Provider")}</p>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400" onClick={() => setShowNotifForm(false)}>
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
           <Input placeholder={d("title", "Title")} value={notifTitle} onChange={e => setNotifTitle(e.target.value)} className="h-7 text-xs" />
           <Textarea placeholder={d("message", "Message…")} value={notifBody} onChange={e => setNotifBody(e.target.value)} className="text-xs min-h-[56px] resize-none" />
          <Button
            size="sm" className="h-7 text-xs gap-1.5"
            disabled={!notifTitle || !notifBody || actionMutation.isPending}
            onClick={() => {
              doAction("send_notification", { notificationTitle: notifTitle, notificationBody: notifBody });
              setShowNotifForm(false);
              setNotifTitle("");
              setNotifBody("");
            }}
          >
             <Send className="h-3 w-3" />{d("send", "Send")}
          </Button>
        </div>
      )}

      <RequestDocumentsDialog
        providerId={prov.id}
        open={showReqDocsDialog}
        onOpenChange={setShowReqDocsDialog}
        onSuccess={onRefresh}
      />

      {/* Confirm Dialog */}
      <Dialog open={!!confirmAction} onOpenChange={() => { setConfirmAction(null); setReason(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirmAction ? CONFIRM_COPY[confirmAction]?.title || confirmAction : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {confirmAction ? CONFIRM_COPY[confirmAction]?.desc : ""}
            </p>
            {confirmAction && CONFIRM_COPY[confirmAction]?.needsReason && (
              <div>
                 <Label className="text-xs">{d("reason", "Reason")} {confirmAction !== "request_changes" ? d("optional", "(optional)") : ""}</Label>
                <Textarea
                   placeholder={d("reason_placeholder", "Reason…")}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="mt-1.5 text-sm min-h-[80px]"
                />
              </div>
            )}
          </div>
          <DialogFooter>
             <Button variant="outline" size="sm" onClick={() => { setConfirmAction(null); setReason(""); }}>{d("cancel", "Cancel")}</Button>
            <Button
              size="sm"
              className={
                confirmAction && CONFIRM_COPY[confirmAction]?.variant === "green" ? "bg-green-600 hover:bg-green-700 text-white"
                : confirmAction && CONFIRM_COPY[confirmAction]?.variant === "orange" ? "bg-orange-600 hover:bg-orange-700 text-white"
                : "bg-red-600 hover:bg-red-700 text-white"
              }
              onClick={() => doAction(confirmAction!)}
              disabled={actionMutation.isPending}
            >
              {actionMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
               {d("confirm", "Confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Provider Command Center (11 tabs) ───────────────────────────────────────
function ProviderCommandCenter({
  data,
  onRefresh,
}: {
  data: ConsoleData;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const { format: fmtUSD } = useAdminCurrency();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { provider: prov, user, services, practitioners, documents, appointments, financials, metrics, timeline } = data;
  const fullName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
  const label = (key: string, fallback: string) => t(`admin_tools.ops.${key}`, fallback);
  const d = (key: string, fallback: string, options?: Record<string, unknown>) => {
    const existing = String(t(`admin_tools.ops.${key}`, { defaultValue: "" }));
    const details = String(t(`admin_provider_details.${key}`, { defaultValue: "" }));
    return String(t(`admin_extra.provider.${key}`, { defaultValue: details || existing || fallback, ...options }));
  };
  const statusLabel = (status: string | null | undefined) =>
    String(t(`admin_tools.review.status.${status || ""}`, {
      defaultValue: d(String(status || ""), humanLabel(status)),
    }));

  // P3: Service admin actions
  const serviceActionMutation = useMutation({
    mutationFn: async ({ svcId, action }: { svcId: string; action: "activate" | "deactivate" | "delete" | "restore" }) => {
      if (action === "delete") {
        const r = await apiRequest("DELETE", `/api/services/${svcId}`, {});
        if (!r.ok) { const e = await r.json(); throw new Error(e.message || "Delete failed"); }
        return r.status === 204 ? {} : r.json();
      }
      if (action === "restore") {
        const r = await apiRequest("POST", `/api/services/${svcId}/restore`, {});
        if (!r.ok) { const e = await r.json(); throw new Error(e.message || "Restore failed"); }
        return r.json();
      }
      const r = await apiRequest("PATCH", `/api/services/${svcId}`, { isActive: action === "activate" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message || "Update failed"); }
      return r.json();
    },
    onSuccess: (_, vars) => {
       const msgs: Record<string, string> = {
         activate: d("service_reactivated", "Service reactivated"),
         deactivate: d("service_suspended", "Service suspended"),
         delete: d("service_archived", "Service archived"),
         restore: d("service_restored", "Service restored"),
      };
       toast({ title: msgs[vars.action] || d("service_updated", "Service updated") });
      qc.invalidateQueries({ queryKey: ["/api/admin/providers", prov.id, "console"] });
      onRefresh();
    },
     onError: (e: any) => toast({ title: e?.message || d("action_failed", "Action failed"), variant: "destructive" }),
  });

  // Track which heavy tabs have been mounted at least once (lazy render)
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set(["overview"]));
  const onTabChange = useCallback((tab: string) => {
    setMountedTabs(prev => { const s = new Set(prev); s.add(tab); return s; });
  }, []);

  // Document urgency
  const mergedDocs = DOC_PLACEHOLDERS.map(ph => ({
    placeholder: ph,
    doc: documents.find((d: any) => d.documentType === ph.type) || null,
  }));
  const extraDocs = documents.filter((d: any) => !DOC_PLACEHOLDERS.find(ph => ph.type === d.documentType));

  const urgencyExpired  = mergedDocs.filter(({ doc }) => doc?.verificationStatus === "expired").length;
  const urgencyExpiring = mergedDocs.filter(({ doc }) => {
    if (!doc?.expiryDate) return false;
    const days = differenceInDays(parseISO(doc.expiryDate), new Date());
    return days >= 0 && days <= 30 && doc?.verificationStatus === "approved";
  }).length;
  const urgencyReupload = mergedDocs.filter(({ doc }) => ["rejected","reupload_required"].includes(doc?.verificationStatus ?? "")).length;
  const urgencyMissing  = mergedDocs.filter(({ placeholder, doc }) => placeholder.criticality === "mandatory" && !doc).length;
  const hasDocUrgency   = urgencyExpired + urgencyExpiring + urgencyReupload + urgencyMissing > 0;

  // Health factors (for overview)
  const healthScore = Math.max(0, 100 - metrics.computedRisk);
  const healthFactors = [
    { label: t("admin_tools.ops.identity_verified", "Identity Verified"), pass: prov.isVerified, impact: "high" as const, note: prov.isVerified ? t("admin_tools.ops.kyc_confirmed", "KYC identity confirmed") : t("admin_tools.ops.verification_incomplete", "Admin has not finalized verification") },
    { label: t("admin_tools.ops.account_status", "Account Status"), pass: ["approved","active"].includes(prov.status), impact: "high" as const, note: `${t("admin_tools.ops.current_status", "Current status")}: ${statusLabel(prov.status)}` },
    { label: t("admin_tools.ops.mandatory_docs", "Mandatory Docs Approved"), pass: metrics.pendingDocs === 0 && metrics.approvedDocs >= 3, impact: "high" as const, note: t("admin_tools.ops.documents_approved", "{{approved}}/{{total}} documents approved", { approved: metrics.approvedDocs, total: metrics.totalDocs }) },
    { label: t("admin_tools.ops.low_cancellation", "Low Cancellation Rate"), pass: appointments.cancellationRate < 20, impact: "medium" as const, note: `${appointments.cancellationRate}% ${t("admin_tools.ops.cancellation_rate", "cancellation rate")}` },
    { label: t("admin_tools.ops.has_services", "Has Services"), pass: metrics.servicesCount > 0, impact: "medium" as const, note: t("admin_tools.ops.services_configured", "{{count}} service(s) configured", { count: metrics.servicesCount }) },
    { label: t("admin_tools.ops.bookings_enabled", "Bookings Enabled"), pass: prov.bookingsEnabled !== false, impact: "medium" as const, note: prov.bookingsEnabled !== false ? t("admin_tools.ops.accepting_bookings", "Accepting new bookings") : t("admin_tools.ops.booking_disabled", "Booking intake disabled") },
    { label: t("admin_tools.ops.account_not_suspended", "Account Not Suspended"), pass: !user?.isSuspended, impact: "high" as const, note: user?.isSuspended ? `${t("admin_tools.ops.suspended", "Suspended")}: ${user.suspensionReason || t("admin_tools.ops.no_reason", "No reason")}` : t("admin_tools.ops.good_standing", "Account in good standing") },
  ];

  const TAB_TRIGGER_CLS = "text-xs px-3 py-2.5 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 whitespace-nowrap";

  return (
    <div className="flex flex-col h-full">
      {/* Sticky Header */}
      <ProviderCommandHeader data={data} onRefresh={onRefresh} />

      {/* 11-Tab Workspace */}
      <Tabs defaultValue="overview" onValueChange={onTabChange} className="flex-1 flex flex-col min-h-0">
        <div className="border-b border-slate-200 dark:border-slate-800 px-4 bg-white dark:bg-slate-950">
          <TabsList className="h-auto bg-transparent border-0 p-0 gap-0 overflow-x-auto flex">
            {[
              { id: "overview",  label: t("admin_tools.ops.overview", "Overview") },
              { id: "profile",   label: t("admin_tools.ops.profile", "Profile") },
              { id: "kycdocs",   label: t("admin_tools.ops.kyc_docs", "KYC & Docs") },
              { id: "schedule",  label: t("admin_tools.ops.schedule", "Schedule") },
              { id: "services",  label: t("common.services", "Services") },
              { id: "bookings",  label: t("admin.bookings", "Bookings") },
              { id: "patients",  label: t("admin.patients", "Members") },
              { id: "financial", label: t("admin_tools.ops.financials", "Financials") },
              { id: "staff",     label: t("admin_tools.ops.staff", "Staff") },
              { id: "timeline",  label: t("admin_tools.ops.timeline", "Timeline") },
              { id: "notes",     label: t("admin_tools.ops.admin_notes", "Admin Notes") },
            ].map(({ id, label }) => (
              <TabsTrigger key={id} value={id} className={TAB_TRIGGER_CLS}>
                {label}
                {id === "kycdocs" && hasDocUrgency && (
                  <span className="ml-1.5 h-2 w-2 rounded-full bg-orange-500 inline-block" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ScrollArea className="flex-1">

          {/* ── OVERVIEW ─────────────────────────────────────────── */}
          <TabsContent value="overview" className="p-5 space-y-5 mt-0">
            {/* Health score card */}
            {(() => {
               const scoreLabel = healthScore >= 80 ? { text: d("excellent", "Excellent"), color: "text-green-600", bg: "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900/40" }
                 : healthScore >= 60 ? { text: d("good", "Good"), color: "text-blue-600", bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900/40" }
                 : healthScore >= 40 ? { text: d("fair", "Fair"), color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-900/40" }
                 : { text: d("poor", "Poor"), color: "text-red-600", bg: "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900/40" };
              const passing = healthFactors.filter(f => f.pass).length;
              return (
                <div className={`rounded-xl border p-5 flex items-center gap-6 ${scoreLabel.bg}`}>
                  <div className="text-center flex-shrink-0">
                    <div className={`text-5xl font-bold ${scoreLabel.color}`}>{healthScore}</div>
                    <div className={`text-sm font-semibold mt-1 ${scoreLabel.color}`}>{label(`health_${scoreLabel.text.toLowerCase()}`, scoreLabel.text)}</div>
                  </div>
                  <div className="flex-1 space-y-2">
                    <Progress value={healthScore} className="h-3" />
                    <p className="text-xs text-slate-500">{label("health_factors_passing", "{{passing}}/{{total}} health factors passing").replace("{{passing}}", String(passing)).replace("{{total}}", String(healthFactors.length))}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {healthFactors.filter(f => !f.pass).map(f => (
                        <span key={f.label} className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${f.impact === "high" ? "border-red-200 text-red-600 bg-red-50 dark:bg-red-950/20" : "border-yellow-200 text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20"}`}>
                          ✗ {f.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Health factor detail */}
            <div className="space-y-2">
              {healthFactors.map(f => (
                <div key={f.label} className={`rounded-lg border p-3 flex items-start gap-3 ${f.pass ? "border-green-100 dark:border-green-900/30 bg-green-50/30 dark:bg-green-950/10" : f.impact === "high" ? "border-red-200 dark:border-red-900/40 bg-red-50/30 dark:bg-red-950/10" : "border-yellow-200 dark:border-yellow-900/40 bg-yellow-50/30 dark:bg-yellow-950/10"}`}>
                  <div className={`flex-shrink-0 mt-0.5 ${f.pass ? "text-green-500" : f.impact === "high" ? "text-red-500" : "text-yellow-500"}`}>
                    {f.pass ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{f.label}</span>
                       <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${f.impact === "high" ? "border-red-200 text-red-600 bg-red-50 dark:bg-red-950/20" : "border-yellow-200 text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20"}`}>{d("impact", "{{impact}} impact", { impact: f.impact })}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{f.note}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-4 gap-3">
                {[
                   { icon: Calendar, label: d("appts", "Total Appts"), value: appointments.total },
                   { icon: CheckCheck, label: d("completed", "Completed"), value: appointments.completed },
                   { icon: Users, label: d("staff", "Staff"), value: metrics.staffCount },
                   { icon: Briefcase, label: d("services", "Services"), value: metrics.servicesCount },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 text-center">
                  <Icon className="h-4 w-4 text-slate-400 mx-auto mb-1" />
                  <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{value}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {prov.internalNotes && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{label("internal_notes", "Internal Notes")}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900/40 rounded p-3">
                  {prov.internalNotes}
                </p>
              </div>
            )}
          </TabsContent>

          {/* ── PROFILE (P1) ─────────────────────────────────────── */}
          <TabsContent value="profile" className="p-5 space-y-6 mt-0">

            {/* A — Identity */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
                <UserIcon className="h-3.5 w-3.5 text-slate-500" />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{label("identity", "Identity")}</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {[
                   { label: d("full_name", "Full Name"), value: `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || d("no_value", "—") },
                   { label: d("display_title", "Display Title"), value: prov.displayTitle || prov.display_title || prov.professionalTitle || d("no_value", "—") },
                   { label: d("provider_id", "Provider ID"), value: prov.id, mono: true },
                   { label: d("user_id", "User ID"), value: user?.id, mono: true },
                   { label: d("email", "Email"), value: user?.email },
                   { label: d("mobile", "Mobile"), value: user?.phone || prov.supportPhone || d("no_value", "—") },
                   { label: d("verification_status", "Verification Status"), value: prov.isVerified ? `✓ ${d("verified", "Verified")}` : d("not_verified", "Not Verified") },
                   { label: d("provider_status", "Provider Status"), value: statusLabel(prov.status) },
                   { label: d("risk_level", "Risk Level"), value: riskLabel(metrics.computedRisk).label },
                   { label: d("joined", "Joined"), value: user?.createdAt ? formatAdminDate(user.createdAt, "date") : d("no_value", "—") },
                   { label: d("last_updated", "Last Updated"), value: prov.updatedAt ? formatAdminDate(prov.updatedAt, "date") : d("no_value", "—") },
                   { label: d("bookings", "Bookings"), value: prov.bookingsEnabled === false ? d("disabled", "Disabled") : d("enabled", "Enabled") },
                ].map(({ label, value, mono }) => (
                  <div key={label} className="flex items-start gap-2 text-sm">
                    <span className="text-xs text-slate-400 w-36 flex-shrink-0 pt-0.5">{label}</span>
                    <span className={`text-sm font-medium text-slate-700 dark:text-slate-300 break-all ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* B — Professional */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
                <Stethoscope className="h-3.5 w-3.5 text-blue-500" />
                 <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{d("professional", "Professional")}</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {[
                   { label: d("category", "Category"), value: prov.providerCategory || humanLabel(prov.providerType) },
                   { label: d("subcategory", "Subcategory"), value: prov.providerSubcategory || d("no_value", "—") },
                   { label: d("provider_type", "Provider Type"), value: humanLabel(prov.providerType) },
                   { label: d("account_type", "Account Type"), value: humanLabel(prov.accountType) },
                   { label: d("specialization", "Specialization"), value: prov.specialization || d("no_value", "—") },
                   { label: d("professional_title", "Professional Title"), value: prov.professionalTitle || d("no_value", "—") },
                   { label: d("languages", "Languages"), value: (prov.languages || []).join(", ") || d("no_value", "—") },
                   { label: d("service_modes", "Service Modes"), value: (prov.serviceModes || []).map(humanLabel).join(", ") || d("no_value", "—") },
                   { label: d("years_experience", "Years Experience"), value: prov.yearsExperience != null ? `${prov.yearsExperience} ${d("years", "years")}` : d("no_value", "—") },
                   { label: d("education", "Education"), value: prov.education || d("no_value", "—") },
                   { label: d("rating", "Rating"), value: prov.rating ? `${Number(prov.rating).toFixed(1)} ★  (${prov.totalReviews || 0} ${d("reviews", "reviews")})` : d("no_reviews", "No reviews yet") },
                   { label: d("affiliated_hospital", "Affiliated Hospital"), value: prov.affiliatedHospital || d("no_value", "—") },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start gap-2 text-sm">
                    <span className="text-xs text-slate-400 w-36 flex-shrink-0 pt-0.5">{label}</span>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{value || "—"}</span>
                  </div>
                ))}
              </div>
              {prov.bio && (
                <div className="px-4 pb-4">
                  <Separator className="mb-3" />
                   <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{d("bio", "Bio")}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{prov.bio}</p>
                </div>
              )}
            </div>

            {/* C — Location */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-green-500" />
                 <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{d("location", "Location")}</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {[
                   { label: d("country", "Country"), value: humanLabel(prov.countryCode) },
                   { label: d("city", "City"), value: prov.city || user?.city || d("no_value", "—") },
                   { label: d("timezone", "Timezone"), value: user?.timezone || d("no_value", "—") },
                   { label: d("practice_address", "Practice Address"), value: [prov.clinicAddressLine1, prov.clinicAddressLine2].filter(Boolean).join(", ") || prov.clinicFormattedAddress || d("no_value", "—") },
                   { label: d("practice_postal", "Practice Postal"), value: prov.clinicPostalCode || d("no_value", "—") },
                   { label: d("home_address", "Home Address"), value: [prov.permanentAddressLine1, prov.permanentAddressLine2].filter(Boolean).join(", ") || d("no_value", "—") },
                   { label: d("home_city", "Home City"), value: prov.permanentCity || d("no_value", "—") },
                   { label: d("home_postal", "Home Postal"), value: prov.permanentPostalCode || d("no_value", "—") },
                   { label: d("home_country", "Home Country"), value: prov.permanentCountry || d("no_value", "—") },
                   { label: d("support_email", "Support Email"), value: prov.supportEmail || d("no_value", "—") },
                   { label: d("support_phone", "Support Phone"), value: prov.supportPhone || d("no_value", "—") },
                   { label: d("primary_location", "Primary Location"), value: humanLabel(prov.primaryServiceLocation) },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start gap-2 text-sm">
                    <span className="text-xs text-slate-400 w-36 flex-shrink-0 pt-0.5">{label}</span>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{value || "—"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* D — Currency & Billing */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
                <Banknote className="h-3.5 w-3.5 text-emerald-500" />
                 <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{d("currency_billing", "Currency & Billing")}</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {(() => {
                  const nativeCcy = currencyForCountry(prov.countryCode);
                  const walletCcy = financials.walletCurrency || "USD";
                  return [
                    { label: d("native_currency", "Native Currency"), value: humanLabel(nativeCcy), note: d("provider_pricing_currency", "Provider pricing currency") },
                    { label: d("country_currency", "Country Currency"), value: humanLabel(nativeCcy), note: d("based_on_country", "Based on {{country}}", { country: humanLabel(prov.countryCode) }) },
                    { label: d("wallet_currency", "Wallet Currency"), value: humanLabel(walletCcy), note: d("wallet_stored_in", "Wallet stored in") },
                    { label: d("payment_methods", "Payment Methods"), value: (prov.paymentMethods || []).join(", ") || "—" },
                    { label: d("insurance_accepted", "Insurance Accepted"), value: (prov.insuranceAccepted || []).join(", ") || "—" },
                    { label: d("wallet_balance", "Wallet Balance"), value: fmtUSD(financials.walletBalance), note: d("admin_usd", "Admin (USD)") },
                    { label: d("provider_earnings", "Provider Earnings"), value: fmtUSD(financials.revenueUsd), note: d("lifetime_usd", "Lifetime (USD)") },
                  ].map(({ label, value, note }) => (
                    <div key={label} className="flex items-start gap-2 text-sm">
                      <div className="w-36 flex-shrink-0">
                        <span className="text-xs text-slate-400">{label}</span>
                        {note && <div className="text-[10px] text-slate-300 dark:text-slate-600">{note}</div>}
                      </div>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{value || "—"}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* E — Emergency Contact */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
                <Heart className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{d("emergency_contact", "Emergency Contact")}</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {[
                  { label: d("name", "Name"), value: user?.emergencyContactName || d("not_provided", "Not Provided") },
                  { label: d("relationship", "Relationship"), value: user?.emergencyContactRelation || d("not_provided", "Not Provided") },
                  { label: d("phone", "Phone"), value: user?.emergencyContactPhone || d("not_provided", "Not Provided") },
                  { label: d("alternate_note", "Alt. Note"), value: prov.emergencyContact || d("not_provided", "Not Provided") },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start gap-2 text-sm">
                    <span className="text-xs text-slate-400 w-36 flex-shrink-0 pt-0.5">{label}</span>
                  <span className={`text-sm font-medium ${value === d("not_provided", "Not Provided") ? "text-slate-400 italic" : "text-slate-700 dark:text-slate-300"}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* ── KYC & DOCS ───────────────────────────────────────── */}
          <TabsContent value="kycdocs" className="p-5 space-y-5 mt-0">
            {/* Verification Status */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{d("verification_center", "Verification Center")}</h3>
              <span className={`text-xs px-2 py-1 rounded border font-medium ${
                ["approved","active"].includes(prov.status) && prov.isVerified ? "bg-green-50 border-green-200 text-green-700"
                : (prov.status === "under_review" || prov.status === "documents_verified") ? "bg-blue-50 border-blue-200 text-blue-700"
                : prov.status === "action_required" ? "bg-orange-50 border-orange-200 text-orange-700"
                : "bg-slate-50 border-slate-200 text-slate-600"
              }`}>
                {["approved","active"].includes(prov.status) && prov.isVerified ? d("fully_verified", "Fully Verified")
                  : (prov.status === "under_review" || prov.status === "documents_verified") ? d("under_review", "Under Review")
                  : prov.status === "action_required" ? d("action_required", "Action Required")
                  : (prov.status === "submitted" || prov.status === "pending_approval") ? d("awaiting_review", "Awaiting Review")
                  : d("not_submitted", "Not Submitted")}
              </span>
            </div>

            {/* Professional credentials */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{d("professional_credentials", "Professional Credentials")}</p>
              {[
                { label: d("license_number", "License Number"), value: prov.licenseNumber },
                { label: d("licensing_authority", "Licensing Authority"), value: prov.licensingAuthority },
                { label: d("license_expiry", "License Expiry"),      value: prov.licenseExpiryDate ? formatAdminDate(prov.licenseExpiryDate, "date") : null },
                { label: d("government_id", "Govt. Photo ID Number"), value: prov.nationalProviderId },
                { label: d("agreements", "Agreements"), value: (prov.providerAgreementAccepted && prov.dataProcessingAgreementAccepted) ? d("provider_data_processing", "Provider + Data Processing") : prov.providerAgreementAccepted ? d("provider_only", "Provider only") : d("not_accepted", "Not accepted") },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 text-xs">{label}</span>
                  <span className={`text-xs font-medium ${value ? "text-slate-700 dark:text-slate-300" : "text-slate-400"}`}>{value || "—"}</span>
                </div>
              ))}
            </div>

            {prov.submittedAt && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-1 text-xs">
                <p className="font-medium text-slate-600 dark:text-slate-400">{d("submission_history", "Submission History")}</p>
                <div className="flex justify-between"><span className="text-slate-400">{d("first_submitted", "First submitted")}</span><span>{formatAdminDate(prov.submittedAt, "date")}</span></div>
                {prov.lastResubmittedAt && <div className="flex justify-between"><span className="text-slate-400">{d("last_resubmitted", "Last resubmitted")}</span><span>{formatAdminDate(prov.lastResubmittedAt, "date")}</span></div>}
                {prov.profileUpdatedAfterSubmission && <p className="text-orange-600 font-medium">⚠ {d("profile_updated_after_submission", "Profile updated after submission")}</p>}
              </div>
            )}

            <Separator />

            {/* Documents */}
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {d("documents_verification", "Documents & Verification")}
                </h3>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="text-green-600 font-medium">{d("approved_count", "{{count}} approved", { count: metrics.approvedDocs })}</span>
                  <span>·</span>
                  <span className="text-yellow-600 font-medium">{d("pending_count", "{{count}} pending", { count: metrics.pendingDocs })}</span>
                  <span>·</span>
                  <span>{d("verified_percent", "{{percent}}% verified", { percent: metrics.verificationPct })}</span>
                </div>
              </div>

              {hasDocUrgency && (
                <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/60 dark:bg-orange-950/20 p-3 flex items-start gap-2 flex-wrap">
                  <AlertTriangle className="h-3.5 w-3.5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-orange-800 dark:text-orange-300">{d("attention_required", "Attention required")}</span>
                    {urgencyExpired > 0  && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 font-medium">{urgencyExpired} {d("expired", "expired")}</span>}
                    {urgencyExpiring > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-medium">{urgencyExpiring} {d("expiring_soon", "expiring soon")}</span>}
                    {urgencyReupload > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 font-medium">{urgencyReupload} {d("need_reupload", "need re-upload")}</span>}
                    {urgencyMissing > 0  && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 font-medium">{urgencyMissing} {d("mandatory_missing", "mandatory missing")}</span>}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {mergedDocs.map(({ placeholder, doc }) => (
                  <DocumentRow key={placeholder.type} doc={doc} placeholder={placeholder} onReload={onRefresh} providerId={prov.id} />
                ))}
                {extraDocs.map((doc: any) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    placeholder={{ type: doc.documentType, label: humanLabel(doc.documentType), criticality: "optional" }}
                    onReload={onRefresh}
                    providerId={prov.id}
                  />
                ))}
              </div>
            </div>
          </TabsContent>

          {/* ── SCHEDULE (P2) ────────────────────────────────────── */}
          <TabsContent value="schedule" className="mt-0">
            {mountedTabs.has("schedule") && <ScheduleTab providerId={prov.id} />}
          </TabsContent>

          {/* ── SERVICES (P3 + P5) ───────────────────────────────── */}
          <TabsContent value="services" className="p-5 space-y-5 mt-0">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{d("services_pricing", "Services & Pricing ({{count}})", { count: services.length })}</h3>
                {services.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>{d("active_count", "{{count}} active", { count: services.filter((s: any) => s.isActive).length })}</span>
                    <span>·</span>
                    <span>{d("inactive_count", "{{count}} inactive", { count: services.filter((s: any) => !s.isActive).length })}</span>
                  </div>
                )}
              </div>
               {services.length === 0 && <div className="text-center py-10 text-slate-400 text-sm">{d("no_services", "No services configured")}</div>}
              <div className="space-y-2">
                {services.map((svc: any) => {
                  const svcCcy = svc.currency || currencyForCountry(prov.countryCode);
                  const isPending = serviceActionMutation.isPending && (serviceActionMutation.variables as any)?.svcId === svc.id;
                  return (
                    <div key={svc.id} className={`rounded-lg border p-3 flex items-start gap-3 ${svc.isActive !== false ? "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950" : "border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30"}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{svc.name}</span>
                           {svc.isActive === false && <Badge variant="outline" className="text-[10px] text-slate-500">{d("inactive", "Inactive")}</Badge>}
                           {svc.deletedAt && <Badge variant="outline" className="text-[10px] text-red-500 border-red-200">{d("archived", "Archived")}</Badge>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-slate-500">
                          {/* P5: use native currency, never fmtUSD */}
                          <span className="font-medium text-slate-700 dark:text-slate-300">{fmtSvcPrice(svc.price, svcCcy)}</span>
                           {svc.duration && <span>{svc.duration}min</span>}
                          {svc.locationMode && <span>{humanLabel(svc.locationMode)}</span>}
                          {Number(svc.homeVisitFee) > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Home className="h-2.5 w-2.5" />{fmtSvcPrice(svc.homeVisitFee, svcCcy)}
                            </span>
                          )}
                          {Number(svc.telemedicineFee) > 0 && (
                            <span className="flex items-center gap-0.5">
                              <CreditCard className="h-2.5 w-2.5" />{fmtSvcPrice(svc.telemedicineFee, svcCcy)}
                            </span>
                          )}
                           {svc.bufferBefore > 0 && <span>+{svc.bufferBefore}m {d("buffer", "buffer")}</span>}
                        </div>
                        {svc.description && <p className="text-xs text-slate-400 mt-1 line-clamp-1">{svc.description}</p>}
                      </div>
                      {/* P3: Admin action buttons */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {isPending ? (
                          <div className="h-4 w-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                        ) : svc.deletedAt ? (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700"
                            onClick={() => serviceActionMutation.mutate({ svcId: svc.id, action: "restore" })}
                             title={d("restore_archived_service", "Restore archived service")}>
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" className={`h-7 px-2 text-xs ${svc.isActive !== false ? "text-amber-600 hover:text-amber-700" : "text-green-600 hover:text-green-700"}`}
                              onClick={() => serviceActionMutation.mutate({ svcId: svc.id, action: svc.isActive !== false ? "deactivate" : "activate" })}
                               title={svc.isActive !== false ? d("suspend_service", "Suspend service") : d("reactivate_service", "Reactivate service")}>
                              {svc.isActive !== false ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-500 hover:text-red-600"
                              onClick={() => serviceActionMutation.mutate({ svcId: svc.id, action: "delete" })}
                              title={d("archive_service", "Archive service")}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            <div>
               <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">{d("category_permissions", "Category Permissions")}</h3>
              <CategoryPermissionsTab providerId={prov.id} />
            </div>
          </TabsContent>

          {/* ── BOOKINGS (lazy) ───────────────────────────────────── */}
          <TabsContent value="bookings" className="p-5 space-y-4 mt-0">
            {mountedTabs.has("bookings") ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: d("total", "Total"), value: appointments.total, color: "text-slate-900 dark:text-slate-100" },
                    { label: d("completed", "Completed"), value: appointments.completed, color: "text-green-600" },
                    { label: d("active", "Active"), value: appointments.active, color: "text-blue-600" },
                    { label: d("cancelled", "Cancelled"), value: appointments.cancelled, color: "text-red-600" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 text-center">
                      <div className={`text-2xl font-bold ${color}`}>{value}</div>
                      <div className="text-xs text-slate-400 mt-1">{label}</div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">{d("cancellation_rate", "Cancellation rate")}:</span>
                  <span className={`text-sm font-semibold ${appointments.cancellationRate >= 30 ? "text-red-600" : appointments.cancellationRate >= 15 ? "text-yellow-600" : "text-green-600"}`}>
                    {appointments.cancellationRate}%
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{d("recent_bookings", "Recent Bookings")}</h3>
                {appointments.recent.length === 0 && <div className="text-center py-6 text-slate-400 text-sm">{d("no_bookings", "No bookings")}</div>}
                <div className="space-y-2">
                  {appointments.recent.slice(0, 15).map((appt: any) => (
                    <div key={appt.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            {appt.patientName || (appt.patient ? `${appt.patient.firstName} ${appt.patient.lastName}` : "—")}
                          </span>
                          <StatusBadge status={appt.status} className="text-xs" />
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {appt.date && formatAdminDate(appt.date, "date")}{appt.startTime && ` · ${appt.startTime}`}
                          {appt.locationMode && <span className="ml-1.5 text-slate-300">· {humanLabel(appt.locationMode)}</span>}
                        </div>
                      </div>
                      {appt.totalAmount != null && (
                        /* P4: totalAmount is in booking currency (HUF/IRR/USD), use formatInCurrency */
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {formatInCurrency(Number(appt.totalAmount), appt.displayCurrency || currencyForCountry(prov.countryCode))}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </TabsContent>

          {/* ── PATIENTS ─────────────────────────────────────────── */}
          <TabsContent value="patients" className="p-5 space-y-4 mt-0">
            {(() => {
              const appts = appointments.recent || [];
              const uniqueNames = [...new Set(
                appts.map((a: any) => a.patientName || (a.patient ? `${a.patient.firstName} ${a.patient.lastName}` : null)).filter(Boolean)
              )] as string[];
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: d("unique_members", "Unique Members"), value: uniqueNames.length },
                      { label: d("total_bookings", "Total Bookings"), value: appointments.total },
                      { label: d("completed", "Completed"), value: appointments.completed },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
                        <div className="text-xs text-slate-400 mt-1">{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{d("engagement_metrics", "Engagement Metrics")}</p>
                    {[
                      { label: d("completion_rate", "Completion rate"), value: appointments.total > 0 ? `${Math.round((appointments.completed / appointments.total) * 100)}%` : "—" },
                      { label: d("cancellation_rate", "Cancellation rate"), value: `${appointments.cancellationRate}%` },
                      { label: d("active_bookings", "Active bookings"), value: appointments.active },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">{label}</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{value}</span>
                      </div>
                    ))}
                  </div>
                  {uniqueNames.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{d("recent_members", "Recent Members")}</p>
                      {uniqueNames.slice(0, 10).map((name, i) => (
                        <div key={i} className="flex items-center gap-2 py-1.5 text-sm">
                          <div className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-medium text-slate-500">
                            {name[0]?.toUpperCase()}
                          </div>
                          <span className="text-slate-700 dark:text-slate-300">{name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </TabsContent>

          {/* ── FINANCIALS (lazy) ─────────────────────────────────── */}
          <TabsContent value="financial" className="p-5 space-y-4 mt-0">
            {mountedTabs.has("financial") ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-5 text-center space-y-1">
                    <DollarSign className="h-6 w-6 text-green-500 mx-auto" />
                    {/* Canonical provider net earnings are already USD. */}
                    <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{fmtUSD(financials.revenueUsd)}</div>
                    <div className="text-xs text-slate-400">{d("lifetime_earnings_usd", "Lifetime Earnings (USD)")}</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-5 text-center space-y-1">
                    <Wallet className="h-6 w-6 text-blue-500 mx-auto" />
                    <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{fmtUSD(financials.walletBalance)}</div>
                    <div className="text-xs text-slate-400">{d("wallet_balance_usd", "Wallet Balance (USD)")}</div>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{d("financial_summary", "Financial Summary")}</h3>
                  <div className="space-y-2 text-sm">
                    {[
                      { label: d("completed_appointments", "Completed appointments"), value: appointments.completed },
                      { label: d("cancellation_rate", "Cancellation rate"), value: `${appointments.cancellationRate}%` },
                      { label: d("avg_earnings_appt", "Avg earnings / appt"), value: appointments.completed > 0 ? fmtUSD(Number(financials.revenueUsd) / appointments.completed) : "—" },
                      { label: d("native_currency", "Native currency"), value: humanLabel(currencyForCountry(prov.countryCode)) },
                      { label: d("wallet_currency", "Wallet currency"), value: humanLabel(financials.walletCurrency || "USD") },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-slate-500">{label}</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </TabsContent>

          {/* ── STAFF ────────────────────────────────────────────── */}
          <TabsContent value="staff" className="p-5 space-y-4 mt-0">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Staff / Practitioners ({practitioners.length})
            </h3>
            {practitioners.length === 0 && <div className="text-center py-10 text-slate-400 text-sm">{d("no_staff", "No staff members")}</div>}
            <div className="space-y-2">
              {practitioners.map((prac: any) => (
                <div key={prac.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 flex items-center gap-3">
                  <Avatar className="h-9 w-9 flex-shrink-0">
                    <AvatarImage src={prac.avatarUrl || ""} />
                    <AvatarFallback className="text-xs font-medium">{prac.name?.[0] || "?"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{prac.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-slate-500">
                      {prac.title && <span>{prac.title}</span>}
                      <StatusBadge status={prac.status || "pending"} domain="provider" className="text-[10px] px-1.5 py-0.5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── TIMELINE (lazy) ──────────────────────────────────── */}
          <TabsContent value="timeline" className="p-5 space-y-3 mt-0">
            {mountedTabs.has("timeline") ? (
              <>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{d("activity_timeline", "Activity Timeline")}</h3>
                {timeline.length === 0 && <div className="text-center py-10 text-slate-400 text-sm">{d("no_activity", "No activity recorded")}</div>}
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />
                  <div className="space-y-4">
                    {timeline.map((entry: any) => (
                      <div key={entry.id} className="flex gap-4 pl-10 relative">
                        <div className="absolute left-2.5 top-1.5 h-3 w-3 rounded-full border-2 border-white dark:border-slate-950 bg-blue-400" />
                        <div className="flex-1 bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
                          <div className="flex items-center justify-between gap-2">
                            {/* P6: humanLabel converts snake_case/enum values to readable text */}
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{humanLabel(entry.action)}</span>
                            <span className="text-[10px] text-slate-400">
                              {entry.createdAt && formatAdminDate(entry.createdAt, "dateTime")}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{humanLabel(entry.entityType)}</p>
                          {entry.details && (() => {
                            try {
                              const d = JSON.parse(entry.details);
                              const detail = d.reason || d.action || d.status || d.message || d.note;
                              return <p className="text-xs text-slate-400 mt-1">{detail ? humanLabel(String(detail)) : JSON.stringify(d).slice(0, 120)}</p>;
                            } catch {
                              return <p className="text-xs text-slate-400 mt-1">{entry.details}</p>;
                            }
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </TabsContent>

          {/* ── ADMIN NOTES ──────────────────────────────────────── */}
          <TabsContent value="notes" className="p-5 mt-0">
            {prov && <ProviderNotesPanel providerId={prov.id} />}
          </TabsContent>

        </ScrollArea>
      </Tabs>
    </div>
  );
}

// ─── Provider Notes Panel (standalone for hook compliance) ────────────────────
function ProviderNotesPanel({ providerId }: { providerId: string }) {
  const { t } = useTranslation();
  const d = (key: string, fallback: string, options?: Record<string, unknown>) =>
    String(t(`admin_extra.provider.${key}`, { defaultValue: fallback, ...options }));
  const [noteText, setNoteText] = useState("");
  const qc = useQueryClient();
  const notesQueryKey = [`/api/admin/providers/${providerId}/notes`];
  const { data: notes = [], isLoading: notesLoading } = useQuery<any[]>({
    queryKey: notesQueryKey,
    enabled: !!providerId,
  });
  const addNote = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/providers/${providerId}/notes`, { content: noteText });
      return r.json();
    },
    onSuccess: () => { setNoteText(""); qc.invalidateQueries({ queryKey: notesQueryKey }); },
  });
  const pinNote = useMutation({
    mutationFn: async ({ noteId, isPinned }: { noteId: string; isPinned: boolean }) => {
      const r = await apiRequest("PATCH", `/api/admin/providers/${providerId}/notes/${noteId}`, { isPinned });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notesQueryKey }),
  });
  const deleteNote = useMutation({
    mutationFn: async (noteId: string) => {
      const r = await apiRequest("DELETE", `/api/admin/providers/${providerId}/notes/${noteId}`, {});
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notesQueryKey }),
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{d("internal_admin_notes", "Internal Admin Notes")}</h3>
        <span className="text-xs text-slate-400">{d("notes_count", "{{count}} note(s)", { count: notes.length })}</span>
      </div>
      <div className="space-y-2">
        <Textarea
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          placeholder={d("add_note_placeholder", "Add an internal note about this provider — only admins can see this…")}
          className="min-h-[80px] text-sm resize-none"
          data-testid="input-admin-note"
        />
        <Button
          size="sm"
          onClick={() => addNote.mutate()}
          disabled={!noteText.trim() || addNote.isPending}
          className="gap-1.5"
          data-testid="button-add-note"
        >
          {addNote.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {d("add_note", "Add Note")}
        </Button>
      </div>
      {notesLoading ? (
        <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />)}</div>
      ) : notes.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">{d("no_notes", "No notes yet — add the first one above.")}</div>
      ) : (
        <div className="space-y-2">
          {notes.map((note: any) => (
            <div key={note.id} className={`rounded-xl border p-3.5 transition-colors ${note.isPinned ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800" : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700"}`}>
              <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{note.content}</p>
              <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="font-medium text-slate-500 dark:text-slate-400">{note.adminName}</span>
                  <span>·</span>
                  <span>{formatDateTime(note.createdAt)}</span>
                  {note.isPinned && <span className="ml-1 text-amber-500 font-semibold">📌 Pinned</span>}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                    onClick={() => pinNote.mutate({ noteId: note.id, isPinned: !note.isPinned })}
                    disabled={pinNote.isPending}
                    data-testid={`button-pin-note-${note.id}`}
                  >
                    {note.isPinned ? "Unpin" : "Pin"}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    onClick={() => { if (confirm("Delete this note?")) deleteNote.mutate(note.id); }}
                    disabled={deleteNote.isPending}
                    data-testid={`button-delete-note-${note.id}`}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Export: Provider Command Center ─────────────────────────────────────
export function ProviderOperationsConsole({ jumpToProviderId }: { jumpToProviderId?: string | null } = {}) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(jumpToProviderId ?? null);

  useEffect(() => {
    if (jumpToProviderId && jumpToProviderId !== selectedId) {
      setSelectedId(jumpToProviderId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToProviderId]);

  const { data: _providersPage, isLoading: providersLoading } = useQuery<any>({
    queryKey: ["/api/admin/providers"],
    queryFn: async () => {
      const r = await fetch("/api/admin/providers?limit=200", { credentials: "include" });
      return r.json();
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const providerList: ProviderListItem[] | undefined = Array.isArray(_providersPage)
    ? _providersPage
    : _providersPage?.providers;

  const {
    data: consoleData,
    isLoading: consoleLoading,
    refetch: refetchConsole,
  } = useQuery<ConsoleData>({
    queryKey: ["/api/admin/providers", selectedId, "console"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/providers/${selectedId}/console`);
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
    enabled: !!selectedId,
    staleTime: 30_000,
  });

  return (
    <div className="flex h-[calc(100vh-200px)] min-h-[600px] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      {/* Left: Provider Directory */}
      <div className="w-72 flex-shrink-0">
        {providersLoading ? (
          <div className="flex items-center justify-center h-full bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <ProviderDirectory
            providers={providerList || []}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}
      </div>

      {/* Main: Command Center */}
      <div className="flex-1 min-w-0 overflow-auto">
        {!selectedId ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-10 bg-slate-50/50 dark:bg-slate-900/20">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
              <Briefcase className="h-7 w-7 text-slate-400" />
            </div>
             <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">{t("admin_tools.ops.provider_command_center", "Provider Command Center")}</h3>
            <p className="text-sm text-slate-400 mt-2 max-w-xs">
               {t("admin_tools.ops.select_provider_to_manage", "Select a provider from the directory to manage their profile, documents, services, and operations.")}
            </p>
          </div>
        ) : consoleLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
          </div>
        ) : consoleData ? (
          <ProviderCommandCenter data={consoleData} onRefresh={refetchConsole} />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
             {t("admin_tools.ops.failed_provider_data", "Failed to load provider data")}
          </div>
        )}
      </div>
    </div>
  );
}
