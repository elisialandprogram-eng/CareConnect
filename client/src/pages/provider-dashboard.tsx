import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Header } from "@/components/header";
import { ServiceFormDialog } from "@/components/service-form-dialog";
import { NewTicketDialog } from "@/components/new-ticket-dialog";
import { WeeklyScheduleGrid, type WeeklySchedule } from "@/components/weekly-schedule-grid";
import { PractitionerManagementCard } from "@/components/practitioner-management";
import { DialogDescription } from "@/components/ui/dialog";
import type { ServicePackageWithServices } from "@shared/schema";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrency } from "@/lib/currency";
import {
  Calendar as CalendarIcon,
  Clock,
  DollarSign,
  Star,
  Users,
  Video,
  Home,
  CheckCircle,
  X,
  Settings,
  TrendingUp,
  FileText,
  Image as ImageIcon,
  Plus,
  Trash2,
  RotateCcw,
  Tag,
  Edit,
  MapPin,
  Navigation,
  Banknote,
  CreditCard,
  Building2,
  Bitcoin,
  Loader2,
  Download,
  Reply,
  CalendarDays,
  Copy,
  ChevronUp,
  ChevronDown,
  MessageSquare,
  AlertTriangle,
  Award,
  Zap,
  ChevronRight,
  Shield,
  Pencil,
  Save,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { AppointmentWithDetails, Provider, ProviderWithServices, Practitioner, Service, ReviewWithPatient } from "@shared/schema";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  AreaChart,
  Area,
} from "recharts";

function ServiceStaffList({ serviceId, onDelete, onToggle }: { serviceId: string; onDelete: (id: string) => void; onToggle: (args: {id: string, isActive: boolean}) => void }) {
  const { t } = useTranslation();
  const { format: fmtMoney } = useCurrency();
  const { data: practitioners } = useQuery<any[]>({
    queryKey: [`/api/services/${serviceId}/practitioners`],
    enabled: !!serviceId,
  });

  return (
    <div className="space-y-2 mt-2">
      {practitioners?.length === 0 && <p className="text-sm text-muted-foreground italic">{t("provider_dashboard.no_staff_assigned", "No staff assigned")}</p>}
      {practitioners?.map((sp) => (
        <div key={sp.id} className="flex items-center justify-between p-2 bg-muted/50 rounded border text-sm">
          <span>{sp.practitioner.name} ({fmtMoney(sp.fee)})</span>
          <div className="flex items-center gap-1">
            <Button 
              size="sm" 
              variant="ghost" 
              className={sp.isActive ? "text-primary" : "text-muted-foreground"}
              onClick={() => onToggle({ id: sp.id, isActive: !sp.isActive })}
            >
              {sp.isActive ? t("provider_dashboard.active", "Active") : t("provider_dashboard.paused", "Paused")}
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => onDelete(sp.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AppointmentsListSkeleton() {
  return (
    <div className="space-y-3" data-testid="skeleton-appointments">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

const PROFILE_SECTIONS = [
  {
    step: 1,
    label: "Professional Info",
    icon: "👤",
    checks: (p: any) => [
      { label: "Professional title", done: !!p.professionalTitle },
      { label: "Specialization", done: !!p.specialization },
      { label: "Bio / About you", done: !!p.bio },
      { label: "Years of experience", done: p.yearsExperience != null && p.yearsExperience > 0 },
      { label: "Education", done: !!p.education },
    ],
  },
  {
    step: 2,
    label: "Credentials",
    icon: "🪪",
    checks: (p: any) => [
      { label: "License number", done: !!p.licenseNumber },
      { label: "Licensing authority", done: !!p.licensingAuthority },
    ],
  },
  {
    step: 3,
    label: "Location",
    icon: "📍",
    checks: (p: any) => [
      { label: "Primary location", done: !!p.primaryServiceLocation || !!p.city },
      { label: "City", done: !!p.city },
    ],
  },
  {
    step: 4,
    label: "Agreements",
    icon: "📋",
    checks: (p: any) => [
      { label: "Provider agreement", done: !!p.providerAgreementAccepted },
      { label: "Data processing agreement", done: !!p.dataProcessingAgreementAccepted },
    ],
  },
];

function ProfileCompletenessCard({ provider, services }: { provider: any; services?: any[] }) {
  const [, setLocation] = useLocation();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("profile_completeness_dismissed") === "1"; } catch { return false; }
  });

  if (!provider) return null;

  const allChecks = PROFILE_SECTIONS.flatMap((s) => s.checks(provider));
  const hasServices = Array.isArray(services) && services.length > 0;
  const totalFields = allChecks.length + 1;
  const filledFields = allChecks.filter((c) => c.done).length + (hasServices ? 1 : 0);
  const pct = Math.round((filledFields / totalFields) * 100);

  if (pct === 100 || dismissed) return null;

  const incompleteSections = PROFILE_SECTIONS.filter((s) =>
    s.checks(provider).some((c) => !c.done)
  );
  const addServicesNeeded = !hasServices;

  const getColor = () => {
    if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
    if (pct >= 50) return "text-amber-600 dark:text-amber-400";
    return "text-rose-600 dark:text-rose-400";
  };

  const getProgressColor = () => {
    if (pct >= 80) return "bg-emerald-500";
    if (pct >= 50) return "bg-amber-500";
    return "bg-rose-500";
  };

  return (
    <div className="mb-6 rounded-2xl border border-border bg-gradient-to-br from-background to-muted/30 shadow-sm overflow-hidden" data-testid="card-profile-completeness">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative h-14 w-14 flex-shrink-0">
              <svg className="h-14 w-14 -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="24" fill="none" stroke="currentColor" strokeWidth="4" className="text-muted/30" />
                <circle
                  cx="28" cy="28" r="24"
                  fill="none" stroke="currentColor" strokeWidth="4"
                  strokeDasharray={`${(pct / 100) * 150.8} 150.8`}
                  strokeLinecap="round"
                  className={getColor()}
                />
              </svg>
              <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${getColor()}`}>
                {pct}%
              </span>
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Complete your profile
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {filledFields} of {totalFields} sections filled — patients see more complete profiles first
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              try { localStorage.setItem("profile_completeness_dismissed", "1"); } catch {}
              setDismissed(true);
            }}
            className="text-muted-foreground hover:text-foreground transition-colors mt-0.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 mb-3 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${getProgressColor()}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {incompleteSections.map((section) => {
            const missing = section.checks(provider).filter((c) => !c.done);
            return (
              <button
                key={section.step}
                onClick={() => setLocation(`/provider/setup?step=${section.step}`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-background hover:border-primary/50 hover:bg-primary/5 transition-all text-sm text-muted-foreground hover:text-foreground group"
                data-testid={`button-complete-step-${section.step}`}
              >
                <span>{section.icon}</span>
                <span className="font-medium">{section.label}</span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{missing.length}</Badge>
                <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            );
          })}
          {addServicesNeeded && (
            <button
              onClick={() => setLocation("/provider/dashboard")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-background hover:border-primary/50 hover:bg-primary/5 transition-all text-sm text-muted-foreground hover:text-foreground group"
              data-testid="button-complete-services"
            >
              <span>🏥</span>
              <span className="font-medium">Add Services</span>
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">1</Badge>
              <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProviderDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [activeTab, setActiveTab] = useState<string>("upcoming");
  const [, setLocation] = useLocation();

  const { data: providerData, isLoading: isLoadingProvider } = useQuery<ProviderWithServices>({
    queryKey: ["/api/provider/me"],
  });

  // Appointments are needed on most tabs and for live counts; poll only when an
  // appointment-centric tab is active. 30s is plenty fresh and avoids hammering
  // the connection pool (which previously caused 100s+ stalls under load).
  const appointmentTabs = new Set(["upcoming", "completed", "cancelled", "history", "calendar", "analytics"]);
  const { data: appointments, isLoading: isLoadingAppointments } = useQuery<AppointmentWithDetails[]>({
    queryKey: ["/api/appointments/provider"],
    enabled: !!providerData?.id,
    refetchInterval: appointmentTabs.has(activeTab) ? 30000 : false,
  });

  const { data: providerWithServices } = useQuery<ProviderWithServices>({
    queryKey: ["/api/providers", providerData?.id],
    enabled: !!providerData?.id,
  });

  const subServicesUrl = providerData?.providerType
    ? `/api/sub-services?category=${providerData.providerType}`
    : "/api/sub-services";
  const { data: subServices } = useQuery<any[]>({
    queryKey: ["/api/sub-services", providerData?.providerType],
    queryFn: () => fetch(subServicesUrl, { credentials: "include" }).then(r => r.json()),
    enabled: !!providerData?.providerType && activeTab === "services",
    staleTime: 0,
  });

  const addServiceMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/services", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers", providerData?.id] });
      toast({ title: t("provider_dashboard.toast_service_added", "Service added successfully") });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/appointments/${id}/status`, { status });
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
    onError: () => {
      toast({ title: t("provider_dashboard.toast_failed_update_appt", "Failed to update appointment"), variant: "destructive" });
    },
  });

  const generateInvoiceMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const res = await apiRequest("POST", `/api/invoices/generate/${appointmentId}`, {});
      return res.json();
    },
    onSuccess: (data: any, appointmentId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/provider"] });
      toast({
        title: t("provider_dashboard.invoice_ready_title", "Invoice ready"),
        description: t("provider_dashboard.invoice_ready_desc", "The invoice has been generated."),
      });
      const url = data?.invoice?.id
        ? `/api/invoices/${data.invoice.id}/download`
        : `/api/invoices/by-appointment/${appointmentId}/download`;
      window.open(url, "_blank", "noopener");
    },
    onError: (e: any) => {
      toast({
        title: t("provider_dashboard.invoice_failed_title", "Could not generate invoice"),
        description: e?.message || t("provider_dashboard.invoice_failed_desc", "Please try again later."),
        variant: "destructive",
      });
    },
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelected = () => setSelectedIds(new Set());

  const bulkStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: "approved" | "rejected" | "cancelled" }) => {
      const results = await Promise.allSettled(
        ids.map((id) => apiRequest("PATCH", `/api/appointments/${id}/status`, { status })),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      return { total: ids.length, failed };
    },
    onSuccess: ({ total, failed }, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/provider"] });
      clearSelected();
      const ok = total - failed;
      if (failed === 0) {
        toast({
          title: t("provider_dashboard.toast_bulk_done", "{{count}} appointments updated", { count: ok }),
        });
      } else {
        toast({
          title: t("provider_dashboard.toast_bulk_partial", "Updated {{ok}} of {{total}}", { ok, total }),
          description: t("provider_dashboard.toast_bulk_some_failed", "Some updates failed. Please retry."),
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: t("provider_dashboard.toast_bulk_failed", "Bulk update failed"),
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
    onError: () => {
      toast({ title: t("provider_dashboard.toast_failed_payment", "Failed to update payment"), variant: "destructive" });
    },
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/services/${id}`);
      try { return await r.json(); } catch { return { ok: true, archived: false }; }
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers", providerData?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/providers/me"] });
      if (data?.archived) {
        toast({ title: t("provider_dashboard.toast_service_archived", "Service archived"), description: data.message });
      } else {
        toast({ title: t("provider_dashboard.toast_service_deleted", "Service deleted") });
      }
    },
    onError: (e: any) => {
      toast({ title: t("provider_dashboard.toast_failed_delete", "Failed to delete service"), description: e?.message, variant: "destructive" });
    },
  });

  const restoreServiceMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/services/${id}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers", providerData?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/providers/me"] });
      toast({ title: t("provider_dashboard.toast_service_restored", "Service restored") });
    },
  });

  const toggleServiceMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/services/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers", providerData?.id] });
    },
  });

  const [selectedSubServiceId, setSelectedSubServiceId] = useState("");
  const [servicePrice, setServicePrice] = useState("");
  const [serviceFormOpen, setServiceFormOpen] = useState(false);
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [editingService, setEditingService] = useState<any>(null);
  const [pricingService, setPricingService] = useState<any | null>(null);
  const [pricingDraft, setPricingDraft] = useState<any>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [visitTypeFilter, setVisitTypeFilter] = useState<string>("all");
  const [selectedAppt, setSelectedAppt] = useState<AppointmentWithDetails | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleData, setRescheduleData] = useState({ date: "", startTime: "", endTime: "" });
  const [privateNoteDraft, setPrivateNoteDraft] = useState("");

  // Reviews
  const { data: providerReviews } = useQuery<ReviewWithPatient[]>({
    queryKey: ["/api/reviews/provider/me"],
    enabled: !!providerData?.id,
  });
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const replyMutation = useMutation({
    mutationFn: async ({ id, reply }: { id: string; reply: string }) => {
      const res = await apiRequest("PATCH", `/api/reviews/${id}/reply`, { reply });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reviews/provider/me"] });
      toast({ title: t("provider_dashboard.toast_reply_posted", "Reply posted") });
    },
    onError: () => toast({ title: t("provider_dashboard.toast_failed_reply", "Failed to post reply"), variant: "destructive" }),
  });

  // Reschedule + edit (private note)
  const rescheduleMutation = useMutation({
    mutationFn: async (payload: { id: string; date?: string; startTime?: string; endTime?: string; privateNote?: string }) => {
      const { id, ...body } = payload;
      const res = await apiRequest("PATCH", `/api/appointments/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/provider"] });
      toast({ title: t("provider_dashboard.toast_appt_updated", "Appointment updated") });
      setRescheduleOpen(false);
      setSelectedAppt(null);
    },
    onError: () => toast({ title: t("provider_dashboard.toast_failed_update", "Failed to update"), variant: "destructive" }),
  });

  const savePrivateNoteMutation = useMutation({
    mutationFn: async ({ id, privateNote }: { id: string; privateNote: string }) => {
      const res = await apiRequest("PATCH", `/api/appointments/${id}`, { privateNote });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/provider"] });
      toast({ title: t("provider_dashboard.toast_note_saved", "Note saved") });
    },
  });

  // Bulk availability
  const bulkAvailabilityMutation = useMutation({
    mutationFn: async (payload: { dates: string[]; slots: { startTime: string; endTime: string }[]; replaceExisting: boolean }) => {
      const res = await apiRequest("POST", "/api/availability/bulk", payload);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: t("provider_dashboard.toast_slots_created", "Created {{count}} time slots", { count: data.count }) });
    },
    onError: () => toast({ title: t("provider_dashboard.toast_failed_availability", "Failed to save availability"), variant: "destructive" }),
  });

  // Service reorder + duplicate
  const duplicateServiceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/services/${id}/duplicate`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers", providerData?.id] });
      toast({ title: t("provider_dashboard.toast_service_duplicated", "Service duplicated") });
    },
  });

  const reorderServicesMutation = useMutation({
    mutationFn: async (updates: { id: string; sortOrder: number }[]) => {
      await apiRequest("PATCH", "/api/services/reorder", { updates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers", providerData?.id] });
    },
  });

  // Service Packages
  const { data: packages } = useQuery<ServicePackageWithServices[]>({
    queryKey: ["/api/provider/packages"],
    enabled: activeTab === "services",
  });

  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<ServicePackageWithServices | null>(null);
  const [pkgName, setPkgName] = useState("");
  const [pkgDescription, setPkgDescription] = useState("");
  const [pkgPrice, setPkgPrice] = useState("");
  const [pkgDuration, setPkgDuration] = useState("");
  const [pkgServiceIds, setPkgServiceIds] = useState<string[]>([]);

  const openCreatePackage = () => {
    setEditingPackage(null);
    setPkgName("");
    setPkgDescription("");
    setPkgPrice("");
    setPkgDuration("");
    setPkgServiceIds([]);
    setPackageDialogOpen(true);
  };

  const openEditPackage = (pkg: ServicePackageWithServices) => {
    setEditingPackage(pkg);
    setPkgName(pkg.name);
    setPkgDescription(pkg.description || "");
    setPkgPrice(String(pkg.price));
    setPkgDuration(pkg.duration ? String(pkg.duration) : "");
    setPkgServiceIds(pkg.services.map(s => s.id));
    setPackageDialogOpen(true);
  };

  const savePackageMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: pkgName.trim(),
        description: pkgDescription.trim() || null,
        price: pkgPrice,
        duration: pkgDuration ? Number(pkgDuration) : null,
        serviceIds: pkgServiceIds,
      };
      if (editingPackage) {
        return await apiRequest("PATCH", `/api/provider/packages/${editingPackage.id}`, payload);
      }
      return await apiRequest("POST", "/api/provider/packages", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/packages"] });
      setPackageDialogOpen(false);
      toast({ title: editingPackage ? t("provider_dashboard.package_updated", "Package updated") : t("provider_dashboard.package_created", "Package created") });
    },
    onError: (err: any) => {
      toast({ title: t("common.error", "Error"), description: err?.message || "Failed to save package", variant: "destructive" });
    },
  });

  // ── Preferences tab state ──
  const PAYMENT_METHOD_OPTIONS = [
    { value: "card", label: t("preferences.payment_card", "Credit / Debit Card") },
    { value: "cash", label: t("preferences.payment_cash", "Cash") },
    { value: "bank_transfer", label: t("preferences.payment_bank", "Bank Transfer") },
    { value: "insurance", label: t("preferences.payment_insurance", "Insurance") },
  ];

  const [prefDraft, setPrefDraft] = useState<{
    currency: string;
    paymentMethods: string[];
    preferredContactMethod: string;
    onCallAvailability: boolean;
    maxPatientsPerDay: string;
    emergencyContact: string;
  } | null>(null);

  const prefData = prefDraft ?? {
    currency: providerData?.currency || "HUF",
    paymentMethods: Array.isArray(providerData?.paymentMethods) ? providerData.paymentMethods : [],
    preferredContactMethod: providerData?.preferredContactMethod || "email",
    onCallAvailability: !!providerData?.onCallAvailability,
    maxPatientsPerDay: providerData?.maxPatientsPerDay ? String(providerData.maxPatientsPerDay) : "",
    emergencyContact: providerData?.emergencyContact || "",
  };

  const savePreferencesMutation = useMutation({
    mutationFn: async (data: object) => {
      const res = await apiRequest("POST", "/api/provider/setup", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/me"] });
      toast({ title: t("provider_dashboard.toast_preferences_saved", "Preferences saved") });
      setPrefDraft(null);
    },
    onError: () => toast({ title: t("common.error", "Error"), description: "Failed to save preferences", variant: "destructive" }),
  });

  const togglePackageMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return await apiRequest("PATCH", `/api/provider/packages/${id}`, { isActive });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/provider/packages"] }),
  });

  const deletePackageMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/provider/packages/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/packages"] });
      toast({ title: t("provider_dashboard.package_deleted", "Package deleted") });
    },
  });

  const pkgServicesTotal = pkgServiceIds.reduce((sum, id) => {
    const s = providerWithServices?.services?.find(x => x.id === id);
    return sum + (s ? Number(s.price) : 0);
  }, 0);
  const pkgDurationTotal = pkgServiceIds.reduce((sum, id) => {
    const s = providerWithServices?.services?.find(x => x.id === id);
    return sum + (s ? s.duration : 0);
  }, 0);
  const pkgSavings = pkgPrice ? Math.max(0, pkgServicesTotal - Number(pkgPrice)) : 0;

  const { format: fmtHUF } = useCurrency();

  const exportAppointmentsCSV = (list: AppointmentWithDetails[]) => {
    const headers = [
      "id",
      "date",
      "startTime",
      "endTime",
      "patient",
      "service",
      "visitType",
      "status",
      "totalAmount",
      "paymentStatus",
      "paymentMethod",
    ];
    const escape = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = list.map((a: any) => [
      a.id,
      a.date,
      a.startTime,
      a.endTime || "",
      `${a.patient?.firstName || ""} ${a.patient?.lastName || ""}`.trim(),
      a.service?.name || "",
      a.visitType,
      a.status,
      a.totalAmount || "",
      a.payment?.status || "",
      a.payment?.paymentMethod || "",
    ]);
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

  const openApptDetails = (a: AppointmentWithDetails) => {
    setSelectedAppt(a);
    setPrivateNoteDraft((a as any).privateNote || "");
  };

  const openReschedule = (a: AppointmentWithDetails) => {
    setSelectedAppt(a);
    setRescheduleData({
      date: a.date,
      startTime: a.startTime,
      endTime: (a as any).endTime || "",
    });
    setRescheduleOpen(true);
  };

  const moveService = (serviceId: string, direction: "up" | "down") => {
    const list = [...(providerWithServices?.services || [])].sort(
      (a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
    const idx = list.findIndex((s) => s.id === serviceId);
    if (idx < 0) return;
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    const updates = list.map((s, i) => ({ id: s.id, sortOrder: i }));
    reorderServicesMutation.mutate(updates);
  };

  const handleAddService = () => {
    const sub = subServices?.find(s => s.id === selectedSubServiceId);
    if (!sub) return;
    addServiceMutation.mutate({
      subServiceId: sub.id,
      name: sub.name,
      description: sub.description,
      duration: 60,
      price: servicePrice,
    });
    setSelectedSubServiceId("");
    setServicePrice("");
  };

  if (!isLoadingProvider && !providerData) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center bg-muted/30">
          <div className="text-center p-8 bg-card rounded-xl border shadow-lg max-w-md mx-4">
            <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-3 text-foreground tracking-tight">{t("provider_dashboard.complete_profile_title", "Complete Your Profile")}</h1>
            <p className="text-muted-foreground mb-8 text-balance leading-relaxed">
              {t("provider_dashboard.complete_profile_desc", "To start managing appointments and services, you'll need to set up your professional profile first.")}
            </p>
            <div className="flex flex-col gap-3">
              <Button size="lg" className="w-full font-semibold shadow-sm" onClick={() => setLocation("/provider/setup")}>
                {t("provider_dashboard.setup_profile_btn", "Setup Provider Profile")}
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

  if (providerData && (providerData as any).status === "pending") {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center bg-muted/30">
          <div className="text-center p-8 bg-card rounded-xl border shadow-lg max-w-md mx-4">
            <div className="h-16 w-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Clock className="h-8 w-8 text-orange-600" />
            </div>
            <h1 className="text-2xl font-bold mb-3 text-foreground tracking-tight">{t("provider_dashboard.awaiting_approval_title", "Awaiting Approval")}</h1>
            <p className="text-muted-foreground mb-8 text-balance leading-relaxed">
              {t("provider_dashboard.awaiting_approval_desc", "Your provider profile has been submitted and is currently awaiting administrator approval. You will have full access once your account is verified.")}
            </p>
            <Button variant="outline" className="w-full" onClick={() => setLocation("/")}>
              {t("provider_dashboard.back_to_home", "Back to Home")}
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const upcomingAppointments = appointments?.filter(
    (a) => a.status === "pending" || a.status === "approved" || a.status === "confirmed" || a.status === "rescheduled"
  ) || [];

  const completedAppointments = appointments?.filter(
    (a) => a.status === "completed"
  ) || [];

  const cancelledAppointments = appointments?.filter(
    (a) => a.status === "cancelled" || a.status === "rejected"
  ) || [];

  const allAppointments = appointments || [];

  const formatHUF = fmtHUF;

  const sumAmount = (list: AppointmentWithDetails[]) =>
    list.reduce((sum, a) => sum + Number(a.totalAmount || 0), 0);

  const weeklyEarnings = sumAmount(
    completedAppointments.filter((a) => {
      const appointmentDate = new Date(a.date);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return appointmentDate >= weekAgo;
    })
  );

  const monthlyEarnings = sumAmount(
    completedAppointments.filter((a) => {
      const appointmentDate = new Date(a.date);
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);
      return appointmentDate >= monthAgo;
    })
  );

  const totalEarnings = sumAmount(completedAppointments);

  // Today's earnings, avg per booking, and previous-30-day comparison.
  const todayStr2 = new Date().toISOString().split("T")[0];
  const todayEarnings = sumAmount(
    completedAppointments.filter((a) => {
      const d = new Date(a.date).toISOString().split("T")[0];
      return d === todayStr2;
    }),
  );
  const avgPerBooking = completedAppointments.length
    ? totalEarnings / completedAppointments.length
    : 0;
  const prevMonthEarnings = sumAmount(
    completedAppointments.filter((a) => {
      const appointmentDate = new Date(a.date);
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);
      return appointmentDate >= twoMonthsAgo && appointmentDate < monthAgo;
    }),
  );
  const monthlyGrowthPct = prevMonthEarnings > 0
    ? Math.round(((monthlyEarnings - prevMonthEarnings) / prevMonthEarnings) * 1000) / 10
    : (monthlyEarnings > 0 ? 100 : 0);

  // Mini-sparkline for last 14 days.
  const sparkData: { d: string; v: number }[] = [];
  {
    const today0 = new Date();
    today0.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today0);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const v = sumAmount(completedAppointments.filter((a) => a.date === key));
      sparkData.push({ d: key, v });
    }
  }

  const uniquePatientCount = new Set(
    allAppointments.map((a) => a.patientId).filter(Boolean)
  ).size;

  const todayStr = new Date().toISOString().split("T")[0];
  const todayAppointments = upcomingAppointments.filter((a) => {
    const d = new Date(a.date).toISOString().split("T")[0];
    return d === todayStr;
  });

  const pendingCount = appointments?.filter((a) => a.status === "pending").length || 0;
  const completionRate = allAppointments.length > 0
    ? Math.round((completedAppointments.length / allAppointments.length) * 100)
    : 0;

  const filterAppointments = (list: AppointmentWithDetails[]) => {
    return list.filter((a) => {
      const q = searchQuery.trim().toLowerCase();
      const fullName = `${a.patient?.firstName || ""} ${a.patient?.lastName || ""}`.toLowerCase();
      const matchesSearch =
        !q ||
        fullName.includes(q) ||
        (a.service?.name?.toLowerCase().includes(q) ?? false) ||
        (a.id?.toLowerCase().includes(q) ?? false);
      const matchesStatus = statusFilter === "all" || a.status === statusFilter;
      const matchesVisit = visitTypeFilter === "all" || a.visitType === visitTypeFilter;
      return matchesSearch && matchesStatus && matchesVisit;
    });
  };

  const sortByDateDesc = (list: AppointmentWithDetails[]) =>
    [...list].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

  const sortByDateAsc = (list: AppointmentWithDetails[]) =>
    [...list].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-orange-100 text-orange-700";
      case "approved": return "bg-blue-100 text-blue-700";
      case "confirmed": return "bg-green-100 text-green-700";
      case "in_progress": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      case "rescheduled": return "bg-purple-100 text-purple-700";
      case "completed": return "bg-emerald-100 text-emerald-700";
      case "cancelled": return "bg-red-100 text-red-700";
      case "rejected": return "bg-rose-100 text-rose-700";
      case "expired": return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
      case "no_show": return "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300";
      default: return "bg-gray-100 text-gray-700";
    }
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
    const PaymentIcon =
      paymentMethod === "card"
        ? CreditCard
        : paymentMethod === "bank_transfer"
        ? Building2
        : paymentMethod === "crypto"
        ? Bitcoin
        : Banknote;

    const isFinal =
      appointment.status === "completed" ||
      appointment.status === "cancelled" ||
      appointment.status === "rejected";
    const isPending = appointment.status === "pending";
    const isApproved = appointment.status === "approved";
    const isConfirmed = appointment.status === "confirmed" || appointment.status === "rescheduled";
    const isInProgress = appointment.status === "in_progress";
    const canMarkPaid =
      paymentStatus === "pending" &&
      paymentMethod !== "card" &&
      !isFinal;

    const isUpdating =
      updateStatusMutation.isPending && updateStatusMutation.variables?.id === appointment.id;
    const isMarkingPaid =
      markPaymentMutation.isPending && markPaymentMutation.variables?.id === appointment.id;

    return (
      <div
        className="flex flex-col gap-3 p-4 border rounded-lg hover-elevate cursor-pointer"
        data-testid={`row-appointment-${appointment.id}`}
        onClick={() => openApptDetails(appointment)}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-10 w-10">
              <AvatarImage src={appointment.patient?.avatarUrl || undefined} />
              <AvatarFallback>{appointment.patient?.firstName?.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium">
                  {appointment.patient?.firstName} {appointment.patient?.lastName}
                </p>
                {(appointment as any).appointmentNumber && (
                  <span
                    className="text-xs font-mono font-semibold text-primary/80 bg-primary/10 px-2 py-0.5 rounded"
                    data-testid={`text-appt-number-${appointment.id}`}
                  >
                    {(appointment as any).appointmentNumber}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {appointment.startTime}
                </span>
                <span className="flex items-center gap-1 capitalize">
                  {isHomeVisit ? <Home className="h-3 w-3" /> : <Video className="h-3 w-3" />}
                  {appointment.visitType}
                </span>
                {payment && (
                  <span className="flex items-center gap-1">
                    <PaymentIcon className="h-3 w-3" />
                    <span className="capitalize">
                      {paymentMethod?.replace("_", " ") || "cash"}
                    </span>
                    <span>•</span>
                    <span className="capitalize">{paymentStatus}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Badge className={getStatusColor(appointment.status)} data-testid={`badge-status-${appointment.id}`}>
              {appointment.status}
            </Badge>
            <Select
              value={appointment.status}
              onValueChange={(v) => updateStatusMutation.mutate({ id: appointment.id, status: v })}
              disabled={isUpdating}
            >
              <SelectTrigger className="h-8 w-[150px]" data-testid={`select-status-${appointment.id}`}>
                <SelectValue placeholder={t("provider_dashboard.change_status", "Change status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">{t("status.pending", "Pending")}</SelectItem>
                <SelectItem value="approved">{t("status.approved", "Approved")}</SelectItem>
                <SelectItem value="confirmed">{t("status.confirmed", "Confirmed")}</SelectItem>
                <SelectItem value="in_progress">{t("status.in_progress", "In Progress")}</SelectItem>
                <SelectItem value="completed">{t("status.completed", "Completed")}</SelectItem>
                <SelectItem value="cancelled">{t("status.cancelled", "Cancelled")}</SelectItem>
                <SelectItem value="cancelled_by_provider">Cancelled by Provider</SelectItem>
                <SelectItem value="rejected">{t("status.rejected", "Rejected")}</SelectItem>
                <SelectItem value="no_show">{t("status.no_show", "No-Show")}</SelectItem>
                <SelectItem value="reschedule_proposed">Reschedule Proposed</SelectItem>
                <SelectItem value="rescheduled">{t("status.rescheduled", "Rescheduled")}</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
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
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`button-directions-${appointment.id}`}
              >
                <Button size="sm" variant="outline">
                  <Navigation className="h-3 w-3 mr-1" />
                  {t("provider.get_directions", "Get Directions")}
                </Button>
              </a>
            )}
          </div>
        )}

        {!isFinal && (
          <div
            className="flex flex-wrap items-center gap-2 pl-14 pt-1"
            onClick={(e) => e.stopPropagation()}
          >
            {isPending && (
              <>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  disabled={isUpdating}
                  onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: "confirmed" })}
                  data-testid={`button-approve-${appointment.id}`}
                >
                  {isUpdating && updateStatusMutation.variables?.status === "confirmed" ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle className="h-3 w-3 mr-1" />
                  )}
                  {t("dashboard.approve", "Approve")}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={isUpdating}
                  onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: "rejected" })}
                  data-testid={`button-reject-${appointment.id}`}
                >
                  {isUpdating && updateStatusMutation.variables?.status === "rejected" ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <X className="h-3 w-3 mr-1" />
                  )}
                  {t("dashboard.reject", "Reject")}
                </Button>
              </>
            )}
            {isConfirmed && (
              <Button
                size="sm"
                disabled={isUpdating}
                onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: "in_progress" })}
                data-testid={`button-start-${appointment.id}`}
              >
                {isUpdating && updateStatusMutation.variables?.status === "in_progress" ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Clock className="h-3 w-3 mr-1" />
                )}
                {t("dashboard.start_visit", "Start Visit")}
              </Button>
            )}
            {isInProgress && (
              <Button
                size="sm"
                disabled={isUpdating}
                onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: "completed" })}
                data-testid={`button-complete-${appointment.id}`}
              >
                {isUpdating && updateStatusMutation.variables?.status === "completed" ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <CheckCircle className="h-3 w-3 mr-1" />
                )}
                {t("dashboard.mark_completed", "Mark Completed")}
              </Button>
            )}
            {canMarkPaid && (
              <Button
                size="sm"
                variant="secondary"
                disabled={isMarkingPaid}
                onClick={() => markPaymentMutation.mutate({ id: appointment.id, status: "completed" })}
                data-testid={`button-mark-paid-${appointment.id}`}
              >
                {isMarkingPaid ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Banknote className="h-3 w-3 mr-1" />
                )}
                {t("dashboard.mark_payment_received", "Mark payment received")}
              </Button>
            )}
            {(isApproved || isConfirmed) && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openReschedule(appointment)}
                  data-testid={`button-reschedule-${appointment.id}`}
                >
                  <CalendarDays className="h-3 w-3 mr-1" />
                  {t("provider_dashboard.reschedule_btn", "Reschedule")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isUpdating}
                  onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: "cancelled" })}
                  data-testid={`button-cancel-${appointment.id}`}
                >
                  <X className="h-3 w-3 mr-1" />
                  {t("dashboard.cancel", "Cancel")}
                </Button>
              </>
            )}
            {appointment.status === "completed" && (
              (appointment as any).invoiceGenerated ? (
                <Button
                  size="sm"
                  variant="outline"
                  asChild
                  data-testid={`button-download-invoice-${appointment.id}`}
                >
                  <a
                    href={`/api/invoices/by-appointment/${appointment.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    {t("provider_dashboard.download_invoice", "Download invoice")}
                  </a>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={generateInvoiceMutation.isPending && generateInvoiceMutation.variables === appointment.id}
                  onClick={() => generateInvoiceMutation.mutate(appointment.id)}
                  data-testid={`button-generate-invoice-${appointment.id}`}
                >
                  {generateInvoiceMutation.isPending && generateInvoiceMutation.variables === appointment.id ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <FileText className="h-3 w-3 mr-1" />
                  )}
                  {t("provider_dashboard.generate_invoice", "Generate invoice")}
                </Button>
              )
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          {/* Dashboard Header */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-indigo-600 text-white p-6 mb-6 shadow-lg">
            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-12 -left-8 h-36 w-36 rounded-full bg-white/10 blur-3xl pointer-events-none" />
            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                  <Shield className="h-7 w-7 text-white" />
                </div>
                <div>
                  <p className="text-white/80 text-sm font-medium uppercase tracking-wider">Provider Dashboard</p>
                  <h1 className="text-2xl md:text-3xl font-bold text-white">
                    {user?.firstName ? `Welcome back, ${user.firstName}` : t("dashboard.provider_title")}
                  </h1>
                  <p className="text-white/70 text-sm mt-0.5">{t("dashboard.provider_desc")}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" className="gap-2 bg-white/20 hover:bg-white/30 text-white border-white/30 border" asChild>
                  <Link href={`/provider/${providerData?.id}`}><FileText className="h-4 w-4" />{t("provider_dashboard.profile_button", "Profile")}</Link>
                </Button>
                <Button variant="secondary" size="sm" className="gap-2 bg-white/20 hover:bg-white/30 text-white border-white/30 border" asChild>
                  <Link href="/provider/setup"><Pencil className="h-4 w-4" />Edit Setup</Link>
                </Button>
                <Button variant="secondary" size="sm" className="gap-2 bg-white/20 hover:bg-white/30 text-white border-white/30 border" asChild>
                  <Link href="/settings"><Settings className="h-4 w-4" />{t("provider_dashboard.settings_button", "Settings")}</Link>
                </Button>
              </div>
            </div>
          </div>

          {/* Pending Approval Banner */}
          {providerData?.status === "pending" && (
            <div className="mb-6 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-5 flex items-start gap-4" data-testid="banner-pending-approval">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">Profile under review</p>
                <p className="text-amber-700 dark:text-amber-400 text-xs mt-1 leading-relaxed">
                  Your provider profile has been submitted and is pending approval by our team. You'll be notified by email once approved. In the meantime, you can set up your services, pricing, availability, and practitioners — everything will go live after approval.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 shrink-0"
                asChild
              >
                <Link href="/provider/setup">{t("provider_dashboard.edit_profile", "Edit profile")}</Link>
              </Button>
            </div>
          )}

          {/* Profile Completeness Widget */}
          <ProfileCompletenessCard provider={providerData} services={providerWithServices?.services} />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="stat-card stat-indigo" data-testid="card-stat-today">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{t("provider_dashboard.stat_today", "Today")}</p>
                  <div className="stat-icon h-9 w-9"><CalendarIcon className="h-4 w-4" /></div>
                </div>
                <p className="text-3xl font-bold mt-1" data-testid="text-today-count">{todayAppointments.length}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("provider_dashboard.stat_today_desc", "appointments scheduled")}</p>
              </CardContent>
            </Card>
            <Card className="stat-card stat-orange" data-testid="card-stat-pending">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{t("provider_dashboard.stat_pending", "Needs Approval")}</p>
                  <div className="stat-icon h-9 w-9"><Clock className="h-4 w-4" /></div>
                </div>
                <p className="text-3xl font-bold mt-1 text-orange-600 dark:text-orange-400" data-testid="text-pending-count">{pendingCount}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("provider_dashboard.stat_pending_desc", "requests awaiting approval")}</p>
              </CardContent>
            </Card>
            <Card className="stat-card stat-sky" data-testid="card-stat-upcoming">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{t("provider_dashboard.stat_upcoming", "Upcoming")}</p>
                  <div className="stat-icon h-9 w-9"><TrendingUp className="h-4 w-4" /></div>
                </div>
                <p className="text-3xl font-bold mt-1" data-testid="text-upcoming-count">{upcomingAppointments.length}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("provider_dashboard.stat_upcoming_desc", "in your queue")}</p>
              </CardContent>
            </Card>
            <Card className="stat-card stat-violet" data-testid="card-stat-patients">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{t("provider_dashboard.stat_patients", "Patients")}</p>
                  <div className="stat-icon h-9 w-9"><Users className="h-4 w-4" /></div>
                </div>
                <p className="text-3xl font-bold mt-1" data-testid="text-patients-count">{uniquePatientCount}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("provider_dashboard.stat_patients_desc", "unique patients")}</p>
              </CardContent>
            </Card>
          </div>

          {/* Modern Revenue Hero with sparkline */}
          <div className="relative overflow-hidden rounded-2xl mb-6 p-6 text-white shadow-xl bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700" data-testid="card-revenue-hero">
            <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
            <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              <div className="md:col-span-1">
                <div className="flex items-center gap-2 text-white/80">
                  <Banknote className="h-4 w-4" />
                  <p className="text-xs font-medium uppercase tracking-wider">
                    {t("provider_dashboard.stat_total", "Total Revenue")}
                  </p>
                </div>
                <p className="text-4xl md:text-5xl font-bold mt-2 tracking-tight" data-testid="text-total-earnings">
                  {formatHUF(totalEarnings)}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${monthlyGrowthPct >= 0 ? "bg-white/25 text-white" : "bg-black/25 text-white"}`}>
                    {monthlyGrowthPct >= 0 ? "▲" : "▼"} {Math.abs(monthlyGrowthPct).toFixed(1)}%
                  </span>
                  <span className="text-xs text-white/80">
                    {t("provider_dashboard.vs_prev_30", "vs previous 30 days")}
                  </span>
                </div>
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
                    <Tooltip
                      formatter={(v: any) => formatHUF(Number(v))}
                      contentStyle={{ background: "rgba(0,0,0,0.7)", border: "none", borderRadius: 8, color: "white" }}
                      labelStyle={{ color: "white" }}
                    />
                    <Area type="monotone" dataKey="v" stroke="#fff" strokeWidth={2} fill="url(#providerSparkGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
                <p className="text-[11px] text-white/70 text-center mt-1">
                  {t("provider_dashboard.last_14_days", "Revenue · last 14 days")}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="relative overflow-hidden rounded-xl p-5 text-white shadow-md bg-gradient-to-br from-amber-500 to-orange-600" data-testid="card-stat-today-revenue">
              <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/10 blur-xl" />
              <div className="relative flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-white/80">
                  {t("provider_dashboard.stat_today_revenue", "Today")}
                </p>
                <DollarSign className="h-4 w-4 text-white/80" />
              </div>
              <p className="text-2xl font-bold mt-2" data-testid="text-today-earnings">{formatHUF(todayEarnings)}</p>
              <p className="text-[11px] text-white/70 mt-1">
                {t("provider_dashboard.stat_today_revenue_desc", "earnings today")}
              </p>
            </div>
            <div className="relative overflow-hidden rounded-xl p-5 text-white shadow-md bg-gradient-to-br from-emerald-500 to-green-600" data-testid="card-stat-weekly">
              <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/10 blur-xl" />
              <div className="relative flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-white/80">
                  {t("provider_dashboard.stat_weekly", "Weekly Revenue")}
                </p>
                <TrendingUp className="h-4 w-4 text-white/80" />
              </div>
              <p className="text-2xl font-bold mt-2" data-testid="text-weekly-earnings">{formatHUF(weeklyEarnings)}</p>
              <p className="text-[11px] text-white/70 mt-1">{t("provider_dashboard.stat_weekly_desc", "last 7 days")}</p>
            </div>
            <div className="relative overflow-hidden rounded-xl p-5 text-white shadow-md bg-gradient-to-br from-teal-500 to-cyan-600" data-testid="card-stat-monthly">
              <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/10 blur-xl" />
              <div className="relative flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-white/80">
                  {t("provider_dashboard.stat_monthly", "Monthly Revenue")}
                </p>
                <Calendar className="h-4 w-4 text-white/80" />
              </div>
              <p className="text-2xl font-bold mt-2" data-testid="text-monthly-earnings">{formatHUF(monthlyEarnings)}</p>
              <p className="text-[11px] text-white/70 mt-1">{t("provider_dashboard.stat_monthly_desc", "last 30 days")}</p>
            </div>
            <div className="relative overflow-hidden rounded-xl p-5 text-white shadow-md bg-gradient-to-br from-violet-500 to-fuchsia-600" data-testid="card-stat-avg-booking">
              <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/10 blur-xl" />
              <div className="relative flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-white/80">
                  {t("provider_dashboard.stat_avg_booking", "Avg per Booking")}
                </p>
                <Banknote className="h-4 w-4 text-white/80" />
              </div>
              <p className="text-2xl font-bold mt-2" data-testid="text-avg-booking">{formatHUF(avgPerBooking)}</p>
              <p className="text-[11px] text-white/70 mt-1">
                {t("provider_dashboard.stat_avg_booking_desc", "{{count}} completed", { count: completedAppointments.length })}
              </p>
            </div>
          </div>

          <Card className="stat-card stat-amber mb-8" data-testid="card-stat-rating">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t("provider_dashboard.stat_rating", "Rating")}</p>
                  <p className="text-2xl font-bold mt-1" data-testid="text-rating">
                    {Number(providerData?.rating || 0).toFixed(1)}
                    <span className="text-base text-muted-foreground font-normal"> / 5</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("provider_dashboard.stat_rating_desc", "{{reviews}} reviews · {{rate}}% completion", { reviews: providerData?.totalReviews || 0, rate: completionRate })}
                  </p>
                </div>
                <div className="stat-icon h-12 w-12"><Star className="h-5 w-5" /></div>
              </div>
            </CardContent>
          </Card>

          {todayAppointments.length > 0 && (
            <Card className="mb-6 border-primary/30 bg-primary/5" data-testid="card-today-section">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
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

          <div className="flex justify-end mb-4 gap-2">
            <Button
              variant="default"
              size="sm"
              className="gap-2"
              data-testid="button-provider-new-ticket"
              onClick={() => setNewTicketOpen(true)}
            >
              <Plus className="h-4 w-4" />
              {t("support.new_ticket", "New ticket")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              data-testid="button-provider-contact-support"
              onClick={async () => {
                try {
                  await fetch("/api/support/contact", { method: "POST", credentials: "include" });
                  window.dispatchEvent(new CustomEvent("open-chat"));
                } catch {}
              }}
            >
              <MessageSquare className="h-4 w-4" />
              {t("provider_dashboard.contact_support", "Contact admin support")}
            </Button>
          </div>

          <NewTicketDialog open={newTicketOpen} onOpenChange={setNewTicketOpen} />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="tabs-colorful tabs-emerald flex flex-nowrap h-auto w-full overflow-x-auto whitespace-nowrap">
              <TabsTrigger value="upcoming" data-testid="tab-upcoming">
                {t("provider_dashboard.tab_upcoming", "Upcoming")}
                {upcomingAppointments.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{upcomingAppointments.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="completed" data-testid="tab-completed">
                {t("provider_dashboard.tab_completed", "Completed")}
                {completedAppointments.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{completedAppointments.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="cancelled" data-testid="tab-cancelled">
                {t("provider_dashboard.tab_cancelled", "Cancelled")}
                {cancelledAppointments.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{cancelledAppointments.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" data-testid="tab-history">
                {t("provider_dashboard.tab_history", "All History")}
                {allAppointments.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{allAppointments.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="calendar" data-testid="tab-calendar">
                <CalendarDays className="h-4 w-4 mr-1" /> {t("provider_dashboard.tab_calendar", "Calendar")}
              </TabsTrigger>
              <TabsTrigger value="reviews" data-testid="tab-reviews">
                <Star className="h-4 w-4 mr-1" /> {t("provider_dashboard.tab_reviews", "Reviews")}
                {providerReviews && providerReviews.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{providerReviews.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="availability" data-testid="tab-availability">{t("provider_dashboard.tab_availability", "Availability")}</TabsTrigger>
              <TabsTrigger value="analytics" data-testid="tab-analytics">
                <TrendingUp className="h-4 w-4 mr-1" /> {t("provider_dashboard.tab_analytics", "Analytics")}
              </TabsTrigger>
              <TabsTrigger value="services" data-testid="tab-services">{t("provider_dashboard.tab_services", "Service Catalog")}</TabsTrigger>
              <TabsTrigger value="preferences" data-testid="tab-preferences">
                <Settings className="h-4 w-4 mr-1" /> {t("provider_dashboard.tab_preferences", "Preferences")}
              </TabsTrigger>
            </TabsList>

            <div className="mt-6 mb-4 flex flex-col sm:flex-row gap-3">
              <Input
                placeholder={t("provider_dashboard.search_placeholder", "Search by patient name, service, or ID...")}
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
              <Button
                variant="outline"
                onClick={() => exportAppointmentsCSV(filterAppointments(allAppointments))}
                data-testid="button-export-csv"
              >
                <Download className="h-4 w-4 mr-2" /> {t("provider_dashboard.export_csv", "Export CSV")}
              </Button>
            </div>

            <TabsContent value="upcoming" className="mt-2 space-y-3">
              {(() => {
                const list = sortByDateAsc(filterAppointments(upcomingAppointments));
                const pendingList = list.filter((a) => a.status === "pending");
                const allPendingSelected =
                  pendingList.length > 0 && pendingList.every((a) => selectedIds.has(a.id));
                const selectedPendingIds = pendingList
                  .filter((a) => selectedIds.has(a.id))
                  .map((a) => a.id);
                const isBulking = bulkStatusMutation.isPending;
                return list.length > 0 ? (
                  <>
                    {pendingList.length > 0 && (
                      <div
                        className="rounded-xl border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 p-4 mb-1"
                        data-testid="action-required-inbox"
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <div className="h-7 w-7 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
                            <Clock className="h-4 w-4 text-white" />
                          </div>
                          <div>
                            <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
                              {t("provider_dashboard.action_required_title", "Action Required — {{count}} appointment request{{s}} awaiting your approval", {
                                count: pendingList.length,
                                s: pendingList.length !== 1 ? "s" : "",
                              })}
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
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700 text-white h-8 px-3 text-xs"
                                    disabled={isUpdatingThis}
                                    onClick={() => updateStatusMutation.mutate({ id: a.id, status: "confirmed" })}
                                    data-testid={`inbox-approve-${a.id}`}
                                  >
                                    {isUpdatingThis && (updateStatusMutation.variables as any)?.status === "confirmed" ? (
                                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    ) : (
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                    )}
                                    {t("dashboard.approve", "Approve")}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-8 px-3 text-xs"
                                    disabled={isUpdatingThis}
                                    onClick={() => updateStatusMutation.mutate({ id: a.id, status: "rejected" })}
                                    data-testid={`inbox-reject-${a.id}`}
                                  >
                                    {isUpdatingThis && (updateStatusMutation.variables as any)?.status === "rejected" ? (
                                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    ) : (
                                      <X className="h-3 w-3 mr-1" />
                                    )}
                                    {t("dashboard.reject", "Reject")}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {pendingList.length > 0 && (
                      <div
                        className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3"
                        data-testid="bulk-action-bar"
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="bulk-select-all"
                            checked={allPendingSelected}
                            onCheckedChange={(checked) => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (checked) pendingList.forEach((a) => next.add(a.id));
                                else pendingList.forEach((a) => next.delete(a.id));
                                return next;
                              });
                            }}
                            data-testid="checkbox-bulk-select-all"
                          />
                          <label
                            htmlFor="bulk-select-all"
                            className="text-sm font-medium cursor-pointer select-none"
                          >
                            {selectedPendingIds.length > 0
                              ? t("provider_dashboard.bulk_selected", "{{count}} selected", { count: selectedPendingIds.length })
                              : t("provider_dashboard.bulk_select_all_pending", "Select all pending ({{count}})", { count: pendingList.length })}
                          </label>
                        </div>
                        {selectedPendingIds.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2 ms-auto">
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white"
                              disabled={isBulking}
                              onClick={() =>
                                bulkStatusMutation.mutate({ ids: selectedPendingIds, status: "confirmed" })
                              }
                              data-testid="button-bulk-approve"
                            >
                              {isBulking && bulkStatusMutation.variables?.status === "confirmed" ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <CheckCircle className="h-3 w-3 mr-1" />
                              )}
                              {t("provider_dashboard.bulk_approve", "Approve selected")}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={isBulking}
                              onClick={() =>
                                bulkStatusMutation.mutate({ ids: selectedPendingIds, status: "rejected" })
                              }
                              data-testid="button-bulk-reject"
                            >
                              {isBulking && bulkStatusMutation.variables?.status === "rejected" ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <X className="h-3 w-3 mr-1" />
                              )}
                              {t("provider_dashboard.bulk_reject", "Reject selected")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isBulking}
                              onClick={clearSelected}
                              data-testid="button-bulk-clear"
                            >
                              {t("provider_dashboard.bulk_clear", "Clear")}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                    {list.map((a) => (
                      <div key={a.id} className="flex items-start gap-3">
                        {a.status === "pending" ? (
                          <div className="pt-6">
                            <Checkbox
                              checked={selectedIds.has(a.id)}
                              onCheckedChange={() => toggleSelected(a.id)}
                              data-testid={`checkbox-select-${a.id}`}
                            />
                          </div>
                        ) : (
                          <div className="w-4" />
                        )}
                        <div className="flex-1">
                          <AppointmentRow appointment={a} />
                        </div>
                      </div>
                    ))}
                  </>
                ) : isLoadingAppointments ? (
                  <AppointmentsListSkeleton />
                ) : (
                  <div className="text-center py-12 text-muted-foreground" data-testid="empty-upcoming">
                    {t("provider_dashboard.empty_upcoming", "No upcoming appointments match your filters")}
                  </div>
                );
              })()}
            </TabsContent>

            <TabsContent value="completed" className="mt-2 space-y-3">
              {(() => {
                const list = sortByDateDesc(filterAppointments(completedAppointments));
                return list.length > 0 ? (
                  list.map((a) => <AppointmentRow key={a.id} appointment={a} />)
                ) : isLoadingAppointments ? (
                  <AppointmentsListSkeleton />
                ) : (
                  <div className="text-center py-12 text-muted-foreground" data-testid="empty-completed">
                    {t("provider_dashboard.empty_completed", "No completed appointments yet")}
                  </div>
                );
              })()}
            </TabsContent>

            <TabsContent value="cancelled" className="mt-2 space-y-3">
              {(() => {
                const list = sortByDateDesc(filterAppointments(cancelledAppointments));
                return list.length > 0 ? (
                  list.map((a) => <AppointmentRow key={a.id} appointment={a} />)
                ) : isLoadingAppointments ? (
                  <AppointmentsListSkeleton />
                ) : (
                  <div className="text-center py-12 text-muted-foreground" data-testid="empty-cancelled">
                    {t("provider_dashboard.empty_cancelled", "No cancelled or rejected appointments")}
                  </div>
                );
              })()}
            </TabsContent>

            <TabsContent value="history" className="mt-2 space-y-3">
              {(() => {
                const list = sortByDateDesc(filterAppointments(allAppointments));
                return list.length > 0 ? (
                  list.map((a) => <AppointmentRow key={a.id} appointment={a} />)
                ) : isLoadingAppointments ? (
                  <AppointmentsListSkeleton />
                ) : (
                  <div className="text-center py-12 text-muted-foreground" data-testid="empty-history">
                    {t("provider_dashboard.empty_history", "No appointments in your history")}
                  </div>
                );
              })()}
            </TabsContent>

            <TabsContent value="calendar" className="mt-2">
              {(() => {
                const counts: Record<string, number> = {};
                allAppointments.forEach((a) => {
                  counts[a.date] = (counts[a.date] || 0) + 1;
                });
                const dayClass = (day: Date) => {
                  const key = day.toISOString().slice(0, 10);
                  return counts[key] ? "relative font-semibold text-primary" : "";
                };
                const selected = (selectedAppt?.date && new Date(selectedAppt.date)) || new Date();
                const selectedKey = selected.toISOString().slice(0, 10);
                const dayAppointments = sortByDateAsc(allAppointments.filter((a) => a.date === selectedKey));
                return (
                  <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
                    <Card>
                      <CardContent className="p-3">
                        <Calendar
                          mode="single"
                          selected={selected}
                          onSelect={(d) => d && setSelectedAppt({ ...(selectedAppt as any), date: d.toISOString().slice(0, 10) } as any)}
                          modifiers={{ hasAppt: (d: Date) => !!counts[d.toISOString().slice(0, 10)] }}
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
                        {new Date(selectedKey).toLocaleDateString(undefined, {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                        <Badge variant="secondary" className="ml-2">{dayAppointments.length}</Badge>
                      </h3>
                      {dayAppointments.length > 0 ? (
                        dayAppointments.map((a) => <AppointmentRow key={a.id} appointment={a} />)
                      ) : (
                        <div className="text-center py-8 text-muted-foreground" data-testid="empty-calendar-day">
                          {t("provider_dashboard.empty_calendar_day", "No appointments on this day")}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </TabsContent>

            <TabsContent value="reviews" className="mt-2 space-y-3">
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
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={r.patient?.avatarUrl || undefined} />
                            <AvatarFallback>{r.patient?.firstName?.charAt(0) || "?"}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">
                              {r.patient?.firstName} {r.patient?.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {r.createdAt ? new Date(r.createdAt as any).toLocaleDateString() : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-amber-500">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-4 w-4 ${i < (r.rating || 0) ? "fill-current" : ""}`}
                            />
                          ))}
                        </div>
                      </div>
                      {r.comment && <p className="text-sm">{r.comment}</p>}
                      {(r as any).providerReply ? (
                        <div className="ml-6 p-3 bg-muted/50 rounded-md border-l-2 border-primary">
                          <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1">
                            <Reply className="h-3 w-3" /> {t("provider_dashboard.your_reply", "Your reply")}
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
                            onChange={(e) =>
                              setReplyDrafts({ ...replyDrafts, [r.id]: e.target.value })
                            }
                            data-testid={`input-reply-${r.id}`}
                          />
                          <Button
                            size="sm"
                            disabled={!replyDrafts[r.id]?.trim() || replyMutation.isPending}
                            onClick={() =>
                              replyMutation.mutate({ id: r.id, reply: replyDrafts[r.id].trim() })
                            }
                            data-testid={`button-reply-${r.id}`}
                          >
                            <Reply className="h-3 w-3 mr-1" /> {t("provider_dashboard.reply_btn", "Reply")}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="availability" className="mt-2 space-y-4">
              <ProviderOfficeHoursCard
                onPublish={(payload) => bulkAvailabilityMutation.mutate(payload)}
                isPendingPublish={bulkAvailabilityMutation.isPending}
              />
            </TabsContent>

            <TabsContent value="analytics" className="mt-2 space-y-4">
              {(() => {
                // Build last-30-days revenue + appointment count series from completed appts
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const days: { day: string; revenue: number; appts: number }[] = [];
                for (let i = 29; i >= 0; i--) {
                  const d = new Date(today);
                  d.setDate(d.getDate() - i);
                  const key = d.toISOString().slice(0, 10);
                  const dayAppts = completedAppointments.filter((a) => a.date === key);
                  const revenue = dayAppts.reduce(
                    (sum, a) => sum + Number((a as any).totalAmount || 0),
                    0,
                  );
                  days.push({
                    day: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
                    revenue,
                    appts: dayAppts.length,
                  });
                }
                return (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">{t("provider_dashboard.revenue_30days", "Revenue · last 30 days")}</CardTitle>
                      </CardHeader>
                      <CardContent style={{ height: 280 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={days}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                            <Tooltip formatter={(v: any) => fmtHUF(Number(v))} />
                            <Line
                              type="monotone"
                              dataKey="revenue"
                              stroke="hsl(var(--primary))"
                              strokeWidth={2}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">{t("provider_dashboard.appointments_30days", "Appointments · last 30 days")}</CardTitle>
                      </CardHeader>
                      <CardContent style={{ height: 240 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={days}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                            <Tooltip />
                            <Bar dataKey="appts" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </>
                );
              })()}
            </TabsContent>

            <TabsContent value="services" className="mt-6 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("provider_dashboard.services", "Services")}</CardTitle>
                    <CardDescription>
                      {t(
                        "provider_dashboard.services_desc",
                        "These services were assigned to you by an administrator. You can pause/resume each one and override its price, duration and visit fees, but the catalog itself can only be changed by an admin."
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!providerWithServices?.services?.length && (
                      <div className="text-center py-10 text-sm text-muted-foreground border-2 border-dashed rounded-lg" data-testid="empty-services">
                        <Tag className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
                        {t("provider_dashboard.empty_services_title", "No services have been assigned to you yet. An administrator will grant you services from the catalog.")}
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {providerWithServices?.services?.map(s => {
                        const sa: any = s;
                        const visitFees = [
                          { icon: Home, label: t("provider_dashboard.fee_home", "Home"), val: Number(sa.homeVisitFee || 0) },
                          { icon: Building2, label: t("provider_dashboard.fee_clinic", "Clinic"), val: Number(sa.clinicFee || 0) },
                          { icon: Video, label: t("provider_dashboard.fee_online", "Online"), val: Number(sa.telemedicineFee || 0) },
                        ].filter(v => v.val > 0);
                        const isArchived = !!sa.deletedAt;
                        return (
                          <div
                            key={s.id}
                            className={`group relative border rounded-xl bg-card p-4 transition-all hover-elevate ${!s.isActive ? "opacity-60" : ""} ${isArchived ? "border-dashed border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/10" : ""}`}
                            data-testid={`row-service-${s.id}`}
                          >
                            <div
                              className="absolute left-0 top-3 bottom-3 w-1 rounded-r"
                              style={{ backgroundColor: sa.calendarColor || "#10b981" }}
                              aria-hidden
                            />
                            <div className="pl-2">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {sa.imageUrl ? (
                                    <img src={sa.imageUrl} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0" />
                                  ) : (
                                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                      <Tag className="h-4 w-4 text-primary" />
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="font-semibold truncate" data-testid={`text-service-name-${s.id}`}>{s.name}</p>
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                      <Clock className="h-3 w-3" /> {s.duration}{t("provider_dashboard.min_short", "m")}
                                      {sa.maxPatientsPerDay ? <> · <Users className="h-3 w-3" /> {sa.maxPatientsPerDay}/{t("provider_dashboard.day_short", "d")}</> : null}
                                    </p>
                                  </div>
                                </div>
                                {!isArchived && (
                                  <Switch
                                    checked={!!s.isActive}
                                    onCheckedChange={(v) => toggleServiceMutation.mutate({ id: s.id, isActive: v })}
                                    data-testid={`switch-service-active-${s.id}`}
                                  />
                                )}
                              </div>
                              <div className="flex items-baseline justify-between mt-1">
                                <span className="text-lg font-bold text-primary" data-testid={`text-service-price-${s.id}`}>
                                  ${Number(s.price).toFixed(2)}
                                </span>
                                <Badge
                                  variant={isArchived ? "outline" : (s.isActive ? "default" : "secondary")}
                                  className={`text-[10px] ${isArchived ? "border-amber-500/60 text-amber-700 dark:text-amber-400" : ""}`}
                                  data-testid={`badge-service-status-${s.id}`}
                                >
                                  {isArchived
                                    ? t("provider_dashboard.archived", "Archived")
                                    : s.isActive
                                      ? t("provider_dashboard.active", "Active")
                                      : t("provider_dashboard.paused", "Paused")}
                                </Badge>
                              </div>
                              {visitFees.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {visitFees.map((vf, i) => {
                                    const Ic = vf.icon;
                                    return (
                                      <span
                                        key={i}
                                        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-muted text-foreground/80"
                                        data-testid={`chip-fee-${vf.label.toLowerCase()}-${s.id}`}
                                      >
                                        <Ic className="h-3 w-3" /> {vf.label}: +${vf.val.toFixed(0)}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                              <div className="flex justify-end gap-1 mt-3 pt-2 border-t border-dashed">
                                {isArchived ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8"
                                    onClick={() => restoreServiceMutation.mutate(s.id)}
                                    data-testid={`button-restore-service-${s.id}`}
                                  >
                                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> {t("provider_dashboard.restore", "Restore")}
                                  </Button>
                                ) : (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8"
                                      onClick={() => { setPricingDraft({ ...sa }); setPricingService(s); }}
                                      data-testid={`button-pricing-service-${s.id}`}
                                    >
                                      <DollarSign className="h-3.5 w-3.5 mr-1" /> {t("provider_dashboard.pricing", "Pricing")}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8"
                                      onClick={() => { setEditingService(s); setServiceFormOpen(true); }}
                                      data-testid={`button-edit-service-${s.id}`}
                                    >
                                      <Pencil className="h-3.5 w-3.5 mr-1" /> {t("provider_dashboard.edit", "Edit")}
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8 text-destructive"
                                      onClick={() => {
                                        const msg = t(
                                          "provider_dashboard.confirm_delete_service_warning",
                                          "Delete this service?\n\nIf it has been used in past bookings, it will be archived instead of deleted so historical data and pricing remain intact."
                                        );
                                        if (confirm(msg)) deleteServiceMutation.mutate(s.id);
                                      }}
                                      data-testid={`button-delete-service-${s.id}`}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

              </div>

              {providerData?.id && (
                <PractitionerManagementCard
                  providerId={providerData.id}
                  services={(providerWithServices?.services?.filter(s => s.isActive) ?? []) as any}
                />
              )}

              {/* Service Packages */}
              <Card data-testid="card-service-packages">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Tag className="h-5 w-5 text-primary" />
                      {t("provider_dashboard.service_packages", "Service packages")}
                    </CardTitle>
                    <CardDescription>
                      {t("provider_dashboard.service_packages_desc", "Bundle multiple services together at a special package price.")}
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    onClick={openCreatePackage}
                    disabled={!providerWithServices?.services?.filter(s => s.isActive).length || providerWithServices.services.filter(s => s.isActive).length < 2}
                    data-testid="button-add-package"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {t("provider_dashboard.new_package", "New package")}
                  </Button>
                </CardHeader>
                <CardContent>
                  {(!providerWithServices?.services?.filter(s => s.isActive).length || providerWithServices.services.filter(s => s.isActive).length < 2) && (
                    <div className="text-center py-8 text-sm text-muted-foreground" data-testid="empty-packages-need-services">
                      {t("provider_dashboard.packages_need_services", "Add at least 2 active services before you can create a package.")}
                    </div>
                  )}
                  {providerWithServices?.services?.filter(s => s.isActive).length! >= 2 && !packages?.length && (
                    <div className="text-center py-8 text-sm text-muted-foreground" data-testid="empty-packages">
                      {t("provider_dashboard.no_packages", "No packages yet. Create your first bundle to offer combined services at a discount.")}
                    </div>
                  )}
                  {packages && packages.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {packages.map(pkg => {
                        const fullPrice = pkg.services.reduce((sum, s) => sum + Number(s.price), 0);
                        const savings = Math.max(0, fullPrice - Number(pkg.price));
                        return (
                          <div
                            key={pkg.id}
                            className="border rounded-lg p-4 bg-card hover-elevate"
                            data-testid={`row-package-${pkg.id}`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-semibold truncate" data-testid={`text-package-name-${pkg.id}`}>{pkg.name}</p>
                                  {!pkg.isActive && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                      {t("provider_dashboard.paused", "Paused")}
                                    </span>
                                  )}
                                </div>
                                {pkg.description && (
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{pkg.description}</p>
                                )}
                              </div>
                              <div className="flex flex-col items-end shrink-0">
                                <p className="font-bold text-primary text-lg" data-testid={`text-package-price-${pkg.id}`}>
                                  {fmtHUF(Number(pkg.price))}
                                </p>
                                {savings > 0 && (
                                  <p className="text-[11px] text-green-600 dark:text-green-400 line-through opacity-80">
                                    {fmtHUF(fullPrice)}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-1.5 my-3">
                              {pkg.services.map(s => (
                                <span
                                  key={s.id}
                                  className="text-[11px] px-2 py-1 rounded-md bg-muted text-foreground"
                                  data-testid={`chip-package-service-${pkg.id}-${s.id}`}
                                >
                                  {s.name}
                                </span>
                              ))}
                            </div>

                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                              <span>{pkg.services.length} {t("provider_dashboard.services_count", "services")}</span>
                              {pkg.duration ? (
                                <span>{pkg.duration} {t("provider_dashboard.minutes_short", "min")}</span>
                              ) : null}
                              {savings > 0 && (
                                <span className="text-green-600 dark:text-green-400 font-medium">
                                  {t("provider_dashboard.save_amount", "Save {{amount}}", { amount: fmtHUF(savings) })}
                                </span>
                              )}
                            </div>

                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1"
                                onClick={() => openEditPackage(pkg)}
                                data-testid={`button-edit-package-${pkg.id}`}
                              >
                                <Edit className="h-3.5 w-3.5 mr-1" />
                                {t("provider_dashboard.edit", "Edit")}
                              </Button>
                              <Button
                                size="sm"
                                variant={pkg.isActive ? "default" : "outline"}
                                onClick={() => togglePackageMutation.mutate({ id: pkg.id, isActive: !pkg.isActive })}
                                data-testid={`button-toggle-package-${pkg.id}`}
                              >
                                {pkg.isActive ? t("provider_dashboard.active", "Active") : t("provider_dashboard.paused", "Paused")}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => {
                                  if (confirm(t("provider_dashboard.confirm_delete_package", "Delete this package?"))) {
                                    deletePackageMutation.mutate(pkg.id);
                                  }
                                }}
                                data-testid={`button-delete-package-${pkg.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Package Create/Edit Dialog */}
              <Dialog open={packageDialogOpen} onOpenChange={setPackageDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-package-form">
                  <DialogHeader>
                    <DialogTitle>
                      {editingPackage
                        ? t("provider_dashboard.edit_package", "Edit package")
                        : t("provider_dashboard.create_package", "Create package")}
                    </DialogTitle>
                    <DialogDescription>
                      {t("provider_dashboard.package_form_desc", "Bundle multiple services into a single offer at a special price.")}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="pkg-name">{t("provider_dashboard.package_name", "Package name")}</Label>
                      <Input
                        id="pkg-name"
                        value={pkgName}
                        onChange={e => setPkgName(e.target.value)}
                        placeholder={t("provider_dashboard.package_name_ph", "e.g. Wellness Bundle")}
                        data-testid="input-package-name"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="pkg-desc">{t("provider_dashboard.description", "Description")}</Label>
                      <Textarea
                        id="pkg-desc"
                        value={pkgDescription}
                        onChange={e => setPkgDescription(e.target.value)}
                        placeholder={t("provider_dashboard.package_desc_ph", "What's included and who is it for?")}
                        rows={2}
                        data-testid="input-package-description"
                      />
                    </div>

                    <div>
                      <Label className="mb-2 block">
                        {t("provider_dashboard.included_services", "Included services")}
                        <span className="text-xs text-muted-foreground ml-2">
                          {t("provider_dashboard.select_at_least_2", "(select at least 2)")}
                        </span>
                      </Label>
                      <div className="border rounded-lg max-h-56 overflow-y-auto divide-y">
                        {providerWithServices?.services?.filter(s => s.isActive).map(s => {
                          const checked = pkgServiceIds.includes(s.id);
                          return (
                            <label
                              key={s.id}
                              className="flex items-center gap-3 p-3 cursor-pointer hover-elevate"
                              data-testid={`checkbox-package-service-${s.id}`}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => {
                                  if (v) {
                                    setPkgServiceIds(prev => [...prev, s.id]);
                                  } else {
                                    setPkgServiceIds(prev => prev.filter(id => id !== s.id));
                                  }
                                }}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{s.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {fmtHUF(Number(s.price))} · {s.duration} {t("provider_dashboard.minutes_short", "min")}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                      {pkgServiceIds.length >= 2 && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {t("provider_dashboard.individual_total", "Individual total:")} <span className="font-medium">{fmtHUF(pkgServicesTotal)}</span>
                          {pkgDurationTotal > 0 && (
                            <> · {pkgDurationTotal} {t("provider_dashboard.minutes_short", "min")}</>
                          )}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="pkg-price">{t("provider_dashboard.package_price", "Package price")}</Label>
                        <Input
                          id="pkg-price"
                          type="number"
                          step="0.01"
                          min="0"
                          value={pkgPrice}
                          onChange={e => setPkgPrice(e.target.value)}
                          placeholder="0.00"
                          data-testid="input-package-price"
                        />
                        {pkgSavings > 0 && (
                          <p className="text-xs text-green-600 dark:text-green-400">
                            {t("provider_dashboard.customer_saves", "Customer saves {{amount}}", { amount: fmtHUF(pkgSavings) })}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pkg-duration">
                          {t("provider_dashboard.duration_minutes", "Duration (min)")}
                          <span className="text-xs text-muted-foreground ml-1">{t("provider_dashboard.optional", "optional")}</span>
                        </Label>
                        <Input
                          id="pkg-duration"
                          type="number"
                          min="0"
                          value={pkgDuration}
                          onChange={e => setPkgDuration(e.target.value)}
                          placeholder={pkgDurationTotal ? String(pkgDurationTotal) : "60"}
                          data-testid="input-package-duration"
                        />
                      </div>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setPackageDialogOpen(false)} data-testid="button-cancel-package">
                      {t("common.cancel", "Cancel")}
                    </Button>
                    <Button
                      onClick={() => savePackageMutation.mutate()}
                      disabled={
                        savePackageMutation.isPending ||
                        !pkgName.trim() ||
                        !pkgPrice ||
                        Number(pkgPrice) <= 0 ||
                        pkgServiceIds.length < 2
                      }
                      data-testid="button-save-package"
                    >
                      {savePackageMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {editingPackage ? t("common.save", "Save") : t("provider_dashboard.create", "Create")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </TabsContent>

            {/* ── PREFERENCES TAB ── */}
            <TabsContent value="preferences" className="mt-6 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    {t("provider_dashboard.preferences_tab_title", "Practice Preferences")}
                  </CardTitle>
                  <CardDescription>
                    {t("provider_dashboard.preferences_tab_desc", "Configure payment options, capacity limits, and contact preferences.")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Currency + Max Patients */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">{t("preferences.currency", "Currency")}</Label>
                      <Select
                        value={prefData.currency}
                        onValueChange={(v) => setPrefDraft(p => ({ ...(p ?? prefData), currency: v }))}
                      >
                        <SelectTrigger className="rounded-xl" data-testid="select-pref-currency">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="HUF">HUF — Hungarian Forint</SelectItem>
                          <SelectItem value="EUR">EUR — Euro</SelectItem>
                          <SelectItem value="USD">USD — US Dollar</SelectItem>
                          <SelectItem value="GBP">GBP — British Pound</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">{t("preferences.max_patients", "Max Patients Per Day")}</Label>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        placeholder="e.g. 10"
                        value={prefData.maxPatientsPerDay}
                        onChange={(e) => setPrefDraft(p => ({ ...(p ?? prefData), maxPatientsPerDay: e.target.value }))}
                        className="rounded-xl"
                        data-testid="input-pref-max-patients"
                      />
                    </div>
                  </div>

                  {/* Preferred Contact */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">{t("preferences.contact_method", "Preferred Contact Method")}</Label>
                    <Select
                      value={prefData.preferredContactMethod}
                      onValueChange={(v) => setPrefDraft(p => ({ ...(p ?? prefData), preferredContactMethod: v }))}
                    >
                      <SelectTrigger className="rounded-xl" data-testid="select-pref-contact">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">{t("preferences.contact_email", "Email")}</SelectItem>
                        <SelectItem value="phone">{t("preferences.contact_phone", "Phone")}</SelectItem>
                        <SelectItem value="both">{t("preferences.contact_both", "Both")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Emergency Contact */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">{t("preferences.emergency_contact", "Emergency Contact Number")}</Label>
                    <Input
                      placeholder="+36 …"
                      value={prefData.emergencyContact}
                      onChange={(e) => setPrefDraft(p => ({ ...(p ?? prefData), emergencyContact: e.target.value }))}
                      className="rounded-xl"
                      data-testid="input-pref-emergency-contact"
                    />
                  </div>

                  {/* Payment Methods */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t("preferences.payment_methods", "Payment Methods Accepted")}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {PAYMENT_METHOD_OPTIONS.map(opt => {
                        const checked = prefData.paymentMethods.includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              const next = checked
                                ? prefData.paymentMethods.filter(v => v !== opt.value)
                                : [...prefData.paymentMethods, opt.value];
                              setPrefDraft(p => ({ ...(p ?? prefData), paymentMethods: next }));
                            }}
                            className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border text-sm font-medium transition-all text-left ${
                              checked
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-background text-muted-foreground hover:border-primary/40"
                            }`}
                            data-testid={`button-pref-payment-${opt.value}`}
                          >
                            <div className={`w-4 h-4 rounded-[4px] border flex items-center justify-center flex-shrink-0 ${checked ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                              {checked && <CheckCircle className="w-3 h-3 text-white" />}
                            </div>
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* On-Call Availability */}
                  <div
                    className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                      prefData.onCallAvailability ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    }`}
                    onClick={() => setPrefDraft(p => ({ ...(p ?? prefData), onCallAvailability: !prefData.onCallAvailability }))}
                    data-testid="toggle-pref-oncall"
                  >
                    <Checkbox checked={prefData.onCallAvailability} onCheckedChange={() => {}} />
                    <div>
                      <p className="text-sm font-medium">{t("preferences.oncall", "On-call Availability")}</p>
                      <p className="text-xs text-muted-foreground">{t("preferences.oncall_desc", "Available for emergency or after-hours calls")}</p>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      className="gap-2 rounded-xl"
                      disabled={savePreferencesMutation.isPending || !prefDraft}
                      onClick={() =>
                        savePreferencesMutation.mutate({
                          currency: prefData.currency,
                          paymentMethods: prefData.paymentMethods,
                          preferredContactMethod: prefData.preferredContactMethod,
                          onCallAvailability: prefData.onCallAvailability,
                          maxPatientsPerDay: prefData.maxPatientsPerDay ? Number(prefData.maxPatientsPerDay) : undefined,
                          emergencyContact: prefData.emergencyContact,
                        })
                      }
                      data-testid="button-save-preferences"
                    >
                      {savePreferencesMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      {t("common.save_changes", "Save changes")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

          </Tabs>

          {/* Appointment details modal */}
          <Dialog
            open={!!selectedAppt && !rescheduleOpen}
            onOpenChange={(open) => {
              if (!open) setSelectedAppt(null);
            }}
          >
            <DialogContent className="max-w-lg" data-testid="dialog-appointment-details">
              <DialogHeader>
                <DialogTitle>{t("provider_dashboard.appointment_details", "Appointment details")}</DialogTitle>
              </DialogHeader>
              {selectedAppt && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">{t("provider_dashboard.patient_label", "Patient")}</p>
                      <p className="font-medium">
                        {selectedAppt.patient?.firstName} {selectedAppt.patient?.lastName}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("provider_dashboard.status_label", "Status")}</p>
                      <Badge className={getStatusColor(selectedAppt.status)}>{selectedAppt.status}</Badge>
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
                      <p className="font-medium">{fmtHUF(Number((selectedAppt as any).totalAmount || 0))}</p>
                    </div>
                  </div>
                  {(selectedAppt as any).patientAddress && (
                    <div>
                      <p className="text-muted-foreground text-sm">{t("provider_dashboard.address_label", "Address")}</p>
                      <p className="text-sm">{(selectedAppt as any).patientAddress}</p>
                    </div>
                  )}
                  {selectedAppt.notes && (
                    <div>
                      <p className="text-muted-foreground text-sm">{t("provider_dashboard.patient_notes", "Patient notes")}</p>
                      <p className="text-sm">{selectedAppt.notes}</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className="text-sm font-medium flex items-center gap-1">
                      <MessageSquare className="h-4 w-4" /> {t("provider_dashboard.private_note_label", "Private note (only you)")}
                    </p>
                    <Textarea
                      value={privateNoteDraft}
                      onChange={(e) => setPrivateNoteDraft(e.target.value)}
                      rows={3}
                      placeholder={t("provider_dashboard.private_note_placeholder", "Internal notes about this appointment...")}
                      data-testid="textarea-private-note"
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        savePrivateNoteMutation.mutate({
                          id: selectedAppt.id,
                          privateNote: privateNoteDraft,
                        })
                      }
                      disabled={savePrivateNoteMutation.isPending}
                      data-testid="button-save-private-note"
                    >
                      {savePrivateNoteMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      {t("provider_dashboard.save_note_btn", "Save note")}
                    </Button>
                  </div>
                </div>
              )}
              <DialogFooter className="gap-2">
                {selectedAppt &&
                  (selectedAppt.status === "approved" ||
                    selectedAppt.status === "confirmed" ||
                    selectedAppt.status === "rescheduled") && (
                    <Button
                      variant="outline"
                      onClick={() => openReschedule(selectedAppt)}
                      data-testid="button-open-reschedule"
                    >
                      <CalendarDays className="h-4 w-4 mr-2" /> {t("provider_dashboard.reschedule_btn", "Reschedule")}
                    </Button>
                  )}
                <Button variant="ghost" onClick={() => setSelectedAppt(null)}>{t("provider_dashboard.close_btn", "Close")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Reschedule dialog */}
          <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
            <DialogContent data-testid="dialog-reschedule">
              <DialogHeader>
                <DialogTitle>{t("provider_dashboard.reschedule_title", "Reschedule appointment")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>{t("provider_dashboard.date_label", "Date")}</Label>
                  <Input
                    type="date"
                    value={rescheduleData.date}
                    onChange={(e) => setRescheduleData({ ...rescheduleData, date: e.target.value })}
                    data-testid="input-reschedule-date"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t("provider_dashboard.start_time_label", "Start time")}</Label>
                    <Input
                      type="time"
                      value={rescheduleData.startTime}
                      onChange={(e) => setRescheduleData({ ...rescheduleData, startTime: e.target.value })}
                      data-testid="input-reschedule-start"
                    />
                  </div>
                  <div>
                    <Label>{t("provider_dashboard.end_time_label", "End time")}</Label>
                    <Input
                      type="time"
                      value={rescheduleData.endTime}
                      onChange={(e) => setRescheduleData({ ...rescheduleData, endTime: e.target.value })}
                      data-testid="input-reschedule-end"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setRescheduleOpen(false)}>{t("provider_dashboard.cancel_btn", "Cancel")}</Button>
                <Button
                  onClick={() => {
                    if (!selectedAppt) return;
                    rescheduleMutation.mutate({
                      id: selectedAppt.id,
                      date: rescheduleData.date,
                      startTime: rescheduleData.startTime,
                      endTime: rescheduleData.endTime,
                    });
                  }}
                  disabled={rescheduleMutation.isPending}
                  data-testid="button-confirm-reschedule"
                >
                  {rescheduleMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  {t("provider_dashboard.save_changes_btn", "Save changes")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <ServiceFormDialog
            open={serviceFormOpen}
            onOpenChange={(o) => { setServiceFormOpen(o); if (!o) setEditingService(null); }}
            service={editingService}
            providerId={providerData?.id}
            providerType={providerData?.providerType}
            lockCategory
          />

          <Sheet open={!!pricingService} onOpenChange={(o) => { if (!o) setPricingService(null); }}>
            <SheetContent className="sm:max-w-md overflow-y-auto" data-testid="sheet-pricing">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  {t("provider_dashboard.edit_pricing", "Edit pricing")}
                </SheetTitle>
                <SheetDescription>
                  {pricingService?.name}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 py-6">
                <div className="space-y-1.5">
                  <Label htmlFor="ps-price">{t("provider_dashboard.base_price", "Base price")}</Label>
                  <Input
                    id="ps-price"
                    type="number"
                    step="0.01"
                    value={pricingDraft.price ?? ""}
                    onChange={(e) => setPricingDraft({ ...pricingDraft, price: e.target.value })}
                    data-testid="input-pricing-base"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ps-home" className="flex items-center gap-1 text-xs"><Home className="h-3 w-3" /> {t("provider_dashboard.fee_home", "Home")}</Label>
                    <Input id="ps-home" type="number" step="0.01"
                      value={pricingDraft.homeVisitFee ?? ""}
                      onChange={(e) => setPricingDraft({ ...pricingDraft, homeVisitFee: e.target.value })}
                      data-testid="input-pricing-home" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ps-clinic" className="flex items-center gap-1 text-xs"><Building2 className="h-3 w-3" /> {t("provider_dashboard.fee_clinic", "Clinic")}</Label>
                    <Input id="ps-clinic" type="number" step="0.01"
                      value={pricingDraft.clinicFee ?? ""}
                      onChange={(e) => setPricingDraft({ ...pricingDraft, clinicFee: e.target.value })}
                      data-testid="input-pricing-clinic" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ps-online" className="flex items-center gap-1 text-xs"><Video className="h-3 w-3" /> {t("provider_dashboard.fee_online", "Online")}</Label>
                    <Input id="ps-online" type="number" step="0.01"
                      value={pricingDraft.telemedicineFee ?? ""}
                      onChange={(e) => setPricingDraft({ ...pricingDraft, telemedicineFee: e.target.value })}
                      data-testid="input-pricing-online" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ps-dur" className="flex items-center gap-1 text-xs"><Clock className="h-3 w-3" /> {t("provider_dashboard.duration", "Duration (min)")}</Label>
                    <Input id="ps-dur" type="number"
                      value={pricingDraft.duration ?? ""}
                      onChange={(e) => setPricingDraft({ ...pricingDraft, duration: parseInt(e.target.value) || 0 })}
                      data-testid="input-pricing-duration" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ps-cap" className="flex items-center gap-1 text-xs"><Users className="h-3 w-3" /> {t("provider_dashboard.max_per_day", "Max per day")}</Label>
                    <Input id="ps-cap" type="number"
                      value={pricingDraft.maxPatientsPerDay ?? ""}
                      onChange={(e) => setPricingDraft({ ...pricingDraft, maxPatientsPerDay: e.target.value ? parseInt(e.target.value) : null })}
                      data-testid="input-pricing-cap" />
                  </div>
                </div>
                <div className="rounded-md border p-3 text-xs text-muted-foreground bg-muted/30">
                  {t("provider_dashboard.pricing_hint", "Visit-type fees are added on top of the base price at booking time.")}
                </div>
              </div>
              <SheetFooter className="flex-row justify-end gap-2 sm:space-x-0">
                <Button variant="outline" onClick={() => setPricingService(null)} data-testid="button-pricing-cancel">
                  {t("provider_dashboard.cancel", "Cancel")}
                </Button>
                <Button
                  onClick={async () => {
                    if (!pricingService) return;
                    try {
                      await apiRequest("PATCH", `/api/services/${pricingService.id}`, {
                        price: pricingDraft.price,
                        homeVisitFee: pricingDraft.homeVisitFee,
                        clinicFee: pricingDraft.clinicFee,
                        telemedicineFee: pricingDraft.telemedicineFee,
                        duration: pricingDraft.duration,
                        maxPatientsPerDay: pricingDraft.maxPatientsPerDay,
                      });
                      toast({ title: t("provider_dashboard.pricing_saved", "Pricing saved") });
                      queryClient.invalidateQueries({ queryKey: [`/api/providers/${providerData?.id}`] });
                      queryClient.invalidateQueries({ queryKey: ["/api/providers/me"] });
                      setPricingService(null);
                    } catch (e: any) {
                      toast({ title: t("provider_dashboard.pricing_error", "Failed to save pricing"), description: e.message, variant: "destructive" });
                    }
                  }}
                  data-testid="button-pricing-save"
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {t("provider_dashboard.save", "Save")}
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </main>
      <Footer />
    </div>
  );
}

// ───────── Visual weekly schedule card ─────────
function ProviderOfficeHoursCard({
  onPublish,
  isPendingPublish,
}: {
  onPublish: (payload: { dates: string[]; slots: { startTime: string; endTime: string }[]; replaceExisting: boolean }) => void;
  isPendingPublish?: boolean;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/provider/office-hours"] });
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [autoReplyMessage, setAutoReplyMessage] = useState("Thanks for your message — I'll respond during my office hours.");
  const [autoReplyDirty, setAutoReplyDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setAutoReplyEnabled(!!data.autoReplyEnabled);
      if (data.autoReplyMessage) setAutoReplyMessage(data.autoReplyMessage);
    }
  }, [data]);

  const saveSchedule = useMutation({
    mutationFn: (weeklySchedule: WeeklySchedule) =>
      apiRequest("PATCH", "/api/provider/office-hours", {
        weeklySchedule,
        autoReplyEnabled,
        autoReplyMessage,
      }),
    onSuccess: () => {
      toast({ title: t("provider_dashboard.schedule_saved", "Schedule saved") });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/office-hours"] });
    },
    onError: () => toast({ title: t("provider_dashboard.failed_save", "Failed to save"), variant: "destructive" }),
  });

  const saveAutoReply = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", "/api/provider/office-hours", {
        autoReplyEnabled,
        autoReplyMessage,
      }),
    onSuccess: () => {
      toast({ title: t("provider_dashboard.auto_reply_saved", "Auto-reply saved") });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/office-hours"] });
      setAutoReplyDirty(false);
    },
    onError: () => toast({ title: t("provider_dashboard.failed_save", "Failed to save"), variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Visual grid */}
      <Card>
        <CardHeader>
          <CardTitle>{t("provider_dashboard.weekly_schedule_title", "Weekly schedule")}</CardTitle>
          <CardDescription>
            {t("provider_dashboard.weekly_schedule_desc", "Click or drag cells to mark your available hours. Save to update your schedule, or publish to generate bookable slots for this week.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WeeklyScheduleGrid
            schedule={data?.weeklySchedule}
            onSave={(sched) => saveSchedule.mutate(sched)}
            onPublish={onPublish}
            isPendingSave={saveSchedule.isPending}
            isPendingPublish={isPendingPublish}
          />
        </CardContent>
      </Card>

      {/* Auto-reply card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("provider_dashboard.auto_reply_title", "Auto-reply")}</CardTitle>
          <CardDescription>
            {t("provider_dashboard.auto_reply_desc", "Send an automatic response when a patient messages you outside of office hours.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Switch
              id="autoReply"
              checked={autoReplyEnabled}
              onCheckedChange={(v) => { setAutoReplyEnabled(v); setAutoReplyDirty(true); }}
              data-testid="switch-auto-reply"
            />
            <Label htmlFor="autoReply" className="cursor-pointer">
              {t("provider_dashboard.auto_reply_toggle", "Enable auto-reply")}
            </Label>
          </div>
          <Textarea
            rows={3}
            placeholder={t("provider_dashboard.auto_reply_placeholder", "Type your auto-reply message...")}
            value={autoReplyMessage}
            onChange={(e) => { setAutoReplyMessage(e.target.value); setAutoReplyDirty(true); }}
            disabled={!autoReplyEnabled}
            data-testid="input-auto-reply-message"
          />
          <div className="flex items-center justify-between">
            {autoReplyDirty ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">● Unsaved changes</p>
            ) : (
              <span />
            )}
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl gap-2"
              onClick={() => saveAutoReply.mutate()}
              disabled={saveAutoReply.isPending || !autoReplyDirty}
              data-testid="button-save-auto-reply"
            >
              {saveAutoReply.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {t("provider_dashboard.save_auto_reply", "Save")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
