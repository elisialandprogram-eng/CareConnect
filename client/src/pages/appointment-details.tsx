import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { TelehealthRoom } from "@/components/video/TelehealthRoom";
import { AppointmentTimingCard } from "@/components/appointment/AppointmentTimingCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Video,
  Building2,
  User as UserIcon,
  AlertCircle,
  Download,
  RefreshCw,
  X,
  ExternalLink,
  Copy,
  Check,
  MessageSquare,
  History,
  CheckCircle2,
  XCircle,
  CalendarClock,
  PlayCircle,
  UserX,
  ThumbsUp,
  ThumbsDown,
  PlusCircle,
  Star,
  BookOpen,
  ShieldAlert,
  Repeat,
  StickyNote,
  Trash2,
  Pencil,
  Stethoscope,
  CalendarDays,
  CalendarPlus,
  KeyRound,
  Phone,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useCurrency, formatInCurrency } from "@/lib/currency";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { QK } from "@/lib/query-keys";
import {
  AppointmentActionDialog,
  type AppointmentAction,
} from "@/components/appointment/AppointmentActionDialog";
import { RescheduleProposalBanner } from "@/components/appointment/RescheduleProposalBanner";
import { PreparationPanel } from "@/components/appointment/PreparationPanel";
import { PostAppointmentSummary } from "@/components/appointment/PostAppointmentSummary";
import { HomeVisitCoverage } from "@/components/appointment/HomeVisitCoverage";
import { AppointmentTimeContext } from "@/components/appointment/AppointmentTimeContext";

/* ── ICS / Calendar helpers ────────────────────────────────────────── */
function buildGoogleCalendarUrl(appt: any): string {
  const title = encodeURIComponent(`Appointment${appt?.provider ? ` with ${appt.provider.firstName} ${appt.provider.lastName}` : ""}`);
  const start = new Date(appt?.scheduledAt ?? "");
  const durationMs = (appt?.durationMinutes ?? 60) * 60000;
  const end = new Date(start.getTime() + durationMs);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const location = encodeURIComponent(
    appt?.visitType === "online" ? "Online/Video" :
    appt?.visitType === "home"   ? "Home Visit" :
    appt?.clinicAddress ?? appt?.provider?.clinicAddress ?? "Clinic"
  );
  const details = encodeURIComponent(`Golden Life appointment · ${appt?.visitType ?? ""} visit`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&details=${details}&location=${location}`;
}

function buildIcsContent(appt: any): string {
  const title = `Appointment${appt?.provider ? ` with ${appt.provider.firstName} ${appt.provider.lastName}` : ""}`;
  const start = new Date(appt?.scheduledAt ?? "");
  const durationMs = (appt?.durationMinutes ?? 60) * 60000;
  const end = new Date(start.getTime() + durationMs);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const location =
    appt?.visitType === "online" ? "Online/Video" :
    appt?.visitType === "home"   ? "Home Visit" :
    appt?.clinicAddress ?? appt?.provider?.clinicAddress ?? "Clinic";
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GoldenLife//EN",
    "BEGIN:VEVENT",
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${title}`,
    `LOCATION:${location}`,
    `DESCRIPTION:Golden Life ${appt?.visitType ?? ""} appointment`,
    `UID:${appt?.id ?? Date.now()}@goldenlife.health`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

function downloadIcs(appt: any): void {
  const blob = new Blob([buildIcsContent(appt)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `goldenlife-appointment-${appt?.id ?? "event"}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

type Appt = any;

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  approved: "default",
  confirmed: "default",
  in_progress: "default",
  completed: "outline",
  cancelled: "destructive",
  cancelled_by_patient: "destructive",
  cancelled_by_provider: "destructive",
  rejected: "destructive",
  rescheduled: "secondary",
  reschedule_requested: "secondary",
  reschedule_proposed: "secondary",
  no_show: "destructive",
  expired: "destructive",
};

function formatStatus(s: string) {
  return s.replace(/_/g, " ");
}

export default function AppointmentDetails() {
  const params = useParams<{ id: string }>();
  const appointmentId = params?.id ?? null;
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { toast } = useToast();
  const { format: fmtMoney } = useCurrency();
  const [actionTarget, setActionTarget] = useState<AppointmentAction | null>(null);
  const [copied, setCopied] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeDesc, setDisputeDesc] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteContent, setEditNoteContent] = useState("");

  // Redirect unauthenticated users — guarded by useEffect to avoid setState
  // during render (otherwise wouter's setLocation triggers a parent update).
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [authLoading, isAuthenticated, navigate]);

  const {
    data: appt,
    isLoading,
    isError,
    error,
  } = useQuery<Appt>({
    queryKey: QK.appointment(appointmentId),
    enabled: !!appointmentId && isAuthenticated,
    retry: (failureCount, err: any) => {
      // Don't retry on 404/403
      const msg = String(err?.message ?? "");
      if (/^(404|403)/.test(msg)) return false;
      return failureCount < 2;
    },
  });

  // Audit timeline — every state-changing action on this appointment
  const { data: events, isLoading: eventsLoading } = useQuery<AppointmentEventRow[]>({
    queryKey: QK.appointmentEvents(appointmentId),
    enabled: !!appointmentId && isAuthenticated && !!appt,
  });

  /* ── Derived values ─────────────────────────────────────────────── */

  const providerName = useMemo(() => {
    if (!appt?.provider?.user) return t("appt_details.practitioner", "Practitioner");
    const u = appt.provider.user;
    return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "Practitioner";
  }, [appt, t]);

  const serviceName = appt?.service?.name || t("appt_details.consultation", "Consultation");

  const visitTypeLabel = (() => {
    switch (appt?.visitType) {
      case "online":
        return t("appt_details.visit_online", "Online consultation");
      case "home":
        return t("appt_details.visit_home", "Home visit");
      case "clinic":
        return t("appt_details.visit_clinic", "In-clinic visit");
      default:
        return appt?.visitType || "";
    }
  })();

  const VisitIcon =
    appt?.visitType === "online" ? Video : appt?.visitType === "home" ? MapPin : Building2;

  const prettyDate = useMemo(() => {
    if (!appt?.date) return "";
    return formatDate(`${appt.date}T12:00:00`, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }) || appt.date;
  }, [appt]);

  const locationLine = useMemo(() => {
    if (!appt) return null;
    if (appt.visitType === "home") return appt.patientAddress || null;
    if (appt.visitType === "clinic")
      return appt.provider?.primaryServiceLocation || appt.provider?.city || null;
    return null;
  }, [appt]);

  const meetingLink = useMemo(() => {
    if (appt?.visitType !== "online" || !appointmentId) return null;
    if (typeof window === "undefined") return `/api/video/room/${appointmentId}`;
    return `${window.location.origin}/api/video/room/${appointmentId}`;
  }, [appt, appointmentId]);

  /* ── Pricing breakdown (mirrors booking-confirmation logic) ────── */
  const total = Number(appt?.totalAmount ?? 0) || 0;
  const platformFee = Number(appt?.platformFeeAmount ?? 0) || 0;
  const promoDiscount = Number(appt?.promoDiscount ?? 0) || 0;
  const packageDiscountAmount = Number(appt?.packageDiscountAmount ?? 0) || 0;
  const totalSavings = promoDiscount + packageDiscountAmount;
  const taxAmount = Number(appt?.taxAmount ?? 0) || 0;
  // All amounts on appointments are in booking currency (HUF/IRR/USD), NOT USD.
  // Use formatInCurrency so we never double-multiply by the exchange rate.
  const bookingCurrency = appt?.displayCurrency ?? (appt as any)?.payment?.displayCurrency ?? "USD";
  const fmtAmt = (n: number) => formatInCurrency(n, bookingCurrency);
  const visitFee = (() => {
    const s = appt?.service;
    if (!s) return 0;
    switch (appt?.visitType) {
      case "online":
        return Number(s.telemedicineFee ?? 0) || 0;
      case "home":
        return Number(s.homeVisitFee ?? 0) || 0;
      case "clinic":
        return Number(s.clinicFee ?? 0) || 0;
      default:
        return 0;
    }
  })();
  const baseAmount = appt?.servicePriceSnapshot != null
    ? Number(appt.servicePriceSnapshot)
    : Math.max(0, total - taxAmount - platformFee - visitFee + promoDiscount);

  const canCancel =
    appt && ["pending", "approved", "confirmed"].includes(appt.status);
  const canReschedule =
    appt && ["pending", "approved", "confirmed", "rescheduled"].includes(appt.status);
  const canRebook = appt && ["completed", "cancelled", "cancelled_by_patient", "cancelled_by_provider", "expired"].includes(appt.status);
  const canDispute = appt && user?.role === "patient" && ["completed", "cancelled", "cancelled_by_provider"].includes(appt.status);
  const isProvider = user?.role === "provider";

  // Patient notes (only visible to provider)
  const { data: patientNotes = [] } = useQuery<any[]>({
    queryKey: QK.patientNotes(appt?.patientId),
    enabled: isProvider && !!appt?.patientId,
  });

  // Patient's prescriptions for this appointment (Section C — shown to patient on completed appts)
  const { data: patientRxList = [] } = useQuery<any[]>({
    queryKey: ["/api/prescriptions/patient", appt?.patientId],
    queryFn: () =>
      apiRequest("GET", `/api/prescriptions/patient/${appt?.patientId}`).then((r) => r.json()),
    enabled: !isProvider && !!appt?.patientId && appt?.status === "completed",
  });
  const appointmentRx = patientRxList.filter((rx: any) => rx.appointment_id === appointmentId);

  const disputeMut = useMutation({
    mutationFn: (payload: any) => apiRequest("POST", "/api/disputes", payload),
    onSuccess: () => {
      toast({ title: "Dispute filed", description: "We will review it and get back to you." });
      setDisputeOpen(false);
      setDisputeReason("");
      setDisputeDesc("");
    },
    onError: (e: any) => toast({ title: "Failed to file dispute", description: e?.message, variant: "destructive" }),
  });

  const addNoteMut = useMutation({
    mutationFn: (payload: any) => apiRequest("POST", "/api/provider/patient-notes", payload),
    onSuccess: () => {
      toast({ title: "Note saved" });
      setNoteContent("");
      queryClient.invalidateQueries({ queryKey: QK.patientNotes(appt?.patientId) });
    },
    onError: () => toast({ title: "Failed to save note", variant: "destructive" }),
  });

  const editNoteMut = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      apiRequest("PATCH", `/api/provider/patient-notes/${id}`, { content }),
    onSuccess: () => {
      toast({ title: "Note updated" });
      setEditingNoteId(null);
      queryClient.invalidateQueries({ queryKey: QK.patientNotes(appt?.patientId) });
    },
  });

  const deleteNoteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/provider/patient-notes/${id}`),
    onSuccess: () => {
      toast({ title: "Note deleted" });
      queryClient.invalidateQueries({ queryKey: QK.patientNotes(appt?.patientId) });
    },
  });

  /* ── Render guards ──────────────────────────────────────────────── */

  if (!appointmentId) {
    return (
      <DetailsShell>
        <ErrorState
          title={t("appt_details.invalid_id", "Invalid appointment")}
          description={t("appt_details.invalid_id_desc", "No appointment id was provided.")}
        />
      </DetailsShell>
    );
  }

  if (authLoading || isLoading) {
    return (
      <DetailsShell>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/3 mt-2" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      </DetailsShell>
    );
  }

  if (!isAuthenticated) {
    navigate("/login");
    return null;
  }

  if (isError || !appt) {
    const msg = String((error as any)?.message ?? "");
    const notFound = /^404/.test(msg);
    return (
      <DetailsShell>
        <ErrorState
          title={
            notFound
              ? t("appt_details.not_found", "Appointment not found")
              : t("appt_details.load_failed", "Could not load appointment")
          }
          description={
            notFound
              ? t(
                  "appt_details.not_found_desc",
                  "We couldn't find this appointment. It may have been removed or you may not have access to it.",
                )
              : msg || t("appt_details.load_failed_desc", "Please try again in a moment.")
          }
        />
      </DetailsShell>
    );
  }

  /* ── Main render ───────────────────────────────────────────────── */

  return (
    <DetailsShell>
      <Card data-testid="card-appointment-details">
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-2xl" data-testid="text-service-name">
                  {serviceName}
                </CardTitle>
                {appt.appointmentNumber && (
                  <span
                    className="text-xs font-mono font-semibold text-primary bg-primary/10 px-2 py-1 rounded"
                    data-testid="text-appointment-number"
                  >
                    {appt.appointmentNumber}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <UserIcon className="h-4 w-4" />
                <span data-testid="text-provider-name">{providerName}</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge
                variant={STATUS_VARIANT[appt.status] || "secondary"}
                className="capitalize"
                data-testid="badge-status"
              >
                {formatStatus(appt.status)}
              </Badge>
              <AppointmentTimeContext
                date={appt.date}
                startTime={appt.startTime}
                startAtUtc={(appt as any).startAt}
                status={appt.status}
                className="text-xs text-muted-foreground"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* ── Reschedule proposal banner (patient-only, shown when provider proposed a new time) ── */}
          {appt.status === "reschedule_proposed" && user?.role === "patient" && (
            <RescheduleProposalBanner
              appointmentId={appointmentId!}
              appointmentNumber={appt.appointmentNumber}
              invalidateKeys={[[...QK.appointment(appointmentId)]]}
              onSettled={() => queryClient.invalidateQueries({ queryKey: QK.appointment(appointmentId) })}
            />
          )}

          {/* ── Sign-off code banner (patient-only, shown when session is in progress) ── */}
          {appt.status === "in_progress" && user?.role === "patient" && (appt as any).signOffCode && (
            <div
              className="flex items-start gap-3 rounded-lg border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-600 p-4"
              data-testid="banner-sign-off-code"
            >
              <KeyRound className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                  {t("appt_details.sign_off_title", "Your session sign-off code")}
                </p>
                <p
                  className="text-3xl font-mono font-bold tracking-[0.3em] text-amber-700 dark:text-amber-300"
                  data-testid="text-sign-off-code"
                >
                  {(appt as any).signOffCode}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {t("appt_details.sign_off_hint", "Share this code with your provider at the end of the session so they can mark it as complete.")}
                </p>
              </div>
            </div>
          )}

          {/* ── Preparation checklist (patient only, confirmed/pending within 48h) ── */}
          {!isProvider && ["pending", "confirmed"].includes(appt.status) && (
            <PreparationPanel
              visitType={appt.visitType ?? "online"}
              appointmentDate={appt.date}
              startTime={appt.startTime}
              startAtUtc={(appt as any).startAt}
              providerName={providerName}
              patientAddress={(appt as any).patientAddress}
              meetingLink={meetingLink ?? null}
              paymentStatus={(appt as any).payment?.status ?? null}
              hasNotes={!!appt.notes}
            />
          )}

          {/* ── Schedule ── */}
          <div className="grid sm:grid-cols-2 gap-3">
            <DetailRow
              icon={CalendarIcon}
              label={t("appt_details.date", "Date")}
              value={prettyDate}
              testId="row-date"
            />
            <DetailRow
              icon={Clock}
              label={t("appt_details.time", "Time")}
              value={`${appt.startTime} – ${appt.endTime}${(appt as any).providerTimezone ? ` (${(appt as any).providerTimezone.split("/").pop()?.replace(/_/g, " ") ?? (appt as any).providerTimezone})` : ""}`}
              testId="row-time"
            />
            <DetailRow
              icon={VisitIcon}
              label={t("appt_details.visit_type", "Visit type")}
              value={visitTypeLabel}
              testId="row-visit-type"
            />
            {appt.notes && (
              <DetailRow
                icon={MessageSquare}
                label={t("appt_details.notes", "Notes")}
                value={appt.notes}
                testId="row-notes"
              />
            )}
          </div>

          {/* ── Appointment Timing Card ── */}
          <AppointmentTimingCard
            date={appt.date}
            startTime={appt.startTime}
            endTime={appt.endTime}
            startAtUtc={(appt as any).startAt}
            status={appt.status}
          />

          <Separator />

          {/* ── Location / meeting link ── */}
          {locationLine && (
            <DetailRow
              icon={MapPin}
              label={t("appt_details.address", "Address")}
              value={locationLine}
              testId="row-address"
            />
          )}
          {/* ── Home visit coverage info ── */}
          {appt.visitType === "home" && (
            <HomeVisitCoverage
              patientAddress={(appt as any).patientAddress}
              providerCity={(appt as any).provider?.city}
              homeVisitRadiusKm={(appt as any).provider?.homeVisitRadiusKm}
              distanceKm={(appt as any).distanceKm}
            />
          )}

          {meetingLink && appt && ["confirmed", "approved", "in_progress"].includes(appt.status) && (
            <div className="py-2" data-testid="section-telehealth-room">
              <TelehealthRoom
                appointmentId={appointmentId!}
                providerName={appt.provider?.name ?? undefined}
                scheduledAt={(appt as any).scheduledAt ?? (appt as any).startTime ?? undefined}
              />
            </div>
          )}
          {meetingLink && appt && !["confirmed", "approved", "in_progress"].includes(appt.status) && (
            <DetailRow
              icon={Video}
              label={t("appt_details.meeting_link", "Meeting link")}
              testId="row-meeting-link"
              value={
                <div className="flex items-center gap-2 flex-wrap">
                  <a
                    href={meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline break-all"
                    data-testid="link-meeting"
                  >
                    {meetingLink}
                    <ExternalLink className="inline-block h-3 w-3 ml-1" />
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(meetingLink);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      } catch {
                        toast({
                          title: t("appt_details.copy_failed", "Could not copy link"),
                          variant: "destructive",
                        });
                      }
                    }}
                    data-testid="button-copy-link"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              }
            />
          )}

          {(locationLine || meetingLink) && <Separator />}

          {/* ── Pricing ── */}
          {total > 0 && (
            <div className="space-y-2" data-testid="section-pricing">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t("appt_details.pricing", "Pricing")}
              </h3>
              <PriceRow label={t("appt_details.base_amount", "Base price")} value={fmtAmt(baseAmount)} />
              {visitFee > 0 && (
                <PriceRow
                  label={t("appt_details.visit_fee", "Visit fee")}
                  value={fmtAmt(visitFee)}
                />
              )}
              {platformFee > 0 && (
                <PriceRow
                  label={t("appt_details.platform_fee", "Platform fee")}
                  value={fmtAmt(platformFee)}
                />
              )}
              {promoDiscount > 0 && (
                <PriceRow
                  label={appt?.promoCode ? `Promo (${appt.promoCode})` : t("appt_details.promo_discount", "Promo discount")}
                  value={`− ${fmtAmt(promoDiscount)}`}
                  className="text-emerald-600 dark:text-emerald-400 font-medium"
                />
              )}
              {packageDiscountAmount > 0 && (
                <PriceRow
                  label={t("appt_details.member_discount", "Member discount")}
                  value={`− ${fmtAmt(packageDiscountAmount)}`}
                  className="text-emerald-600 dark:text-emerald-400 font-medium"
                />
              )}
              <PriceRow
                label={t("appt_details.tax", "Tax")}
                value={fmtAmt(taxAmount)}
              />
              <Separator className="my-1" />
              <PriceRow
                label={t("appt_details.total", "Total")}
                value={fmtAmt(total)}
                bold
                testId="row-total"
              />
              {totalSavings > 0 && (
                <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-lg px-3 py-2.5 mt-3" data-testid="banner-total-savings">
                  <div className="flex items-center gap-2">
                    <span>🎉</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold text-sm">You saved on this booking</span>
                  </div>
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold text-sm">{fmtAmt(totalSavings)}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex flex-wrap gap-2 pt-2">
            {canReschedule && (
              <Button
                variant="outline"
                onClick={() => setActionTarget("reschedule")}
                data-testid="button-reschedule"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {t("appt_details.reschedule", "Reschedule")}
              </Button>
            )}
            {canCancel && (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setActionTarget("cancel")}
                data-testid="button-cancel"
              >
                <X className="h-4 w-4 mr-2" />
                {t("appt_details.cancel", "Cancel")}
              </Button>
            )}
            {appt.status === "completed" && !appt.hasReview && (
              <Button
                variant="outline"
                asChild
                data-testid="button-leave-review"
              >
                <Link href={`/review/${appt.id}`}>
                  <Star className="h-4 w-4 mr-2 fill-yellow-400 text-yellow-400" />
                  {t("appt_details.leave_review", "Leave review")}
                </Link>
              </Button>
            )}
            {appt.status === "completed" && appt.hasReview && (
              <Button
                variant="outline"
                disabled
                data-testid="button-already-reviewed"
              >
                <Star className="h-4 w-4 mr-2 fill-yellow-400 text-yellow-400" />
                {t("appt_details.review_submitted", "Review submitted")}
              </Button>
            )}
            {appt.status === "completed" && (
              <Button
                variant="outline"
                asChild
                data-testid="button-download-invoice"
              >
                <a
                  href={`/api/invoices/by-appointment/${appt.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {t("appt_details.download_invoice", "Download invoice")}
                </a>
              </Button>
            )}
            {canRebook && appt.providerId && appt.serviceId && (
              <Button
                variant="outline"
                asChild
                data-testid="button-rebook"
              >
                <Link href={`/book?providerId=${appt.providerId}&serviceId=${appt.serviceId}`}>
                  <Repeat className="h-4 w-4 mr-2" />
                  Book again
                </Link>
              </Button>
            )}
            {canDispute && (
              <Button
                variant="ghost"
                className="text-amber-600 hover:text-amber-700"
                onClick={() => setDisputeOpen(true)}
                data-testid="button-file-dispute"
              >
                <ShieldAlert className="h-4 w-4 mr-2" />
                File a dispute
              </Button>
            )}
            {/* ── Calendar export (upcoming/confirmed/approved appts) ── */}
            {appt?.scheduledAt && ["approved","confirmed","pending"].includes(appt.status) && (
              <>
                <a
                  href={buildGoogleCalendarUrl(appt)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    apiRequest("POST", "/api/analytics/track", {
                      event: "calendar_exported",
                      properties: { method: "google", appointmentId: appt.id },
                    }).catch(() => {});
                  }}
                >
                  <Button variant="outline" size="sm" data-testid="button-add-google-cal">
                    <CalendarPlus className="h-4 w-4 mr-2" />
                    Google Calendar
                  </Button>
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    downloadIcs(appt);
                    apiRequest("POST", "/api/analytics/track", {
                      event: "calendar_exported",
                      properties: { method: "ics", appointmentId: appt.id },
                    }).catch(() => {});
                  }}
                  data-testid="button-download-ics"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download .ics
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Post-appointment summary (patient-only, completed) ── */}
      {!isProvider && appt?.status === "completed" && (
        <PostAppointmentSummary
          appointmentId={appointmentId!}
          serviceId={appt.serviceId}
          providerId={appt.providerId}
          visitType={appt.visitType ?? undefined}
          providerName={providerName}
          hasReview={!!(appt as any).hasReview}
          invoiceGenerated={!!(appt as any).invoiceGenerated}
          prescriptionsCount={(appt as any).prescriptionsCount ?? 0}
          totalAmount={(appt as any).totalAmount}
        />
      )}

      {/* Provider Summary — shown to patient after appointment completed */}
      {!isProvider && appt?.status === "completed" && (appt.outcomeNote || appt.followUpRecommended || appt.referralNeeded) && (
        <Card data-testid="card-provider-summary">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-primary" />
              {t("appt_details.provider_summary_title", "Provider Summary")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {appt.outcomeNote && (
              <div data-testid="section-outcome-note">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  {t("appt_details.outcome_label", "Session summary")}
                </p>
                <p className="text-sm whitespace-pre-wrap">{appt.outcomeNote}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {appt.followUpRecommended && (
                <div className="flex items-center gap-1.5 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-1.5 text-sm text-blue-800 dark:text-blue-300" data-testid="badge-followup-recommended">
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  {t("appt_details.follow_up_recommended", "Follow-up appointment recommended")}
                  {appt.followUpRecommendedAt && (
                    <span className="text-xs text-muted-foreground ml-1">
                      · {formatDate(appt.followUpRecommendedAt)}
                    </span>
                  )}
                </div>
              )}
              {/* Section G: Follow-up booking CTA */}
              {appt.followUpRecommended && appt.providerId && (
                <Button
                  size="sm"
                  variant="outline"
                  asChild
                  className="w-full sm:w-auto"
                  data-testid="button-book-followup"
                >
                  <Link href={`/book?providerId=${appt.providerId}${appt.serviceId ? `&serviceId=${appt.serviceId}` : ""}&followUp=true`}>
                    <CalendarDays className="h-4 w-4 mr-2" />
                    {t("appt_details.book_followup", "Book follow-up appointment")}
                  </Link>
                </Button>
              )}
              {appt.referralNeeded && (
                <div className="flex items-center gap-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-1.5 text-sm text-amber-800 dark:text-amber-300" data-testid="badge-referral-needed">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  {t("appt_details.referral_needed", "Referral to specialist recommended")}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section C: Prescriptions — shown to patient on completed appointments */}
      {!isProvider && appt?.status === "completed" && appointmentRx.length > 0 && (
        <Card data-testid="card-patient-prescriptions">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              {t("appt_details.prescriptions_title", "Prescriptions")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {appointmentRx.map((rx: any) => (
              <div key={rx.id} className="rounded-lg border p-3 space-y-1" data-testid={`card-rx-${rx.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm">{rx.medication_name}</p>
                  <Badge
                    variant={rx.is_active ? "default" : "secondary"}
                    className="text-xs shrink-0"
                  >
                    {rx.is_active
                      ? t("appt_details.rx_active", "Active")
                      : t("appt_details.rx_inactive", "Inactive")}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {rx.dosage} · {rx.frequency} · {rx.duration}
                </p>
                {rx.instructions && (
                  <p className="text-xs text-muted-foreground italic">{rx.instructions}</p>
                )}
                <p className="text-xs text-muted-foreground">{formatDate(rx.issued_at)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Patient contact info — only shown to provider */}
      {isProvider && appt && (appt as any).patientContact && (
        <Card data-testid="card-patient-contact">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Patient Contact Information
            </CardTitle>
            <CardDescription>Contact details shared by the patient for this appointment.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              {(appt as any).patientContact.mobileNumber && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mobile Number</p>
                  <p className="font-medium" data-testid="text-patient-mobile">{(appt as any).patientContact.mobileNumber}</p>
                </div>
              )}
              {(appt as any).patientContact.phone && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Phone</p>
                  <p className="font-medium" data-testid="text-patient-phone">{(appt as any).patientContact.phone}</p>
                </div>
              )}
              {(appt as any).patientContact.emergencyContactName && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Emergency Contact</p>
                  <p className="font-medium" data-testid="text-patient-emergency-name">
                    {(appt as any).patientContact.emergencyContactName}
                    {(appt as any).patientContact.emergencyContactRelation && (
                      <span className="text-muted-foreground font-normal"> ({(appt as any).patientContact.emergencyContactRelation})</span>
                    )}
                  </p>
                </div>
              )}
              {(appt as any).patientContact.emergencyContactPhone && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Emergency Phone</p>
                  <p className="font-medium" data-testid="text-patient-emergency-phone">{(appt as any).patientContact.emergencyContactPhone}</p>
                </div>
              )}
            </div>
            {!(appt as any).patientContact.mobileNumber && !(appt as any).patientContact.emergencyContactName && (
              <p className="text-sm text-muted-foreground">The patient has not added contact details yet.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Patient notes — only shown to provider */}
      {isProvider && appt && (
        <Card data-testid="card-patient-notes">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <StickyNote className="h-4 w-4" />
              Private notes about this client
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {(patientNotes as any[]).map((note: any) => (
                <div key={note.id} className="p-3 rounded-lg border bg-muted/30 space-y-1" data-testid={`card-note-${note.id}`}>
                  {editingNoteId === note.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editNoteContent}
                        onChange={e => setEditNoteContent(e.target.value)}
                        className="text-sm"
                        data-testid="textarea-edit-note"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => editNoteMut.mutate({ id: note.id, content: editNoteContent })} disabled={editNoteMut.isPending} data-testid="button-save-note-edit">Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingNoteId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">{formatDate(note.created_at)}</span>
                        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => { setEditingNoteId(note.id); setEditNoteContent(note.content); }} data-testid={`button-edit-note-${note.id}`}><Pencil className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-destructive hover:text-destructive" onClick={() => deleteNoteMut.mutate(note.id)} data-testid={`button-delete-note-${note.id}`}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Add a note</Label>
              <Textarea
                placeholder="Write a private note about this client or appointment..."
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                className="text-sm"
                data-testid="textarea-new-note"
              />
              <Button
                size="sm"
                disabled={!noteContent.trim() || addNoteMut.isPending}
                onClick={() => addNoteMut.mutate({ patientId: appt.patientId, content: noteContent, appointmentId: appt.id })}
                data-testid="button-add-note"
              >
                Save note
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reschedule history — only shown when the appointment has been rescheduled */}
      {(appt.isRescheduled || appt.originalDate) && (
        <RescheduleHistory appt={appt} events={events} loading={eventsLoading} />
      )}

      <EventsTimeline events={events} loading={eventsLoading} />

      {/* Dispute dialog */}
      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>File a dispute</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Select value={disputeReason} onValueChange={setDisputeReason}>
                <SelectTrigger data-testid="select-dispute-reason">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no_show">Provider did not show up</SelectItem>
                  <SelectItem value="wrong_service">Wrong or incomplete service</SelectItem>
                  <SelectItem value="refund_requested">Refund requested</SelectItem>
                  <SelectItem value="technical_issue">Technical issue (video call)</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Additional details</Label>
              <Textarea
                placeholder="Please describe the issue..."
                value={disputeDesc}
                onChange={e => setDisputeDesc(e.target.value)}
                data-testid="textarea-dispute-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDisputeOpen(false)}>Cancel</Button>
            <Button
              disabled={!disputeReason || disputeMut.isPending}
              onClick={() => disputeMut.mutate({ appointmentId: appt?.id, reason: disputeReason, description: disputeDesc })}
              data-testid="button-submit-dispute"
            >
              Submit dispute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AppointmentActionDialog
        appointmentId={appointmentId}
        action={actionTarget ?? "cancel"}
        open={!!actionTarget}
        onOpenChange={(open) => !open && setActionTarget(null)}
        invalidateKeys={[
          ["/api/appointments", appointmentId],
          ["/api/appointments", appointmentId, "events"],
          ["/api/appointments/patient"],
          ["/api/appointments/provider"],
        ]}
      />
    </DetailsShell>
  );
}

/* ── Reschedule history ──────────────────────────────────────────── */

function RescheduleHistory({
  appt,
  events,
  loading,
}: {
  appt: Appt;
  events: AppointmentEventRow[] | undefined;
  loading: boolean;
}) {
  const rescheduleEvents = useMemo(
    () => (events ?? []).filter((e) => e.action === "reschedule"),
    [events],
  );

  const original = appt.originalDate
    ? { date: appt.originalDate, start: appt.originalStartTime, end: appt.originalEndTime }
    : null;

  const steps: Array<{ date: string; start: string; end: string; label: string; ts?: string }> = [];

  if (original) {
    steps.push({
      date: original.date,
      start: original.start ?? "",
      end: original.end ?? "",
      label: "Original booking",
    });
  }

  rescheduleEvents.forEach((ev, i) => {
    try {
      const m = ev.metadata ? JSON.parse(ev.metadata) : null;
      if (m?.to?.date) {
        steps.push({
          date: m.to.date,
          start: m.to.startTime ?? "",
          end: m.to.endTime ?? "",
          label: i === rescheduleEvents.length - 1 ? "Current slot" : `Reschedule ${i + 1}`,
          ts: ev.createdAt,
        });
      }
    } catch { /* non-fatal */ }
  });

  return (
    <Card className="mt-4" data-testid="card-reschedule-history">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4" />
          Reschedule history
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This appointment has been rescheduled but no slot detail was recorded.
          </p>
        ) : (
          <ol className="space-y-2" data-testid="list-reschedule-steps">
            {steps.map((step, idx) => (
              <li
                key={idx}
                className={`flex items-start gap-3 p-3 rounded-lg border ${
                  idx === steps.length - 1
                    ? "bg-primary/5 border-primary/20"
                    : "bg-muted/30 border-border"
                }`}
                data-testid={`reschedule-step-${idx}`}
              >
                <div className="mt-0.5 shrink-0">
                  {idx === steps.length - 1 ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : (
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {step.label}
                  </div>
                  <div className="text-sm font-semibold mt-0.5" data-testid={`reschedule-date-${idx}`}>
                    {step.date}
                    {step.start && (
                      <span className="font-normal text-muted-foreground ml-2">
                        {step.start}{step.end ? ` – ${step.end}` : ""}
                      </span>
                    )}
                  </div>
                  {step.ts && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Rescheduled on {formatTimestamp(step.ts)}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Audit timeline ──────────────────────────────────────────────── */

type AppointmentEventRow = {
  id: string;
  appointmentId: string;
  action:
    | "book"
    | "cancel"
    | "reschedule"
    | "no_show"
    | "approve"
    | "confirm"
    | "start"
    | "complete"
    | "reject";
  actorUserId: string | null;
  actorRole: "patient" | "provider" | "admin" | null;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  reasonCode: string | null;
  refundAmount: string | null;
  metadata: string | null;
  createdAt: string;
  actorName: string | null;
};

const ACTION_META: Record<
  AppointmentEventRow["action"],
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  book: { label: "Booked", icon: PlusCircle, tone: "text-blue-600 dark:text-blue-400" },
  approve: { label: "Approved", icon: ThumbsUp, tone: "text-emerald-600 dark:text-emerald-400" },
  confirm: { label: "Confirmed", icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-400" },
  start: { label: "Started", icon: PlayCircle, tone: "text-amber-600 dark:text-amber-400" },
  complete: { label: "Completed", icon: CheckCircle2, tone: "text-emerald-700 dark:text-emerald-300" },
  reject: { label: "Rejected", icon: ThumbsDown, tone: "text-red-600 dark:text-red-400" },
  cancel: { label: "Cancelled", icon: XCircle, tone: "text-red-600 dark:text-red-400" },
  reschedule: { label: "Rescheduled", icon: CalendarClock, tone: "text-amber-600 dark:text-amber-400" },
  no_show: { label: "No-show", icon: UserX, tone: "text-red-600 dark:text-red-400" },
};

function actorDisplay(ev: AppointmentEventRow): string {
  if (!ev.actorRole && !ev.actorUserId) return "System";
  const role = ev.actorRole
    ? ev.actorRole.charAt(0).toUpperCase() + ev.actorRole.slice(1)
    : "Unknown";
  return ev.actorName ? `${ev.actorName} (${role})` : role;
}

function formatTimestamp(iso: string): string {
  return formatDateTime(iso) || iso;
}

function parseRescheduleMeta(metadata: string | null): string | null {
  if (!metadata) return null;
  try {
    const m = JSON.parse(metadata);
    if (m?.from?.date && m?.to?.date) {
      return `${m.from.date} ${m.from.startTime ?? ""} → ${m.to.date} ${m.to.startTime ?? ""}`;
    }
  } catch {}
  return null;
}

function EventsTimeline({
  events,
  loading,
}: {
  events: AppointmentEventRow[] | undefined;
  loading: boolean;
}) {
  const { format: fmtMoney } = useCurrency();
  return (
    <Card className="mt-6" data-testid="card-appointment-timeline">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <History className="h-5 w-5" />
          Activity timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !events || events.length === 0 ? (
          <p
            className="text-sm text-muted-foreground py-4"
            data-testid="text-timeline-empty"
          >
            No events recorded for this appointment yet.
          </p>
        ) : (
          <ol className="relative border-l border-muted ml-3 space-y-5">
            {events.map((ev) => {
              const meta = ACTION_META[ev.action] ?? {
                label: ev.action,
                icon: AlertCircle,
                tone: "text-muted-foreground",
              };
              const Icon = meta.icon;
              const reschedMeta = parseRescheduleMeta(ev.metadata);
              const refund = Number(ev.refundAmount ?? 0);
              return (
                <li
                  key={ev.id}
                  className="ml-6"
                  data-testid={`timeline-event-${ev.id}`}
                >
                  <span className="absolute -left-[11px] flex h-5 w-5 items-center justify-center rounded-full bg-background ring-4 ring-background">
                    <Icon className={`h-5 w-5 ${meta.tone}`} />
                  </span>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span
                      className={`font-medium ${meta.tone}`}
                      data-testid={`timeline-action-${ev.id}`}
                    >
                      {meta.label}
                    </span>
                    {ev.fromStatus && ev.toStatus && (
                      <span className="text-xs text-muted-foreground">
                        {formatStatus(ev.fromStatus)} → {formatStatus(ev.toStatus)}
                      </span>
                    )}
                  </div>
                  <div
                    className="text-xs text-muted-foreground mt-0.5"
                    data-testid={`timeline-actor-${ev.id}`}
                  >
                    by {actorDisplay(ev)} · {" "}
                    <span data-testid={`timeline-time-${ev.id}`}>
                      {formatTimestamp(ev.createdAt)}
                    </span>
                  </div>
                  {ev.reason && (
                    <div
                      className="text-sm mt-1.5 text-foreground/80"
                      data-testid={`timeline-reason-${ev.id}`}
                    >
                      “{ev.reason}”
                    </div>
                  )}
                  {reschedMeta && (
                    <div className="text-xs mt-1 text-muted-foreground">
                      {reschedMeta}
                    </div>
                  )}
                  {refund > 0 && (
                    <div
                      className="text-xs mt-1 text-emerald-700 dark:text-emerald-400"
                      data-testid={`timeline-refund-${ev.id}`}
                    >
                      Refund issued: {fmtMoney(refund)}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Layout / presentational helpers ─────────────────────────────── */

function DetailsShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        <PageBreadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: t("appointments.my_appointments", "My Appointments"), href: "/appointments" },
            { label: t("appt_details.title", "Appointment Details") },
          ]}
          fallback="/appointments"
        />
        {children}
      </main>
      <Footer />
    </div>
  );
}

function ErrorState({ title, description }: { title: string; description: string }) {
  return (
    <Card data-testid="card-error">
      <CardContent className="py-12 text-center">
        <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
        <h3 className="text-lg font-semibold mb-2" data-testid="text-error-title">{title}</h3>
        <p className="text-sm text-muted-foreground" data-testid="text-error-desc">{description}</p>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  testId,
}: {
  icon: any;
  label: string;
  value: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex items-start gap-3" data-testid={testId}>
      <div className="mt-0.5 h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm font-medium break-words">{value}</div>
      </div>
    </div>
  );
}

function PriceRow({
  label,
  value,
  bold,
  className,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between text-sm ${bold ? "font-semibold text-base" : ""} ${className ?? ""}`}
      data-testid={testId}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
