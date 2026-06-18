import React, { useState, useEffect, useMemo, Component } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { QK } from "@/lib/query-keys";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Header } from "@/components/header";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { ProviderPayoutPanel } from "@/components/provider-payout-panel";
import { ProviderWalletPanel } from "@/components/provider-wallet-panel";
import { NewTicketDialog } from "@/components/new-ticket-dialog";
import { ReportBugDialog } from "@/components/report-bug-dialog";
import { GroupSessionsPanel } from "@/components/group-sessions-panel";
import { AppointmentTimeContext } from "@/components/appointment/AppointmentTimeContext";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AvatarSM } from "@/components/ui/provider-image";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrency, formatInCurrency } from "@/lib/currency";
import {
  Calendar as CalendarIcon,
  Clock,
  DollarSign,
  Star,
  Users,
  TrendingUp,
  FileText,
  Image as ImageIcon,
  Plus,
  Banknote,
  Wallet,
  Settings,
  Shield,
  Lock,
  Pencil,
  BarChart2,
  CalendarDays,
  Reply,
  AlertTriangle,
  Zap,
  ChevronRight,
  MessageSquare,
  Bug,
  Bell,
  UserRound,
  LayoutDashboard,
  Briefcase,
  MapPin,
  Stethoscope,
  FileCheck,
  Loader2,
  ClipboardCheck,
  SendHorizonal,
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, Tooltip } from "recharts";
import type { AppointmentWithDetails, Provider, ProviderWithServices, ReviewWithPatient } from "@shared/schema";
import { usePageTitle } from "@/hooks/use-page-title";

// ── Extracted sub-components ──────────────────────────────────────────────────
import { ProviderAppointmentsTabs } from "@/components/provider/dashboard/ProviderAppointmentsTabs";
import { ProviderServicesTab } from "@/components/provider/dashboard/ProviderServicesTab";
import { ProviderProfileTab } from "@/components/provider/dashboard/ProviderProfileTab";
import type { ProfileSection, ProfileSubSection } from "@/components/provider/dashboard/ProviderProfileTab";
import { normalizeSection } from "@/components/provider/dashboard/ProviderProfileTab";
import { ProviderAnalyticsTabContent } from "@/components/provider/dashboard/ProviderAnalyticsTab";
import { ProviderReportingCenter } from "@/components/provider/dashboard/ProviderReportingCenter";
import { ProviderTimeEngine } from "@/components/provider/dashboard/ProviderTimeEngine";
import { SmartScheduler } from "@/components/provider/SmartScheduler";
import { PayoutSettings } from "@/components/provider/PayoutSettings";

// ── Provider Insights data types ───────────────────────────────────────────────
interface InsightsData {
  weeklyRevenue: { week: string; revenue: number; count: number }[];
  heatmap: number[][];
  kpi: {
    cancellationRate: number;
    utilizationPct: number;
    bookingConversionRate: number;
    repeatPatientPct: number;
    lostBookings: number;
    totalCompleted: number;
    totalBookings: number;
  };
  popularServices: { name: string; count: number }[];
  repeatPatients: { patientId: string; name: string; visitCount: number; lastVisit: string; totalSpend: number }[];
  growthTips?: string[];
}

// ── Profile completeness helpers ──────────────────────────────────────────────
const PROFILE_SECTIONS: { section: ProfileSection; label: string; icon: string; checks: (p: any) => { label: string; done: boolean }[] }[] = [
  { section: "professional", label: "Professional Info", icon: "👤", checks: (p: any) => [
    { label: "Specialization", done: !!p.specialization },
    { label: "Bio / About you", done: !!p.bio },
    { label: "Years of experience", done: p.yearsExperience != null && p.yearsExperience > 0 },
    { label: "Education", done: !!p.education },
  ]},
  { section: "verification", label: "Credentials & KYC", icon: "🪪", checks: (p: any) => [
    { label: "License number", done: !!p.licenseNumber },
    { label: "Licensing authority", done: !!p.licensingAuthority },
  ]},
  { section: "workplace", label: "Workplace", icon: "📍", checks: (p: any) => [
    { label: "Primary location", done: !!p.primaryServiceLocation || !!p.city },
    { label: "City", done: !!p.city },
  ]},
  { section: "services", label: "Service Delivery", icon: "🩺", checks: (p: any) => [
    { label: "At least one service mode", done: Array.isArray(p.serviceModes) && p.serviceModes.length > 0 },
  ]},
] as { section: ProfileSubSection; label: string; icon: string; checks: (p: any) => { label: string; done: boolean }[] }[];

function ProfileCompletenessCard({
  provider,
  onProfileClick,
}: {
  provider: any;
  onProfileClick?: (section?: ProfileSubSection) => void;
}) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("profile_completeness_dismissed") === "1"; } catch { return false; }
  });

  if (!provider) return null;

  const allChecks = PROFILE_SECTIONS.flatMap((s) => s.checks(provider));
  const totalFields = allChecks.length;
  const filledFields = allChecks.filter((c) => c.done).length;
  const pct = Math.round((filledFields / totalFields) * 100);

  if (pct === 100 || dismissed) return null;

  const incompleteSections = PROFILE_SECTIONS.filter((s) => s.checks(provider).some((c) => !c.done));

  const getColor = () => pct >= 80 ? "text-emerald-600 dark:text-emerald-400" : pct >= 50 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400";

  return (
    <div className="mb-6 rounded-2xl border border-border bg-gradient-to-br from-background to-muted/30 shadow-sm overflow-hidden" data-testid="card-profile-completeness">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative h-14 w-14 flex-shrink-0">
              <svg className="h-14 w-14 -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="24" fill="none" stroke="currentColor" strokeWidth="4" className="text-muted/30" />
                <circle cx="28" cy="28" r="24" fill="none" stroke="currentColor" strokeWidth="4"
                  strokeDasharray={`${(pct / 100) * 150.8} 150.8`} strokeLinecap="round" className={getColor()} />
              </svg>
              <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${getColor()}`}>{pct}%</span>
            </div>
            <div>
              <p className="font-semibold text-sm">Profile completeness</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {pct < 50 ? "Your profile needs more info before clients can find and book you."
                  : pct < 80 ? "Almost there — a few more fields and you'll be discoverable."
                  : "Looking good! Just a few optional items remaining."}
              </p>
            </div>
          </div>
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
            onClick={() => { localStorage.setItem("profile_completeness_dismissed", "1"); setDismissed(true); }}
            data-testid="button-dismiss-profile-completeness"
          >
            Dismiss
          </button>
        </div>
        <div className="mt-4">
          <Progress value={pct} className="h-1.5" />
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {incompleteSections.map((section) => {
            const missing = section.checks(provider).filter((c) => !c.done);
            return (
              <button key={section.section}
                onClick={() => onProfileClick?.(section.section as ProfileSubSection)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-background hover:border-primary/50 hover:bg-primary/5 transition-all text-sm text-muted-foreground hover:text-foreground group"
                data-testid={`button-complete-section-${section.section}`}>
                <span>{section.icon}</span>
                <span className="font-medium">{section.label}</span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{missing.length}</Badge>
                <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Provider Insights Tab ─────────────────────────────────────────────────────
function ProviderInsightsTab({ data, fmtMoney }: { data: InsightsData; fmtMoney: (v: number) => string; }) {
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const BUSINESS_HOURS = Array.from({ length: 14 }, (_, i) => i + 7);
  const heatMax = Math.max(1, ...(data.heatmap ?? []).flatMap((row) => row));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card data-testid="kpi-completion-rate"><CardContent className="pt-5 pb-4">
          <p className="text-xs text-muted-foreground">Completion rate</p>
          <p className="text-2xl font-bold mt-1">{data.kpi.utilizationPct}%</p>
          <p className="text-xs text-muted-foreground mt-1">{data.kpi.totalCompleted} of {data.kpi.totalBookings} bookings</p>
        </CardContent></Card>
        <Card data-testid="kpi-cancellation-rate"><CardContent className="pt-5 pb-4">
          <p className="text-xs text-muted-foreground">Cancellation rate</p>
          <p className="text-2xl font-bold mt-1 text-rose-600 dark:text-rose-400">{data.kpi.cancellationRate}%</p>
          <p className="text-xs text-muted-foreground mt-1">Lost: {data.kpi.lostBookings} bookings</p>
        </CardContent></Card>
        <Card data-testid="kpi-repeat-patients"><CardContent className="pt-5 pb-4">
          <p className="text-xs text-muted-foreground">Repeat clients</p>
          <p className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">{data.kpi.repeatPatientPct}%</p>
          <p className="text-xs text-muted-foreground mt-1">{data.repeatPatients.length} loyal clients</p>
        </CardContent></Card>
        <Card data-testid="kpi-conversion-rate"><CardContent className="pt-5 pb-4">
          <p className="text-xs text-muted-foreground">Booking conversion</p>
          <p className="text-2xl font-bold mt-1">{data.kpi.bookingConversionRate}%</p>
          <p className="text-xs text-muted-foreground mt-1">Last 12 months</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Revenue · last 12 weeks</CardTitle></CardHeader>
        <CardContent style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.weeklyRevenue}>
              <Tooltip formatter={(v: any) => fmtMoney(Number(v))} />
              <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="hsl(var(--primary) / 0.1)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {data.repeatPatients.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Loyal clients</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.repeatPatients.slice(0, 10).map((p) => (
                <div key={p.patientId} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0" data-testid={`row-repeat-patient-${p.patientId}`}>
                  <div>
                    <span className="font-medium text-sm">{p.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">· {p.visitCount} visits</span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Last: {p.lastVisit}</div>
                    <div className="text-sm font-medium">{fmtMoney(p.totalSpend)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(data.growthTips ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Growth Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {(data.growthTips ?? []).map((tip, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm" data-testid={`growth-tip-${i}`}>
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold">{i + 1}</span>
                  <span className="text-muted-foreground leading-relaxed">{tip}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Busy periods · last 6 months</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="grid gap-0.5" style={{ gridTemplateColumns: `44px repeat(7, 1fr)`, minWidth: 340 }}>
              <div />
              {DAYS.map((d) => <div key={d} className="text-center text-[10px] font-medium text-muted-foreground pb-1">{d}</div>)}
              {BUSINESS_HOURS.map((hour) => (
                <React.Fragment key={hour}>
                  <div className="text-[10px] text-muted-foreground flex items-center justify-end pr-1.5 h-6">{String(hour).padStart(2, "0")}:00</div>
                  {DAYS.map((_, dow) => {
                    const cnt = data.heatmap[dow]?.[hour] ?? 0;
                    const intensity = cnt === 0 ? 0 : Math.max(0.1, cnt / heatMax);
                    return (
                      <div key={`${dow}-${hour}`} title={cnt > 0 ? `${cnt} appointment${cnt > 1 ? "s" : ""}` : "No appointments"}
                        className="h-6 rounded-sm border border-border/40" data-testid={`heatmap-cell-${dow}-${hour}`}
                        style={{ backgroundColor: cnt === 0 ? "hsl(var(--muted))" : `hsl(var(--primary) / ${Math.round(intensity * 100)}%)` }} />
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function ProviderDashboard() {
  const { t } = useTranslation();
  usePageTitle(t("provider_dashboard.meta_title", "Provider Dashboard"));
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { format: fmtMoney } = useCurrency();

  const [activeTab, setActiveTab] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") || "overview";
  });
  const [highlightApptId, setHighlightApptId] = useState<string | null>(null);
  const [profileOpenSection, setProfileOpenSection] = useState<ProfileSection | undefined>(undefined);
  const [profileSection, setProfileSection] = useState<ProfileSubSection>("overview");
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [reportBugOpen, setReportBugOpen] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [patientTimelineId, setPatientTimelineId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab) {
      setActiveTab(tab);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: providerData, isLoading: isLoadingProvider } = useQuery<ProviderWithServices>({
    queryKey: QK.providerMe(),
  });

  // appointment.totalAmount is in the provider's booking currency (HUF/IRR/USD), NOT USD.
  // fmtMoney (useCurrency) converts FROM USD — using it on booking-currency amounts
  // double-converts for HUF/IRR providers. Use fmtEarnings (formatInCurrency, no
  // conversion) for all analytics/earnings values that originate from appointment.totalAmount.
  const providerNativeCurrency =
    providerData?.countryCode === "IR" ? "IRR" :
    providerData?.countryCode === "HU" ? "HUF" :
    "USD";
  const fmtEarnings = (n: number) => formatInCurrency(n, providerNativeCurrency);

  const appointmentTabs = new Set(["upcoming", "active", "history", "calendar", "analytics"]);
  const { data: appointments, isLoading: isLoadingAppointments } = useQuery<AppointmentWithDetails[]>({
    queryKey: QK.providerAppointments(),
    enabled: !!providerData?.id,
    refetchInterval: appointmentTabs.has(activeTab) ? 60_000 : false,
    staleTime: 30_000,
  });

  const { data: providerWithServices } = useQuery<ProviderWithServices>({
    queryKey: QK.provider(providerData?.id ?? ""),
    enabled: !!providerData?.id,
  });

  const { data: providerReviews } = useQuery<ReviewWithPatient[]>({
    queryKey: QK.providerReviews(providerData?.id ?? ""),
    enabled: !!providerData?.id && activeTab === "reviews",
  });

  const { data: insightsData, isLoading: insightsLoading } = useQuery<InsightsData>({
    queryKey: QK.providerInsights(),
    enabled: activeTab === "insights",
  });

  const { data: providerDocs = [] } = useQuery<any[]>({
    queryKey: ["/api/provider/documents"],
    staleTime: 30_000,
    enabled: !!providerData,
  });
  const rejectedDocCount = providerDocs.filter((d: any) =>
    d.verificationStatus === "rejected" || d.verificationStatus === "reupload_requested"
  ).length;

  // ── Mutations ──────────────────────────────────────────────────────────────
  const replyMutation = useMutation({
    mutationFn: async ({ id, reply }: { id: string; reply: string }) => {
      const res = await apiRequest("PATCH", `/api/reviews/${id}/reply`, { reply });
      return res.json();
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: QK.providerReviews(providerData?.id ?? "") });
      setReplyDrafts((d) => { const n = { ...d }; delete n[id]; return n; });
      toast({ title: t("provider_dashboard.toast_reply_sent", "Reply sent") });
    },
    onError: () => toast({ title: t("provider_dashboard.toast_reply_failed", "Failed to send reply"), variant: "destructive" }),
  });


  const BLOCKED_SUBMIT_STATUSES = ["submitted", "pending_approval", "approved", "active", "suspended", "deactivated"];

  // Consent dialog state — must accept both agreements before submitting
  const [consentDialogOpen, setConsentDialogOpen] = useState(false);
  const [agreedToProvider, setAgreedToProvider] = useState(false);
  const [agreedToData, setAgreedToData] = useState(false);
  const consentComplete = agreedToProvider && agreedToData;

  const submitReviewMutation = useMutation({
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
      queryClient.invalidateQueries({ queryKey: ["/api/provider/me"] });
      toast({ title: "Submitted for review!", description: "Our compliance team will review your profile within 1–3 business days." });
    },
    onError: (e: any) => {
      const msg = e?.message || "Submission failed";
      toast({ title: "Submission failed", description: msg, variant: "destructive" });
    },
  });

  // ── Stats derived from appointments ──────────────────────────────────────
  const allAppointments = appointments || [];
  const userTz = (user as any)?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: userTz }).format(new Date());
  const actionableStatuses = ["pending", "approved", "confirmed", "rescheduled", "reschedule_requested", "reschedule_proposed"];
  const terminalStatuses = ["completed", "cancelled", "cancelled_by_patient", "cancelled_by_provider", "rejected", "expired", "no_show"];
  const todayAppointments = allAppointments.filter((a) => a.date === todayStr && !terminalStatuses.includes(a.status));
  const upcomingAppointments = allAppointments.filter((a) =>
    actionableStatuses.includes(a.status) && a.date > todayStr
  );
  const activeAppointments = allAppointments.filter((a) =>
    a.status === "in_progress" || (actionableStatuses.includes(a.status) && a.date === todayStr)
  );
  const historyAppointments = allAppointments.filter((a) =>
    terminalStatuses.includes(a.status) ||
    (actionableStatuses.includes(a.status) && a.date < todayStr)
  );
  const completedAppointments = allAppointments.filter((a) => a.status === "completed");
  const cancelledAppointments = allAppointments.filter((a) =>
    ["cancelled", "cancelled_by_patient", "cancelled_by_provider", "rejected", "expired", "no_show"].includes(a.status)
  );

  const uniquePatientCount = new Set(allAppointments.map((a) => a.patientId)).size;

  const uniqueClients = useMemo(() => {
    const map = new Map<string, { patientId: string; name: string; avatarUrl?: string | null; visitCount: number; lastVisit: string; totalSpend: number }>();
    for (const a of allAppointments) {
      const patient = (a as any).patient;
      const pid = a.patientId;
      if (!pid) continue;
      const existing = map.get(pid);
      const spend = a.status === "completed" ? Number((a as any).totalAmount || 0) : 0;
      if (existing) {
        existing.visitCount++;
        if (a.date > existing.lastVisit) existing.lastVisit = a.date;
        existing.totalSpend += spend;
      } else {
        map.set(pid, {
          patientId: pid,
          name: patient ? `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim() : "",
          avatarUrl: patient?.avatarUrl,
          visitCount: 1,
          lastVisit: a.date,
          totalSpend: spend,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.visitCount - a.visitCount);
  }, [allAppointments]);
  const pendingCount = allAppointments.filter((a) => a.status === "pending").length;
  const totalEarnings = completedAppointments.reduce((s, a) => s + Number((a as any).totalAmount ?? (a as any).total_amount ?? 0), 0);
  const now = new Date();
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(now); monthAgo.setDate(monthAgo.getDate() - 30);
  const prevMonthAgo = new Date(now); prevMonthAgo.setDate(prevMonthAgo.getDate() - 60);
  const weeklyEarnings = completedAppointments.filter((a) => a.date >= weekAgo.toISOString().slice(0, 10)).reduce((s, a) => s + Number((a as any).totalAmount ?? (a as any).total_amount ?? 0), 0);
  const monthlyEarnings = completedAppointments.filter((a) => a.date >= monthAgo.toISOString().slice(0, 10)).reduce((s, a) => s + Number((a as any).totalAmount ?? (a as any).total_amount ?? 0), 0);
  const prevMonthEarnings = completedAppointments.filter((a) => a.date >= prevMonthAgo.toISOString().slice(0, 10) && a.date < monthAgo.toISOString().slice(0, 10)).reduce((s, a) => s + Number((a as any).totalAmount ?? (a as any).total_amount ?? 0), 0);
  const todayEarnings = completedAppointments.filter((a) => a.date === todayStr).reduce((s, a) => s + Number((a as any).totalAmount ?? (a as any).total_amount ?? 0), 0);
  const avgPerBooking = completedAppointments.length > 0 ? totalEarnings / completedAppointments.length : 0;
  const monthlyGrowthPct = prevMonthEarnings > 0 ? ((monthlyEarnings - prevMonthEarnings) / prevMonthEarnings) * 100 : 0;
  const completionRate = allAppointments.length > 0 ? Math.round((completedAppointments.length / allAppointments.length) * 100) : 0;
  const cancellationRate = allAppointments.length > 0
    ? Math.round((cancelledAppointments.length / allAppointments.length) * 100)
    : 0;
  const pendingCashCount = allAppointments.filter((a) => {
    const p = (a as any).payment;
    return p?.status === "pending" && ["cash", "bank_transfer"].includes(p?.paymentMethod) && !["cancelled", "cancelled_by_patient", "cancelled_by_provider", "rejected", "no_show", "expired"].includes(a.status);
  }).length;

  const sparkData = (() => {
    const data: { v: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      data.push({ v: completedAppointments.filter((a) => a.date === key).reduce((s, a) => s + Number((a as any).totalAmount || 0), 0) });
    }
    return data;
  })();

  // ── Loading / onboarding gates ────────────────────────────────────────────
  const providerStatus = (providerData as any)?.status as string | undefined;
  const isApproved = providerStatus === "approved" || providerStatus === "active";
  const [lockedModalOpen, setLockedModalOpen] = useState(false);

  if (!isLoadingProvider && (!providerData || providerStatus === "draft") && activeTab !== "profile") {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center bg-muted/30">
          <div className="text-center p-8 bg-card rounded-xl border shadow-lg max-w-md mx-4">
            <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-3 text-foreground tracking-tight">
              {t("provider_dashboard.complete_profile_title", "Complete Your Profile")}
            </h1>
            <p className="text-muted-foreground mb-8 text-balance leading-relaxed">
              {t("provider_dashboard.complete_profile_desc", "To start managing appointments and services, you'll need to set up your professional profile first.")}
            </p>
            <div className="flex flex-col gap-3">
              <Button size="lg" className="w-full font-semibold shadow-sm" onClick={() => setActiveTab("profile")} data-testid="button-setup-profile">
                {t("provider_dashboard.setup_profile_btn", "Complete My Profile")}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full gap-2"
                onClick={() => setConsentDialogOpen(true)}
                disabled={submitReviewMutation.isPending}
                data-testid="button-gate-submit-review"
              >
                {submitReviewMutation.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <SendHorizonal className="h-4 w-4" />}
                Submit for Review
              </Button>
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setLocation("/providers")}>
                {t("provider_dashboard.browse_others", "Browse Other Providers")}
              </Button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ── Pending Approval: show premium verification-shield screen ────────────
  if (!isLoadingProvider && (providerStatus === "submitted" || providerStatus === "pending_approval" || providerStatus === "pending" || providerStatus === "under_review" || providerStatus === "documents_verified") && activeTab !== "profile") {
    return (
      <div className="min-h-screen flex flex-col dark:bg-[#0d0f1a]">
        <Header />
        <main className="flex-1 flex items-center justify-center py-16 px-4">
          <div className="max-w-lg w-full mx-auto text-center">
            <div className="inline-flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 ring-8 ring-primary/5 mb-6">
              <Shield className="h-12 w-12 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-3 text-foreground tracking-tight">Under Compliance Review</h1>
            <p className="text-muted-foreground mb-6 leading-relaxed text-balance">
              Your credentials and professional materials are currently undergoing active medical compliance verification by our licensed review team. This process typically takes <strong>1–3 business days</strong>.
            </p>
            <div className="rounded-2xl border border-border bg-card p-6 text-left mb-6 shadow-sm">
              <h2 className="font-semibold text-sm text-foreground mb-4">What happens next?</h2>
              <ul className="space-y-3">
                {[
                  "Our compliance team reviews your license, credentials, and bio.",
                  "You'll receive an email once approved (or with feedback if changes are needed).",
                  "Once approved, your profile goes live and patients can start booking you.",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <span className="mt-0.5 h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center flex-shrink-0 font-bold">{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-3">
              <Button variant="outline" onClick={() => setActiveTab("profile")} data-testid="button-edit-while-pending">
                <Pencil className="h-4 w-4 mr-2" /> Edit Your Profile
              </Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setLocation("/providers")}>
                Browse Other Providers
              </Button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col dark:bg-[#0d0f1a]">
      <Header />
      <PageBreadcrumbs items={[{ label: "Provider Dashboard" }]} />
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left sidebar navigation ────────────────────────────────────────── */}
        <aside className="hidden md:flex w-[260px] shrink-0 flex-col bg-[#121420] border-r border-[#1f2235] p-4 overflow-y-auto">

          {/* ── Sidebar status card ───────────────────────────────────────────── */}
          {providerStatus && (() => {
            const isActionRequired = providerStatus === "action_required";
            const isDraft = providerStatus === "draft";
            const isPending = providerStatus === "submitted" || providerStatus === "pending_approval" || providerStatus === "under_review";
            const isLive = providerStatus === "approved" || providerStatus === "active";
            const isRejected = providerStatus === "rejected";
            const borderCls = isActionRequired ? "border-rose-500/30 bg-rose-500/10"
              : isDraft ? "border-amber-500/30 bg-amber-500/10"
              : isPending ? "border-blue-500/30 bg-blue-500/10"
              : isLive ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-white/10 bg-white/5";
            const pillCls = isActionRequired ? "bg-rose-500/20 text-rose-400"
              : isDraft ? "bg-amber-500/20 text-amber-400"
              : isPending ? "bg-blue-500/20 text-blue-400"
              : isLive ? "bg-emerald-500/20 text-emerald-400"
              : "bg-white/10 text-white/50";
            const labelMap: Record<string, string> = {
              draft: "Draft", action_required: "Action Required", submitted: "Submitted",
              pending_approval: "Under Review", under_review: "Under Review",
              approved: "Approved", active: "Active", rejected: "Rejected",
              suspended: "Suspended", deactivated: "Deactivated",
            };
            return (
              <div className={`mb-4 rounded-xl p-3 border ${borderCls}`} data-testid="sidebar-status-card">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Account Status</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${pillCls}`}>
                    {labelMap[providerStatus] ?? providerStatus.replace(/_/g, " ")}
                  </span>
                </div>
                {isActionRequired && rejectedDocCount > 0 && (
                  <p className="text-[11px] text-rose-400 flex items-center gap-1 mb-2">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {rejectedDocCount} doc{rejectedDocCount !== 1 ? "s" : ""} need{rejectedDocCount === 1 ? "s" : ""} attention
                  </p>
                )}
                {isActionRequired && rejectedDocCount === 0 && (
                  <p className="text-[11px] text-rose-400/80 mb-2">Update your profile then resubmit.</p>
                )}
                {isDraft && (
                  <p className="text-[11px] text-amber-400/80 mb-2">Complete your profile &amp; submit for review.</p>
                )}
                {isPending && (
                  <p className="text-[11px] text-blue-400/80">Compliance review · 1–3 business days</p>
                )}
                {isLive && (
                  <p className="text-[11px] text-emerald-400">✓ Profile is live — accepting bookings</p>
                )}
                {isRejected && (
                  <p className="text-[11px] text-rose-400/80 mb-2">Review rejected. See feedback above.</p>
                )}
                {(isDraft || isActionRequired) && (
                  <button
                    className="w-full mt-1 text-[11px] font-semibold py-1.5 px-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 transition-colors text-center disabled:opacity-50"
                    onClick={() => setConsentDialogOpen(true)}
                    disabled={submitReviewMutation.isPending}
                    data-testid="button-sidebar-submit-review"
                  >
                    {submitReviewMutation.isPending ? "Submitting…" : isActionRequired ? "Resubmit for Review →" : "Submit for Review →"}
                  </button>
                )}
              </div>
            );
          })()}

          {([
            { group: "OVERVIEW", items: [
              { label: "Practice Overview", value: "overview", icon: <LayoutDashboard className="h-4 w-4" />, badge: 0 },
              { label: t("provider_dashboard.tab_upcoming","Upcoming"), value: "upcoming", icon: <CalendarIcon className="h-4 w-4" />, badge: upcomingAppointments.length },
              { label: t("provider_dashboard.tab_active","Active Today"), value: "active", icon: <Zap className="h-4 w-4" />, badge: activeAppointments.length },
              { label: t("provider_dashboard.tab_calendar","Calendar"), value: "calendar", icon: <CalendarDays className="h-4 w-4" />, badge: 0 },
              { label: t("provider_dashboard.tab_history","History"), value: "history", icon: <Clock className="h-4 w-4" />, badge: historyAppointments.length },
            ]},
            { group: "CLIENTS", items: [
              { label: t("provider_dashboard.tab_clients","Clients"), value: "clients", icon: <Users className="h-4 w-4" />, badge: uniquePatientCount },
              { label: t("provider_dashboard.tab_reviews","Reviews"), value: "reviews", icon: <Star className="h-4 w-4" />, badge: providerReviews?.length ?? 0 },
            ]},
            { group: "SCHEDULE", items: [
              { label: t("provider_dashboard.tab_availability","Availability"), value: "availability", icon: <CalendarDays className="h-4 w-4" />, badge: 0, locked: !isApproved },
              { label: "Time Engine", value: "time-engine", icon: <Zap className="h-4 w-4" />, badge: 0, locked: !isApproved },
            ]},
            { group: "ANALYTICS", items: [
              { label: t("provider_dashboard.tab_analytics","Analytics"), value: "analytics", icon: <TrendingUp className="h-4 w-4" />, badge: 0 },
              { label: t("provider_dashboard.tab_insights","Insights"), value: "insights", icon: <BarChart2 className="h-4 w-4" />, badge: 0 },
            ]},
            { group: "FINANCE", items: [
              { label: "Wallet & Payouts", value: "payouts", icon: <Wallet className="h-4 w-4" />, badge: 0 },
              { label: "Earnings & Reports", value: "__nav__/provider/earnings", icon: <Banknote className="h-4 w-4" />, badge: 0 },
              { label: "Memberships & Packages", value: "__nav__/packages", icon: <TrendingUp className="h-4 w-4" />, badge: 0 },
            ]},
            { group: "SERVICES", items: [
              { label: t("provider_dashboard.tab_services","Service Catalog"), value: "services", icon: <FileText className="h-4 w-4" />, badge: 0, locked: !isApproved },
              { label: t("provider_dashboard.tab_group_sessions","Group Sessions"), value: "group-sessions", icon: <Users className="h-4 w-4" />, badge: 0, locked: !isApproved },
            ]},
            { group: "PROFILE", items: [
              { label: "Overview",      value: "profile", profileSection: "overview"      as ProfileSubSection, icon: <LayoutDashboard className="h-4 w-4" />, badge: 0 },
              { label: "Personal Info", value: "profile", profileSection: "personal"      as ProfileSubSection, icon: <UserRound className="h-4 w-4" />, badge: 0 },
              { label: "Professional",  value: "profile", profileSection: "professional"  as ProfileSubSection, icon: <Briefcase className="h-4 w-4" />, badge: 0 },
              { label: "Workplace",     value: "profile", profileSection: "workplace"     as ProfileSubSection, icon: <MapPin className="h-4 w-4" />, badge: 0 },
              { label: "Services",      value: "profile", profileSection: "services"      as ProfileSubSection, icon: <Stethoscope className="h-4 w-4" />, badge: 0 },
              { label: "Documents",     value: "profile", profileSection: "verification"  as ProfileSubSection, icon: <FileCheck className="h-4 w-4" />, badge: rejectedDocCount, alert: rejectedDocCount > 0 },
              { label: "Settings",      value: "profile", profileSection: "settings"      as ProfileSubSection, icon: <Settings className="h-4 w-4" />, badge: 0 },
            ]},
          ] as { group: string; items: { label: string; value: string; icon: React.ReactNode; badge: number; alert?: boolean; locked?: boolean; profileSection?: ProfileSubSection }[] }[]).map(({ group, items }) => (
            <div key={group} className="mb-4">
              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest px-2 mb-1 mt-2">{group}</p>
              {items.map(({ label, value, icon, badge, alert: itemAlert, locked, profileSection: itemSection }) => {
                const isActive = itemSection
                  ? activeTab === "profile" && profileSection === itemSection
                  : activeTab === value;
                return (
                  <button key={itemSection ?? value}
                    onClick={() => {
                      if (locked) { setLockedModalOpen(true); return; }
                      if (value.startsWith("__nav__")) { setLocation(value.replace("__nav__", "")); return; }
                      if (itemSection) { setProfileSection(itemSection); setActiveTab("profile"); }
                      else setActiveTab(value);
                    }}
                    data-testid={`sidebar-nav-${itemSection ?? value}`}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                      locked
                        ? "text-white/30 cursor-default"
                        : isActive ? "bg-white/15 text-white font-medium" : "text-white/60 hover:bg-white/10 hover:text-white/90"
                    }`}>
                    <span className={`shrink-0 ${locked ? "text-white/20" : itemAlert ? "text-rose-400" : "text-white/50"}`}>{icon}</span>
                    <span className="flex-1 truncate">{label}</span>
                    {locked
                      ? <Lock className="h-3 w-3 text-white/25 shrink-0" />
                      : badge > 0
                        ? <span className={`shrink-0 rounded-full text-[10px] px-1.5 py-0.5 min-w-[18px] text-center leading-tight font-semibold ${itemAlert ? "bg-rose-500 text-white" : "bg-white/20 text-white/90"}`}>{badge}</span>
                        : itemAlert ? <span className="shrink-0 h-2 w-2 rounded-full bg-rose-500 animate-pulse" /> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </aside>
        {/* ── Right content canvas ─────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto py-8">
        <div className="container mx-auto px-4">

          {/* ── Dashboard Hero header ───────────────────────────── */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-indigo-600 text-white p-6 mb-6 shadow-lg">
            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-12 -left-8 h-36 w-36 rounded-full bg-white/10 blur-3xl pointer-events-none" />
            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                  <Shield className="h-7 w-7 text-white" />
                </div>
                <div>
                  <p className="text-white/80 text-sm font-medium uppercase tracking-wider">
                    {(providerData as any)?.accountType === "clinic" ? "Clinic Dashboard" : "Provider Dashboard"}
                  </p>
                  <h1 className="text-2xl md:text-3xl font-bold text-white" data-testid="text-dashboard-welcome">
                    {(providerData as any)?.accountType === "clinic" && (providerData as any)?.clinicName
                      ? (providerData as any).clinicName
                      : (user?.firstName ? `Welcome back, ${user.firstName}` : t("dashboard.provider_title"))}
                  </h1>
                  <p className="text-white/70 text-sm mt-0.5">
                    {(providerData as any)?.accountType === "clinic"
                      ? "Manage your practitioners and the services assigned to your clinic."
                      : t("dashboard.provider_desc")}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" className="gap-2 bg-white/20 hover:bg-white/30 text-white border-white/30 border" asChild>
                  <Link href={`/provider/${providerData?.id}`}><FileText className="h-4 w-4" />{t("provider_dashboard.profile_button", "Public Profile")}</Link>
                </Button>
                <Button variant="secondary" size="sm" className="gap-2 bg-white/20 hover:bg-white/30 text-white border-white/30 border" onClick={() => setActiveTab("profile")} data-testid="button-dashboard-edit-profile">
                  <UserRound className="h-4 w-4" />My Profile
                </Button>
                <Button variant="secondary" size="sm" className="gap-2 bg-white/20 hover:bg-white/30 text-white border-white/30 border" onClick={() => { setProfileSection("settings"); setActiveTab("profile"); }} data-testid="button-dashboard-preferences">
                  <Settings className="h-4 w-4" />{t("provider_dashboard.settings_button", "Settings")}
                </Button>
                {(providerStatus === "draft" || providerStatus === "action_required") && !BLOCKED_SUBMIT_STATUSES.includes(providerStatus ?? "") && (
                  <Button
                    size="sm"
                    className="gap-2 bg-white text-primary hover:bg-white/90 font-semibold border-0 shadow-sm"
                    onClick={() => setConsentDialogOpen(true)}
                    disabled={submitReviewMutation.isPending}
                    data-testid="button-hero-submit-review"
                  >
                    {submitReviewMutation.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <SendHorizonal className="h-4 w-4" />}
                    Submit for Review
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* ── Post-Approval Congratulations Banner ─────────────── */}
          {isApproved && (() => {
            const approvedAt = (providerData as any)?.approvedAt || (providerData as any)?.updatedAt;
            const isRecent = approvedAt && (Date.now() - new Date(approvedAt).getTime()) < 7 * 24 * 60 * 60 * 1000;
            if (!isRecent) return null;
            const hasServices = ((providerData as any)?.servicesCount ?? 0) > 0;
            const hasAvailability = ((providerData as any)?.hasAvailability ?? false);
            const hasPhoto = !!(providerData as any)?.profileImageUrl || !!(providerData as any)?.profileImage;
            const nextSteps = [
              { done: hasServices, label: "Add your services & pricing", action: () => setActiveTab("services") },
              { done: hasAvailability, label: "Set your availability", action: () => setActiveTab("availability") },
              { done: hasPhoto, label: "Add a profile photo", action: () => setActiveTab("gallery") },
            ].filter(s => !s.done);
            return (
              <div className="mb-6 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20 p-5" data-testid="banner-approved">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-emerald-800 dark:text-emerald-300 text-base">🎉 Congratulations — you're approved!</p>
                    <p className="text-emerald-700 dark:text-emerald-400 text-sm mt-1">Your profile is now live and patients can discover and book you.</p>
                    {nextSteps.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2">Complete these steps to start getting bookings:</p>
                        <div className="flex flex-wrap gap-2">
                          {nextSteps.map(s => (
                            <button key={s.label} onClick={s.action} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors">
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {nextSteps.length === 0 && (
                      <p className="text-emerald-600 dark:text-emerald-500 text-xs mt-2 font-medium">✓ Profile is fully set up — you're ready for patients!</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Submit for Review Banner (draft / action_required) ── */}
          {(providerStatus === "draft" || providerStatus === "action_required") && (
            <div className={`mb-6 rounded-2xl border p-5 flex items-start gap-4 ${
              providerStatus === "action_required"
                ? "border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30"
                : "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30"
            }`} data-testid="banner-submit-review">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                providerStatus === "action_required"
                  ? "bg-rose-100 dark:bg-rose-900/40"
                  : "bg-amber-100 dark:bg-amber-900/40"
              }`}>
                <ClipboardCheck className={`w-5 h-5 ${
                  providerStatus === "action_required"
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-amber-600 dark:text-amber-400"
                }`} />
              </div>
              <div className="flex-1">
                <p className={`font-semibold text-sm ${
                  providerStatus === "action_required"
                    ? "text-rose-800 dark:text-rose-300"
                    : "text-amber-800 dark:text-amber-300"
                }`}>
                  {providerStatus === "action_required"
                    ? "Action required — please update your profile and resubmit"
                    : "Ready to go live? Submit your profile for compliance review"}
                </p>
                <p className={`text-xs mt-1 leading-relaxed ${
                  providerStatus === "action_required"
                    ? "text-rose-700 dark:text-rose-400"
                    : "text-amber-700 dark:text-amber-400"
                }`}>
                  {providerStatus === "action_required"
                    ? "Our team has requested changes to your profile. Update the flagged items, then resubmit to continue the verification process."
                    : "Complete your profile details and upload your documents in My Profile, then click Submit for Review. Verification typically takes 1–3 business days."}
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button
                    size="sm"
                    className={providerStatus === "action_required"
                      ? "bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
                      : "bg-amber-600 hover:bg-amber-700 text-white gap-1.5"}
                    onClick={() => setConsentDialogOpen(true)}
                    disabled={submitReviewMutation.isPending}
                    data-testid="button-banner-submit-review"
                  >
                    {submitReviewMutation.isPending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <SendHorizonal className="h-3.5 w-3.5" />}
                    {providerStatus === "action_required" ? "Resubmit for Review" : "Submit for Review"}
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setProfileSection("verification"); setActiveTab("profile"); }} data-testid="button-banner-go-to-docs">
                    <FileCheck className="h-3.5 w-3.5" /> Check Documents
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── Rejected Banner ─────────────────────────────────── */}
          {providerStatus === "rejected" && (
            <div className="mb-6 rounded-2xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-5 flex items-start gap-4" data-testid="banner-rejected">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-rose-800 dark:text-rose-300 text-sm">Profile review — changes required</p>
                {(providerData as any)?.rejectionReason && (
                  <p className="text-rose-700 dark:text-rose-400 text-xs mt-1 leading-relaxed italic">
                    "{(providerData as any).rejectionReason}"
                  </p>
                )}
                <p className="text-rose-600 dark:text-rose-500 text-xs mt-2">Please update your profile based on the feedback above, then resubmit for review.</p>
              </div>
              <Button size="sm" variant="outline" className="border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-400 shrink-0" onClick={() => setActiveTab("profile")}>
                Update &amp; Resubmit
              </Button>
            </div>
          )}

          {/* ── Overview section (visible only on upcoming/active tabs) ─── */}
          {activeTab === "overview" && (
          <>

          {/* ── Profile completeness widget ──────────────────────── */}
          <ProfileCompletenessCard
            provider={providerData}
            onProfileClick={(section) => {
              if (section) setProfileSection(section);
              setActiveTab("profile");
            }}
          />

          {/* ── Stats row (today / pending / upcoming / clients) ─── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card
              className="stat-card stat-indigo cursor-pointer hover:opacity-90 transition-opacity"
              data-testid="card-stat-today"
              onClick={() => setActiveTab("active")}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{t("provider_dashboard.stat_today", "Today")}</p>
                  <div className="stat-icon h-9 w-9"><CalendarIcon className="h-4 w-4" /></div>
                </div>
                <p className="text-3xl font-bold mt-1" data-testid="text-today-count">{todayAppointments.length}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("provider_dashboard.stat_today_desc", "appointments scheduled")}</p>
              </CardContent>
            </Card>
            <Card
              className="stat-card stat-orange cursor-pointer hover:opacity-90 transition-opacity"
              data-testid="card-stat-pending"
              onClick={() => setActiveTab("upcoming")}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{t("provider_dashboard.stat_pending", "Needs Approval")}</p>
                  <div className="stat-icon h-9 w-9"><Clock className="h-4 w-4" /></div>
                </div>
                <p className="text-3xl font-bold mt-1 text-orange-600 dark:text-orange-400" data-testid="text-pending-count">{pendingCount}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("provider_dashboard.stat_pending_desc", "requests awaiting approval")}</p>
              </CardContent>
            </Card>
            <Card
              className="stat-card stat-sky cursor-pointer hover:opacity-90 transition-opacity"
              data-testid="card-stat-upcoming"
              onClick={() => setActiveTab("upcoming")}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{t("provider_dashboard.stat_upcoming", "Upcoming")}</p>
                  <div className="stat-icon h-9 w-9"><TrendingUp className="h-4 w-4" /></div>
                </div>
                <p className="text-3xl font-bold mt-1" data-testid="text-upcoming-count">{upcomingAppointments.length}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("provider_dashboard.stat_upcoming_desc", "in your queue")}</p>
              </CardContent>
            </Card>
            <Card
              className="stat-card stat-violet cursor-pointer hover:opacity-90 transition-opacity"
              data-testid="card-stat-patients"
              onClick={() => setActiveTab("clients")}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{t("provider_dashboard.stat_patients", "Clients")}</p>
                  <div className="stat-icon h-9 w-9"><Users className="h-4 w-4" /></div>
                </div>
                <p className="text-3xl font-bold mt-1" data-testid="text-patients-count">{uniquePatientCount}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("provider_dashboard.stat_patients_desc", "unique clients — click to view")}</p>
              </CardContent>
            </Card>
          </div>

          {/* ── Pending tasks banner ─────────────────────────────── */}
          {pendingCount > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-orange-300/50 bg-orange-50 dark:bg-orange-900/10 px-5 py-3.5 mb-2" data-testid="banner-pending-tasks">
              <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                <Bell className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm text-orange-800 dark:text-orange-200">
                  You have {pendingCount} pending appointment{pendingCount !== 1 ? "s" : ""} waiting for review
                </p>
                <p className="text-xs text-orange-700/70 dark:text-orange-300/70">{t("provider_dashboard.pending_tasks_desc", "Approve or reject client requests to keep your queue up to date.")}</p>
              </div>
              <Button size="sm" variant="outline" className="border-orange-400/60 text-orange-700 dark:text-orange-300 hover:bg-orange-100 shrink-0" data-testid="button-review-pending" onClick={() => setActiveTab("upcoming")}>
                  {t("provider_dashboard.review_pending", "Review")} →
                </Button>
            </div>
          )}

          {/* ── Appointment intelligence: next session context ─── */}
          {isApproved && (() => {
            const nextAppt = [...todayAppointments, ...upcomingAppointments]
              .filter(a => ["pending","confirmed","approved","in_progress"].includes(a.status))
              .sort((a, b) => {
                // in_progress appointments float to the top regardless of time
                if (a.status === "in_progress" && b.status !== "in_progress") return -1;
                if (b.status === "in_progress" && a.status !== "in_progress") return 1;
                const ta = `${a.date}T${a.startTime}`;
                const tb = `${b.date}T${b.startTime}`;
                return ta < tb ? -1 : 1;
              })[0];
            if (!nextAppt) return null;
            const patientName = `${nextAppt.patient?.firstName ?? ""} ${nextAppt.patient?.lastName ?? ""}`.trim() || "Patient";
            return (
              <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 px-5 py-3.5 mb-2" data-testid="banner-next-appointment">
                <div className="h-9 w-9 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
                  <CalendarIcon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">
                    Next: {nextAppt.service?.name ?? "Appointment"} with {patientName}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>{nextAppt.date} at {nextAppt.startTime}</span>
                    <AppointmentTimeContext
                      date={nextAppt.date}
                      startTime={nextAppt.startTime}
                      startAtUtc={(nextAppt as any).startAt}
                      status={nextAppt.status}
                      className="font-medium text-primary"
                    />
                  </div>
                </div>
                <Button size="sm" variant="outline" className="shrink-0 border-primary/30 text-primary hover:bg-primary/10" onClick={() => {
                  setHighlightApptId(nextAppt.id);
                  setActiveTab(nextAppt.date === todayStr ? "active" : "upcoming");
                  setTimeout(() => {
                    const el = document.querySelector(`[data-testid="row-appointment-${nextAppt.id}"]`);
                    el?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }, 350);
                }} data-testid="button-jump-next-appt">
                  Jump to →
                </Button>
              </div>
            );
          })()}

          {/* ── Quick links ──────────────────────────────────────── */}
          <div className="flex flex-wrap gap-2 mb-2" data-testid="provider-quick-links">
            <Button size="sm" variant="outline" data-testid="link-quick-schedule" onClick={() => setActiveTab("availability")}>
              <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />{t("provider_dashboard.quick_schedule", "My Schedule")}
            </Button>
            <Button size="sm" variant="outline" data-testid="link-quick-patients" onClick={() => setActiveTab("clients")}>
              <Users className="h-3.5 w-3.5 mr-1.5" />{t("provider_dashboard.quick_patients", "Clients")}
            </Button>
            <Button size="sm" variant="outline" asChild data-testid="link-quick-earnings">
              <Link href="/provider/earnings"><Banknote className="h-3.5 w-3.5 mr-1.5" />{t("provider_dashboard.quick_earnings", "Earnings")}</Link>
            </Button>
          </div>

          {/* ── Revenue Hero with sparkline ─────────────────────── */}
          <div className="relative overflow-hidden rounded-2xl mb-6 p-6 text-white shadow-xl bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700" data-testid="card-revenue-hero">
            <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
            <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              <div className="md:col-span-1">
                <div className="flex items-center gap-2 text-white/80">
                  <Banknote className="h-4 w-4" />
                  <p className="text-xs font-medium uppercase tracking-wider">{t("provider_dashboard.stat_total", "Total Revenue")}</p>
                </div>
                <p className="text-4xl md:text-5xl font-bold mt-2 tracking-tight" data-testid="text-total-earnings">{fmtEarnings(totalEarnings)}</p>
                <div className="mt-3 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${monthlyGrowthPct >= 0 ? "bg-white/25" : "bg-black/25"} text-white`}>
                    {monthlyGrowthPct >= 0 ? "▲" : "▼"} {Math.abs(monthlyGrowthPct).toFixed(1)}%
                  </span>
                  <span className="text-xs text-white/80">{t("provider_dashboard.vs_prev_30", "vs previous 30 days")}</span>
                </div>
                <Link href="/provider/earnings" className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-white/90 hover:text-white underline-offset-2 hover:underline" data-testid="link-view-payouts">
                  {t("provider_dashboard.view_payouts", "View earnings & payouts")} →
                </Link>
                <br />
                <Link href="/packages" className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-white/80 hover:text-white underline-offset-2 hover:underline" data-testid="link-provider-packages">
                  🎁 Membership Packages →
                </Link>
              </div>
              <div className="md:col-span-2">
                <ResponsiveContainer width="100%" height={110}>
                  <AreaChart data={sparkData}>
                    <defs>
                      <linearGradient id="providerSparkGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Tooltip formatter={(v: any) => fmtEarnings(Number(v))} contentStyle={{ background: "rgba(0,0,0,0.7)", border: "none", borderRadius: 8, color: "white" }} />
                    <Area type="monotone" dataKey="v" stroke="#fff" strokeWidth={2} fill="url(#providerSparkGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
                <p className="text-[11px] text-white/70 text-center mt-1">{t("provider_dashboard.last_14_days", "Revenue · last 14 days")}</p>
              </div>
            </div>
          </div>

          {/* ── Revenue breakdown row ─────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: t("provider_dashboard.stat_today_revenue", "Today"), value: todayEarnings, desc: t("provider_dashboard.stat_today_revenue_desc", "earnings today"), colors: "from-amber-500 to-orange-600", testId: "card-stat-today-revenue", textId: "text-today-earnings" },
              { label: t("provider_dashboard.stat_weekly", "Weekly Revenue"), value: weeklyEarnings, desc: t("provider_dashboard.stat_weekly_desc", "last 7 days"), colors: "from-emerald-500 to-green-600", testId: "card-stat-weekly", textId: "text-weekly-earnings" },
              { label: t("provider_dashboard.stat_monthly", "Monthly Revenue"), value: monthlyEarnings, desc: t("provider_dashboard.stat_monthly_desc", "last 30 days"), colors: "from-teal-500 to-cyan-600", testId: "card-stat-monthly", textId: "text-monthly-earnings" },
              { label: t("provider_dashboard.stat_avg_booking", "Avg per Booking"), value: avgPerBooking, desc: t("provider_dashboard.stat_avg_booking_desc", "{{count}} completed", { count: completedAppointments.length }), colors: "from-violet-500 to-fuchsia-600", testId: "card-stat-avg-booking", textId: "text-avg-booking" },
            ].map((s) => (
              <div key={s.testId} className={`relative overflow-hidden rounded-xl p-5 text-white shadow-md bg-gradient-to-br ${s.colors}`} data-testid={s.testId}>
                <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/10 blur-xl" />
                <div className="relative flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wider text-white/80">{s.label}</p>
                  <DollarSign className="h-4 w-4 text-white/80" />
                </div>
                <p className="text-2xl font-bold mt-2" data-testid={s.textId}>{fmtEarnings(s.value)}</p>
                <p className="text-[11px] text-white/70 mt-1">{s.desc}</p>
              </div>
            ))}
          </div>

          {/* ── Pending cash banner ───────────────────────────── */}
          {pendingCashCount > 0 && (
            <div className="mb-6 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-5 flex items-start gap-4" data-testid="banner-provider-pending-cash">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                <Banknote className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
                  {pendingCashCount === 1 ? "1 appointment awaiting cash or bank-transfer payment" : `${pendingCashCount} appointments awaiting cash or bank-transfer payment`}
                </p>
                <p className="text-amber-700 dark:text-amber-400 text-xs mt-1 leading-relaxed">
                  Find the appointment in your list below and click "Mark payment received" once you've collected it.
                </p>
              </div>
              <Badge className="bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-700 shrink-0 text-sm font-bold px-3 py-1">
                {pendingCashCount}
              </Badge>
            </div>
          )}

          {/* ── No-services nudge banner ──────────────────────── */}
          {providerData && ["approved", "active", "verified"].includes(providerData.status ?? "") &&
            !(providerWithServices?.services ?? []).some((s: any) => s.isActive) && (
            <div className="mb-6 rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-5 flex items-start gap-4" data-testid="banner-no-services">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-blue-800 dark:text-blue-300 text-sm">You're approved — finish setting up to start accepting clients</p>
                <p className="text-blue-700 dark:text-blue-400 text-xs mt-1 leading-relaxed">
                  Add at least one active service with pricing, then configure your availability. Clients won't be able to book you until both are done.
                </p>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="default" onClick={() => setActiveTab("services")}><Plus className="h-3.5 w-3.5 mr-1" />Add a service</Button>
                  <Button size="sm" variant="outline" onClick={() => setActiveTab("availability")}>Set availability</Button>
                </div>
              </div>
            </div>
          )}

          {/* ── Performance Snapshot ──────────────────────────── */}
          <div className="grid grid-cols-3 gap-4 mb-6" data-testid="performance-snapshot">
            <Card className="stat-card stat-amber">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground font-medium">Rating</p>
                  <div className="stat-icon h-8 w-8"><Star className="h-3.5 w-3.5" /></div>
                </div>
                <p className="text-2xl font-bold" data-testid="text-rating">{Number(providerData?.rating || 0).toFixed(1)}<span className="text-sm font-normal text-muted-foreground"> / 5</span></p>
                <p className="text-xs text-muted-foreground mt-0.5">{providerData?.totalReviews || 0} reviews</p>
              </CardContent>
            </Card>
            <Card className="stat-card stat-sky">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground font-medium">Completion</p>
                  <div className="stat-icon h-8 w-8"><ClipboardCheck className="h-3.5 w-3.5" /></div>
                </div>
                <p className="text-2xl font-bold" data-testid="text-completion-rate">{completionRate}%</p>
                <p className="text-xs text-muted-foreground mt-0.5">{completedAppointments.length} of {allAppointments.length} completed</p>
              </CardContent>
            </Card>
            <Card className={`stat-card ${cancellationRate > 20 ? "stat-orange" : "stat-indigo"}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground font-medium">Cancellation</p>
                  <div className="stat-icon h-8 w-8"><Clock className="h-3.5 w-3.5" /></div>
                </div>
                <p className={`text-2xl font-bold ${cancellationRate > 20 ? "text-orange-600 dark:text-orange-400" : ""}`} data-testid="text-cancellation-rate">{cancellationRate}%</p>
                <p className="text-xs text-muted-foreground mt-0.5">{cancelledAppointments.length} cancelled</p>
              </CardContent>
            </Card>
          </div>

          {/* ── Today's Schedule ──────────────────────────────── */}
          {todayAppointments.length > 0 ? (
            <Card className="mb-6" data-testid="card-today-schedule-overview">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-primary" />
                    Today's Schedule
                    <Badge variant="secondary" className="ml-1">{todayAppointments.length}</Badge>
                  </CardTitle>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-primary hover:text-primary" onClick={() => setActiveTab("active")} data-testid="button-view-today-full">
                    View all →
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                {[...todayAppointments].sort((a, b) => a.startTime.localeCompare(b.startTime)).map((a) => {
                  const patientName = `${(a as any).patient?.firstName ?? ""} ${(a as any).patient?.lastName ?? ""}`.trim() || "Patient";
                  const svcName = (a as any).service?.name ?? "";
                  const statusColors: Record<string, string> = {
                    pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
                    approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
                    confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
                    in_progress: "bg-green-500 text-white",
                    rescheduled: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
                    reschedule_requested: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
                  };
                  const statusCls = statusColors[a.status] ?? "bg-muted text-muted-foreground";
                  return (
                    <div
                      key={a.id}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => {
                        setHighlightApptId(a.id);
                        setActiveTab("active");
                        setTimeout(() => {
                          document.querySelector(`[data-testid="row-appointment-${a.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }, 350);
                      }}
                      data-testid={`overview-today-row-${a.id}`}
                    >
                      <span className="text-xs font-mono text-muted-foreground w-11 shrink-0">{a.startTime}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{patientName}</p>
                        {svcName && <p className="text-xs text-muted-foreground truncate">{svcName}</p>}
                      </div>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${statusCls}`}>
                        {a.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-dashed px-5 py-4 mb-6 text-muted-foreground" data-testid="card-no-today-schedule">
              <CalendarIcon className="h-5 w-5 shrink-0 opacity-40" />
              <p className="text-sm">No appointments scheduled for today — your calendar is clear.</p>
            </div>
          )}

          {/* ── This Week at a Glance ─────────────────────────── */}
          <Card className="mb-8" data-testid="card-week-overview">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                This Week at a Glance
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {(() => {
                const now2 = new Date();
                const dow = now2.getDay();
                const monday = new Date(now2);
                monday.setDate(now2.getDate() - (dow === 0 ? 6 : dow - 1));
                const weekDays = Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(monday);
                  d.setDate(monday.getDate() + i);
                  const key = d.toISOString().slice(0, 10);
                  const count = allAppointments.filter(a => a.date === key && !terminalStatuses.includes(a.status)).length;
                  return { key, label: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i], date: d.getDate(), count, isToday: key === todayStr };
                });
                const maxCount = Math.max(...weekDays.map(d => d.count), 1);
                return (
                  <div className="flex gap-2 items-end" style={{ height: "96px" }}>
                    {weekDays.map(day => (
                      <div
                        key={day.key}
                        className="flex-1 flex flex-col items-center gap-1 cursor-pointer group"
                        onClick={() => setActiveTab(day.key === todayStr ? "active" : day.key < todayStr ? "history" : "upcoming")}
                        data-testid={`week-day-col-${day.key}`}
                      >
                        <span className={`text-xs font-bold leading-none ${day.count > 0 ? "text-primary" : "text-transparent"}`}>{day.count}</span>
                        <div className="w-full flex items-end" style={{ height: "52px" }}>
                          <div
                            className={`w-full rounded-t transition-all group-hover:opacity-80 ${
                              day.isToday ? "bg-primary" : day.count > 0 ? "bg-primary/35 dark:bg-primary/25" : "bg-muted/60"
                            }`}
                            style={{ height: `${Math.max((day.count / maxCount) * 52, day.count > 0 ? 8 : 3)}px` }}
                          />
                        </div>
                        <span className={`text-[10px] leading-none font-medium ${day.isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>{day.label}</span>
                        <span className={`text-[10px] leading-none ${day.isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>{day.date}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          </>
          )}

          {/* ── Support / bug-report row ──────────────────────── */}
          <div className="flex justify-end mb-4 gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="gap-2" data-testid="button-provider-report-bug" onClick={() => setReportBugOpen(true)}>
              <Bug className="h-4 w-4" />Report a Problem
            </Button>
            <Button variant="default" size="sm" className="gap-2" data-testid="button-provider-new-ticket" onClick={() => setNewTicketOpen(true)}>
              <Plus className="h-4 w-4" />{t("support.new_ticket", "New ticket")}
            </Button>
            <Button variant="outline" size="sm" className="gap-2" data-testid="button-provider-contact-support"
              onClick={async () => { try { await fetch("/api/support/contact", { method: "POST", credentials: "include" }); window.dispatchEvent(new CustomEvent("open-chat")); } catch {} }}>
              <MessageSquare className="h-4 w-4" />{t("provider_dashboard.contact_support", "Contact admin support")}
            </Button>
          </div>

          <NewTicketDialog open={newTicketOpen} onOpenChange={setNewTicketOpen} />
          <ReportBugDialog open={reportBugOpen} onOpenChange={setReportBugOpen} />

          {/* ── Tabs ─────────────────────────────────────────── */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="tabs-scroll-wrapper">
              <TabsList className="hidden">
                <TabsTrigger value="overview" data-testid="tab-overview">Practice Overview</TabsTrigger>
                <TabsTrigger value="upcoming" data-testid="tab-upcoming">
                  {t("provider_dashboard.tab_upcoming", "Upcoming")}
                  {upcomingAppointments.length > 0 && <Badge variant="secondary" className="ml-2">{upcomingAppointments.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="active" data-testid="tab-active">
                  {t("provider_dashboard.tab_active", "Active")}
                  {activeAppointments.length > 0 && <Badge variant="secondary" className="ml-2 bg-primary/20 text-primary">{activeAppointments.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="history" data-testid="tab-history">
                  {t("provider_dashboard.tab_history", "History")}
                  {historyAppointments.length > 0 && <Badge variant="secondary" className="ml-2">{historyAppointments.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="clients" data-testid="tab-clients">
                  <Users className="h-4 w-4 mr-1" />{t("provider_dashboard.tab_clients", "Clients")}
                  {uniquePatientCount > 0 && <Badge variant="secondary" className="ml-2">{uniquePatientCount}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="calendar" data-testid="tab-calendar">
                  <CalendarDays className="h-4 w-4 mr-1" />{t("provider_dashboard.tab_calendar", "Calendar")}
                </TabsTrigger>
                <TabsTrigger value="reviews" data-testid="tab-reviews">
                  <Star className="h-4 w-4 mr-1" />{t("provider_dashboard.tab_reviews", "Reviews")}
                  {providerReviews && providerReviews.length > 0 && <Badge variant="secondary" className="ml-2">{providerReviews.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="availability" data-testid="tab-availability">{t("provider_dashboard.tab_availability", "Availability")}</TabsTrigger>
                <TabsTrigger value="time-engine" data-testid="tab-time-engine">
                  <Zap className="h-4 w-4 mr-1" />Time Engine
                </TabsTrigger>
                <TabsTrigger value="analytics" data-testid="tab-analytics">
                  <TrendingUp className="h-4 w-4 mr-1" />{t("provider_dashboard.tab_analytics", "Analytics")}
                </TabsTrigger>
                <TabsTrigger value="insights" data-testid="tab-insights">
                  <BarChart2 className="h-4 w-4 mr-1" />{t("provider_dashboard.tab_insights", "Insights")}
                </TabsTrigger>
                <TabsTrigger value="payouts" data-testid="tab-payouts-top">
                  <Wallet className="h-4 w-4 mr-1" />Wallet &amp; Payouts
                </TabsTrigger>
                <TabsTrigger value="services" data-testid="tab-services">{t("provider_dashboard.tab_services", "Service Catalog")}</TabsTrigger>
                <TabsTrigger value="group-sessions" data-testid="tab-group-sessions">
                  {t("provider_dashboard.tab_group_sessions", "Group Sessions")}
                </TabsTrigger>
                <TabsTrigger value="profile" data-testid="tab-profile">
                  <UserRound className="h-4 w-4 mr-1" />My Profile
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Appointment tabs — delegated */}
            <ProviderAppointmentsTabs providerData={providerData} highlightApptId={highlightApptId} activeTab={activeTab} />

            {/* Clients tab */}
            <TabsContent value="clients" className="mt-2">
              {isLoadingAppointments ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-14 rounded-lg" />
                  ))}
                </div>
              ) : uniqueClients.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground" data-testid="empty-clients">
                  <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">{t("provider_dashboard.no_clients", "No clients yet")}</p>
                  <p className="text-xs mt-1 text-muted-foreground">Clients who have booked with you will appear here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {uniqueClients.length} unique client{uniqueClients.length !== 1 ? "s" : ""}
                  </p>
                  <div className="rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Client</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">Visits</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Last visit</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Total spent</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {uniqueClients.map((c) => (
                          <tr key={c.patientId} className="hover:bg-muted/30 transition-colors" data-testid={`row-client-${c.patientId}`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <AvatarSM src={c.avatarUrl ?? undefined} name={c.name || "?"} />
                                <span className="font-medium">{c.name || "Unknown"}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              <Badge variant="secondary">{c.visitCount}</Badge>
                            </td>
                            <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">
                              {c.lastVisit}
                            </td>
                            <td className="px-4 py-3 text-right font-medium hidden md:table-cell">
                              {fmtEarnings(c.totalSpend)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs h-7 px-2"
                                data-testid={`button-view-timeline-${c.patientId}`}
                                onClick={() => setPatientTimelineId(c.patientId)}
                              >
                                View
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Reviews tab */}
            <TabsContent value="reviews" className="mt-2 space-y-3">
              {/* Review Analytics Summary */}
              {providerReviews && providerReviews.length > 0 && (() => {
                const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
                let ratingSum = 0;
                for (const r of providerReviews) {
                  const star = r.rating as number;
                  if (star >= 1 && star <= 5) { dist[star] = (dist[star] ?? 0) + 1; ratingSum += star; }
                }
                const avg = providerReviews.length > 0 ? ratingSum / providerReviews.length : 0;
                const replied = providerReviews.filter(r => !!(r as any).providerReply).length;
                return (
                  <Card className="shadow-sm" data-testid="review-analytics-summary">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Star className="h-4 w-4 text-amber-500" />
                        Review Summary
                      </CardTitle>
                      <CardDescription>{providerReviews.length} review{providerReviews.length !== 1 ? "s" : ""} · {replied} replied ({Math.round((replied / providerReviews.length) * 100)}% response rate)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col md:flex-row gap-6 items-start">
                        <div className="flex flex-col items-center shrink-0">
                          <p className="text-5xl font-bold text-amber-500 tabular-nums" data-testid="reviews-avg-rating">{avg.toFixed(1)}</p>
                          <div className="flex gap-0.5 mt-1">
                            {[1,2,3,4,5].map(s => (
                              <Star key={s} className={`h-4 w-4 ${s <= Math.round(avg) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">out of 5</p>
                        </div>
                        <div className="flex-1 space-y-2 w-full">
                          {[5,4,3,2,1].map(star => {
                            const cnt = dist[star] ?? 0;
                            const pct = Math.round((cnt / Math.max(providerReviews.length, 1)) * 100);
                            return (
                              <div key={star} className="flex items-center gap-2 text-sm" data-testid={`reviews-dist-${star}`}>
                                <span className="w-4 text-right text-muted-foreground">{star}</span>
                                <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                                <Progress value={pct} className="flex-1 h-2" />
                                <span className="w-6 text-right text-xs text-muted-foreground">{cnt}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}
              {!providerReviews?.length ? (
                <div className="text-center py-12 text-muted-foreground" data-testid="empty-reviews">
                  {t("provider_dashboard.empty_reviews", "No reviews yet")}
                </div>
              ) : (
                providerReviews.map((r) => (
                  <Card key={r.id} data-testid={`review-${r.id}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <AvatarSM
                            src={r.patient?.avatarUrl}
                            name={`${r.patient?.firstName ?? ""} ${r.patient?.lastName ?? ""}`.trim()}
                          />
                          <div>
                            <p className="font-medium">{r.patient?.firstName} {r.patient?.lastName}</p>
                            <p className="text-xs text-muted-foreground">
                              {r.createdAt ? new Date(r.createdAt as any).toLocaleDateString() : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-amber-500">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={`h-4 w-4 ${i < (r.rating || 0) ? "fill-current" : ""}`} />
                          ))}
                        </div>
                      </div>
                      {r.comment && <p className="text-sm">{r.comment}</p>}
                      {(r as any).providerReply ? (
                        <div className="ml-6 p-3 bg-muted/50 rounded-md border-l-2 border-primary">
                          <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1">
                            <Reply className="h-3 w-3" />{t("provider_dashboard.your_reply", "Your reply")}
                            {(r as any).providerReplyAt && (
                              <span className="text-muted-foreground font-normal ml-1">
                                · {new Date((r as any).providerReplyAt).toLocaleDateString()}
                              </span>
                            )}
                          </p>
                          <p className="text-sm">{(r as any).providerReply}</p>
                        </div>
                      ) : (
                        <div className="flex gap-2 pt-2">
                          <Input
                            placeholder={t("provider_dashboard.reply_placeholder", "Reply to this review...")}
                            value={replyDrafts[r.id] || ""}
                            onChange={(e) => setReplyDrafts({ ...replyDrafts, [r.id]: e.target.value })}
                            data-testid={`input-reply-${r.id}`}
                          />
                          <Button size="sm"
                            disabled={!replyDrafts[r.id]?.trim() || replyMutation.isPending}
                            onClick={() => replyMutation.mutate({ id: r.id, reply: replyDrafts[r.id].trim() })}
                            data-testid={`button-reply-${r.id}`}>
                            <Reply className="h-3 w-3 mr-1" />{t("provider_dashboard.reply_btn", "Reply")}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* Availability tab */}
            <TabsContent value="availability" className="mt-2">
              <SmartScheduler provider={providerData as any} />
            </TabsContent>

            {/* Time Engine tab */}
            <TabsContent value="time-engine" className="mt-2">
              <ProviderTimeEngine />
            </TabsContent>

            {/* Analytics + Insights tab — unified Reporting Center */}
            <TabsContent value="analytics" className="mt-2">
              <ProviderReportingCenter fmtMoney={fmtEarnings} defaultSection="overview" />
            </TabsContent>

            <TabsContent value="insights" className="mt-2">
              <ProviderReportingCenter fmtMoney={fmtEarnings} defaultSection="growth" />
            </TabsContent>

            {/* Payouts / wallet tab */}
            <TabsContent value="payouts" className="mt-2 space-y-6">
              <ProviderWalletPanel />
              <PayoutSettings
                providerData={providerData}
                isUnderReview={(providerData as any)?.status === "pending_approval"}
              />
              <ProviderPayoutPanel />
            </TabsContent>

            {/* Services tab */}
            <TabsContent value="services" className="mt-2 space-y-4">
              <ProviderServicesTab
                providerData={providerData}
                providerWithServices={providerWithServices}
                setActiveTab={setActiveTab}
              />
            </TabsContent>

            {/* Group sessions tab */}
            <TabsContent value="group-sessions" className="mt-2">
              <GroupSessionsPanel />
            </TabsContent>

            {/* Profile tab — single source of truth for all provider-owned info */}
            <TabsContent value="profile" className="mt-2">
              <ProviderProfileTab
                providerData={providerData}
                isUnderReview={(providerData as any)?.status === "pending_approval"}
                activeSection={profileSection}
                onSectionChange={setProfileSection}
              />
            </TabsContent>

            {/* Legacy deep-link redirectors — silently redirect to the unified Profile tab */}
            <TabsContent value="preferences" className="mt-2">
              <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                <Settings className="h-8 w-8 opacity-40" />
                <p className="text-sm">Preferences have moved to <strong>My Profile</strong>.</p>
                <Button size="sm" variant="outline" onClick={() => { setProfileSection("settings"); setActiveTab("profile"); }}>
                  Open My Profile → Settings
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="gallery" className="mt-2">
              <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                <ImageIcon className="h-8 w-8 opacity-40" />
                <p className="text-sm">Gallery has moved to <strong>My Profile</strong>.</p>
                <Button size="sm" variant="outline" onClick={() => { setProfileSection("professional"); setActiveTab("profile"); }}>
                  Open My Profile → Gallery
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="documents" className="mt-2">
              <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                <Shield className="h-8 w-8 opacity-40" />
                <p className="text-sm">Documents have moved to <strong>My Profile</strong>.</p>
                <Button size="sm" variant="outline" onClick={() => { setProfileSection("verification"); setActiveTab("profile"); }}>
                  Open My Profile → Documents
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="kyc" className="mt-2">
              <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                <Shield className="h-8 w-8 opacity-40" />
                <p className="text-sm">KYC verification has moved to <strong>My Profile</strong>.</p>
                <Button size="sm" variant="outline" onClick={() => { setProfileSection("verification"); setActiveTab("profile"); }}>
                  Open My Profile → Documents
                </Button>
              </div>
            </TabsContent>

          </Tabs>
        </div>
      <Footer />
        </main>
      </div>

      {/* ── Patient Timeline Modal ────────────────────────────────────────── */}
      {patientTimelineId && (() => {
        const timelineAppts = allAppointments
          .filter(a => a.patientId === patientTimelineId)
          .sort((a, b) => (b.date > a.date ? 1 : -1));
        const timelineClient = uniqueClients.find(c => c.patientId === patientTimelineId);
        const STATUS_COLORS: Record<string, string> = {
          completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
          cancelled: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
          cancelled_by_patient: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
          cancelled_by_provider: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
          no_show: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
          pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
          confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
          in_progress: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
        };
        return (
          <Dialog open onOpenChange={() => setPatientTimelineId(null)}>
            <DialogContent className="max-w-lg w-full" data-testid="modal-patient-timeline">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  {timelineClient && <AvatarSM src={timelineClient.avatarUrl ?? undefined} name={timelineClient.name || "?"} />}
                  <div>
                    <span className="font-bold">{timelineClient?.name || "Patient"}</span>
                    <p className="text-xs font-normal text-muted-foreground mt-0.5">
                      {timelineAppts.length} appointment{timelineAppts.length !== 1 ? "s" : ""} · {fmtEarnings(timelineClient?.totalSpend ?? 0)} total
                    </p>
                  </div>
                </DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh] pr-2">
                {timelineAppts.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">No appointments found.</p>
                ) : (
                  <div className="space-y-2 pb-2">
                    {timelineAppts.map(a => {
                      const statusColor = STATUS_COLORS[a.status] ?? "bg-muted text-muted-foreground";
                      const svcName = (a as any).service?.name ?? (a as any).serviceName ?? null;
                      return (
                        <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors" data-testid={`timeline-appt-${a.id}`}>
                          <div className="shrink-0 w-1.5 h-full mt-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${a.status === "completed" ? "bg-emerald-500" : a.status.startsWith("cancel") ? "bg-rose-500" : "bg-muted-foreground/40"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-muted-foreground">{a.date} · {a.startTime ?? ""}</p>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${statusColor}`}>
                                {a.status.replace(/_/g, " ")}
                              </span>
                            </div>
                            {svcName && <p className="text-sm font-medium mt-0.5 truncate">{svcName}</p>}
                            {a.status === "completed" && (a as any).totalAmount && (
                              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                                {formatInCurrency(Number((a as any).totalAmount || 0), (a as any).displayCurrency ?? providerNativeCurrency)}
                              </p>
                            )}
                            {(a as any).visitType && (
                              <Badge variant="outline" className="text-[10px] mt-1 capitalize">
                                {(a as any).visitType.replace("_", " ")}
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ── Locked Section Modal ───────────────────────────────────────────── */}
      {/* ── Consent Dialog (shown before any Submit for Review action) ── */}
      <Dialog open={consentDialogOpen} onOpenChange={(open) => {
        setConsentDialogOpen(open);
        if (!open) { setAgreedToProvider(false); setAgreedToData(false); }
      }}>
        <DialogContent className="max-w-md" data-testid="modal-consent-submit">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary shrink-0" />
              Review &amp; Accept Agreements
            </DialogTitle>
            <DialogDescription>
              Before submitting your profile for compliance review, please read and accept the following agreements.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <label className="flex items-start gap-3 cursor-pointer select-none" data-testid="label-consent-provider-agreement">
              <Checkbox
                id="consent-provider"
                checked={agreedToProvider}
                onCheckedChange={(v) => setAgreedToProvider(!!v)}
                className="mt-0.5 shrink-0"
                data-testid="checkbox-provider-agreement"
              />
              <span className="text-sm leading-relaxed">
                I have read and agree to the{" "}
                <a href="/legal/provider-agreement" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80 font-medium">
                  Provider Agreement
                </a>
                , including the terms of service, code of conduct, and obligations as a listed healthcare provider on this platform.
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer select-none" data-testid="label-consent-data-processing">
              <Checkbox
                id="consent-data"
                checked={agreedToData}
                onCheckedChange={(v) => setAgreedToData(!!v)}
                className="mt-0.5 shrink-0"
                data-testid="checkbox-data-processing-agreement"
              />
              <span className="text-sm leading-relaxed">
                I have read and agree to the{" "}
                <a href="/legal/data-processing-agreement" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80 font-medium">
                  Data Processing Agreement
                </a>
                , including how my personal and professional data is processed in accordance with applicable privacy regulations.
              </span>
            </label>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => { setConsentDialogOpen(false); setAgreedToProvider(false); setAgreedToData(false); }}
              data-testid="button-consent-cancel"
            >
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto gap-2"
              disabled={!consentComplete || submitReviewMutation.isPending}
              onClick={() => {
                setConsentDialogOpen(false);
                submitReviewMutation.mutate();
              }}
              data-testid="button-consent-confirm-submit"
            >
              {submitReviewMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <SendHorizonal className="h-4 w-4" />}
              Confirm &amp; Submit for Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lockedModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
          onClick={() => setLockedModalOpen(false)}
          data-testid="modal-locked-section"
        >
          <div
            className="max-w-sm w-full bg-card rounded-3xl border border-border shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Gradient banner */}
            <div className="bg-gradient-to-br from-primary via-primary/90 to-indigo-600 px-6 pt-7 pb-6 text-center">
              <div className="mx-auto mb-3 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm shadow-inner">
                <Lock className="h-8 w-8 text-white" />
              </div>
              <h3 className="font-bold text-white text-lg leading-snug">Marketplace features locked</h3>
              <p className="text-white/75 text-xs mt-1.5">Unlocks after compliance approval</p>
            </div>

            <div className="px-6 pt-5 pb-6">
              <p className="text-sm text-muted-foreground leading-relaxed text-center mb-5">
                These features unlock instantly once your clinical credentials pass our compliance review — typically <span className="font-semibold text-foreground">1–3 business days</span> after you submit for review.
              </p>

              {/* What's locked checklist */}
              <div className="space-y-2 mb-5">
                {[
                  { label: "Add & publish services" },
                  { label: "Set availability & schedules" },
                  { label: "Accept patient bookings" },
                  { label: "Host group sessions" },
                ].map(({ label }) => (
                  <div key={label} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                    <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <Lock className="h-2.5 w-2.5 text-muted-foreground/60" />
                    </div>
                    {label}
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  className="w-full rounded-xl gap-2"
                  onClick={() => { setLockedModalOpen(false); setActiveTab("profile"); }}
                  data-testid="button-locked-go-to-setup"
                >
                  Complete My Profile →
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground rounded-xl"
                  onClick={() => setLockedModalOpen(false)}
                  data-testid="button-locked-dismiss"
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
