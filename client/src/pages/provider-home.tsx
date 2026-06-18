import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { formatDate, formatTime } from "@/lib/datetime";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calendar, Clock, Star, Wallet, FileText, AlertTriangle,
  CheckCircle2, ChevronRight, Video, MapPin, User,
  Activity, Shield, Bell, Stethoscope, ClipboardList,
  TrendingUp, TrendingDown, MessageSquare, LayoutDashboard, Plus,
  RefreshCw, ArrowRight, Home, Settings, XCircle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Appointment {
  id: string;
  status: string;
  startAt: string;
  endAt?: string;
  visitType?: string;
  serviceName?: string;
  totalAmount?: string | number;
  videoRoomUrl?: string;
  patient?: { firstName?: string; lastName?: string; avatarUrl?: string };
  patientName?: string;
}

interface ProviderProfile {
  id: string;
  professionalTitle?: string;
  specialization?: string;
  clinicName?: string;
  status?: string;
  isVerified?: boolean;
  providerType?: string;
  providerCategory?: string;
  providerSubcategory?: string;
  displayTitle?: string;
  clinicLatitude?: number;
  clinicLongitude?: number;
  homeVisitEnabled?: boolean;
  travelRadiusKm?: number;
  clinicFormattedAddress?: string;
}

interface Review {
  id: string;
  rating: number;
  comment?: string;
  reply?: string | null;
  createdAt: string;
  patientName?: string;
}

interface ProviderDoc {
  id: string;
  documentType: string;
  verificationStatus: string;
  expiryDate?: string | null;
}

interface PayoutSummary {
  availableBalance: number;
  pendingPayouts: number;
  lifetimePaidOut: number;
  lifetimePaidEarnings: number;
  currency: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isToday(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function isThisWeek(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  return d >= weekStart;
}

function fmtTime(dateStr: string) {
  return formatTime(dateStr, { hour: "2-digit", minute: "2-digit" });
}

function relativeLabel(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

function greetingWord() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function useRotating<T>(items: T[], intervalMs = 10000): T {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (items.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), intervalMs);
    return () => clearInterval(t);
  }, [items.length, intervalMs]);
  return items[idx];
}

function patientName(appt: Appointment) {
  if (appt.patient?.firstName) return `${appt.patient.firstName} ${appt.patient.lastName ?? ""}`.trim();
  return appt.patientName || "Patient";
}

const STATUS_COLOR: Record<string, string> = {
  confirmed:  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  pending:    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  completed:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled:  "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  in_progress:"bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
};

const VISIT_ICON: Record<string, React.ElementType> = {
  online: Video,
  home:   Home,
  clinic: MapPin,
};

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, href }: {
  icon: React.ElementType; label: string; value: string | number;
  color: string; href?: string;
}) {
  const inner = (
    <div className={`rounded-2xl border border-border bg-card p-4 flex items-center gap-3 ${href ? "hover:border-primary/40 hover:shadow-sm transition-all" : ""}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xl font-bold text-foreground leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : <div>{inner}</div>;
}

function AlertItem({ icon: Icon, color, label, desc, href }: {
  icon: React.ElementType; color: string; label: string; desc: string; href?: string;
}) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${color} transition-all`}>
      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs opacity-80 mt-0.5">{desc}</p>
      </div>
      {href && (
        <Link href={href}>
          <ChevronRight className="w-4 h-4 flex-shrink-0 mt-0.5 opacity-60" />
        </Link>
      )}
    </div>
  );
}

function AppointmentRow({ appt }: { appt: Appointment }) {
  const [, navigate] = useLocation();
  const VisitIcon = VISIT_ICON[appt.visitType ?? "clinic"] ?? MapPin;
  const statusCls = STATUS_COLOR[appt.status] ?? "bg-muted text-muted-foreground";
  const isVideo = appt.visitType === "online" && appt.videoRoomUrl;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border hover:border-primary/30 hover:bg-muted/50 transition-all">
      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <User className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{patientName(appt)}</p>
        <p className="text-xs text-muted-foreground truncate">{appt.serviceName ?? "Appointment"}</p>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          {fmtTime(appt.startAt)}
        </div>
        <div className="flex items-center gap-1">
          <VisitIcon className="w-3 h-3 text-muted-foreground/60" />
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusCls}`}>
            {appt.status.replace(/_/g, " ")}
          </span>
        </div>
      </div>
      <div className="flex gap-1.5">
        {isVideo && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs rounded-lg gap-1 border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300" asChild data-testid={`button-join-video-${appt.id}`}>
            <a href={appt.videoRoomUrl!} target="_blank" rel="noopener noreferrer">
              <Video className="w-3 h-3" /> Join
            </a>
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs rounded-lg" onClick={() => navigate(`/appointments/${appt.id}`)} data-testid={`button-open-appt-${appt.id}`}>
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, label, href, color }: {
  icon: React.ElementType; label: string; href: string; color: string;
}) {
  return (
    <Link href={href}>
      <div className={`flex flex-col items-center gap-2 p-4 rounded-2xl border border-border bg-card hover:border-primary/40 hover:${color} hover:shadow-sm transition-all cursor-pointer`} data-testid={`quick-action-${label.toLowerCase().replace(/\s+/g, "-")}`}>
        <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-xs font-medium text-foreground text-center leading-tight">{label}</p>
      </div>
    </Link>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ProviderHome() {
  const { user } = useAuth();
  const { format: formatAmount } = useCurrency();

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: providerProfile } = useQuery<ProviderProfile>({
    queryKey: ["/api/provider/me"],
    enabled: !!user,
  });

  const { data: appointments = [], isLoading: apptLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments/provider"],
    enabled: !!user,
  });

  const { data: payoutSummary } = useQuery<PayoutSummary>({
    queryKey: ["/api/provider/payout-summary"],
    enabled: !!user,
  });

  const { data: reviews = [] } = useQuery<Review[]>({
    queryKey: ["/api/reviews/provider/me"],
    enabled: !!user,
  });

  const { data: documents = [] } = useQuery<ProviderDoc[]>({
    queryKey: ["/api/provider/documents"],
    enabled: !!user,
  });

  const { data: unreadCount } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: !!user,
  });

  // ── Derived data ──────────────────────────────────────────────────────────
  const TERMINAL_STATUSES = ["cancelled", "cancelled_by_patient", "cancelled_by_provider", "rejected", "no_show", "expired"];
  const todayAppts = useMemo(
    () => appointments.filter(a => isToday(a.startAt) && !TERMINAL_STATUSES.includes(a.status)),
    [appointments]
  );
  const upcomingAppts = useMemo(() =>
    todayAppts.filter(a => ["confirmed", "pending"].includes(a.status))
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    [todayAppts]
  );
  const completedToday = useMemo(() => todayAppts.filter(a => a.status === "completed"), [todayAppts]);
  const patientsThisWeek = useMemo(() => appointments.filter(a => isThisWeek(a.startAt) && a.status === "completed").length, [appointments]);
  const recentActivity = useMemo(() =>
    [...appointments].sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime()).slice(0, 6),
    [appointments]
  );

  const avgRating = useMemo(() => {
    if (!reviews.length) return null;
    return (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1);
  }, [reviews]);
  const pendingReviewReplies = useMemo(() => reviews.filter(r => !r.reply).length, [reviews]);

  // 7-day cancellation trend (only over closed appointments, min 3 data points)
  const last7Stats = useMemo(() => {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recent = appointments.filter(a => new Date(a.startAt) >= cutoff);
    const closed = recent.filter(a =>
      ["completed", "cancelled", "cancelled_by_patient", "cancelled_by_provider", "rejected", "no_show", "expired"].includes(a.status)
    );
    const cancelledClosed = closed.filter(a =>
      ["cancelled", "cancelled_by_patient", "cancelled_by_provider", "rejected", "no_show", "expired"].includes(a.status)
    );
    const rate = closed.length >= 3 ? cancelledClosed.length / closed.length : 0;
    return { total: closed.length, cancelled: cancelledClosed.length, rate };
  }, [appointments]);

  // Today's cancelled/rejected count — to distinguish "no appts" vs "all cancelled"
  const cancelledTodayCount = useMemo(() =>
    appointments.filter(a =>
      isToday(a.startAt) &&
      ["cancelled", "cancelled_by_patient", "cancelled_by_provider", "rejected", "no_show", "expired"].includes(a.status)
    ).length,
    [appointments]
  );

  // Documents with issues
  const now = new Date();
  const expiringSoon = documents.filter(d => {
    if (!d.expiryDate) return false;
    const diff = (new Date(d.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 60 && d.verificationStatus === "approved";
  });
  const expiredDocs = documents.filter(d => d.verificationStatus === "expired");
  const pendingDocs = documents.filter(d => ["pending", "under_review"].includes(d.verificationStatus));

  // Action required alerts
  const alerts: { icon: React.ElementType; color: string; label: string; desc: string; href?: string }[] = [];
  if (upcomingAppts.some(a => a.visitType === "online" && a.videoRoomUrl)) {
    alerts.push({ icon: Video, color: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300", label: "Video session ready", desc: "A video appointment is starting soon", href: "/appointments" });
  }
  if ((unreadCount?.count ?? 0) > 0) {
    alerts.push({ icon: Bell, color: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300", label: `${unreadCount!.count} unread notification${unreadCount!.count !== 1 ? "s" : ""}`, desc: "Check your notification center", href: "/notifications" });
  }
  if (pendingReviewReplies > 0) {
    alerts.push({ icon: MessageSquare, color: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300", label: `${pendingReviewReplies} review${pendingReviewReplies !== 1 ? "s" : ""} awaiting reply`, desc: "Patients appreciate a prompt response", href: "/provider/dashboard" });
  }
  if (expiredDocs.length > 0) {
    alerts.push({ icon: AlertTriangle, color: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300", label: `${expiredDocs.length} document${expiredDocs.length !== 1 ? "s" : ""} expired`, desc: "Upload updated documents to remain compliant", href: "/provider/dashboard" });
  }
  if (expiringSoon.length > 0) {
    alerts.push({ icon: Clock, color: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300", label: `${expiringSoon.length} document${expiringSoon.length !== 1 ? "s" : ""} expiring soon`, desc: "Within 60 days — schedule renewal", href: "/provider/dashboard" });
  }
  if (pendingDocs.length > 0) {
    alerts.push({ icon: FileText, color: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300", label: `${pendingDocs.length} document${pendingDocs.length !== 1 ? "s" : ""} under review`, desc: "Admin is verifying your credentials", href: "/provider/dashboard" });
  }
  if (last7Stats.rate >= 0.20 && last7Stats.total >= 3) {
    alerts.push({ icon: TrendingDown, color: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-300", label: `High cancellation rate: ${Math.round(last7Stats.rate * 100)}% over the last 7 days`, desc: `${last7Stats.cancelled} of ${last7Stats.total} recent appointments were cancelled or not attended — consider reaching out to patients`, href: "/provider/dashboard" });
  }

  // Rotating contextual messages
  const contextMessages = useMemo(() => {
    const msgs: string[] = [];
    if (todayAppts.length === 0 && cancelledTodayCount > 0)
      msgs.push(`${cancelledTodayCount} appointment${cancelledTodayCount !== 1 ? "s" : ""} today ${cancelledTodayCount === 1 ? "was" : "were"} cancelled.`);
    else if (todayAppts.length === 0) msgs.push("No appointments scheduled today — enjoy the quiet.");
    else if (todayAppts.length === 1) msgs.push("You have 1 appointment today.");
    else msgs.push(`You have ${todayAppts.length} appointments today.`);
    if (completedToday.length > 0) msgs.push(`${completedToday.length} patient${completedToday.length !== 1 ? "s" : ""} seen today.`);
    if (patientsThisWeek > 0) msgs.push(`${patientsThisWeek} patients seen this week.`);
    if (last7Stats.rate >= 0.20 && last7Stats.total >= 3) msgs.push(`Cancellation rate is ${Math.round(last7Stats.rate * 100)}% this week — consider reviewing your schedule.`);
    if (pendingReviewReplies > 0) msgs.push(`${pendingReviewReplies} review${pendingReviewReplies !== 1 ? "s" : ""} waiting for your reply.`);
    if (expiredDocs.length > 0) msgs.push("Expired documents require your attention.");
    if (alerts.length === 0) msgs.push("Everything looks good today.");
    return msgs.length ? msgs : ["Welcome back — your patients are counting on you."];
  }, [todayAppts, cancelledTodayCount, completedToday, patientsThisWeek, last7Stats, pendingReviewReplies, expiredDocs, alerts]);

  const currentMessage = useRotating(contextMessages, 8000);

  const providerDisplayName = user
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
    : "Doctor";

  const specialty = providerProfile?.specialization ?? providerProfile?.providerSubcategory ?? providerProfile?.providerCategory ?? "Healthcare Provider";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-muted/20 dark:bg-[#0d0f1a]">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-6 max-w-3xl space-y-5 pb-12">

        {/* ── SECTION 1: Greeting Hero ── */}
        <div className="rounded-2xl bg-gradient-to-br from-primary to-indigo-600 text-primary-foreground p-6 shadow-lg">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center flex-shrink-0 text-xl font-bold">
              {user?.firstName?.[0] ?? "P"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold" data-testid="text-provider-greeting">
                  {greetingWord()}, {providerProfile?.displayTitle?.endsWith(".") ? `${providerProfile.displayTitle} ${providerDisplayName}` : providerDisplayName}
                </h1>
                {providerProfile?.isVerified && (
                  <Badge className="bg-white/20 text-white border-white/30 text-xs px-2 py-0.5" data-testid="badge-verified">
                    <Shield className="w-3 h-3 mr-1" /> Verified
                  </Badge>
                )}
              </div>
              <p className="text-sm text-white/70 mt-0.5">{specialty}</p>
              {providerProfile?.clinicName && (
                <p className="text-xs text-white/60 mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {providerProfile.clinicName}
                </p>
              )}
              <p className="text-sm text-white/90 mt-3 italic font-medium" data-testid="text-context-message">
                {currentMessage}
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-4 flex-wrap">
            <Badge className="bg-white/15 text-white border-white/20 text-xs">
              <Calendar className="w-3 h-3 mr-1" /> {todayAppts.length} today
            </Badge>
            {avgRating && (
              <Badge className="bg-white/15 text-white border-white/20 text-xs">
                <Star className="w-3 h-3 mr-1" /> {avgRating} rating
              </Badge>
            )}
            {alerts.length > 0 && (
              <Badge className="bg-rose-400/30 text-white border-rose-300/30 text-xs">
                <AlertTriangle className="w-3 h-3 mr-1" /> {alerts.length} action{alerts.length !== 1 ? "s" : ""} required
              </Badge>
            )}
          </div>
        </div>

        {/* ── SECTION 2: Action Required ── */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">Action Required</h2>
            </div>
            {alerts.map((a, i) => (
              <AlertItem key={i} {...a} />
            ))}
          </div>
        )}

        {/* ── SECTION 3: Today's Clinic ── */}
        <div className="rounded-2xl border-2 border-primary/20 bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-gradient-to-r from-primary/5 to-transparent flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Stethoscope className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Today's Clinic</h2>
                <p className="text-xs text-muted-foreground">
                  {formatDate(new Date(), { weekday: "long", day: "numeric", month: "long" })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-2xl font-bold text-primary">{todayAppts.length}</span>
              <span className="text-xs text-muted-foreground">appts</span>
            </div>
          </div>

          <div className="p-4">
            {apptLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
              </div>
            ) : upcomingAppts.length === 0 && completedToday.length === 0 ? (
              <div className="py-8 text-center">
                {cancelledTodayCount > 0 ? (
                  <XCircle className="w-10 h-10 text-rose-400/60 mx-auto mb-2" />
                ) : (
                  <Calendar className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                )}
                <p className="text-sm font-medium text-foreground">
                  {cancelledTodayCount > 0
                    ? `${cancelledTodayCount} appointment${cancelledTodayCount !== 1 ? "s" : ""} ${cancelledTodayCount === 1 ? "was" : "were"} cancelled today`
                    : "No appointments scheduled today"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {cancelledTodayCount > 0
                    ? "These slots are now open — patients may rebook."
                    : "Enjoy the day or use this time for clinical work."}
                </p>
                <Button className="mt-3 rounded-xl gap-2" size="sm" asChild>
                  <Link href="/provider/dashboard">
                    <Calendar className="w-3.5 h-3.5" /> Manage Schedule
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingAppts.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Upcoming ({upcomingAppts.length})
                    </p>
                    <div className="space-y-2">
                      {upcomingAppts.map(a => <AppointmentRow key={a.id} appt={a} />)}
                    </div>
                  </div>
                )}
                {completedToday.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Completed ({completedToday.length})
                    </p>
                    <div className="space-y-2">
                      {completedToday.slice(0, 3).map(a => <AppointmentRow key={a.id} appt={a} />)}
                    </div>
                  </div>
                )}
                <Button variant="outline" className="w-full rounded-xl gap-2 text-sm" asChild data-testid="button-view-all-appointments">
                  <Link href="/provider/dashboard">
                    View all appointments <ChevronRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* ── SECTION 4: Health Snapshot ── */}
        <div>
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide px-1 mb-3">
            Practice Overview
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={Calendar} label="Appointments today" value={todayAppts.length} color="bg-primary/10 text-primary" />
            <StatCard icon={CheckCircle2} label="Patients this week" value={patientsThisWeek} color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" />
            <StatCard icon={Star} label="Average rating" value={avgRating ?? "—"} color="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" href="/provider/dashboard" />
            <StatCard icon={MessageSquare} label="Reviews awaiting reply" value={pendingReviewReplies} color="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" href="/provider/dashboard" />
          </div>
        </div>

        {/* ── SECTION 5: Reviews & Reputation ── */}
        {reviews.length > 0 && (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" />
                <h2 className="text-base font-bold text-foreground">Reviews & Reputation</h2>
              </div>
              <div className="flex items-center gap-1.5">
                {avgRating && (
                  <span className="text-lg font-bold text-foreground">{avgRating}</span>
                )}
                <div className="flex">
                  {[1,2,3,4,5].map(n => (
                    <Star key={n} className={`w-3.5 h-3.5 ${Number(avgRating) >= n ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30"}`} />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">({reviews.length})</span>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {reviews.slice(0, 3).map(r => (
                <div key={r.id} className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border">
                  <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0 text-amber-700 dark:text-amber-400 text-sm font-bold">
                    {r.rating}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground">{r.patientName ?? "Patient"}</p>
                    {r.comment && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.comment}</p>}
                    {!r.reply && (
                      <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium">
                        Awaiting reply
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 flex-shrink-0">{relativeLabel(r.createdAt)}</p>
                </div>
              ))}
              <Button variant="outline" className="w-full rounded-xl gap-2 text-sm" asChild data-testid="button-view-reviews">
                <Link href="/provider/dashboard">
                  Manage reviews <ChevronRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>
        )}

        {/* ── SECTION 6: Wallet & Payouts ── */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary" />
              <h2 className="text-base font-bold text-foreground">Wallet & Payouts</h2>
            </div>
            <Button variant="ghost" size="sm" className="text-xs h-7 rounded-xl gap-1" asChild>
              <Link href="/provider/earnings">
                View earnings <ArrowRight className="w-3 h-3" />
              </Link>
            </Button>
          </div>
          <div className="p-4">
            {!payoutSummary ? (
              <div className="grid grid-cols-3 gap-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Available", value: formatAmount(payoutSummary.availableBalance), color: "text-emerald-600 dark:text-emerald-400" },
                  { label: "Pending payout", value: formatAmount(payoutSummary.pendingPayouts), color: "text-amber-600 dark:text-amber-400" },
                  { label: "Total earned", value: formatAmount(payoutSummary.lifetimePaidEarnings), color: "text-primary" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-xl bg-muted/40 p-3 text-center">
                    <p className={`text-base font-bold leading-none ${color}`}>{value}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── SECTION 7: Documents & Compliance ── */}
        {documents.length > 0 && (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                <h2 className="text-base font-bold text-foreground">Documents & Compliance</h2>
              </div>
              {providerProfile?.isVerified && (
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-xs">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Verified
                </Badge>
              )}
            </div>
            <div className="p-4 space-y-2">
              {documents.slice(0, 4).map(doc => {
                const isExpiring = expiringSoon.some(e => e.id === doc.id);
                const statusColor = {
                  approved:          "text-emerald-700 dark:text-emerald-400",
                  expired:           "text-rose-700 dark:text-rose-400",
                  rejected:          "text-rose-700 dark:text-rose-400",
                  reupload_required: "text-orange-700 dark:text-orange-400",
                  pending:           "text-blue-700 dark:text-blue-400",
                  under_review:      "text-blue-700 dark:text-blue-400",
                }[doc.verificationStatus] ?? "text-muted-foreground";
                return (
                  <div key={doc.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground text-xs truncate">{doc.documentType.replace(/_/g, " ")}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isExpiring && <AlertTriangle className="w-3 h-3 text-orange-500" />}
                      <span className={`text-xs font-medium capitalize ${statusColor}`}>{doc.verificationStatus.replace(/_/g, " ")}</span>
                    </div>
                  </div>
                );
              })}
              <Button variant="outline" className="w-full rounded-xl gap-2 text-sm mt-1" asChild data-testid="button-manage-docs">
                <Link href="/provider/dashboard">
                  Manage documents <ChevronRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>
        )}

        {/* ── SECTION 8: Recent Activity ── */}
        {recentActivity.length > 0 && (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                <h2 className="text-base font-bold text-foreground">Recent Activity</h2>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {recentActivity.slice(0, 5).map((appt, i) => (
                <div key={appt.id} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${appt.status === "completed" ? "bg-emerald-500" : appt.status === "cancelled" ? "bg-rose-500" : "bg-primary"}`} />
                    {i < recentActivity.slice(0, 5).length - 1 && <div className="w-px flex-1 bg-border mt-1 min-h-[16px]" />}
                  </div>
                  <div className="flex-1 pb-1">
                    <p className="text-sm font-medium text-foreground">{patientName(appt)}</p>
                    <p className="text-xs text-muted-foreground">
                      {appt.serviceName ?? "Appointment"} · <span className="capitalize">{appt.status.replace(/_/g, " ")}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">{relativeLabel(appt.startAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SECTION 9: Quick Actions ── */}
        <div>
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide px-1 mb-3">
            Quick Actions
          </h2>
          <div className="grid grid-cols-4 gap-3">
            <QuickAction icon={Calendar} label="Schedule" href="/provider/dashboard" color="bg-primary/10 text-primary" />
            <QuickAction icon={ClipboardList} label="Clinical Workspace" href="/provider/dashboard" color="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" />
            <QuickAction icon={Wallet} label="Wallet" href="/provider/earnings" color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" />
            <QuickAction icon={Star} label="Reviews" href="/provider/dashboard" color="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" />
            <QuickAction icon={FileText} label="Documents" href="/provider/dashboard" color="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" />
            <QuickAction icon={TrendingUp} label="Analytics" href="/provider/dashboard" color="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" />
            <QuickAction icon={Settings} label="Availability" href="/provider/dashboard" color="bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" />
            <QuickAction icon={User} label="Profile" href="/provider/dashboard?tab=profile" color="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" />
          </div>
        </div>

        {/* ── Full Workspace Link ── */}
        <div className="rounded-2xl border border-border bg-card p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <LayoutDashboard className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Full Provider Workspace</p>
              <p className="text-xs text-muted-foreground">Services, availability, earnings, analytics, KYC</p>
            </div>
          </div>
          <Button className="rounded-xl gap-2 flex-shrink-0" asChild data-testid="button-open-full-workspace">
            <Link href="/provider/dashboard">
              Open <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>

      </main>
      <Footer />
    </div>
  );
}
