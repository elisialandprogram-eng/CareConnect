import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrency, formatInCurrency } from "@/lib/currency";
import { useAuth } from "@/lib/auth";
import type { AppointmentWithDetails } from "@shared/schema";
import { AppointmentActionDialog, type AppointmentAction } from "@/components/appointment/AppointmentActionDialog";
import { AvatarSM } from "@/components/ui/provider-image";
import { StatusBadge } from "@/components/ui/status-badge";
import { AppointmentTimeContext } from "@/components/appointment/AppointmentTimeContext";
import { AppointmentTimeline } from "@/components/appointment/AppointmentTimeline";
import { SmartEmptyState } from "@/components/appointment/SmartEmptyState";
import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Clock, Home, Video, Building2, CreditCard, Banknote, Bitcoin, FileText, CheckCircle, CheckCircle2,
  Download, Navigation, MapPin, Loader2, X, Star, CalendarDays, CalendarClock, MessageSquare,
  CalendarIcon, ChevronLeft, ChevronRight, Stethoscope,
} from "lucide-react";
import { ClinicalWorkspacePanel } from "@/components/provider/ClinicalWorkspacePanel";

function AppointmentsListSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-24 rounded-lg" />
      ))}
    </div>
  );
}

function CopyApptNumber({ apptNumber, apptId }: { apptNumber: string; apptId: string }) {
  const { toast } = useToast();
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(apptNumber).catch(() => {});
    toast({ title: "Copied", description: apptNumber, duration: 1500 });
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-xs font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded hover:bg-muted/80 transition-colors"
      data-testid={`copy-appt-number-${apptId}`}
    >
      {apptNumber}
    </button>
  );
}

export function ProviderAppointmentsTabs({ providerData, highlightApptId, activeTab }: { providerData: any; highlightApptId?: string | null; activeTab?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { format: fmtMoney } = useCurrency();
  const { user } = useAuth();

  const { data: appointments, isLoading: isLoadingAppointments } = useQuery<AppointmentWithDetails[]>({
    queryKey: ["/api/appointments/provider"],
    enabled: !!providerData?.id,
    staleTime: 30_000,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [visitTypeFilter, setVisitTypeFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedAppt, setSelectedAppt] = useState<AppointmentWithDetails | null>(null);
  const [privateNoteDraft, setPrivateNoteDraft] = useState("");
  const [clinicalWorkspaceAppt, setClinicalWorkspaceAppt] = useState<AppointmentWithDetails | null>(null);
  const [noteIsDirty, setNoteIsDirty] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ id: string; action: AppointmentAction } | null>(null);

  // PIN gate for "completed" status
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pendingCompleteId, setPendingCompleteId] = useState<string | null>(null);
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState("");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [calendarView, setCalendarView] = useState<"day" | "week" | "month">("day");

  const { data: selectedApptEvents } = useQuery<any[]>({
    queryKey: ["/api/appointments", selectedAppt?.id ?? "", "events"],
    enabled: !!(selectedAppt?.id),
  });

  // ── Private note auto-save ────────────────────────────────────────────────
  const LS_KEY = (id: string) => `gl_private_note_${id}`;

  const openApptDetails = (a: AppointmentWithDetails) => {
    setSelectedAppt(a);
    const cached = (() => { try { return localStorage.getItem(LS_KEY(a.id)); } catch { return null; } })();
    setPrivateNoteDraft(cached !== null ? cached : ((a as any).privateNote || ""));
    setNoteIsDirty(false);
  };

  // Persist draft on every keystroke
  useEffect(() => {
    if (!selectedAppt) return;
    try { localStorage.setItem(LS_KEY(selectedAppt.id), privateNoteDraft); } catch { }
  }, [privateNoteDraft, selectedAppt?.id]);

  // Scroll to and briefly pulse a highlighted appointment (from Overview jump)
  useEffect(() => {
    if (!highlightApptId) return;
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-testid="row-appointment-${highlightApptId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary", "ring-offset-2", "rounded-lg");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary", "ring-offset-2", "rounded-lg"), 2500);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [highlightApptId]);

  // beforeunload guard when there is an uncommitted draft
  const noteIsDirtyRef = useRef(false);
  noteIsDirtyRef.current = noteIsDirty;
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (noteIsDirtyRef.current) {
        e.preventDefault();
        e.returnValue = "You have unsaved clinical notes. Leave anyway?";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelected = () => setSelectedIds(new Set());

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, signOffCode }: { id: string; status: string; signOffCode?: string }) => {
      const body: Record<string, unknown> = { status };
      if (signOffCode) body.signOffCode = signOffCode;
      const response = await apiRequest("PATCH", `/api/appointments/${id}/status`, body);
      return response.json();
    },
    onSuccess: (data: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/provider"] });
      if (variables.status === "completed" && data?.invoice?.created) {
        toast({
          title: t("provider_dashboard.toast_appt_completed", "Appointment completed"),
          description: t("provider_dashboard.toast_appt_completed_desc", "Invoice {{invoiceNumber}} was generated and emailed to the patient.", { invoiceNumber: data.invoice.invoiceNumber }),
        });
      } else {
        toast({ title: t("provider_dashboard.toast_appt_updated", "Appointment updated") });
      }
    },
    onError: (error: any) => {
      toast({
        title: t("provider_dashboard.toast_failed_update_appt", "Failed to update appointment"),
        description: error?.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    },
  });

  const markPaymentMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "completed" }) => {
      const response = await apiRequest("PATCH", `/api/appointments/${id}/payment-status`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/provider"] });
      toast({ title: t("provider_dashboard.toast_payment_marked", "Payment marked as received") });
    },
    onError: (error: any) => {
      toast({
        title: t("provider_dashboard.toast_failed_payment", "Failed to update payment"),
        description: error?.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    },
  });

  const generateInvoiceMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const res = await apiRequest("POST", `/api/invoices/generate/${appointmentId}`, {});
      return res.json();
    },
    onSuccess: (data: any, appointmentId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/provider"] });
      toast({ title: t("provider_dashboard.invoice_ready_title", "Invoice ready"), description: t("provider_dashboard.invoice_ready_desc", "The invoice has been generated.") });
      const url = data?.invoice?.id ? `/api/invoices/${data.invoice.id}/download` : `/api/invoices/by-appointment/${appointmentId}/download`;
      window.open(url, "_blank", "noopener");
    },
    onError: (e: any) => {
      toast({ title: t("provider_dashboard.invoice_failed_title", "Could not generate invoice"), description: e?.message || t("provider_dashboard.invoice_failed_desc", "Please try again later."), variant: "destructive" });
    },
  });

  const bulkStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: "confirmed" | "rejected" | "cancelled" }) => {
      const results = await Promise.allSettled(ids.map((id) => apiRequest("PATCH", `/api/appointments/${id}/status`, { status })));
      const failed = results.filter((r) => r.status === "rejected").length;
      return { total: ids.length, failed };
    },
    onSuccess: ({ total, failed }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/provider"] });
      clearSelected();
      const ok = total - failed;
      if (failed === 0) {
        toast({ title: t("provider_dashboard.toast_bulk_done", "{{count}} appointments updated", { count: ok }) });
      } else {
        toast({ title: t("provider_dashboard.toast_bulk_partial", "Updated {{ok}} of {{total}}", { ok, total }), description: t("provider_dashboard.toast_bulk_some_failed", "Some updates failed. Please retry."), variant: "destructive" });
      }
    },
    onError: () => { toast({ title: t("provider_dashboard.toast_bulk_failed", "Bulk update failed"), variant: "destructive" }); },
  });

  const savePrivateNoteMutation = useMutation({
    mutationFn: async ({ id, privateNote }: { id: string; privateNote: string }) => {
      const res = await apiRequest("PATCH", `/api/appointments/${id}`, { privateNote });
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/provider"] });
      toast({ title: t("provider_dashboard.toast_note_saved", "Note saved") });
      setNoteIsDirty(false);
      try { localStorage.removeItem(LS_KEY(vars.id)); } catch { }
    },
  });

  const allAppts = appointments || [];
  const userTz = (user as any)?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: userTz }).format(new Date());

  const actionableStatuses = new Set(["pending", "approved", "confirmed", "rescheduled", "reschedule_requested", "reschedule_proposed"]);
  const terminalStatuses = new Set(["completed", "cancelled", "cancelled_by_patient", "cancelled_by_provider", "rejected", "expired", "no_show"]);

  const upcomingAppointments = allAppts.filter(a => actionableStatuses.has(a.status) && a.date > todayStr);
  const activeAppointments = allAppts.filter(a =>
    a.status === "in_progress" || (actionableStatuses.has(a.status) && a.date === todayStr)
  );
  const historyAppointments = allAppts.filter(a =>
    terminalStatuses.has(a.status) ||
    (actionableStatuses.has(a.status) && a.date < todayStr)
  );

  const sortByDateAsc = (list: AppointmentWithDetails[]) =>
    [...list].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const sortByDateDesc = (list: AppointmentWithDetails[]) =>
    [...list].sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));

  const filterAppointments = (list: AppointmentWithDetails[]) => {
    let result = list;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a => {
        const name = `${a.patient?.firstName ?? ""} ${a.patient?.lastName ?? ""}`.toLowerCase();
        const svc = ((a as any).service?.name ?? "").toLowerCase();
        const num = ((a as any).appointmentNumber ?? "").toLowerCase();
        return name.includes(q) || svc.includes(q) || num.includes(q);
      });
    }
    if (statusFilter !== "all") result = result.filter(a => a.status === statusFilter);
    if (visitTypeFilter !== "all") result = result.filter(a => a.visitType === visitTypeFilter);
    return result;
  };

  const exportAppointmentsCSV = (list: AppointmentWithDetails[]) => {
    const headers = ["id", "date", "startTime", "endTime", "client", "service", "visitType", "status", "totalAmount", "paymentStatus", "paymentMethod"];
    const escape = (v: any) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = list.map((a: any) => [a.id, a.date, a.startTime, a.endTime || "", `${a.patient?.firstName || ""} ${a.patient?.lastName || ""}`.trim(), a.service?.name || "", a.visitType, a.status, a.totalAmount || "", a.payment?.status || "", a.payment?.paymentMethod || ""]);
    const csv = [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `appointments-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: t("provider_dashboard.toast_exported", "Exported {{count}} appointments", { count: list.length }) });
  };

  const AppointmentRow = ({ appointment }: { appointment: AppointmentWithDetails }) => {
    const a: any = appointment;
    const lat = a.patientLatitude;
    const lng = a.patientLongitude;
    const hasCoords = typeof lat === "number" && typeof lng === "number";
    const directionsUrl = hasCoords
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      : a.patientAddress
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a.patientAddress)}`
      : null;
    const isHomeVisit = appointment.visitType === "home";
    const payment = (appointment as any).payment;
    const paymentMethod = payment?.paymentMethod as string | undefined;
    const paymentStatus = payment?.status as string | undefined;
    const PaymentIcon = paymentMethod === "card" ? CreditCard : paymentMethod === "bank_transfer" ? Building2 : paymentMethod === "crypto" ? Bitcoin : Banknote;
    const isFinal = ["completed", "cancelled", "cancelled_by_patient", "cancelled_by_provider", "rejected", "no_show", "expired"].includes(appointment.status);
    const isPending = appointment.status === "pending";
    const isApproved = appointment.status === "approved";
    const isConfirmed = appointment.status === "confirmed" || appointment.status === "rescheduled";
    const isInProgress = appointment.status === "in_progress";
    // Row left-border accent: communicates status + urgency at a glance
    const rowAccentClass = isInProgress
      ? "border-l-[3px] border-l-blue-400 dark:border-l-blue-500"
      : appointment.status === "completed"
        ? "border-l-[3px] border-l-muted-foreground/30"
        : isFinal
          ? "border-l-[3px] border-l-destructive/50"
          : (() => {
              try {
                const ms = new Date(`${appointment.date}T${appointment.startTime}:00`).getTime() - Date.now();
                const m  = ms / 60_000;
                if (m <= 0)  return "border-l-[3px] border-l-orange-500 dark:border-l-orange-400";
                if (m <= 10) return "border-l-[3px] border-l-orange-400 dark:border-l-orange-500";
                if (m <= 30) return "border-l-[3px] border-l-amber-400 dark:border-l-amber-500";
                return "border-l-[3px] border-l-emerald-400 dark:border-l-emerald-500";
              } catch { return "border-l-[3px] border-l-emerald-400"; }
            })();
    const canMarkPaid = paymentStatus === "pending" && !["cancelled", "cancelled_by_patient", "cancelled_by_provider", "rejected", "no_show", "expired"].includes(appointment.status);
    const isUpdating = updateStatusMutation.isPending && updateStatusMutation.variables?.id === appointment.id;
    const isMarkingPaid = markPaymentMutation.isPending && markPaymentMutation.variables?.id === appointment.id;

    const PROVIDER_STATUS_TRANSITIONS: Record<string, { value: string; label: string }[]> = {
      pending: [{ value: "approved", label: t("status.approved", "Approve") }, { value: "confirmed", label: t("status.confirmed", "Confirm") }, { value: "rejected", label: t("status.rejected", "Reject") }],
      approved: [{ value: "confirmed", label: t("status.confirmed", "Confirm") }, { value: "in_progress", label: t("status.in_progress", "Start") }, { value: "rejected", label: t("status.rejected", "Reject") }],
      confirmed: [{ value: "in_progress", label: t("status.in_progress", "Start") }, { value: "completed", label: t("status.completed", "Complete") }],
      in_progress: [{ value: "completed", label: t("status.completed", "Complete") }],
      rescheduled: [{ value: "confirmed", label: t("status.confirmed", "Confirm") }, { value: "in_progress", label: t("status.in_progress", "Start") }],
      reschedule_requested: [{ value: "confirmed", label: t("status.confirmed", "Confirm") }],
      reschedule_proposed: [],
    };
    const statusOptions = PROVIDER_STATUS_TRANSITIONS[appointment.status] ?? [];

    return (
      <div
        className={`flex flex-col gap-3 p-4 border rounded-lg hover-elevate cursor-pointer ${rowAccentClass}`}
        data-testid={`row-appointment-${appointment.id}`}
        onClick={() => openApptDetails(appointment)}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <AvatarSM
              src={appointment.patient?.avatarUrl}
              name={`${appointment.patient?.firstName ?? ""} ${appointment.patient?.lastName ?? ""}`.trim()}
            />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium">{appointment.patient?.firstName} {appointment.patient?.lastName}</p>
                {a.appointmentNumber && <CopyApptNumber apptNumber={a.appointmentNumber} apptId={appointment.id} />}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {appointment.startTime}</span>
                <span className="flex items-center gap-1 capitalize">
                  {isHomeVisit ? <Home className="h-3 w-3" /> : <Video className="h-3 w-3" />}
                  {appointment.visitType}
                </span>
                {payment && (
                  <span className="flex items-center gap-1">
                    <PaymentIcon className="h-3 w-3" />
                    <span className="capitalize">{paymentMethod?.replace("_", " ") || "cash"}</span>
                    <span>•</span>
                    <span className="capitalize">{paymentStatus}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <StatusBadge status={appointment.status} data-testid={`badge-status-${appointment.id}`} />
            </div>
            <AppointmentTimeContext
              date={appointment.date}
              startTime={appointment.startTime}
              startAtUtc={(appointment as any).startAt}
              status={appointment.status}
              className="text-muted-foreground"
              showIcon={true}
            />
            {statusOptions.length > 0 && (
              <Select value="" onValueChange={(v) => updateStatusMutation.mutate({ id: appointment.id, status: v })} disabled={isUpdating}>
                <SelectTrigger className="h-8 w-[150px]" data-testid={`select-status-${appointment.id}`}>
                  <SelectValue placeholder={t("provider_dashboard.change_status", "Change status")} />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {(a.patientAddress || hasCoords) && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pl-14 text-sm">
            <div className="flex items-start gap-2 text-muted-foreground min-w-0">
              <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="truncate" data-testid={`text-address-${appointment.id}`}>
                {a.patientAddress || `${lat?.toFixed(5)}, ${lng?.toFixed(5)}`}
              </span>
            </div>
            {directionsUrl && (
              <a href={directionsUrl} target="_blank" rel="noopener noreferrer" data-testid={`button-directions-${appointment.id}`}>
                <Button size="sm" variant="outline">
                  <Navigation className="h-3 w-3 mr-1" />{t("provider.get_directions", "Get Directions")}
                </Button>
              </a>
            )}
          </div>
        )}

        {!isFinal && (
          <div className="flex flex-wrap items-center gap-2 pl-14 pt-1" onClick={(e) => e.stopPropagation()}>
            {isPending && (
              <>
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" disabled={isUpdating}
                  onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: "confirmed" })}
                  data-testid={`button-approve-${appointment.id}`}>
                  {isUpdating && updateStatusMutation.variables?.status === "confirmed" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                  {t("dashboard.approve", "Approve")}
                </Button>
                <Button size="sm" variant="destructive" disabled={isUpdating}
                  onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: "rejected" })}
                  data-testid={`button-reject-${appointment.id}`}>
                  {isUpdating && updateStatusMutation.variables?.status === "rejected" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <X className="h-3 w-3 mr-1" />}
                  {t("dashboard.reject", "Reject")}
                </Button>
              </>
            )}
            {isConfirmed && (
              <Button size="sm" disabled={isUpdating}
                onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: "in_progress" })}
                data-testid={`button-start-${appointment.id}`}>
                {isUpdating && updateStatusMutation.variables?.status === "in_progress" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Clock className="h-3 w-3 mr-1" />}
                {t("dashboard.start_visit", "Start Visit")}
              </Button>
            )}
            {isInProgress && (
              <Button size="sm" disabled={isUpdating}
                onClick={() => { setPendingCompleteId(appointment.id); setPinValue(""); setPinError(""); setPinDialogOpen(true); }}
                data-testid={`button-complete-${appointment.id}`}>
                {isUpdating && updateStatusMutation.variables?.status === "completed" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                {t("dashboard.mark_completed", "Mark Completed")}
              </Button>
            )}
            {(isApproved || isConfirmed) && (
              <>
                <Button size="sm" variant="outline"
                  onClick={() => setActionTarget({ id: appointment.id, action: "propose" })}
                  data-testid={`button-propose-${appointment.id}`}>
                  <CalendarDays className="h-3 w-3 mr-1" />{t("provider_dashboard.propose_time_btn", "Propose New Time")}
                </Button>
                <Button size="sm" variant="outline"
                  onClick={() => setActionTarget({ id: appointment.id, action: "no_show" })}
                  data-testid={`button-no-show-${appointment.id}`}>
                  <X className="h-3 w-3 mr-1" />{t("dashboard.no_show", "No Show")}
                </Button>
                <Button size="sm" variant="outline"
                  onClick={() => setActionTarget({ id: appointment.id, action: "cancel" })}
                  data-testid={`button-cancel-${appointment.id}`}>
                  <X className="h-3 w-3 mr-1" />{t("dashboard.cancel", "Cancel")}
                </Button>
              </>
            )}
          </div>
        )}

        {(canMarkPaid || appointment.status === "completed") && (
          <div className="flex flex-wrap items-center gap-2 pl-14 pt-1" onClick={(e) => e.stopPropagation()}>
            {canMarkPaid && (
              <Button size="sm" variant="secondary" disabled={isMarkingPaid}
                onClick={() => markPaymentMutation.mutate({ id: appointment.id, status: "completed" })}
                data-testid={`button-mark-paid-${appointment.id}`}>
                {isMarkingPaid ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Banknote className="h-3 w-3 mr-1" />}
                {t("dashboard.mark_payment_received", "Mark payment received")}
              </Button>
            )}
            {appointment.status === "completed" && (
              (appointment as any).invoiceGenerated ? (
                <Button size="sm" variant="outline" asChild data-testid={`button-download-invoice-${appointment.id}`}>
                  <a href={`/api/invoices/by-appointment/${appointment.id}/download`} target="_blank" rel="noreferrer">
                    <FileText className="h-3 w-3 mr-1" />{t("provider_dashboard.download_invoice", "Download invoice")}
                  </a>
                </Button>
              ) : (
                <Button size="sm" variant="outline"
                  disabled={generateInvoiceMutation.isPending && generateInvoiceMutation.variables === appointment.id}
                  onClick={() => generateInvoiceMutation.mutate(appointment.id)}
                  data-testid={`button-generate-invoice-${appointment.id}`}>
                  {generateInvoiceMutation.isPending && generateInvoiceMutation.variables === appointment.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FileText className="h-3 w-3 mr-1" />}
                  {t("provider_dashboard.generate_invoice", "Generate invoice")}
                </Button>
              )
            )}
          </div>
        )}
      </div>
    );
  };

  const todayAppointments = allAppts.filter(a => a.date === todayStr && !terminalStatuses.has(a.status));

  const appointmentTabs = new Set(["upcoming", "active", "history"]);
  const showFilterBar = !activeTab || appointmentTabs.has(activeTab);

  return (
    <>
      {/* Filter bar — only shown on appointment tabs */}
      {showFilterBar && (
        <>
          <div className="mt-6 mb-4 flex flex-col sm:flex-row gap-3">
            <Input
              placeholder={t("provider_dashboard.search_placeholder", "Search by client name, service, or ID...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
              data-testid="input-search-appointments"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-status-filter">
                <SelectValue placeholder={t("provider_dashboard.status", "Status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("provider_dashboard.all_statuses", "All Statuses")}</SelectItem>
                <SelectItem value="pending">{t("provider_dashboard.status_pending", "Pending")}</SelectItem>
                <SelectItem value="approved">{t("provider_dashboard.status_approved", "Approved")}</SelectItem>
                <SelectItem value="confirmed">{t("provider_dashboard.status_confirmed", "Confirmed")}</SelectItem>
                <SelectItem value="rescheduled">{t("provider_dashboard.status_rescheduled", "Rescheduled")}</SelectItem>
                <SelectItem value="completed">{t("provider_dashboard.status_completed", "Completed")}</SelectItem>
                <SelectItem value="cancelled">{t("provider_dashboard.status_cancelled", "Cancelled")}</SelectItem>
                <SelectItem value="rejected">{t("provider_dashboard.status_rejected", "Rejected")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={visitTypeFilter} onValueChange={setVisitTypeFilter}>
              <SelectTrigger className="w-full sm:w-[160px]" data-testid="select-visit-filter">
                <SelectValue placeholder={t("provider_dashboard.visit_type", "Visit Type")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("provider_dashboard.all_types", "All Types")}</SelectItem>
                <SelectItem value="online">{t("provider_dashboard.type_online", "Online")}</SelectItem>
                <SelectItem value="home">{t("provider_dashboard.type_home", "Home Visit")}</SelectItem>
                <SelectItem value="clinic">{t("provider_dashboard.type_clinic", "Clinic")}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => exportAppointmentsCSV(filterAppointments(allAppts))} data-testid="button-export-csv">
              <Download className="h-4 w-4 mr-2" /> {t("provider_dashboard.export_csv", "Export CSV")}
            </Button>
          </div>
          {(searchQuery.trim() || statusFilter !== "all" || visitTypeFilter !== "all") && (
            <p className="text-xs text-muted-foreground mb-3" data-testid="text-filter-count">
              Showing <span className="font-semibold text-foreground">{filterAppointments(allAppts).length}</span> of {allAppts.length} appointments
              {searchQuery.trim() && <> matching "<span className="font-semibold text-foreground">{searchQuery.trim()}</span>"</>}
            </p>
          )}
        </>
      )}

      <TabsContent value="upcoming" className="mt-2 space-y-3">
        {/* Today's Schedule — only shown in the Upcoming tab */}
        {todayAppointments.length > 0 && (
          <Card className="mb-4 border-primary/30 bg-primary/5" data-testid="card-today-section">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarIcon className="h-5 w-5 text-primary" />
                {t("provider_dashboard.todays_schedule", "Today's Schedule")}
                <Badge variant="secondary" className="ml-auto">{todayAppointments.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sortByDateAsc(todayAppointments).map((a) => (
                <AppointmentRow key={a.id} appointment={a} />
              ))}
            </CardContent>
          </Card>
        )}
        {(() => {
          const list = sortByDateAsc(filterAppointments(upcomingAppointments));
          const pendingList = list.filter((a) => a.status === "pending");
          const allPendingSelected = pendingList.length > 0 && pendingList.every((a) => selectedIds.has(a.id));
          const selectedPendingIds = pendingList.filter((a) => selectedIds.has(a.id)).map((a) => a.id);
          const isBulking = bulkStatusMutation.isPending;
          return list.length > 0 ? (
            <>
              {pendingList.length > 0 && (
                <div className="rounded-xl border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 p-4 mb-1" data-testid="action-required-inbox">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-7 w-7 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
                      <Clock className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
                        {t("provider_dashboard.action_required_title", "Action Required — {{count}} appointment request{{s}} awaiting your approval", { count: pendingList.length, s: pendingList.length !== 1 ? "s" : "" })}
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        {t("provider_dashboard.action_required_desc", "Patients are waiting. Approve or reject each request below.")}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {pendingList.map((a) => {
                      const patientName = `${a.patient?.firstName ?? ""} ${a.patient?.lastName ?? ""}`.trim() || "Patient";
                      const svcName = (a as any).service?.name || a.serviceId || "";
                      const isUpdatingThis = updateStatusMutation.isPending && (updateStatusMutation.variables as any)?.id === a.id;
                      return (
                        <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg bg-white dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-3 py-2" data-testid={`inbox-row-${a.id}`}>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{patientName}</span>
                              {(a as any).appointmentNumber && (
                                <span className="text-xs font-mono bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded">
                                  {(a as any).appointmentNumber}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{a.date} · {a.startTime}{svcName ? ` · ${svcName}` : ""}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-8 px-3 text-xs" disabled={isUpdatingThis}
                              onClick={() => updateStatusMutation.mutate({ id: a.id, status: "confirmed" })}
                              data-testid={`inbox-approve-${a.id}`}>
                              {isUpdatingThis && (updateStatusMutation.variables as any)?.status === "confirmed" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                              {t("dashboard.approve", "Approve")}
                            </Button>
                            <Button size="sm" variant="destructive" className="h-8 px-3 text-xs" disabled={isUpdatingThis}
                              onClick={() => updateStatusMutation.mutate({ id: a.id, status: "rejected" })}
                              data-testid={`inbox-reject-${a.id}`}>
                              {isUpdatingThis && (updateStatusMutation.variables as any)?.status === "rejected" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <X className="h-3 w-3 mr-1" />}
                              {t("dashboard.reject", "Reject")}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {pendingList.length >= 2 && (
                    <div className="flex items-center gap-2 pt-3 mt-3 border-t border-amber-200 dark:border-amber-700/50 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Checkbox
                          checked={allPendingSelected}
                          onCheckedChange={(v) => {
                            if (v) pendingList.forEach(a => setSelectedIds(s => { const n = new Set(s); n.add(a.id); return n; }));
                            else clearSelected();
                          }}
                          data-testid="checkbox-select-all-pending"
                        />
                        <span className="text-xs text-amber-700 dark:text-amber-400">Select all pending ({pendingList.length})</span>
                      </div>
                      {selectedPendingIds.length > 0 && (
                        <>
                          <Badge variant="secondary" className="text-xs">{selectedPendingIds.length} selected</Badge>
                          <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white" disabled={isBulking}
                            onClick={() => bulkStatusMutation.mutate({ ids: selectedPendingIds, status: "confirmed" })}
                            data-testid="button-bulk-approve">
                            {isBulking && bulkStatusMutation.variables?.status === "confirmed" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                            {t("provider_dashboard.bulk_approve", "Approve selected")}
                          </Button>
                          <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={isBulking}
                            onClick={() => bulkStatusMutation.mutate({ ids: selectedPendingIds, status: "rejected" })}
                            data-testid="button-bulk-reject">
                            {isBulking && bulkStatusMutation.variables?.status === "rejected" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <X className="h-3 w-3 mr-1" />}
                            {t("provider_dashboard.bulk_reject", "Reject selected")}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={isBulking} onClick={clearSelected} data-testid="button-bulk-clear">
                            {t("provider_dashboard.bulk_clear", "Clear")}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
              {list.map((a) => (
                <div key={a.id} className="flex items-start gap-3">
                  {a.status === "pending" ? (
                    <div className="pt-6">
                      <Checkbox checked={selectedIds.has(a.id)} onCheckedChange={() => toggleSelected(a.id)} data-testid={`checkbox-select-${a.id}`} />
                    </div>
                  ) : <div className="w-4" />}
                  <div className="flex-1"><AppointmentRow appointment={a} /></div>
                </div>
              ))}
            </>
          ) : isLoadingAppointments ? (
            <AppointmentsListSkeleton />
          ) : (
            <SmartEmptyState
              context="provider_pending"
              hasFilter={!!(searchQuery.trim() || statusFilter !== "all" || visitTypeFilter !== "all")}
            />
          );
        })()}
      </TabsContent>

      <TabsContent value="active" className="mt-2 space-y-3">
        {(() => {
          const inProgressList = sortByDateAsc(filterAppointments(activeAppointments.filter(a => a.status === "in_progress")));
          const todayActionable = sortByDateAsc(filterAppointments(activeAppointments.filter(a => a.status !== "in_progress")));
          const pendingTodayList = todayActionable.filter(a => a.status === "pending");
          const allPendingSelected = pendingTodayList.length > 0 && pendingTodayList.every(a => selectedIds.has(a.id));
          const selectedPendingIds = pendingTodayList.filter(a => selectedIds.has(a.id)).map(a => a.id);
          const isBulking = bulkStatusMutation.isPending;
          const isEmpty = inProgressList.length === 0 && todayActionable.length === 0;
          if (isEmpty) {
            return isLoadingAppointments ? <AppointmentsListSkeleton /> : (
              <SmartEmptyState
                context="provider_today"
                hasFilter={!!(searchQuery.trim() || visitTypeFilter !== "all")}
              />
            );
          }
          return (
            <>
              {inProgressList.length > 0 && (
                <div className="rounded-xl border-2 border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-950/30 p-4 mb-1" data-testid="in-progress-section">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-7 w-7 rounded-full bg-green-500 flex items-center justify-center shrink-0 animate-pulse">
                      <span className="h-3 w-3 rounded-full bg-white" />
                    </div>
                    <p className="font-semibold text-green-800 dark:text-green-300 text-sm">
                      {t("provider_dashboard.in_progress_title", "In Progress — {{count}} active session{{s}}", { count: inProgressList.length, s: inProgressList.length !== 1 ? "s" : "" })}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {inProgressList.map(a => <AppointmentRow key={a.id} appointment={a} />)}
                  </div>
                </div>
              )}
              {pendingTodayList.length > 0 && (
                <div className="rounded-xl border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 p-4 mb-1" data-testid="action-required-today-inbox">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-7 w-7 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
                      <Clock className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
                        {t("provider_dashboard.action_required_today_title", "Action Required — {{count}} today's request{{s}} awaiting approval", { count: pendingTodayList.length, s: pendingTodayList.length !== 1 ? "s" : "" })}
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        {t("provider_dashboard.action_required_today_desc", "These clients have bookings today and need your confirmation.")}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {pendingTodayList.map(a => {
                      const patientName = `${a.patient?.firstName ?? ""} ${a.patient?.lastName ?? ""}`.trim() || "Patient";
                      const svcName = (a as any).service?.name || a.serviceId || "";
                      const isUpdatingThis = updateStatusMutation.isPending && (updateStatusMutation.variables as any)?.id === a.id;
                      return (
                        <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg bg-white dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-3 py-2" data-testid={`inbox-today-row-${a.id}`}>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{patientName}</span>
                              {(a as any).appointmentNumber && (
                                <span className="text-xs font-mono bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded">{(a as any).appointmentNumber}</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{a.date} · {a.startTime}{svcName ? ` · ${svcName}` : ""}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-8 px-3 text-xs" disabled={isUpdatingThis}
                              onClick={() => updateStatusMutation.mutate({ id: a.id, status: "confirmed" })}
                              data-testid={`inbox-today-approve-${a.id}`}>
                              {isUpdatingThis && (updateStatusMutation.variables as any)?.status === "confirmed" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                              {t("dashboard.approve", "Approve")}
                            </Button>
                            <Button size="sm" variant="destructive" className="h-8 px-3 text-xs" disabled={isUpdatingThis}
                              onClick={() => updateStatusMutation.mutate({ id: a.id, status: "rejected" })}
                              data-testid={`inbox-today-reject-${a.id}`}>
                              {isUpdatingThis && (updateStatusMutation.variables as any)?.status === "rejected" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <X className="h-3 w-3 mr-1" />}
                              {t("dashboard.reject", "Reject")}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {pendingTodayList.length >= 2 && (
                    <div className="flex items-center gap-2 pt-3 mt-3 border-t border-amber-200 dark:border-amber-700/50 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Checkbox checked={allPendingSelected}
                          onCheckedChange={(v) => {
                            if (v) pendingTodayList.forEach(a => setSelectedIds(s => { const n = new Set(s); n.add(a.id); return n; }));
                            else clearSelected();
                          }}
                          data-testid="checkbox-select-all-today-pending" />
                        <span className="text-xs text-amber-700 dark:text-amber-400">Select all ({pendingTodayList.length})</span>
                      </div>
                      {selectedPendingIds.length > 0 && (
                        <>
                          <Badge variant="secondary" className="text-xs">{selectedPendingIds.length} selected</Badge>
                          <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white" disabled={isBulking}
                            onClick={() => bulkStatusMutation.mutate({ ids: selectedPendingIds, status: "confirmed" })}
                            data-testid="button-bulk-today-approve">
                            {isBulking ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                            {t("provider_dashboard.bulk_approve", "Approve selected")}
                          </Button>
                          <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={isBulking}
                            onClick={() => bulkStatusMutation.mutate({ ids: selectedPendingIds, status: "rejected" })}
                            data-testid="button-bulk-today-reject">
                            {isBulking ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <X className="h-3 w-3 mr-1" />}
                            {t("provider_dashboard.bulk_reject", "Reject selected")}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={isBulking} onClick={clearSelected}>
                            {t("provider_dashboard.bulk_clear", "Clear")}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
              {todayActionable.filter(a => a.status !== "pending").map(a => <AppointmentRow key={a.id} appointment={a} />)}
            </>
          );
        })()}
      </TabsContent>

      <TabsContent value="history" className="mt-2 space-y-3">
        {(() => {
          const list = sortByDateDesc(filterAppointments(historyAppointments));
          return list.length > 0 ? list.map((a) => <AppointmentRow key={a.id} appointment={a} />) : isLoadingAppointments ? <AppointmentsListSkeleton /> : (
            <SmartEmptyState
              context="provider_history"
              hasFilter={!!(searchQuery.trim() || statusFilter !== "all" || visitTypeFilter !== "all")}
            />
          );
        })()}
      </TabsContent>

      <TabsContent value="calendar" className="mt-2">
        {(() => {
          const counts: Record<string, number> = {};
          allAppts.forEach((a) => { counts[a.date] = (counts[a.date] || 0) + 1; });
          const toLocalIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const todayStr = toLocalIso(new Date());
          const parseD = (s: string) => new Date(s.includes("T") ? s : s + "T00:00:00");
          const selectedDate = parseD(selectedCalendarDate);

          // Week helpers
          const getWeekStart = (d: Date) => {
            const r = new Date(d); const day = r.getDay();
            r.setDate(r.getDate() - (day === 0 ? 6 : day - 1)); r.setHours(0, 0, 0, 0); return r;
          };
          const weekStart = getWeekStart(selectedDate);
          const weekDays = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
          });

          // Month helpers
          const monthYear = selectedDate.getFullYear();
          const monthIdx = selectedDate.getMonth();
          const monthStart = new Date(monthYear, monthIdx, 1);
          const monthEnd = new Date(monthYear, monthIdx + 1, 0);
          const firstDow = monthStart.getDay() === 0 ? 6 : monthStart.getDay() - 1;
          const totalCells = Math.ceil((firstDow + monthEnd.getDate()) / 7) * 7;
          const monthCells = Array.from({ length: totalCells }, (_, i) => {
            const dayNum = i - firstDow + 1;
            return dayNum >= 1 && dayNum <= monthEnd.getDate()
              ? new Date(monthYear, monthIdx, dayNum) : null;
          });

          const navigate = (dir: number) => {
            const d = parseD(selectedCalendarDate);
            if (calendarView === "week") d.setDate(d.getDate() + dir * 7);
            else if (calendarView === "month") d.setMonth(d.getMonth() + dir);
            else d.setDate(d.getDate() + dir);
            setSelectedCalendarDate(toLocalIso(d));
          };

          const periodLabel = calendarView === "day"
            ? selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
            : calendarView === "week"
            ? `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekDays[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
            : selectedDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });

          const dayAppointments = sortByDateAsc(allAppts.filter((a) => a.date === selectedCalendarDate));

          return (
            <div className="space-y-4">
              {/* View toggle + navigation */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex gap-1 p-1 bg-muted rounded-lg">
                  {(["day", "week", "month"] as const).map((v) => (
                    <button key={v} onClick={() => setCalendarView(v)}
                      className={`px-3 py-1.5 text-sm rounded-md font-medium transition-all ${calendarView === v ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      data-testid={`btn-calendar-${v}`}>
                      {v === "day" ? t("provider_dashboard.cal_day", "Day") : v === "week" ? t("provider_dashboard.cal_week", "Week") : t("provider_dashboard.cal_month", "Month")}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate(-1)} data-testid="btn-calendar-prev">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium min-w-[180px] text-center">{periodLabel}</span>
                  <Button variant="outline" size="sm" onClick={() => navigate(1)} data-testid="btn-calendar-next">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedCalendarDate(todayStr)} data-testid="btn-calendar-today">
                    {t("provider_dashboard.cal_today", "Today")}
                  </Button>
                </div>
              </div>

              {/* Day view */}
              {calendarView === "day" && (
                <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
                  <Card>
                    <CardContent className="p-3">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(d) => d && setSelectedCalendarDate(toLocalIso(d))}
                        modifiers={{ hasAppt: (d: Date) => !!counts[toLocalIso(d)] }}
                        modifiersClassNames={{ hasAppt: "bg-primary/15 font-bold rounded-md" }}
                        data-testid="calendar-view"
                      />
                      <p className="text-xs text-muted-foreground mt-2 text-center">
                        {t("provider_dashboard.highlighted_dates", "Highlighted dates have appointments")}
                      </p>
                    </CardContent>
                  </Card>
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg" data-testid="text-selected-date">
                      {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                      <Badge variant="secondary" className="ml-2">{dayAppointments.length}</Badge>
                    </h3>
                    {dayAppointments.length > 0
                      ? dayAppointments.map((a) => <AppointmentRow key={a.id} appointment={a} />)
                      : <div className="text-center py-8 text-muted-foreground" data-testid="empty-calendar-day">{t("provider_dashboard.empty_calendar_day", "No appointments on this day")}</div>
                    }
                  </div>
                </div>
              )}

              {/* Week view */}
              {calendarView === "week" && (
                <div className="border rounded-lg overflow-hidden" data-testid="calendar-week-view">
                  <div className="grid grid-cols-7 divide-x">
                    {weekDays.map((d, i) => {
                      const iso = toLocalIso(d);
                      const isToday = iso === todayStr;
                      const isSelected = iso === selectedCalendarDate;
                      const appts = sortByDateAsc(allAppts.filter((a) => a.date === iso));
                      return (
                        <div key={i} className="flex flex-col min-w-0">
                          <button
                            onClick={() => setSelectedCalendarDate(iso)}
                            className={`p-2 text-center border-b hover:bg-muted/50 transition-colors ${isSelected ? "bg-primary/10" : ""}`}
                            data-testid={`week-day-${i}`}>
                            <div className="text-xs text-muted-foreground">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                            <div className={`text-sm font-semibold mx-auto w-7 h-7 flex items-center justify-center rounded-full ${isToday ? "bg-primary text-primary-foreground" : isSelected ? "bg-primary/20 text-primary" : ""}`}>
                              {d.getDate()}
                            </div>
                          </button>
                          <div className="flex-1 p-1 space-y-1 min-h-[160px] overflow-y-auto bg-background">
                            {appts.map((a) => (
                              <button
                                key={a.id}
                                onClick={() => openApptDetails(a)}
                                className="w-full text-left text-xs p-1.5 rounded bg-primary/10 hover:bg-primary/20 border border-primary/20 transition-colors"
                                data-testid={`week-appt-${a.id}`}>
                                <div className="font-medium truncate">{a.startTime}</div>
                                <div className="truncate text-muted-foreground">{(a as any).service?.name || t("provider_dashboard.appointment", "Appointment")}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Month view */}
              {calendarView === "month" && (
                <div data-testid="calendar-month-view">
                  <div className="grid grid-cols-7 mb-1">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                      <div key={d} className="text-xs text-center font-medium text-muted-foreground py-2">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {monthCells.map((d, i) => {
                      if (!d) return <div key={i} />;
                      const iso = toLocalIso(d);
                      const count = counts[iso] || 0;
                      const isToday = iso === todayStr;
                      const isSelected = iso === selectedCalendarDate;
                      return (
                        <button
                          key={i}
                          onClick={() => { setSelectedCalendarDate(iso); setCalendarView("day"); }}
                          className={`aspect-square flex flex-col items-center justify-center rounded-lg border transition-colors hover:bg-muted/60 p-1 ${isSelected ? "border-primary bg-primary/10" : "border-transparent"}`}
                          data-testid={`month-day-${iso}`}>
                          <span className={`text-sm w-7 h-7 flex items-center justify-center rounded-full ${isToday ? "bg-primary text-primary-foreground" : ""} ${count > 0 ? "font-semibold" : ""}`}>
                            {d.getDate()}
                          </span>
                          {count > 0 && (
                            <span className="mt-0.5 text-[10px] text-primary font-medium">{count}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </TabsContent>

      {/* Appointment details modal */}
      <Dialog open={!!selectedAppt && !actionTarget} onOpenChange={(open) => { if (!open) setSelectedAppt(null); }}>
        <DialogContent className="max-w-lg" data-testid="dialog-appointment-details">
          <DialogHeader>
            <DialogTitle>{t("provider_dashboard.appointment_details", "Appointment details")}</DialogTitle>
          </DialogHeader>
          {selectedAppt && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">{t("provider_dashboard.patient_label", "Client")}</p>
                  <p className="font-medium">{selectedAppt.patient?.firstName} {selectedAppt.patient?.lastName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("provider_dashboard.status_label", "Status")}</p>
                  <div className="space-y-0.5">
                    <StatusBadge status={selectedAppt.status} />
                    <AppointmentTimeContext
                      date={selectedAppt.date}
                      startTime={selectedAppt.startTime}
                      startAtUtc={(selectedAppt as any).startAt}
                      status={selectedAppt.status}
                      className="text-muted-foreground"
                    />
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("provider_dashboard.date_time_label", "Date & time")}</p>
                  <p className="font-medium">
                    {selectedAppt.date} · {selectedAppt.startTime}
                    {(selectedAppt as any).endTime && ` - ${(selectedAppt as any).endTime}`}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("provider_dashboard.visit_type_label", "Visit type")}</p>
                  <p className="font-medium capitalize">{selectedAppt.visitType}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("provider_dashboard.service_label", "Service")}</p>
                  <p className="font-medium">{(selectedAppt as any).service?.name || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("provider_dashboard.total_label", "Total")}</p>
                  <p className="font-medium">{formatInCurrency(Number((selectedAppt as any).totalAmount || 0), (selectedAppt as any).displayCurrency ?? "USD")}</p>
                </div>
              </div>
              {(selectedAppt as any).patientAddress && (
                <div>
                  <p className="text-muted-foreground text-sm">{t("provider_dashboard.address_label", "Address")}</p>
                  <p className="text-sm">{(selectedAppt as any).patientAddress}</p>
                </div>
              )}
              {(selectedAppt as any).appointmentNumber && (
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs">{t("provider_dashboard.ref_label", "Reference")}</p>
                  <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{(selectedAppt as any).appointmentNumber}</span>
                </div>
              )}
              {selectedAppt.notes && (
                <div className="col-span-2">
                  <p className="text-muted-foreground text-sm">{t("provider_dashboard.patient_notes", "Client notes")}</p>
                  <p className="text-sm">{selectedAppt.notes}</p>
                </div>
              )}
              {(selectedAppt as any).isRescheduled && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2" data-testid="section-reschedule-history">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5" />Reschedule history
                  </p>
                  {(() => {
                    const reschedules = (selectedApptEvents ?? []).filter((e: any) => e.action === "reschedule");
                    const original = (selectedAppt as any).originalDate;
                    const steps: Array<{ date: string; start: string; end: string; label: string; current?: boolean }> = [];
                    if (original) steps.push({ date: original, start: (selectedAppt as any).originalStartTime ?? "", end: (selectedAppt as any).originalEndTime ?? "", label: "Original" });
                    reschedules.forEach((ev: any, i: number) => {
                      try {
                        const m = ev.metadata ? JSON.parse(ev.metadata) : null;
                        if (m?.to?.date) steps.push({ date: m.to.date, start: m.to.startTime ?? "", end: m.to.endTime ?? "", label: i === reschedules.length - 1 ? "Current" : `Move ${i + 1}`, current: i === reschedules.length - 1 });
                      } catch { }
                    });
                    if (steps.length === 0) return <p className="text-xs text-muted-foreground" data-testid="text-reschedule-history-empty">This appointment has been rescheduled. Open the full details page for more information.</p>;
                    return (
                      <ol className="space-y-1.5" data-testid="list-reschedule-steps-modal">
                        {steps.map((step, idx) => (
                          <li key={idx} className={`flex items-center gap-2 text-xs rounded px-2 py-1.5 ${step.current ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"}`} data-testid={`reschedule-step-modal-${idx}`}>
                            {step.current ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <CalendarIcon className="h-3.5 w-3.5 shrink-0" />}
                            <span className="font-medium w-14 shrink-0">{step.label}</span>
                            <span>{step.date}{step.start ? ` · ${step.start}${step.end ? `–${step.end}` : ""}` : ""}</span>
                          </li>
                        ))}
                      </ol>
                    );
                  })()}
                </div>
              )}
              <div className="space-y-2">
                <p className="text-sm font-medium flex items-center gap-1">
                  <MessageSquare className="h-4 w-4" /> {t("provider_dashboard.private_note_label", "Private note (only you)")}
                </p>
                <Textarea
                  value={privateNoteDraft}
                  onChange={(e) => { setPrivateNoteDraft(e.target.value); setNoteIsDirty(true); }}
                  rows={3}
                  placeholder={t("provider_dashboard.private_note_placeholder", "Internal notes about this appointment...")}
                  data-testid="textarea-private-note"
                />
                <Button size="sm"
                  onClick={() => savePrivateNoteMutation.mutate({ id: selectedAppt.id, privateNote: privateNoteDraft })}
                  disabled={savePrivateNoteMutation.isPending}
                  data-testid="button-save-private-note">
                  {savePrivateNoteMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  {t("provider_dashboard.save_note_btn", "Save note")}
                </Button>
              </div>
              {selectedApptEvents && selectedApptEvents.length > 0 && (
                <div className="space-y-2" data-testid="section-appointment-timeline-modal">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("provider_dashboard.timeline_label", "Activity timeline")}
                  </p>
                  <AppointmentTimeline events={selectedApptEvents} />
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            {selectedAppt && (
              <Button
                variant="outline"
                onClick={() => { setClinicalWorkspaceAppt(selectedAppt); setSelectedAppt(null); }}
                data-testid="button-open-clinical-workspace"
              >
                <Stethoscope className="h-4 w-4 mr-2" />
                {t("provider_dashboard.clinical_workspace_btn", "Clinical Workspace")}
              </Button>
            )}
            {selectedAppt && ["approved", "confirmed", "rescheduled"].includes(selectedAppt.status) && (
              <Button variant="outline" onClick={() => setActionTarget({ id: selectedAppt.id, action: "reschedule" })} data-testid="button-open-reschedule">
                <CalendarDays className="h-4 w-4 mr-2" /> {t("provider_dashboard.reschedule_btn", "Reschedule")}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setSelectedAppt(null)}>{t("provider_dashboard.close_btn", "Close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clinical Workspace Panel */}
      {clinicalWorkspaceAppt && (
        <ClinicalWorkspacePanel
          open={!!clinicalWorkspaceAppt}
          onClose={() => setClinicalWorkspaceAppt(null)}
          appointment={{
            id: clinicalWorkspaceAppt.id,
            status: clinicalWorkspaceAppt.status,
            patientId: clinicalWorkspaceAppt.patientId,
            date: clinicalWorkspaceAppt.date,
            startTime: clinicalWorkspaceAppt.startTime,
            notes: clinicalWorkspaceAppt.notes,
            privateNote: (clinicalWorkspaceAppt as any).privateNote,
            serviceId: (clinicalWorkspaceAppt as any).serviceId ?? null,
            outcomeNote: (clinicalWorkspaceAppt as any).outcomeNote,
            followUpRecommended: (clinicalWorkspaceAppt as any).followUpRecommended,
            referralNeeded: (clinicalWorkspaceAppt as any).referralNeeded,
            followUpRecommendedAt: (clinicalWorkspaceAppt as any).followUpRecommendedAt,
            intakeResponses: (clinicalWorkspaceAppt as any).intakeResponses,
            appointmentNumber: (clinicalWorkspaceAppt as any).appointmentNumber,
            service: (clinicalWorkspaceAppt as any).service,
            patient: clinicalWorkspaceAppt.patient,
          }}
        />
      )}

      <AppointmentActionDialog
        appointmentId={actionTarget?.id ?? null}
        action={actionTarget?.action ?? "cancel"}
        open={!!actionTarget}
        onOpenChange={(open) => !open && setActionTarget(null)}
        invalidateKeys={[["/api/appointments/provider"]]}
      />

      {/* ── Patient Sign-off PIN Gate ─────────────────────────────────────────── */}
      <Dialog open={pinDialogOpen} onOpenChange={(o) => { if (!o) { setPinDialogOpen(false); setPendingCompleteId(null); setPinValue(""); setPinError(""); } }}>
        <DialogContent className="max-w-sm" data-testid="dialog-pin-gate">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              Patient Sign-off Required
            </DialogTitle>
            <DialogFooter className="hidden" />
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Ask the patient for their <strong>4-digit sign-off code</strong> and enter it below to formally close this session. This creates an immutable completion record.
            </p>

            {/* 4-digit PIN input boxes */}
            <div className="flex items-center justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <input
                  key={i}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={pinValue[i] || ""}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    const arr = pinValue.split("");
                    arr[i] = val;
                    const next = arr.join("").slice(0, 4);
                    setPinValue(next);
                    setPinError("");
                    if (val && i < 3) {
                      const sibling = e.currentTarget.parentElement?.children[i + 1] as HTMLInputElement;
                      sibling?.focus();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !pinValue[i] && i > 0) {
                      const sibling = (e.currentTarget.parentElement?.children[i - 1]) as HTMLInputElement;
                      sibling?.focus();
                    }
                  }}
                  className={`w-14 h-14 text-2xl font-bold text-center rounded-xl border-2 bg-background outline-none transition-colors focus:border-primary ${pinError ? "border-destructive" : "border-border"}`}
                  data-testid={`input-pin-digit-${i}`}
                />
              ))}
            </div>

            {pinError && (
              <p className="text-sm text-destructive text-center" data-testid="text-pin-error">{pinError}</p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setPinDialogOpen(false); setPendingCompleteId(null); setPinValue(""); setPinError(""); }} data-testid="button-pin-cancel">
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={updateStatusMutation.isPending}
              onClick={() => {
                if (pinValue.length !== 4) { setPinError("Please enter the full 4-digit code."); return; }
                if (pendingCompleteId) {
                  updateStatusMutation.mutate({ id: pendingCompleteId, status: "completed", signOffCode: pinValue });
                  setPinDialogOpen(false);
                  setPendingCompleteId(null);
                  setPinValue("");
                  setPinError("");
                }
              }}
              data-testid="button-pin-confirm"
            >
              {updateStatusMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Confirm session complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
