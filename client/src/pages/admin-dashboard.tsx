import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { ReferralLeaderboard } from "@/components/admin/referral-leaderboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrency } from "@/lib/currency";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Loader2, Shield, Users, Building, Trash2, Edit, Plus, Tag, DollarSign,
  Calendar, FileText, Settings, MessageSquare, Activity, BarChart3,
  Bell, HelpCircle, CheckCircle, CheckCircle2, XCircle, Clock, Eye, ListTree, Search, UserCheck,
  Wallet as WalletIcon, Briefcase, Sparkles as SparklesIcon, Sparkles, Send, Lock, MapPin,
  UserPlus, RefreshCw, ChevronDown, ChevronUp, Stethoscope, GraduationCap,
  Mail, Phone, MoreVertical, AlertCircle, Inbox, UserCog, RotateCcw, CheckCheck,
  Globe, CalendarDays, Hash, Timer, TrendingUp, Banknote, ArrowUpRight, ArrowDownRight,
  PiggyBank, Receipt, Wallet, CreditCard, Copy, Save
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { User, ProviderWithUser, PromoCode, ProviderPricingOverride, SubService, Practitioner, ServicePractitioner, Service } from "@shared/schema";
import { WeeklyScheduleGrid, type WeeklySchedule } from "@/components/weekly-schedule-grid";
import { ServiceFormDialog } from "@/components/service-form-dialog";
import { AssignServicesDialog } from "@/components/assign-services-dialog";
import { ServiceCatalogHierarchy } from "@/components/service-catalog-hierarchy";
import { useLocation } from "wouter";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import type { TaxSetting, InsertTaxSetting } from "@shared/schema";

// Practitioner Management Component
function PractitionerManagement({ providerId }: { providerId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: practitioners, refetch: refetchPractitioners } = useQuery<Practitioner[]>({
    queryKey: [`/api/providers/${providerId}/practitioners`],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", `/api/providers/${providerId}/practitioners`, data);
    },
    onSuccess: () => {
      refetchPractitioners();
      toast({ title: t("admin.practitioner_added") });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/practitioners/${id}`);
    },
    onSuccess: () => {
      refetchPractitioners();
      toast({ title: t("admin.practitioner_removed") });
    },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Input id="practitioner-name" placeholder={t("admin.name")} />
        <Input id="practitioner-title" placeholder={t("admin.title_label")} />
        <Input id="practitioner-spec" placeholder={t("admin.specialization_label")} className="col-span-2" />
        <Button 
          className="col-span-2"
          onClick={() => {
            const name = (document.getElementById('practitioner-name') as HTMLInputElement).value;
            const title = (document.getElementById('practitioner-title') as HTMLInputElement).value;
            const specialization = (document.getElementById('practitioner-spec') as HTMLInputElement).value;
            if (name) createMutation.mutate({ name, title, specialization });
          }}
        >
          <Plus className="h-4 w-4 mr-2" /> {t("admin.add_new")} {t("admin.practitioners")}
        </Button>
      </div>
      <div className="space-y-2">
        {practitioners?.map((p) => (
          <div key={p.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-md border">
            <div>
              <p className="font-medium">{p.title} {p.name}</p>
              <p className="text-xs text-muted-foreground">{p.specialization}</p>
            </div>
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMutation.mutate(p.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Service Practitioner Linkage Component
function ServicePractitionerAssignment({ serviceId, providerId }: { serviceId: string, providerId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedPId, setSelectedPId] = useState("");
  const [fee, setFee] = useState("");
  
  const { data: practitioners } = useQuery<Practitioner[]>({
    queryKey: [`/api/providers/${providerId}/practitioners`],
  });
  const { data: assigned, refetch } = useQuery<(ServicePractitioner & { practitioner: Practitioner })[]>({
    queryKey: [`/api/services/${serviceId}/practitioners`],
  });

  const assignMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", `/api/services/${serviceId}/practitioners`, data);
    },
    onSuccess: () => {
      refetch();
      toast({ title: t("admin.assigned_to_service") });
      setSelectedPId("");
      setFee("");
    },
  });

  return (
    <div className="space-y-4 mt-4 pt-4 border-t">
      <h4 className="text-sm font-semibold">{t("admin.assigned_practitioners")}</h4>
      <div className="grid grid-cols-3 gap-2">
        <Select value={selectedPId} onValueChange={setSelectedPId}>
          <SelectTrigger className="col-span-2">
            <SelectValue placeholder={t("admin.select_practitioner")} />
          </SelectTrigger>
          <SelectContent>
            {practitioners?.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input 
          type="number" 
          placeholder={t("admin.fee")} 
          value={fee}
          onChange={(e) => setFee(e.target.value)}
        />
        <Button 
          className="col-span-3"
          onClick={() => {
            if (selectedPId && fee) assignMutation.mutate({ practitionerId: selectedPId, fee });
          }}
          disabled={assignMutation.isPending}
        >
          {assignMutation.isPending ? t("admin.assigning") : t("admin.assign")}
        </Button>
      </div>
      <div className="space-y-2">
        {assigned?.map(a => (
          <div key={a.id} className="flex items-center justify-between text-sm p-2 bg-accent/50 rounded">
            <span>{a.practitioner.name}</span>
            <span className="font-mono">${a.fee}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const adminProviderSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  phone: z.string().optional(),
  city: z.string().min(2),
  type: z.enum(["physiotherapist", "doctor", "nurse"]),
  specialization: z.string().min(3),
  bio: z.string().min(50),
  yearsExperience: z.coerce.number().min(0).max(50),
  education: z.string().min(3),
  consultationFee: z.coerce.number().min(1),
  homeVisitFee: z.coerce.number().optional(),
  languages: z.array(z.string()).min(1),
  availableDays: z.array(z.string()).min(1),
});

type AdminProviderData = z.infer<typeof adminProviderSchema>;

const languageOptions = [
  { value: "english", label: "English" },
  { value: "hungarian", label: "Hungarian" },
  { value: "german", label: "German" },
  { value: "french", label: "French" },
];

const dayOptions = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];


function AdminServicesPanel({
  providerId,
  services,
  refetchServices,
  fmtMoney,
}: {
  providerId: string;
  services: any[];
  refetchServices: () => void;
  fmtMoney: (n: any) => string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [serviceFormOpen, setServiceFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/admin/services/${id}`, { isActive });
    },
    onSuccess: () => {
      refetchServices();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/services/${id}`);
    },
    onSuccess: () => {
      refetchServices();
      toast({ title: t("admin.service_deleted", "Service deleted") });
    },
  });

  return (
    <div className="space-y-4">
      <Tabs defaultValue="services" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto" data-testid="tabs-admin-services">
          <TabsTrigger value="services" data-testid="tab-admin-services">
            <ListTree className="h-4 w-4 mr-1.5" />
            {t("admin.services", "Services")}
          </TabsTrigger>
          <TabsTrigger value="staff" data-testid="tab-admin-staff">
            <UserCheck className="h-4 w-4 mr-1.5" />
            {t("admin.staff", "Staff")}
          </TabsTrigger>
          <TabsTrigger value="timesheet" data-testid="tab-admin-timesheet">
            <Clock className="h-4 w-4 mr-1.5" />
            {t("admin.time_sheet", "Time Sheet")}
          </TabsTrigger>
          <TabsTrigger value="extras" data-testid="tab-admin-extras">
            <SparklesIcon className="h-4 w-4 mr-1.5" />
            {t("admin.extras", "Extras")}
          </TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-admin-service-settings">
            <Settings className="h-4 w-4 mr-1.5" />
            {t("admin.settings", "Settings")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="space-y-4 pt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>{t("admin.services", "Services")}</CardTitle>
              <div className="flex gap-2">
                <AssignServicesDialog
                  providerId={providerId}
                  onAssigned={refetchServices}
                  trigger={
                    <Button size="sm" variant="outline" data-testid="button-admin-assign-from-catalog">
                      <ListTree className="h-4 w-4 mr-1" /> {t("admin.assign_from_catalog", "Assign from catalog")}
                    </Button>
                  }
                />
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingService(null);
                    setServiceFormOpen(true);
                  }}
                  data-testid="button-admin-add-service"
                >
                  <Plus className="h-4 w-4 mr-1" /> {t("admin.add", "Add")}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {!services?.length && (
                <div
                  className="text-center py-6 text-sm text-muted-foreground"
                  data-testid="empty-admin-services"
                >
                  {t("admin.no_services", "No services yet. Add the first one.")}
                </div>
              )}
              {services?.map((s: any) => (
                <div
                  key={s.id}
                  className="flex justify-between items-center p-3 border rounded-lg"
                  data-testid={`row-admin-service-${s.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: s.calendarColor || "#10b981" }}
                    />
                    {s.imageUrl && (
                      <img
                        src={s.imageUrl}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    )}
                    <div>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtMoney(s.price)} · {s.duration}m
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingService(s);
                        setServiceFormOpen(true);
                      }}
                      data-testid={`button-admin-edit-service-${s.id}`}
                    >
                      {t("admin.edit", "Edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant={s.isActive ? "default" : "outline"}
                      onClick={() =>
                        toggleMutation.mutate({ id: s.id, isActive: !s.isActive })
                      }
                      data-testid={`button-admin-toggle-service-${s.id}`}
                    >
                      {s.isActive
                        ? t("admin.active", "Active")
                        : t("admin.paused", "Paused")}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => deleteMutation.mutate(s.id)}
                      data-testid={`button-admin-delete-service-${s.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {t("admin.staff_assignments", "Staff Assignments")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!services?.length ? (
                <div
                  className="text-center py-10 text-sm text-muted-foreground"
                  data-testid="empty-admin-staff"
                >
                  {t(
                    "admin.no_services_for_staff",
                    "Add a service first to assign staff to it.",
                  )}
                </div>
              ) : (
                services.map((s: any) => (
                  <div key={s.id} className="p-4 border rounded-lg bg-card">
                    <p className="font-semibold mb-2">{s.name}</p>
                    <ServicePractitionerAssignment
                      serviceId={s.id}
                      providerId={providerId}
                    />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timesheet" className="pt-4">
          <AdminTimesheetPanel providerId={providerId} />
        </TabsContent>

        <TabsContent value="extras" className="pt-4">
          <EmptyTabCard
            icon={<SparklesIcon className="h-10 w-10" />}
            title={t("admin.extras", "Extras")}
            description={t(
              "admin.extras_desc",
              "Offer paid add-ons customers can attach to their booking. Coming soon.",
            )}
            testId="empty-admin-extras"
          />
        </TabsContent>

        <TabsContent value="settings" className="pt-4">
          <EmptyTabCard
            icon={<Settings className="h-10 w-10" />}
            title={t("admin.service_settings", "Service Settings")}
            description={t(
              "admin.service_settings_desc",
              "Booking rules, buffer times and notifications for this service. Coming soon.",
            )}
            testId="empty-admin-service-settings"
          />
        </TabsContent>
      </Tabs>

      <ServiceFormDialog
        open={serviceFormOpen}
        onOpenChange={(o) => {
          setServiceFormOpen(o);
          if (!o) refetchServices();
        }}
        service={editingService}
        providerId={providerId}
        adminMode
      />
    </div>
  );
}

// Admin queue for provider-staged edits on existing services.
// Each row shows the diff between current values and the proposed values, plus
// Approve / Reject controls. Approving merges the staged values into the live
// service row; rejecting clears the staging fields and unlocks the service.
function ServicePendingChangesPanel() {
  const { toast } = useToast();
  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/services/pending-changes"],
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/services/${id}/approve-changes`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Changes applied" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/services/pending-changes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/services-overview"] });
    },
    onError: (e: any) => toast({ title: "Approve failed", description: e?.message, variant: "destructive" }),
  });

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/admin/services/${id}/reject-changes`, { reason });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Changes rejected" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/services/pending-changes"] });
    },
    onError: (e: any) => toast({ title: "Reject failed", description: e?.message, variant: "destructive" }),
  });

  // Field labels are kept short — only the fields the provider is allowed to
  // submit appear here. Anything submitted outside the server's whitelist is
  // dropped and never appears in this UI.
  const FIELD_LABELS: Record<string, string> = {
    subServiceId: "Category",
    name: "Name",
    description: "Description",
    duration: "Duration (min)",
    price: "Base price",
    homeVisitFee: "Home fee",
    clinicFee: "Clinic fee",
    telemedicineFee: "Online fee",
    emergencyFee: "Emergency fee",
    depositAmount: "Deposit",
    enableDeposit: "Deposit on?",
    locationMode: "Location mode",
  };

  const renderVal = (v: any) => {
    if (v == null || v === "") return "—";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    return String(v);
  };

  return (
    <Card data-testid="card-service-pending-changes">
      <CardHeader>
        <CardTitle>Pending service edits</CardTitle>
        <CardDescription>
          Edits submitted by providers for admin-managed services. Services with pending edits are paused for booking until you approve or reject.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-6">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-no-pending-edits">
            No pending edits.
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((row: any) => {
              const provName = row.provider_business_name
                || `${row.provider_first_name || ""} ${row.provider_last_name || ""}`.trim()
                || row.provider_email
                || "—";
              const staged = row.pending_changes || {};
              const keys = Object.keys(staged).filter((k) => FIELD_LABELS[k]);
              return (
                <div
                  key={row.id}
                  className="border rounded-lg p-4 bg-card"
                  data-testid={`row-pending-${row.id}`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-semibold" data-testid={`text-pending-name-${row.id}`}>{row.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Provider: <span className="font-medium text-foreground">{provName}</span>
                        {row.pending_change_reason ? <> · Reason: <em>{row.pending_change_reason}</em></> : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => approve.mutate(row.id)}
                        disabled={approve.isPending}
                        data-testid={`button-approve-${row.id}`}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          const reason = window.prompt("Reason for rejection (optional):") || "";
                          reject.mutate({ id: row.id, reason });
                        }}
                        disabled={reject.isPending}
                        data-testid={`button-reject-${row.id}`}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                  {keys.length > 0 && (
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      {keys.map((k) => (
                        <div key={k} className="flex items-center justify-between gap-2 border rounded px-2 py-1">
                          <span className="text-xs text-muted-foreground">{FIELD_LABELS[k]}</span>
                          <span className="text-xs">
                            <span className="line-through text-muted-foreground mr-2">
                              {renderVal((row as any)[k === "subServiceId" ? "sub_service_id" : k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase())])}
                            </span>
                            <span className="font-semibold text-primary" data-testid={`text-staged-${k}-${row.id}`}>
                              {renderVal(staged[k])}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Admin queue for service requests submitted by providers.
// Lets admin edit the request, approve (creates the real service + notifies provider),
// or reject with a reason.
function AdminServiceRequestsPanel() {
  const { toast } = useToast();
  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/service-requests"],
  });
  const [editing, setEditing] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    category: "",
    serviceName: "",
    subServiceName: "",
    suggestedPrice: "",
    description: "",
    adminNotes: "",
    locationMode: "both" as "both" | "clinic_only" | "home_only",
  });
  const [approving, setApproving] = useState<any>(null);
  const [approveForm, setApproveForm] = useState({ duration: "30", finalPrice: "" });
  const [rejecting, setRejecting] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [filter, setFilter] = useState<string>("pending_review");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/service-requests"] });

  const editMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/service-requests/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Request updated" });
      setEditing(null);
      invalidate();
    },
    onError: (e: any) => toast({ title: "Update failed", description: e?.message, variant: "destructive" }),
  });

  const approveMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("POST", `/api/admin/service-requests/${id}/approve`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Approved", description: "Service was created and provider notified." });
      setApproving(null);
      invalidate();
    },
    onError: (e: any) => toast({ title: "Approve failed", description: e?.message, variant: "destructive" }),
  });

  const rejectMut = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/admin/service-requests/${id}/reject`, { rejectionReason: reason });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rejected", description: "Provider notified." });
      setRejecting(null);
      setRejectionReason("");
      invalidate();
    },
    onError: (e: any) => toast({ title: "Reject failed", description: e?.message, variant: "destructive" }),
  });

  const openEdit = (r: any) => {
    setEditing(r);
    setEditForm({
      category: r.category ?? "",
      serviceName: r.serviceName ?? "",
      subServiceName: r.subServiceName ?? "",
      suggestedPrice: r.suggestedPrice ?? "",
      description: r.description ?? "",
      adminNotes: r.adminNotes ?? "",
      locationMode: (r.locationMode ?? "both") as any,
    });
  };

  const openApprove = (r: any) => {
    setApproving(r);
    setApproveForm({ duration: "30", finalPrice: r.suggestedPrice ?? "" });
  };

  const filtered = items.filter((r: any) => filter === "all" || r.status === filter);

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      pending_review: { label: "Pending", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
      approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
      rejected: { label: "Rejected", cls: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300" },
    };
    const m = map[status] ?? { label: status, cls: "bg-muted text-foreground" };
    return <Badge className={m.cls}>{m.label}</Badge>;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Service Requests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-request-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending_review">Pending review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No requests in this view.</div>
          ) : (
            <div className="space-y-3">
              {filtered.map((r: any) => {
                const provName =
                  r.provider?.accountType === "clinic"
                    ? r.provider?.clinicName ?? r.provider?.user?.name
                    : r.provider?.user?.name ?? r.provider?.businessName ?? "Provider";
                return (
                  <div key={r.id} className="rounded-lg border p-3" data-testid={`row-admin-request-${r.id}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium" data-testid={`text-admin-request-name-${r.id}`}>{r.serviceName}</span>
                          {statusBadge(r.status)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {r.category} · {r.subServiceName}
                          {r.suggestedPrice ? ` · Suggested $${r.suggestedPrice}` : ""}
                          {r.locationMode && r.locationMode !== "both" ? (
                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                              {r.locationMode === "clinic_only" ? "Clinic Only" : "Home Only"}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          From: <span className="font-medium">{provName}</span>
                          {r.provider?.user?.email ? ` · ${r.provider.user.email}` : ""}
                        </div>
                        {r.description && <div className="text-sm mt-2">{r.description}</div>}
                        {r.adminNotes && <div className="text-sm mt-1 text-muted-foreground"><strong>Notes:</strong> {r.adminNotes}</div>}
                        {r.rejectionReason && <div className="text-sm mt-1 text-rose-600 dark:text-rose-400"><strong>Reason:</strong> {r.rejectionReason}</div>}
                      </div>
                      {r.status === "pending_review" && (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(r)} data-testid={`button-edit-request-${r.id}`}>Edit</Button>
                          <Button size="sm" onClick={() => openApprove(r)} data-testid={`button-approve-request-${r.id}`}>Approve</Button>
                          <Button size="sm" variant="destructive" onClick={() => setRejecting(r)} data-testid={`button-reject-request-${r.id}`}>Reject</Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Category</label>
              <Input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} data-testid="input-edit-category" />
            </div>
            <div>
              <label className="text-sm font-medium">Service name</label>
              <Input value={editForm.serviceName} onChange={(e) => setEditForm({ ...editForm, serviceName: e.target.value })} data-testid="input-edit-service-name" />
            </div>
            <div>
              <label className="text-sm font-medium">Sub-service</label>
              <Input value={editForm.subServiceName} onChange={(e) => setEditForm({ ...editForm, subServiceName: e.target.value })} data-testid="input-edit-sub-service" />
            </div>
            <div>
              <label className="text-sm font-medium">Suggested price</label>
              <Input type="number" step="0.01" value={editForm.suggestedPrice} onChange={(e) => setEditForm({ ...editForm, suggestedPrice: e.target.value })} data-testid="input-edit-price" />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={2} />
            </div>
            <div>
              <label className="text-sm font-medium">Where can this service be delivered?</label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {[
                  { value: "both", label: "Clinic & Home" },
                  { value: "clinic_only", label: "Clinic Only" },
                  { value: "home_only", label: "Home Only" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEditForm({ ...editForm, locationMode: opt.value as any })}
                    data-testid={`button-edit-location-${opt.value}`}
                    className={`p-2 rounded-md border-2 text-xs transition-all ${editForm.locationMode === opt.value ? "border-primary bg-primary/5 font-semibold" : "border-border hover:border-primary/50"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Admin notes</label>
              <Textarea value={editForm.adminNotes} onChange={(e) => setEditForm({ ...editForm, adminNotes: e.target.value })} rows={2} data-testid="textarea-edit-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              onClick={() => editing && editMut.mutate({ id: editing.id, data: editForm })}
              disabled={editMut.isPending}
              data-testid="button-save-edit"
            >
              {editMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve dialog */}
      <Dialog open={!!approving} onOpenChange={(open) => !open && setApproving(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Approve & create service</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This creates "{approving?.serviceName}" in the catalog and assigns it to the provider.
            </p>
            <div>
              <label className="text-sm font-medium">Duration (minutes)</label>
              <Input type="number" min={5} max={480} value={approveForm.duration} onChange={(e) => setApproveForm({ ...approveForm, duration: e.target.value })} data-testid="input-approve-duration" />
            </div>
            <div>
              <label className="text-sm font-medium">Final price</label>
              <Input type="number" step="0.01" value={approveForm.finalPrice} onChange={(e) => setApproveForm({ ...approveForm, finalPrice: e.target.value })} data-testid="input-approve-price" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproving(null)}>Cancel</Button>
            <Button
              onClick={() =>
                approving &&
                approveMut.mutate({
                  id: approving.id,
                  data: {
                    duration: Number(approveForm.duration) || 30,
                    finalPrice: approveForm.finalPrice || undefined,
                  },
                })
              }
              disabled={approveMut.isPending}
              data-testid="button-confirm-approve"
            >
              {approveMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejecting} onOpenChange={(open) => { if (!open) { setRejecting(null); setRejectionReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium">Reason (will be sent to provider)</label>
            <Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={3} data-testid="textarea-reject-reason" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejecting(null); setRejectionReason(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => rejecting && rejectionReason.trim() && rejectMut.mutate({ id: rejecting.id, reason: rejectionReason.trim() })}
              disabled={rejectMut.isPending || !rejectionReason.trim()}
              data-testid="button-confirm-reject"
            >
              {rejectMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Admin-side weekly schedule + bookable-slot publisher for a single provider.
// Wires WeeklyScheduleGrid to the /api/admin/providers/:id/office-hours and
// /api/admin/providers/:id/availability/bulk endpoints so admins can fix the
// "no slots available on this date" problem without logging in as the provider.
function AdminTimesheetPanel({ providerId }: { providerId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/admin/providers/${providerId}/office-hours`],
  });

  const saveSchedule = useMutation({
    mutationFn: (weeklySchedule: WeeklySchedule) =>
      apiRequest("PATCH", `/api/admin/providers/${providerId}/office-hours`, {
        weeklySchedule,
      }),
    onSuccess: () => {
      toast({ title: t("admin.schedule_saved", "Schedule saved") });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/providers/${providerId}/office-hours`] });
    },
    onError: () => toast({ title: t("admin.failed_save", "Failed to save"), variant: "destructive" }),
  });

  const publishSlots = useMutation({
    mutationFn: (payload: { dates: string[]; slots: { startTime: string; endTime: string }[]; replaceExisting: boolean }) =>
      apiRequest("POST", `/api/admin/providers/${providerId}/availability/bulk`, payload).then((r) => r.json()),
    onSuccess: (data: any) => {
      toast({ title: t("admin.slots_published", "Created {{count}} time slots", { count: data?.count ?? 0 }) });
    },
    onError: () => toast({ title: t("admin.failed_publish", "Failed to publish slots"), variant: "destructive" }),
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
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.weekly_schedule_title", "Weekly schedule & bookable slots")}</CardTitle>
        <CardDescription>
          {t(
            "admin.weekly_schedule_desc",
            "Click or drag cells to mark this provider's working hours. Save the schedule, then publish to generate the bookable time slots patients see when booking.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <WeeklyScheduleGrid
          schedule={data?.weeklySchedule}
          onSave={(sched) => saveSchedule.mutate(sched)}
          onPublish={(payload) => publishSlots.mutate(payload)}
          isPendingSave={saveSchedule.isPending}
          isPendingPublish={publishSlots.isPending}
        />
      </CardContent>
    </Card>
  );
}

function EmptyTabCard({
  icon,
  title,
  description,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  testId: string;
}) {
  return (
    <Card>
      <CardContent
        className="flex flex-col items-center justify-center py-16 text-center gap-3"
        data-testid={testId}
      >
        <div className="text-muted-foreground/60">{icon}</div>
        <h4 className="text-lg font-semibold">{title}</h4>
        <p className="text-sm text-muted-foreground max-w-md">{description}</p>
      </CardContent>
    </Card>
  );
}

// Provider Edit Dialog Component
function ProviderEditDialog({ provider }: { provider: any }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const { format: fmtMoney } = useCurrency();
  const { data: providerServices, refetch: refetchServices } = useQuery<any[]>({
    queryKey: [`/api/admin/providers/${provider.id}/services`],
    enabled: open,
  });

  const form = useForm({
    defaultValues: {
      specialization: provider.specialization,
      consultationFee: provider.consultationFee,
      homeVisitFee: provider.homeVisitFee || "",
      telemedicineFee: provider.telemedicineFee || "",
      emergencyCareFee: provider.emergencyCareFee || "",
      bio: provider.bio || "",
      professionalTitle: provider.professionalTitle || "",
      licenseNumber: provider.licenseNumber || "",
      licensingAuthority: provider.licensingAuthority || "",
      licenseExpiryDate: provider.licenseExpiryDate ? new Date(provider.licenseExpiryDate).toISOString().split('T')[0] : "",
      nationalProviderId: provider.nationalProviderId || "",
      yearsExperience: provider.yearsExperience || 0,
      education: provider.education || "",
      qualifications: provider.qualifications || "",
      city: provider.city || "",
      state: provider.state || "",
      country: provider.country || "",
      serviceRadiusKm: provider.serviceRadiusKm || "",
      primaryServiceLocation: provider.primaryServiceLocation || "",
      status: provider.status || "pending",
      languages: provider.languages || [],
      availableDays: provider.availableDays || [],
      insuranceAccepted: provider.insuranceAccepted || [],
      paymentMethods: provider.paymentMethods || [],
      affiliatedHospital: provider.affiliatedHospital || "",
      onCallAvailability: provider.onCallAvailability || false,
      emergencyContact: provider.emergencyContact || "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PATCH", `/api/admin/providers/${provider.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });
      toast({ title: t("admin.provider_updated") });
      setOpen(false);
    },
  });

  const addServiceMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", `/api/admin/providers/${provider.id}/services`, {
        ...data,
        duration: 60, // Default duration
      });
    },
    onSuccess: () => {
      refetchServices();
      toast({ title: t("admin.service_added") });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" data-testid={`button-edit-provider-${provider.id}`}>
          <Edit className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>{t("admin.edit")} {t("admin.provider")}: {provider.user?.firstName} {provider.user?.lastName}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 pb-6 min-h-0">
          <Tabs defaultValue="details">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">{t("admin.details_fees")}</TabsTrigger>
              <TabsTrigger value="services">{t("admin.services")}</TabsTrigger>
              <TabsTrigger value="practitioners">{t("admin.practitioners")}</TabsTrigger>
            </TabsList>
            <TabsContent value="practitioners">
              <PractitionerManagement providerId={provider.id} />
            </TabsContent>
            <TabsContent value="details" className="space-y-4 py-4">
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="professionalTitle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.title_label")}</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="specialization"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.specialization_label")}</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.verification_status")}</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="active">{t("admin.active", "Active")}</SelectItem>
                              <SelectItem value="suspended">{t("admin.suspended", "Suspended")}</SelectItem>
                              <SelectItem value="pending">{t("admin.awaiting_approval", "Awaiting Approval")}</SelectItem>
                              <SelectItem value="rejected">{t("admin.rejected", "Rejected")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="yearsExperience"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.years_experience_label")}</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="licenseNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.license_number")}</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="licenseExpiryDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.license_expiry")}</FormLabel>
                          <FormControl><Input type="date" {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="consultationFee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.consultation_fee_label")}</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="homeVisitFee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.home_visit_fee_label")}</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.city")}</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="serviceRadiusKm"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.radius_km")}</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="affiliatedHospital"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.affiliated_hospital")}</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="emergencyContact"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.emergency_contact")}</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="onCallAvailability"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox 
                            checked={!!field.value} 
                            onCheckedChange={field.onChange} 
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>{t("admin.on_call_availability")}</FormLabel>
                          <FormDescription>{t("admin.available_emergency")}</FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="bio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("admin.bio")}</FormLabel>
                        <FormControl><Textarea {...field} /></FormControl>
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={updateMutation.isPending} className="w-full">
                    {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t("admin.save_changes")}
                  </Button>
                </form>
              </Form>
            </TabsContent>
            <TabsContent value="services" className="space-y-4 py-4">
              <AdminServicesPanel
                providerId={provider.id}
                services={providerServices || []}
                refetchServices={refetchServices}
                fmtMoney={fmtMoney}
              />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Provider Details Dialog Component
function ProviderDetailsDialog({ provider }: { provider: any }) {
  const { t } = useTranslation();
  const { format: fmtMoney } = useCurrency();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" data-testid={`button-view-provider-${provider.id}`}>
          <Eye className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>{t("admin.provider_details")}</DialogTitle>
          <DialogDescription>{t("admin.full_profile_info", { name: `${provider.user?.firstName} ${provider.user?.lastName}` })}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 px-6 pb-6">
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">{t("admin.type")}</Label>
                <p className="font-medium capitalize">{provider.providerType || provider.type || "—"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("admin.specialization_label")}</Label>
                <p className="font-medium">{provider.specialization}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("common.email")}</Label>
                <p className="font-medium">{provider.user?.email}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("common.phone")}</Label>
                <p className="font-medium">{provider.user?.phone || 'N/A'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("admin.experience")}</Label>
                <p className="font-medium">{provider.yearsExperience} {t("admin.years")}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("common.profile.education")}</Label>
                <p className="font-medium">{provider.education}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("admin.consultation_fee_label")}</Label>
                <p className="font-medium">{fmtMoney(provider.consultationFee)}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("admin.home_visit_fee_label")}</Label>
                <p className="font-medium">{provider.homeVisitFee ? fmtMoney(provider.homeVisitFee) : 'N/A'}</p>
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground">{t("admin.bio")}</Label>
              <p className="text-sm mt-1 whitespace-pre-wrap">{provider.bio}</p>
            </div>

            <div>
              <Label className="text-muted-foreground">{t("common.profile.languages")}</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {provider.languages?.map((lang: string) => (
                  <Badge key={lang} variant="secondary" className="capitalize">{lang}</Badge>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">{t("admin.affiliated_hospital")}</Label>
                <p className="font-medium">{provider.affiliatedHospital || 'N/A'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("admin.on_call")}</Label>
                <p className="font-medium">{provider.onCallAvailability ? t("admin.yes") : t("admin.no")}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("admin.emergency_contact")}</Label>
                <p className="font-medium">{provider.emergencyContact || 'N/A'}</p>
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground">{t("admin.insurance_accepted")}</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {provider.insuranceAccepted?.length > 0 ? provider.insuranceAccepted.map((ins: string) => (
                  <Badge key={ins} variant="outline" className="capitalize">{ins}</Badge>
                )) : <p className="text-sm font-medium">{t("admin.none_listed")}</p>}
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground">{t("admin.payment_methods")}</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {provider.paymentMethods?.length > 0 ? provider.paymentMethods.map((pm: string) => (
                  <Badge key={pm} variant="outline" className="capitalize">{pm}</Badge>
                )) : <p className="text-sm font-medium">{t("admin.none_listed")}</p>}
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground">{t("setup.availability")}</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {provider.availableDays?.map((day: string) => (
                  <Badge key={day} variant="outline" className="capitalize">{day}</Badge>
                ))}
              </div>
            </div>

            {provider.practitionerData && (
              <div className="pt-4 border-t">
                <Label className="text-muted-foreground">{t("admin.medical_practitioners")}</Label>
                <div className="mt-2 space-y-4">
                  {(() => {
                    try {
                      const practitioners = typeof provider.practitionerData === 'string' 
                        ? JSON.parse(provider.practitionerData) 
                        : provider.practitionerData;
                      return Array.isArray(practitioners) ? practitioners.map((practitioner: any, index: number) => (
                        <div key={index} className="p-3 rounded-md bg-muted/50 border space-y-2">
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div><span className="text-muted-foreground font-medium">{t("admin.name")}:</span> {practitioner.name}</div>
                            <div><span className="text-muted-foreground font-medium">{t("setup.designation")}:</span> {practitioner.designation}</div>
                            <div><span className="text-muted-foreground font-medium">{t("setup.dob")}:</span> {practitioner.dob}</div>
                            <div><span className="text-muted-foreground font-medium">{t("setup.origin_country")}:</span> {practitioner.originCountry}</div>
                            <div><span className="text-muted-foreground font-medium">{t("setup.reg_number")}:</span> {practitioner.registrationNumber}</div>
                            <div><span className="text-muted-foreground font-medium">{t("setup.id_number")}:</span> {practitioner.identityNumber}</div>
                            <div><span className="text-muted-foreground font-medium">{t("setup.mobile_number")}:</span> {practitioner.mobileNumber}</div>
                          </div>
                        </div>
                      )) : null;
                    } catch (e) {
                      return <p className="text-xs text-destructive">{t("admin.error_parsing_practitioner")}</p>;
                    }
                  })()}
                </div>
              </div>
            )}

            <div className="pt-4 border-t grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">{t("admin.rating")}</Label>
                <p className="font-medium">{provider.rating} / 5 ({provider.totalReviews} {t("common.profile.reviews_count", { count: provider.totalReviews })})</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t("admin.joined_on")}</Label>
                <p className="font-medium">{new Date(provider.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// Modern Revenue KPI Card with gradient
function RevenueKpiCard({
  label,
  value,
  hint,
  icon: Icon,
  gradient,
  trend,
  testId,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: any;
  gradient: string;
  trend?: { pct: number; positive?: boolean } | null;
  testId?: string;
}) {
  const trendPositive = trend ? (trend.positive ?? trend.pct >= 0) : true;
  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-lg ${gradient}`}
      data-testid={testId}
    >
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-white/80">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
          {hint && <p className="mt-1 text-xs text-white/70">{hint}</p>}
        </div>
        <div className="rounded-xl bg-white/20 p-2.5 backdrop-blur-sm">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {trend && (
        <div className="relative mt-3 flex items-center gap-1.5 text-xs font-medium">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
              trendPositive ? "bg-white/20 text-white" : "bg-black/20 text-white"
            }`}
          >
            {trendPositive ? "▲" : "▼"} {Math.abs(trend.pct).toFixed(1)}%
          </span>
          <span className="text-white/70">vs last period</span>
        </div>
      )}
    </div>
  );
}

// Analytics Overview Component
function AnalyticsOverview() {
  const { t } = useTranslation();
  const { format: fmtMoney } = useCurrency();
  const { data: analytics, isLoading } = useQuery<{
    totalUsers: number;
    totalProviders: number;
    totalBookings: number;
    totalRevenue: string;
    pendingBookings: number;
    completedBookings: number;
    recentPayments: any[];
    revenueSeries: { name: string; revenue: number; bookings: number }[];
    platformFees: string;
    providerPayouts: string;
    avgBookingValue: string;
    revenueToday: string;
    revenueThisMonth: string;
    revenueLastMonth: string;
    revenueGrowthPct: number;
    activeProviders: number;
  }>({
    queryKey: ["/api/admin/analytics"],
  });

  const series = analytics?.revenueSeries ?? [];
  const pieData = [
    { name: t("admin.completed", "Completed"), value: analytics?.completedBookings || 0, color: '#10b981' },
    { name: t("admin.pending", "Pending"), value: analytics?.pendingBookings || 0, color: '#f59e0b' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Operational stat cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="stat-card stat-indigo">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.total_users")}</CardTitle>
            <div className="stat-icon h-9 w-9"><Users className="h-4 w-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-users">{analytics?.totalUsers || 0}</div>
            <p className="text-xs text-muted-foreground">{t("admin.registered_users")}</p>
          </CardContent>
        </Card>
        <Card className="stat-card stat-fuchsia">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.total_providers")}</CardTitle>
            <div className="stat-icon h-9 w-9"><Building className="h-4 w-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-providers">{analytics?.totalProviders || 0}</div>
            <p className="text-xs text-muted-foreground">
              {t("admin.active_providers_count", "{{n}} active", { n: analytics?.activeProviders || 0 })}
            </p>
          </CardContent>
        </Card>
        <Card className="stat-card stat-sky">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.total_bookings")}</CardTitle>
            <div className="stat-icon h-9 w-9"><Calendar className="h-4 w-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-bookings">{analytics?.totalBookings || 0}</div>
            <p className="text-xs text-muted-foreground">{t("admin.all_time_bookings")}</p>
          </CardContent>
        </Card>
        <Card className="stat-card stat-emerald">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.total_revenue")}</CardTitle>
            <div className="stat-icon h-9 w-9"><DollarSign className="h-4 w-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-revenue">{fmtMoney(analytics?.totalRevenue || 0)}</div>
            <p className="text-xs text-muted-foreground">{t("admin.platform_earnings")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Modern Revenue Insights */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold">{t("admin.revenue_insights", "Revenue insights")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("admin.revenue_insights_desc", "Live financial overview across the platform")}
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <RevenueKpiCard
            label={t("admin.gross_revenue", "Gross revenue")}
            value={fmtMoney(analytics?.totalRevenue || 0)}
            hint={t("admin.all_settled_payments", "All settled payments")}
            icon={DollarSign}
            gradient="bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600"
            trend={{ pct: analytics?.revenueGrowthPct || 0 }}
            testId="kpi-gross-revenue"
          />
          <RevenueKpiCard
            label={t("admin.platform_fees", "Platform fees")}
            value={fmtMoney(analytics?.platformFees || 0)}
            hint={t("admin.fees_collected", "Fees collected from completed bookings")}
            icon={TrendingUp}
            gradient="bg-gradient-to-br from-violet-500 via-purple-600 to-fuchsia-600"
            testId="kpi-platform-fees"
          />
          <RevenueKpiCard
            label={t("admin.provider_payouts", "Provider payouts")}
            value={fmtMoney(analytics?.providerPayouts || 0)}
            hint={t("admin.owed_to_providers", "Owed to providers")}
            icon={Banknote}
            gradient="bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-600"
            testId="kpi-provider-payouts"
          />
          <RevenueKpiCard
            label={t("admin.avg_booking_value", "Avg booking value")}
            value={fmtMoney(analytics?.avgBookingValue || 0)}
            hint={t("admin.based_on_completed", "Based on completed bookings")}
            icon={CheckCircle}
            gradient="bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500"
            testId="kpi-avg-booking"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t("admin.revenue_trend", "Revenue trend")}</CardTitle>
                <CardDescription>{t("admin.last_12_months", "Last 12 months")}</CardDescription>
              </div>
              <Badge variant="secondary" className="text-xs">
                {t("admin.this_month", "This month")}: {fmtMoney(analytics?.revenueThisMonth || 0)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtMoney(v).replace(/\.\d+/, "")} />
                <Tooltip
                  formatter={(v: any) => fmtMoney(Number(v))}
                  contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="url(#revenueGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("admin.bookings_trend", "Bookings trend")}</CardTitle>
            <CardDescription>{t("admin.last_12_months", "Last 12 months")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                <Bar dataKey="bookings" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t("admin.appointment_status", "Appointment status")}</CardTitle>
            <CardDescription>{t("admin.current_distribution", "Current distribution")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <ResponsiveContainer width="60%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2">
                {pieData.map((entry, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="font-medium">{entry.name}</span>
                    <span className="ml-auto text-muted-foreground tabular-nums">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.today_snapshot", "Today's snapshot")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">{t("admin.today_revenue", "Today's revenue")}</span>
              <span className="text-xl font-bold tabular-nums" data-testid="text-revenue-today">
                {fmtMoney(analytics?.revenueToday || 0)}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">{t("admin.this_month", "This month")}</span>
              <span className="text-base font-semibold tabular-nums">
                {fmtMoney(analytics?.revenueThisMonth || 0)}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">{t("admin.last_month", "Last month")}</span>
              <span className="text-base font-semibold tabular-nums">
                {fmtMoney(analytics?.revenueLastMonth || 0)}
              </span>
            </div>
            <div className="border-t pt-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("admin.growth", "Growth")}</span>
              <Badge
                variant="outline"
                className={
                  (analytics?.revenueGrowthPct || 0) >= 0
                    ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300"
                }
              >
                {(analytics?.revenueGrowthPct || 0) >= 0 ? "▲" : "▼"} {Math.abs(analytics?.revenueGrowthPct || 0).toFixed(1)}%
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Bookings Management Component
function BookingsManagementComponent() {
  const { format: fmtMoney } = useCurrency();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");

  const { data: bookings, isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/bookings"],
  });

  // Provider list for the "by provider" dropdown filter. Country-isolated on
  // the server; we just render whatever the backend returns for this admin.
  const { data: providersForFilter } = useQuery<any[]>({
    queryKey: ["/api/admin/providers"],
  });

  const updateBookingMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/bookings/${id}`, { status });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Failed to update booking");
      return resData;
    },
    onSuccess: () => {
      toast({ title: "Booking updated successfully" });
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: t("admin_dashboard.error"), description: error.message, variant: "destructive" });
    },
  });

  const [bookingSearch, setBookingSearch] = useState<string>("");

  const providerLabel = (p: any): string => {
    if (!p) return "—";
    if (p.businessName) return p.businessName;
    const u = p.user || {};
    const full = `${u.firstName || ""} ${u.lastName || ""}`.trim();
    return full || u.email || `Provider ${String(p.id).slice(0, 6)}`;
  };

  const filteredBookings = bookings?.filter((b: any) => {
    const matchesStatus = statusFilter === "all" || b.status === statusFilter;
    const matchesProvider = providerFilter === "all" || b.providerId === providerFilter;
    if (!matchesStatus || !matchesProvider) return false;
    if (!bookingSearch.trim()) return true;
    const q = bookingSearch.trim().toLowerCase();
    return (
      (b.appointmentNumber && b.appointmentNumber.toLowerCase().includes(q)) ||
      (b.patientName && b.patientName.toLowerCase().includes(q)) ||
      (b.providerName && b.providerName.toLowerCase().includes(q)) ||
      (b.id && b.id.toLowerCase().includes(q))
    );
  }) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <Input
          placeholder="Search by reference # or patient name..."
          value={bookingSearch}
          onChange={(e) => setBookingSearch(e.target.value)}
          className="w-64"
          data-testid="input-booking-search"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48" data-testid="select-booking-status-filter">
            <SelectValue placeholder={t("admin.filter_by_status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.all_bookings")}</SelectItem>
            <SelectItem value="pending">{t("admin.pending")}</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="confirmed">{t("admin.confirmed")}</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">{t("admin.completed")}</SelectItem>
            <SelectItem value="cancelled">{t("admin.cancelled")}</SelectItem>
            <SelectItem value="cancelled_by_patient">Cancelled by Patient</SelectItem>
            <SelectItem value="cancelled_by_provider">Cancelled by Provider</SelectItem>
            <SelectItem value="no_show">No-Show</SelectItem>
            <SelectItem value="rescheduled">Rescheduled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="w-56" data-testid="select-booking-provider-filter">
            <SelectValue placeholder="Filter by provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All providers</SelectItem>
            {(providersForFilter || []).map((p: any) => (
              <SelectItem key={p.id} value={p.id} data-testid={`option-provider-${p.id}`}>
                {providerLabel(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {t("admin.showing_bookings", { count: filteredBookings.length })}
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <div className="divide-y">
              {filteredBookings.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  {t("admin.no_bookings")}
                </div>
              ) : (
                filteredBookings.map((booking: any) => (
                  <div key={booking.id} className="p-4 flex items-center justify-between gap-4" data-testid={`row-booking-${booking.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {booking.appointmentNumber ? (
                          <span
                            className="font-mono font-bold text-primary"
                            data-testid={`text-appt-number-${booking.id}`}
                          >
                            {booking.appointmentNumber}
                          </span>
                        ) : (
                          <span className="font-medium truncate">{t("admin.booking_number")} {String(booking.id).slice(0, 8)}</span>
                        )}
                        <Badge variant={
                          booking.status === 'completed' ? 'default' :
                          booking.status === 'confirmed' ? 'secondary' :
                          booking.status === 'cancelled' || booking.status === 'cancelled_by_patient' || booking.status === 'cancelled_by_provider' ? 'destructive' : 'outline'
                        }>
                          {booking.status?.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {booking.patientName && <span className="font-medium text-foreground mr-2">{booking.patientName}</span>}
                        {new Date(booking.appointmentDate).toLocaleDateString()} {t("admin.at")} {booking.startTime}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("admin.type")}: {booking.appointmentType} | {t("admin.amount")}: {fmtMoney(booking.totalAmount || 0)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={booking.status}
                        onValueChange={(status) => updateBookingMutation.mutate({ id: booking.id, status })}
                      >
                        <SelectTrigger className="w-40" data-testid={`select-booking-status-${booking.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">{t("admin.pending")}</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="confirmed">{t("admin.confirmed")}</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="completed">{t("admin.completed")}</SelectItem>
                          <SelectItem value="cancelled">{t("admin.cancelled")}</SelectItem>
                          <SelectItem value="cancelled_by_patient">Cancelled by Patient</SelectItem>
                          <SelectItem value="cancelled_by_provider">Cancelled by Provider</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                          <SelectItem value="no_show">No-Show</SelectItem>
                          <SelectItem value="rescheduled">Rescheduled</SelectItem>
                          <SelectItem value="reschedule_proposed">Reschedule Proposed</SelectItem>
                          <SelectItem value="expired">Expired</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// Financial Reports Component
function FinancialReports() {
  const { format: fmtMoney } = useCurrency();
  const { t } = useTranslation();
  const { data: analytics, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/analytics"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const payments = analytics?.recentPayments || [];
  const totalRevenue = parseFloat(analytics?.totalRevenue || "0");
  const platformFees = parseFloat(analytics?.platformFees || "0");
  const providerPayouts = parseFloat(analytics?.providerPayouts || "0");
  const avgBookingValue = parseFloat(analytics?.avgBookingValue || "0");
  const series = analytics?.revenueSeries ?? [];
  const growthPct = analytics?.revenueGrowthPct || 0;

  // Build a payment method distribution from recent payments.
  const methodMap: Record<string, { count: number; amount: number }> = {};
  payments.forEach((p: any) => {
    const m = (p.paymentMethod || "other").toString();
    if (!methodMap[m]) methodMap[m] = { count: 0, amount: 0 };
    methodMap[m].count += 1;
    methodMap[m].amount += Number(p.amount || 0);
  });
  const methodEntries = Object.entries(methodMap)
    .map(([method, v]) => ({ method, ...v }))
    .sort((a, b) => b.amount - a.amount);

  return (
    <div className="space-y-6">
      {/* Hero revenue card */}
      <div className="relative overflow-hidden rounded-2xl p-6 text-white shadow-xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          <div>
            <div className="flex items-center gap-2 text-white/80">
              <PiggyBank className="h-4 w-4" />
              <p className="text-xs font-medium uppercase tracking-wider">
                {t("admin.total_revenue_label", "Total revenue")}
              </p>
            </div>
            <p className="text-4xl md:text-5xl font-bold mt-2 tracking-tight" data-testid="text-financial-total">
              {fmtMoney(totalRevenue)}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${growthPct >= 0 ? "bg-white/25" : "bg-black/25"}`}>
                {growthPct >= 0 ? "▲" : "▼"} {Math.abs(growthPct).toFixed(1)}%
              </span>
              <span className="text-xs text-white/80">{t("admin.month_over_month", "month over month")}</span>
            </div>
          </div>
          <div className="md:col-span-2">
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="finRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  formatter={(v: any) => fmtMoney(Number(v))}
                  contentStyle={{ background: "rgba(0,0,0,0.7)", border: "none", borderRadius: 8, color: "white" }}
                  labelStyle={{ color: "white" }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#ffffff" strokeWidth={2} fill="url(#finRevGrad)" />
              </AreaChart>
            </ResponsiveContainer>
            <p className="text-[11px] text-white/70 text-center mt-1">
              {t("admin.last_12_months", "Last 12 months")}
            </p>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <RevenueKpiCard
          label={t("admin.platform_fees", "Platform fees")}
          value={fmtMoney(platformFees)}
          hint={t("admin.fees_collected", "Fees collected")}
          icon={Receipt}
          gradient="bg-gradient-to-br from-violet-500 via-purple-600 to-fuchsia-600"
          testId="kpi-financial-fees"
        />
        <RevenueKpiCard
          label={t("admin.provider_payouts", "Provider payouts")}
          value={fmtMoney(providerPayouts)}
          hint={t("admin.owed_to_providers", "Owed to providers")}
          icon={Wallet}
          gradient="bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-600"
          testId="kpi-financial-payouts"
        />
        <RevenueKpiCard
          label={t("admin.avg_booking_value", "Avg booking value")}
          value={fmtMoney(avgBookingValue)}
          hint={t("admin.based_on_completed", "Based on completed bookings")}
          icon={CheckCircle}
          gradient="bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500"
          testId="kpi-financial-avg"
        />
        <RevenueKpiCard
          label={t("admin.completed_bookings", "Completed bookings")}
          value={String(analytics?.completedBookings || 0)}
          hint={t("admin.settled_appointments", "Settled appointments")}
          icon={CheckCircle}
          gradient="bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600"
          testId="kpi-financial-completed"
        />
      </div>

      {/* Payment method breakdown + recent payments */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              {t("admin.payment_methods", "Payment methods")}
            </CardTitle>
            <CardDescription>{t("admin.recent_payments_breakdown", "From recent payments")}</CardDescription>
          </CardHeader>
          <CardContent>
            {methodEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {t("admin.no_payments", "No payments yet")}
              </p>
            ) : (
              <div className="space-y-3">
                {methodEntries.map((m) => {
                  const pct = totalRevenue > 0 ? Math.min(100, (m.amount / Math.max(...methodEntries.map((x) => x.amount))) * 100) : 0;
                  return (
                    <div key={m.method} data-testid={`row-method-${m.method}`}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="capitalize font-medium">{m.method}</span>
                        <span className="tabular-nums text-muted-foreground">{fmtMoney(m.amount)} · {m.count}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-fuchsia-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("admin.recent_payments", "Recent payments")}</CardTitle>
            <CardDescription>
              {t("admin.recent_payments_desc", "Latest transactions across the platform")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="h-10 px-4 text-left font-medium">{t("admin.date", "Date")}</th>
                    <th className="h-10 px-4 text-left font-medium">{t("admin.amount", "Amount")}</th>
                    <th className="h-10 px-4 text-left font-medium">{t("admin.status", "Status")}</th>
                    <th className="h-10 px-4 text-left font-medium">{t("booking.payment_method", "Method")}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-muted-foreground">
                        {t("admin.no_payments", "No payments yet")}
                      </td>
                    </tr>
                  ) : (
                    payments.map((payment: any) => {
                      const isPaid = payment.status === "completed" || payment.status === "paid";
                      return (
                        <tr key={payment.id} className="border-b last:border-0 hover:bg-muted/30 transition" data-testid={`row-payment-${payment.id}`}>
                          <td className="p-4 text-muted-foreground tabular-nums">
                            {new Date(payment.createdAt).toLocaleDateString()}
                          </td>
                          <td className="p-4 font-semibold tabular-nums">{fmtMoney(payment.amount)}</td>
                          <td className="p-4">
                            <Badge
                              variant="outline"
                              className={
                                isPaid
                                  ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300"
                                  : payment.status === "pending"
                                    ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300"
                                    : "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300"
                              }
                            >
                              {payment.status}
                            </Badge>
                          </td>
                          <td className="p-4 capitalize">{payment.paymentMethod || "—"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modern Providers Management
// ─────────────────────────────────────────────────────────────────────────────

function FormSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: any;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card overflow-hidden">
      <header className="px-5 py-3 border-b bg-muted/30 flex items-center gap-3">
        <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-sm">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function ProviderStatusPill({ status, t }: { status: string; t: any }) {
  const normalized = status === "approved" ? "active" : status;
  const cfg: Record<string, string> = {
    active:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200",
    pending:   "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200",
    suspended: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200",
    rejected:  "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200",
  };
  const dot: Record<string, string> = {
    active: "bg-emerald-500", pending: "bg-amber-500", suspended: "bg-red-500",
    rejected: "bg-rose-500",
  };
  const labelKey: Record<string, string> = {
    active: "admin.active",
    pending: "admin.awaiting_approval",
    suspended: "admin.suspended",
    rejected: "admin.rejected",
  };
  const cls = cfg[normalized] || "bg-muted text-muted-foreground border-border";
  const dotCls = dot[normalized] || "bg-slate-400";
  const label = labelKey[normalized]
    ? t(labelKey[normalized], normalized.charAt(0).toUpperCase() + normalized.slice(1))
    : t(`admin.${normalized}`, normalized);
  return (
    <Badge variant="outline" className={`${cls} text-[10px] gap-1.5 h-5`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} />
      {label}
    </Badge>
  );
}

// Provider Management Component
function ProvidersManagement() {
  const { format: fmtMoney } = useCurrency();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showCreateForm, setShowCreateForm] = useState(true);
  const [providerSearch, setProviderSearch] = useState("");
  const [providerStatusFilter, setProviderStatusFilter] = useState<string>("all");
  const [providerTypeFilter, setProviderTypeFilter] = useState<string>("all");

  const form = useForm<AdminProviderData & { practitioners: any[] }>({
    resolver: zodResolver(adminProviderSchema.extend({
      practitioners: z.array(z.object({
        name: z.string().min(2),
        dob: z.string().min(10),
        originCountry: z.string().min(2),
        registrationNumber: z.string().min(2),
        identityNumber: z.string().min(2),
        mobileNumber: z.string().min(2),
      })).optional()
    })),
    defaultValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      phone: "",
      city: "",
      type: "physiotherapist",
      specialization: "",
      bio: "",
      yearsExperience: 0,
      education: "",
      consultationFee: 0,
      homeVisitFee: undefined,
      languages: ["english"],
      availableDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      practitioners: [{ name: "", dob: "", originCountry: "", registrationNumber: "", identityNumber: "", mobileNumber: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "practitioners",
  });

  const invalidateProviderCaches = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/bookings"] });
    queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
  };

  const createProviderMutation = useMutation({
    mutationFn: async (data: AdminProviderData) => {
      const response = await apiRequest("POST", "/api/admin/providers", data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create provider");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Provider created successfully" });
      form.reset();
      invalidateProviderCaches();
    },
    onError: (error: Error) => {
      toast({
        title: "Error creating provider",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { data: providers, isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/providers"],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

  const { data: providerStats, isLoading: isLoadingStats } = useQuery<any>({
    queryKey: ["/api/admin/providers", selectedProviderId, "stats"],
    enabled: !!selectedProviderId,
  });

  const updateProviderMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const response = await apiRequest("PATCH", `/api/admin/providers/${id}`, data);
      if (!response.ok) throw new Error("Failed to update provider");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Provider updated successfully" });
      invalidateProviderCaches();
    },
  });

  const deleteProviderMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/providers/${id}`);
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/admin/providers"] });
      const previous = queryClient.getQueryData<any[]>(["/api/admin/providers"]);
      queryClient.setQueryData<any[]>(["/api/admin/providers"], (old) =>
        (old || []).filter((p) => p.id !== id),
      );
      return { previous };
    },
    onSuccess: () => {
      toast({ title: "Provider profile deleted" });
      invalidateProviderCaches();
    },
    onError: (error: Error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/admin/providers"], context.previous);
      }
      toast({ title: t("admin_dashboard.error"), description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  const providersList = providers ?? [];
  const filteredProviders = providersList.filter((p: any) => {
    if (providerStatusFilter !== "all") {
      const normalizedStatus = p.status === "approved" ? "active" : p.status;
      if (normalizedStatus !== providerStatusFilter) return false;
    }
    if (providerTypeFilter !== "all" && (p.providerType || p.type) !== providerTypeFilter) return false;
    if (!providerSearch) return true;
    const q = providerSearch.toLowerCase();
    return (
      `${p.user?.firstName || ""} ${p.user?.lastName || ""}`.toLowerCase().includes(q) ||
      (p.user?.email || "").toLowerCase().includes(q) ||
      (p.specialization || "").toLowerCase().includes(q) ||
      (p.user?.city || "").toLowerCase().includes(q)
    );
  });
  const providerCounts = providersList.reduce((acc: Record<string, number>, p: any) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    acc.all = (acc.all || 0) + 1;
    return acc;
  }, { all: 0 });

  const providerTypeIcon = (type: string) => {
    if (type === "doctor") return Stethoscope;
    if (type === "nurse") return UserCheck;
    return Briefcase;
  };

  return (
    <div className="space-y-6">
      {/* Toolbar header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t("admin.manage_providers", "Providers")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.providers_sub", "Create, manage, and monitor all healthcare providers in your platform.")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-8 px-2.5 text-xs gap-1.5">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
            {t("admin.active", "Active")}: <span className="font-semibold">{providerCounts.active || 0}</span>
          </Badge>
          <Badge variant="outline" className="h-8 px-2.5 text-xs gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            {t("admin.pending", "Pending")}: <span className="font-semibold">{providerCounts.pending || 0}</span>
          </Badge>
          <Button
            onClick={() => setShowCreateForm(v => !v)}
            data-testid="button-toggle-create-form"
            variant={showCreateForm ? "outline" : "default"}
          >
            {showCreateForm ? (
              <>
                <ChevronUp className="h-4 w-4 mr-2" />
                {t("admin.hide_form", "Hide form")}
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4 mr-2" />
                {t("admin.add_provider", "Add provider")}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Inline create form (open fields, sectioned) */}
      {showCreateForm && (
        <Card className="overflow-hidden">
          <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent border-b">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <UserPlus className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>{t("admin.create_new_provider", "Create new provider")}</CardTitle>
                <CardDescription>{t("admin.add_provider_desc", "Fill in the details below to add a new provider account.")}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((data) => createProviderMutation.mutate(data))}
                className="space-y-5"
              >
                <FormSection
                  icon={Lock}
                  title={t("admin.section_account", "Account credentials")}
                  description={t("admin.section_account_desc", "Login email and initial password for the provider.")}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.email", "Email")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                              <Input {...field} type="email" className="pl-8" placeholder="provider@example.com" data-testid="input-provider-email" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.password", "Password")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Lock className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                              <Input {...field} type="password" className="pl-8" placeholder="••••••••" data-testid="input-provider-password" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </FormSection>

                <FormSection
                  icon={UserCheck}
                  title={t("admin.section_personal", "Personal info")}
                  description={t("admin.section_personal_desc", "Basic contact details for the provider's account.")}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.first_name", "First name")}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-provider-firstname" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.last_name", "Last name")}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-provider-lastname" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.phone", "Phone")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Phone className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                              <Input {...field} className="pl-8" data-testid="input-provider-phone" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.city", "City")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <MapPin className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                              <Input {...field} className="pl-8" data-testid="input-provider-city" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </FormSection>

                <FormSection
                  icon={Stethoscope}
                  title={t("admin.section_professional", "Professional info")}
                  description={t("admin.section_professional_desc", "Specialty, experience, and credentials.")}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.provider_type", "Provider type")}</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-provider-type">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="physiotherapist">{t("common_service_type.physiotherapist", "Physiotherapist")}</SelectItem>
                              <SelectItem value="doctor">{t("common_service_type.doctor", "Doctor")}</SelectItem>
                              <SelectItem value="nurse">{t("common_service_type.nurse", "Nurse")}</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="specialization"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.specialization", "Specialization")}</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder={t("admin.specialization_placeholder", "e.g. Cardiology")} data-testid="input-provider-specialization" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="yearsExperience"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.years_experience", "Years of experience")}</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} data-testid="input-provider-experience" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="education"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.education", "Education")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <GraduationCap className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                              <Input {...field} className="pl-8" data-testid="input-provider-education" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="mt-4">
                    <FormField
                      control={form.control}
                      name="bio"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.bio", "Bio")}</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              rows={3}
                              placeholder={t("admin.bio_placeholder", "A short professional bio shown on the provider's public profile...")}
                              data-testid="input-provider-bio"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </FormSection>

                <FormSection
                  icon={DollarSign}
                  title={t("admin.section_pricing", "Pricing")}
                  description={t("admin.section_pricing_desc", "Default fees for consultations and home visits.")}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="consultationFee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.consultation_fee", "Consultation fee")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <DollarSign className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                              <Input type="number" step="0.01" {...field} className="pl-8" data-testid="input-provider-fee" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="homeVisitFee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin.home_visit_fee", "Home visit fee")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <DollarSign className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                              <Input
                                type="number"
                                step="0.01"
                                {...field}
                                className="pl-8"
                                value={field.value || ""}
                                onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                                data-testid="input-provider-homevisit-fee"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </FormSection>

                <FormSection
                  icon={Calendar}
                  title={t("admin.section_schedule", "Schedule & languages")}
                  description={t("admin.section_schedule_desc", "When the provider is available and which languages they speak.")}
                >
                  <FormField
                    control={form.control}
                    name="availableDays"
                    render={() => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {t("admin.available_days", "Available days")}
                        </FormLabel>
                        <div className="flex flex-wrap gap-2">
                          {dayOptions.map((day) => (
                            <FormField
                              key={day.value}
                              control={form.control}
                              name="availableDays"
                              render={({ field }) => {
                                const checked = field.value?.includes(day.value);
                                return (
                                  <FormItem className="m-0">
                                    <FormLabel className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors select-none ${
                                      checked
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-background hover:bg-muted/60"
                                    }`}>
                                      <FormControl>
                                        <Checkbox
                                          checked={checked}
                                          onCheckedChange={(c) => {
                                            const updated = c
                                              ? [...(field.value || []), day.value]
                                              : (field.value || []).filter((v) => v !== day.value);
                                            field.onChange(updated);
                                          }}
                                          className="sr-only"
                                          data-testid={`checkbox-day-${day.value}`}
                                        />
                                      </FormControl>
                                      {day.label}
                                    </FormLabel>
                                  </FormItem>
                                );
                              }}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="mt-4">
                    <FormField
                      control={form.control}
                      name="languages"
                      render={() => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1.5">
                            <Globe className="h-3.5 w-3.5" />
                            {t("admin.languages", "Languages")}
                          </FormLabel>
                          <div className="flex flex-wrap gap-2">
                            {languageOptions.map((lang) => (
                              <FormField
                                key={lang.value}
                                control={form.control}
                                name="languages"
                                render={({ field }) => {
                                  const checked = field.value?.includes(lang.value);
                                  return (
                                    <FormItem className="m-0">
                                      <FormLabel className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors select-none ${
                                        checked
                                          ? "bg-primary text-primary-foreground border-primary"
                                          : "bg-background hover:bg-muted/60"
                                      }`}>
                                        <FormControl>
                                          <Checkbox
                                            checked={checked}
                                            onCheckedChange={(c) => {
                                              const updated = c
                                                ? [...(field.value || []), lang.value]
                                                : (field.value || []).filter((v) => v !== lang.value);
                                              field.onChange(updated);
                                            }}
                                            className="sr-only"
                                            data-testid={`checkbox-lang-${lang.value}`}
                                          />
                                        </FormControl>
                                        {lang.label}
                                      </FormLabel>
                                    </FormItem>
                                  );
                                }}
                              />
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </FormSection>

                <FormSection
                  icon={Users}
                  title={t("admin.medical_practitioners", "Medical practitioners")}
                  description={t("admin.section_practitioners_desc", "Practitioners attached to this provider's account.")}
                >
                  <div className="space-y-3">
                    {fields.map((field, index) => (
                      <div key={field.id} className="rounded-lg border bg-muted/20 p-4 relative">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t("admin.practitioner", "Practitioner")} #{index + 1}
                          </span>
                          {fields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-destructive hover:text-destructive"
                              onClick={() => remove(index)}
                              data-testid={`button-remove-practitioner-${index}`}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              {t("admin.remove", "Remove")}
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <FormField
                            control={form.control}
                            name={`practitioners.${index}.name`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">{t("admin.name", "Name")}</FormLabel>
                                <FormControl><Input {...field} className="h-9" /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`practitioners.${index}.dob`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">{t("admin.dob_label", "Date of birth")}</FormLabel>
                                <FormControl><Input type="date" {...field} className="h-9" /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`practitioners.${index}.originCountry`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">{t("admin.origin_country", "Origin country")}</FormLabel>
                                <FormControl><Input {...field} className="h-9" /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`practitioners.${index}.registrationNumber`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">{t("admin.reg_number", "Registration #")}</FormLabel>
                                <FormControl><Input {...field} className="h-9" /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`practitioners.${index}.identityNumber`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">{t("admin.identity_number", "Identity #")}</FormLabel>
                                <FormControl><Input {...field} className="h-9" /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`practitioners.${index}.mobileNumber`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">{t("admin.mobile_number", "Mobile")}</FormLabel>
                                <FormControl><Input {...field} className="h-9" /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full border-dashed"
                      onClick={() => append({ name: "", dob: "", originCountry: "", registrationNumber: "", identityNumber: "", mobileNumber: "" })}
                      data-testid="button-add-practitioner"
                    >
                      <Plus className="h-4 w-4 mr-2" /> {t("admin.add_practitioner", "Add practitioner")}
                    </Button>
                  </div>
                </FormSection>

                <div className="sticky bottom-0 -mx-5 -mb-5 px-5 py-3 bg-background/95 backdrop-blur border-t flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => form.reset()}
                    data-testid="button-reset-provider-form"
                  >
                    {t("common.reset", "Reset")}
                  </Button>
                  <Button
                    type="submit"
                    size="lg"
                    disabled={createProviderMutation.isPending}
                    data-testid="button-create-provider"
                  >
                    {createProviderMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("admin.creating", "Creating...")}
                      </>
                    ) : (
                      <>
                        <UserPlus className="mr-2 h-4 w-4" />
                        {t("admin.create_provider", "Create provider")}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Provider list */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <CardTitle>{t("admin.all_providers", "All providers")}</CardTitle>
              <Badge variant="secondary" className="rounded-full">{filteredProviders.length}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder={t("admin.search_providers", "Search by name, email, specialization, city...")}
                value={providerSearch}
                onChange={(e) => setProviderSearch(e.target.value)}
                className="pl-8 h-9"
                data-testid="input-search-providers"
              />
            </div>
            <Select value={providerTypeFilter} onValueChange={setProviderTypeFilter}>
              <SelectTrigger className="w-44 h-9" data-testid="select-filter-provider-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin.all_types", "All types")}</SelectItem>
                <SelectItem value="physiotherapist">{t("common_service_type.physiotherapist", "Physiotherapist")}</SelectItem>
                <SelectItem value="doctor">{t("common_service_type.doctor", "Doctor")}</SelectItem>
                <SelectItem value="nurse">{t("common_service_type.nurse", "Nurse")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={providerStatusFilter} onValueChange={setProviderStatusFilter}>
              <SelectTrigger className="w-40 h-9" data-testid="select-filter-provider-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin.all_statuses", "All statuses")}</SelectItem>
                <SelectItem value="active">{t("admin.active", "Active")}</SelectItem>
                <SelectItem value="suspended">{t("admin.suspended", "Suspended")}</SelectItem>
                <SelectItem value="pending">{t("admin.awaiting_approval", "Awaiting Approval")}</SelectItem>
                <SelectItem value="rejected">{t("admin.rejected", "Rejected")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          {filteredProviders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground space-y-2">
              <Briefcase className="h-12 w-12 text-muted-foreground/30" />
              <p className="text-sm">
                {providersList.length === 0
                  ? t("admin.no_providers_yet", "No providers yet. Add your first one to get started.")
                  : t("admin.no_providers_match", "No providers match your filters.")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredProviders.map((provider: any) => {
                const providerTypeKey = provider.providerType || provider.type || "";
                const TypeIcon = providerTypeIcon(providerTypeKey);
                const fullName = `${provider.user?.firstName || ""} ${provider.user?.lastName || ""}`.trim() || provider.user?.email || "Provider";
                const typeLabel = providerTypeKey
                  ? String(t(`common_service_type.${providerTypeKey}`, { defaultValue: providerTypeKey.charAt(0).toUpperCase() + providerTypeKey.slice(1) }))
                  : t("admin.provider_type_unknown", "Unknown type");
                return (
                  <div
                    key={provider.id}
                    className="rounded-xl border bg-card overflow-hidden hover-elevate transition-all"
                    data-testid={`card-provider-${provider.id}`}
                  >
                    <div className="p-4 flex items-start gap-3 border-b">
                      <TicketAvatar name={fullName} seed={provider.id} size={44} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-sm truncate">{fullName}</p>
                          <ProviderStatusPill status={provider.status} t={t} />
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{provider.user?.email}</p>
                        {provider.specialization && (
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <Badge variant="outline" className="text-[10px] px-1.5 h-5">
                              {provider.specialization}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-4 space-y-2 text-xs">
                      {provider.user?.city && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          <span>{provider.user.city}</span>
                        </div>
                      )}
                      {provider.user?.phone && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          <span>{provider.user.phone}</span>
                        </div>
                      )}
                      {provider.yearsExperience != null && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Briefcase className="h-3 w-3" />
                          <span>{provider.yearsExperience} {t("admin.years", "years")}</span>
                        </div>
                      )}
                      {provider.consultationFee != null && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <DollarSign className="h-3 w-3" />
                          <span>{fmtMoney(provider.consultationFee)} · {t("admin.consultation", "consultation")}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
                            {t("admin.start", "Start")}
                          </p>
                          <Input
                            type="date"
                            className="h-7 px-2 text-[11px]"
                            defaultValue={provider.startDate ? new Date(provider.startDate).toISOString().split('T')[0] : ""}
                            onBlur={(e) => {
                              if (e.target.value) {
                                updateProviderMutation.mutate({ id: provider.id, startDate: new Date(e.target.value) });
                              }
                            }}
                            data-testid={`input-start-${provider.id}`}
                          />
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
                            {t("admin.end", "End")}
                          </p>
                          <Input
                            type="date"
                            className="h-7 px-2 text-[11px]"
                            defaultValue={provider.endDate ? new Date(provider.endDate).toISOString().split('T')[0] : ""}
                            onBlur={(e) => {
                              updateProviderMutation.mutate({ id: provider.id, endDate: e.target.value ? new Date(e.target.value) : null });
                            }}
                            data-testid={`input-end-${provider.id}`}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-3 border-t bg-muted/20 flex items-center gap-2">
                      <Select
                        value={provider.status}
                        onValueChange={(status) => updateProviderMutation.mutate({
                          id: provider.id,
                          status,
                          isVerified: status === "active",
                        })}
                      >
                        <SelectTrigger className="h-8 text-xs flex-1" data-testid={`select-status-${provider.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">{t("admin.active", "Active")}</SelectItem>
                          <SelectItem value="suspended">{t("admin.suspended", "Suspended")}</SelectItem>
                          <SelectItem value="pending">{t("admin.awaiting_approval", "Awaiting Approval")}</SelectItem>
                          <SelectItem value="rejected">{t("admin.rejected", "Rejected")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2"
                        onClick={() => setSelectedProviderId(provider.id)}
                        title={t("admin.view_stats", "View stats")}
                        data-testid={`button-stats-${provider.id}`}
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                      </Button>
                      <ProviderEditDialog provider={provider} />
                      <ProviderDetailsDialog provider={provider} />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          if (confirm(t("admin.confirm_delete_provider", "Delete this provider?"))) {
                            deleteProviderMutation.mutate(provider.id);
                          }
                        }}
                        data-testid={`button-delete-provider-${provider.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedProviderId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t("admin_dashboard.booking_stats")}</CardTitle>
              <CardDescription>{t("admin_dashboard.booking_stats_desc")}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedProviderId(null)}>{t("admin_dashboard.close")}</Button>
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="p-4 rounded-lg bg-muted/50 border">
                    <div className="text-sm font-medium text-muted-foreground">{t("admin_dashboard.total_bookings_label")}</div>
                    <div className="text-2xl font-bold">{providerStats?.total || 0}</div>
                  </div>
                  <div className="p-4 rounded-lg bg-orange-100 border border-orange-200 dark:bg-orange-950/20 dark:border-orange-900/50">
                    <div className="text-sm font-medium text-orange-600 dark:text-orange-400">{t("admin_dashboard.pending")}</div>
                    <div className="text-2xl font-bold">{providerStats?.pending || 0}</div>
                  </div>
                  <div className="p-4 rounded-lg bg-green-100 border border-green-200 dark:bg-green-950/20 dark:border-green-900/50">
                    <div className="text-sm font-medium text-green-600 dark:text-green-400">{t("admin_dashboard.completed")}</div>
                    <div className="text-2xl font-bold">{providerStats?.completed || 0}</div>
                  </div>
                  <div className="p-4 rounded-lg bg-red-100 border border-red-200 dark:bg-red-950/20 dark:border-red-900/50">
                    <div className="text-sm font-medium text-red-600 dark:text-red-400">{t("admin_dashboard.cancelled")}</div>
                    <div className="text-2xl font-bold">{providerStats?.cancelled || 0}</div>
                  </div>
                </div>

                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="h-10 px-4 text-left font-medium">{t("admin_dashboard.patient")}</th>
                        <th className="h-10 px-4 text-left font-medium">{t("admin_dashboard.date")}</th>
                        <th className="h-10 px-4 text-left font-medium">{t("admin_dashboard.amount")}</th>
                        <th className="h-10 px-4 text-left font-medium">{t("admin_dashboard.status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {providerStats?.bookings.length === 0 ? (
                        <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">{t("admin_dashboard.no_bookings")}</td></tr>
                      ) : (
                        providerStats?.bookings.map((booking: any) => (
                          <tr key={booking.id} className="border-b last:border-0">
                            <td className="p-4 font-medium">{booking.patientName}</td>
                            <td className="p-4">{new Date(booking.date).toLocaleDateString()} at {booking.startTime}</td>
                            <td className="p-4">{fmtMoney(booking.amount)}</td>
                            <td className="p-4">
                              <Badge variant={
                                booking.status === 'completed' ? 'default' :
                                booking.status === 'pending' ? 'outline' :
                                booking.status === 'cancelled' ? 'destructive' : 'secondary'
                              }>
                                {booking.status}
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Content Management Component
function ContentManagement() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("faqs");

  // FAQs
  const { data: faqs, refetch: refetchFaqs } = useQuery<any[]>({
    queryKey: ["/api/admin/faqs"],
  });

  const faqForm = useForm({
    defaultValues: { question: "", answer: "", category: "", sortOrder: 0 },
  });

  const createFaqMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/admin/faqs", data);
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || t("admin_dashboard.faq_create_failed"));
      return resData;
    },
    onSuccess: () => {
      toast({ title: t("admin_dashboard.faq_created") });
      faqForm.reset();
      refetchFaqs();
    },
    onError: (error: Error) => {
      toast({ title: t("admin_dashboard.error"), description: error.message, variant: "destructive" });
    },
  });

  const deleteFaqMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/faqs/${id}`);
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || t("admin_dashboard.faq_delete_failed"));
      return resData;
    },
    onSuccess: () => {
      toast({ title: t("admin_dashboard.faq_deleted") });
      refetchFaqs();
    },
  });

  // Announcements
  const { data: announcements, refetch: refetchAnnouncements } = useQuery<any[]>({
    queryKey: ["/api/admin/announcements"],
  });

  const announcementForm = useForm({
    defaultValues: { 
      title: "", 
      content: "", 
      type: "info",
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    },
  });

  const createAnnouncementMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/admin/announcements", data);
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || t("admin_dashboard.announcement_create_failed"));
      return resData;
    },
    onSuccess: () => {
      toast({ title: t("admin_dashboard.announcement_created") });
      announcementForm.reset();
      refetchAnnouncements();
    },
    onError: (error: Error) => {
      toast({ title: t("admin_dashboard.error"), description: error.message, variant: "destructive" });
    },
  });

  const deleteAnnouncementMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/announcements/${id}`);
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || t("admin_dashboard.faq_delete_failed"));
      return resData;
    },
    onSuccess: () => {
      toast({ title: t("admin_dashboard.announcement_deleted") });
      refetchAnnouncements();
    },
  });

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="tabs-colorful tabs-violet flex flex-wrap gap-1 h-auto w-full">
          <TabsTrigger value="providers" data-testid="tab-content-providers">{t("admin_dashboard.tab_providers")}</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-content-users">{t("admin_dashboard.tab_users")}</TabsTrigger>
          <TabsTrigger value="promo-codes" data-testid="tab-content-promo-codes">{t("admin_dashboard.tab_promo_codes")}</TabsTrigger>
          <TabsTrigger value="tickets" data-testid="tab-content-tickets">{t("admin_dashboard.tab_support")}</TabsTrigger>
          <TabsTrigger value="faqs" data-testid="tab-content-faqs">{t("admin_dashboard.tab_faqs")}</TabsTrigger>
          <TabsTrigger value="announcements" data-testid="tab-content-announcements">{t("admin_dashboard.tab_announcements")}</TabsTrigger>
          <TabsTrigger value="referrals" data-testid="tab-content-referrals">Referrals</TabsTrigger>
        </TabsList>

        <TabsContent value="referrals" className="space-y-4">
          <ReferralLeaderboard />
        </TabsContent>

        <TabsContent value="faqs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("admin_dashboard.create_faq")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...faqForm}>
                <form onSubmit={faqForm.handleSubmit((data) => createFaqMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={faqForm.control}
                    name="question"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("admin_dashboard.question")}</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-faq-question" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={faqForm.control}
                    name="answer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("admin_dashboard.answer")}</FormLabel>
                        <FormControl>
                          <Textarea {...field} data-testid="input-faq-answer" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={faqForm.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("admin_dashboard.category")}</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder={t("admin_dashboard.faq_category_placeholder")} data-testid="input-faq-category" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={createFaqMutation.isPending} data-testid="button-create-faq">
                    {createFaqMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                    {t("admin_dashboard.create_faq")}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("admin_dashboard.all_faqs")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {faqs?.map((faq: any) => (
                  <div key={faq.id} className="p-4 border rounded-lg" data-testid={`card-faq-${faq.id}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="font-medium">{faq.question}</p>
                        <p className="text-sm text-muted-foreground mt-1">{faq.answer}</p>
                        {faq.category && <Badge variant="outline" className="mt-2">{faq.category}</Badge>}
                      </div>
                      <Button
                        size="icon"
                        variant="destructive"
                        onClick={() => deleteFaqMutation.mutate(faq.id)}
                        data-testid={`button-delete-faq-${faq.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="announcements" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("admin_dashboard.create_announcement")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...announcementForm}>
                <form onSubmit={announcementForm.handleSubmit((data) => createAnnouncementMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={announcementForm.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("admin_dashboard.title")}</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-announcement-title" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={announcementForm.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("admin_dashboard.content")}</FormLabel>
                        <FormControl>
                          <Textarea {...field} data-testid="input-announcement-content" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={announcementForm.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin_dashboard.type")}</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-announcement-type">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="info">{t("admin_dashboard.type_info")}</SelectItem>
                              <SelectItem value="warning">{t("admin_dashboard.type_warning")}</SelectItem>
                              <SelectItem value="success">{t("admin_dashboard.type_success")}</SelectItem>
                              <SelectItem value="error">{t("admin_dashboard.type_error")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={announcementForm.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin_dashboard.start_date")}</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-announcement-start" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={announcementForm.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("admin_dashboard.end_date")}</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-announcement-end" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <Button type="submit" disabled={createAnnouncementMutation.isPending} data-testid="button-create-announcement">
                    {createAnnouncementMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                    {t("admin_dashboard.create_announcement")}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <BroadcastPanel />
          <DeliveryLogsPanel />

          <Card>
            <CardHeader>
              <CardTitle>{t("admin_dashboard.all_announcements")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {announcements?.map((ann: any) => (
                  <div key={ann.id} className="p-4 border rounded-lg" data-testid={`card-announcement-${ann.id}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{ann.title}</p>
                          <Badge variant={
                            ann.type === 'warning' ? 'destructive' :
                            ann.type === 'success' ? 'default' : 'secondary'
                          }>{ann.type}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{ann.content}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {new Date(ann.startDate).toLocaleDateString()} - {new Date(ann.endDate).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="destructive"
                        onClick={() => deleteAnnouncementMutation.mutate(ann.id)}
                        data-testid={`button-delete-announcement-${ann.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Platform Settings Component
function PlatformSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data: settings, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/settings"],
  });

  const settingsForm = useForm({
    defaultValues: { key: "", value: "", category: "general", description: "" },
  });

  const createSettingMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/admin/settings", data);
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || t("admin_dashboard.setting_save_failed"));
      return resData;
    },
    onSuccess: () => {
      toast({ title: t("admin_dashboard.setting_saved") });
      settingsForm.reset();
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: t("admin_dashboard.error"), description: error.message, variant: "destructive" });
    },
  });

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const response = await apiRequest("POST", "/api/admin/settings", { key, value });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || t("admin_dashboard.setting_update_failed"));
      return resData;
    },
    onSuccess: () => {
      toast({ title: t("admin_dashboard.setting_updated") });
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: t("admin_dashboard.error"), description: error.message, variant: "destructive" });
    },
  });

  const groupedSettings = settings?.reduce((acc: any, setting: any) => {
    const category = setting.category || 'general';
    if (!acc[category]) acc[category] = [];
    acc[category].push(setting);
    return acc;
  }, {}) || {};

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("admin_dashboard.add_new_setting")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...settingsForm}>
            <form onSubmit={settingsForm.handleSubmit((data) => createSettingMutation.mutate(data))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={settingsForm.control}
                  name="key"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin_dashboard.setting_key")}</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder={t("admin_dashboard.setting_key_placeholder")} data-testid="input-setting-key" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={settingsForm.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin_dashboard.category")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-setting-category">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="general">{t("admin_dashboard.cat_general")}</SelectItem>
                          <SelectItem value="booking">{t("admin_dashboard.cat_booking")}</SelectItem>
                          <SelectItem value="payment">{t("admin_dashboard.cat_payment")}</SelectItem>
                          <SelectItem value="notification">{t("admin_dashboard.cat_notification")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={settingsForm.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("admin_dashboard.value")}</FormLabel>
                    <FormControl>
                      <Textarea {...field} data-testid="input-setting-value" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={settingsForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("admin_dashboard.description")}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t("admin_dashboard.setting_description_placeholder")} data-testid="input-setting-description" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={createSettingMutation.isPending} data-testid="button-create-setting">
                {createSettingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                {t("admin_dashboard.add_setting")}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {Object.entries(groupedSettings).map(([category, catSettings]: [string, any]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="capitalize">{t("admin_dashboard.settings_suffix", { category })}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {catSettings.map((setting: any) => (
                <div key={setting.id} className="flex items-center gap-4 p-3 border rounded-lg" data-testid={`row-setting-${setting.key}`}>
                  <div className="flex-1">
                    <p className="font-medium font-mono text-sm">{setting.key}</p>
                    {setting.description && (
                      <p className="text-xs text-muted-foreground">{setting.description}</p>
                    )}
                  </div>
                  <Input
                    defaultValue={setting.value}
                    className="w-64"
                    onBlur={(e) => {
                      if (e.target.value !== setting.value) {
                        updateSettingMutation.mutate({ key: setting.key, value: e.target.value });
                      }
                    }}
                    data-testid={`input-setting-value-${setting.key}`}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Audit Logs Component
function AuditLogs() {
  const { t } = useTranslation();
  const { data: logs, isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/audit-logs"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin_dashboard.audit_logs")}</CardTitle>
        <CardDescription>{t("admin_dashboard.audit_logs_desc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px]">
          <div className="divide-y">
            {logs?.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {t("admin_dashboard.no_audit_logs")}
              </div>
            ) : (
              logs?.map((log: any) => (
                <div key={log.id} className="py-4 flex items-start gap-4" data-testid={`row-audit-${log.id}`}>
                  <div className="p-2 rounded-full bg-muted">
                    <Activity className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge>{log.action}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {log.entityType} - {log.entityId?.slice(0, 8)}
                      </span>
                    </div>
                    {log.details && (
                      <pre className="text-xs text-muted-foreground mt-2 p-2 bg-muted rounded overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(log.createdAt).toLocaleString()}
                      {log.ipAddress && ` | IP: ${log.ipAddress}`}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ─── Country migration history (global admin only) ───────────────────────
type CountryMigrationRow = {
  id: string;
  createdAt: string | null;
  targetUserId: string | null;
  targetUserEmail: string | null;
  targetUserName: string | null;
  fromCountry: string | null;
  toCountry: string | null;
  counts: Record<string, number> | null;
  reason: string | null;
  performedById: string | null;
  performedByEmail: string | null;
  performedByName: string | null;
};

const COUNT_LABELS: Record<string, string> = {
  users: "Users",
  providers: "Provider profiles",
  services: "Services",
  serviceRequests: "Service requests",
  appointmentsAsPatient: "Appts (as patient)",
  appointmentsAsProvider: "Appts (as provider)",
  invoices: "Invoices",
  payments: "Payments",
};

function MigrationHistory() {
  const { t } = useTranslation();
  const [country, setCountry] = useState<"all" | "HU" | "IR">("all");
  const [search, setSearch] = useState("");

  const { data: rows, isLoading } = useQuery<CountryMigrationRow[]>({
    queryKey: ["/api/admin/country-migrations"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const filtered = (rows || []).filter((r) => {
    if (country !== "all" && r.toCountry !== country && r.fromCountry !== country) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = [
        r.targetUserEmail, r.targetUserName, r.performedByEmail,
        r.performedByName, r.reason,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const totalRowsTouched = (counts: Record<string, number> | null) =>
    counts ? Object.values(counts).reduce((s, n) => s + (Number(n) || 0), 0) : 0;

  return (
    <Card data-testid="card-migration-history">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          {t("admin.migration_history_title", "Country migration history")}
        </CardTitle>
        <CardDescription>
          {t(
            "admin.migration_history_desc",
            "Every cross-country user migration performed by a global admin, with the operator, the reason, and the row counts touched.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">{t("admin.migration_filter_country", "Country")}</Label>
            <Select value={country} onValueChange={(v) => setCountry(v as any)}>
              <SelectTrigger className="w-32 h-8" data-testid="select-migration-country">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all", "All")}</SelectItem>
                <SelectItem value="HU">HU</SelectItem>
                <SelectItem value="IR">IR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("admin.migration_search_ph", "Search by user, operator, or reason…")}
              className="h-8"
              data-testid="input-migration-search"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {filtered.length}/{rows?.length || 0}
          </div>
        </div>

        <ScrollArea className="h-[600px]">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground" data-testid="text-migration-empty">
              {t("admin.migration_history_empty", "No migrations recorded yet.")}
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((r) => {
                const total = totalRowsTouched(r.counts);
                return (
                  <div key={r.id} className="py-4 space-y-2" data-testid={`row-migration-${r.id}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono">{r.fromCountry || "?"}</Badge>
                      <span className="text-muted-foreground">→</span>
                      <Badge className="font-mono">{r.toCountry || "?"}</Badge>
                      <span className="text-sm font-medium" data-testid={`text-migration-target-${r.id}`}>
                        {r.targetUserName || "—"}
                      </span>
                      <span className="text-xs text-muted-foreground">{r.targetUserEmail || ""}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}
                      </span>
                    </div>

                    {r.reason && (
                      <div className="text-sm bg-muted/40 border rounded p-2">
                        <span className="text-muted-foreground text-xs">{t("admin.migration_reason_label", "Reason")}: </span>
                        <span data-testid={`text-migration-reason-${r.id}`}>{r.reason}</span>
                      </div>
                    )}

                    {r.counts && (
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        <Badge variant="secondary" data-testid={`text-migration-total-${r.id}`}>
                          {t("admin.migration_total_rows", "Total rows touched")}: <span className="font-mono ml-1">{total}</span>
                        </Badge>
                        {Object.entries(r.counts).map(([k, v]) => (
                          (Number(v) > 0) ? (
                            <Badge key={k} variant="outline">
                              {COUNT_LABELS[k] || k}: <span className="font-mono ml-1">{v}</span>
                            </Badge>
                          ) : null
                        ))}
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground">
                      {t("admin.migration_performed_by", "By")}:{" "}
                      <span className="font-medium">{r.performedByName || r.performedByEmail || r.performedById?.slice(0, 8) || "—"}</span>
                      {r.performedByEmail && r.performedByName ? <> &middot; {r.performedByEmail}</> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// Invoice Management Component
function InvoiceManagement() {
  const { format: fmtMoney } = useCurrency();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: invoices, isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/invoices"],
  });

  const generatePendingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/invoices/generate-pending", {});
      return response.json();
    },
    onSuccess: () => {
      toast({ title: t("admin_dashboard.pending_invoices_generated") });
      refetch();
    },
  });

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <Tabs defaultValue="list" className="space-y-6">
      <TabsList className="tabs-colorful">
        <TabsTrigger value="list" data-testid="tab-invoice-list">
          <FileText className="h-4 w-4 mr-1.5" />
          Invoices
        </TabsTrigger>
        <TabsTrigger value="template" data-testid="tab-invoice-template">
          <Settings className="h-4 w-4 mr-1.5" />
          Template
        </TabsTrigger>
      </TabsList>

      <TabsContent value="template">
        <InvoiceTemplateEditor />
      </TabsContent>

      <TabsContent value="list" className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">{t("admin_dashboard.invoice_management")}</h3>
          <p className="text-sm text-muted-foreground">{t("admin_dashboard.invoice_management_desc")}</p>
        </div>
        <Button 
          onClick={() => generatePendingMutation.mutate()} 
          disabled={generatePendingMutation.isPending}
          data-testid="button-generate-pending-invoices"
        >
          {generatePendingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
          {t("admin_dashboard.generate_pending")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="h-10 px-4 text-left font-medium">{t("admin_dashboard.invoice_number")}</th>
                  <th className="h-10 px-4 text-left font-medium">{t("admin_dashboard.date")}</th>
                  <th className="h-10 px-4 text-left font-medium">{t("admin_dashboard.amount")}</th>
                  <th className="h-10 px-4 text-left font-medium">{t("admin_dashboard.status")}</th>
                  <th className="h-10 px-4 text-right font-medium">{t("admin_dashboard.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {invoices?.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      {t("admin_dashboard.no_invoices")}
                    </td>
                  </tr>
                ) : (
                  invoices?.map((invoice) => (
                    <tr key={invoice.id} className="border-b last:border-0" data-testid={`row-invoice-${invoice.id}`}>
                      <td className="p-4 font-medium">{invoice.invoiceNumber}</td>
                      <td className="p-4">{new Date(invoice.issueDate).toLocaleDateString()}</td>
                      <td className="p-4">{fmtMoney(invoice.totalAmount)}</td>
                      <td className="p-4">
                        <Badge variant={invoice.status === "paid" ? "default" : "secondary"}>
                          {invoice.status}
                        </Badge>
                      </td>
                      <td className="p-4 text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          asChild
                        >
                          <a href={`/api/invoices/${invoice.id}/download`} target="_blank" rel="noreferrer">
                            <FileText className="h-4 w-4 mr-2" />
                            PDF
                          </a>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      </TabsContent>
    </Tabs>
  );
}

// Invoice Template Editor — admin customizes the company branding shown on
// every generated invoice PDF. Stored as platform_settings rows under
// category="invoice_template" via /api/admin/invoice-template.
function InvoiceTemplateEditor() {
  const { toast } = useToast();
  const { data: template, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/invoice-template"],
  });
  const [form, setForm] = useState<Record<string, string>>({});
  const [previewBust, setPreviewBust] = useState(0);

  useEffect(() => {
    if (template && Object.keys(form).length === 0) {
      setForm({ ...template });
    }
  }, [template]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/admin/invoice-template", form);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Invoice template saved" });
      setForm({ ...data });
      queryClient.setQueryData(["/api/admin/invoice-template"], data);
      setPreviewBust((n) => n + 1);
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  const refreshPreview = async () => {
    try {
      const res = await apiRequest("POST", "/api/admin/invoice-template/preview", form);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (e: any) {
      toast({ title: "Preview failed", description: e?.message, variant: "destructive" });
    }
  };

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const FIELDS: Array<{ key: string; label: string; type?: "text" | "textarea" | "color" | "url"; placeholder?: string; help?: string; }> = [
    { key: "companyName", label: "Company name", placeholder: "Golden Life" },
    { key: "tagline", label: "Tagline / subtitle", placeholder: "Quality healthcare delivered." },
    { key: "brandColorHex", label: "Brand color", type: "color" },
    { key: "accentColorHex", label: "Accent color", type: "color" },
    { key: "addressLine1", label: "Address line 1", placeholder: "123 Main St" },
    { key: "addressLine2", label: "Address line 2", placeholder: "Suite 200" },
    { key: "city", label: "City", placeholder: "Budapest" },
    { key: "country", label: "Country", placeholder: "Hungary" },
    { key: "email", label: "Billing email", placeholder: "billing@goldenlife.health" },
    { key: "phone", label: "Phone", placeholder: "+36 1 234 5678" },
    { key: "website", label: "Website", placeholder: "goldenlife.health" },
    { key: "taxId", label: "Tax ID / VAT number", placeholder: "HU12345678" },
    { key: "footerText", label: "Footer text", type: "textarea", placeholder: "Thank you for choosing…" },
    { key: "paymentInstructions", label: "Payment instructions", type: "textarea", placeholder: "Pay via the My Invoices section…" },
    { key: "termsText", label: "Terms text", type: "textarea", placeholder: "Payment is due within 7 days…" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-medium">Invoice template</h3>
          <p className="text-sm text-muted-foreground">
            Customize the company details, branding, and footer that appear on every generated invoice PDF.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={refreshPreview}
            data-testid="button-invoice-template-preview"
          >
            <FileText className="h-4 w-4 mr-1.5" />
            Preview PDF
          </Button>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            data-testid="button-invoice-template-save"
          >
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save changes
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-6 flex-wrap">
            <div className="flex-shrink-0">
              <Label className="text-sm font-medium block mb-2">Logo</Label>
              <div
                className="h-28 w-28 rounded-lg border-2 border-dashed flex items-center justify-center bg-muted/30 overflow-hidden"
                data-testid="preview-tpl-logo"
              >
                {form.logoUrl ? (
                  <img
                    src={form.logoUrl}
                    alt="Logo"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground text-center px-2">No logo</span>
                )}
              </div>
            </div>
            <div className="flex-1 min-w-[240px] space-y-2">
              <Label className="text-sm font-medium">Upload logo</Label>
              <p className="text-xs text-muted-foreground">
                PNG or JPEG, ideally square. Max 1 MB. Shown at the top-left of every invoice.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 1024 * 1024) {
                      toast({
                        title: "Logo too large",
                        description: "Please choose an image under 1 MB.",
                        variant: "destructive",
                      });
                      e.target.value = "";
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      const dataUrl = String(reader.result || "");
                      set("logoUrl", dataUrl);
                    };
                    reader.onerror = () => {
                      toast({ title: "Could not read file", variant: "destructive" });
                    };
                    reader.readAsDataURL(file);
                    e.target.value = "";
                  }}
                  className="max-w-xs"
                  data-testid="input-tpl-logo-file"
                />
                {form.logoUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => set("logoUrl", "")}
                    data-testid="button-tpl-logo-remove"
                  >
                    Remove
                  </Button>
                )}
              </div>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">Or paste a hosted URL</summary>
                <Input
                  type="url"
                  value={form.logoUrl?.startsWith("data:") ? "" : (form.logoUrl ?? "")}
                  onChange={(e) => set("logoUrl", e.target.value)}
                  placeholder="https://…/logo.png"
                  className="mt-2"
                  data-testid="input-tpl-logo-url"
                />
              </details>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {FIELDS.map((f) => (
            <div
              key={f.key}
              className={f.type === "textarea" ? "md:col-span-2 space-y-1.5" : "space-y-1.5"}
            >
              <Label htmlFor={`tpl-${f.key}`}>{f.label}</Label>
              {f.type === "textarea" ? (
                <Textarea
                  id={`tpl-${f.key}`}
                  value={form[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  rows={2}
                  data-testid={`input-tpl-${f.key}`}
                />
              ) : f.type === "color" ? (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id={`tpl-${f.key}`}
                    value={(form[f.key] || "#000000")}
                    onChange={(e) => set(f.key, e.target.value)}
                    className="h-9 w-12 rounded border bg-transparent cursor-pointer"
                    data-testid={`color-tpl-${f.key}`}
                  />
                  <Input
                    value={form[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder="#C9A227"
                    className="font-mono"
                    data-testid={`input-tpl-${f.key}`}
                  />
                </div>
              ) : (
                <Input
                  id={`tpl-${f.key}`}
                  type={f.type === "url" ? "url" : "text"}
                  value={form[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  data-testid={`input-tpl-${f.key}`}
                />
              )}
              {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Tip: Click <strong>Preview PDF</strong> to open a sample invoice with the current (unsaved) values in a new tab.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modern complete ticketing system (admin)
// ─────────────────────────────────────────────────────────────────────────────

function ticketAgeLabel(iso: string | null | undefined): { label: string; tone: "fresh" | "warm" | "hot" } {
  if (!iso) return { label: "—", tone: "fresh" };
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return { label: `${m}m`, tone: "fresh" };
  const h = Math.floor(m / 60);
  if (h < 24) return { label: `${h}h`, tone: h >= 4 ? "warm" : "fresh" };
  const d = Math.floor(h / 24);
  return { label: `${d}d`, tone: d >= 3 ? "hot" : "warm" };
}

function ticketInitials(first?: string | null, last?: string | null, fallback?: string | null) {
  const a = (first || "").trim()[0] || "";
  const b = (last || "").trim()[0] || "";
  const initials = (a + b).toUpperCase();
  if (initials) return initials;
  if (fallback) return fallback.trim()[0]?.toUpperCase() || "?";
  return "?";
}

function ticketColorFor(seed: string): string {
  const palette = [
    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function TicketAvatar({ name, seed, size = 32 }: { name: string; seed: string; size?: number }) {
  const parts = name.trim().split(/\s+/);
  const initials = ticketInitials(parts[0], parts[1], name);
  const cls = ticketColorFor(seed || name);
  return (
    <div
      className={`rounded-full flex items-center justify-center font-semibold ${cls}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials}
    </div>
  );
}

// Support Tickets Component
function SupportTickets() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [reply, setReply] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);

  const { data: tickets, refetch, isFetching } = useQuery<any[]>({
    queryKey: ["/api/admin/support-tickets"],
    refetchInterval: 60000,
    staleTime: 30_000,
  });

  const { data: ticketMessages, refetch: refetchMessages } = useQuery<any[]>({
    queryKey: ["/api/admin/support-tickets", selectedTicket?.id, "messages"],
    enabled: !!selectedTicket,
    refetchInterval: 30000,
    staleTime: 10_000,
  });

  const { data: allUsers } = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
  });
  const adminUsers = (allUsers ?? []).filter(u => isAdminRole(u.role));

  const updateTicketMutation = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; status?: string; priority?: string; assignedTo?: string | null }) => {
      const response = await apiRequest("PATCH", `/api/admin/support-tickets/${id}`, patch);
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || t("admin_dashboard.ticket_update_failed", "Failed to update ticket"));
      return resData;
    },
    onSuccess: () => {
      toast({ title: t("admin_dashboard.ticket_updated", "Ticket updated") });
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: t("admin_dashboard.error", "Error"), description: error.message, variant: "destructive" });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ ticketId, message, isInternal }: { ticketId: string; message: string; isInternal: boolean }) => {
      const response = await apiRequest("POST", `/api/admin/support-tickets/${ticketId}/messages`, { message, isInternal });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || t("admin_dashboard.message_send_failed", "Failed to send message"));
      return resData;
    },
    onSuccess: () => {
      toast({ title: isInternalNote ? t("admin_dashboard.note_added", "Internal note added") : t("admin_dashboard.message_sent", "Reply sent") });
      setReply("");
      setIsInternalNote(false);
      refetchMessages();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support-tickets"] });
    },
    onError: (error: Error) => {
      toast({ title: t("admin_dashboard.error", "Error"), description: error.message, variant: "destructive" });
    },
  });

  const STATUS_CFG: Record<string, { label: string; cls: string; icon: any; pillCls: string }> = {
    open:        { label: t("admin_dashboard.status_open", "Open"),               icon: Inbox,       cls: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300",            pillCls: "bg-blue-500" },
    in_progress: { label: t("admin_dashboard.status_in_progress", "In progress"), icon: Activity,    cls: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300",       pillCls: "bg-amber-500" },
    resolved:    { label: t("admin_dashboard.status_resolved", "Resolved"),       icon: CheckCircle, cls: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300", pillCls: "bg-emerald-500" },
    closed:      { label: t("admin_dashboard.status_closed", "Closed"),           icon: XCircle,     cls: "bg-muted text-muted-foreground border-border",                                                pillCls: "bg-slate-400" },
  };
  const PRIORITY_CFG: Record<string, string> = {
    low:    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    high:   "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  };
  const ageToneCls = (tone: "fresh" | "warm" | "hot") =>
    tone === "hot" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
    : tone === "warm" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";

  const ticketCreatorName = (tk: any): string =>
    tk?.creator
      ? (`${tk.creator.firstName || ""} ${tk.creator.lastName || ""}`.trim() || tk.creator.email || t("admin_dashboard.guest", "Guest"))
      : (tk?.name || t("admin_dashboard.guest", "Guest"));

  const filtered = (tickets ?? []).filter((tk: any) => {
    if (statusFilter !== "all" && tk.status !== statusFilter) return false;
    if (priorityFilter !== "all" && tk.priority !== priorityFilter) return false;
    if (assigneeFilter === "me" && tk.assignedTo !== currentUser?.id) return false;
    if (assigneeFilter === "unassigned" && tk.assignedTo) return false;
    if (assigneeFilter !== "all" && assigneeFilter !== "me" && assigneeFilter !== "unassigned" && tk.assignedTo !== assigneeFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const creatorName = `${tk.creator?.firstName || ""} ${tk.creator?.lastName || ""} ${tk.creator?.email || tk.name || ""}`.toLowerCase();
    return (
      tk.subject?.toLowerCase().includes(q) ||
      tk.description?.toLowerCase().includes(q) ||
      tk.category?.toLowerCase().includes(q) ||
      creatorName.includes(q)
    );
  });

  const counts = (tickets ?? []).reduce((acc: Record<string, number>, tk: any) => {
    acc[tk.status] = (acc[tk.status] || 0) + 1;
    return acc;
  }, {});
  const myCount = (tickets ?? []).filter((tk: any) => tk.assignedTo === currentUser?.id && tk.status !== "closed").length;
  const unassignedCount = (tickets ?? []).filter((tk: any) => !tk.assignedTo && tk.status !== "closed").length;

  const sendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !reply.trim()) return;
    sendMessageMutation.mutate({ ticketId: selectedTicket.id, message: reply.trim(), isInternal: isInternalNote });
  };

  const applyAction = (patch: { status?: string; priority?: string; assignedTo?: string | null }) => {
    if (!selectedTicket) return;
    updateTicketMutation.mutate({ id: selectedTicket.id, ...patch });
    setSelectedTicket({ ...selectedTicket, ...patch });
  };

  return (
    <div className="space-y-4">
      {/* Toolbar header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t("admin_dashboard.support_inbox", "Support inbox")}</h2>
          <p className="text-sm text-muted-foreground">{t("admin_dashboard.support_inbox_sub", "Manage, assign, and reply to customer tickets.")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-8 px-2.5 text-xs gap-1.5">
            <UserCog className="h-3.5 w-3.5" />
            {t("admin_dashboard.assigned_to_me", "Assigned to me")}: <span className="font-semibold">{myCount}</span>
          </Badge>
          <Badge variant="outline" className="h-8 px-2.5 text-xs gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            {t("admin_dashboard.unassigned", "Unassigned")}: <span className="font-semibold">{unassignedCount}</span>
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-tickets"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            <span className="ml-2 hidden sm:inline">{t("common.refresh", "Refresh")}</span>
          </Button>
        </div>
      </div>

      {/* Stat cards (click to filter) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["open", "in_progress", "resolved", "closed"] as const).map((s) => {
          const Icon = STATUS_CFG[s].icon;
          const isActive = statusFilter === s;
          return (
            <Card
              key={s}
              className={`cursor-pointer hover-elevate transition-all ${isActive ? "ring-2 ring-primary border-primary" : ""}`}
              onClick={() => setStatusFilter(isActive ? "all" : s)}
              data-testid={`stat-${s}`}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${STATUS_CFG[s].cls}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground truncate">{STATUS_CFG[s].label}</p>
                  <p className="text-2xl font-bold leading-tight">{counts[s] || 0}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
        {/* Ticket list */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-3 space-y-3 bg-muted/30 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t("admin_dashboard.tickets", "Tickets")}</CardTitle>
              <Badge variant="secondary" className="rounded-full">{filtered.length}</Badge>
            </div>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder={t("admin_dashboard.search_tickets", "Search subject, user, email...")}
                className="pl-8 h-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-tickets"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("admin_dashboard.all_statuses", "All statuses")}</SelectItem>
                  {(["open", "in_progress", "resolved", "closed"] as const).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_CFG[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-filter-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("admin_dashboard.all_priorities", "All priorities")}</SelectItem>
                  <SelectItem value="low">{t("admin_dashboard.priority_low", "Low")}</SelectItem>
                  <SelectItem value="medium">{t("admin_dashboard.priority_medium", "Medium")}</SelectItem>
                  <SelectItem value="high">{t("admin_dashboard.priority_high", "High")}</SelectItem>
                  <SelectItem value="urgent">{t("admin_dashboard.priority_urgent", "Urgent")}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-filter-assignee">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("admin_dashboard.all_assignees", "All assignees")}</SelectItem>
                  <SelectItem value="me">{t("admin_dashboard.me", "Me")}</SelectItem>
                  <SelectItem value="unassigned">{t("admin_dashboard.unassigned", "Unassigned")}</SelectItem>
                  {adminUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[560px]">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground space-y-2">
                  <Inbox className="h-12 w-12 text-muted-foreground/30" />
                  <p className="text-sm">{t("admin_dashboard.no_tickets_match", "No tickets match the current filters.")}</p>
                </div>
              ) : (
                <div className="divide-y">
                  {filtered.map((ticket: any) => {
                    const cfg = STATUS_CFG[ticket.status] || STATUS_CFG.open;
                    const isActive = selectedTicket?.id === ticket.id;
                    const creator = ticketCreatorName(ticket);
                    const age = ticketAgeLabel(ticket.updatedAt || ticket.createdAt);
                    return (
                      <button
                        key={ticket.id}
                        onClick={() => setSelectedTicket(ticket)}
                        className={`w-full text-left p-3 transition-colors flex gap-3 items-start ${
                          isActive ? "bg-primary/10 border-l-4 border-l-primary" : "hover:bg-muted/60 border-l-4 border-l-transparent"
                        }`}
                        data-testid={`card-ticket-${ticket.id}`}
                      >
                        <TicketAvatar name={creator} seed={ticket.createdBy || ticket.id} size={36} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-sm truncate flex-1">{ticket.subject}</p>
                            <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${ageToneCls(age.tone)}`}>
                              <Timer className="h-2.5 w-2.5" />{age.label}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{creator}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{ticket.description}</p>
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <Badge variant="outline" className={`${cfg.cls} text-[10px] px-1.5 py-0 h-5 gap-1`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${cfg.pillCls}`} />
                              {cfg.label}
                            </Badge>
                            <Badge variant="outline" className={`${PRIORITY_CFG[ticket.priority] || ""} text-[10px] px-1.5 py-0 h-5`}>
                              {ticket.priority}
                            </Badge>
                            {ticket.category && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                                <Tag className="h-2.5 w-2.5 mr-0.5" />{ticket.category}
                              </Badge>
                            )}
                            {ticket.assignee ? (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 ml-auto bg-primary/5">
                                <UserCheck className="h-2.5 w-2.5 mr-0.5" />
                                {ticket.assignee.firstName}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 ml-auto bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300">
                                {t("admin_dashboard.unassigned", "Unassigned")}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Ticket detail */}
        <Card className="overflow-hidden">
          {!selectedTicket ? (
            <CardContent className="flex flex-col items-center justify-center min-h-[640px] text-center text-muted-foreground space-y-3">
              <MessageSquare className="h-14 w-14 text-muted-foreground/30" />
              <p className="text-sm">{t("admin_dashboard.select_ticket_details", "Select a ticket to view details and reply.")}</p>
            </CardContent>
          ) : (
            <>
              {(() => {
                const cfg = STATUS_CFG[selectedTicket.status] || STATUS_CFG.open;
                const creator = ticketCreatorName(selectedTicket);
                const age = ticketAgeLabel(selectedTicket.createdAt);
                return (
                  <CardHeader className="border-b space-y-3 bg-gradient-to-br from-muted/40 to-transparent">
                    <div className="flex items-start gap-3">
                      <TicketAvatar name={creator} seed={selectedTicket.createdBy || selectedTicket.id} size={44} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-lg">{selectedTicket.subject}</CardTitle>
                          <Badge variant="outline" className={`${cfg.cls} text-[10px] gap-1`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${cfg.pillCls}`} />
                            {cfg.label}
                          </Badge>
                          <Badge variant="outline" className={`${PRIORITY_CFG[selectedTicket.priority] || ""} text-[10px]`}>
                            {selectedTicket.priority}
                          </Badge>
                          {selectedTicket.category && (
                            <Badge variant="outline" className="text-[10px]">
                              <Tag className="h-2.5 w-2.5 mr-0.5" />{selectedTicket.category}
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="mt-1 flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-foreground/80">{creator}</span>
                          {selectedTicket.creator?.email && <span>· {selectedTicket.creator.email}</span>}
                          {selectedTicket.mobileNumber && <span>· {selectedTicket.mobileNumber}</span>}
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {new Date(selectedTicket.createdAt).toLocaleString()}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${ageToneCls(age.tone)}`}>
                            <Timer className="h-2.5 w-2.5" />{age.label} {t("admin_dashboard.old", "old")}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Hash className="h-2.5 w-2.5" />{(selectedTicket.id || "").slice(0, 8)}
                          </span>
                        </CardDescription>
                      </div>
                    </div>

                    {/* Action toolbar */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Quick actions */}
                      {selectedTicket.status !== "resolved" && selectedTicket.status !== "closed" && (
                        <Button size="sm" variant="outline" onClick={() => applyAction({ status: "resolved" })} data-testid="button-action-resolve">
                          <CheckCheck className="h-4 w-4 mr-1.5" />
                          {t("admin_dashboard.mark_resolved", "Resolve")}
                        </Button>
                      )}
                      {selectedTicket.status !== "closed" && (
                        <Button size="sm" variant="outline" onClick={() => applyAction({ status: "closed" })} data-testid="button-action-close">
                          <XCircle className="h-4 w-4 mr-1.5" />
                          {t("admin_dashboard.close_ticket", "Close")}
                        </Button>
                      )}
                      {(selectedTicket.status === "closed" || selectedTicket.status === "resolved") && (
                        <Button size="sm" variant="outline" onClick={() => applyAction({ status: "open" })} data-testid="button-action-reopen">
                          <RotateCcw className="h-4 w-4 mr-1.5" />
                          {t("admin_dashboard.reopen", "Reopen")}
                        </Button>
                      )}
                      {currentUser?.id && selectedTicket.assignedTo !== currentUser.id && (
                        <Button size="sm" variant="outline" onClick={() => applyAction({ assignedTo: currentUser.id })} data-testid="button-action-assign-me">
                          <UserPlus className="h-4 w-4 mr-1.5" />
                          {t("admin_dashboard.assign_to_me", "Assign to me")}
                        </Button>
                      )}

                      <div className="ml-auto flex items-center gap-2 flex-wrap">
                        <Select
                          value={selectedTicket.assignedTo ?? "__unassigned"}
                          onValueChange={(v) => applyAction({ assignedTo: v === "__unassigned" ? null : v })}
                        >
                          <SelectTrigger className="w-44 h-8 text-xs" data-testid="select-ticket-assignee">
                            <UserCog className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__unassigned">{t("admin_dashboard.unassigned", "Unassigned")}</SelectItem>
                            {adminUsers.map(u => (
                              <SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={selectedTicket.status} onValueChange={(status) => applyAction({ status })}>
                          <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-ticket-status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(["open", "in_progress", "resolved", "closed"] as const).map((s) => (
                              <SelectItem key={s} value={s}>{STATUS_CFG[s].label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={selectedTicket.priority} onValueChange={(priority) => applyAction({ priority })}>
                          <SelectTrigger className="w-28 h-8 text-xs" data-testid="select-ticket-priority">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">{t("admin_dashboard.priority_low", "Low")}</SelectItem>
                            <SelectItem value="medium">{t("admin_dashboard.priority_medium", "Medium")}</SelectItem>
                            <SelectItem value="high">{t("admin_dashboard.priority_high", "High")}</SelectItem>
                            <SelectItem value="urgent">{t("admin_dashboard.priority_urgent", "Urgent")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardHeader>
                );
              })()}

              <CardContent className="p-0">
                <div className="p-5 bg-muted/20 border-b">
                  <div className="flex items-center gap-2 mb-1.5">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("admin_dashboard.original_request", "Original request")}
                    </p>
                  </div>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{selectedTicket.description}</p>
                  {selectedTicket.location && (
                    <p className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {selectedTicket.location}
                    </p>
                  )}
                </div>

                <ScrollArea className="h-[330px] p-5">
                  <div className="space-y-4">
                    {(ticketMessages ?? []).length === 0 ? (
                      <div className="text-center py-10 text-muted-foreground space-y-1">
                        <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/30" />
                        <p className="text-sm">{t("admin_dashboard.no_messages", "No replies yet.")}</p>
                        <p className="text-xs">{t("admin_dashboard.start_conversation", "Send the first reply to start the conversation.")}</p>
                      </div>
                    ) : (
                      (ticketMessages ?? []).map((msg: any) => {
                        const isStaff = msg.sender?.role === "admin";
                        const senderName = msg.sender
                          ? `${msg.sender.firstName || ""} ${msg.sender.lastName || ""}`.trim() || msg.sender.email || t("admin_dashboard.staff", "Staff")
                          : t("admin_dashboard.user", "User");
                        if (msg.isInternal) {
                          return (
                            <div key={msg.id} className="flex gap-2.5" data-testid={`message-${msg.id}`}>
                              <TicketAvatar name={senderName} seed={msg.senderId || msg.id} size={28} />
                              <div className="flex-1 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300">
                                    <Lock className="h-2.5 w-2.5 mr-1" />
                                    {t("admin_dashboard.internal_note", "Internal note")}
                                  </Badge>
                                  <span className="text-xs font-semibold">{senderName}</span>
                                  <span className="text-[10px] text-muted-foreground ml-auto">{new Date(msg.createdAt).toLocaleString()}</span>
                                </div>
                                <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={msg.id} className={`flex gap-2.5 ${isStaff ? "flex-row-reverse" : ""}`} data-testid={`message-${msg.id}`}>
                            <TicketAvatar name={senderName} seed={msg.senderId || msg.id} size={32} />
                            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                              isStaff ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm"
                            }`}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold">
                                  {senderName}{isStaff ? ` · ${t("admin_dashboard.staff", "Staff")}` : ""}
                                </span>
                                <span className={`text-[10px] ${isStaff ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                                  {new Date(msg.createdAt).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>

                {selectedTicket.status === "closed" ? (
                  <div className="border-t p-4 flex items-center justify-between gap-3 bg-muted/20">
                    <p className="text-sm text-muted-foreground">
                      {t("admin_dashboard.ticket_closed_notice", "This ticket is closed. Reopen it to continue the conversation.")}
                    </p>
                    <Button size="sm" variant="outline" onClick={() => applyAction({ status: "open" })} data-testid="button-reopen-from-footer">
                      <RotateCcw className="h-4 w-4 mr-1.5" />
                      {t("admin_dashboard.reopen", "Reopen")}
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={sendReply} className="border-t p-4 space-y-2 bg-background">
                    <Textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder={
                        isInternalNote
                          ? t("admin_dashboard.internal_placeholder", "Add an internal note (only staff can see this)...")
                          : t("admin_dashboard.reply_placeholder", "Reply to the user...")
                      }
                      rows={3}
                      className={`resize-none ${isInternalNote ? "border-amber-300 dark:border-amber-700 focus-visible:ring-amber-500/40" : ""}`}
                      data-testid="textarea-ticket-reply"
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") sendReply(e as any);
                      }}
                    />
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={isInternalNote}
                          onCheckedChange={(v) => setIsInternalNote(!!v)}
                          data-testid="checkbox-internal-note"
                        />
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                        {t("admin_dashboard.mark_internal", "Internal note (hidden from user)")}
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="hidden md:inline text-[11px] text-muted-foreground">
                          {t("admin_dashboard.send_hint", "⌘/Ctrl + Enter to send")}
                        </span>
                        <Button type="submit" disabled={!reply.trim() || sendMessageMutation.isPending} data-testid="button-send-reply">
                          {sendMessageMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Send className="h-4 w-4 mr-2" />
                              {isInternalNote
                                ? t("admin_dashboard.add_note", "Add note")
                                : t("admin_dashboard.send_reply", "Send reply")}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </form>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function PromoCodeManagement({ providers }: { providers: ProviderWithUser[] }) {
  const { format: fmtMoney } = useCurrency();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "expired" | "scheduled">("all");

  const { data: promoCodes, refetch, isLoading } = useQuery<PromoCode[]>({
    queryKey: ["/api/admin/promo-codes"],
  });

  type FormShape = {
    code: string;
    description: string;
    discountType: "percentage" | "fixed";
    discountValue: number;
    maxUses: string;
    validFrom: string;
    validUntil: string;
    minAmount: string;
    isActive: boolean;
    applicableProviders: string[];
  };

  const todayStr = () => new Date().toISOString().split("T")[0];
  const thirtyDaysOut = () =>
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const promoForm = useForm<FormShape>({
    defaultValues: {
      code: "",
      description: "",
      discountType: "percentage",
      discountValue: 10,
      maxUses: "",
      validFrom: todayStr(),
      validUntil: thirtyDaysOut(),
      minAmount: "",
      isActive: true,
      applicableProviders: [],
    },
  });

  const watchDiscountType = promoForm.watch("discountType");
  const watchDiscountValue = promoForm.watch("discountValue");
  const watchMinAmount = promoForm.watch("minAmount");

  const openCreate = () => {
    setEditing(null);
    promoForm.reset({
      code: "",
      description: "",
      discountType: "percentage",
      discountValue: 10,
      maxUses: "",
      validFrom: todayStr(),
      validUntil: thirtyDaysOut(),
      minAmount: "",
      isActive: true,
      applicableProviders: [],
    });
    setDialogOpen(true);
  };

  const openEdit = (promo: PromoCode) => {
    setEditing(promo);
    promoForm.reset({
      code: promo.code,
      description: promo.description || "",
      discountType: promo.discountType as "percentage" | "fixed",
      discountValue: Number(promo.discountValue),
      maxUses: promo.maxUses != null ? String(promo.maxUses) : "",
      validFrom: new Date(promo.validFrom).toISOString().split("T")[0],
      validUntil: new Date(promo.validUntil).toISOString().split("T")[0],
      minAmount: promo.minAmount != null ? String(promo.minAmount) : "",
      isActive: promo.isActive ?? true,
      applicableProviders: promo.applicableProviders || [],
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (data: FormShape) => {
      const payload: any = {
        code: data.code.trim().toUpperCase(),
        description: data.description?.trim() || null,
        discountType: data.discountType,
        discountValue: Number(data.discountValue),
        maxUses: data.maxUses ? parseInt(data.maxUses, 10) : null,
        validFrom: data.validFrom,
        validUntil: data.validUntil,
        minAmount: data.minAmount ? parseFloat(data.minAmount) : null,
        isActive: data.isActive,
        applicableProviders: data.applicableProviders.length > 0 ? data.applicableProviders : null,
      };
      const response = await apiRequest(
        editing ? "PATCH" : "POST",
        editing ? `/api/admin/promo-codes/${editing.id}` : "/api/admin/promo-codes",
        payload,
      );
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Save failed");
      return resData;
    },
    onSuccess: () => {
      toast({
        title: editing
          ? t("admin_dashboard.promo_updated", "Promo code updated")
          : t("admin_dashboard.promo_created", "Promo code created"),
      });
      setDialogOpen(false);
      setEditing(null);
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: t("admin_dashboard.error", "Error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/admin/promo-codes/${id}`, { isActive });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Update failed");
      return resData;
    },
    onSuccess: () => refetch(),
    onError: (err: Error) => {
      toast({ title: t("admin_dashboard.error", "Error"), description: err.message, variant: "destructive" });
    },
  });

  const deletePromoMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/promo-codes/${id}`);
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || "Delete failed");
      return resData;
    },
    onSuccess: () => {
      toast({ title: t("admin_dashboard.promo_deleted", "Promo code deleted") });
      setConfirmDeleteId(null);
      refetch();
    },
    onError: (err: Error) => {
      toast({ title: t("admin_dashboard.error", "Error"), description: err.message, variant: "destructive" });
    },
  });

  const copyCode = (code: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        toast({ title: t("admin_dashboard.promo_copied", "Code copied"), description: code });
      });
    }
  };

  const promoStatus = (p: PromoCode): "active" | "inactive" | "expired" | "scheduled" | "exhausted" => {
    const now = Date.now();
    if (!p.isActive) return "inactive";
    if (now < new Date(p.validFrom).getTime()) return "scheduled";
    if (now > new Date(p.validUntil).getTime()) return "expired";
    if (p.maxUses != null && (p.usedCount ?? 0) >= p.maxUses) return "exhausted";
    return "active";
  };

  const filtered = useMemo(() => {
    if (!promoCodes) return [];
    const q = search.trim().toLowerCase();
    return promoCodes.filter((p) => {
      const status = promoStatus(p);
      if (statusFilter === "active" && status !== "active") return false;
      if (statusFilter === "inactive" && status !== "inactive") return false;
      if (statusFilter === "expired" && status !== "expired" && status !== "exhausted") return false;
      if (statusFilter === "scheduled" && status !== "scheduled") return false;
      if (q && !p.code.toLowerCase().includes(q) && !(p.description || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [promoCodes, search, statusFilter]);

  const stats = useMemo(() => {
    if (!promoCodes) return { total: 0, active: 0, redemptions: 0 };
    let active = 0;
    let redemptions = 0;
    for (const p of promoCodes) {
      if (promoStatus(p) === "active") active++;
      redemptions += p.usedCount || 0;
    }
    return { total: promoCodes.length, active, redemptions };
  }, [promoCodes]);

  const previewSavings = (() => {
    const sample = 100;
    if (!watchDiscountValue || isNaN(Number(watchDiscountValue))) return null;
    const v = Number(watchDiscountValue);
    if (watchDiscountType === "percentage") return (sample * v) / 100;
    return v;
  })();

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      active: { label: t("admin_dashboard.promo_status_active", "Active"), className: "bg-green-600 hover:bg-green-600" },
      inactive: { label: t("admin_dashboard.promo_status_inactive", "Inactive"), className: "bg-muted text-foreground hover:bg-muted" },
      expired: { label: t("admin_dashboard.promo_status_expired", "Expired"), className: "bg-destructive hover:bg-destructive" },
      scheduled: { label: t("admin_dashboard.promo_status_scheduled", "Scheduled"), className: "bg-amber-500 hover:bg-amber-500" },
      exhausted: { label: t("admin_dashboard.promo_status_exhausted", "Limit reached"), className: "bg-amber-600 hover:bg-amber-600" },
    };
    const m = map[status] || map.inactive;
    return <Badge className={m.className}>{m.label}</Badge>;
  };

  const formatDateRange = (from: string | Date, until: string | Date) => {
    const f = new Date(from);
    const u = new Date(until);
    return `${f.toLocaleDateString()} → ${u.toLocaleDateString()}`;
  };

  return (
    <div className="space-y-5">
      {/* Header + stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Tag className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums" data-testid="stat-promo-total">{stats.total}</p>
                <p className="text-xs text-muted-foreground">{t("admin_dashboard.promo_stat_total", "Total promo codes")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-950 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums" data-testid="stat-promo-active">{stats.active}</p>
                <p className="text-xs text-muted-foreground">{t("admin_dashboard.promo_stat_active", "Currently active")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums" data-testid="stat-promo-redemptions">{stats.redemptions}</p>
                <p className="text-xs text-muted-foreground">{t("admin_dashboard.promo_stat_redemptions", "Total redemptions")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("admin_dashboard.promo_search_placeholder", "Search by code or description…")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-promo-search"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-full md:w-[180px]" data-testid="select-promo-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin_dashboard.promo_filter_all", "All statuses")}</SelectItem>
                <SelectItem value="active">{t("admin_dashboard.promo_status_active", "Active")}</SelectItem>
                <SelectItem value="scheduled">{t("admin_dashboard.promo_status_scheduled", "Scheduled")}</SelectItem>
                <SelectItem value="inactive">{t("admin_dashboard.promo_status_inactive", "Inactive")}</SelectItem>
                <SelectItem value="expired">{t("admin_dashboard.promo_filter_expired", "Expired or limit reached")}</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={openCreate} data-testid="button-create-promo">
              <Plus className="h-4 w-4 mr-1" />
              {t("admin_dashboard.create_promo_btn", "Create promo code")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("admin_dashboard.loading", "Loading…")}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Tag className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground mb-4">
              {promoCodes && promoCodes.length === 0
                ? t("admin_dashboard.promo_empty", "No promo codes yet. Create your first one to start running campaigns.")
                : t("admin_dashboard.promo_no_match", "No promo codes match your filters.")}
            </p>
            {promoCodes && promoCodes.length === 0 && (
              <Button onClick={openCreate} data-testid="button-create-first-promo">
                <Plus className="h-4 w-4 mr-1" />
                {t("admin_dashboard.create_first_promo", "Create your first promo code")}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((promo) => {
            const status = promoStatus(promo);
            const usagePct =
              promo.maxUses && promo.maxUses > 0
                ? Math.min(100, Math.round(((promo.usedCount ?? 0) / promo.maxUses) * 100))
                : null;
            const discountLabel =
              promo.discountType === "percentage"
                ? `${Number(promo.discountValue)}% off`
                : `${fmtMoney(promo.discountValue)} off`;
            return (
              <div
                key={promo.id}
                className="rounded-xl border bg-card p-4 hover-elevate transition-all"
                data-testid={`row-promo-${promo.id}`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="font-mono text-base font-bold tracking-wider px-2 py-0.5 rounded bg-muted">
                        {promo.code}
                      </code>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => copyCode(promo.code)}
                        aria-label={t("admin_dashboard.copy", "Copy")}
                        data-testid={`button-copy-promo-${promo.id}`}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      {statusBadge(status)}
                    </div>
                    {promo.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {promo.description}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary leading-none">
                      {promo.discountType === "percentage"
                        ? `${Number(promo.discountValue)}%`
                        : fmtMoney(promo.discountValue)}
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                      {promo.discountType === "percentage"
                        ? t("admin_dashboard.promo_type_percentage", "Percentage")
                        : t("admin_dashboard.promo_type_fixed", "Fixed")}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-3">
                  <div className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {formatDateRange(promo.validFrom, promo.validUntil)}
                  </div>
                  {promo.minAmount && (
                    <div className="flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      {t("admin_dashboard.promo_min", "Min")} {fmtMoney(promo.minAmount)}
                    </div>
                  )}
                  {promo.applicableProviders && promo.applicableProviders.length > 0 && (
                    <div className="flex items-center gap-1">
                      <Briefcase className="h-3 w-3" />
                      {promo.applicableProviders.length} {t("admin_dashboard.promo_providers", "providers")}
                    </div>
                  )}
                </div>

                {usagePct != null ? (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-muted-foreground">
                        {t("admin_dashboard.promo_usage", "Usage")}
                      </span>
                      <span className="font-medium tabular-nums">
                        {promo.usedCount ?? 0} / {promo.maxUses}
                      </span>
                    </div>
                    <Progress value={usagePct} className="h-1.5" />
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground mb-3">
                    {promo.usedCount ?? 0} {t("admin_dashboard.promo_redemptions_short", "redemptions")} · {t("admin_dashboard.promo_unlimited", "unlimited uses")}
                  </p>
                )}

                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!!promo.isActive}
                      onCheckedChange={(checked) =>
                        toggleActiveMutation.mutate({ id: promo.id, isActive: checked })
                      }
                      disabled={toggleActiveMutation.isPending}
                      data-testid={`switch-promo-active-${promo.id}`}
                      aria-label={t("admin_dashboard.promo_toggle_active", "Toggle active")}
                    />
                    <span className="text-xs text-muted-foreground">
                      {promo.isActive
                        ? t("admin_dashboard.promo_status_active", "Active")
                        : t("admin_dashboard.promo_status_inactive", "Inactive")}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(promo)}
                      data-testid={`button-edit-promo-${promo.id}`}
                    >
                      <Edit className="h-3.5 w-3.5 mr-1" />
                      {t("admin_dashboard.edit", "Edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setConfirmDeleteId(promo.id)}
                      data-testid={`button-delete-promo-${promo.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) {
            setDialogOpen(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t("admin_dashboard.edit_promo_title", "Edit promo code")
                : t("admin_dashboard.create_promo_title", "Create promo code")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "admin_dashboard.promo_dialog_desc",
                "Configure a discount, validity window, and any usage limits.",
              )}
            </DialogDescription>
          </DialogHeader>

          <Form {...promoForm}>
            <form
              onSubmit={promoForm.handleSubmit((data) => saveMutation.mutate(data))}
              className="space-y-5"
            >
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("admin_dashboard.promo_section_identity", "Identity")}
                </h4>
                <FormField
                  control={promoForm.control}
                  name="code"
                  rules={{
                    required: t("admin_dashboard.promo_code_required", "Code is required") as string,
                    minLength: { value: 2, message: t("admin_dashboard.promo_code_too_short", "Code must be at least 2 characters") as string },
                  }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin_dashboard.promo_code_label", "Promo code")}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="SUMMER2026"
                          className="font-mono uppercase tracking-wider"
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                          data-testid="input-promo-code"
                        />
                      </FormControl>
                      <FormDescription>
                        {t("admin_dashboard.promo_code_uppercase_hint", "Codes are stored uppercase. Patients enter this exact code at checkout.")}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={promoForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin_dashboard.promo_description_label", "Description (internal)")}</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={2} placeholder={t("admin_dashboard.promo_description_placeholder", "e.g., Summer launch promotion for new users") as string} data-testid="input-promo-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("admin_dashboard.promo_section_discount", "Discount")}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField
                    control={promoForm.control}
                    name="discountType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("admin_dashboard.discount_type_label", "Type")}</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-promo-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="percentage">
                              {t("admin_dashboard.promo_type_percentage", "Percentage")} (%)
                            </SelectItem>
                            <SelectItem value="fixed">
                              {t("admin_dashboard.promo_type_fixed", "Fixed amount")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={promoForm.control}
                    name="discountValue"
                    rules={{
                      required: t("admin_dashboard.promo_value_required", "Discount value is required") as string,
                      min: { value: 0.01, message: t("admin_dashboard.promo_value_positive", "Must be greater than 0") as string },
                      validate: (v) => {
                        if (watchDiscountType === "percentage" && Number(v) > 100) {
                          return t("admin_dashboard.promo_value_max_100", "Percentage cannot exceed 100") as string;
                        }
                        return true;
                      },
                    }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {watchDiscountType === "percentage"
                            ? t("admin_dashboard.discount_value_pct_label", "Discount (%)")
                            : t("admin_dashboard.discount_value_amount_label", "Discount amount")}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            data-testid="input-promo-value"
                          />
                        </FormControl>
                        <FormDescription>
                          {watchDiscountType === "percentage"
                            ? t("admin_dashboard.discount_value_pct_hint", "Percentage off the appointment subtotal")
                            : t("admin_dashboard.discount_value_dollar_hint", "Flat amount deducted")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {previewSavings != null && previewSavings > 0 && (
                  <div className="rounded-lg border bg-primary/5 px-3 py-2 text-xs text-foreground/80 flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span>
                      {t("admin_dashboard.promo_preview", "On a {{base}} order, a customer saves {{savings}}.", {
                        base: fmtMoney(100),
                        savings: fmtMoney(previewSavings),
                      })}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("admin_dashboard.promo_section_validity", "Validity")}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField
                    control={promoForm.control}
                    name="validFrom"
                    rules={{ required: t("admin_dashboard.promo_valid_from_required", "Start date is required") as string }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("admin_dashboard.valid_from_label", "Valid from")}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-promo-valid-from" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={promoForm.control}
                    name="validUntil"
                    rules={{
                      required: t("admin_dashboard.promo_valid_until_required", "End date is required") as string,
                      validate: (v) => {
                        const from = promoForm.getValues("validFrom");
                        if (from && v && new Date(v) < new Date(from)) {
                          return t("admin_dashboard.promo_valid_until_after", "End date must be on or after the start date") as string;
                        }
                        return true;
                      },
                    }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("admin_dashboard.valid_until_label", "Valid until")}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-promo-valid-until" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("admin_dashboard.promo_section_limits", "Limits & scope")}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField
                    control={promoForm.control}
                    name="maxUses"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("admin_dashboard.max_uses_label", "Max total uses")}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="1"
                            placeholder={t("admin_dashboard.max_uses_unlimited", "Unlimited") as string}
                            {...field}
                            data-testid="input-promo-max-uses"
                          />
                        </FormControl>
                        <FormDescription>
                          {t("admin_dashboard.max_uses_hint", "Leave empty for unlimited.")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={promoForm.control}
                    name="minAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("admin_dashboard.min_amount_label", "Minimum order")}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder={t("admin_dashboard.min_amount_none", "No minimum") as string}
                            {...field}
                            data-testid="input-promo-min-amount"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {providers && providers.length > 0 && (
                  <FormField
                    control={promoForm.control}
                    name="applicableProviders"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("admin_dashboard.promo_providers_label", "Limit to specific providers")}</FormLabel>
                        <FormDescription>
                          {t("admin_dashboard.promo_providers_hint", "Leave empty to apply to all providers.")}
                        </FormDescription>
                        <div className="rounded-md border max-h-44 overflow-y-auto p-2 space-y-1">
                          {providers.map((p) => {
                            const checked = field.value?.includes(p.id);
                            return (
                              <label
                                key={p.id}
                                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer text-sm"
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={!!checked}
                                  onChange={(e) => {
                                    const next = new Set(field.value || []);
                                    if (e.target.checked) next.add(p.id);
                                    else next.delete(p.id);
                                    field.onChange(Array.from(next));
                                  }}
                                  data-testid={`checkbox-provider-${p.id}`}
                                />
                                <span className="truncate">
                                  {p.user?.firstName} {p.user?.lastName}
                                  {p.specialization && (
                                    <span className="text-muted-foreground"> · {p.specialization}</span>
                                  )}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={promoForm.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <FormLabel className="text-sm">
                          {t("admin_dashboard.promo_active_label", "Active")}
                        </FormLabel>
                        <FormDescription className="text-xs">
                          {t("admin_dashboard.promo_active_hint", "Inactive codes can't be used at checkout, even within their date window.")}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={!!field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-promo-active"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setDialogOpen(false);
                    setEditing(null);
                  }}
                  data-testid="button-cancel-promo"
                >
                  {t("admin_dashboard.cancel", "Cancel")}
                </Button>
                <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-promo">
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : (
                    <Plus className="h-4 w-4 mr-1.5" />
                  )}
                  {saveMutation.isPending
                    ? t("admin_dashboard.saving", "Saving…")
                    : editing
                      ? t("admin_dashboard.update_promo", "Update promo code")
                      : t("admin_dashboard.create_promo", "Create promo code")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmDeleteId}
        onOpenChange={(o) => !o && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("admin_dashboard.promo_confirm_delete_title", "Delete this promo code?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "admin_dashboard.promo_confirm_delete_desc",
                "Existing appointments that already used this code aren't affected, but the code can no longer be redeemed.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-promo">
              {t("admin_dashboard.cancel", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeleteId && deletePromoMutation.mutate(confirmDeleteId)}
              data-testid="button-confirm-delete-promo"
            >
              {t("admin_dashboard.delete", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Users Management Component
function UsersManagement() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const { user: adminCurrentUser } = useAuth();
  const isGlobalAdminUI = adminCurrentUser?.role === "global_admin";
  // Country migration dialog state — global admin only.
  const [migrateUser, setMigrateUser] = useState<User | null>(null);
  const [migrateTarget, setMigrateTarget] = useState<string>("HU");
  const [migrateReason, setMigrateReason] = useState<string>("");

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const createAdminMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/admins", {
        firstName: adminFirstName,
        lastName: adminLastName,
        email: adminEmail,
        phone: adminPhone || undefined,
        password: adminPassword,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || "Failed to create admin");
      }
      return data;
    },
    onSuccess: () => {
      toast({
        title: t("admin.admin_created", "Admin created"),
        description: t("admin.admin_created_desc", "The new admin can now log in with their email and password."),
      });
      setAddAdminOpen(false);
      setAdminFirstName("");
      setAdminLastName("");
      setAdminEmail("");
      setAdminPhone("");
      setAdminPassword("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const handleCreateAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminFirstName.trim() || !adminLastName.trim() || !adminEmail.trim() || adminPassword.length < 8) {
      toast({
        title: t("common.error"),
        description: t("admin.add_admin_validation", "Please provide a name, email and a password of at least 8 characters."),
        variant: "destructive",
      });
      return;
    }
    createAdminMutation.mutate();
  };

  const invalidateUserCaches = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/bookings"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/wallets"] });
  };

  const suspendMutation = useMutation({
    mutationFn: async ({ id, isSuspended, reason }: { id: string; isSuspended: boolean; reason?: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${id}/suspend`, {
        isSuspended,
        suspensionReason: reason
      });
      if (!response.ok) throw new Error("Failed to update user status");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: t("admin.user_updated") });
      invalidateUserCaches();
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/users/${id}`);
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/admin/users"] });
      const previous = queryClient.getQueryData<User[]>(["/api/admin/users"]);
      queryClient.setQueryData<User[]>(["/api/admin/users"], (old) =>
        (old || []).filter((u) => u.id !== id),
      );
      return { previous };
    },
    onSuccess: () => {
      toast({ title: t("admin.user_deleted") });
      invalidateUserCaches();
    },
    onError: (error: Error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/admin/users"], context.previous);
      }
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  // Tenancy migration — global admin only. Posts to /api/admin/users/:id/migrate-country.
  const migrateCountryMutation = useMutation({
    mutationFn: async (vars: { id: string; targetCountryCode: string; reason: string }) => {
      const response = await apiRequest("POST", `/api/admin/users/${vars.id}/migrate-country`, {
        targetCountryCode: vars.targetCountryCode,
        reason: vars.reason,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((data as any)?.message || "Failed to migrate user");
      }
      return data;
    },
    onSuccess: (data: any) => {
      const counts = data?.counts || {};
      const summary = Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(", ");
      toast({
        title: t("admin.user_country_migrated", "User country migrated"),
        description: `${data?.fromCountry} → ${data?.toCountry} (${summary})`,
      });
      setMigrateUser(null);
      setMigrateReason("");
      invalidateUserCaches();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/country-migrations"] });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const filteredUsers = users?.filter((u: User) => {
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    const fullName = `${u.firstName} ${u.lastName}`.toLowerCase();
    const email = u.email.toLowerCase();
    const search = searchQuery.toLowerCase();
    const matchesSearch = fullName.includes(search) || email.includes(search);
    return matchesRole && matchesSearch;
  }) || [];

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <>
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("common.search")}
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-user-search"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-40" data-testid="select-user-role-filter">
            <SelectValue placeholder={t("admin.filter_by_status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.all_bookings")}</SelectItem>
            <SelectItem value="patient">{t("common.patient_looking")}</SelectItem>
            <SelectItem value="provider">{t("common.healthcare_provider")}</SelectItem>
            <SelectItem value="admin">{t("admin.role_admin")}</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {t("admin.showing_bookings", { count: filteredUsers.length })}
        </span>
        <Button
          onClick={() => setAddAdminOpen(true)}
          className="ml-auto"
          data-testid="button-open-add-admin"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t("admin.add_admin", "Add Admin")}
        </Button>
      </div>

      <Dialog open={addAdminOpen} onOpenChange={setAddAdminOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-add-admin">
          <DialogHeader>
            <DialogTitle>{t("admin.add_admin_title", "Add a new platform admin")}</DialogTitle>
            <DialogDescription>
              {t(
                "admin.add_admin_desc",
                "The new admin will receive full admin access and can sign in from the regular login page using the credentials below.",
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateAdmin} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="admin-first-name">{t("admin.first_name", "First name")}</Label>
                <Input
                  id="admin-first-name"
                  value={adminFirstName}
                  onChange={(e) => setAdminFirstName(e.target.value)}
                  data-testid="input-admin-first-name"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-last-name">{t("admin.last_name", "Last name")}</Label>
                <Input
                  id="admin-last-name"
                  value={adminLastName}
                  onChange={(e) => setAdminLastName(e.target.value)}
                  data-testid="input-admin-last-name"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-email">{t("admin.email", "Email")}</Label>
              <Input
                id="admin-email"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                data-testid="input-admin-email"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-phone">
                {t("admin.phone_optional", "Phone (optional)")}
              </Label>
              <Input
                id="admin-phone"
                value={adminPhone}
                onChange={(e) => setAdminPhone(e.target.value)}
                data-testid="input-admin-phone"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-password">{t("admin.password", "Password")}</Label>
              <Input
                id="admin-password"
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                data-testid="input-admin-password"
                placeholder={t("admin.password_min", "At least 8 characters")}
                required
                minLength={8}
              />
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddAdminOpen(false)}
                data-testid="button-cancel-add-admin"
              >
                {t("common.cancel", "Cancel")}
              </Button>
              <Button
                type="submit"
                disabled={createAdminMutation.isPending}
                data-testid="button-submit-add-admin"
              >
                {createAdminMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                {t("admin.create_admin", "Create admin")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.users")}</CardTitle>
          <CardDescription>{t("admin.bookings_management")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {filteredUsers.map((user) => (
              <div key={user.id} className="py-4 flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{user.firstName} {user.lastName}</span>
                    {user.isSuspended ? (
                      <Badge variant="destructive">{t("admin.suspended", "Suspended")}</Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200">
                        {t("admin.active", "Active")}
                      </Badge>
                    )}
                    <Badge variant="outline">{user.role}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setSelectedUser(user)}
                    data-testid={`button-view-user-${user.id}`}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    {t("admin.view")}
                  </Button>
                  {user.isSuspended ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => suspendMutation.mutate({ id: user.id, isSuspended: false })}
                      data-testid={`button-activate-user-${user.id}`}
                    >
                      {t("admin.activate", "Activate")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        const reason = window.prompt(t("admin.suspend_reason_prompt", "Reason for suspension (optional):"));
                        if (reason !== null) {
                          suspendMutation.mutate({ id: user.id, isSuspended: true, reason });
                        }
                      }}
                      data-testid={`button-suspend-user-${user.id}`}
                    >
                      {t("admin.suspend", "Suspend")}
                    </Button>
                  )}
                  {isGlobalAdminUI && !isAdminRole(user.role) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setMigrateUser(user);
                        setMigrateTarget((user as any).countryCode === "HU" ? "IR" : "HU");
                        setMigrateReason("");
                      }}
                      data-testid={`button-migrate-country-${user.id}`}
                      title={t("admin.migrate_country", "Migrate country")}
                    >
                      <Globe className="h-4 w-4 mr-2" />
                      <span className="text-xs uppercase">{(user as any).countryCode || "—"}</span>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => {
                      if (confirm(t("admin.delete"))) {
                        deleteUserMutation.mutate(user.id);
                      }
                    }}
                    data-testid={`button-delete-user-${user.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("admin.provider_details")}</DialogTitle>
            <DialogDescription>{t("admin.full_profile_info", { name: `${selectedUser?.firstName} ${selectedUser?.lastName}` })}</DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{t("admin.name")}</p>
                <p>{selectedUser.firstName} {selectedUser.lastName}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{t("common.email")}</p>
                <p>{selectedUser.email}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{t("common.phone")}</p>
                <p>{selectedUser.phone || 'Not provided'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{t("admin.type")}</p>
                <p className="capitalize">{selectedUser.role}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{t("setup.city")}</p>
                <p>{selectedUser.city || 'Not provided'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{t("admin.joined_on")}</p>
                <p>{selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleDateString() : 'N/A'}</p>
              </div>
              <div className="col-span-2 space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{t("booking.address")}</p>
                <p>{selectedUser.address || 'Not provided'}</p>
              </div>
              {selectedUser.isSuspended && (
                <div className="col-span-2 p-3 bg-destructive/10 rounded-md border border-destructive/20 mt-2">
                  <p className="text-sm font-semibold text-destructive">{t("admin.cancelled")}</p>
                  <p className="text-sm text-destructive/80 mt-1">{t("admin.bio")}: {selectedUser.suspensionReason || 'No reason provided'}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Country migration dialog — global admin only. */}
      <Dialog
        open={!!migrateUser}
        onOpenChange={(open) => {
          if (!open) {
            setMigrateUser(null);
            setMigrateReason("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.migrate_country_title", "Migrate user to another country")}</DialogTitle>
            <DialogDescription>
              {t(
                "admin.migrate_country_desc",
                "This rewrites the country tag on the user and every booking, invoice, payment, and provider profile attached to them. The action is logged in the audit trail and cannot be undone in bulk.",
              )}
            </DialogDescription>
          </DialogHeader>
          {migrateUser && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border p-3 bg-muted/30 text-sm">
                <div><span className="text-muted-foreground">{t("admin.name")}:</span> <span className="font-medium">{migrateUser.firstName} {migrateUser.lastName}</span></div>
                <div><span className="text-muted-foreground">{t("common.email")}:</span> {migrateUser.email}</div>
                <div><span className="text-muted-foreground">{t("admin.migrate_current_country", "Current country")}:</span> <span className="font-mono">{(migrateUser as any).countryCode || "—"}</span></div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="migrate-target">{t("admin.migrate_target_country", "Target country")}</Label>
                <Select value={migrateTarget} onValueChange={setMigrateTarget}>
                  <SelectTrigger id="migrate-target" data-testid="select-migrate-target">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HU">HU — Hungary</SelectItem>
                    <SelectItem value="IR">IR — Iran</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="migrate-reason">{t("admin.migrate_reason", "Reason (required, min 5 chars)")}</Label>
                <Textarea
                  id="migrate-reason"
                  value={migrateReason}
                  onChange={(e) => setMigrateReason(e.target.value)}
                  rows={3}
                  placeholder={t("admin.migrate_reason_placeholder", "e.g. patient relocated; verified via support ticket #1234")}
                  data-testid="input-migrate-reason"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMigrateUser(null); setMigrateReason(""); }} data-testid="button-migrate-cancel">
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              onClick={() => {
                if (!migrateUser) return;
                migrateCountryMutation.mutate({
                  id: migrateUser.id,
                  targetCountryCode: migrateTarget,
                  reason: migrateReason.trim(),
                });
              }}
              disabled={
                !migrateUser ||
                migrateReason.trim().length < 5 ||
                migrateTarget === ((migrateUser as any)?.countryCode) ||
                migrateCountryMutation.isPending
              }
              data-testid="button-migrate-confirm"
            >
              {migrateCountryMutation.isPending
                ? t("common.processing", "Processing...")
                : t("admin.migrate_confirm", "Migrate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StripeSettingsPanel() {
  const { t } = useTranslation();
  const { data: status, isLoading } = useQuery<{
    configured: boolean;
    mode: "live" | "test" | "unknown";
    webhookSecretConfigured: boolean;
    publishableKeyConfigured: boolean;
  }>({
    queryKey: ["/api/admin/stripe/status"],
  });

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">{t("admin_dashboard.loading_payment_status")}</div>
    );
  }

  const StatusRow = ({
    label,
    ok,
    detail,
  }: {
    label: string;
    ok: boolean;
    detail?: string;
  }) => (
    <div className="flex items-center justify-between rounded-md border p-3">
      <div>
        <div className="font-medium text-sm">{label}</div>
        {detail && (
          <div className="text-xs text-muted-foreground mt-0.5">{detail}</div>
        )}
      </div>
      {ok ? (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          <CheckCircle className="h-3 w-3 mr-1" /> {t("admin_dashboard.configured")}
        </Badge>
      ) : (
        <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">
          <XCircle className="h-3 w-3 mr-1" /> {t("admin_dashboard.not_set")}
        </Badge>
      )}
    </div>
  );

  return (
    <div className="space-y-4" data-testid="stripe-settings-panel">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">{t("admin_dashboard.stripe_payments")}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("admin_dashboard.stripe_intro")}
          </p>
        </div>
        {status?.configured ? (
          <Badge
            className={
              status.mode === "live"
                ? "bg-green-600 text-white hover:bg-green-600"
                : "bg-blue-100 text-blue-800 hover:bg-blue-100"
            }
            data-testid="badge-stripe-mode"
          >
            {status.mode === "live"
              ? t("admin_dashboard.live_mode")
              : status.mode === "test"
              ? t("admin_dashboard.test_mode")
              : t("admin_dashboard.active_mode")}
          </Badge>
        ) : (
          <Badge variant="destructive" data-testid="badge-stripe-disabled">
            {t("admin_dashboard.disabled_mode")}
          </Badge>
        )}
      </div>

      <div className="grid gap-2">
        <StatusRow
          label={t("admin_dashboard.stripe_secret_key")}
          ok={!!status?.configured}
          detail={t("admin_dashboard.stripe_secret_detail")}
        />
        <StatusRow
          label={t("admin_dashboard.stripe_publishable_key")}
          ok={!!status?.publishableKeyConfigured}
          detail={t("admin_dashboard.stripe_publishable_detail")}
        />
        <StatusRow
          label={t("admin_dashboard.webhook_signing_secret")}
          ok={!!status?.webhookSecretConfigured}
          detail={t("admin_dashboard.webhook_secret_detail")}
        />
      </div>

      <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-2">
        <div className="font-medium">{t("admin_dashboard.setup_steps")}</div>
        <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
          <li>
            Add <code>STRIPE_SECRET_KEY</code>, <code>VITE_STRIPE_PUBLISHABLE_KEY</code>, and <code>STRIPE_WEBHOOK_SECRET</code> to your environment secrets.
          </li>
          <li>
            In your Stripe dashboard, point a webhook endpoint at:{" "}
            <code className="break-all">
              {typeof window !== "undefined"
                ? `${window.location.origin}/api/stripe/webhook`
                : "/api/stripe/webhook"}
            </code>
          </li>
          <li>
            Subscribe the webhook to:{" "}
            <code>checkout.session.completed</code>,{" "}
            <code>checkout.session.expired</code>,{" "}
            <code>checkout.session.async_payment_succeeded</code>,{" "}
            <code>checkout.session.async_payment_failed</code>.
          </li>
          <li>Restart the workflow so the server picks up the new secrets.</li>
        </ol>
      </div>

      {!status?.configured && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {t("admin_dashboard.stripe_warning")}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");
  const isGlobalAdmin = user?.role === "global_admin";

  const { data: providers } = useQuery<ProviderWithUser[]>({
    queryKey: ["/api/providers"],
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAdminRole(user?.role),
  });

  const form = useForm<AdminProviderData>({
    resolver: zodResolver(adminProviderSchema),
    defaultValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      phone: "",
      city: "",
      type: "physiotherapist",
      specialization: "",
      bio: "",
      yearsExperience: 0,
      education: "",
      consultationFee: 50,
      homeVisitFee: undefined,
      languages: ["english"],
      availableDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    },
  });

  const createProviderMutation = useMutation({
    mutationFn: async (data: AdminProviderData) => {
      const response = await apiRequest("POST", "/api/admin/providers", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || t("admin_dashboard.provider_create_failed"));
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t("admin_dashboard.provider_created"),
        description: t("admin_dashboard.provider_created_desc"),
      });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: t("admin_dashboard.provider_create_failed"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!isAdminRole(user?.role)) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <Card className="max-w-md w-full mx-4">
            <CardHeader className="text-center">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <CardTitle>{t("admin.admin_access_required")}</CardTitle>
              <CardDescription>
                {t("admin.no_permission")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/")} className="w-full" data-testid="button-go-home">
                {t("admin.go_home")}
              </Button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 overflow-x-hidden">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-admin-title">
              <Shield className="h-8 w-8" />
              {t("admin.dashboard")}
            </h1>
            <p className="text-muted-foreground">{t("admin.bookings_management")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/admin/earnings")}
              data-testid="link-earnings"
            >
              <Banknote className="h-4 w-4 mr-1.5" />
              {t("admin.earnings_payouts", "Earnings & payouts")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/admin/stale-bookings")}
              data-testid="link-stale-bookings"
            >
              <Clock className="h-4 w-4 mr-1.5" />
              Stale bookings
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="tabs-colorful flex flex-wrap gap-1 h-auto w-full">
            {/* — Core — */}
            <TabsTrigger value="overview" data-testid="tab-overview">
              <BarChart3 className="h-4 w-4 mr-1.5" />
              {t("admin.analytics")}
            </TabsTrigger>
            <TabsTrigger value="providers" data-testid="tab-providers">
              <Building className="h-4 w-4 mr-1.5" />
              {t("admin.providers")}
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">
              <Users className="h-4 w-4 mr-1.5" />
              {t("admin.users")}
            </TabsTrigger>
            <TabsTrigger value="bookings" data-testid="tab-bookings">
              <Calendar className="h-4 w-4 mr-1.5" />
              {t("admin.bookings")}
            </TabsTrigger>
            <TabsTrigger value="calendar" data-testid="tab-calendar">
              <Calendar className="h-4 w-4 mr-1.5" />
              {t("admin.calendar", "Calendar")}
            </TabsTrigger>
            <TabsTrigger value="staff" data-testid="tab-staff">
              <UserCheck className="h-4 w-4 mr-1.5" />
              {t("admin.staff", "Staff")}
            </TabsTrigger>
            {/* — Catalog & Finance — */}
            <span className="flex items-center px-1 text-muted-foreground/40 select-none">|</span>
            <TabsTrigger value="catalog" data-testid="tab-catalog">
              <ListTree className="h-4 w-4 mr-1.5" />
              {t("admin.service_catalog", "Service Catalog")}
            </TabsTrigger>
            <TabsTrigger value="service-requests" data-testid="tab-service-requests">
              <ListTree className="h-4 w-4 mr-1.5" />
              {t("admin.service_requests", "Service Requests")}
            </TabsTrigger>
            <TabsTrigger value="financial" data-testid="tab-financial">
              <DollarSign className="h-4 w-4 mr-1.5" />
              {t("admin.financial_reports")}
            </TabsTrigger>
            <TabsTrigger value="wallets" data-testid="tab-wallets">
              <WalletIcon className="h-4 w-4 mr-1.5" />
              {t("admin.wallets", "Wallets")}
            </TabsTrigger>
            <TabsTrigger value="invoices" data-testid="tab-invoices">
              <FileText className="h-4 w-4 mr-1.5" />
              {t("admin.invoices")}
            </TabsTrigger>
            <TabsTrigger value="promos" data-testid="tab-promos">
              <Tag className="h-4 w-4 mr-1.5" />
              {t("admin.promo_codes")}
            </TabsTrigger>
            {/* — Config — */}
            <span className="flex items-center px-1 text-muted-foreground/40 select-none">|</span>
            <TabsTrigger value="support" data-testid="tab-support">
              <MessageSquare className="h-4 w-4 mr-1.5" />
              {t("admin.support_tickets")}
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">
              <Settings className="h-4 w-4 mr-1.5" />
              {t("common.settings")}
            </TabsTrigger>
            <TabsTrigger value="integrations" data-testid="tab-integrations">
              <Plus className="h-4 w-4 mr-1.5" />
              {t("admin.external_integrations")}
            </TabsTrigger>
            <TabsTrigger value="audit" data-testid="tab-audit">
              <Activity className="h-4 w-4 mr-1.5" />
              {t("admin.audit_logs")}
            </TabsTrigger>
            {isGlobalAdmin && (
              <TabsTrigger value="migrations" data-testid="tab-migrations">
                <Globe className="h-4 w-4 mr-1.5" />
                {t("admin.migrations_tab", "Migrations")}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="catalog">
            <div className="space-y-6">
              <ServicePendingChangesPanel />
              <ServiceCatalogHierarchy />
            </div>
          </TabsContent>

          <TabsContent value="service-requests">
            <AdminServiceRequestsPanel />
          </TabsContent>

          <TabsContent value="overview">
            <AnalyticsOverview />
          </TabsContent>

          <TabsContent value="calendar">
            <AdminCalendarView />
          </TabsContent>

          <TabsContent value="bookings">
            <BookingsManagementComponent />
          </TabsContent>

          <TabsContent value="staff">
            <AdminStaffOverview />
          </TabsContent>

          <TabsContent value="users">
            <UsersManagement />
          </TabsContent>

          <TabsContent value="providers">
            <ProvidersManagement />
          </TabsContent>

          <TabsContent value="financial">
            <FinancialReports />
          </TabsContent>

          <TabsContent value="wallets">
            <AdminWallets />
          </TabsContent>

          <TabsContent value="invoices">
            <InvoiceManagement />
          </TabsContent>

          <TabsContent value="content">
            <ContentManagement />
          </TabsContent>

          <TabsContent value="promos">
            <Card>
              <CardHeader>
                <CardTitle>{t("admin.promo_codes")}</CardTitle>
                <CardDescription>{t("admin.promo_codes_desc") || "Create and manage promotional codes"}</CardDescription>
              </CardHeader>
              <CardContent>
                <PromoCodeManagement providers={providers || []} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <PlatformSettings />
          </TabsContent>

          <TabsContent value="integrations">
            <Card>
              <CardHeader>
                <CardTitle>{t("admin.external_integrations")}</CardTitle>
                <CardDescription>{t("admin.manage_api_keys")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="google" className="w-full">
                  <TabsList className="tabs-colorful tabs-warm grid w-full grid-cols-3">
                    <TabsTrigger value="google">{t("admin_dashboard.google_apis")}</TabsTrigger>
                    <TabsTrigger value="payments">{t("admin_dashboard.payments")}</TabsTrigger>
                    <TabsTrigger value="messaging">{t("admin_dashboard.messaging")}</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="google" className="space-y-4 py-4">
                    <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label htmlFor="google-api-key">{t("admin_dashboard.google_maps_api_key")}</Label>
                        <Input id="google-api-key" placeholder={t("admin_dashboard.enter_api_key")} type="password" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="google-client-id">{t("admin_dashboard.google_client_id")}</Label>
                        <Input id="google-client-id" placeholder={t("admin_dashboard.enter_client_id")} />
                      </div>
                      <Button onClick={() => toast({ title: t("common.success") })}>{t("admin_dashboard.save_google_settings")}</Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="payments" className="space-y-4 py-4">
                    <StripeSettingsPanel />
                  </TabsContent>

                  <TabsContent value="messaging" className="space-y-4 py-4">
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>{t("admin_dashboard.whatsapp_label")}</Label>
                          <Input placeholder="AC..." type="password" />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("admin_dashboard.telegram_label")}</Label>
                          <Input placeholder="123456:ABC..." type="password" />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("admin_dashboard.viber_label")}</Label>
                          <Input placeholder={t("admin_dashboard.enter_token")} type="password" />
                        </div>
                      </div>
                      <Button onClick={() => toast({ title: t("common.success") })}>{t("admin_dashboard.save_messaging_settings")}</Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit">
            <AuditLogs />
          </TabsContent>

          {isGlobalAdmin && (
            <TabsContent value="migrations">
              <MigrationHistory />
            </TabsContent>
          )}

          <TabsContent value="support">
            <SupportTickets />
          </TabsContent>
        </Tabs>
      </main>

      <Footer />
    </div>
  );
}

// ───── Admin appointments calendar (Booknetic-style week view) ─────
function AdminCalendarView() {
  const { t } = useTranslation();
  const { format: fmtMoney } = useCurrency();
  const [weekOffset, setWeekOffset] = useState(0);
  const [providerFilter, setProviderFilter] = useState<string>("all");

  const { data: bookings = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/bookings"],
  });
  const { data: providers = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/providers"],
  });

  const startOfWeek = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(startOfWeek);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [startOfWeek],
  );

  const filtered = useMemo(() => {
    return (bookings || []).filter((b: any) => {
      if (providerFilter !== "all" && b.providerId !== providerFilter) return false;
      const bd = new Date(b.scheduledAt || b.date);
      return bd >= days[0] && bd < new Date(days[6].getTime() + 86400000);
    });
  }, [bookings, providerFilter, days]);

  const byDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    days.forEach((d) => {
      map[d.toDateString()] = [];
    });
    filtered.forEach((b: any) => {
      const key = new Date(b.scheduledAt || b.date).toDateString();
      if (map[key]) map[key].push(b);
    });
    Object.values(map).forEach((arr) =>
      arr.sort(
        (a, b) =>
          new Date(a.scheduledAt || a.date).getTime() -
          new Date(b.scheduledAt || b.date).getTime(),
      ),
    );
    return map;
  }, [filtered, days]);

  const statusColor = (s: string) =>
    s === "completed"
      ? "bg-emerald-500"
      : s === "confirmed"
      ? "bg-blue-500"
      : s === "cancelled"
      ? "bg-red-400"
      : s === "pending"
      ? "bg-amber-500"
      : "bg-slate-400";

  const dayName = (d: Date) =>
    d.toLocaleDateString(undefined, { weekday: "short" });
  const isToday = (d: Date) => d.toDateString() === new Date().toDateString();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setWeekOffset((w) => w - 1)}
              data-testid="button-cal-prev-week"
            >
              ‹
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setWeekOffset(0)}
              data-testid="button-cal-today"
            >
              {t("admin.today", "Today")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setWeekOffset((w) => w + 1)}
              data-testid="button-cal-next-week"
            >
              ›
            </Button>
            <span className="ml-2 font-medium" data-testid="text-cal-range">
              {days[0].toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}{" "}
              -{" "}
              {days[6].toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-56" data-testid="select-cal-provider">
              <SelectValue placeholder={t("admin.all_providers", "All providers")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t("admin.all_providers", "All providers")}
              </SelectItem>
              {providers.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.businessName || p.user?.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {days.map((d) => (
                <div
                  key={d.toISOString()}
                  className={`border rounded-lg p-2 min-h-[300px] ${
                    isToday(d) ? "border-primary bg-primary/5" : "bg-card"
                  }`}
                  data-testid={`col-cal-${d.toDateString()}`}
                >
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-xs uppercase text-muted-foreground">
                      {dayName(d)}
                    </span>
                    <span
                      className={`text-lg font-semibold ${
                        isToday(d) ? "text-primary" : ""
                      }`}
                    >
                      {d.getDate()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {byDay[d.toDateString()]?.map((b: any) => (
                      <div
                        key={b.id}
                        className={`p-2 rounded text-xs text-white ${statusColor(b.status)}`}
                        data-testid={`event-cal-${b.id}`}
                      >
                        <div className="font-semibold">
                          {new Date(b.scheduledAt || b.date).toLocaleTimeString(
                            [],
                            { hour: "2-digit", minute: "2-digit" },
                          )}
                        </div>
                        <div className="truncate opacity-95">
                          {b.serviceName || b.service?.name || "—"}
                        </div>
                        <div className="truncate opacity-80">
                          {b.customerName || b.customer?.name || ""}
                        </div>
                      </div>
                    ))}
                    {(byDay[d.toDateString()]?.length ?? 0) === 0 && (
                      <div className="text-xs text-muted-foreground/70 italic">
                        —
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-amber-500" /> {t("admin.pending", "Pending")}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-blue-500" /> {t("admin.confirmed", "Confirmed")}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-emerald-500" /> {t("admin.completed", "Completed")}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-red-400" /> {t("admin.cancelled", "Cancelled")}
        </span>
      </div>
    </div>
  );
}

function AdminStaffOverview() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<string>("all");

  const { data: staff = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/practitioners"],
  });
  const { data: providers = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/providers"],
  });

  const filtered = useMemo(
    () =>
      (staff || []).filter((p: any) => {
        if (providerFilter !== "all" && p.providerId !== providerFilter)
          return false;
        if (
          search &&
          !(p.fullName || "").toLowerCase().includes(search.toLowerCase()) &&
          !(p.providerName || "").toLowerCase().includes(search.toLowerCase()) &&
          !(p.email || "").toLowerCase().includes(search.toLowerCase())
        )
          return false;
        return true;
      }),
    [staff, search, providerFilter],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.search_staff", "Search staff...")}
            className="pl-8"
            data-testid="input-staff-search"
          />
        </div>
        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="w-56" data-testid="select-staff-provider">
            <SelectValue placeholder={t("admin.all_providers", "All providers")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("admin.all_providers", "All providers")}
            </SelectItem>
            {providers.map((p: any) => (
              <SelectItem key={p.id} value={p.id}>
                {p.businessName || p.user?.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("admin.no_staff", "No staff members found.")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p: any) => (
            <Card
              key={p.id}
              className="hover-elevate"
              data-testid={`card-staff-${p.id}`}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={p.avatarUrl || undefined} />
                  <AvatarFallback>
                    {(p.fullName || "?")
                      .split(" ")
                      .map((s: string) => s[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{p.fullName}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.role || t("admin.staff", "Staff")} · {p.providerName}
                  </p>
                  {p.email && (
                    <p className="text-xs text-muted-foreground truncate">
                      {p.email}
                    </p>
                  )}
                </div>
                <Badge variant={p.isActive ? "default" : "secondary"}>
                  {p.isActive
                    ? t("admin.active", "Active")
                    : t("admin.inactive", "Inactive")}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ───── Admin wallet management ─────
function AdminWallets() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<string>("");
  const [adjustReason, setAdjustReason] = useState<string>("");

  const { data: wallets, isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/wallets"],
  });

  const { data: txs } = useQuery<any[]>({
    queryKey: ["/api/admin/wallets", selectedUserId, "transactions"],
    enabled: !!selectedUserId,
  });

  const adjustMutation = useMutation({
    mutationFn: async () => {
      const n = Number(adjustAmount);
      if (!Number.isFinite(n) || n === 0) throw new Error("Amount must be a non-zero number");
      if (!adjustReason.trim()) throw new Error("Reason is required");
      const res = await apiRequest("POST", `/api/admin/wallets/${selectedUserId}/adjust`, {
        amount: n,
        reason: adjustReason.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("admin_wallets.adjust_success", "Adjustment applied") });
      setAdjustAmount("");
      setAdjustReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wallets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wallets", selectedUserId, "transactions"] });
    },
    onError: (e: Error) => {
      toast({ title: t("admin_wallets.adjust_failed", "Adjustment failed"), description: e.message, variant: "destructive" });
    },
  });

  const { format: fmt } = useCurrency();

  const filtered = (wallets || []).filter((w: any) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      w.user?.email?.toLowerCase().includes(q) ||
      w.user?.firstName?.toLowerCase().includes(q) ||
      w.user?.lastName?.toLowerCase().includes(q) ||
      w.userId?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("admin_wallets.title", "User Wallets")}</CardTitle>
          <CardDescription>{t("admin_wallets.desc", "Browse balances and inspect transactions.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            placeholder={t("admin_wallets.search_placeholder", "Search by email or name…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-3"
            data-testid="input-admin-wallet-search"
          />
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>
          ) : !filtered.length ? (
            <p className="text-sm text-muted-foreground">{t("admin_wallets.empty", "No wallets yet.")}</p>
          ) : (
            <ScrollArea className="h-[420px] pr-3">
              <ul className="divide-y">
                {filtered.map((w: any) => (
                  <li
                    key={w.id}
                    className={`flex items-center justify-between py-2 px-2 cursor-pointer rounded hover:bg-muted ${selectedUserId === w.userId ? "bg-muted" : ""}`}
                    onClick={() => setSelectedUserId(w.userId)}
                    data-testid={`row-admin-wallet-${w.userId}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {w.user?.firstName || ""} {w.user?.lastName || ""}{" "}
                        <span className="text-muted-foreground">{w.user?.email}</span>
                      </p>
                      {w.isFrozen && <Badge variant="destructive" className="mt-1">{t("admin.frozen")}</Badge>}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{fmt(w.balance)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin_wallets.detail_title", "Wallet Detail")}</CardTitle>
          <CardDescription>
            {selectedUserId
              ? t("admin_wallets.detail_desc", "Adjust balance and review history.")
              : t("admin_wallets.select_prompt", "Select a wallet to manage.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedUserId && (
            <>
              <div className="space-y-2">
                <Label htmlFor="adj-amount">
                  {t("admin_wallets.amount_label", "Amount (negative to debit)")}
                </Label>
                <Input
                  id="adj-amount"
                  type="number"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  placeholder="e.g. 5000 or -2500"
                  data-testid="input-admin-wallet-amount"
                />
                <Label htmlFor="adj-reason">{t("admin_wallets.reason_label", "Reason (audit trail)")}</Label>
                <Input
                  id="adj-reason"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder={t("admin_wallets.reason_placeholder", "Why this adjustment?")}
                  data-testid="input-admin-wallet-reason"
                />
                <Button
                  className="w-full"
                  onClick={() => adjustMutation.mutate()}
                  disabled={adjustMutation.isPending}
                  data-testid="button-admin-wallet-adjust"
                >
                  {adjustMutation.isPending
                    ? t("admin_wallets.adjusting", "Applying…")
                    : t("admin_wallets.adjust_cta", "Apply adjustment")}
                </Button>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">{t("admin_wallets.history", "Transactions")}</h4>
                {!txs?.length ? (
                  <p className="text-sm text-muted-foreground">
                    {t("admin_wallets.no_tx", "No transactions yet.")}
                  </p>
                ) : (
                  <ScrollArea className="h-[260px] pr-3">
                    <ul className="divide-y text-sm">
                      {txs.map((t: any) => (
                        <li key={t.id} className="py-2">
                          <div className="flex justify-between">
                            <span>{t.type}</span>
                            <span className={Number(t.amount) >= 0 ? "text-emerald-600" : "text-red-600"}>
                              {Number(t.amount) >= 0 ? "+" : ""}
                              {fmt(t.amount)}
                            </span>
                          </div>
                          {t.description && (
                            <p className="text-xs text-muted-foreground">{t.description}</p>
                          )}
                          <p className="text-[11px] text-muted-foreground">
                            {t.createdAt ? new Date(t.createdAt).toLocaleString() : ""} · bal {fmt(t.balanceAfter)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ───── Broadcast / direct-message panel for admin → all users ─────
function BroadcastPanel() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState("all");
  const [channels, setChannels] = useState<string[]>(["in_app", "email"]);
  const { data: history } = useQuery<any[]>({ queryKey: ["/api/admin/broadcasts"] });
  const send = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/broadcasts", { title, message, audience, channels }),
    onSuccess: (r: any) => {
      toast({ title: "Broadcast queued", description: `Will be sent to ${r?.recipientCount ?? 0} users` });
      setTitle(""); setMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/broadcasts"] });
    },
    onError: (e: any) => toast({ title: "Broadcast failed", description: e?.message, variant: "destructive" }),
  });
  const toggle = (c: string) => setChannels(channels.includes(c) ? channels.filter(x => x !== c) : [...channels, c]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.broadcast_title")}</CardTitle>
        <CardDescription>{t("admin.broadcast_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input data-testid="input-broadcast-title" placeholder={t("admin.broadcast_subject_placeholder")} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea data-testid="input-broadcast-message" rows={4} placeholder={t("admin.broadcast_body_placeholder")} value={message} onChange={(e) => setMessage(e.target.value)} />
        <div className="flex flex-wrap items-center gap-3">
          <Select value={audience} onValueChange={setAudience}>
            <SelectTrigger className="w-48" data-testid="select-broadcast-audience"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("admin.audience_all")}</SelectItem>
              <SelectItem value="patients">{t("admin.audience_patients")}</SelectItem>
              <SelectItem value="providers">{t("admin.audience_providers")}</SelectItem>
            </SelectContent>
          </Select>
          {(["in_app", "email", "sms", "whatsapp", "push"] as const).map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                data-testid={`checkbox-channel-${c}`}
                checked={channels.includes(c)}
                onChange={() => toggle(c)}
              />
              {c}
            </label>
          ))}
          <Button
            data-testid="button-send-broadcast"
            disabled={!title || !message || send.isPending}
            onClick={() => send.mutate()}
          >
            {send.isPending ? "Sending..." : "Send broadcast"}
          </Button>
        </div>
        {history && history.length > 0 && (
          <div className="pt-3 border-t mt-3">
            <p className="text-sm font-medium mb-2">{t("admin.recent_broadcasts")}</p>
            <div className="space-y-1 max-h-48 overflow-auto">
              {history.slice(0, 10).map((b) => (
                <div key={b.id} className="text-xs flex justify-between gap-2 border-b pb-1" data-testid={`row-broadcast-${b.id}`}>
                  <span className="font-medium truncate">{b.title}</span>
                  <span className="text-muted-foreground shrink-0">
                    {b.audience} · {b.recipientCount ?? 0} recipients · {b.createdAt ? new Date(b.createdAt).toLocaleString() : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ───── Recent notification delivery logs (success/failure across all channels) ─────
function DeliveryLogsPanel() {
  const { t } = useTranslation();
  const { data: logs } = useQuery<any[]>({ queryKey: ["/api/admin/notification-logs"] });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.notification_log")}</CardTitle>
        <CardDescription>{t("admin.notification_log_desc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-xs space-y-1 max-h-80 overflow-auto">
          {logs && logs.length > 0 ? logs.map((l) => (
            <div key={l.id} className="grid grid-cols-12 gap-2 border-b py-1" data-testid={`row-log-${l.id}`}>
              <span className="col-span-2 font-mono text-[10px]">{l.channel}</span>
              <span className="col-span-3">{l.eventKey}</span>
              <span className={`col-span-2 ${l.status === "sent" ? "text-green-600" : l.status === "skipped" ? "text-amber-600" : "text-red-600"}`}>{l.status}</span>
              <span className="col-span-3 truncate" title={l.errorMessage || ""}>{l.errorMessage || ""}</span>
              <span className="col-span-2 text-muted-foreground">{l.createdAt ? new Date(l.createdAt).toLocaleString() : ""}</span>
            </div>
          )) : <p className="text-muted-foreground">No deliveries yet.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
