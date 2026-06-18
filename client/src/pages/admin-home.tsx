import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { usePageTitle } from "@/hooks/use-page-title";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, CheckCircle2, Clock, Users, UserCheck,
  Calendar, DollarSign, Ticket, Shield, Activity,
  ArrowRight, RefreshCw, FileText, Zap, TrendingUp,
  BarChart3, Settings, MessageSquare, Bug, Bell,
  CreditCard, Wallet, ChevronRight, Video, X, Building2,
  AlertCircle, Circle, CheckCheck, Globe, Package,
  Server, Database, Mail, Smartphone, Monitor, MapPin,
  LayoutDashboard, LogOut, Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isAdminRole } from "@/lib/roles";
import { formatInCurrency } from "@/lib/currency";
import { formatTime } from "@/lib/datetime";

// ── Types ─────────────────────────────────────────────────────────────────────
interface HomeSummary {
  generatedAt: string;
  totalActionsRequired: number;
  platform: {
    totalPatients: number;
    totalProviders: number;
    newUsersToday: number;
    appointmentsToday: number;
    pendingBookings: number;
    activeMemberships: number;
  };
  providers: {
    pendingApproval: number;
    actionRequired: number;
    draftCount: number;
    docsPending: number;
    docsRejected: number;
    totalNeedsReview: number;
    lifecycle?: {
      draft: number;
      submitted: number;
      underReview: number;
      actionRequired: number;
      approved: number;
      suspended: number;
      deactivated: number;
      total: number;
    };
  };
  appointments: {
    totalToday: number;
    videoToday: number;
    cancelledToday: number;
    noShowToday: number;
    confirmedToday: number;
    completedToday: number;
  };
  financial: {
    pendingPayouts: number;
    pendingRefunds: number;
    failedPayments: number;
    revenueToday: number;
  };
  support: {
    openTickets: number;
    urgentTickets: number;
    activeTickets: number;
    newToday: number;
  };
  compliance: {
    expiringCredentials: number;
    expiredCredentials: number;
    unverifiedActive: number;
  };
  bugs: {
    openBugs: number;
    criticalBugs: number;
    newToday: number;
  };
  scheduler: {
    totalJobs: number;
    failingJobs: number;
    healthyJobs: number;
    jobs: Array<{
      name: string;
      status: string;
      lastRunAt: string | null;
      consecutiveFailures: number;
      lastError?: string;
    }>;
  };
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    createdAt: string;
    actorName: string;
    actorRole: string;
    details?: any;
  }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}


function actionLabel(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function entityIcon(entityType: string) {
  const t = entityType?.toLowerCase() ?? "";
  if (t.includes("provider")) return <UserCheck className="h-3 w-3" />;
  if (t.includes("appointment")) return <Calendar className="h-3 w-3" />;
  if (t.includes("user") || t.includes("patient")) return <Users className="h-3 w-3" />;
  if (t.includes("payment") || t.includes("wallet") || t.includes("refund")) return <DollarSign className="h-3 w-3" />;
  if (t.includes("ticket") || t.includes("support")) return <Ticket className="h-3 w-3" />;
  if (t.includes("doc") || t.includes("credential")) return <FileText className="h-3 w-3" />;
  return <Activity className="h-3 w-3" />;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  color = "blue",
  badge,
  loading,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color?: "blue" | "green" | "amber" | "red" | "purple" | "teal";
  badge?: string;
  loading?: boolean;
}) {
  const colors = {
    blue:   "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400",
    green:  "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
    amber:  "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400",
    red:    "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400",
    purple: "bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400",
    teal:   "bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400",
  };

  return (
    <Card className="border-border/60 hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground truncate mb-1">{label}</p>
            {loading ? (
              <Skeleton className="h-8 w-16 mt-1" />
            ) : (
              <p className="text-2xl font-bold text-foreground">{value}</p>
            )}
          </div>
          <div className={cn("p-2.5 rounded-xl ml-3 shrink-0", colors[color])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {badge && !loading && (
          <div className="mt-3">
            <Badge variant="secondary" className="text-xs">{badge}</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActionItem({
  icon: Icon,
  iconColor,
  title,
  count,
  description,
  href,
  urgent,
}: {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  count: number;
  description: string;
  href: string;
  urgent?: boolean;
}) {
  const [, navigate] = useLocation();
  if (count === 0) return null;
  return (
    <button
      onClick={() => navigate(href)}
      data-testid={`action-item-${title.toLowerCase().replace(/\s+/g, "-")}`}
      className={cn(
        "w-full flex items-center gap-4 p-4 rounded-xl border transition-all duration-150 text-left",
        urgent
          ? "border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30"
          : "border-border/60 bg-card hover:bg-accent/40 hover:border-border"
      )}
    >
      <div className={cn("p-2.5 rounded-xl shrink-0", iconColor)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-foreground">{title}</span>
          {urgent && <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 text-xs border-0 px-1.5 py-0">Urgent</Badge>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={cn(
          "text-lg font-bold tabular-nums",
          urgent ? "text-red-600 dark:text-red-400" : "text-foreground"
        )}>{count}</span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </button>
  );
}

function HealthPill({ label, status }: { label: string; status: "ok" | "warn" | "error" | "unknown" }) {
  const styles = {
    ok:      "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60",
    warn:    "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/60",
    error:   "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/60",
    unknown: "bg-muted text-muted-foreground border-border",
  };
  const dots = {
    ok:      "bg-emerald-500",
    warn:    "bg-amber-500",
    error:   "bg-red-500",
    unknown: "bg-muted-foreground",
  };
  return (
    <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium", styles[status])}>
      <div className={cn("h-1.5 w-1.5 rounded-full", dots[status])} />
      {label}
    </div>
  );
}

function QuickAction({ icon: Icon, label, href, color }: { icon: React.ElementType; label: string; href: string; color: string }) {
  const [, navigate] = useLocation();
  return (
    <button
      onClick={() => navigate(href)}
      data-testid={`quick-action-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border/60 bg-card hover:bg-accent/50 hover:border-border hover:shadow-sm transition-all duration-150 group"
    >
      <div className={cn("p-3 rounded-xl", color, "group-hover:scale-105 transition-transform duration-150")}>
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-xs font-medium text-foreground text-center leading-tight">{label}</span>
    </button>
  );
}

// ── Rotating operational messages ─────────────────────────────────────────────
function useOperationalMessage(data: HomeSummary | undefined): string {
  const [idx, setIdx] = useState(0);

  const messages = useMemo(() => {
    if (!data) return ["Loading platform status…"];
    const msgs: string[] = [];

    if (data.totalActionsRequired === 0) {
      msgs.push("All critical systems are operational.");
      msgs.push("Platform activity is running smoothly.");
      msgs.push("No pending actions — great work.");
    }
    if (data.providers.totalNeedsReview > 0)
      msgs.push(`${data.providers.totalNeedsReview} provider${data.providers.totalNeedsReview !== 1 ? "s" : ""} ${data.providers.totalNeedsReview !== 1 ? "require" : "requires"} review.`);
    if (data.providers.docsPending > 0)
      msgs.push(`${data.providers.docsPending} document${data.providers.docsPending !== 1 ? "s" : ""} pending approval.`);
    if (data.support.urgentTickets > 0)
      msgs.push(`${data.support.urgentTickets} urgent support ticket${data.support.urgentTickets !== 1 ? "s" : ""} need${data.support.urgentTickets === 1 ? "s" : ""} attention.`);
    if (data.financial.pendingRefunds > 0)
      msgs.push(`${data.financial.pendingRefunds} refund${data.financial.pendingRefunds !== 1 ? "s" : ""} awaiting resolution.`);
    if (data.compliance.expiringCredentials > 0)
      msgs.push(`${data.compliance.expiringCredentials} provider credential${data.compliance.expiringCredentials !== 1 ? "s" : ""} expire${data.compliance.expiringCredentials === 1 ? "s" : ""} within 30 days.`);
    if (data.financial.revenueToday > 0)
      msgs.push(`Today's revenue: ${formatInCurrency(data.financial.revenueToday, "USD")}.`);
    if (data.appointments.totalToday > 0)
      msgs.push(`${data.appointments.totalToday} appointment${data.appointments.totalToday !== 1 ? "s" : ""} scheduled today.`);
    if (data.scheduler.failingJobs > 0)
      msgs.push(`${data.scheduler.failingJobs} background job${data.scheduler.failingJobs !== 1 ? "s" : ""} ${data.scheduler.failingJobs !== 1 ? "are" : "is"} failing.`);

    if (msgs.length === 0) msgs.push("Platform operations are healthy.");
    return msgs;
  }, [data]);

  useEffect(() => {
    if (messages.length <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % messages.length), 4000);
    return () => clearInterval(t);
  }, [messages.length]);

  return messages[idx] ?? "";
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminHome() {
  usePageTitle("Command Center | Golden Life Admin");
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isAdminRole(user.role)) {
      navigate("/login", { replace: true });
    }
  }, [authLoading, user, navigate]);

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery<HomeSummary>({
    queryKey: ["/api/admin/home-summary"],
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled: !!user && isAdminRole(user.role ?? ""),
  });

  const opMessage = useOperationalMessage(data);

  const lastUpdated = dataUpdatedAt
    ? formatTime(dataUpdatedAt, { hour: "numeric", minute: "2-digit" })
    : null;

  // ── Guard ──────────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user || !isAdminRole(user.role)) return null;

  // ── Derived data ───────────────────────────────────────────────────────────
  const d = data;
  const loading = isLoading;

  // Scheduler global health
  const schedulerHealth: "ok" | "warn" | "error" | "unknown" =
    !d ? "unknown" :
    d.scheduler.failingJobs === 0 ? "ok" :
    d.scheduler.failingJobs <= 1 ? "warn" : "error";

  const platformHealthy =
    d &&
    d.financial.failedPayments === 0 &&
    d.scheduler.failingJobs === 0 &&
    d.compliance.expiredCredentials === 0;

  const insightsList = useMemo((): string[] => {
    if (!d) return [];
    const ins: string[] = [];
    if (d.providers.totalNeedsReview >= 5) ins.push("Provider approval queue is growing — consider scheduling a review session.");
    if (d.compliance.expiringCredentials >= 3) ins.push("Several provider credentials expire this month — proactive outreach recommended.");
    if (d.financial.pendingRefunds >= 5) ins.push("Refund volume is elevated this week — review refund policies.");
    if (d.support.openTickets < 5) ins.push("Support queue is well-managed — response times are healthy.");
    if (d.appointments.completedToday > d.appointments.cancelledToday && d.appointments.totalToday > 0)
      ins.push("Appointment completion rate is strong today.");
    if (d.financial.revenueToday > 0) ins.push(`Platform generated ${formatInCurrency(d.financial.revenueToday, "USD")} in revenue today.`);
    if (d.platform.newUsersToday > 0) ins.push(`${d.platform.newUsersToday} new user${d.platform.newUsersToday !== 1 ? "s" : ""} joined the platform today.`);
    if (d.bugs.criticalBugs > 0) ins.push(`${d.bugs.criticalBugs} critical bug${d.bugs.criticalBugs !== 1 ? "s" : ""} require${d.bugs.criticalBugs === 1 ? "s" : ""} immediate attention.`);
    if (ins.length === 0) ins.push("All key platform metrics are within normal range.");
    return ins.slice(0, 4);
  }, [d]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* ── SECTION 1: Executive Greeting Hero ──────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 border border-slate-700/50 shadow-xl">
          {/* Ambient glow */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 right-0 w-80 h-80 bg-violet-600/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3" />
          </div>

          <div className="relative px-6 py-8 sm:px-10 sm:py-10">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                {/* Avatar + name */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-violet-500/25 shrink-0">
                    {user.firstName?.[0]?.toUpperCase() ?? "A"}
                  </div>
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">
                      {getGreeting()}, {user.firstName} 👋
                    </h1>
                    <p className="text-slate-400 text-sm capitalize">{user.role?.replace(/_/g, " ")}</p>
                  </div>
                </div>

                {/* Rotating operational message */}
                <div className="flex items-center gap-2 mt-1">
                  <div className={cn(
                    "h-2 w-2 rounded-full shrink-0",
                    d?.totalActionsRequired === 0 ? "bg-emerald-400 animate-pulse" :
                    (d?.totalActionsRequired ?? 0) <= 3 ? "bg-amber-400 animate-pulse" : "bg-red-400 animate-pulse"
                  )} />
                  <p className="text-slate-300 text-sm font-medium transition-all duration-500" data-testid="operational-message">
                    {opMessage}
                  </p>
                </div>
              </div>

              {/* Right side — health badge + refresh */}
              <div className="flex items-center gap-3 shrink-0">
                {d && (
                  <div className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border",
                    platformHealthy
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  )}>
                    {platformHealthy ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    {platformHealthy ? "Platform Healthy" : "Needs Attention"}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => refetch()}
                    data-testid="button-refresh-summary"
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                  </button>
                  {lastUpdated && <span className="text-xs text-slate-500">Updated {lastUpdated}</span>}
                </div>
              </div>
            </div>

            {/* Quick navigation bar */}
            <div className="flex flex-wrap gap-2 mt-6">
              {[
                { label: "Full Dashboard", href: "/admin", icon: LayoutDashboard },
                { label: "Providers", href: "/admin?tab=providers", icon: UserCheck },
                { label: "Bookings", href: "/admin?tab=bookings", icon: Calendar },
                { label: "Finance", href: "/admin?tab=finance", icon: DollarSign },
                { label: "Support", href: "/admin?tab=support", icon: Ticket },
              ].map(({ label, href, icon: Icon }) => (
                <Link key={label} href={href}>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 text-slate-300 hover:text-white text-xs font-medium transition-colors">
                    <Icon className="h-3 w-3" />
                    {label}
                  </button>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* ── SECTION 2: Action Required ──────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Action Required</h2>
              {d && d.totalActionsRequired > 0 && (
                <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 border-0 text-xs">
                  {d.totalActionsRequired} items
                </Badge>
              )}
            </div>
          </div>

          {loading ? (
            <div className="grid gap-2.5">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : error ? (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="p-4 flex items-center gap-3 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Failed to load action items. <button className="underline ml-1" onClick={() => refetch()}>Retry</button>
              </CardContent>
            </Card>
          ) : d && d.totalActionsRequired === 0 ? (
            <Card className="border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/20">
              <CardContent className="p-5 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
                  <CheckCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-emerald-800 dark:text-emerald-300 text-sm">All clear — no actions required</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">Platform is running smoothly. Check back later.</p>
                </div>
              </CardContent>
            </Card>
          ) : d ? (
            <div className="grid gap-2.5">
              <ActionItem
                icon={UserCheck}
                iconColor="bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400"
                title="Providers Awaiting Review"
                count={d.providers.totalNeedsReview}
                description="Pending approval or requiring action"
                href="/admin?tab=verification-queue"
                urgent={d.providers.totalNeedsReview >= 5}
              />
              <ActionItem
                icon={FileText}
                iconColor="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400"
                title="Documents Pending Approval"
                count={d.providers.docsPending}
                description="Provider documents awaiting verification"
                href="/admin?tab=doc-queue"
              />
              <ActionItem
                icon={Ticket}
                iconColor="bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400"
                title="Urgent Support Tickets"
                count={d.support.urgentTickets}
                description="High-priority tickets requiring response"
                href="/admin?tab=support"
                urgent={d.support.urgentTickets >= 3}
              />
              <ActionItem
                icon={CreditCard}
                iconColor="bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400"
                title="Pending Refund Requests"
                count={d.financial.pendingRefunds}
                description="Customer refunds awaiting resolution"
                href="/admin?tab=refunds"
                urgent={d.financial.pendingRefunds >= 5}
              />
              <ActionItem
                icon={AlertTriangle}
                iconColor="bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
                title="Failed Payments"
                count={d.financial.failedPayments}
                description="Payment failures in the past 7 days"
                href="/admin?tab=financial"
                urgent={d.financial.failedPayments >= 3}
              />
              <ActionItem
                icon={Bug}
                iconColor="bg-pink-100 dark:bg-pink-900/40 text-pink-600 dark:text-pink-400"
                title="Critical Bug Reports"
                count={d.bugs.criticalBugs}
                description="High-severity bugs requiring immediate attention"
                href="/admin/bug-reports"
                urgent={d.bugs.criticalBugs >= 2}
              />
              <ActionItem
                icon={Shield}
                iconColor="bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
                title="Expiring Credentials"
                count={d.compliance.expiringCredentials}
                description="Provider credentials expiring within 30 days"
                href="/admin/compliance-queue"
              />
              {d.scheduler.failingJobs > 0 && (
                <ActionItem
                  icon={Server}
                  iconColor="bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
                  title="Background Jobs Failing"
                  count={d.scheduler.failingJobs}
                  description="Scheduled jobs with consecutive failures"
                  href="/admin?tab=monitoring"
                  urgent
                />
              )}
            </div>
          ) : null}
        </div>

        {/* ── SECTION 3: Platform Overview ─────────────────────────────────── */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3">Platform Overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Total Patients"      value={d?.platform.totalPatients ?? 0}     icon={Users}       color="blue"   loading={loading} />
            <StatCard label="Total Providers"     value={d?.platform.totalProviders ?? 0}    icon={UserCheck}   color="purple" loading={loading} />
            <StatCard label="Appointments Today"  value={d?.appointments.totalToday ?? 0}    icon={Calendar}    color="teal"   loading={loading} />
            <StatCard label="Active Memberships"  value={d?.platform.activeMemberships ?? 0} icon={Package}     color="green"  loading={loading} />
            <StatCard label="Open Support Tickets" value={d?.support.openTickets ?? 0}       icon={Ticket}      color={d?.support.urgentTickets ? "amber" : "blue"} loading={loading} />
            <StatCard label="Pending Reviews"     value={d?.providers.totalNeedsReview ?? 0} icon={AlertCircle} color={d?.providers.totalNeedsReview ? "red" : "green"} loading={loading} />
          </div>
        </div>

        {/* ── SECTION 3.5: Provider Lifecycle Dashboard ───────────────────── */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">
                  <UserCheck className="h-4 w-4" />
                </div>
                Provider Lifecycle Dashboard
              </CardTitle>
              <Link href="/admin?tab=providers">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                  Manage Providers <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {[1,2,3,4,5,6,7].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
              </div>
            ) : d?.providers.lifecycle ? (
              <div className="space-y-3">
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {[
                    { label: "Draft",          count: d.providers.lifecycle.draft,          color: "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700", text: "text-slate-600 dark:text-slate-400", dot: "bg-slate-400" },
                    { label: "Submitted",      count: d.providers.lifecycle.submitted,      color: "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800", text: "text-yellow-700 dark:text-yellow-400", dot: "bg-yellow-400" },
                    { label: "Under Review",   count: d.providers.lifecycle.underReview,    color: "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800", text: "text-blue-700 dark:text-blue-400", dot: "bg-blue-400" },
                    { label: "Action Req'd",   count: d.providers.lifecycle.actionRequired, color: "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800", text: "text-orange-700 dark:text-orange-400", dot: "bg-orange-400" },
                    { label: "Approved",       count: d.providers.lifecycle.approved,       color: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800", text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-400" },
                    { label: "Suspended",      count: d.providers.lifecycle.suspended,      color: "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800", text: "text-red-700 dark:text-red-400", dot: "bg-red-400" },
                    { label: "Deactivated",    count: d.providers.lifecycle.deactivated,    color: "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700", text: "text-gray-500 dark:text-gray-500", dot: "bg-gray-400" },
                  ].map(({ label, count, color, text, dot }) => (
                    <div key={label} className={cn("rounded-xl border p-3 text-center", color)}>
                      <div className={cn("text-2xl font-bold tabular-nums", text)}>{count}</div>
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <div className={cn("h-1.5 w-1.5 rounded-full", dot)} />
                        <span className="text-[10px] text-muted-foreground leading-none">{label}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {d.providers.lifecycle.total > 0 && (
                  <div className="flex gap-0 h-2 rounded-full overflow-hidden">
                    {[
                      { val: d.providers.lifecycle.approved,       bg: "bg-emerald-400" },
                      { val: d.providers.lifecycle.underReview,    bg: "bg-blue-400" },
                      { val: d.providers.lifecycle.submitted,      bg: "bg-yellow-400" },
                      { val: d.providers.lifecycle.actionRequired, bg: "bg-orange-400" },
                      { val: d.providers.lifecycle.suspended,      bg: "bg-red-400" },
                      { val: d.providers.lifecycle.deactivated,    bg: "bg-gray-300" },
                      { val: d.providers.lifecycle.draft,          bg: "bg-slate-200" },
                    ].map(({ val, bg }) => val > 0 ? (
                      <div key={bg} className={cn(bg, "h-full transition-all")} style={{ width: `${(val / d.providers.lifecycle!.total) * 100}%` }} />
                    ) : null)}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Lifecycle data unavailable</p>
            )}
          </CardContent>
        </Card>

        {/* ── Two-column layout for middle sections ────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── SECTION 4: Provider Review Center ─────────────────────────── */}
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400">
                    <UserCheck className="h-4 w-4" />
                  </div>
                  Provider Review Center
                </CardTitle>
                <Link href="/admin?tab=provider-review">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" data-testid="button-view-provider-review">
                    View All <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {loading ? (
                <>{[1,2,3,4].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</>
              ) : d ? (
                <>
                  {[
                    { label: "Awaiting Approval",       count: d.providers.pendingApproval, color: "text-amber-600 dark:text-amber-400",  bg: "bg-amber-50 dark:bg-amber-950/30" },
                    { label: "Action Required",          count: d.providers.actionRequired,  color: "text-red-600 dark:text-red-400",     bg: "bg-red-50 dark:bg-red-950/30" },
                    { label: "Documents Pending",        count: d.providers.docsPending,     color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-950/30" },
                    { label: "Documents Rejected",       count: d.providers.docsRejected,    color: "text-rose-600 dark:text-rose-400",   bg: "bg-rose-50 dark:bg-rose-950/30" },
                  ].map(({ label, count, color, bg }) => (
                    <div key={label} className={cn("flex items-center justify-between px-3 py-2.5 rounded-lg", bg)}>
                      <span className="text-sm text-foreground">{label}</span>
                      <span className={cn("text-sm font-bold tabular-nums", color)}>{count}</span>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <Link href="/admin?tab=provider-review" className="flex-1">
                      <Button size="sm" variant="outline" className="w-full h-8 text-xs" data-testid="button-review-providers">
                        Review Providers
                      </Button>
                    </Link>
                    <Link href="/admin?tab=documents" className="flex-1">
                      <Button size="sm" className="w-full h-8 text-xs bg-violet-600 hover:bg-violet-700 text-white" data-testid="button-approve-documents">
                        Approve Docs
                      </Button>
                    </Link>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          {/* ── SECTION 5: Today's Operations ─────────────────────────────── */}
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400">
                    <Calendar className="h-4 w-4" />
                  </div>
                  Today's Operations
                </CardTitle>
                <Link href="/admin?tab=bookings">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" data-testid="button-view-bookings">
                    View All <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {loading ? (
                <>{[1,2,3,4].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</>
              ) : d ? (
                <>
                  {[
                    { label: "Confirmed",  count: d.appointments.confirmedToday, icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400" },
                    { label: "Video Consultations", count: d.appointments.videoToday, icon: Video, color: "text-blue-600 dark:text-blue-400" },
                    { label: "Completed",  count: d.appointments.completedToday, icon: CheckCheck, color: "text-teal-600 dark:text-teal-400" },
                    { label: "Cancelled",  count: d.appointments.cancelledToday, icon: X, color: "text-red-600 dark:text-red-400" },
                    { label: "No-shows",   count: d.appointments.noShowToday,    icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400" },
                    { label: "Pending",    count: d.platform.pendingBookings,    icon: Clock, color: "text-muted-foreground" },
                  ].map(({ label, count, icon: Icon, color }) => (
                    <div key={label} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                      <div className="flex items-center gap-2">
                        <Icon className={cn("h-3.5 w-3.5", color)} />
                        <span className="text-sm text-foreground">{label}</span>
                      </div>
                      <span className={cn("text-sm font-bold tabular-nums", color)}>{count}</span>
                    </div>
                  ))}
                </>
              ) : null}
            </CardContent>
          </Card>

          {/* ── SECTION 6: Financial Watchlist ────────────────────────────── */}
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
                    <DollarSign className="h-4 w-4" />
                  </div>
                  Financial Watchlist
                </CardTitle>
                <Link href="/admin?tab=finance">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" data-testid="button-view-finance">
                    View Finance <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {loading ? (
                <>{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</>
              ) : d ? (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50">
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Revenue Today</p>
                      <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">{formatInCurrency(d.financial.revenueToday, "USD")}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50">
                      <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Pending Payouts</p>
                      <p className="text-lg font-bold text-amber-700 dark:text-amber-300 mt-0.5">{d.financial.pendingPayouts}</p>
                    </div>
                  </div>
                  {[
                    { label: "Pending Refund Requests", count: d.financial.pendingRefunds, urgent: d.financial.pendingRefunds >= 5, color: "text-rose-600 dark:text-rose-400" },
                    { label: "Failed Payments (7d)",     count: d.financial.failedPayments, urgent: d.financial.failedPayments >= 3, color: "text-red-600 dark:text-red-400" },
                  ].map(({ label, count, urgent, color }) => (
                    <div key={label} className={cn(
                      "flex items-center justify-between px-3 py-2.5 rounded-lg",
                      urgent ? "bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40" : "bg-muted/40"
                    )}>
                      <span className="text-sm text-foreground">{label}</span>
                      <span className={cn("text-sm font-bold tabular-nums", color)}>{count}</span>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <Link href="/admin?tab=refunds" className="flex-1">
                      <Button size="sm" variant="outline" className="w-full h-8 text-xs" data-testid="button-resolve-refunds">
                        Resolve Refunds
                      </Button>
                    </Link>
                    <Link href="/admin?tab=payouts" className="flex-1">
                      <Button size="sm" variant="outline" className="w-full h-8 text-xs" data-testid="button-review-payouts">
                        Review Payouts
                      </Button>
                    </Link>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          {/* ── SECTION 7: Support & Incidents ────────────────────────────── */}
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400">
                    <Ticket className="h-4 w-4" />
                  </div>
                  Support &amp; Incidents
                </CardTitle>
                <Link href="/admin?tab=support">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" data-testid="button-view-support">
                    View Tickets <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {loading ? (
                <>{[1,2,3,4].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</>
              ) : d ? (
                <>
                  {[
                    { label: "Open Tickets",      count: d.support.openTickets,   color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/20" },
                    { label: "Urgent Tickets",    count: d.support.urgentTickets, color: "text-red-600 dark:text-red-400",    bg: "bg-red-50 dark:bg-red-950/20" },
                    { label: "New Today",         count: d.support.newToday,      color: "text-blue-600 dark:text-blue-400",  bg: "bg-blue-50 dark:bg-blue-950/20" },
                    { label: "Open Bug Reports",  count: d.bugs.openBugs,         color: "text-pink-600 dark:text-pink-400",  bg: "bg-pink-50 dark:bg-pink-950/20" },
                    { label: "Critical Bugs",     count: d.bugs.criticalBugs,     color: "text-rose-600 dark:text-rose-400",  bg: "bg-rose-50 dark:bg-rose-950/20" },
                  ].map(({ label, count, color, bg }) => (
                    <div key={label} className={cn("flex items-center justify-between px-3 py-2.5 rounded-lg", bg)}>
                      <span className="text-sm text-foreground">{label}</span>
                      <span className={cn("text-sm font-bold tabular-nums", color)}>{count}</span>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <Link href="/admin?tab=support" className="flex-1">
                      <Button size="sm" className="w-full h-8 text-xs bg-orange-500 hover:bg-orange-600 text-white" data-testid="button-manage-tickets">
                        Manage Tickets
                      </Button>
                    </Link>
                    <Link href="/admin/bug-reports" className="flex-1">
                      <Button size="sm" variant="outline" className="w-full h-8 text-xs" data-testid="button-view-bug-reports">
                        Bug Reports
                      </Button>
                    </Link>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

        </div>

        {/* ── SECTION 8: Compliance & Risk ────────────────────────────────── */}
        <Card className="border-amber-200/60 dark:border-amber-800/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
                  <Shield className="h-4 w-4" />
                </div>
                Compliance &amp; Risk
              </CardTitle>
              <Link href="/admin/compliance-queue">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" data-testid="button-view-compliance">
                  View Queue <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
              </div>
            ) : d ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className={cn(
                  "p-4 rounded-xl border",
                  d.compliance.expiringCredentials > 0
                    ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/50"
                    : "bg-muted/30 border-border/50"
                )}>
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-xs font-medium text-muted-foreground">Expiring Soon</span>
                  </div>
                  <p className={cn("text-2xl font-bold", d.compliance.expiringCredentials > 0 ? "text-amber-700 dark:text-amber-300" : "text-foreground")}>
                    {d.compliance.expiringCredentials}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Provider credentials (30 days)</p>
                </div>

                <div className={cn(
                  "p-4 rounded-xl border",
                  d.compliance.expiredCredentials > 0
                    ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/50"
                    : "bg-muted/30 border-border/50"
                )}>
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                    <span className="text-xs font-medium text-muted-foreground">Already Expired</span>
                  </div>
                  <p className={cn("text-2xl font-bold", d.compliance.expiredCredentials > 0 ? "text-red-700 dark:text-red-300" : "text-foreground")}>
                    {d.compliance.expiredCredentials}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Provider credentials</p>
                </div>

                <div className={cn(
                  "p-4 rounded-xl border",
                  d.compliance.unverifiedActive > 0
                    ? "bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800/50"
                    : "bg-muted/30 border-border/50"
                )}>
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    <span className="text-xs font-medium text-muted-foreground">Unverified Active</span>
                  </div>
                  <p className={cn("text-2xl font-bold", d.compliance.unverifiedActive > 0 ? "text-violet-700 dark:text-violet-300" : "text-foreground")}>
                    {d.compliance.unverifiedActive}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Providers without verification</p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* ── SECTION 9: System Health ─────────────────────────────────────── */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                <Activity className="h-4 w-4" />
              </div>
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex flex-wrap gap-2">
                {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-7 w-24 rounded-full" />)}
              </div>
            ) : d ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <HealthPill label="Database" status="ok" />
                  <HealthPill label="API Server" status="ok" />
                  <HealthPill label={`Scheduler (${d.scheduler.totalJobs} jobs)`} status={schedulerHealth} />
                  <HealthPill label="Notifications" status="ok" />
                  <HealthPill label="Video Service" status="ok" />
                  <HealthPill label="Email Queue" status="ok" />
                </div>

                {d.scheduler.jobs.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Background Jobs</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {d.scheduler.jobs.map(job => (
                        <div key={job.name} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 gap-2">
                          <span className="text-xs text-foreground truncate">{job.name.replace(/_/g, " ")}</span>
                          <span className={cn(
                            "text-xs font-medium shrink-0 flex items-center gap-1",
                            job.status === "ok" ? "text-emerald-600 dark:text-emerald-400" :
                            job.status === "idle" ? "text-muted-foreground" : "text-red-600 dark:text-red-400"
                          )}>
                            <div className={cn(
                              "h-1.5 w-1.5 rounded-full shrink-0",
                              job.status === "ok" ? "bg-emerald-500" :
                              job.status === "idle" ? "bg-slate-400" : "bg-red-500"
                            )} />
                            {job.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <Link href="/admin?tab=monitoring">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" data-testid="button-full-monitoring">
                      Full Monitoring <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* ── SECTION 10: Recent Platform Activity ────────────────────────── */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  <Activity className="h-4 w-4" />
                </div>
                Recent Platform Activity
              </CardTitle>
              <Link href="/admin?tab=audit">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" data-testid="button-view-audit">
                  Full Log <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
              </div>
            ) : d?.recentActivity.length ? (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-4 top-2 bottom-2 w-px bg-border/60" />

                <div className="space-y-1 pl-10">
                  {d.recentActivity.map((event, idx) => (
                    <div
                      key={event.id}
                      data-testid={`activity-item-${idx}`}
                      className="relative flex items-start gap-3 py-2.5 group"
                    >
                      {/* Dot */}
                      <div className="absolute -left-[1.65rem] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-muted-foreground/40 group-hover:bg-primary/60 transition-colors" />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            {entityIcon(event.entityType)}
                            <span className="capitalize">{event.entityType?.replace(/_/g, " ") ?? "system"}</span>
                          </span>
                          <span className="text-xs font-medium text-foreground">{actionLabel(event.action)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          by <span className="font-medium text-foreground/80">{event.actorName}</span>
                          {event.actorRole && <span className="capitalize"> ({event.actorRole.replace(/_/g, " ")})</span>}
                        </p>
                      </div>

                      <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                        {timeAgo(event.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No recent activity recorded.</p>
            )}
          </CardContent>
        </Card>

        {/* ── SECTION 11: Quick Actions ────────────────────────────────────── */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3">Quick Actions</h2>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2.5">
            <QuickAction icon={UserCheck}    label="Provider Review"  href="/admin?tab=provider-review" color="bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400" />
            <QuickAction icon={Users}        label="Users"            href="/admin/users"               color="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400" />
            <QuickAction icon={Calendar}     label="Appointments"     href="/admin?tab=bookings"        color="bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400" />
            <QuickAction icon={DollarSign}   label="Payments"         href="/admin?tab=finance"         color="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" />
            <QuickAction icon={Ticket}       label="Support"          href="/admin?tab=support"         color="bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400" />
            <QuickAction icon={BarChart3}    label="Analytics"        href="/admin?tab=analytics"       color="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400" />
            <QuickAction icon={Settings}     label="Settings"         href="/admin?tab=settings"        color="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" />
            <QuickAction icon={Monitor}      label="Monitoring"       href="/admin?tab=monitoring"      color="bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400" />
          </div>
        </div>

        {/* ── SECTION 12: Admin Insights ───────────────────────────────────── */}
        {(insightsList.length > 0 || loading) && (
          <Card className="border-border/60 bg-gradient-to-br from-indigo-50/40 via-background to-violet-50/30 dark:from-indigo-950/20 dark:via-background dark:to-violet-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">
                  <Zap className="h-4 w-4" />
                </div>
                Admin Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {insightsList.map((insight, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2.5 p-3.5 rounded-xl bg-background/80 border border-border/50 hover:border-border transition-colors"
                    >
                      <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
                        <TrendingUp className="h-3 w-3" />
                      </div>
                      <p className="text-sm text-foreground leading-snug">{insight}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Contextual link to full dashboard ───────────────────────────── */}
        <div className="flex items-center justify-between py-2 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            {d && `Data as of ${formatTime(d.generatedAt, { hour: "numeric", minute: "2-digit" })} · Auto-refreshes every 60s`}
          </p>
          <Link href="/admin">
            <Button variant="outline" size="sm" className="gap-2 h-8 text-xs" data-testid="button-open-full-dashboard">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Full Admin Dashboard
            </Button>
          </Link>
        </div>

      </main>

      <Footer />
    </div>
  );
}
