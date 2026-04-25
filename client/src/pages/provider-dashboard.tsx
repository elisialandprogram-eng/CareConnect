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
} from "lucide-react";
import type { AppointmentWithDetails, Provider, ProviderWithServices, Practitioner, Service } from "@shared/schema";

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
          <span>{sp.practitioner.name} (${Number(sp.fee).toFixed(0)})</span>
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
    (a) => a.status === "pending" || a.status === "confirmed"
  ) || [];

  const completedAppointments = appointments?.filter(
    (a) => a.status === "completed"
  ) || [];

  const weeklyEarnings = completedAppointments
    .filter((a) => {
      const appointmentDate = new Date(a.date);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return appointmentDate >= weekAgo;
    })
    .reduce((sum, a) => sum + Number(a.totalAmount || 0), 0);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-orange-100 text-orange-700";
      case "confirmed": return "bg-green-100 text-green-700";
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
      <div className="flex flex-col gap-3 p-4 border rounded-lg hover-elevate" data-testid={`row-appointment-${appointment.id}`}>
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
          <div className="flex flex-wrap items-center gap-2 pl-14 pt-1">
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
                  Approve
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
                  Reject
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
                Confirm
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
                Mark Completed
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
                Mark payment received
              </Button>
            )}
            {!isPending && (
              <Button
                size="sm"
                variant="outline"
                disabled={isUpdating}
                onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: "cancelled" })}
                data-testid={`button-cancel-${appointment.id}`}
              >
                <X className="h-3 w-3 mr-1" />
                Cancel
              </Button>
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

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card><CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Upcoming</p>
              <p className="text-3xl font-bold">{upcomingAppointments.length}</p>
            </CardContent></Card>
            <Card><CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Weekly Earnings</p>
              <p className="text-3xl font-bold">${weeklyEarnings.toFixed(0)}</p>
            </CardContent></Card>
          </div>

          <Tabs defaultValue="upcoming" className="w-full">
            <TabsList>
              <TabsTrigger value="upcoming">Appointments</TabsTrigger>
              <TabsTrigger value="services">Services & Staff</TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="mt-6 space-y-3">
              {upcomingAppointments.length > 0 ? (
                upcomingAppointments.map((a) => <AppointmentRow key={a.id} appointment={a} />)
              ) : (
                <div className="text-center py-12 text-muted-foreground">No upcoming appointments</div>
              )}
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
                          <span>{s.name} (${Number(s.price).toFixed(0)})</span>
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
        </div>
      </main>
      <Footer />
    </div>
  );
}