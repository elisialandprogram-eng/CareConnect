import { useLocation } from "wouter";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "lucide-react";
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
} from "recharts";

function ServiceStaffList({ serviceId, onDelete, onToggle }: { serviceId: string; onDelete: (id: string) => void; onToggle: (args: {id: string, isActive: boolean}) => void }) {
  const { data: practitioners } = useQuery<any[]>({
    queryKey: [`/api/services/${serviceId}/practitioners`],
    enabled: !!serviceId,
  });

  return (
    <div className="space-y-2 mt-2">
      {practitioners?.length === 0 && <p className="text-sm text-muted-foreground italic">No staff assigned</p>}
      {practitioners?.map((sp) => (
        <div key={sp.id} className="flex items-center justify-between p-2 bg-muted/50 rounded border text-sm">
          <span>{sp.practitioner.name} ({new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 }).format(Number(sp.fee))})</span>
          <div className="flex items-center gap-1">
            <Button 
              size="sm" 
              variant="ghost" 
              className={sp.isActive ? "text-primary" : "text-muted-foreground"}
              onClick={() => onToggle({ id: sp.id, isActive: !sp.isActive })}
            >
              {sp.isActive ? "Active" : "Paused"}
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

export default function ProviderDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [, setLocation] = useLocation();

  const { data: providerData, isLoading: isLoadingProvider } = useQuery<ProviderWithServices>({
    queryKey: ["/api/provider/me"],
  });

  const { data: practitioners } = useQuery<Practitioner[]>({
    queryKey: [`/api/providers/${providerData?.id}/practitioners`],
    enabled: !!providerData?.id,
  });

  const { data: appointments } = useQuery<AppointmentWithDetails[]>({
    queryKey: ["/api/appointments/provider"],
    enabled: !!providerData?.id,
    refetchInterval: 5000,
  });

  const { data: providerWithServices } = useQuery<ProviderWithServices>({
    queryKey: ["/api/providers", providerData?.id],
    enabled: !!providerData?.id,
  });

  const { data: subServices } = useQuery<any[]>({
    queryKey: ["/api/sub-services", providerData?.providerType],
    enabled: !!providerData?.providerType,
  });

  const addPractitionerMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/practitioners", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/providers/${providerData?.id}/practitioners`] });
      toast({ title: "Practitioner added" });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/service-practitioners", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [/api\/services\/.*\/practitioners/] });
      toast({ title: "Practitioner assigned to service" });
    },
  });

  const addServiceMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/services", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers", providerData?.id] });
      toast({ title: "Service added successfully" });
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
          title: "Appointment completed",
          description: `Invoice ${data.invoice.invoiceNumber} was generated and emailed to the patient.`,
        });
      } else {
        toast({ title: "Appointment updated" });
      }
    },
    onError: () => {
      toast({ title: "Failed to update appointment", variant: "destructive" });
    },
  });

  const markPaymentMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "completed" }) => {
      const response = await apiRequest("PATCH", `/api/appointments/${id}/payment-status`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/provider"] });
      toast({ title: "Payment marked as received" });
    },
    onError: () => {
      toast({ title: "Failed to update payment", variant: "destructive" });
    },
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/services/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers", providerData?.id] });
      toast({ title: "Service deleted" });
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

  const deletePractitionerMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/practitioners/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/providers/${providerData?.id}/practitioners`] });
      toast({ title: "Practitioner deleted" });
    },
  });

  const togglePractitionerMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/practitioners/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/providers/${providerData?.id}/practitioners`] });
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/service-practitioners/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [/api\/services\/.*\/practitioners/] });
      toast({ title: "Assignment removed" });
    },
  });

  const toggleAssignmentMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/service-practitioners/${id}`, { isActive });
    },
    onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: [/api\/services\/.*\/practitioners/] });
    },
  });

  const [selectedSubServiceId, setSelectedSubServiceId] = useState("");
  const [servicePrice, setServicePrice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [visitTypeFilter, setVisitTypeFilter] = useState<string>("all");
  const [selectedAppt, setSelectedAppt] = useState<AppointmentWithDetails | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleData, setRescheduleData] = useState({ date: "", startTime: "", endTime: "" });
  const [privateNoteDraft, setPrivateNoteDraft] = useState("");
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [availabilityWeek, setAvailabilityWeek] = useState<Date>(new Date());
  const [weekSlots, setWeekSlots] = useState<Record<string, { startTime: string; endTime: string }[]>>({});

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
      toast({ title: "Reply posted" });
    },
    onError: () => toast({ title: "Failed to post reply", variant: "destructive" }),
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
      toast({ title: "Appointment updated" });
      setRescheduleOpen(false);
      setSelectedAppt(null);
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const savePrivateNoteMutation = useMutation({
    mutationFn: async ({ id, privateNote }: { id: string; privateNote: string }) => {
      const res = await apiRequest("PATCH", `/api/appointments/${id}`, { privateNote });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/provider"] });
      toast({ title: "Note saved" });
    },
  });

  // Bulk availability
  const bulkAvailabilityMutation = useMutation({
    mutationFn: async (payload: { dates: string[]; slots: { startTime: string; endTime: string }[]; replaceExisting: boolean }) => {
      const res = await apiRequest("POST", "/api/availability/bulk", payload);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: `Created ${data.count} time slots` });
      setAvailabilityOpen(false);
      setWeekSlots({});
    },
    onError: () => toast({ title: "Failed to save availability", variant: "destructive" }),
  });

  // Service reorder + duplicate
  const duplicateServiceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/services/${id}/duplicate`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers", providerData?.id] });
      toast({ title: "Service duplicated" });
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

  const fmtHUF = (n: number) =>
    new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 }).format(n || 0);

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
    toast({ title: `Exported ${list.length} appointments` });
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
            <h1 className="text-2xl font-bold mb-3 text-foreground tracking-tight">Complete Your Profile</h1>
            <p className="text-muted-foreground mb-8 text-balance leading-relaxed">
              To start managing appointments and services, you'll need to set up your professional profile first.
            </p>
            <div className="flex flex-col gap-3">
              <Button size="lg" className="w-full font-semibold shadow-sm" onClick={() => setLocation("/provider/setup")}>
                Setup Provider Profile
              </Button>
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setLocation("/providers")}>
                Browse Other Providers
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
            <h1 className="text-2xl font-bold mb-3 text-foreground tracking-tight">Awaiting Approval</h1>
            <p className="text-muted-foreground mb-8 text-balance leading-relaxed">
              Your provider profile has been submitted and is currently awaiting administrator approval. You will have full access once your account is verified.
            </p>
            <Button variant="outline" className="w-full" onClick={() => setLocation("/")}>
              Back to Home
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

  const formatHUF = (amount: number) =>
    new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 }).format(amount);

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
      case "rescheduled": return "bg-purple-100 text-purple-700";
      case "completed": return "bg-emerald-100 text-emerald-700";
      case "cancelled": return "bg-red-100 text-red-700";
      case "rejected": return "bg-rose-100 text-rose-700";
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
              <p className="font-medium">
                {appointment.patient?.firstName} {appointment.patient?.lastName}
              </p>
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
          <Badge className={getStatusColor(appointment.status)} data-testid={`badge-status-${appointment.id}`}>
            {appointment.status}
          </Badge>
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
                  disabled={isUpdating}
                  onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: "approved" })}
                  data-testid={`button-approve-${appointment.id}`}
                >
                  {isUpdating && updateStatusMutation.variables?.status === "approved" ? (
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
            {isApproved && (
              <Button
                size="sm"
                disabled={isUpdating}
                onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: "confirmed" })}
                data-testid={`button-confirm-${appointment.id}`}
              >
                {isUpdating && updateStatusMutation.variables?.status === "confirmed" ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <CheckCircle className="h-3 w-3 mr-1" />
                )}
                {t("dashboard.confirm", "Confirm")}
              </Button>
            )}
            {isConfirmed && (
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
                  Reschedule
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
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-semibold">{t("dashboard.provider_title")}</h1>
              <p className="text-muted-foreground">{t("dashboard.provider_desc")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild><Link href={`/provider/${providerData?.id}`}><FileText className="h-4 w-4 mr-2" />Profile</Link></Button>
              <Button variant="outline" asChild><Link href="/provider/settings"><Settings className="h-4 w-4 mr-2" />Settings</Link></Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card data-testid="card-stat-today">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Today</p>
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-3xl font-bold mt-1" data-testid="text-today-count">{todayAppointments.length}</p>
                <p className="text-xs text-muted-foreground mt-1">appointments scheduled</p>
              </CardContent>
            </Card>
            <Card data-testid="card-stat-pending">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <Clock className="h-4 w-4 text-orange-600" />
                </div>
                <p className="text-3xl font-bold mt-1 text-orange-600" data-testid="text-pending-count">{pendingCount}</p>
                <p className="text-xs text-muted-foreground mt-1">awaiting your action</p>
              </CardContent>
            </Card>
            <Card data-testid="card-stat-upcoming">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Upcoming</p>
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                </div>
                <p className="text-3xl font-bold mt-1" data-testid="text-upcoming-count">{upcomingAppointments.length}</p>
                <p className="text-xs text-muted-foreground mt-1">in your queue</p>
              </CardContent>
            </Card>
            <Card data-testid="card-stat-patients">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Patients</p>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-3xl font-bold mt-1" data-testid="text-patients-count">{uniquePatientCount}</p>
                <p className="text-xs text-muted-foreground mt-1">unique patients</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card data-testid="card-stat-weekly">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Weekly Revenue</p>
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="text-2xl font-bold mt-1" data-testid="text-weekly-earnings">{formatHUF(weeklyEarnings)}</p>
                <p className="text-xs text-muted-foreground mt-1">last 7 days</p>
              </CardContent>
            </Card>
            <Card data-testid="card-stat-monthly">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Monthly Revenue</p>
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="text-2xl font-bold mt-1" data-testid="text-monthly-earnings">{formatHUF(monthlyEarnings)}</p>
                <p className="text-xs text-muted-foreground mt-1">last 30 days</p>
              </CardContent>
            </Card>
            <Card data-testid="card-stat-total-revenue">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <Banknote className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="text-2xl font-bold mt-1" data-testid="text-total-earnings">{formatHUF(totalEarnings)}</p>
                <p className="text-xs text-muted-foreground mt-1">{completedAppointments.length} completed</p>
              </CardContent>
            </Card>
            <Card data-testid="card-stat-rating">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Rating</p>
                  <Star className="h-4 w-4 text-amber-500" />
                </div>
                <p className="text-2xl font-bold mt-1" data-testid="text-rating">
                  {Number(providerData?.rating || 0).toFixed(1)}
                  <span className="text-base text-muted-foreground font-normal"> / 5</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {providerData?.totalReviews || 0} reviews · {completionRate}% completion
                </p>
              </CardContent>
            </Card>
          </div>

          {todayAppointments.length > 0 && (
            <Card className="mb-6 border-primary/30 bg-primary/5" data-testid="card-today-section">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CalendarIcon className="h-5 w-5 text-primary" />
                  Today's Schedule
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

          <Tabs defaultValue="upcoming" className="w-full">
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="upcoming" data-testid="tab-upcoming">
                Upcoming
                {upcomingAppointments.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{upcomingAppointments.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="completed" data-testid="tab-completed">
                Completed
                {completedAppointments.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{completedAppointments.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="cancelled" data-testid="tab-cancelled">
                Cancelled
                {cancelledAppointments.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{cancelledAppointments.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" data-testid="tab-history">
                All History
                {allAppointments.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{allAppointments.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="calendar" data-testid="tab-calendar">
                <CalendarDays className="h-4 w-4 mr-1" /> Calendar
              </TabsTrigger>
              <TabsTrigger value="reviews" data-testid="tab-reviews">
                <Star className="h-4 w-4 mr-1" /> Reviews
                {providerReviews && providerReviews.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{providerReviews.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="availability" data-testid="tab-availability">Availability</TabsTrigger>
              <TabsTrigger value="analytics" data-testid="tab-analytics">
                <TrendingUp className="h-4 w-4 mr-1" /> Analytics
              </TabsTrigger>
              <TabsTrigger value="services" data-testid="tab-services">Services & Staff</TabsTrigger>
            </TabsList>

            <div className="mt-6 mb-4 flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Search by patient name, service, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
                data-testid="input-search-appointments"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="rescheduled">Rescheduled</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Select value={visitTypeFilter} onValueChange={setVisitTypeFilter}>
                <SelectTrigger className="w-full sm:w-[160px]" data-testid="select-visit-filter">
                  <SelectValue placeholder="Visit Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="home">Home Visit</SelectItem>
                  <SelectItem value="clinic">Clinic</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => exportAppointmentsCSV(filterAppointments(allAppointments))}
                data-testid="button-export-csv"
              >
                <Download className="h-4 w-4 mr-2" /> Export CSV
              </Button>
            </div>

            <TabsContent value="upcoming" className="mt-2 space-y-3">
              {(() => {
                const list = sortByDateAsc(filterAppointments(upcomingAppointments));
                return list.length > 0 ? (
                  list.map((a) => <AppointmentRow key={a.id} appointment={a} />)
                ) : (
                  <div className="text-center py-12 text-muted-foreground" data-testid="empty-upcoming">
                    No upcoming appointments match your filters
                  </div>
                );
              })()}
            </TabsContent>

            <TabsContent value="completed" className="mt-2 space-y-3">
              {(() => {
                const list = sortByDateDesc(filterAppointments(completedAppointments));
                return list.length > 0 ? (
                  list.map((a) => <AppointmentRow key={a.id} appointment={a} />)
                ) : (
                  <div className="text-center py-12 text-muted-foreground" data-testid="empty-completed">
                    No completed appointments yet
                  </div>
                );
              })()}
            </TabsContent>

            <TabsContent value="cancelled" className="mt-2 space-y-3">
              {(() => {
                const list = sortByDateDesc(filterAppointments(cancelledAppointments));
                return list.length > 0 ? (
                  list.map((a) => <AppointmentRow key={a.id} appointment={a} />)
                ) : (
                  <div className="text-center py-12 text-muted-foreground" data-testid="empty-cancelled">
                    No cancelled or rejected appointments
                  </div>
                );
              })()}
            </TabsContent>

            <TabsContent value="history" className="mt-2 space-y-3">
              {(() => {
                const list = sortByDateDesc(filterAppointments(allAppointments));
                return list.length > 0 ? (
                  list.map((a) => <AppointmentRow key={a.id} appointment={a} />)
                ) : (
                  <div className="text-center py-12 text-muted-foreground" data-testid="empty-history">
                    No appointments in your history
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
                          Highlighted dates have appointments
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
                          No appointments on this day
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
                  No reviews yet
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
                            <Reply className="h-3 w-3" /> Your reply
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
                            placeholder="Reply to this review..."
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
                            <Reply className="h-3 w-3 mr-1" /> Reply
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="availability" className="mt-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Weekly availability
                    <Button onClick={() => setAvailabilityOpen(true)} data-testid="button-open-availability">
                      <Plus className="h-4 w-4 mr-2" /> Add weekly slots
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    Use the weekly slot manager to publish recurring availability across multiple days at once. Select the week start, define your time slots, and apply to chosen weekdays.
                  </p>
                </CardContent>
              </Card>
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
                        <CardTitle className="text-base">Revenue · last 30 days (HUF)</CardTitle>
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
                        <CardTitle className="text-base">Appointments · last 30 days</CardTitle>
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
                  <CardHeader><CardTitle>Services</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-2">
                      <Select value={selectedSubServiceId} onValueChange={setSelectedSubServiceId}>
                        <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                        <SelectContent>{subServices?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input type="number" placeholder="Fee" value={servicePrice} onChange={e => setServicePrice(e.target.value)} />
                      <Button onClick={handleAddService}>Add</Button>
                    </div>
                    <div className="space-y-2">
                      {providerWithServices?.services?.map(s => (
                        <div key={s.id} className="flex justify-between items-center p-3 border rounded-lg">
                          <span>{s.name} ({formatHUF(Number(s.price))})</span>
                          <div className="flex gap-1">
                            <Button size="sm" variant={s.isActive ? "default" : "outline"} onClick={() => toggleServiceMutation.mutate({ id: s.id, isActive: !s.isActive })}>{s.isActive ? "Active" : "Paused"}</Button>
                            <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteServiceMutation.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Staff</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <form className="flex gap-2" onSubmit={e => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      addPractitionerMutation.mutate({ name: fd.get("name"), title: fd.get("title"), providerId: providerData?.id });
                      e.currentTarget.reset();
                    }}>
                      <Input name="name" placeholder="Name" required />
                      <Input name="title" placeholder="Title" />
                      <Button type="submit">Add</Button>
                    </form>
                    <div className="space-y-2">
                      {practitioners?.map(p => (
                        <div key={p.id} className="flex justify-between items-center p-3 border rounded-lg">
                          <span>{p.name} ({p.title})</span>
                          <div className="flex gap-1">
                            <Button 
                              size="sm" 
                              variant={(p as any).isActive ? "default" : "outline"} 
                              onClick={() => togglePractitionerMutation.mutate({ id: p.id, isActive: !(p as any).isActive })}
                            >
                              {(p as any).isActive ? "Active" : "Paused"}
                            </Button>
                            <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deletePractitionerMutation.mutate(p.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle>Staff Assignments</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <form className="grid grid-cols-1 md:grid-cols-4 gap-2" onSubmit={e => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    assignMutation.mutate({ serviceId: fd.get("serviceId"), practitionerId: fd.get("practitionerId"), fee: fd.get("fee") });
                  }}>
                    <Select name="serviceId"><SelectTrigger><SelectValue placeholder="Service" /></SelectTrigger>
                      <SelectContent>{providerWithServices?.services?.filter(s => s.isActive).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select name="practitionerId"><SelectTrigger><SelectValue placeholder="Staff" /></SelectTrigger>
                      <SelectContent>{practitioners?.filter(p => p.isActive).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input name="fee" type="number" placeholder="Fee" required />
                    <Button type="submit">Assign</Button>
                  </form>
                  <div className="space-y-4">
                    {providerWithServices?.services?.filter(s => s.isActive).map(s => (
                      <div key={s.id} className="p-4 border rounded-lg bg-card">
                        <p className="font-semibold mb-2">{s.name}</p>
                        <ServiceStaffList serviceId={s.id} onDelete={deleteAssignmentMutation.mutate} onToggle={toggleAssignmentMutation.mutate} />
                      </div>
                    ))}
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
                <DialogTitle>Appointment details</DialogTitle>
              </DialogHeader>
              {selectedAppt && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Patient</p>
                      <p className="font-medium">
                        {selectedAppt.patient?.firstName} {selectedAppt.patient?.lastName}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Status</p>
                      <Badge className={getStatusColor(selectedAppt.status)}>{selectedAppt.status}</Badge>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Date & time</p>
                      <p className="font-medium">
                        {selectedAppt.date} · {selectedAppt.startTime}
                        {(selectedAppt as any).endTime && ` - ${(selectedAppt as any).endTime}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Visit type</p>
                      <p className="font-medium capitalize">{selectedAppt.visitType}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Service</p>
                      <p className="font-medium">{(selectedAppt as any).service?.name || "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Total</p>
                      <p className="font-medium">{fmtHUF(Number((selectedAppt as any).totalAmount || 0))}</p>
                    </div>
                  </div>
                  {(selectedAppt as any).patientAddress && (
                    <div>
                      <p className="text-muted-foreground text-sm">Address</p>
                      <p className="text-sm">{(selectedAppt as any).patientAddress}</p>
                    </div>
                  )}
                  {selectedAppt.notes && (
                    <div>
                      <p className="text-muted-foreground text-sm">Patient notes</p>
                      <p className="text-sm">{selectedAppt.notes}</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className="text-sm font-medium flex items-center gap-1">
                      <MessageSquare className="h-4 w-4" /> Private note (only you)
                    </p>
                    <Textarea
                      value={privateNoteDraft}
                      onChange={(e) => setPrivateNoteDraft(e.target.value)}
                      rows={3}
                      placeholder="Internal notes about this appointment..."
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
                      Save note
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
                      <CalendarDays className="h-4 w-4 mr-2" /> Reschedule
                    </Button>
                  )}
                <Button variant="ghost" onClick={() => setSelectedAppt(null)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Reschedule dialog */}
          <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
            <DialogContent data-testid="dialog-reschedule">
              <DialogHeader>
                <DialogTitle>Reschedule appointment</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={rescheduleData.date}
                    onChange={(e) => setRescheduleData({ ...rescheduleData, date: e.target.value })}
                    data-testid="input-reschedule-date"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Start time</Label>
                    <Input
                      type="time"
                      value={rescheduleData.startTime}
                      onChange={(e) => setRescheduleData({ ...rescheduleData, startTime: e.target.value })}
                      data-testid="input-reschedule-start"
                    />
                  </div>
                  <div>
                    <Label>End time</Label>
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
                <Button variant="ghost" onClick={() => setRescheduleOpen(false)}>Cancel</Button>
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
                  Save changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Weekly availability dialog */}
          <Dialog open={availabilityOpen} onOpenChange={setAvailabilityOpen}>
            <DialogContent className="max-w-2xl" data-testid="dialog-availability">
              <DialogHeader>
                <DialogTitle>Weekly availability</DialogTitle>
              </DialogHeader>
              <WeeklyAvailabilityForm
                onSubmit={(payload) => bulkAvailabilityMutation.mutate(payload)}
                isPending={bulkAvailabilityMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function WeeklyAvailabilityForm({
  onSubmit,
  isPending,
}: {
  onSubmit: (payload: { dates: string[]; slots: { startTime: string; endTime: string }[]; replaceExisting: boolean }) => void;
  isPending: boolean;
}) {
  const [weekStart, setWeekStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [days, setDays] = useState<boolean[]>([true, true, true, true, true, false, false]);
  const [slots, setSlots] = useState<{ startTime: string; endTime: string }[]>([
    { startTime: "09:00", endTime: "12:00" },
    { startTime: "13:00", endTime: "17:00" },
  ]);
  const [replaceExisting, setReplaceExisting] = useState(false);

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const handleSubmit = () => {
    const start = new Date(weekStart);
    const dates: string[] = [];
    days.forEach((on, i) => {
      if (!on) return;
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    });
    if (!dates.length || !slots.length) return;
    onSubmit({ dates, slots, replaceExisting });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Week starting (Monday)</Label>
        <Input
          type="date"
          value={weekStart}
          onChange={(e) => setWeekStart(e.target.value)}
          data-testid="input-week-start"
        />
      </div>
      <div>
        <Label className="mb-2 block">Days of the week</Label>
        <div className="flex flex-wrap gap-2">
          {dayLabels.map((label, i) => (
            <Button
              key={label}
              type="button"
              variant={days[i] ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(days.map((d, j) => (j === i ? !d : d)))}
              data-testid={`button-day-${label.toLowerCase()}`}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <div>
        <Label className="mb-2 block">Time slots</Label>
        <div className="space-y-2">
          {slots.map((slot, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                type="time"
                value={slot.startTime}
                onChange={(e) => {
                  const updated = [...slots];
                  updated[idx] = { ...updated[idx], startTime: e.target.value };
                  setSlots(updated);
                }}
                data-testid={`input-slot-start-${idx}`}
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="time"
                value={slot.endTime}
                onChange={(e) => {
                  const updated = [...slots];
                  updated[idx] = { ...updated[idx], endTime: e.target.value };
                  setSlots(updated);
                }}
                data-testid={`input-slot-end-${idx}`}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setSlots(slots.filter((_, j) => j !== idx))}
                data-testid={`button-remove-slot-${idx}`}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSlots([...slots, { startTime: "09:00", endTime: "10:00" }])}
            data-testid="button-add-slot"
          >
            <Plus className="h-4 w-4 mr-1" /> Add slot
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="replaceExisting"
          checked={replaceExisting}
          onChange={(e) => setReplaceExisting(e.target.checked)}
          data-testid="checkbox-replace-existing"
        />
        <label htmlFor="replaceExisting" className="text-sm">
          Replace existing slots on selected dates
        </label>
      </div>
      <DialogFooter>
        <Button onClick={handleSubmit} disabled={isPending} data-testid="button-save-availability">
          {isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          Save weekly availability
        </Button>
      </DialogFooter>
    </div>
  );
}