import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { NewTicketDialog } from "@/components/new-ticket-dialog";
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
import { useCurrency } from "@/lib/currency";
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
} from "lucide-react";
import type { AppointmentWithDetails, Prescription, MedicalHistory, ProviderWithUser } from "@shared/schema";
import { ProviderCard } from "@/components/provider-card";
import { Heart, RefreshCw, Activity } from "lucide-react";
import { HealthMetricsTab } from "@/components/health-metrics-tab";
import { FamilyMembersTab } from "@/components/family-members-tab";
import { MedicationsTab } from "@/components/medications-tab";
import { AppointmentActionDialog, type AppointmentAction } from "@/components/appointment/AppointmentActionDialog";

const PrescriptionList = ({ patientId }: { patientId?: string }) => {
  const { t } = useTranslation();
  const { data: prescriptions, isLoading } = useQuery<Prescription[]>({
    queryKey: [`/api/prescriptions/patient/${patientId}`],
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
    queryKey: [`/api/medical-history/patient/${patientId}`],
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
            <p className="text-xs text-muted-foreground">{new Date(h.date).toLocaleDateString()}</p>
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
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { format: fmtMoney } = useCurrency();

  const [activeTab, setActiveTab] = useState<string>("upcoming");
  const [newTicketOpen, setNewTicketOpen] = useState(false);

  const { data: appointments, isLoading } = useQuery<AppointmentWithDetails[]>({
    queryKey: ["/api/appointments/patient"],
    enabled: !!user,
  });

  // Fire-and-forget cleanup of stale appointments — runs once after the dashboard
  // mounts, not as part of the appointments fetch. Refreshes the list when done.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiRequest("POST", "/api/appointments/cleanup", {})
      .then(async (res) => {
        if (cancelled) return;
        try {
          const body = await res.json();
          if (body && typeof body.cancelledCount === "number" && body.cancelledCount > 0) {
            queryClient.invalidateQueries({ queryKey: ["/api/appointments/patient"] });
          }
        } catch {
          // ignore parse errors
        }
      })
      .catch(() => {
        // ignore — cleanup is best-effort
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const { data: invoices, isLoading: isLoadingInvoices } = useQuery<any[]>({
    queryKey: ["/api/invoices/me"],
    enabled: !!user && activeTab === "invoices",
  });

  const { data: savedProviders, isLoading: isLoadingSaved } = useQuery<ProviderWithUser[]>({
    queryKey: ["/api/saved-providers"],
    enabled: user?.role === "patient" && activeTab === "saved",
  });

  const generateInvoiceMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const res = await apiRequest("POST", `/api/invoices/generate/${appointmentId}`, {});
      return res.json();
    },
    onSuccess: (data: any, appointmentId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/patient"] });
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

  const [searchQuery, setSearchQuery] = useState("");
  const [visitTypeFilter, setVisitTypeFilter] = useState<string>("all");

  const upcomingAppointments = appointments?.filter(
    (a) =>
      a.status === "pending" ||
      a.status === "approved" ||
      a.status === "confirmed" ||
      a.status === "rescheduled"
  ) || [];

  const completedAppointments = appointments?.filter((a) => a.status === "completed") || [];
  const cancelledAppointments = appointments?.filter(
    (a) => a.status === "cancelled" || a.status === "rejected"
  ) || [];
  const pastAppointments = [...completedAppointments, ...cancelledAppointments];

  const filterList = (list: AppointmentWithDetails[]) => {
    return list.filter((a) => {
      const q = searchQuery.trim().toLowerCase();
      const providerName = `${a.provider?.user?.firstName || ""} ${a.provider?.user?.lastName || ""}`.toLowerCase();
      const matchesSearch =
        !q ||
        providerName.includes(q) ||
        (a.service?.name?.toLowerCase().includes(q) ?? false) ||
        (a.id?.toLowerCase().includes(q) ?? false);
      const matchesVisit = visitTypeFilter === "all" || a.visitType === visitTypeFilter;
      return matchesSearch && matchesVisit;
    });
  };

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
      case "approved":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "confirmed":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "in_progress":
        return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      case "completed":
        return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
      case "rejected":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      case "cancelled":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      case "rescheduled":
        return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
      case "expired":
        return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
      case "no_show":
        return "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const AppointmentCard = ({ appointment }: { appointment: AppointmentWithDetails }) => (
    <Card className="hover-elevate" data-testid={`appointment-${appointment.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-12 w-12">
            <AvatarImage src={appointment.provider?.user?.avatarUrl || undefined} />
            <AvatarFallback className="bg-primary text-primary-foreground">
              {appointment.provider?.user?.firstName?.charAt(0)}
              {appointment.provider?.user?.lastName?.charAt(0)}
            </AvatarFallback>
          </Avatar>

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
              <Badge className={getStatusColor(appointment.status)}>
                {appointment.status === "pending"
                  ? t("status.awaiting_approval", "Awaiting Approval")
                  : appointment.status === "approved"
                  ? t("status.approved", "Approved")
                  : appointment.status === "confirmed"
                  ? t("status.confirmed", "Confirmed")
                  : appointment.status === "in_progress"
                  ? t("status.in_progress", "In Progress")
                  : appointment.status === "completed"
                  ? t("status.completed", "Completed")
                  : appointment.status === "rejected"
                  ? t("status.rejected", "Rejected")
                  : appointment.status === "cancelled" || appointment.status === "cancelled_by_patient" || appointment.status === "cancelled_by_provider"
                  ? t("status.cancelled", "Cancelled")
                  : appointment.status === "rescheduled"
                  ? t("status.rescheduled", "Rescheduled")
                  : appointment.status === "no_show"
                  ? t("status.no_show", "No Show")
                  : appointment.status}
              </Badge>
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
            </div>

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

            {appointment.status === "completed" && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/review/${appointment.id}`}>
                    <Star className="h-4 w-4 mr-1" />
                    {t("dashboard.leave_review")}
                  </Link>
                </Button>
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
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
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
                    <Button asChild>
                      <Link href={`/appointments?id=${nextAppointment.id}`}>
                        {t("dashboard.view_details")}
                        <ChevronRight className="h-4 w-4 ml-2" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="stat-card stat-blue" data-testid="stat-upcoming">
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

            <Card className="stat-card stat-emerald" data-testid="stat-completed">
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

            <Card className="stat-card stat-violet" data-testid="stat-messages">
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

          <div className="flex justify-end mb-4 gap-2">
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

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="tabs-colorful flex flex-nowrap h-auto w-full overflow-x-auto whitespace-nowrap">
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
              <Link href="/wallet">
                <Button variant="ghost" size="sm" className="ml-1" data-testid="link-wallet">
                  {t("dashboard.wallet", "Wallet")}
                </Button>
              </Link>
            </TabsList>

            <div className="mt-6 mb-4 flex flex-col sm:flex-row gap-3">
              <Input
                placeholder={t("dashboard.search_appointments_patient", "Search by provider, service, or ID...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
                data-testid="input-search-appointments"
              />
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
                <Card>
                  <CardContent className="p-12 text-center">
                    <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="font-semibold text-lg mb-2">{t("patient_dashboard.empty_upcoming_title", "No upcoming appointments")}</h3>
                    <p className="text-muted-foreground mb-4">
                      {t("patient_dashboard.empty_upcoming_desc", "Book an appointment with a healthcare provider")}
                    </p>
                    <Button asChild>
                      <Link href="/providers">{t("patient_dashboard.find_providers_btn", "Find Providers")}</Link>
                    </Button>
                  </CardContent>
                </Card>
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
                <Card>
                  <CardContent className="p-12 text-center text-muted-foreground" data-testid="empty-completed">
                    {t("patient_dashboard.empty_completed", "No completed appointments match your filters")}
                  </CardContent>
                </Card>
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
                <Card>
                  <CardContent className="p-12 text-center text-muted-foreground" data-testid="empty-cancelled">
                    {t("patient_dashboard.empty_cancelled", "No cancelled or rejected appointments")}
                  </CardContent>
                </Card>
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
                <Card>
                  <CardContent className="p-12 text-center">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="font-semibold text-lg mb-2">{t("patient_dashboard.empty_past_title", "No past appointments")}</h3>
                    <p className="text-muted-foreground">
                      {t("patient_dashboard.empty_past_desc", "Your completed appointments will appear here")}
                    </p>
                  </CardContent>
                </Card>
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
                                {inv.issueDate ? new Date(inv.issueDate).toLocaleDateString() : "—"}
                                {inv.dueDate ? ` • ${t("patient_dashboard.due_label", "Due")} ${new Date(inv.dueDate).toLocaleDateString()}` : ""}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <p className="font-semibold">{fmtMoney(inv.totalAmount)}</p>
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
                  {payment.createdAt ? new Date(payment.createdAt).toLocaleDateString() : 'N/A'} • {
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
          </Tabs>
        </div>
      </main>

      <Footer />

      <AppointmentActionDialog
        appointmentId={actionTarget?.id ?? null}
        action={actionTarget?.action ?? "cancel"}
        open={!!actionTarget}
        onOpenChange={(open) => !open && setActionTarget(null)}
        invalidateKeys={[["/api/appointments/patient"]]}
      />
    </div>
  );
}
