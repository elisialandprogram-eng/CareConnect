import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Video,
  Building2,
  User as UserIcon,
  ArrowLeft,
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
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/lib/currency";
import { formatDate, formatDateTime } from "@/lib/datetime";
import {
  AppointmentActionDialog,
  type AppointmentAction,
} from "@/components/appointment/AppointmentActionDialog";

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
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { format: formatMoney } = useCurrency();

  const [actionTarget, setActionTarget] = useState<AppointmentAction | null>(null);
  const [copied, setCopied] = useState(false);

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
    queryKey: ["/api/appointments", appointmentId],
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
    queryKey: ["/api/appointments", appointmentId, "events"],
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
  const baseAmount = Math.max(0, total - platformFee - visitFee + promoDiscount);

  const canCancel =
    appt && ["pending", "approved", "confirmed"].includes(appt.status);
  const canReschedule =
    appt && ["pending", "approved", "confirmed", "rescheduled"].includes(appt.status);

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
            <Badge
              variant={STATUS_VARIANT[appt.status] || "secondary"}
              className="capitalize"
              data-testid="badge-status"
            >
              {formatStatus(appt.status)}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
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
              value={`${appt.startTime} – ${appt.endTime}`}
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
          {meetingLink && (
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
              <PriceRow label={t("appt_details.base_amount", "Base price")} value={formatMoney(baseAmount)} />
              {visitFee > 0 && (
                <PriceRow
                  label={t("appt_details.visit_fee", "Visit fee")}
                  value={formatMoney(visitFee)}
                />
              )}
              {platformFee > 0 && (
                <PriceRow
                  label={t("appt_details.platform_fee", "Platform fee")}
                  value={formatMoney(platformFee)}
                />
              )}
              {promoDiscount > 0 && (
                <PriceRow
                  label={t("appt_details.promo_discount", "Discount")}
                  value={`− ${formatMoney(promoDiscount)}`}
                  className="text-emerald-600 dark:text-emerald-400"
                />
              )}
              <Separator className="my-1" />
              <PriceRow
                label={t("appt_details.total", "Total")}
                value={formatMoney(total)}
                bold
                testId="row-total"
              />
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
          </div>
        </CardContent>
      </Card>

      <EventsTimeline events={events} loading={eventsLoading} />

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
                      Refund issued: {refund.toFixed(2)}
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
        <Button variant="ghost" size="sm" asChild className="mb-4" data-testid="button-back">
          <Link href="/appointments">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("appt_details.back", "Back to appointments")}
          </Link>
        </Button>
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
