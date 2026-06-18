import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { formatDate as formatDateTz, formatDateTime as formatDateTimeTz } from "@/lib/datetime";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { PatientNavStrip } from "@/components/patient-nav-strip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { AppointmentTimeContext } from "@/components/appointment/AppointmentTimeContext";
import { SmartEmptyState } from "@/components/appointment/SmartEmptyState";
import { AvatarMD } from "@/components/ui/provider-image";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { NewTicketDialog } from "@/components/new-ticket-dialog";
import { ReportBugDialog } from "@/components/report-bug-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { showErrorModal } from "@/components/error-modal";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrency, formatInCurrency } from "@/lib/currency";
import {
  Calendar,
  Clock,
  Video,
  Home,
  Plus,
  Star,
  FileText,
  ChevronRight,
  X,
  MessageSquare,
  Bitcoin,
  CreditCard,
  Building2,
  Banknote,
  Wallet,
  Gift,
  Crown,
  ClipboardList,
  MapPin,
  Bell,
  UserCircle,
  Settings,
  Share2,
  Zap,
  ListChecks,
  TrendingUp,
  Phone,
  Copy,
  CheckCircle,
} from "lucide-react";
import type { AppointmentWithDetails, Prescription, MedicalHistory, ProviderWithUser } from "@shared/schema";
import { ProviderCard } from "@/components/provider-card";
import { Heart, RefreshCw, Activity, AlertCircle, AlertTriangle, Bug, Users, Pill, Image as GalleryIcon } from "lucide-react";
import { HealthMetricsTab } from "@/components/health-metrics-tab";
import { FamilyMembersTab } from "@/components/family-members-tab";
import { MedicationsTab } from "@/components/medications-tab";
import { AppointmentActionDialog, type AppointmentAction } from "@/components/appointment/AppointmentActionDialog";
import { RescheduleProposalBanner } from "@/components/appointment/RescheduleProposalBanner";
import { AppointmentStatusTicker } from "@/components/appointment/AppointmentStatusTicker";
import { useAppointmentStatusWS } from "@/hooks/use-appointment-status-ws";
import { usePageTitle } from "@/hooks/use-page-title";
import { QK } from "@/lib/query-keys";
import { SavedAddressesPicker } from "@/components/location/SavedAddressesPicker";
import { PatientReportingCenter } from "@/components/patient/PatientReportingCenter";

const PrescriptionList = ({ patientId }: { patientId?: string }) => {
  const { t } = useTranslation();
  const { data: prescriptions, isLoading } = useQuery<Prescription[]>({
    queryKey: QK.patientPrescriptions(patientId),
    enabled: !!patientId,
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!prescriptions?.length) return <p className="text-muted-foreground text-center py-4">{t("dashboard.no_prescriptions")}</p>;

  return (
    <div className="space-y-4">
      {prescriptions.map((p) => (
        <div key={p.id} className="border-b pb-2 last:border-0">
          <p className="font-medium">{p.medicationName} - {p.dosage}</p>
          <p className="text-sm text-muted-foreground">{p.frequency} for {p.duration}</p>
          {p.instructions && <p className="text-xs mt-1 italic">{p.instructions}</p>}
          {p.attachments && p.attachments.length > 0 && (
            <div className="flex gap-2 mt-2">
              {p.attachments.map((url, idx) => (
                  <Button key={idx} variant="outline" size="sm" className="h-7 text-xs" asChild>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <FileText className="h-3 w-3 mr-1" />
                      {t("dashboard.view_document")}
                    </a>
                  </Button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const HistoryList = ({ patientId }: { patientId?: string }) => {
  const { t } = useTranslation();
  const { data: history, isLoading } = useQuery<MedicalHistory[]>({
    queryKey: QK.medicalHistory(patientId!),
    enabled: !!patientId,
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!history?.length) return <p className="text-muted-foreground text-center py-4">{t("dashboard.no_history")}</p>;

  return (
    <div className="space-y-4">
      {history.map((h) => (
        <div key={h.id} className="border-b pb-4 last:border-0">
          <div className="flex justify-between items-start gap-2">
            <div>
              <p className="font-medium">{h.title} ({h.type})</p>
              <p className="text-sm text-muted-foreground">{h.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-2">
            <p className="text-xs text-muted-foreground">{formatDateTz(h.date)}</p>
            {h.attachments && h.attachments.length > 0 && (
              <div className="flex gap-2">
                {h.attachments.map((url, idx) => (
                  <Button key={idx} variant="outline" size="sm" className="h-7 text-xs" asChild>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <FileText className="h-3 w-3 mr-1" />
                      {t("dashboard.view_lab_result")}
                    </a>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default function PatientDashboard() {
  const { t } = useTranslation();
  usePageTitle(t("dashboard.meta_title", "My Dashboard"));
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { format: fmtMoney } = useCurrency();

  const [activeTab, setActiveTab] = useState<string>("upcoming");
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [reportBugOpen, setReportBugOpen] = useState(false);

  const { data: appointments, isLoading, isError: isErrorAppointments } = useQuery<AppointmentWithDetails[]>({
    queryKey: QK.patientAppointments(),
    enabled: !!user,
  });

  const { data: walletData } = useQuery<{ balance: number; currency: string } | null>({
    queryKey: QK.wallet(),
    enabled: !!user,
  });

  interface PackageSummaryItem {
    id: string;
    packageId: string;
    packageName: string;
    expiresAt: string | null;
    daysRemaining: number | null;
    sessionsTotal: number | null;
    sessionsUsed: number;
  }

  const { data: activePkgs } = useQuery<PackageSummaryItem[]>({
    queryKey: ["/api/patient/package-summary"],
    enabled: !!user,
  });

  // Fire-and-forget cleanup of stale appointments — deferred until AFTER the
  // dashboard renders so it doesn't block the initial paint. Best-effort.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      apiRequest("POST", "/api/appointments/cleanup", {})
        .then(async (res) => {
          if (cancelled) return;
          try {
            const body = await res.json();
            if (body && typeof body.cancelledCount === "number" && body.cancelledCount > 0) {
              queryClient.invalidateQueries({ queryKey: QK.patientAppointments() });
            }
          } catch {
            // ignore parse errors
          }
        })
        .catch(() => {
          // ignore — cleanup is best-effort
        });
    }, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [user?.id]);

  const { data: invoices, isLoading: isLoadingInvoices } = useQuery<any[]>({
    queryKey: QK.myInvoices(),
    enabled: !!user && activeTab === "invoices",
  });

  const { data: savedProviders, isLoading: isLoadingSaved } = useQuery<ProviderWithUser[]>({
    queryKey: QK.savedProviders(),
    enabled: user?.role === "patient" && activeTab === "saved",
  });

  // Family members count — loaded eagerly to drive the sidebar badge
  const { data: familyMembers } = useQuery<any[]>({
    queryKey: ["/api/family-members"],
    enabled: !!user,
  });
  const familyMemberCount = familyMembers?.length ?? 0;

  // Real-time appointment status ticker via WebSocket
  const { updates: statusUpdates, dismiss: dismissStatusUpdate } = useAppointmentStatusWS(!!user && user.role === "patient");

  // Health Metrics count — loaded eagerly for sidebar badge
  const { data: healthMetricsData } = useQuery<any[]>({
    queryKey: ["/api/health-metrics"],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  const healthMetricsCount = healthMetricsData?.length ?? 0;

  // Medications count — loaded eagerly for sidebar badge
  const { data: medicationsData } = useQuery<any[]>({
    queryKey: ["/api/medications"],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // ── New hub data queries ──────────────────────────────────────────────────

  // Referrals
  const { data: referralData, isLoading: isLoadingReferrals, isError: isErrorReferrals } = useQuery<any>({
    queryKey: QK.referrals(),
    enabled: !!user && activeTab === "engage",
    staleTime: 60 * 1000,
  });

  // Waitlist
  const { data: waitlistData, isLoading: isLoadingWaitlist, isError: isErrorWaitlist } = useQuery<any[]>({
    queryKey: QK.waitlist(),
    enabled: !!user && activeTab === "engage",
    staleTime: 30 * 1000,
  });

  // Notifications (unread count — loaded eagerly for badge)
  const { data: unreadCountData } = useQuery<{ count: number }>({
    queryKey: QK.notificationsUnreadCount(),
    enabled: !!user,
    staleTime: 60_000,
  });
  const unreadNotifCount = unreadCountData?.count ?? 0;

  // Recent notifications (for notifications-hub AND engage hub)
  const { data: notificationsData, isLoading: isLoadingNotifications, isError: isErrorNotifications } = useQuery<any[]>({
    queryKey: QK.notifications(),
    enabled: !!user && (activeTab === "notifications-hub" || activeTab === "engage"),
    staleTime: 30 * 1000,
  });

  // Gift cards
  const { data: giftCards, isLoading: isLoadingGiftCards, isError: isErrorGiftCards } = useQuery<any[]>({
    queryKey: QK.giftCards(),
    enabled: !!user && activeTab === "finance-hub",
    staleTime: 60 * 1000,
  });


  // My reviews — loaded eagerly so pending-review badge is accurate on all tabs
  const { data: myReviews } = useQuery<any[]>({
    queryKey: QK.myReviews(),
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  // Copy-to-clipboard state for referral code
  const [referralCopied, setReferralCopied] = useState(false);

  function copyReferralCode(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setReferralCopied(true);
      setTimeout(() => setReferralCopied(false), 2000);
    });
  }

  const generateInvoiceMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const res = await apiRequest("POST", `/api/invoices/generate/${appointmentId}`, {});
      return res.json();
    },
    onSuccess: (data: any, appointmentId) => {
      queryClient.invalidateQueries({ queryKey: QK.myInvoices() });
      queryClient.invalidateQueries({ queryKey: QK.patientAppointments() });
      toast({
        title: t("dashboard.invoice_ready_title", "Invoice ready"),
        description: t("dashboard.invoice_ready_desc", "Your invoice has been generated."),
      });
      if (data?.invoice?.id) {
        window.open(`/api/invoices/${data.invoice.id}/download`, "_blank", "noopener");
      } else {
        window.open(`/api/invoices/by-appointment/${appointmentId}/download`, "_blank", "noopener");
      }
    },
    onError: (e: any) => {
      showErrorModal({
        title: t("dashboard.invoice_failed_title", "Could not generate invoice"),
        description: e?.message || t("dashboard.invoice_failed_desc", "Please try again later."),
        context: "patient-dashboard.generateInvoice",
      });
    },
  });

  // Action dialog state — drives the unified cancel/reschedule modal.
  const [actionTarget, setActionTarget] = useState<{ id: string; action: AppointmentAction } | null>(null);

  const FILTER_STORAGE_KEY = "gl_pd_filters";
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    try { return JSON.parse(sessionStorage.getItem(FILTER_STORAGE_KEY) || "{}").search ?? ""; } catch { return ""; }
  });
  const [visitTypeFilter, setVisitTypeFilter] = useState<string>(() => {
    try { return JSON.parse(sessionStorage.getItem(FILTER_STORAGE_KEY) || "{}").visitType ?? "all"; } catch { return "all"; }
  });

  useEffect(() => {
    try { sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ search: searchQuery, visitType: visitTypeFilter })); } catch {}
  }, [searchQuery, visitTypeFilter]);

  const upcomingAppointments = useMemo(
    () =>
      appointments?.filter(
        (a) =>
          a.status === "pending" ||
          a.status === "approved" ||
          a.status === "confirmed" ||
          a.status === "rescheduled" ||
          a.status === "reschedule_proposed" ||
          a.status === "in_progress"
      ) ?? [],
    [appointments]
  );

  const completedAppointments = useMemo(
    () => appointments?.filter((a) => a.status === "completed") ?? [],
    [appointments]
  );

  // Rebook last provider (most recent completed appointment)
  const lastCompletedAppt = completedAppointments[0];

  // Pending reviews: completed appointments without a review
  const pendingReviews = useMemo(() => {
    if (!completedAppointments.length) return [];
    const reviewedIds = new Set((myReviews ?? []).map((r: any) => r.appointmentId));
    return completedAppointments.filter((a) => !reviewedIds.has(a.id));
  }, [completedAppointments, myReviews]);

  // Profile completion computation
  const profileCompletion = useMemo(() => {
    if (!user) return 0;
    const checks = [
      !!user.firstName,
      !!user.lastName,
      !!user.email,
      !!(user as any).mobileNumber,
      !!(user as any).address,
      !!(user as any).emergencyContactName,
      !!(user as any).languagePreference,
    ];
    const done = checks.filter(Boolean).length;
    return Math.round((done / checks.length) * 100);
  }, [user]);

  const cancelledAppointments = useMemo(
    () =>
      appointments?.filter((a) =>
        ["cancelled", "cancelled_by_patient", "cancelled_by_provider", "rejected", "no_show", "expired"].includes(a.status)
      ) ?? [],
    [appointments]
  );
  const pastAppointments = useMemo(
    () => [...completedAppointments, ...cancelledAppointments],
    [completedAppointments, cancelledAppointments]
  );

  const filterList = useCallback(
    (list: AppointmentWithDetails[]) => {
      const q = searchQuery.trim().toLowerCase();
      return list.filter((a) => {
        const providerName = `${a.provider?.user?.firstName || ""} ${a.provider?.user?.lastName || ""}`.toLowerCase();
        const matchesSearch =
          !q ||
          providerName.includes(q) ||
          (a.service?.name?.toLowerCase().includes(q) ?? false) ||
          (a.id?.toLowerCase().includes(q) ?? false);
        const matchesVisit = visitTypeFilter === "all" || a.visitType === visitTypeFilter;
        return matchesSearch && matchesVisit;
      });
    },
    [searchQuery, visitTypeFilter]
  );

  const nextAppointment = upcomingAppointments[0];

  const nextAppointmentCountdown = (() => {
    if (!nextAppointment) return "";
    try {
      const dateStr = typeof nextAppointment.date === "string"
        ? nextAppointment.date.slice(0, 10)
        : new Date(nextAppointment.date).toISOString().slice(0, 10);
      const target = new Date(`${dateStr}T${nextAppointment.startTime || "00:00"}:00`);
      const diffMs = target.getTime() - Date.now();
      if (Number.isNaN(diffMs)) return "";
      if (diffMs <= 0) return t("dashboard.starting_now", "Starting now");
      const minutes = Math.floor(diffMs / 60000);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      if (days >= 1) return t("dashboard.in_n_days", "In {{count}} days", { count: days });
      if (hours >= 1) return t("dashboard.in_n_hours", "In {{count}}h {{mins}}m", { count: hours, mins: minutes % 60 });
      return t("dashboard.in_n_minutes", "In {{count}} min", { count: minutes });
    } catch {
      return "";
    }
  })();


  const formatDate = (dateStr: string) => {
    return formatDateTz(dateStr, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const AppointmentCard = ({ appointment }: { appointment: AppointmentWithDetails }) => (
    <Card className="hover-elevate" data-testid={`appointment-${appointment.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <AvatarMD
            src={appointment.provider?.user?.avatarUrl}
            name={`${appointment.provider?.user?.firstName ?? ""} ${appointment.provider?.user?.lastName ?? ""}`.trim()}
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-semibold">
                    {appointment.provider?.user?.firstName} {appointment.provider?.user?.lastName}
                  </h4>
                  {(appointment as any).appointmentNumber && (
                    <span
                      className="text-xs font-mono font-semibold text-primary/80 bg-primary/10 px-2 py-0.5 rounded"
                      data-testid={`text-appt-number-${appointment.id}`}
                    >
                      {(appointment as any).appointmentNumber}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {appointment.provider?.specialization}
                </p>
              </div>
              <StatusBadge status={appointment.status} />
              {(() => {
                const p = (appointment as any).payment;
                const isCashPending =
                  p?.status === "pending" &&
                  p?.paymentMethod !== "card" &&
                  p?.paymentMethod !== "wallet" &&
                  !["cancelled", "cancelled_by_patient", "cancelled_by_provider", "rejected", "no_show", "expired"].includes(appointment.status);
                if (!isCashPending) return null;
                return (
                  <Badge
                    className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-700 flex items-center gap-1"
                    data-testid={`badge-payment-due-${appointment.id}`}
                  >
                    <Banknote className="h-3 w-3" />
                    {p?.paymentMethod === "bank_transfer" ? "Transfer due" : "Cash due"}
                  </Badge>
                );
              })()}
            </div>

            <div className="flex flex-wrap gap-4 mt-3 text-sm">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>{formatDate(appointment.date)}</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{appointment.startTime}</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                {appointment.visitType === "online" ? (
                  <Video className="h-4 w-4" />
                ) : (
                  <Home className="h-4 w-4" />
                )}
                <span>{appointment.visitType === "online" ? t("profile.online_consultation") : t("profile.home_visit")}</span>
              </div>
              <AppointmentTimeContext
                date={appointment.date}
                startTime={appointment.startTime}
                startAtUtc={(appointment as any).startAt}
                status={appointment.status}
                showIcon={true}
                className="text-primary font-medium"
              />
            </div>

            {/* Urgency warning — shown for upcoming appointments within 1 hour */}
            {(() => {
              if (!["pending", "confirmed", "approved"].includes(appointment.status)) return null;
              try {
                const diffMs = new Date(`${appointment.date}T${appointment.startTime}:00`).getTime() - Date.now();
                if (diffMs <= 0 || diffMs > 60 * 60_000) return null;
                const mins = Math.floor(diffMs / 60_000);
                if (mins <= 15) return (
                  <div className="flex items-start gap-2 rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/30 px-3 py-2 mt-1 text-xs" data-testid={`banner-urgent-${appointment.id}`}>
                    <AlertTriangle className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
                    <span className="text-orange-800 dark:text-orange-200">
                      <span className="font-semibold">Starts in {mins} minute{mins !== 1 ? "s" : ""}.</span>
                      {" "}Immediate attendance may be required. Please confirm you can arrive on time.
                    </span>
                  </div>
                );
                return (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 mt-1 text-xs" data-testid={`banner-soon-${appointment.id}`}>
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
                    <span className="text-amber-800 dark:text-amber-200">
                      <span className="font-semibold">This appointment begins soon.</span>
                      {" "}Please ensure you can attend on time.
                    </span>
                  </div>
                );
              } catch { return null; }
            })()}

            {(appointment.status === "pending" || appointment.status === "confirmed") && (
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/provider/${appointment.providerId}`}>
                    {t("dashboard.view_provider")}
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setActionTarget({ id: appointment.id, action: "reschedule" })}
                  data-testid={`button-reschedule-${appointment.id}`}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  {t("dashboard.reschedule", "Reschedule")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setActionTarget({ id: appointment.id, action: "cancel" })}
                  data-testid={`button-cancel-${appointment.id}`}
                >
                  <X className="h-4 w-4 mr-1" />
                  {t("dashboard.cancel")}
                </Button>
              </div>
            )}

            {appointment.status === "reschedule_proposed" && (
              <div className="mt-4">
                <RescheduleProposalBanner
                  appointmentId={appointment.id}
                  appointmentNumber={(appointment as any).appointmentNumber}
                  invalidateKeys={[["/api/appointments"], ["/api/patient/appointments"]]}
                />
              </div>
            )}

            {appointment.status === "completed" && (
              <div className="mt-4 flex flex-wrap gap-2">
                {(appointment as any).hasReview ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    data-testid={`button-reviewed-${appointment.id}`}
                  >
                    <Star className="h-4 w-4 mr-1 fill-yellow-400 text-yellow-400" />
                    {t("dashboard.review_submitted", "Review submitted")}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    data-testid={`button-leave-review-${appointment.id}`}
                  >
                    <Link href={`/review/${appointment.id}`}>
                      <Star className="h-4 w-4 mr-1" />
                      {t("dashboard.leave_review")}
                    </Link>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  asChild
                  data-testid={`button-rebook-${appointment.id}`}
                >
                  <Link
                    href={`/book?providerId=${appointment.providerId}${appointment.serviceId ? `&serviceId=${appointment.serviceId}` : ""}&visitType=${appointment.visitType}`}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    {t("dashboard.book_again", "Book again")}
                  </Link>
                </Button>
                {appointment.invoiceGenerated ? (
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    data-testid={`button-download-invoice-appt-${appointment.id}`}
                  >
                    <a
                      href={`/api/invoices/by-appointment/${appointment.id}/download`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      {t("dashboard.download_invoice", "Download invoice")}
                    </a>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => generateInvoiceMutation.mutate(appointment.id)}
                    disabled={generateInvoiceMutation.isPending && generateInvoiceMutation.variables === appointment.id}
                    data-testid={`button-generate-invoice-${appointment.id}`}
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    {t("dashboard.generate_invoice", "Generate invoice")}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen flex flex-col dark:bg-[#0d0f1a]">
      <Header />
      <PatientNavStrip />
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left sidebar navigation ────────────────────────────────────────── */}
        <aside className="hidden md:flex w-[260px] shrink-0 flex-col bg-[#121420] border-r border-[#1f2235] p-4 overflow-y-auto">
          {([
            { group: "MY APPOINTMENTS", items: [
              { label: t("dashboard.upcoming","Upcoming"), value: "upcoming", icon: <Calendar className="h-4 w-4" />, badge: upcomingAppointments.length },
              { label: t("dashboard.completed","Completed"), value: "completed", icon: <Star className="h-4 w-4" />, badge: completedAppointments.length },
              { label: t("dashboard.cancelled","Cancelled"), value: "cancelled", icon: <X className="h-4 w-4" />, badge: cancelledAppointments.length },
              { label: t("dashboard.all_history","All History"), value: "past", icon: <Clock className="h-4 w-4" />, badge: pastAppointments.length },
            ]},
            { group: "MY HEALTH", items: [
              { label: t("dashboard.medical","Medical Records"), value: "medical", icon: <FileText className="h-4 w-4" />, badge: 0 },
              { label: t("dashboard.health_metrics","Health Metrics"), value: "health-metrics", icon: <Activity className="h-4 w-4" />, badge: healthMetricsCount },
              { label: t("dashboard.family","Family Members"), value: "family", icon: <Users className="h-4 w-4" />, badge: familyMemberCount },
              { label: t("dashboard.medications","Medications"), value: "medications", icon: <Pill className="h-4 w-4" />, badge: medicationsData?.length ?? 0 },
            ]},
            { group: "PROVIDERS", items: [
              { label: t("dashboard.saved","Saved Providers"), value: "saved", icon: <Heart className="h-4 w-4" />, badge: savedProviders?.length ?? 0 },
            ]},
            { group: "BOOK CARE", items: [
              { label: "Book Care", value: "book-care", icon: <Plus className="h-4 w-4" />, badge: 0 },
            ]},
            { group: "FINANCE", items: [
              { label: "Finance Overview", value: "finance-hub", icon: <TrendingUp className="h-4 w-4" />, badge: 0 },
              { label: t("dashboard.invoices","Invoices"), value: "invoices", icon: <Banknote className="h-4 w-4" />, badge: 0 },
            ]},
            { group: "ENGAGE", items: [
              { label: "Reviews", value: "engage", icon: <Star className="h-4 w-4" />, badge: pendingReviews.length },
              { label: "Notifications", value: "notifications-hub", icon: <Bell className="h-4 w-4" />, badge: unreadNotifCount },
            ]},
            { group: "MY PROFILE", items: [
              { label: "My Profile", value: "profile-hub", icon: <UserCircle className="h-4 w-4" />, badge: profileCompletion < 100 ? 1 : 0 },
            ]},
            { group: "GALLERY", items: [
              { label: t("dashboard.gallery","My Gallery"), value: "gallery", icon: <GalleryIcon className="h-4 w-4" />, badge: 0 },
            ]},
          ] as { group: string; items: { label: string; value: string; icon: JSX.Element; badge: number }[] }[]).map(({ group, items }) => (
            <div key={group} className="mb-4">
              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest px-2 mb-1 mt-2">{group}</p>
              {items.map(({ label, value, icon, badge }) => (
                <button key={value} onClick={() => setActiveTab(value)} data-testid={`sidebar-nav-${value}`}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left ${activeTab === value ? "bg-white/15 text-white font-medium" : "text-white/60 hover:bg-white/10 hover:text-white/90"}`}>
                  <span className="shrink-0 text-white/50">{icon}</span>
                  <span className="flex-1 truncate">{label}</span>
                  {badge > 0 ? <span className="shrink-0 rounded-full bg-white/20 text-white/90 text-[10px] px-1.5 py-0.5 min-w-[18px] text-center leading-tight">{badge}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </aside>
        {/* ── Right content canvas ─────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto py-8">
        <div className="container mx-auto px-4">

          {/* ── Mobile tab navigator (visible on <md screens only) ─────────── */}
          <div className="block md:hidden mb-4" data-testid="mobile-tab-select">
            <Select value={activeTab} onValueChange={setActiveTab}>
              <SelectTrigger className="w-full" data-testid="select-tab-trigger">
                <SelectValue placeholder="Navigate…" />
              </SelectTrigger>
              <SelectContent>
                {[
                  { label: "Upcoming", value: "upcoming" },
                  { label: "Completed", value: "completed" },
                  { label: "Cancelled", value: "cancelled" },
                  { label: "All History", value: "past" },
                  { label: "Medical Records", value: "medical" },
                  { label: "Health Metrics", value: "health-metrics" },
                  { label: "Family Members", value: "family" },
                  { label: "Medications", value: "medications" },
                  { label: "Saved Providers", value: "saved" },
                  { label: "Book Care", value: "book-care" },
                  { label: "Finance Overview", value: "finance-hub" },
                  { label: "Invoices", value: "invoices" },
                  { label: "Reviews & Referrals", value: "engage" },
                  { label: "Notifications", value: "notifications-hub" },
                  { label: "My Profile", value: "profile-hub" },
                  { label: "My Gallery", value: "gallery" },
                ].map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} data-testid={`mobile-tab-option-${opt.value}`}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-semibold">{t("dashboard.welcome")}, {user?.firstName}!</h1>
              <p className="text-muted-foreground">{t("dashboard.manage_appointments")}</p>
            </div>
            {user?.role === "patient" && (
              <Button asChild data-testid="button-new-appointment">
                <Link href="/providers">
                  <Plus className="h-4 w-4 mr-2" />
                  {t("dashboard.book_new")}
                </Link>
              </Button>
            )}
          </div>

          {/* ── Global Quick Actions bar ──────────────────────────────────── */}
          <div className="mb-8 rounded-2xl border border-border/60 bg-card p-4" data-testid="section-quick-actions">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-primary" />
              Quick Actions
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {[
                {
                  label: "Book Appointment",
                  icon: <Calendar className="h-5 w-5" />,
                  href: "/providers",
                  color: "text-primary",
                  bg: "bg-primary/10 hover:bg-primary/20",
                  testid: "qa-book",
                },
                {
                  label: lastCompletedAppt ? "Rebook Last" : "Find Provider",
                  icon: <RefreshCw className="h-5 w-5" />,
                  href: lastCompletedAppt
                    ? `/book?providerId=${lastCompletedAppt.providerId}${lastCompletedAppt.serviceId ? `&serviceId=${lastCompletedAppt.serviceId}` : ""}&visitType=${lastCompletedAppt.visitType}`
                    : "/providers",
                  color: "text-sky-600 dark:text-sky-400",
                  bg: "bg-sky-500/10 hover:bg-sky-500/20",
                  testid: "qa-rebook",
                },
                {
                  label: "Health Records",
                  icon: <Activity className="h-5 w-5" />,
                  href: "/health-records",
                  color: "text-emerald-600 dark:text-emerald-400",
                  bg: "bg-emerald-500/10 hover:bg-emerald-500/20",
                  testid: "qa-health",
                },
                {
                  label: "Wallet",
                  icon: <Wallet className="h-5 w-5" />,
                  href: "/wallet",
                  color: "text-amber-600 dark:text-amber-400",
                  bg: "bg-amber-500/10 hover:bg-amber-500/20",
                  testid: "qa-wallet",
                },
                {
                  label: "Add Family",
                  icon: <Users className="h-5 w-5" />,
                  href: "/family-members",
                  color: "text-violet-600 dark:text-violet-400",
                  bg: "bg-violet-500/10 hover:bg-violet-500/20",
                  testid: "qa-family",
                },
                {
                  label: "Refer & Earn",
                  icon: <Gift className="h-5 w-5" />,
                  href: "/referrals",
                  color: "text-rose-600 dark:text-rose-400",
                  bg: "bg-rose-500/10 hover:bg-rose-500/20",
                  testid: "qa-refer",
                },
              ].map((action) => (
                <Link key={action.testid} href={action.href}>
                  <button
                    className={`w-full flex flex-col items-center gap-2 rounded-xl p-3 transition-colors ${action.bg}`}
                    data-testid={action.testid}
                  >
                    <span className={action.color}>{action.icon}</span>
                    <span className="text-xs font-medium text-center leading-tight">{action.label}</span>
                  </button>
                </Link>
              ))}
            </div>
          </div>

          {/* ── Overview section (visible only on upcoming tab) ─── */}
          {activeTab === "upcoming" && (
          <>

          {/* Smart Next Action card */}
          {(() => {
            const hasDraft = (() => { try { const d = sessionStorage.getItem("gl_booking_draft"); return !!d && !!JSON.parse(d).providerId; } catch { return false; } })();
            const walletLow = !!(walletData && typeof walletData.balance === "number" && walletData.balance < 5);
            const lastCompleted = completedAppointments[0];
            const daysSinceLast = lastCompleted
              ? Math.floor((Date.now() - new Date(lastCompleted.date).getTime()) / 86400000)
              : 999;
            const reEngage = upcomingAppointments.length === 0 && daysSinceLast > 30;

            if (hasDraft) return (
              <Card className="mb-6 border-primary/30 bg-primary/5" data-testid="card-next-action-draft">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <ClipboardList className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{t("dashboard.resume_draft", "You have an unfinished booking")}</p>
                    <p className="text-xs text-muted-foreground">{t("dashboard.resume_draft_desc", "Pick up where you left off — your selections are saved.")}</p>
                  </div>
                  <Button size="sm" asChild data-testid="button-resume-draft">
                    <Link href="/book">{t("dashboard.resume", "Resume")} →</Link>
                  </Button>
                </CardContent>
              </Card>
            );

            if (walletLow) return (
              <Card className="mb-6 border-amber-300/40 bg-amber-50 dark:bg-amber-900/10" data-testid="card-next-action-wallet">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                    <Wallet className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{t("dashboard.wallet_low", "Your wallet balance is low")}</p>
                    <p className="text-xs text-muted-foreground">{t("dashboard.wallet_low_desc", "Top up your wallet to pay for your next appointment instantly.")}</p>
                  </div>
                  <Button size="sm" variant="outline" asChild data-testid="button-topup-wallet">
                    <Link href="/wallet">{t("dashboard.top_up", "Top up")}</Link>
                  </Button>
                </CardContent>
              </Card>
            );

            if (reEngage) return (
              <Card className="mb-6 border-emerald-300/40 bg-emerald-50 dark:bg-emerald-900/10" data-testid="card-next-action-reengage">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                    <Heart className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{t("dashboard.reengage_title", "Time to book your next session")}</p>
                    <p className="text-xs text-muted-foreground">{t("dashboard.reengage_desc", "It's been a while — staying on top of your health is easy.")}</p>
                  </div>
                  <Button size="sm" asChild data-testid="button-book-new-reengage">
                    <Link href="/providers">{t("dashboard.book_now", "Book now")}</Link>
                  </Button>
                </CardContent>
              </Card>
            );

            return null;
          })()}

          {nextAppointment && (
            <Card className="mb-8 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/20" data-testid="card-next-appointment">
              <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                      <Calendar className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm text-muted-foreground">{t("dashboard.next_appointment")}</p>
                        <Badge variant="secondary" className="text-xs" data-testid="badge-countdown">
                          <Clock className="h-3 w-3 mr-1" />
                          {nextAppointmentCountdown}
                        </Badge>
                      </div>
                      <h3 className="text-xl font-semibold">
                        {nextAppointment.provider?.user?.firstName} {nextAppointment.provider?.user?.lastName}
                      </h3>
                      <p className="text-muted-foreground">
                        {nextAppointment.provider?.specialization}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-6">
                    <div>
                      <p className="text-sm text-muted-foreground">{t("profile.select_date")}</p>
                      <p className="font-medium">{formatDate(nextAppointment.date)} at {nextAppointment.startTime}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t("common.service_type")}</p>
                      <p className="font-medium flex items-center gap-1">
                        {nextAppointment.visitType === "online" ? (
                          <>
                            <Video className="h-4 w-4" />
                            {t("profile.online_consultation")}
                          </>
                        ) : (
                          <>
                            <Home className="h-4 w-4" />
                            {t("profile.home_visit")}
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActionTarget({ id: nextAppointment.id, action: "reschedule" })}
                      data-testid="button-reschedule-next-appointment"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      {t("dashboard.reschedule", "Reschedule")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActionTarget({ id: nextAppointment.id, action: "cancel" })}
                      data-testid="button-cancel-next-appointment"
                    >
                      <X className="h-4 w-4 mr-2" />
                      {t("dashboard.cancel", "Cancel")}
                    </Button>
                    <Button asChild data-testid="button-view-next-appointment">
                      <Link href={`/appointments/${nextAppointment.id}`}>
                        {t("dashboard.view_details")}
                        <ChevronRight className="h-4 w-4 ml-2" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pending cash / bank-transfer payment banner */}
          {(() => {
            const pendingCash = appointments?.filter((a) => {
              const p = (a as any).payment;
              return (
                p?.status === "pending" &&
                p?.paymentMethod !== "card" &&
                p?.paymentMethod !== "wallet" &&
                !["cancelled", "cancelled_by_patient", "cancelled_by_provider", "rejected", "no_show", "expired"].includes(a.status)
              );
            }) ?? [];
            if (pendingCash.length === 0) return null;
            return (
              <div
                className="mb-6 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-start gap-3"
                data-testid="banner-pending-cash-payment"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0 mt-0.5">
                  <Banknote className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
                    {pendingCash.length === 1
                      ? "You have 1 appointment with payment due"
                      : `You have ${pendingCash.length} appointments with payment due`}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    Bring cash or complete your bank transfer before the appointment. Your reference number is shown on each booking.
                  </p>
                </div>
                <a
                  href="/appointments"
                  className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 underline underline-offset-2 shrink-0 mt-1"
                  data-testid="link-view-pending-payments"
                >
                  View all →
                </a>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card
              className="stat-card stat-blue cursor-pointer hover:opacity-90 transition-opacity"
              data-testid="stat-upcoming"
              onClick={() => setActiveTab("upcoming")}
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="stat-icon">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{upcomingAppointments.length}</p>
                    <p className="text-sm text-muted-foreground">{t("dashboard.upcoming")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              className="stat-card stat-emerald cursor-pointer hover:opacity-90 transition-opacity"
              data-testid="stat-completed"
              onClick={() => setActiveTab("completed")}
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="stat-icon">
                    <Star className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {pastAppointments.filter(a => a.status === "completed").length}
                    </p>
                    <p className="text-sm text-muted-foreground">{t("dashboard.completed")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              className="stat-card stat-violet cursor-pointer hover:opacity-90 transition-opacity"
              data-testid="stat-messages"
              onClick={() => setActiveTab("upcoming")}
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="stat-icon">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{upcomingAppointments.filter(a => a.status === 'confirmed').length}</p>
                    <p className="text-sm text-muted-foreground">{t("dashboard.active")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {activePkgs && activePkgs.length > 0 && (
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="section-active-packages">
              {activePkgs.map((pkg) => {
                const hasSession = pkg.sessionsTotal !== null;
                const sessionsLeft = hasSession ? Math.max(0, pkg.sessionsTotal! - pkg.sessionsUsed) : null;
                const isExpiringSoon = pkg.daysRemaining !== null && pkg.daysRemaining <= 7;
                const isLowSessions = hasSession && sessionsLeft !== null && sessionsLeft <= 2;
                const urgent = isExpiringSoon || isLowSessions;
                return (
                  <div
                    key={pkg.id}
                    className={`rounded-2xl border p-4 flex items-start gap-3 ${
                      urgent
                        ? "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30"
                        : "border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20"
                    }`}
                    data-testid={`card-active-package-${pkg.id}`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                      urgent ? "bg-amber-100 dark:bg-amber-900/40" : "bg-violet-100 dark:bg-violet-900/40"
                    }`}>
                      <Crown className={`h-4 w-4 ${urgent ? "text-amber-600 dark:text-amber-400" : "text-violet-600 dark:text-violet-400"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm truncate ${
                        urgent ? "text-amber-800 dark:text-amber-300" : "text-violet-800 dark:text-violet-300"
                      }`}>{pkg.packageName}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {pkg.daysRemaining !== null && (
                          <span className="text-xs text-muted-foreground">
                            {pkg.daysRemaining === 0 ? "Expires today" : `${pkg.daysRemaining}d left`}
                          </span>
                        )}
                        {hasSession && sessionsLeft !== null && (
                          <span className="text-xs text-muted-foreground">
                            {sessionsLeft} session{sessionsLeft !== 1 ? "s" : ""} remaining
                          </span>
                        )}
                      </div>
                      {urgent && (
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                          {isLowSessions ? "Running low — book soon" : "Expiring soon — use before it's gone"}
                        </p>
                      )}
                    </div>
                    <Link href="/providers">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs shrink-0"
                        data-testid={`button-book-package-${pkg.id}`}
                      >
                        Book
                      </Button>
                    </Link>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Quick-link widgets: Health Records + Referrals ───────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6" data-testid="section-quick-links">
            <Link href="/health-records">
              <div className="rounded-2xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/20 p-4 flex items-center gap-3 cursor-pointer hover:shadow-sm hover:border-sky-300 dark:hover:border-sky-700 transition-all" data-testid="card-quick-health-records">
                <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shrink-0">
                  <Activity className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-sky-800 dark:text-sky-300">{t("dashboard.health_records", "Health Records")}</p>
                  <p className="text-xs text-muted-foreground">Your full care history in one place</p>
                </div>
                <ChevronRight className="h-4 w-4 text-sky-400 shrink-0" />
              </div>
            </Link>
            <Link href="/referrals">
              <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-center gap-3 cursor-pointer hover:shadow-sm hover:border-amber-300 dark:hover:border-amber-700 transition-all" data-testid="card-quick-referrals">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                  <Gift className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-amber-800 dark:text-amber-300">{t("dashboard.refer_earn", "Refer & Earn")}</p>
                  <p className="text-xs text-muted-foreground">Invite friends and earn wallet credit</p>
                </div>
                <ChevronRight className="h-4 w-4 text-amber-400 shrink-0" />
              </div>
            </Link>
          </div>

          </>
          )}

          <div className="flex justify-end mb-4 gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              data-testid="button-patient-report-bug"
              onClick={() => setReportBugOpen(true)}
            >
              <Bug className="h-4 w-4" />
              Report a Problem
            </Button>
            <Button
              variant="default"
              size="sm"
              className="gap-2"
              data-testid="button-patient-new-ticket"
              onClick={() => setNewTicketOpen(true)}
            >
              <Plus className="h-4 w-4" />
              {t("support.new_ticket", "New ticket")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              data-testid="button-patient-contact-support"
              onClick={async () => {
                try {
                  await fetch("/api/support/contact", { method: "POST", credentials: "include" });
                  window.dispatchEvent(new CustomEvent("open-chat"));
                } catch {}
              }}
            >
              <MessageSquare className="h-4 w-4" />
              {t("dashboard.contact_support", "Contact support")}
            </Button>
          </div>

          <NewTicketDialog open={newTicketOpen} onOpenChange={setNewTicketOpen} />
          <ReportBugDialog open={reportBugOpen} onOpenChange={setReportBugOpen} />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="hidden">
              <TabsTrigger value="upcoming" data-testid="tab-upcoming">
                {t("dashboard.upcoming")} ({upcomingAppointments.length})
              </TabsTrigger>
              <TabsTrigger value="completed" data-testid="tab-completed">
                {t("dashboard.completed")} ({completedAppointments.length})
              </TabsTrigger>
              <TabsTrigger value="cancelled" data-testid="tab-cancelled">
                {t("dashboard.cancelled", "Cancelled")} ({cancelledAppointments.length})
              </TabsTrigger>
              <TabsTrigger value="past" data-testid="tab-past">
                {t("dashboard.all_history", "All history")} ({pastAppointments.length})
              </TabsTrigger>
              <TabsTrigger value="saved" data-testid="tab-saved">
                {t("dashboard.saved", "Saved")} ({savedProviders?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="medical" data-testid="tab-medical">
                {t("dashboard.medical_records")}
              </TabsTrigger>
              <TabsTrigger value="health-metrics" data-testid="tab-health-metrics">
                {t("dashboard.health_metrics", "Health metrics")}
              </TabsTrigger>
              <TabsTrigger value="family" data-testid="tab-family">
                {t("dashboard.family", "Family")}
              </TabsTrigger>
              <TabsTrigger value="medications" data-testid="tab-medications">
                {t("dashboard.medications", "Medications")}
              </TabsTrigger>
              <TabsTrigger value="invoices" data-testid="tab-invoices">
                {t("dashboard.invoices")}
              </TabsTrigger>
              <TabsTrigger value="gallery" data-testid="tab-gallery">
                My Gallery
              </TabsTrigger>
              <TabsTrigger value="book-care" data-testid="tab-book-care">Book Care</TabsTrigger>
              <TabsTrigger value="finance-hub" data-testid="tab-finance-hub">Finance</TabsTrigger>
              <TabsTrigger value="insights" data-testid="tab-insights">My Insights</TabsTrigger>
              <TabsTrigger value="engage" data-testid="tab-engage">Engage</TabsTrigger>
              <TabsTrigger value="notifications-hub" data-testid="tab-notifications-hub">Notifications</TabsTrigger>
              <TabsTrigger value="profile-hub" data-testid="tab-profile-hub">Profile</TabsTrigger>
            </TabsList>

            {/* Quick-access links that navigate away from the dashboard */}
            <div className="flex flex-wrap gap-2 mt-2 mb-1">
              <Link href="/wallet">
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/10" data-testid="link-wallet">
                  <Wallet className="h-3.5 w-3.5" />
                  {t("dashboard.wallet", "Wallet")}
                </Button>
              </Link>
              <Link href="/waitlist">
                <Button variant="outline" size="sm" className="h-8 gap-1.5" data-testid="link-waitlist">
                  <Clock className="h-3.5 w-3.5" />
                  {t("dashboard.waitlist", "Waitlist")}
                </Button>
              </Link>
              <Link href="/packages">
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-violet-600 dark:text-violet-400 border-violet-500/40 hover:bg-violet-500/10" data-testid="link-packages">
                  <Gift className="h-3.5 w-3.5" />
                  {t("common.packages", "Packages")}
                </Button>
              </Link>
              <Link href="/membership">
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-amber-600 dark:text-amber-400 border-amber-500/40 hover:bg-amber-500/10" data-testid="link-membership">
                  <Crown className="h-3.5 w-3.5" />
                  My Membership
                </Button>
              </Link>
            </div>

            <div className="mt-6 mb-4 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Input
                  placeholder={t("dashboard.search_appointments_patient", "Search by provider, service, or ID...")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 pr-8"
                  data-testid="input-search-appointments"
                />
                {searchQuery && (
                  <button
                    className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setSearchQuery("")}
                    aria-label={t("common.clear", "Clear search")}
                    data-testid="button-clear-search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Select value={visitTypeFilter} onValueChange={setVisitTypeFilter}>
                <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-visit-filter">
                  <SelectValue placeholder={t("patient_dashboard.visit_type", "Visit type")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("patient_dashboard.all_types", "All types")}</SelectItem>
                  <SelectItem value="online">{t("patient_dashboard.type_online", "Online")}</SelectItem>
                  <SelectItem value="home">{t("patient_dashboard.type_home", "Home visit")}</SelectItem>
                  <SelectItem value="clinic">{t("patient_dashboard.type_clinic", "Clinic")}</SelectItem>
                </SelectContent>
              </Select>
              {(searchQuery || visitTypeFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="sm:self-center text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => { setSearchQuery(""); setVisitTypeFilter("all"); }}
                  data-testid="button-reset-search-filters"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  {t("common.reset", "Reset")}
                </Button>
              )}
            </div>

            <TabsContent value="upcoming" className="mt-2">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-32 w-full rounded-lg" />
                  ))}
                </div>
              ) : filterList(upcomingAppointments).length > 0 ? (
                <div className="space-y-4">
                  {filterList(upcomingAppointments).map((appointment) => (
                    <AppointmentCard key={appointment.id} appointment={appointment} />
                  ))}
                </div>
              ) : (
                <SmartEmptyState
                  context="upcoming"
                  hasFilter={!!(searchQuery.trim() || visitTypeFilter !== "all")}
                />
              )}
            </TabsContent>

            <TabsContent value="completed" className="mt-2">
              {filterList(completedAppointments).length > 0 ? (
                <div className="space-y-4">
                  {filterList(completedAppointments).map((appointment) => (
                    <AppointmentCard key={appointment.id} appointment={appointment} />
                  ))}
                </div>
              ) : (
                <SmartEmptyState
                  context="completed"
                  hasFilter={!!(searchQuery.trim() || visitTypeFilter !== "all")}
                />
              )}
            </TabsContent>

            <TabsContent value="cancelled" className="mt-2">
              {filterList(cancelledAppointments).length > 0 ? (
                <div className="space-y-4">
                  {filterList(cancelledAppointments).map((appointment) => (
                    <AppointmentCard key={appointment.id} appointment={appointment} />
                  ))}
                </div>
              ) : (
                <SmartEmptyState
                  context="cancelled"
                  hasFilter={!!(searchQuery.trim() || visitTypeFilter !== "all")}
                />
              )}
            </TabsContent>

            <TabsContent value="past" className="mt-2">
              {filterList(pastAppointments).length > 0 ? (
                <div className="space-y-4">
                  {filterList(pastAppointments).map((appointment) => (
                    <AppointmentCard key={appointment.id} appointment={appointment} />
                  ))}
                </div>
              ) : (
                <SmartEmptyState
                  context="past"
                  hasFilter={!!(searchQuery.trim() || visitTypeFilter !== "all")}
                />
              )}
            </TabsContent>

            <TabsContent value="saved" className="mt-2">
              {isLoadingSaved ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-64 w-full rounded-lg" />
                  ))}
                </div>
              ) : savedProviders && savedProviders.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="grid-saved-providers">
                  {savedProviders.map((p) => (
                    <ProviderCard key={p.id} provider={p} />
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-12 text-center" data-testid="empty-saved">
                    <Heart className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="font-semibold text-lg mb-2">
                      {t("patient_dashboard.empty_saved_title", "No saved providers yet")}
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      {t("patient_dashboard.empty_saved_desc", "Tap the heart icon on any provider card to save them for later.")}
                    </p>
                    <Button asChild>
                      <Link href="/providers">{t("patient_dashboard.find_providers_btn", "Find Providers")}</Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="medical" className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      {t("patient_dashboard.prescriptions", "Prescriptions")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PrescriptionList patientId={user?.id} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" />
                      {t("patient_dashboard.medical_history", "Medical History")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <HistoryList patientId={user?.id} />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="health-metrics" className="mt-6">
              <HealthMetricsTab />
            </TabsContent>

            <TabsContent value="family" className="mt-6">
              <FamilyMembersTab />
            </TabsContent>

            <TabsContent value="medications" className="mt-6">
              <MedicationsTab />
            </TabsContent>

            <TabsContent value="invoices" className="mt-6 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t("patient_dashboard.invoices_title", "Invoices")}</CardTitle>
                  <CardDescription>{t("patient_dashboard.invoices_desc", "Download invoices issued for your completed appointments")}</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingInvoices ? (
                    <Skeleton className="h-32 w-full" />
                  ) : invoices && invoices.length > 0 ? (
                    <div className="divide-y">
                      {invoices.map((inv: any) => (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between py-4"
                          data-testid={`row-invoice-${inv.id}`}
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                              <FileText className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate" data-testid={`text-invoice-number-${inv.id}`}>
                                {inv.invoiceNumber}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {inv.issueDate ? formatDateTz(inv.issueDate) : "—"}
                                {inv.dueDate ? ` • ${t("patient_dashboard.due_label", "Due")} ${formatDateTz(inv.dueDate)}` : ""}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <p className="font-semibold">{formatInCurrency(Number(inv.totalAmount || 0), inv.countryCode === "IR" ? "IRR" : inv.countryCode === "HU" ? "HUF" : "USD")}</p>
                              <Badge
                                variant={inv.status === "paid" ? "default" : inv.status === "due" ? "outline" : "secondary"}
                                data-testid={`status-invoice-${inv.id}`}
                              >
                                {inv.status}
                              </Badge>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                              data-testid={`button-download-invoice-${inv.id}`}
                            >
                              <a
                                href={`/api/invoices/${inv.id}/download`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {t("patient_dashboard.download_pdf", "Download PDF")}
                              </a>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-12 text-center">
                      <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="font-semibold text-lg mb-2">{t("patient_dashboard.empty_invoices_title", "No invoices yet")}</h3>
                      <p className="text-muted-foreground">
                        {t("patient_dashboard.empty_invoices_desc", "Invoices appear here once your appointments are marked completed by the provider.")}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("patient_dashboard.payment_history", "Payment History")}</CardTitle>
                  <CardDescription>{t("patient_dashboard.payment_history_desc", "All payment transactions linked to your appointments")}</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-32 w-full" />
                  ) : appointments?.filter(a => a.payment).length ? (
                    <div className="space-y-4">
                      {appointments
                        .filter(a => a.payment)
                        .map((a) => {
                          const payment = a.payment!;
                          return (
          <div className="flex items-center justify-between py-4 border-b last:border-0" data-testid={`row-payment-${payment.id}`}>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                {(payment as any).paymentMethod === 'crypto' ? <Bitcoin className="h-5 w-5" /> : 
                 (payment as any).paymentMethod === 'card' ? <CreditCard className="h-5 w-5" /> :
                 (payment as any).paymentMethod === 'bank_transfer' ? <Building2 className="h-5 w-5" /> :
                 <Banknote className="h-5 w-5" />}
              </div>
              <div>
                <p className="font-medium">{t("dashboard.payment_id")} #{String(payment.id).slice(0, 8)}</p>
                <p className="text-sm text-muted-foreground">
                  {payment.createdAt ? formatDateTz(payment.createdAt) : 'N/A'} • {
                    (payment as any).paymentMethod === 'crypto' ? t("dashboard.cryptocurrency") : 
                    (payment as any).paymentMethod === 'card' ? t("dashboard.credit_card") :
                    (payment as any).paymentMethod === 'bank_transfer' ? t("dashboard.bank_transfer") :
                    t("dashboard.cash")
                  }
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-semibold">{fmtMoney(payment.amount)}</p>
              <Badge variant={payment.status === 'completed' ? 'default' : 'outline'}>
                {payment.status}
              </Badge>
            </div>
          </div>
                          );
                        })}
                    </div>
                  ) : (
                    <div className="py-12 text-center">
                      <Banknote className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground">{t("patient_dashboard.empty_payments", "No payment activity yet.")}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── BOOK CARE ─────────────────────────────────────────────── */}
            <TabsContent value="book-care" className="mt-6 space-y-6" data-testid="tab-content-book-care">
              {/* Book by visit type */}
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" /> Book an Appointment</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label: "Clinic Visit", icon: <Building2 className="h-6 w-6" />, color: "text-sky-600 dark:text-sky-400", bg: "border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/20 hover:border-sky-300", visitType: "clinic", testid: "book-clinic" },
                    { label: "Video Visit", icon: <Video className="h-6 w-6" />, color: "text-violet-600 dark:text-violet-400", bg: "border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20 hover:border-violet-300", visitType: "online", testid: "book-video" },
                    { label: "Home Visit", icon: <Home className="h-6 w-6" />, color: "text-emerald-600 dark:text-emerald-400", bg: "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 hover:border-emerald-300", visitType: "home", testid: "book-home" },
                  ].map((opt) => (
                    <Link key={opt.testid} href={`/providers?visitType=${opt.visitType}`}>
                      <div className={`rounded-2xl border p-5 flex flex-col items-center gap-3 cursor-pointer transition-all ${opt.bg}`} data-testid={opt.testid}>
                        <span className={opt.color}>{opt.icon}</span>
                        <span className="font-semibold text-sm">{opt.label}</span>
                        <span className="text-xs text-muted-foreground text-center">Find available providers</span>
                        <Button size="sm" variant="outline" className="w-full" data-testid={`btn-${opt.testid}`}>
                          Browse →
                        </Button>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Loading / error guard for appointment-dependent content */}
              {isLoading && <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>}
              {isErrorAppointments && (
                <Card>
                  <CardContent className="py-8 text-center flex flex-col items-center gap-2">
                    <AlertCircle className="h-8 w-8 text-destructive opacity-60" />
                    <p className="text-sm text-destructive font-medium">Failed to load appointment history</p>
                    <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: QK.patientAppointments() })}>Retry</Button>
                  </CardContent>
                </Card>
              )}

              {/* Rebook last provider */}
              {!isLoading && !isErrorAppointments && lastCompletedAppt && (
                <Card data-testid="card-rebook-last">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2"><RefreshCw className="h-4 w-4 text-sky-500" /> Rebook Last Provider</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <AvatarMD
                          src={lastCompletedAppt.provider?.user?.avatarUrl}
                          name={`${lastCompletedAppt.provider?.user?.firstName ?? ""} ${lastCompletedAppt.provider?.user?.lastName ?? ""}`.trim()}
                        />
                        <div>
                          <p className="font-medium">{lastCompletedAppt.provider?.user?.firstName} {lastCompletedAppt.provider?.user?.lastName}</p>
                          <p className="text-sm text-muted-foreground">{lastCompletedAppt.provider?.specialization}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Last seen: {formatDate(lastCompletedAppt.date)}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button variant="outline" size="sm" asChild data-testid="btn-view-last-provider">
                          <Link href={`/provider/${lastCompletedAppt.providerId}`}>View profile</Link>
                        </Button>
                        <Button size="sm" asChild data-testid="btn-rebook-last">
                          <Link href={`/book?providerId=${lastCompletedAppt.providerId}${lastCompletedAppt.serviceId ? `&serviceId=${lastCompletedAppt.serviceId}` : ""}&visitType=${lastCompletedAppt.visitType}`}>
                            Book again
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Recently visited providers */}
              {!isLoading && !isErrorAppointments && completedAppointments.length > 0 && (() => {
                const seen = new Set<string>();
                const recent = completedAppointments.filter((a) => {
                  if (seen.has(a.providerId)) return false;
                  seen.add(a.providerId);
                  return true;
                }).slice(0, 3);
                return (
                  <div data-testid="section-recently-visited">
                    <h2 className="text-base font-semibold mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" /> Recently Visited Providers</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {recent.map((appt) => (
                        <Card key={appt.providerId} className="hover-elevate" data-testid={`card-recent-provider-${appt.providerId}`}>
                          <CardContent className="p-4 flex items-center gap-3">
                            <AvatarMD src={appt.provider?.user?.avatarUrl} name={`${appt.provider?.user?.firstName ?? ""} ${appt.provider?.user?.lastName ?? ""}`.trim()} />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate text-sm">{appt.provider?.user?.firstName} {appt.provider?.user?.lastName}</p>
                              <p className="text-xs text-muted-foreground truncate">{appt.provider?.specialization}</p>
                            </div>
                            <Button size="sm" variant="ghost" asChild data-testid={`btn-book-recent-${appt.providerId}`}>
                              <Link href={`/book?providerId=${appt.providerId}&visitType=${appt.visitType}`}>Book</Link>
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Family member booking */}
              {!isLoading && !isErrorAppointments && familyMembers && familyMembers.length > 0 && (
                <div data-testid="section-family-booking">
                  <h2 className="text-base font-semibold mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /> Book for a Family Member</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {familyMembers.map((member: any) => (
                      <Card key={member.id} data-testid={`card-family-book-${member.id}`}>
                        <CardContent className="p-4 flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-sm">{member.firstName} {member.lastName}</p>
                            <p className="text-xs text-muted-foreground">{member.relationship}{member.dateOfBirth ? ` • ${new Date().getFullYear() - new Date(member.dateOfBirth).getFullYear()} yrs` : ""}</p>
                          </div>
                          <Button size="sm" asChild data-testid={`btn-book-for-${member.id}`}>
                            <Link href={`/providers?forMemberId=${member.id}`}>Book for {member.firstName}</Link>
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {!isLoading && !isErrorAppointments && !lastCompletedAppt && completedAppointments.length === 0 && (
                <Card>
                  <CardContent className="p-10 text-center">
                    <Calendar className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
                    <p className="font-semibold mb-1">No booking history yet</p>
                    <p className="text-sm text-muted-foreground mb-4">Book your first appointment to unlock rebook shortcuts.</p>
                    <Button asChild><Link href="/providers">Find Providers</Link></Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ── FINANCE HUB ────────────────────────────────────────────── */}
            <TabsContent value="finance-hub" className="mt-6 space-y-6" data-testid="tab-content-finance-hub">
              {/* Wallet balance widget */}
              <Card data-testid="card-wallet-balance">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-5 w-5 text-emerald-500" /> Wallet</CardTitle>
                  <Button variant="outline" size="sm" asChild data-testid="btn-go-wallet"><Link href="/wallet">Manage →</Link></Button>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-3">
                    <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400" data-testid="text-wallet-balance">
                      {walletData ? fmtMoney(walletData.balance) : "—"}
                    </p>
                    <p className="text-sm text-muted-foreground mb-1">available balance</p>
                  </div>
                  <Button className="mt-4" size="sm" asChild data-testid="btn-topup-finance">
                    <Link href="/wallet">Top up wallet</Link>
                  </Button>
                </CardContent>
              </Card>

              {/* Active packages / memberships */}
              <Card data-testid="card-active-packages-hub">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><Crown className="h-5 w-5 text-violet-500" /> Active Packages & Memberships</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild data-testid="btn-go-packages"><Link href="/packages">Browse</Link></Button>
                    <Button variant="outline" size="sm" asChild data-testid="btn-go-membership"><Link href="/membership">Membership</Link></Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {!activePkgs ? (
                    <Skeleton className="h-20 w-full" />
                  ) : activePkgs.length === 0 ? (
                    <div className="py-6 text-center">
                      <Crown className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-30" />
                      <p className="text-sm text-muted-foreground mb-3">No active packages or memberships</p>
                      <Button size="sm" variant="outline" asChild><Link href="/packages">Browse packages</Link></Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activePkgs.map((pkg) => {
                        const hasSession = pkg.sessionsTotal !== null;
                        const sessionsLeft = hasSession ? Math.max(0, pkg.sessionsTotal! - pkg.sessionsUsed) : null;
                        const urgent = (pkg.daysRemaining !== null && pkg.daysRemaining <= 30) || (hasSession && sessionsLeft !== null && sessionsLeft <= 2);
                        return (
                          <div key={pkg.id} className={`flex items-center justify-between rounded-xl border p-3 ${urgent ? "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20" : "border-border"}`} data-testid={`pkg-hub-${pkg.id}`}>
                            <div>
                              <p className="font-medium text-sm">{pkg.packageName}</p>
                              <div className="flex gap-3 mt-0.5">
                                {pkg.daysRemaining !== null && <span className="text-xs text-muted-foreground">{pkg.daysRemaining}d left</span>}
                                {hasSession && sessionsLeft !== null && <span className="text-xs text-muted-foreground">{sessionsLeft} sessions remaining</span>}
                              </div>
                            </div>
                            {urgent && <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-xs border-amber-200 dark:border-amber-700">Expiring soon</Badge>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Gift cards */}
              <Card data-testid="card-gift-cards">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><Gift className="h-5 w-5 text-rose-500" /> Gift Cards</CardTitle>
                  <Button variant="outline" size="sm" asChild data-testid="btn-go-giftcards"><Link href="/gift-cards">Manage</Link></Button>
                </CardHeader>
                <CardContent>
                  {isLoadingGiftCards ? (
                    <Skeleton className="h-16 w-full" />
                  ) : isErrorGiftCards ? (
                    <div className="py-4 text-center text-sm text-destructive flex flex-col items-center gap-2">
                      <AlertCircle className="h-5 w-5" />
                      <span>Failed to load gift cards</span>
                      <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: QK.giftCards() })}>Retry</Button>
                    </div>
                  ) : !giftCards || giftCards.length === 0 ? (
                    <div className="py-4 text-center">
                      <p className="text-sm text-muted-foreground">No gift cards in your account</p>
                      <Button size="sm" variant="outline" className="mt-2" asChild><Link href="/gift-cards">Redeem a gift card</Link></Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {giftCards.slice(0, 3).map((gc: any) => (
                        <div key={gc.id} className="flex items-center justify-between rounded-lg border p-3" data-testid={`gc-${gc.id}`}>
                          <div>
                            <p className="text-sm font-medium font-mono">{gc.code}</p>
                            <p className="text-xs text-muted-foreground">Balance: {fmtMoney(gc.balance ?? gc.remainingBalance ?? 0)}</p>
                          </div>
                          <Badge variant={gc.status === "active" ? "default" : "secondary"}>{gc.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick links to invoices */}
              <div className="flex gap-3 flex-wrap">
                <Button variant="outline" asChild data-testid="btn-view-invoices">
                  <Link href="#" onClick={() => setActiveTab("invoices")}><FileText className="h-4 w-4 mr-2" />View Invoices</Link>
                </Button>
                <Button variant="outline" asChild data-testid="btn-view-payments">
                  <Link href="#" onClick={() => setActiveTab("invoices")}><Banknote className="h-4 w-4 mr-2" />Payment History</Link>
                </Button>
              </div>
            </TabsContent>

            {/* ── MY INSIGHTS ────────────────────────────────────────────── */}
            <TabsContent value="insights" className="mt-6" data-testid="tab-content-insights">
              <PatientReportingCenter />
            </TabsContent>

            {/* ── ENGAGE ─────────────────────────────────────────────────── */}
            <TabsContent value="engage" className="mt-6 space-y-6" data-testid="tab-content-engage">
              {/* Pending reviews */}
              <Card data-testid="card-pending-reviews">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Star className="h-5 w-5 text-yellow-500" />
                    Pending Reviews
                    {pendingReviews.length > 0 && (
                      <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-200 dark:border-yellow-700 ml-1">{pendingReviews.length}</Badge>
                    )}
                  </CardTitle>
                  <Button variant="outline" size="sm" asChild data-testid="btn-my-reviews"><Link href="/my-reviews">All reviews →</Link></Button>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="space-y-2">{[1,2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
                  ) : isErrorAppointments ? (
                    <div className="py-4 text-center text-sm text-destructive flex flex-col items-center gap-2">
                      <AlertCircle className="h-5 w-5" />
                      <span>Failed to load appointments</span>
                      <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: QK.patientAppointments() })}>Retry</Button>
                    </div>
                  ) : pendingReviews.length === 0 ? (
                    <div className="py-6 text-center">
                      <CheckCircle className="h-8 w-8 mx-auto mb-2 text-emerald-500 opacity-60" />
                      <p className="text-sm text-muted-foreground">You're all caught up — no pending reviews!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {pendingReviews.slice(0, 4).map((appt) => (
                        <div key={appt.id} className="flex items-center justify-between gap-3 rounded-lg border p-3" data-testid={`pending-review-${appt.id}`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <AvatarMD src={appt.provider?.user?.avatarUrl} name={`${appt.provider?.user?.firstName ?? ""} ${appt.provider?.user?.lastName ?? ""}`.trim()} />
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{appt.provider?.user?.firstName} {appt.provider?.user?.lastName}</p>
                              <p className="text-xs text-muted-foreground">{formatDate(appt.date)}</p>
                            </div>
                          </div>
                          <Button size="sm" asChild data-testid={`btn-review-${appt.id}`}>
                            <Link href={`/review/${appt.id}`}><Star className="h-3.5 w-3.5 mr-1" />Review</Link>
                          </Button>
                        </div>
                      ))}
                      {pendingReviews.length > 4 && (
                        <p className="text-xs text-muted-foreground text-center">+{pendingReviews.length - 4} more</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Referral widget */}
              <Card data-testid="card-referral-widget">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><Share2 className="h-5 w-5 text-amber-500" /> Refer & Earn</CardTitle>
                  <Button variant="outline" size="sm" asChild data-testid="btn-referrals-page"><Link href="/referrals">Details →</Link></Button>
                </CardHeader>
                <CardContent>
                  {isLoadingReferrals ? (
                    <Skeleton className="h-20 w-full" />
                  ) : isErrorReferrals ? (
                    <div className="py-4 text-center text-sm text-destructive flex flex-col items-center gap-2">
                      <AlertCircle className="h-5 w-5" />
                      <span>Failed to load referral data</span>
                      <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: QK.referrals() })}>Retry</Button>
                    </div>
                  ) : referralData ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 p-3">
                          <p className="text-xl font-bold text-amber-700 dark:text-amber-400" data-testid="text-referral-count">{referralData.referralCount ?? referralData.count ?? 0}</p>
                          <p className="text-xs text-muted-foreground">Referrals</p>
                        </div>
                        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 p-3">
                          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400" data-testid="text-referral-earned">{fmtMoney(referralData.totalEarned ?? 0)}</p>
                          <p className="text-xs text-muted-foreground">Earned</p>
                        </div>
                        <div className="rounded-xl bg-violet-50 dark:bg-violet-950/20 p-3">
                          <p className="text-xl font-bold text-violet-700 dark:text-violet-400" data-testid="text-referral-rank">{referralData.rank ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">Leaderboard</p>
                        </div>
                      </div>
                      {referralData.code && (
                        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3">
                          <span className="flex-1 font-mono text-sm font-semibold" data-testid="text-referral-code">{referralData.code}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1.5"
                            onClick={() => copyReferralCode(referralData.code)}
                            data-testid="btn-copy-referral"
                          >
                            {referralCopied ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                            {referralCopied ? "Copied!" : "Copy"}
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-6 text-center">
                      <Gift className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-30" />
                      <p className="text-sm text-muted-foreground mb-3">Share your code and earn wallet credit</p>
                      <Button size="sm" asChild><Link href="/referrals">Get your code</Link></Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Waitlist widget */}
              <Card data-testid="card-waitlist-widget">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-5 w-5 text-sky-500" /> Active Waitlists</CardTitle>
                  <Button variant="outline" size="sm" asChild data-testid="btn-waitlist-page"><Link href="/waitlist">Manage →</Link></Button>
                </CardHeader>
                <CardContent>
                  {isLoadingWaitlist ? (
                    <Skeleton className="h-16 w-full" />
                  ) : isErrorWaitlist ? (
                    <div className="py-4 text-center text-sm text-destructive flex flex-col items-center gap-2">
                      <AlertCircle className="h-5 w-5" />
                      <span>Failed to load waitlist</span>
                      <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: QK.waitlist() })}>Retry</Button>
                    </div>
                  ) : !waitlistData || waitlistData.length === 0 ? (
                    <div className="py-4 text-center">
                      <ListChecks className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-30" />
                      <p className="text-sm text-muted-foreground">You are not on any waitlists</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {waitlistData.slice(0, 3).map((entry: any) => (
                        <div key={entry.id} className="flex items-center justify-between rounded-lg border p-3" data-testid={`waitlist-entry-${entry.id}`}>
                          <div>
                            <p className="font-medium text-sm">{entry.providerName ?? entry.provider?.user?.firstName ?? "Provider"}</p>
                            {entry.preferredDate && <p className="text-xs text-muted-foreground">{formatDateTz(entry.preferredDate)}</p>}
                          </div>
                          {entry.position && (
                            <Badge variant="outline" className="text-xs" data-testid={`waitlist-position-${entry.id}`}>Position #{entry.position}</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── NOTIFICATIONS HUB ──────────────────────────────────────── */}
            <TabsContent value="notifications-hub" className="mt-6 space-y-4" data-testid="tab-content-notifications">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Bell className="h-5 w-5 text-primary" /> Notifications
                  {unreadNotifCount > 0 && <Badge className="ml-1">{unreadNotifCount} unread</Badge>}
                </h2>
                <Button variant="outline" size="sm" asChild data-testid="btn-all-notifications"><Link href="/notifications">View all →</Link></Button>
              </div>
              {isLoadingNotifications ? (
                <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
              ) : isErrorNotifications ? (
                <Card>
                  <CardContent className="py-10 text-center flex flex-col items-center gap-2">
                    <AlertCircle className="h-8 w-8 text-destructive opacity-60" />
                    <p className="text-sm text-destructive font-medium">Failed to load notifications</p>
                    <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: QK.notifications() })}>Retry</Button>
                  </CardContent>
                </Card>
              ) : !notificationsData || notificationsData.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center">
                    <Bell className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
                    <p className="text-sm text-muted-foreground">No notifications yet</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {notificationsData.slice(0, 8).map((notif: any) => (
                    <div
                      key={notif.id}
                      className={`flex items-start gap-3 rounded-xl border p-4 transition-colors ${!notif.isRead ? "border-primary/30 bg-primary/5" : "border-border"}`}
                      data-testid={`notif-${notif.id}`}
                    >
                      <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${!notif.isRead ? "bg-primary" : "bg-muted"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{notif.title ?? notif.type}</p>
                        {notif.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>}
                        {notif.createdAt && <p className="text-xs text-muted-foreground/60 mt-1">{formatDateTimeTz(notif.createdAt)}</p>}
                      </div>
                    </div>
                  ))}
                  {notificationsData.length > 8 && (
                    <div className="text-center pt-2">
                      <Button variant="outline" size="sm" asChild><Link href="/notifications">View all {notificationsData.length} notifications</Link></Button>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* ── PROFILE HUB ────────────────────────────────────────────── */}
            <TabsContent value="profile-hub" className="mt-6 space-y-6" data-testid="tab-content-profile">
              {/* Profile completion */}
              <Card data-testid="card-profile-completion">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><UserCircle className="h-5 w-5 text-primary" /> Profile Completion</CardTitle>
                  <Button variant="outline" size="sm" asChild data-testid="btn-edit-profile"><Link href="/profile">Edit Profile</Link></Button>
                </CardHeader>
                <CardContent>
                  <div className="mb-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Profile strength</span>
                      <span className="font-semibold" data-testid="text-profile-pct">{profileCompletion}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${profileCompletion >= 80 ? "bg-emerald-500" : profileCompletion >= 50 ? "bg-amber-500" : "bg-rose-500"}`}
                        style={{ width: `${profileCompletion}%` }}
                        data-testid="bar-profile-completion"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm mt-4">
                    {[
                      { label: "Name", done: !!(user?.firstName && user?.lastName) },
                      { label: "Email", done: !!user?.email },
                      { label: "Mobile", done: !!(user as any)?.mobileNumber },
                      { label: "Address", done: !!(user as any)?.address },
                      { label: "Emergency contact", done: !!(user as any)?.emergencyContactName },
                      { label: "Language preference", done: !!(user as any)?.languagePreference },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-2" data-testid={`profile-check-${item.label.toLowerCase().replace(/ /g, "-")}`}>
                        {item.done ? <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" /> : <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />}
                        <span className={item.done ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Saved addresses */}
              <Card data-testid="card-saved-addresses">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-rose-500" /> Saved Addresses
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <SavedAddressesPicker
                    showManageOnly
                    onSelect={() => {}}
                  />
                </CardContent>
              </Card>

              {/* Emergency contact & settings shortcuts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card data-testid="card-emergency-contact">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
                        <Phone className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Emergency Contact</p>
                        {(user as any)?.emergencyContactName ? (
                          <p className="text-xs text-muted-foreground">{(user as any).emergencyContactName}</p>
                        ) : (
                          <p className="text-xs text-amber-600 dark:text-amber-400">Not set</p>
                        )}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" asChild data-testid="btn-emergency-contact"><Link href="/profile">Edit</Link></Button>
                  </CardContent>
                </Card>
                <Card data-testid="card-settings-shortcut">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-900/50 flex items-center justify-center shrink-0">
                        <Settings className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Account Settings</p>
                        <p className="text-xs text-muted-foreground">Language, notifications, privacy</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" asChild data-testid="btn-account-settings"><Link href="/settings">Open</Link></Button>
                  </CardContent>
                </Card>
              </div>

              {/* Health records shortcut */}
              <Card data-testid="card-health-records-shortcut">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Documents & Health Records</p>
                      <p className="text-xs text-muted-foreground">Prescriptions, history, medical files</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" asChild data-testid="btn-health-records-shortcut"><Link href="/health-records">View</Link></Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="gallery" className="mt-6">
              <PatientGalleryPanel />
            </TabsContent>
          </Tabs>
        </div>
        <Footer />
        </main>
      </div>
      <AppointmentActionDialog
        appointmentId={actionTarget?.id ?? null}
        action={actionTarget?.action ?? "cancel"}
        open={!!actionTarget}
        onOpenChange={(open) => !open && setActionTarget(null)}
        invalidateKeys={[["/api/appointments/patient"]]}
      />
      <AppointmentStatusTicker
        updates={statusUpdates}
        onDismiss={dismissStatusUpdate}
      />
    </div>
  );
}

// ── Patient Gallery Panel ─────────────────────────────────────────────────────
function PatientGalleryPanel() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const { data: images = [], isLoading } = useQuery<any[]>({
    queryKey: QK.patientGallery(),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/patient/gallery/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.patientGallery() });
      toast({ title: "Image removed" });
    },
    onError: () => toast({ title: "Failed to delete image", variant: "destructive" }),
  });

  const captionMutation = useMutation({
    mutationFn: async ({ id, caption }: { id: string; caption: string }) => {
      const res = await fetch(`/api/patient/gallery/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ caption }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.patientGallery() });
      setEditId(null);
      toast({ title: "Caption updated" });
    },
  });

  async function handleUpload(file: File) {
    const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!ALLOWED.includes(file.type)) {
      toast({ title: "Use JPG, PNG, or WebP", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File must be under 10 MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/patient/gallery/upload", { method: "POST", credentials: "include", body: form });
      if (!res.ok) throw new Error((await res.json()).message || "Upload failed");
      queryClient.invalidateQueries({ queryKey: QK.patientGallery() });
      toast({ title: "Image uploaded" });
    } catch (err: any) {
      toast({ title: err?.message ?? "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            My Medical Gallery
          </CardTitle>
          <CardDescription>
            Upload and manage your medical images, progress photos, and reports. Private — only you and authorized admins can view these.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors mb-6"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
            />
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Skeleton className="h-10 w-10 rounded-full" />
                <p className="text-sm text-muted-foreground">Uploading…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Plus className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">Click or drag &amp; drop to upload</p>
                <p className="text-xs text-muted-foreground">JPG, PNG, WebP • max 10 MB • up to 20 images</p>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
            </div>
          ) : images.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No images yet — upload your first one above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {images.map((img: any) => (
                <div key={img.id} className="group relative aspect-square rounded-xl overflow-hidden border bg-muted">
                  <img
                    src={img.image_url}
                    alt={img.caption || "Gallery image"}
                    loading="lazy"
                    className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-200"
                    onClick={() => setPreview(img.image_url)}
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {editId === img.id ? (
                      <div className="flex gap-1">
                        <input
                          className="flex-1 text-xs rounded px-1 py-0.5 bg-white/90 text-black"
                          value={editCaption}
                          onChange={(e) => setEditCaption(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") captionMutation.mutate({ id: img.id, caption: editCaption });
                            if (e.key === "Escape") setEditId(null);
                          }}
                          autoFocus
                        />
                        <Button size="icon" variant="ghost" className="h-5 w-5 text-white" onClick={() => captionMutation.mutate({ id: img.id, caption: editCaption })}>✓</Button>
                      </div>
                    ) : (
                      <div className="flex items-end justify-between gap-1">
                        <p
                          className="text-[10px] text-white/90 truncate flex-1 cursor-pointer"
                          onClick={() => { setEditId(img.id); setEditCaption(img.caption || ""); }}
                        >
                          {img.caption || <span className="italic opacity-60">Add caption…</span>}
                        </p>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 text-white/80 hover:text-red-400 shrink-0"
                          disabled={deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate(img.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="absolute top-1.5 right-1.5 text-[9px] text-white/70 bg-black/40 rounded px-1">
                    {formatDateTz(img.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lightbox */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <img src={preview} alt="Preview" className="max-w-full max-h-full rounded-lg shadow-2xl" />
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/10"
            onClick={() => setPreview(null)}
          >
            <X className="h-6 w-6" />
          </Button>
        </div>
      )}
    </div>
  );
}
