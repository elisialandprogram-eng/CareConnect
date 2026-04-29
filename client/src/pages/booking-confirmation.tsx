import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
import {
  CheckCircle2,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Video,
  Building2,
  User as UserIcon,
  Copy,
  Check,
  Download,
  CalendarPlus,
  RefreshCw,
  X,
  FileText,
  Mail,
  MessageSquare,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AppointmentActionDialog, type AppointmentAction } from "@/components/appointment/AppointmentActionDialog";

/* ── ICS / Google Calendar helpers ────────────────────────────────── */

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatLocalDateTime(date: string, time: string) {
  // We treat the booking date+time as local (no timezone conversion).
  // ICS uses floating local time when no TZID is provided.
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return `${y}${pad2(m)}${pad2(d)}T${pad2(hh)}${pad2(mm)}00`;
}

function buildGoogleCalendarUrl(opts: {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  details?: string;
  location?: string;
}) {
  const start = formatLocalDateTime(opts.date, opts.startTime);
  const end = formatLocalDateTime(opts.date, opts.endTime);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    dates: `${start}/${end}`,
  });
  if (opts.details) params.set("details", opts.details);
  if (opts.location) params.set("location", opts.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildIcsContent(opts: {
  uid: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  description?: string;
  location?: string;
}) {
  const escape = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const dtStart = formatLocalDateTime(opts.date, opts.startTime);
  const dtEnd = formatLocalDateTime(opts.date, opts.endTime);
  const dtStamp =
    new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GoldenLife//Booking//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${opts.uid}@goldenlife.health`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escape(opts.title)}`,
    opts.description ? `DESCRIPTION:${escape(opts.description)}` : "",
    opts.location ? `LOCATION:${escape(opts.location)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

function downloadIcs(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* ── Page ─────────────────────────────────────────────────────────── */

export default function BookingConfirmation() {
  const params = useParams<{ appointmentId: string }>();
  const appointmentId = params.appointmentId;
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { format: fmtMoney } = useCurrency();
  const [copied, setCopied] = useState(false);

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
  } = useQuery<any>({
    queryKey: ["/api/appointments", appointmentId],
    enabled: !!appointmentId && isAuthenticated,
  });

  // Unified appointment action dialog state
  const [actionTarget, setActionTarget] = useState<AppointmentAction | null>(null);

  /* ── Derived display values ────────────────────────────────────── */

  const providerName = useMemo(() => {
    if (!appt?.provider?.user) return "Practitioner";
    const u = appt.provider.user;
    return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "Practitioner";
  }, [appt]);

  const serviceName = appt?.service?.name || "Consultation";

  const visitTypeLabel = (() => {
    switch (appt?.visitType) {
      case "online":
        return "Online consultation";
      case "home":
        return "Home visit";
      case "clinic":
        return "In-clinic visit";
      default:
        return appt?.visitType || "";
    }
  })();

  const visitIcon =
    appt?.visitType === "online" ? Video : appt?.visitType === "home" ? MapPin : Building2;

  const prettyDate = useMemo(() => {
    if (!appt?.date) return "";
    try {
      return new Date(`${appt.date}T12:00:00`).toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return appt.date;
    }
  }, [appt]);

  const locationLine: string | null = useMemo(() => {
    if (!appt) return null;
    if (appt.visitType === "home") return appt.patientAddress || null;
    if (appt.visitType === "clinic")
      return appt.provider?.primaryServiceLocation || appt.provider?.city || null;
    return null;
  }, [appt]);

  const lat: number | null = appt?.patientLatitude ?? null;
  const lng: number | null = appt?.patientLongitude ?? null;
  const hasMap = appt?.visitType === "home" && typeof lat === "number" && typeof lng === "number";

  const meetingLink: string | null = useMemo(() => {
    if (appt?.visitType !== "online") return null;
    if (!appointmentId) return null;
    if (typeof window === "undefined") return `/api/video/room/${appointmentId}`;
    return `${window.location.origin}/api/video/room/${appointmentId}`;
  }, [appt, appointmentId]);

  /* ── Pricing breakdown ─────────────────────────────────────────── */
  const total = Number(appt?.totalAmount ?? 0) || 0;
  const platformFee = Number(appt?.platformFeeAmount ?? 0) || 0;
  const promoDiscount = Number(appt?.promoDiscount ?? 0) || 0;
  // Visit-type surcharge from the service definition (online/clinic/home/emergency).
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
  // Base = total − platform − visit fee + discount (the price before extras/discounts).
  const baseAmount = Math.max(0, total - platformFee - visitFee + promoDiscount);

  /* ── Calendar links ────────────────────────────────────────────── */
  const calendarTitle = `GoldenLife — ${serviceName} with ${providerName}`;
  const calendarLocation =
    appt?.visitType === "online"
      ? meetingLink || "Online"
      : locationLine || "";
  const calendarDescription = [
    `Service: ${serviceName}`,
    `Practitioner: ${providerName}`,
    `Visit type: ${visitTypeLabel}`,
    appt?.appointmentNumber ? `Reference: ${appt.appointmentNumber}` : "",
    appt?.notes ? `Notes: ${appt.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const googleCalUrl = appt
    ? buildGoogleCalendarUrl({
        title: calendarTitle,
        date: appt.date,
        startTime: appt.startTime,
        endTime: appt.endTime,
        location: calendarLocation,
        details: calendarDescription,
      })
    : "";

  const handleDownloadIcs = () => {
    if (!appt) return;
    const ics = buildIcsContent({
      uid: appt.id,
      title: calendarTitle,
      date: appt.date,
      startTime: appt.startTime,
      endTime: appt.endTime,
      location: calendarLocation,
      description: calendarDescription,
    });
    downloadIcs(`appointment-${appt.appointmentNumber || appt.id}.ics`, ics);
  };

  const copyAppointmentId = async () => {
    const text = appt?.appointmentNumber || appt?.id || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  /* ── Loading / error / invalid states ──────────────────────────── */

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
          <Skeleton className="h-32 w-full mb-6" />
          <Skeleton className="h-64 w-full mb-4" />
          <Skeleton className="h-48 w-full" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!appointmentId || isError || !appt) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-12 max-w-2xl">
          <Card>
            <CardContent className="pt-8 pb-8 text-center space-y-4">
              <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-7 w-7 text-destructive" />
              </div>
              <h1 className="text-2xl font-semibold" data-testid="text-confirmation-error-title">
                {appointmentId ? "Booking not found" : "Invalid booking link"}
              </h1>
              <p className="text-muted-foreground">
                {(error as any)?.message ||
                  "We couldn't load this appointment. It may have been removed or you don't have access."}
              </p>
              <div className="flex justify-center gap-2 pt-2">
                <Button asChild data-testid="button-go-appointments">
                  <Link href="/appointments">Go to my appointments</Link>
                </Button>
                <Button variant="outline" asChild data-testid="button-go-home">
                  <Link href="/">Home</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  const isCancelled = ["cancelled", "rejected"].includes(appt.status);
  const canCancel = !isCancelled && appt.status !== "completed";
  const canReschedule = canCancel;

  /* ── Render ────────────────────────────────────────────────────── */

  const VisitIcon = visitIcon;

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        {/* Success header */}
        <Card
          className="mb-6 border-emerald-200 dark:border-emerald-900 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/40 dark:to-background"
          data-testid="card-confirmation-success"
        >
          <CardContent className="pt-8 pb-6 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-1" data-testid="text-confirmation-heading">
              {appt.status === "confirmed"
                ? "Booking confirmed"
                : appt.status === "pending"
                  ? "Booking received"
                  : isCancelled
                    ? "Booking cancelled"
                    : "Booking submitted"}
            </h1>
            <p className="text-muted-foreground">
              {appt.status === "pending"
                ? "Your booking is awaiting provider approval. We'll let you know as soon as it's confirmed."
                : isCancelled
                  ? "This appointment is no longer active."
                  : "All set — see your appointment details below."}
            </p>

            {/* Appointment ID — copyable */}
            <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-background border px-4 py-2 shadow-sm">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Appointment ID
              </span>
              <span
                className="font-mono font-semibold text-primary text-sm"
                data-testid="text-appointment-number"
              >
                {appt.appointmentNumber || appt.id.slice(0, 8).toUpperCase()}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={copyAppointmentId}
                data-testid="button-copy-appointment-id"
                aria-label="Copy appointment ID"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>

            {/* Notification confirmation */}
            <div className="mt-4 flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1" data-testid="text-email-sent">
                <Mail className="h-3.5 w-3.5" /> Confirmation email sent
              </span>
              <span className="inline-flex items-center gap-1" data-testid="text-sms-sent">
                <MessageSquare className="h-3.5 w-3.5" /> SMS notification sent if enabled
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Details */}
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-2" data-testid="card-appointment-details">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <CardTitle>Appointment details</CardTitle>
                <Badge
                  variant={
                    appt.status === "confirmed"
                      ? "default"
                      : isCancelled
                        ? "destructive"
                        : "secondary"
                  }
                  data-testid="badge-status"
                  className="capitalize"
                >
                  {appt.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <DetailRow icon={UserIcon} label="Practitioner" value={providerName} testId="row-practitioner" />
              <DetailRow icon={FileText} label="Service" value={serviceName} testId="row-service" />
              <DetailRow icon={VisitIcon} label="Visit type" value={visitTypeLabel} testId="row-visit-type" />
              <DetailRow icon={CalendarIcon} label="Date" value={prettyDate} testId="row-date" />
              <DetailRow
                icon={Clock}
                label="Time"
                value={`${appt.startTime}${appt.endTime ? ` – ${appt.endTime}` : ""}`}
                testId="row-time"
              />
              {appt.visitType === "home" && locationLine && (
                <DetailRow icon={MapPin} label="Address" value={locationLine} testId="row-address" />
              )}
              {appt.visitType === "online" && (
                <DetailRow
                  icon={Video}
                  label="Meeting link"
                  testId="row-meeting-link"
                  value={
                    <a
                      href={meetingLink || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline break-all"
                      data-testid="link-meeting"
                    >
                      Join the call when it's time
                    </a>
                  }
                />
              )}
              {appt.notes && (
                <DetailRow icon={FileText} label="Notes" value={appt.notes} testId="row-notes" />
              )}

              {/* Map preview */}
              {hasMap && (
                <div className="pt-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    Visit location
                  </div>
                  <div
                    className="rounded-lg overflow-hidden border"
                    data-testid="map-preview"
                  >
                    <iframe
                      title="Visit location"
                      width="100%"
                      height="240"
                      frameBorder="0"
                      scrolling="no"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng! - 0.005}%2C${lat! - 0.003}%2C${lng! + 0.005}%2C${lat! + 0.003}&layer=mapnik&marker=${lat}%2C${lng}`}
                    />
                  </div>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline mt-1 inline-block"
                    data-testid="link-open-map"
                  >
                    Open larger map →
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pricing summary */}
          <Card data-testid="card-pricing">
            <CardHeader>
              <CardTitle className="text-base">Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <PriceRow label="Base price" value={fmtMoney(baseAmount)} testId="price-base" />
              {visitFee > 0 && (
                <PriceRow label="Visit fee" value={fmtMoney(visitFee)} testId="price-visit-fee" />
              )}
              {platformFee > 0 && (
                <PriceRow
                  label="Platform fee"
                  value={fmtMoney(platformFee)}
                  testId="price-platform-fee"
                />
              )}
              {promoDiscount > 0 && (
                <PriceRow
                  label={`Discount${appt.promoCode ? ` (${appt.promoCode})` : ""}`}
                  value={`−${fmtMoney(promoDiscount)}`}
                  positive
                  testId="price-discount"
                />
              )}
              <Separator className="my-2" />
              <div className="flex justify-between font-bold text-base">
                <span>Total</span>
                <span data-testid="price-total">{fmtMoney(total)}</span>
              </div>
              {appt.paymentStatus && (
                <div className="pt-2">
                  <Badge
                    variant={appt.paymentStatus === "completed" ? "default" : "secondary"}
                    className="capitalize"
                    data-testid="badge-payment-status"
                  >
                    Payment: {appt.paymentStatus}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Calendar integration */}
        <Card className="mt-6" data-testid="card-calendar">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarPlus className="h-4 w-4" /> Add to calendar
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline" data-testid="button-google-calendar">
              <a href={googleCalUrl} target="_blank" rel="noopener noreferrer">
                <CalendarPlus className="h-4 w-4 mr-2" /> Google Calendar
              </a>
            </Button>
            <Button variant="outline" onClick={handleDownloadIcs} data-testid="button-download-ics">
              <Download className="h-4 w-4 mr-2" /> Download .ics
            </Button>
          </CardContent>
        </Card>

        {/* Actions */}
        <Card className="mt-6" data-testid="card-actions">
          <CardContent className="pt-6 flex flex-wrap gap-2">
            <Button asChild data-testid="button-view-appointment">
              <Link href={`/appointments/${appt.id}`}>
                View appointment <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
            {canReschedule && (
              <Button
                variant="outline"
                onClick={() => setActionTarget("reschedule")}
                data-testid="button-reschedule"
              >
                <RefreshCw className="h-4 w-4 mr-2" /> Reschedule
              </Button>
            )}
            {canCancel && (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setActionTarget("cancel")}
                data-testid="button-cancel-appointment"
              >
                <X className="h-4 w-4 mr-2" /> Cancel
              </Button>
            )}
            <Button asChild variant="outline" data-testid="button-download-invoice">
              <a
                href={`/api/invoices/by-appointment/${appt.id}/download`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="h-4 w-4 mr-2" /> Download invoice
              </a>
            </Button>
          </CardContent>
        </Card>
      </main>
      <Footer />

      <AppointmentActionDialog
        appointmentId={appointmentId ?? null}
        action={actionTarget ?? "cancel"}
        open={!!actionTarget}
        onOpenChange={(open) => !open && setActionTarget(null)}
        invalidateKeys={[
          ["/api/appointments", appointmentId],
          ["/api/appointments/patient"],
        ]}
      />
    </div>
  );
}

/* ── Small presentational helpers ─────────────────────────────────── */

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
  positive,
  testId,
}: {
  label: string;
  value: string;
  positive?: boolean;
  testId?: string;
}) {
  return (
    <div
      className={`flex justify-between ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
      data-testid={testId}
    >
      <span>{label}</span>
      <span className={`font-medium ${positive ? "" : "text-foreground"}`}>{value}</span>
    </div>
  );
}
