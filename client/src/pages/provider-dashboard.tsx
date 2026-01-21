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

  const { data: providerData, isLoading: isLoadingProvider } = useQuery<Provider>({
    queryKey: ["/api/provider/me"],
  });

  const { data: practitioners } = useQuery<Practitioner[]>({
    queryKey: [`/api/providers/${providerData?.id}/practitioners`],
    enabled: !!providerData?.id,
  });

  const { data: appointments } = useQuery<AppointmentWithDetails[]>({
    queryKey: ["/api/appointments/provider"],
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/provider"] });
      toast({ title: "Appointment updated" });
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
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-semibold mb-2">Profile Not Found</h1>
            <p className="text-muted-foreground mb-4">You need to set up your provider profile to access the dashboard.</p>
            <Button onClick={() => setLocation("/provider/setup")}>Complete Setup</Button>
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

  const AppointmentRow = ({ appointment }: { appointment: AppointmentWithDetails }) => (
    <div className="flex items-center justify-between p-4 border rounded-lg hover-elevate">
      <div className="flex items-center gap-4">
        <Avatar className="h-10 w-10">
          <AvatarImage src={appointment.patient?.avatarUrl || undefined} />
          <AvatarFallback>{appointment.patient?.firstName?.charAt(0)}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium">{appointment.patient?.firstName} {appointment.patient?.lastName}</p>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {appointment.startTime}</span>
          </div>
        </div>
      </div>
      <Badge className={getStatusColor(appointment.status)}>{appointment.status}</Badge>
    </div>
  );

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
                            <Button size="sm" variant={p.isActive ? "default" : "outline"} onClick={() => togglePractitionerMutation.mutate({ id: p.id, isActive: !p.isActive })}>{p.isActive ? "Active" : "Paused"}</Button>
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