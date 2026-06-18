import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { usePageTitle } from "@/hooks/use-page-title";
import { QK } from "@/lib/query-keys";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { PatientNavStrip } from "@/components/patient-nav-strip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { AvatarMD } from "@/components/ui/provider-image";
import type { AppointmentWithDetails, Prescription } from "@shared/schema";
import {
  Calendar,
  Clock,
  Video,
  Home as HomeIcon,
  Building2,
  MapPin,
  ChevronRight,
  Plus,
  Wallet,
  Crown,
  Users,
  FileText,
  Pill,
  Star,
  Share2,
  Upload,
  AlertCircle,
  CheckCircle,
  Activity,
  Heart,
  Sparkles,
  ArrowRight,
  Phone,
  Stethoscope,
  BookOpen,
  Gift,
  Bell,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDate as formatDateTz } from "@/lib/datetime";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const CONTEXTUAL_MESSAGES = [
  "Your wellness journey continues today.",
  "Take a moment to review your health updates.",
  "You're making great progress.",
  "Stay on track with your care journey.",
  "Quality care is just a click away.",
  "Your health matters — we're here for you.",
];

const HEALTH_TIPS = [
  "Drink enough water throughout the day to support your body.",
  "Regular exercise improves overall wellbeing and mood.",
  "Quality sleep supports recovery and mental clarity.",
  "Routine checkups help prevent future health issues.",
  "Taking medications consistently improves outcomes.",
  "A few deep breaths can reduce stress significantly.",
  "Small daily habits build long-term health.",
];

function useRotating<T>(items: T[], intervalMs = 8000): T {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), intervalMs);
    return () => clearInterval(t);
  }, [items.length, intervalMs]);
  return items[idx];
}

function visitTypeIcon(vt?: string | null) {
  if (vt === "online") return <Video className="h-4 w-4" />;
  if (vt === "home") return <HomeIcon className="h-4 w-4" />;
  return <Building2 className="h-4 w-4" />;
}

function visitTypeLabel(vt?: string | null) {
  if (vt === "online") return "Video Visit";
  if (vt === "home") return "Home Visit";
  return "Clinic Visit";
}

function timeAgoLabel(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "1 week ago";
  return `${Math.floor(days / 7)} weeks ago`;
}

// ── Skeleton Cards ────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <Card className="rounded-2xl border border-border/50">
      <CardContent className="p-5 space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-24" />
      </CardContent>
    </Card>
  );
}

// ── Section 1 — Hero Greeting ─────────────────────────────────────────────────

function HeroGreeting({ user, nextAppt }: { user: any; nextAppt?: AppointmentWithDetails }) {
  const message = useRotating(
    nextAppt
      ? ["You have an upcoming appointment.", "Your next visit is coming up soon.", ...CONTEXTUAL_MESSAGES]
      : CONTEXTUAL_MESSAGES
  );
  const greeting = getGreeting();
  const firstName = user?.firstName || "there";

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/90 via-primary to-indigo-600 text-white px-6 py-10 md:px-10 md:py-12 shadow-xl shadow-primary/20">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-indigo-400/20 blur-2xl" />

      <div className="relative flex items-center gap-5">
        {user?.profileImageUrl ? (
          <img
            src={user.profileImageUrl}
            alt={firstName}
            loading="lazy"
            className="h-16 w-16 rounded-2xl object-cover ring-2 ring-white/30 flex-shrink-0"
          />
        ) : (
          <div className="h-16 w-16 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0 text-2xl font-bold">
            {firstName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-white/80 text-sm font-medium tracking-wide uppercase mb-1">
            {greeting}
          </p>
          <h1 className="text-2xl md:text-3xl font-bold truncate">
            {firstName} 👋
          </h1>
          <p className="text-white/75 text-sm mt-1.5 leading-relaxed">{message}</p>
        </div>
      </div>

      {/* Quick stat pills */}
      <div className="relative mt-8 flex flex-wrap gap-2">
        <Badge className="bg-white/20 text-white border-white/20 hover:bg-white/30 text-xs px-3 py-1.5 rounded-full backdrop-blur-sm">
          <Heart className="h-3 w-3 mr-1.5 fill-current" />
          Healthcare dashboard
        </Badge>
        <Badge className="bg-white/20 text-white border-white/20 hover:bg-white/30 text-xs px-3 py-1.5 rounded-full backdrop-blur-sm">
          <Sparkles className="h-3 w-3 mr-1.5" />
          Premium care
        </Badge>
      </div>
    </section>
  );
}

// ── Section 2 — Today's Care ──────────────────────────────────────────────────

function TodaysCare({ appointments, isLoading }: { appointments?: AppointmentWithDetails[]; isLoading: boolean }) {
  const [, navigate] = useLocation();

  const upcoming = useMemo(
    () =>
      (appointments ?? []).filter(
        (a) =>
          a.status === "pending" ||
          a.status === "approved" ||
          a.status === "confirmed" ||
          a.status === "rescheduled"
      ),
    [appointments]
  );

  const next = upcoming[0];

  if (isLoading) {
    return (
      <Card className="rounded-2xl border-2 border-primary/20 shadow-sm">
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-10 w-32" />
        </CardContent>
      </Card>
    );
  }

  if (!next) {
    return (
      <Card className="rounded-2xl border-2 border-dashed border-primary/20 bg-primary/2">
        <CardContent className="p-6 flex flex-col items-center text-center gap-4 py-10">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Calendar className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">No upcoming appointments</h3>
            <p className="text-sm text-muted-foreground">Book a visit with a verified healthcare provider.</p>
          </div>
          <Button onClick={() => navigate("/book")} className="rounded-xl gap-2" data-testid="btn-book-appointment">
            <Plus className="h-4 w-4" />
            Book Appointment
          </Button>
        </CardContent>
      </Card>
    );
  }

  const providerName = `${next.provider?.user?.firstName || ""} ${next.provider?.user?.lastName || ""}`.trim() || "Your Provider";
  const dateLabel = next.date
    ? new Date(String(next.date).slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : "Date TBC";

  const isVideo = next.visitType === "online";

  return (
    <Card className="rounded-2xl border-2 border-primary/25 shadow-md shadow-primary/10 bg-gradient-to-br from-background to-primary/3">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Calendar className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold text-foreground">Today's Care</span>
          </div>
          <StatusBadge domain="appointment" status={next.status} />
        </div>

        <div className="flex items-start gap-4">
          <AvatarMD
            src={next.provider?.user?.profileImageUrl ?? undefined}
            name={providerName}
            className="h-14 w-14 rounded-xl flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-lg text-foreground leading-tight">{providerName}</h3>
            <p className="text-muted-foreground text-sm mt-0.5">{next.service?.name || "Consultation"}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-primary/60" />
                {dateLabel}
                {next.startTime ? ` at ${next.startTime}` : ""}
              </span>
              <span className="flex items-center gap-1.5">
                {visitTypeIcon(next.visitType)}
                {visitTypeLabel(next.visitType)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-5 pt-5 border-t border-border/60">
          <Button asChild size="sm" className="rounded-xl gap-1.5 flex-1 sm:flex-none" data-testid="btn-view-appointment">
            <Link href={`/appointments/${next.id}`}>
              View Details
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
          {isVideo && (next as any).videoRoomUrl && (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="rounded-xl gap-1.5 flex-1 sm:flex-none border-primary/30 text-primary hover:bg-primary/5"
              data-testid="btn-join-video"
            >
              <a href={(next as any).videoRoomUrl} target="_blank" rel="noopener noreferrer">
                <Video className="h-3.5 w-3.5" />
                Join Video Visit
              </a>
            </Button>
          )}
          {(next.visitType === "home" || next.visitType === "clinic") && (
            <Button asChild size="sm" variant="outline" className="rounded-xl gap-1.5 border-border/60" data-testid="btn-directions">
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(
                  next.provider?.clinicFormattedAddress || next.provider?.clinicName || providerName
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MapPin className="h-3.5 w-3.5" />
                Directions
              </a>
            </Button>
          )}
          <Button asChild size="sm" variant="ghost" className="rounded-xl text-muted-foreground hover:text-foreground" data-testid="btn-reschedule">
            <Link href={`/appointments/${next.id}`}>Reschedule</Link>
          </Button>
        </div>

        {upcoming.length > 1 && (
          <p className="text-xs text-muted-foreground mt-3 text-center">
            +{upcoming.length - 1} more upcoming appointment{upcoming.length > 2 ? "s" : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Section 3 — Attention Required ───────────────────────────────────────────

interface Alert {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  href?: string;
  actionLabel?: string;
  severity: "high" | "medium" | "low";
}

function AttentionRequired({
  appointments,
  activePkgs,
  myReviews,
  referralData,
}: {
  appointments?: AppointmentWithDetails[];
  activePkgs?: any[];
  myReviews?: any[];
  referralData?: any;
}) {
  const { t } = useTranslation();
  const alerts: Alert[] = useMemo(() => {
    const list: Alert[] = [];

    // Pending reviews
    const completed = (appointments ?? []).filter((a) => a.status === "completed");
    const reviewedIds = new Set((myReviews ?? []).map((r: any) => r.appointmentId));
    const needReview = completed.filter((a) => !reviewedIds.has(a.id));
    if (needReview.length > 0) {
      list.push({
        id: "review",
        severity: "low",
        icon: <Star className="h-4 w-4 text-amber-500" />,
        title: t("patient_home.alert_review_title", "Pending Review"),
        description: t("patient_home.alert_review_desc", { count: needReview.length, defaultValue: `You have ${needReview.length} visit${needReview.length > 1 ? "s" : ""} awaiting your feedback.` }),
        href: `/review/${needReview[0].id}`,
        actionLabel: t("patient_home.alert_review_action", "Leave Review"),
      });
    }

    // Packages expiring soon (≤7 days) or low sessions (≤2)
    const expiring = (activePkgs ?? []).filter(
      (p) => (p.daysRemaining !== null && p.daysRemaining <= 7) || (p.sessionsTotal !== null && (p.sessionsTotal - p.sessionsUsed) <= 2)
    );
    if (expiring.length > 0) {
      list.push({
        id: "pkg",
        severity: "medium",
        icon: <Crown className="h-4 w-4 text-orange-500" />,
        title: t("patient_home.alert_pkg_title", "Package Sessions Low"),
        description: t("patient_home.alert_pkg_desc", { name: expiring[0].packageName, defaultValue: `"${expiring[0].packageName}" is running low.` }),
        href: "/membership",
        actionLabel: t("patient_home.alert_pkg_action", "View Packages"),
      });
    }

    // Active referral reward
    if (referralData?.pendingRewards > 0) {
      list.push({
        id: "referral",
        severity: "low",
        icon: <Share2 className="h-4 w-4 text-green-500" />,
        title: t("patient_home.alert_referral_title", "Active Referral Reward"),
        description: t("patient_home.alert_referral_desc", "You have a pending referral reward waiting."),
        href: "/referrals",
        actionLabel: t("patient_home.alert_referral_action", "Claim Reward"),
      });
    }

    return list;
  }, [appointments, activePkgs, myReviews, referralData, t]);

  if (!alerts.length) return null;

  const borderColor = (sev: Alert["severity"]) =>
    sev === "high" ? "border-red-200 bg-red-50/50 dark:border-red-900/30 dark:bg-red-950/20"
      : sev === "medium" ? "border-orange-200 bg-orange-50/50 dark:border-orange-900/30 dark:bg-orange-950/20"
      : "border-amber-200 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/20";

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="h-4 w-4 text-orange-500" />
        <h2 className="font-semibold text-foreground text-sm uppercase tracking-wide">{t("patient_home.attention_required", "Attention Required")}</h2>
      </div>
      <div className="flex flex-col gap-2">
        {alerts.map((a) => (
          <div
            key={a.id}
            className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${borderColor(a.severity)}`}
            data-testid={`alert-${a.id}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-shrink-0">{a.icon}</div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{a.title}</p>
                <p className="text-xs text-muted-foreground truncate">{a.description}</p>
              </div>
            </div>
            {a.href && (
              <Button asChild size="sm" variant="ghost" className="flex-shrink-0 rounded-lg h-7 text-xs px-3" data-testid={`alert-action-${a.id}`}>
                <Link href={a.href}>{a.actionLabel || t("patient_home.alert_view_fallback", "View")} <ChevronRight className="h-3 w-3 ml-0.5" /></Link>
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Section 4 — Health Snapshot ───────────────────────────────────────────────

function HealthSnapshot({
  appointments,
  familyMembers,
  prescriptions,
}: {
  appointments?: AppointmentWithDetails[];
  familyMembers?: any[];
  prescriptions?: any[];
}) {
  const upcoming = (appointments ?? []).filter(
    (a) => a.status === "pending" || a.status === "approved" || a.status === "confirmed" || a.status === "rescheduled"
  ).length;
  const completed = (appointments ?? []).filter((a) => a.status === "completed").length;

  const snapshots = [
    {
      id: "upcoming",
      icon: <Calendar className="h-5 w-5 text-primary" />,
      label: "Upcoming Visits",
      value: upcoming,
      bg: "bg-primary/8",
      href: "/appointments",
    },
    {
      id: "completed",
      icon: <CheckCircle className="h-5 w-5 text-emerald-500" />,
      label: "Completed Visits",
      value: completed,
      bg: "bg-emerald-500/8",
      href: "/appointments",
    },
    {
      id: "prescriptions",
      icon: <Pill className="h-5 w-5 text-violet-500" />,
      label: "Active Prescriptions",
      value: prescriptions?.length ?? 0,
      bg: "bg-violet-500/8",
      href: "/health-records",
    },
    {
      id: "family",
      icon: <Users className="h-5 w-5 text-blue-500" />,
      label: "Family Members",
      value: familyMembers?.length ?? 0,
      bg: "bg-blue-500/8",
      href: "/family-members",
    },
  ];

  return (
    <section>
      <h2 className="text-base font-semibold text-foreground mb-3">Health Snapshot</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {snapshots.map((s) => (
          <Link key={s.id} href={s.href}>
            <Card
              className="rounded-2xl border border-border/60 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer group"
              data-testid={`snapshot-${s.id}`}
            >
              <CardContent className="p-4">
                <div className={`h-10 w-10 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
                  {s.icon}
                </div>
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{s.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── Section 5 — Active Prescriptions ─────────────────────────────────────────

function ActivePrescriptions({ patientId }: { patientId?: string }) {
  const { data: prescriptions, isLoading } = useQuery<Prescription[]>({
    queryKey: QK.patientPrescriptions(patientId),
    enabled: !!patientId,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <CardSkeleton />;
  if (!prescriptions?.length) return null;

  const active = prescriptions.slice(0, 3);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Pill className="h-4 w-4 text-violet-500" />
          Active Prescriptions
        </h2>
        <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground h-7 rounded-lg" data-testid="btn-view-all-prescriptions">
          <Link href="/health-records">View all <ChevronRight className="h-3 w-3 ml-0.5" /></Link>
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {active.map((p) => (
          <Card key={p.id} className="rounded-xl border border-border/60" data-testid={`prescription-${p.id}`}>
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-xl bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                  <Pill className="h-4 w-4 text-violet-500" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{p.medicationName}</p>
                  <p className="text-xs text-muted-foreground">{p.dosage} · {p.frequency}</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-muted-foreground">{p.duration}</p>
                <Badge variant="secondary" className="text-xs mt-1 rounded-full px-2">Active</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

// ── Section 6 — Family Health ─────────────────────────────────────────────────

function FamilyHealth({ familyMembers, isLoading }: { familyMembers?: any[]; isLoading: boolean }) {
  if (isLoading) return <CardSkeleton />;
  if (!familyMembers?.length) return null;

  const shown = familyMembers.slice(0, 3);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-500" />
          Family Health
        </h2>
        <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground h-7 rounded-lg" data-testid="btn-view-all-family">
          <Link href="/family-members">View all <ChevronRight className="h-3 w-3 ml-0.5" /></Link>
        </Button>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {shown.map((m: any) => (
          <Card key={m.id} className="rounded-xl border border-border/60 hover:border-blue-300/50 hover:shadow-sm transition-all" data-testid={`family-${m.id}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0 text-sm font-bold text-blue-600">
                  {(m.firstName || m.name || "?").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{m.firstName || m.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{m.relationship}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline" className="h-7 text-xs rounded-lg flex-1 border-border/60" data-testid={`btn-book-family-${m.id}`}>
                  <Link href={`/book?familyMemberId=${m.id}`}>
                    <Plus className="h-3 w-3 mr-1" />
                    Book
                  </Link>
                </Button>
                <Button asChild size="sm" variant="ghost" className="h-7 text-xs rounded-lg flex-1" data-testid={`btn-view-family-${m.id}`}>
                  <Link href={`/family-members/${m.id}`}>Records</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        <Card className="rounded-xl border border-dashed border-border/60 hover:border-blue-300/60 transition-colors cursor-pointer">
          <CardContent className="p-4 h-full flex items-center justify-center">
            <Button asChild variant="ghost" className="gap-2 text-sm text-muted-foreground" data-testid="btn-add-family-member">
              <Link href="/family-members">
                <Plus className="h-4 w-4" />
                Add Member
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

// ── Section 7 — Benefits Center ───────────────────────────────────────────────

interface PackageSummaryItem {
  id: string;
  packageId: string;
  packageName: string;
  expiresAt: string | null;
  daysRemaining: number | null;
  sessionsTotal: number | null;
  sessionsUsed: number;
}

function BenefitsCenter({
  wallet,
  activePkgs,
  isLoadingWallet,
}: {
  wallet?: { balance: number | string; currency: string } | null;
  activePkgs?: PackageSummaryItem[];
  isLoadingWallet: boolean;
}) {
  const { format: fmtMoney } = useCurrency();

  const balance = wallet ? Number(wallet.balance ?? 0) : 0;
  const totalSessions = (activePkgs ?? []).reduce((sum, p) => sum + (p.sessionsTotal ? p.sessionsTotal - p.sessionsUsed : 0), 0);

  const benefits = [
    {
      id: "wallet",
      icon: <Wallet className="h-5 w-5 text-emerald-500" />,
      label: "Wallet Balance",
      value: isLoadingWallet ? "—" : fmtMoney(balance),
      bg: "bg-emerald-500/8",
      href: "/wallet",
      action: "Top Up",
    },
    {
      id: "sessions",
      icon: <Crown className="h-5 w-5 text-amber-500" />,
      label: "Package Sessions",
      value: totalSessions > 0 ? `${totalSessions} remaining` : "None active",
      bg: "bg-amber-500/8",
      href: "/membership",
      action: "View",
    },
    {
      id: "gift",
      icon: <Gift className="h-5 w-5 text-pink-500" />,
      label: "Gift & Referrals",
      value: "Earn rewards",
      bg: "bg-pink-500/8",
      href: "/referrals",
      action: "Refer",
    },
  ];

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          Benefits Center
        </h2>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        {benefits.map((b) => (
          <Link key={b.id} href={b.href}>
            <Card
              className="rounded-xl border border-border/60 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer h-full"
              data-testid={`benefit-${b.id}`}
            >
              <CardContent className="p-4 h-full flex flex-col justify-between gap-3">
                <div>
                  <div className={`h-9 w-9 rounded-xl ${b.bg} flex items-center justify-center mb-3`}>
                    {b.icon}
                  </div>
                  <p className="text-xs text-muted-foreground">{b.label}</p>
                  <p className="font-bold text-sm text-foreground mt-0.5">{b.value}</p>
                </div>
                <span className="text-xs text-primary font-medium flex items-center gap-1">
                  {b.action} <ArrowRight className="h-3 w-3" />
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── Section 8 — Recent Activity Timeline ──────────────────────────────────────

function RecentActivity({ appointments }: { appointments?: AppointmentWithDetails[] }) {
  const recent = useMemo(() => {
    const events: Array<{ id: string; label: string; sub: string; date: string; icon: React.ReactNode; color: string }> = [];

    (appointments ?? [])
      .filter((a) => a.status === "completed" || a.status === "cancelled" || a.status === "confirmed")
      .slice(0, 5)
      .forEach((a) => {
        const provName = `${a.provider?.user?.firstName || ""} ${a.provider?.user?.lastName || ""}`.trim() || "Provider";
        const dateStr = a.updatedAt ? String(a.updatedAt) : String(a.date || "");
        if (a.status === "completed") {
          events.push({
            id: a.id,
            label: "Appointment Completed",
            sub: `with ${provName}`,
            date: dateStr,
            icon: <CheckCircle className="h-3.5 w-3.5" />,
            color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
          });
        } else if (a.status === "cancelled") {
          events.push({
            id: a.id + "_c",
            label: "Appointment Cancelled",
            sub: `with ${provName}`,
            date: dateStr,
            icon: <AlertCircle className="h-3.5 w-3.5" />,
            color: "bg-red-500/15 text-red-600 dark:text-red-400",
          });
        } else if (a.status === "confirmed") {
          events.push({
            id: a.id + "_b",
            label: "Appointment Booked",
            sub: `with ${provName}`,
            date: dateStr,
            icon: <Calendar className="h-3.5 w-3.5" />,
            color: "bg-primary/15 text-primary",
          });
        }
      });

    return events.slice(0, 5);
  }, [appointments]);

  if (!recent.length) return null;

  return (
    <section>
      <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        Recent Activity
      </h2>
      <Card className="rounded-2xl border border-border/60">
        <CardContent className="p-4 divide-y divide-border/50">
          {recent.map((e, i) => (
            <div key={e.id} className={`flex items-center gap-3 py-3 ${i === 0 ? "pt-1" : ""} ${i === recent.length - 1 ? "pb-1" : ""}`} data-testid={`activity-${e.id}`}>
              <div className={`h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 ${e.color}`}>
                {e.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{e.label}</p>
                <p className="text-xs text-muted-foreground">{e.sub}</p>
              </div>
              <p className="text-xs text-muted-foreground flex-shrink-0">{e.date ? timeAgoLabel(e.date) : ""}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

// ── Section 9 — Health Tip ────────────────────────────────────────────────────

function HealthTip() {
  const tip = useRotating(HEALTH_TIPS, 12000);
  return (
    <Card className="rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 dark:border-emerald-900/30">
      <CardContent className="p-5 flex items-start gap-4">
        <div className="h-10 w-10 rounded-2xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Heart className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-1">Health Tip of the Day</p>
          <p className="text-sm text-foreground leading-relaxed">{tip}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Section 10 — Quick Actions ────────────────────────────────────────────────

function QuickActions() {
  const actions = [
    { id: "book", icon: <Calendar className="h-5 w-5" />, label: "Book Appointment", href: "/book", color: "text-primary bg-primary/10 group-hover:bg-primary group-hover:text-white" },
    { id: "records", icon: <FileText className="h-5 w-5" />, label: "Health Records", href: "/health-records", color: "text-violet-600 bg-violet-500/10 group-hover:bg-violet-500 group-hover:text-white" },
    { id: "upload", icon: <Upload className="h-5 w-5" />, label: "Upload Documents", href: "/my-documents", color: "text-blue-600 bg-blue-500/10 group-hover:bg-blue-500 group-hover:text-white" },
    { id: "family", icon: <Users className="h-5 w-5" />, label: "Add Family Member", href: "/family-members", color: "text-indigo-600 bg-indigo-500/10 group-hover:bg-indigo-500 group-hover:text-white" },
    { id: "refer", icon: <Share2 className="h-5 w-5" />, label: "Refer & Earn", href: "/referrals", color: "text-emerald-600 bg-emerald-500/10 group-hover:bg-emerald-500 group-hover:text-white" },
    { id: "wallet", icon: <Wallet className="h-5 w-5" />, label: "View Wallet", href: "/wallet", color: "text-amber-600 bg-amber-500/10 group-hover:bg-amber-500 group-hover:text-white" },
  ];

  return (
    <section>
      <h2 className="text-base font-semibold text-foreground mb-3">Quick Actions</h2>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {actions.map((a) => (
          <Link key={a.id} href={a.href}>
            <Card
              className="rounded-xl border border-border/60 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer group"
              data-testid={`quick-action-${a.id}`}
            >
              <CardContent className="p-3 flex flex-col items-center gap-2 text-center">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all ${a.color}`}>
                  {a.icon}
                </div>
                <p className="text-[11px] font-medium text-muted-foreground leading-tight">{a.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── Full Dashboard Link ───────────────────────────────────────────────────────

function ManageSection() {
  return (
    <Card className="rounded-2xl border border-border/50 bg-muted/30">
      <CardContent className="p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Stethoscope className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">Manage Everything</p>
            <p className="text-xs text-muted-foreground">Full appointments, invoices, documents & more</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="rounded-xl flex-shrink-0 border-border/60" data-testid="btn-full-dashboard">
          <Link href="/patient/dashboard">
            Open <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Main Patient Home ─────────────────────────────────────────────────────────

export default function PatientHome() {
  const { t } = useTranslation();
  usePageTitle("Home · Golden Life");
  const { user } = useAuth();

  const { data: appointments, isLoading: isLoadingAppts } = useQuery<AppointmentWithDetails[]>({
    queryKey: QK.patientAppointments(),
    enabled: !!user,
    staleTime: 30 * 1000,
  });

  const { data: walletData, isLoading: isLoadingWallet } = useQuery<{ balance: number | string; currency: string } | null>({
    queryKey: QK.wallet(),
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const { data: familyMembers, isLoading: isLoadingFamily } = useQuery<any[]>({
    queryKey: QK.familyMembers(),
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const { data: activePkgs } = useQuery<PackageSummaryItem[]>({
    queryKey: ["/api/patient/package-summary"],
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  const { data: myReviews } = useQuery<any[]>({
    queryKey: QK.myReviews(),
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const { data: referralData } = useQuery<any>({
    queryKey: QK.referrals(),
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  const { data: prescriptions } = useQuery<any[]>({
    queryKey: QK.patientPrescriptions(user?.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const upcomingAppointments = useMemo(
    () =>
      (appointments ?? []).filter(
        (a) =>
          a.status === "pending" ||
          a.status === "approved" ||
          a.status === "confirmed" ||
          a.status === "rescheduled"
      ),
    [appointments]
  );

  const nextAppt = upcomingAppointments[0];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <PatientNavStrip />
      <main className="flex-1 container mx-auto px-4 py-4 max-w-3xl">
        <div className="space-y-5 pb-10">
          {/* 1 — Greeting Hero */}
          <HeroGreeting user={user} nextAppt={nextAppt} />

          {/* 3 — Attention Required (above the fold when alerts exist) */}
          <AttentionRequired
            appointments={appointments}
            activePkgs={activePkgs}
            myReviews={myReviews}
            referralData={referralData}
          />

          {/* 2 — Today's Care */}
          <TodaysCare appointments={appointments} isLoading={isLoadingAppts} />

          {/* 4 — Health Snapshot */}
          <HealthSnapshot
            appointments={appointments}
            familyMembers={familyMembers}
            prescriptions={prescriptions}
          />

          {/* 5 — Active Prescriptions */}
          <ActivePrescriptions patientId={user?.id} />

          {/* 6 — Family Health */}
          <FamilyHealth familyMembers={familyMembers} isLoading={isLoadingFamily} />

          {/* 7 — Benefits Center */}
          <BenefitsCenter
            wallet={walletData}
            activePkgs={activePkgs}
            isLoadingWallet={isLoadingWallet}
          />

          {/* 8 — Recent Activity */}
          <RecentActivity appointments={appointments} />

          {/* 9 — Health Tip */}
          <HealthTip />

          {/* 10 — Quick Actions */}
          <QuickActions />

          {/* Full Dashboard link */}
          <ManageSection />
        </div>
      </main>
      <Footer />
    </div>
  );
}
