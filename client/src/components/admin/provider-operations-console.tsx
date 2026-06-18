import { useState, useMemo, useCallback, useEffect } from "react";
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
import { format, differenceInDays, parseISO } from "date-fns";
import { Switch } from "@/components/ui/switch";
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
      Could not load schedule data
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
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Weekly Schedule</h3>
          {!officeHours && <span className="text-xs text-slate-400">(no office hours set)</span>}
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
                  <span className="text-xs text-slate-400">Not available</span>
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
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Schedule Templates ({scheduleTemplates.length})</h3>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {scheduleTemplates.map((t: any) => (
              <div key={t.id} className="flex items-center gap-4 px-4 py-2.5">
                <span className="w-20 text-xs font-medium text-slate-700 dark:text-slate-300 flex-shrink-0">{DAY_NAMES[t.day_of_week]}</span>
                <span className="text-xs font-mono text-slate-600 dark:text-slate-400 flex-shrink-0">{t.start_time}–{t.end_time}</span>
                {t.modality && <Badge variant="outline" className="text-[10px]">{humanLabel(t.modality)}</Badge>}
                {!t.is_active && <Badge variant="outline" className="text-[10px] text-slate-400">Inactive</Badge>}
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
            Scheduled Time Off
          </h3>
          <span className="text-xs text-slate-400">({timeOff.length} entries)</span>
        </div>
        {timeOff.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">No time-off periods scheduled</p>
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
            Schedule Overrides / Blocked Dates
          </h3>
          <span className="text-xs text-slate-400">({exceptions.length} entries)</span>
        </div>
        {exceptions.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">No blocked dates</p>
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
            Providers <span className="text-slate-400 font-normal">({filtered.length})</span>
          </h2>
          <Button size="sm" variant="ghost" onClick={() => setShowFilters(!showFilters)} className="h-7 w-7 p-0">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute start-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Search providers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        {showFilters && (
          <div className="space-y-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="action_required">Action Required</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="deactivated">Deactivated</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="physician">Medical Doctors & Specialists</SelectItem>
                <SelectItem value="mental_health">Mental Health & Behavioral</SelectItem>
                <SelectItem value="nutrition">Nutrition & Dietetics</SelectItem>
                <SelectItem value="rehabilitation">Physical Therapy & Rehab</SelectItem>
                <SelectItem value="dental">Dental Care</SelectItem>
                <SelectItem value="alternative_medicine">Alternative & Holistic</SelectItem>
                <SelectItem value="nursing">Maternal, Nursing & Allied</SelectItem>
              </SelectContent>
            </Select>
            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Country" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All countries</SelectItem>
                <SelectItem value="HU">Hungary</SelectItem>
                <SelectItem value="IR">Iran</SelectItem>
              </SelectContent>
            </Select>
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Risk" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All risk levels</SelectItem>
                <SelectItem value="low">Low risk</SelectItem>
                <SelectItem value="medium">Medium risk</SelectItem>
                <SelectItem value="high">High risk</SelectItem>
                <SelectItem value="critical">Critical risk</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-slate-400 text-sm">No providers match</div>
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
                        <span className="text-[10px] text-red-500 font-medium">Suspended</span>
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
      toast({ title: "Re-upload requested — provider notified on next page load" });
      setShowNoteForm(false);
      setNoteInput("");
      onReload();
    },
    onError: () => toast({ title: "Failed to request re-upload", variant: "destructive" }),
  });

  const reminderMutation = useMutation({
    mutationFn: async () => {
      if (!providerId) throw new Error("No provider");
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
    onSuccess: () => toast({ title: "Renewal reminder sent to provider" }),
    onError: () => toast({ title: "Failed to send reminder", variant: "destructive" }),
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
                    {STATUS_LABEL[status] || status}
                    {isExpiringSoon && ` · ${daysLeft}d left`}
                  </span>
                  {doc.expiryDate && (
                    <span className="text-xs text-slate-400">Expires: {doc.expiryDate}</span>
                  )}
                </div>
                {status === "approved" && doc.verifiedAt && (
                  <p className="text-xs text-slate-400">
                    Verified {format(new Date(doc.verifiedAt), "MMM d, yyyy")}
                    {doc.verifiedBy && <span className="ml-1">by admin</span>}
                  </p>
                )}
                {doc.adminNote && (
                  <p className="text-xs text-slate-500 italic truncate">Note: {doc.adminNote}</p>
                )}
                {doc.createdAt && (
                  <p className="text-xs text-slate-400">
                    Uploaded {format(new Date(doc.createdAt), "MMM d, yyyy")}
                    {doc.fileName && ` · ${doc.fileName}`}
                  </p>
                )}
              </div>
            ) : (
              <span className="text-xs text-slate-400">Not uploaded</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
            criticality === "mandatory" ? "border-red-200 text-red-600 bg-red-50"
            : criticality === "compliance-required" ? "border-purple-200 text-purple-600 bg-purple-50"
            : "border-slate-200 text-slate-500"}`}>
            {criticality}
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
                  title={isExpiringSoon ? `Send expiry reminder (${daysLeft}d left)` : "Send expired document reminder"}
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
                  title="Request re-upload"
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
          <p className="text-[11px] font-semibold text-orange-800 dark:text-orange-300">Request Re-upload</p>
          <Input
            placeholder="Reason (e.g. image too blurry, document expired)"
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
              Confirm
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowNoteForm(false)}>Cancel</Button>
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
      toast({ title: "Document request sent — provider will see flagged documents" });
      onOpenChange(false);
      setSelected([]);
      setDialogReason("");
      onSuccess();
    },
    onError: () => toast({ title: "Failed to send request", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) { setSelected([]); setDialogReason(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request Documents</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Select which documents to request</p>
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
                    {ph.criticality === "mandatory" ? "Required"
                      : ph.criticality === "compliance-required" ? "Compliance"
                      : "Optional"}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Reason / admin note (optional)</Label>
            <Textarea
              placeholder="e.g. Document quality too low — please re-upload a clear, legible copy."
              value={dialogReason}
              onChange={e => setDialogReason(e.target.value)}
              className="min-h-[70px] text-xs resize-none"
            />
            <p className="text-[11px] text-slate-400">This note will be shown to the provider next to each flagged document.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm"
            disabled={selected.length === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Request {selected.length > 0 ? `${selected.length} document${selected.length > 1 ? "s" : ""}` : "documents"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Category Permissions Tab ────────────────────────────────────────────────
function CategoryPermissionsTab({ providerId }: { providerId: string }) {
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
      toast({ title: "Category permissions saved" });
      queryClient.invalidateQueries({ queryKey: qKey });
      setInitialized(false);
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("DELETE", `/api/admin/providers/${providerId}/category-permissions`);
      if (!r.ok) throw new Error("Reset failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Permissions reset to defaults" });
      queryClient.invalidateQueries({ queryKey: qKey });
      setInitialized(false);
    },
    onError: () => toast({ title: "Failed to reset", variant: "destructive" }),
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
        Loading categories…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Service Category Access</h3>
          <p className="text-xs text-slate-400 mt-0.5">Control which categories this provider can offer services in.</p>
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
              Reset to defaults
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
            Save
          </Button>
        </div>
      </div>

      {/* Status banner */}
      {overrideCount > 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-3 py-2">
          <Shield className="h-3.5 w-3.5 text-blue-500 shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            <span className="font-semibold">{overrideCount} explicit override{overrideCount !== 1 ? "s" : ""}</span> active for this provider.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
          <LayoutGrid className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <p className="text-xs text-slate-500">Using platform defaults — all categories enabled.</p>
        </div>
      )}

      {/* Category rows */}
      {allCategories.length === 0 && (
        <div className="text-center py-10 text-slate-400 text-sm">No categories configured</div>
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
                    Override
                  </Badge>
                )}
                {draft[cat.id] !== (hasOverride ? permMap.get(cat.id)!.enabled : true) && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-amber-400 text-amber-600 dark:text-amber-400">
                    Unsaved
                  </Badge>
                )}
              </div>
              <Switch
                checked={isEnabled}
                onCheckedChange={(val) => setDraft((prev) => ({ ...prev, [cat.id]: val }))}
                aria-label={`Toggle ${cat.name}`}
                data-testid={`switch-category-${cat.id}`}
              />
            </div>
          );
        })}
      </div>

      {isDirty && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          You have unsaved changes. Click Save to apply.
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
  const { toast } = useToast();
  const { user: authUser } = useAuth();
  const qc = useQueryClient();
  const { format: fmtUSD } = useAdminCurrency();
  const { provider: prov, user, metrics, appointments, financials } = data;

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
    approve:            { title: "Approve Provider",          desc: "This will approve the provider and grant them access to accept bookings.", needsReason: false, variant: "green" },
    reject:             { title: "Reject Application",        desc: "This will reject the provider. Please provide a reason.", needsReason: true,  variant: "red"   },
    suspend:            { title: "Suspend Provider",          desc: "This will immediately suspend the provider account.", needsReason: true,  variant: "red"   },
    unsuspend:          { title: "Unsuspend Provider",        desc: "This will restore the provider's account access.", needsReason: false, variant: "green" },
    deactivate:         { title: "Deactivate Provider",       desc: "This will permanently deactivate this provider. They will not be able to log in or accept bookings.", needsReason: true, variant: "red" },
    reactivate:         { title: "Reactivate Account",        desc: "This will reactivate the deactivated provider account.", needsReason: false, variant: "green" },
    request_changes:    { title: "Request Profile Changes",   desc: "Provider will be moved to Action Required and notified to update their profile.", needsReason: true,  variant: "orange" },
    reset_verification: { title: "Reset Verification",        desc: "All documents will be returned to Pending and provider status set to Submitted. This cannot be undone.", needsReason: false, variant: "orange" },
    enable_bookings:    { title: "Enable Bookings",           desc: "This will allow the provider to accept new patient bookings.", needsReason: false, variant: "green" },
    disable_bookings:   { title: "Disable Bookings",          desc: "New patient bookings will be blocked for this provider. Existing appointments are unaffected.", needsReason: false, variant: "orange" },
  };

  const actionMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await apiRequest("POST", `/api/admin/providers/${prov.id}/actions`, body);
      if (!r.ok) throw new Error("Action failed");
      return r.json();
    },
    onSuccess: (_, vars) => {
      toast({ title: vars.action === "approve" ? "Provider approved" : vars.action === "suspend" ? "Provider suspended" : "Action completed" });
      setConfirmAction(null);
      setReason("");
      qc.invalidateQueries({ queryKey: ["/api/admin/providers"] });
      onRefresh();
    },
    onError: (err: any) => toast({ title: err?.message || "Action failed", variant: "destructive" }),
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
            {prov.isVerified && <ShieldCheck className="h-4 w-4 text-blue-500" title="Verified" />}
            {isSuspended && <Badge variant="destructive" className="text-xs">Suspended</Badge>}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-sm text-slate-500 capitalize">
              {prov.displayTitle || prov.display_title || prov.providerCategory || humanLabel(prov.providerType)}
            </span>
            <span className="text-slate-300">·</span>
            <StatusBadge status={prov.status} domain="provider" className="text-xs" />
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${risk.color}`}>
              Risk: {risk.label} ({metrics.computedRisk})
            </span>
            <span className="text-xs text-slate-400">{prov.countryCode} · ID …{prov.id?.slice(-6)}</span>
          </div>
          {user?.email && (
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="text-xs text-slate-500 flex items-center gap-1"><Mail className="h-3 w-3" />{user.email}</span>
              {user?.phone && <span className="text-xs text-slate-500 flex items-center gap-1"><Phone className="h-3 w-3" />{user.phone}</span>}
              {user?.createdAt && (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />Joined {format(new Date(user.createdAt), "MMM yyyy")}
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
              <CheckCircle className="h-3.5 w-3.5" />Approve
            </Button>
          )}
          {isApproved && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
              <CheckCircle className="h-3.5 w-3.5 text-green-600" />
              <span className="text-xs font-semibold text-green-700 dark:text-green-400">Approved</span>
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" data-testid="button-more-actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs font-semibold text-slate-400 uppercase">Lifecycle</DropdownMenuLabel>
              {!isApproved && !isDeactivated && (
                <DropdownMenuItem onClick={() => setConfirmAction("approve")} className="text-green-600 focus:text-green-600">
                  <CheckCircle className="h-3.5 w-3.5 mr-2" />Approve Provider
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setConfirmAction("reject")} className="text-red-600 focus:text-red-600">
                <XCircle className="h-3.5 w-3.5 mr-2" />Reject Application
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setConfirmAction("request_changes")} className="text-orange-600 focus:text-orange-600">
                <AlertCircle className="h-3.5 w-3.5 mr-2" />Request Changes
              </DropdownMenuItem>
              {isDeactivated ? (
                <DropdownMenuItem onClick={() => setConfirmAction("reactivate")} className="text-blue-600 focus:text-blue-600">
                  <Play className="h-3.5 w-3.5 mr-2" />Reactivate Account
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => setConfirmAction("deactivate")} className="text-red-700 focus:text-red-700">
                  <TimerOff className="h-3.5 w-3.5 mr-2" />Deactivate Provider
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-semibold text-slate-400 uppercase">Account</DropdownMenuLabel>
              {!isSuspended ? (
                <DropdownMenuItem onClick={() => setConfirmAction("suspend")} className="text-orange-600 focus:text-orange-600">
                  <Ban className="h-3.5 w-3.5 mr-2" />Suspend Provider
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => setConfirmAction("unsuspend")} className="text-green-600 focus:text-green-600">
                  <CheckCircle className="h-3.5 w-3.5 mr-2" />Unsuspend Provider
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setConfirmAction("enable_bookings")}>
                <Play className="h-3.5 w-3.5 mr-2" />Enable Bookings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setConfirmAction("disable_bookings")}>
                <Pause className="h-3.5 w-3.5 mr-2" />Disable Bookings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-semibold text-slate-400 uppercase">Verification</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setConfirmAction("reset_verification")}>
                <RefreshCw className="h-3.5 w-3.5 mr-2" />Reset Verification
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowReqDocsDialog(true)}>
                <ClipboardList className="h-3.5 w-3.5 mr-2" />Request Documents
              </DropdownMenuItem>
              {prov.licenseDocumentUrl && (
                <DropdownMenuItem asChild>
                  <a href={prov.licenseDocumentUrl} target="_blank" rel="noreferrer">
                    <Eye className="h-3.5 w-3.5 mr-2" />View License
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-semibold text-slate-400 uppercase">Communication</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setShowNotifForm(true)}>
                <Bell className="h-3.5 w-3.5 mr-2" />Send Notification
              </DropdownMenuItem>
              {isGlobal && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => toast({ title: "Impersonate", description: "Requires additional authorization." })}>
                    <UserIcon className="h-3.5 w-3.5 mr-2" />Impersonate (Global)
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onRefresh} title="Refresh">
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
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Health</p>
            <p className="text-[11px] text-slate-400">
              {healthScore >= 80 ? "Excellent" : healthScore >= 60 ? "Good" : healthScore >= 40 ? "Fair" : "Poor"}
            </p>
          </div>
        </div>
        {/* Revenue */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 px-4 py-3 flex items-center gap-3">
          <DollarSign className="h-5 w-5 text-green-500 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{fmtUSD(financials.revenueUsd)}</p>
            <p className="text-[11px] text-slate-400">Earnings (USD)</p>
          </div>
        </div>
        {/* Appointments */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 px-4 py-3 flex items-center gap-3">
          <Calendar className="h-5 w-5 text-blue-500 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{appointments.total}</p>
            <p className="text-[11px] text-slate-400">{appointments.completed} completed</p>
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
            <p className="text-[11px] text-slate-400">{metrics.verificationPct}% verified</p>
          </div>
        </div>
      </div>

      {/* Send Notification inline form (conditionally shown below KPIs) */}
      {showNotifForm && (
        <div className="mx-5 mb-3 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Send Notification to Provider</p>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400" onClick={() => setShowNotifForm(false)}>
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
          <Input placeholder="Title" value={notifTitle} onChange={e => setNotifTitle(e.target.value)} className="h-7 text-xs" />
          <Textarea placeholder="Message…" value={notifBody} onChange={e => setNotifBody(e.target.value)} className="text-xs min-h-[56px] resize-none" />
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
            <Send className="h-3 w-3" />Send
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
                <Label className="text-xs">Reason {confirmAction !== "request_changes" ? "(optional)" : ""}</Label>
                <Textarea
                  placeholder="Reason…"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="mt-1.5 text-sm min-h-[80px]"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setConfirmAction(null); setReason(""); }}>Cancel</Button>
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
              Confirm
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
  const { format: fmtUSD } = useAdminCurrency();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { provider: prov, user, services, practitioners, documents, appointments, financials, metrics, timeline } = data;
  const fullName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();

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
        activate: "Service reactivated",
        deactivate: "Service suspended",
        delete: "Service archived",
        restore: "Service restored",
      };
      toast({ title: msgs[vars.action] || "Service updated" });
      qc.invalidateQueries({ queryKey: ["/api/admin/providers", prov.id, "console"] });
      onRefresh();
    },
    onError: (e: any) => toast({ title: e?.message || "Action failed", variant: "destructive" }),
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
    { label: "Identity Verified",       pass: prov.isVerified,                                  impact: "high" as const,   note: prov.isVerified ? "KYC identity confirmed" : "Admin has not finalized verification" },
    { label: "Account Status",          pass: ["approved","active"].includes(prov.status),       impact: "high" as const,   note: `Current status: ${humanLabel(prov.status)}` },
    { label: "Mandatory Docs Approved", pass: metrics.pendingDocs === 0 && metrics.approvedDocs >= 3, impact: "high" as const, note: `${metrics.approvedDocs}/${metrics.totalDocs} documents approved` },
    { label: "Low Cancellation Rate",   pass: appointments.cancellationRate < 20,                impact: "medium" as const, note: `${appointments.cancellationRate}% cancellation rate` },
    { label: "Has Services",            pass: metrics.servicesCount > 0,                         impact: "medium" as const, note: `${metrics.servicesCount} service(s) configured` },
    { label: "Bookings Enabled",        pass: prov.bookingsEnabled !== false,                    impact: "medium" as const, note: prov.bookingsEnabled !== false ? "Accepting new bookings" : "Booking intake disabled" },
    { label: "Account Not Suspended",   pass: !user?.isSuspended,                               impact: "high" as const,   note: user?.isSuspended ? `Suspended: ${user.suspensionReason || "No reason"}` : "Account in good standing" },
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
              { id: "overview",  label: "Overview"     },
              { id: "profile",   label: "Profile"      },
              { id: "kycdocs",   label: "KYC & Docs"   },
              { id: "schedule",  label: "Schedule"     },
              { id: "services",  label: "Services"     },
              { id: "bookings",  label: "Bookings"     },
              { id: "patients",  label: "Patients"     },
              { id: "financial", label: "Financials"   },
              { id: "staff",     label: "Staff"        },
              { id: "timeline",  label: "Timeline"     },
              { id: "notes",     label: "Admin Notes"  },
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
              const scoreLabel = healthScore >= 80 ? { text: "Excellent", color: "text-green-600", bg: "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900/40" }
                : healthScore >= 60 ? { text: "Good",    color: "text-blue-600",   bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900/40" }
                : healthScore >= 40 ? { text: "Fair",    color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-900/40" }
                : { text: "Poor", color: "text-red-600", bg: "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900/40" };
              const passing = healthFactors.filter(f => f.pass).length;
              return (
                <div className={`rounded-xl border p-5 flex items-center gap-6 ${scoreLabel.bg}`}>
                  <div className="text-center flex-shrink-0">
                    <div className={`text-5xl font-bold ${scoreLabel.color}`}>{healthScore}</div>
                    <div className={`text-sm font-semibold mt-1 ${scoreLabel.color}`}>{scoreLabel.text}</div>
                  </div>
                  <div className="flex-1 space-y-2">
                    <Progress value={healthScore} className="h-3" />
                    <p className="text-xs text-slate-500">{passing}/{healthFactors.length} health factors passing</p>
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
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${f.impact === "high" ? "border-red-200 text-red-600 bg-red-50 dark:bg-red-950/20" : "border-yellow-200 text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20"}`}>{f.impact} impact</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{f.note}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { icon: Calendar,   label: "Total Appts",  value: appointments.total      },
                { icon: CheckCheck, label: "Completed",    value: appointments.completed  },
                { icon: Users,      label: "Staff",        value: metrics.staffCount      },
                { icon: Briefcase,  label: "Services",     value: metrics.servicesCount   },
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
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Internal Notes</h3>
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
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Identity</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {[
                  { label: "Full Name",            value: `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || "—" },
                  { label: "Display Title",        value: prov.displayTitle || prov.display_title || prov.professionalTitle || "—" },
                  { label: "Provider ID",          value: prov.id, mono: true },
                  { label: "User ID",              value: user?.id, mono: true },
                  { label: "Email",                value: user?.email },
                  { label: "Mobile",               value: user?.phone || prov.supportPhone || "—" },
                  { label: "Verification Status",  value: prov.isVerified ? "✓ Verified" : "Not Verified" },
                  { label: "Provider Status",      value: humanLabel(prov.status) },
                  { label: "Risk Level",           value: riskLabel(metrics.computedRisk).label },
                  { label: "Joined",               value: user?.createdAt ? format(new Date(user.createdAt), "MMM d, yyyy") : "—" },
                  { label: "Last Updated",         value: prov.updatedAt ? format(new Date(prov.updatedAt), "MMM d, yyyy") : "—" },
                  { label: "Bookings",             value: prov.bookingsEnabled === false ? "Disabled" : "Enabled" },
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
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Professional</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {[
                  { label: "Category",             value: prov.providerCategory || humanLabel(prov.providerType) },
                  { label: "Subcategory",          value: prov.providerSubcategory || "—" },
                  { label: "Provider Type",        value: humanLabel(prov.providerType) },
                  { label: "Account Type",         value: humanLabel(prov.accountType) },
                  { label: "Specialization",       value: prov.specialization || "—" },
                  { label: "Professional Title",   value: prov.professionalTitle || "—" },
                  { label: "Languages",            value: (prov.languages || []).join(", ") || "—" },
                  { label: "Service Modes",        value: (prov.serviceModes || []).map(humanLabel).join(", ") || "—" },
                  { label: "Years Experience",     value: prov.yearsExperience != null ? `${prov.yearsExperience} years` : "—" },
                  { label: "Education",            value: prov.education || "—" },
                  { label: "Rating",               value: prov.rating ? `${Number(prov.rating).toFixed(1)} ★  (${prov.totalReviews || 0} reviews)` : "No reviews yet" },
                  { label: "Affiliated Hospital",  value: prov.affiliatedHospital || "—" },
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
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Bio</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{prov.bio}</p>
                </div>
              )}
            </div>

            {/* C — Location */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-green-500" />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Location</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {[
                  { label: "Country",              value: humanLabel(prov.countryCode) },
                  { label: "City",                 value: prov.city || user?.city || "—" },
                  { label: "Timezone",             value: user?.timezone || "—" },
                  { label: "Practice Address",     value: [prov.clinicAddressLine1, prov.clinicAddressLine2].filter(Boolean).join(", ") || prov.clinicFormattedAddress || "—" },
                  { label: "Practice Postal",      value: prov.clinicPostalCode || "—" },
                  { label: "Home Address",         value: [prov.permanentAddressLine1, prov.permanentAddressLine2].filter(Boolean).join(", ") || "—" },
                  { label: "Home City",            value: prov.permanentCity || "—" },
                  { label: "Home Postal",          value: prov.permanentPostalCode || "—" },
                  { label: "Home Country",         value: prov.permanentCountry || "—" },
                  { label: "Support Email",        value: prov.supportEmail || "—" },
                  { label: "Support Phone",        value: prov.supportPhone || "—" },
                  { label: "Primary Location",     value: humanLabel(prov.primaryServiceLocation) },
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
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Currency & Billing</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {(() => {
                  const nativeCcy = currencyForCountry(prov.countryCode);
                  const walletCcy = financials.walletCurrency || "USD";
                  return [
                    { label: "Native Currency",    value: humanLabel(nativeCcy), note: "Provider pricing currency" },
                    { label: "Country Currency",   value: humanLabel(nativeCcy), note: `Based on ${humanLabel(prov.countryCode)}` },
                    { label: "Wallet Currency",    value: humanLabel(walletCcy), note: "Wallet stored in" },
                    { label: "Payment Methods",    value: (prov.paymentMethods || []).join(", ") || "—" },
                    { label: "Insurance Accepted", value: (prov.insuranceAccepted || []).join(", ") || "—" },
                    { label: "Wallet Balance",     value: fmtUSD(financials.walletBalance), note: "Admin (USD)" },
                    { label: "Provider Earnings",  value: fmtUSD(financials.revenueUsd), note: "Lifetime (USD)" },
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
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Emergency Contact</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {[
                  { label: "Name",        value: user?.emergencyContactName || "Not Provided" },
                  { label: "Relationship",value: user?.emergencyContactRelation || "Not Provided" },
                  { label: "Phone",       value: user?.emergencyContactPhone || "Not Provided" },
                  { label: "Alt. Note",   value: prov.emergencyContact || "Not Provided" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start gap-2 text-sm">
                    <span className="text-xs text-slate-400 w-36 flex-shrink-0 pt-0.5">{label}</span>
                    <span className={`text-sm font-medium ${value === "Not Provided" ? "text-slate-400 italic" : "text-slate-700 dark:text-slate-300"}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* ── KYC & DOCS ───────────────────────────────────────── */}
          <TabsContent value="kycdocs" className="p-5 space-y-5 mt-0">
            {/* Verification Status */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Verification Center</h3>
              <span className={`text-xs px-2 py-1 rounded border font-medium ${
                ["approved","active"].includes(prov.status) && prov.isVerified ? "bg-green-50 border-green-200 text-green-700"
                : (prov.status === "under_review" || prov.status === "documents_verified") ? "bg-blue-50 border-blue-200 text-blue-700"
                : prov.status === "action_required" ? "bg-orange-50 border-orange-200 text-orange-700"
                : "bg-slate-50 border-slate-200 text-slate-600"
              }`}>
                {["approved","active"].includes(prov.status) && prov.isVerified ? "Fully Verified"
                  : (prov.status === "under_review" || prov.status === "documents_verified") ? "Under Review"
                  : prov.status === "action_required" ? "Action Required"
                  : (prov.status === "submitted" || prov.status === "pending_approval") ? "Awaiting Review"
                  : "Not Submitted"}
              </span>
            </div>

            {/* Professional credentials */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Professional Credentials</p>
              {[
                { label: "License Number",      value: prov.licenseNumber },
                { label: "Licensing Authority", value: prov.licensingAuthority },
                { label: "License Expiry",      value: prov.licenseExpiryDate ? format(new Date(prov.licenseExpiryDate), "MMM d, yyyy") : null },
                { label: "Govt. Photo ID Number", value: prov.nationalProviderId },
                { label: "Agreements",          value: (prov.providerAgreementAccepted && prov.dataProcessingAgreementAccepted) ? "Provider + Data Processing" : prov.providerAgreementAccepted ? "Provider only" : "Not accepted" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 text-xs">{label}</span>
                  <span className={`text-xs font-medium ${value ? "text-slate-700 dark:text-slate-300" : "text-slate-400"}`}>{value || "—"}</span>
                </div>
              ))}
            </div>

            {prov.submittedAt && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-1 text-xs">
                <p className="font-medium text-slate-600 dark:text-slate-400">Submission History</p>
                <div className="flex justify-between"><span className="text-slate-400">First submitted</span><span>{format(new Date(prov.submittedAt), "MMM d, yyyy")}</span></div>
                {prov.lastResubmittedAt && <div className="flex justify-between"><span className="text-slate-400">Last resubmitted</span><span>{format(new Date(prov.lastResubmittedAt), "MMM d, yyyy")}</span></div>}
                {prov.profileUpdatedAfterSubmission && <p className="text-orange-600 font-medium">⚠ Profile updated after submission</p>}
              </div>
            )}

            <Separator />

            {/* Documents */}
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Documents & Verification
                </h3>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="text-green-600 font-medium">{metrics.approvedDocs} approved</span>
                  <span>·</span>
                  <span className="text-yellow-600 font-medium">{metrics.pendingDocs} pending</span>
                  <span>·</span>
                  <span>{metrics.verificationPct}% verified</span>
                </div>
              </div>

              {hasDocUrgency && (
                <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/60 dark:bg-orange-950/20 p-3 flex items-start gap-2 flex-wrap">
                  <AlertTriangle className="h-3.5 w-3.5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-orange-800 dark:text-orange-300">Attention required</span>
                    {urgencyExpired > 0  && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 font-medium">{urgencyExpired} expired</span>}
                    {urgencyExpiring > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-medium">{urgencyExpiring} expiring soon</span>}
                    {urgencyReupload > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 font-medium">{urgencyReupload} need re-upload</span>}
                    {urgencyMissing > 0  && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 font-medium">{urgencyMissing} mandatory missing</span>}
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
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Services & Pricing ({services.length})</h3>
                {services.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>{services.filter((s: any) => s.isActive).length} active</span>
                    <span>·</span>
                    <span>{services.filter((s: any) => !s.isActive).length} inactive</span>
                  </div>
                )}
              </div>
              {services.length === 0 && <div className="text-center py-10 text-slate-400 text-sm">No services configured</div>}
              <div className="space-y-2">
                {services.map((svc: any) => {
                  const svcCcy = svc.currency || currencyForCountry(prov.countryCode);
                  const isPending = serviceActionMutation.isPending && (serviceActionMutation.variables as any)?.svcId === svc.id;
                  return (
                    <div key={svc.id} className={`rounded-lg border p-3 flex items-start gap-3 ${svc.isActive !== false ? "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950" : "border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30"}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{svc.name}</span>
                          {svc.isActive === false && <Badge variant="outline" className="text-[10px] text-slate-500">Inactive</Badge>}
                          {svc.deletedAt && <Badge variant="outline" className="text-[10px] text-red-500 border-red-200">Archived</Badge>}
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
                          {svc.bufferBefore > 0 && <span>+{svc.bufferBefore}m buffer</span>}
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
                            title="Restore archived service">
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" className={`h-7 px-2 text-xs ${svc.isActive !== false ? "text-amber-600 hover:text-amber-700" : "text-green-600 hover:text-green-700"}`}
                              onClick={() => serviceActionMutation.mutate({ svcId: svc.id, action: svc.isActive !== false ? "deactivate" : "activate" })}
                              title={svc.isActive !== false ? "Suspend service" : "Reactivate service"}>
                              {svc.isActive !== false ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-500 hover:text-red-600"
                              onClick={() => serviceActionMutation.mutate({ svcId: svc.id, action: "delete" })}
                              title="Archive service">
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
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Category Permissions</h3>
              <CategoryPermissionsTab providerId={prov.id} />
            </div>
          </TabsContent>

          {/* ── BOOKINGS (lazy) ───────────────────────────────────── */}
          <TabsContent value="bookings" className="p-5 space-y-4 mt-0">
            {mountedTabs.has("bookings") ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Total",     value: appointments.total,     color: "text-slate-900 dark:text-slate-100" },
                    { label: "Completed", value: appointments.completed,  color: "text-green-600" },
                    { label: "Active",    value: appointments.active,     color: "text-blue-600"  },
                    { label: "Cancelled", value: appointments.cancelled,  color: "text-red-600"   },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 text-center">
                      <div className={`text-2xl font-bold ${color}`}>{value}</div>
                      <div className="text-xs text-slate-400 mt-1">{label}</div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">Cancellation rate:</span>
                  <span className={`text-sm font-semibold ${appointments.cancellationRate >= 30 ? "text-red-600" : appointments.cancellationRate >= 15 ? "text-yellow-600" : "text-green-600"}`}>
                    {appointments.cancellationRate}%
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Recent Bookings</h3>
                {appointments.recent.length === 0 && <div className="text-center py-6 text-slate-400 text-sm">No bookings</div>}
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
                          {appt.date && format(new Date(appt.date), "MMM d, yyyy")}{appt.startTime && ` · ${appt.startTime}`}
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
                      { label: "Unique Patients", value: uniqueNames.length },
                      { label: "Total Bookings",  value: appointments.total  },
                      { label: "Completed",        value: appointments.completed },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
                        <div className="text-xs text-slate-400 mt-1">{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Engagement Metrics</p>
                    {[
                      { label: "Completion rate",  value: appointments.total > 0 ? `${Math.round((appointments.completed / appointments.total) * 100)}%` : "—" },
                      { label: "Cancellation rate", value: `${appointments.cancellationRate}%` },
                      { label: "Active bookings",  value: appointments.active },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">{label}</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{value}</span>
                      </div>
                    ))}
                  </div>
                  {uniqueNames.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent Patients</p>
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
                    {/* P4: revenueUsd is already USD (from provider_earnings.provider_earning) */}
                    <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{fmtUSD(financials.revenueUsd)}</div>
                    <div className="text-xs text-slate-400">Lifetime Earnings (USD)</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-5 text-center space-y-1">
                    <Wallet className="h-6 w-6 text-blue-500 mx-auto" />
                    <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{fmtUSD(financials.walletBalance)}</div>
                    <div className="text-xs text-slate-400">Wallet Balance (USD)</div>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Financial Summary</h3>
                  <div className="space-y-2 text-sm">
                    {[
                      { label: "Completed appointments", value: appointments.completed },
                      { label: "Cancellation rate",      value: `${appointments.cancellationRate}%` },
                      { label: "Avg earnings / appt",    value: appointments.completed > 0 ? fmtUSD(Number(financials.revenueUsd) / appointments.completed) : "—" },
                      { label: "Native currency",        value: humanLabel(currencyForCountry(prov.countryCode)) },
                      { label: "Wallet currency",        value: humanLabel(financials.walletCurrency || "USD") },
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
            {practitioners.length === 0 && <div className="text-center py-10 text-slate-400 text-sm">No staff members</div>}
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
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Activity Timeline</h3>
                {timeline.length === 0 && <div className="text-center py-10 text-slate-400 text-sm">No activity recorded</div>}
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
                              {entry.createdAt && format(new Date(entry.createdAt), "MMM d, yyyy HH:mm")}
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
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Internal Admin Notes</h3>
        <span className="text-xs text-slate-400">{notes.length} note{notes.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="space-y-2">
        <Textarea
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          placeholder="Add an internal note about this provider — only admins can see this…"
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
          Add Note
        </Button>
      </div>
      {notesLoading ? (
        <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />)}</div>
      ) : notes.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">No notes yet — add the first one above.</div>
      ) : (
        <div className="space-y-2">
          {notes.map((note: any) => (
            <div key={note.id} className={`rounded-xl border p-3.5 transition-colors ${note.isPinned ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800" : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700"}`}>
              <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{note.content}</p>
              <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="font-medium text-slate-500 dark:text-slate-400">{note.adminName}</span>
                  <span>·</span>
                  <span>{new Date(note.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
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
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">Provider Command Center</h3>
            <p className="text-sm text-slate-400 mt-2 max-w-xs">
              Select a provider from the directory to manage their profile, documents, services, and operations.
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
            Failed to load provider data
          </div>
        )}
      </div>
    </div>
  );
}
