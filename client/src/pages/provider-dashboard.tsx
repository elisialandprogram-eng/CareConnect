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
import type { AppointmentWithDetails, Provider } from "@shared/schema";

export default function ProviderDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedAppointmentForPrescription, setSelectedAppointmentForPrescription] = useState<AppointmentWithDetails | null>(null);

  const prescriptionMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/prescriptions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prescriptions/patient"] });
      toast({ title: "Prescription issued successfully" });
      setSelectedAppointmentForPrescription(null);
    },
  });

  const { data: providerData, isLoading: isLoadingProvider } = useQuery<Provider>({
    queryKey: ["/api/provider/me"],
  });

  const [, setLocation] = useLocation();

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

  const { data: appointments, isLoading } = useQuery<AppointmentWithDetails[]>({
    queryKey: ["/api/appointments/provider"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/appointments/provider");
      if (!res.ok) throw new Error("Failed to fetch appointments");
      return res.json();
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/appointments/${id}/status`, { status });
      if (!response.ok) throw new Error("Failed to update status");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/provider"] });
      toast({ title: "Appointment updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update appointment", variant: "destructive" });
    },
  });

  const todayAppointments = appointments?.filter((a) => {
    const today = new Date().toISOString().split("T")[0];
    return a.date === today && (a.status === "confirmed" || a.status === "pending");
  }) || [];

  const upcomingAppointments = appointments?.filter(
    (a) => a.status === "pending" || a.status === "confirmed"
  ) || [];

  const completedAppointments = appointments?.filter(
    (a) => a.status === "completed"
  ) || [];

  const cancelledAppointments = appointments?.filter(
    (a) => a.status === "cancelled" || a.status === "rescheduled"
  ) || [];

  const totalEarnings = completedAppointments.reduce(
    (sum, a) => sum + Number(a.totalAmount || 0),
    0
  );

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
      case "pending":
        return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
      case "approved":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "confirmed":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "completed":
        return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
      case "rejected":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      case "cancelled":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      case "rescheduled":
        return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
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

  const { data: subServices } = useQuery<any[]>({
    queryKey: ["/api/sub-services", providerData?.providerType],
    enabled: !!providerData?.providerType,
  });

  const addServiceMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/services", {
        ...data,
        providerId: providerData?.id,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers", providerData?.id] });
      toast({ title: "Service added successfully" });
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

  const updateProviderMutation = useMutation({
    mutationFn: async (data: Partial<Provider>) => {
      const res = await apiRequest("PATCH", `/api/providers/${providerData?.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/me"] });
      toast({ title: "Gallery updated" });
    },
  });

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !providerData) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        const res = await apiRequest("POST", "/api/upload", { image: base64 });
        const data = await res.json();
        const currentGallery = providerData.gallery || [];
        updateProviderMutation.mutate({
          gallery: [...currentGallery, data.url]
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const removeGalleryImage = (index: number) => {
    if (!providerData) return;
    const currentGallery = [...(providerData.gallery || [])];
    currentGallery.splice(index, 1);
    updateProviderMutation.mutate({ gallery: currentGallery });
  };

  const AppointmentRow = ({ appointment }: { appointment: AppointmentWithDetails }) => (
    <div
      className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
      data-testid={`provider-appointment-${appointment.id}`}
    >
      <div className="flex items-center gap-4">
        <Avatar className="h-10 w-10">
          <AvatarImage src={appointment.patient?.avatarUrl || undefined} />
          <AvatarFallback className="bg-muted">
            {appointment.patient?.firstName?.charAt(0)}
            {appointment.patient?.lastName?.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium">
            {appointment.patient?.firstName} {appointment.patient?.lastName}
          </p>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {appointment.startTime}
            </span>
            <span className="flex items-center gap-1">
              {appointment.visitType === "online" ? (
                <Video className="h-3 w-3" />
              ) : (
                <Home className="h-3 w-3" />
              )}
              {appointment.visitType === "online" ? t("profile.online_consultation") : t("profile.home_visit")}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge className={getStatusColor(appointment.status)}>
          {appointment.status}
        </Badge>
        <div className="flex gap-1">
          {appointment.status === "pending" && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="text-blue-600"
                onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: "approved" })}
              >
                {t("dashboard.approve")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: "rejected" })}
              >
                {t("dashboard.reject")}
              </Button>
            </>
          )}
          {appointment.status === "approved" && (
            <Button
              size="sm"
              variant="outline"
              className="text-green-600"
              onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: "confirmed" })}
            >
              {t("dashboard.confirm")}
            </Button>
          )}
          {appointment.status === "confirmed" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedAppointmentForPrescription(appointment)}
              >
                {t("dashboard.prescribe")}
              </Button>
              <Button
                size="sm"
                onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: "completed" })}
              >
                {t("dashboard.complete")}
              </Button>
            </>
          )}
        </div>
      </div>
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
              <p className="text-muted-foreground">
                {t("dashboard.provider_desc")}
              </p>
            </div>
            <Button variant="outline" asChild data-testid="button-settings">
              <Link href="/provider/settings">
                <Settings className="h-4 w-4 mr-2" />
                {t("dashboard.settings")}
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card data-testid="stat-today">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{t("dashboard.today_appointments")}</p>
                    <p className="text-3xl font-bold">{todayAppointments.length}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <CalendarIcon className="h-6 w-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="stat-weekly-earnings">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{t("dashboard.this_week")}</p>
                    <p className="text-3xl font-bold">${weeklyEarnings.toFixed(0)}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                    <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="stat-rating">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{t("dashboard.rating")}</p>
                    <p className="text-3xl font-bold">
                      {providerData?.rating ? Number(providerData.rating).toFixed(1) : t("common.na")}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-yellow-100 dark:bg-yellow-900 flex items-center justify-center">
                    <Star className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="stat-patients">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{t("dashboard.total_patients")}</p>
                    <p className="text-3xl font-bold">{completedAppointments.length}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                    <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <Tabs defaultValue="upcoming" className="w-full">
                <TabsList>
                  <TabsTrigger value="upcoming" data-testid="tab-upcoming">
                    {t("dashboard.upcoming")} ({upcomingAppointments.length})
                  </TabsTrigger>
                  <TabsTrigger value="details" data-testid="tab-details">
                    Professional Details
                  </TabsTrigger>
                  <TabsTrigger value="completed" data-testid="tab-completed">
                    {t("dashboard.completed")}
                  </TabsTrigger>
                  <TabsTrigger value="cancelled" data-testid="tab-cancelled">
                    {t("dashboard.cancelled")} ({cancelledAppointments.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="today" className="mt-6 space-y-3">
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-20 w-full rounded-lg" />
                    ))
                  ) : todayAppointments.length > 0 ? (
                    todayAppointments.map((appointment) => (
                      <AppointmentRow key={appointment.id} appointment={appointment} />
                    ))
                  ) : (
                    <Card>
                      <CardContent className="p-12 text-center">
                        <CalendarIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground">{t("dashboard.no_appointments_today")}</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="upcoming" className="mt-6 space-y-3">
                  {upcomingAppointments.length > 0 ? (
                    upcomingAppointments.map((appointment) => (
                      <AppointmentRow key={appointment.id} appointment={appointment} />
                    ))
                  ) : (
                    <Card>
                      <CardContent className="p-12 text-center">
                        <CalendarIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground">{t("dashboard.no_upcoming")}</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="completed" className="mt-6 space-y-3">
                  {completedAppointments.length > 0 ? (
                    completedAppointments.slice(0, 10).map((appointment) => (
                      <AppointmentRow key={appointment.id} appointment={appointment} />
                    ))
                  ) : (
                    <Card>
                      <CardContent className="p-12 text-center">
                        <CheckCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground">{t("dashboard.no_completed_yet")}</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="cancelled" className="mt-6 space-y-3">
                  {cancelledAppointments.length > 0 ? (
                    cancelledAppointments.map((appointment) => (
                      <AppointmentRow key={appointment.id} appointment={appointment} />
                    ))
                  ) : (
                    <Card>
                      <CardContent className="p-12 text-center">
                        <X className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground">{t("dashboard.no_cancelled")}</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="details" className="mt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Credentials</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <span className="text-muted-foreground">Title:</span>
                          <span className="font-medium">{providerData?.professionalTitle || "N/A"}</span>
                          <span className="text-muted-foreground">License #:</span>
                          <span className="font-medium">{providerData?.licenseNumber || "N/A"}</span>
                          <span className="text-muted-foreground">Authority:</span>
                          <span className="font-medium">{providerData?.licensingAuthority || "N/A"}</span>
                          <span className="text-muted-foreground">NPI:</span>
                          <span className="font-medium">{providerData?.nationalProviderId || "N/A"}</span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Service & Pricing</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <span className="text-muted-foreground">Consultation:</span>
                          <span className="font-medium">${Number(providerData?.consultationFee).toFixed(0)}</span>
                          <span className="text-muted-foreground">Home Visit:</span>
                          <span className="font-medium">${Number(providerData?.homeVisitFee).toFixed(0)}</span>
                          <span className="text-muted-foreground">Telemedicine:</span>
                          <span className="font-medium">${Number(providerData?.telemedicineFee).toFixed(0)}</span>
                          <span className="text-muted-foreground">Radius:</span>
                          <span className="font-medium">{providerData?.serviceRadiusKm} km</span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="md:col-span-2">
                      <CardHeader>
                        <CardTitle className="text-lg">Compliance & Agreements</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle className={`h-4 w-4 ${providerData?.providerAgreementAccepted ? 'text-primary' : 'text-muted'}`} />
                            <span>Provider Agreement</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle className={`h-4 w-4 ${providerData?.dataProcessingAgreementAccepted ? 'text-primary' : 'text-muted'}`} />
                            <span>Data Processing Agreement</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle className={`h-4 w-4 ${providerData?.telemedicineAgreementAccepted ? 'text-primary' : 'text-muted'}`} />
                            <span>Telemedicine Agreement</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle className={`h-4 w-4 ${providerData?.codeOfConductAccepted ? 'text-primary' : 'text-muted'}`} />
                            <span>Code of Conduct</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t("profile.select_date")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    className="rounded-md border"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t("dashboard.earnings_summary")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t("dashboard.this_week")}</span>
                    <span className="font-semibold">${weeklyEarnings.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t("dashboard.total_earned")}</span>
                    <span className="font-semibold">${totalEarnings.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t("dashboard.pending_payment")}</span>
                    <span className="font-semibold">
                      ${upcomingAppointments.reduce((sum, a) => sum + Number(a.totalAmount || 0), 0).toFixed(2)}
                    </span>
                  </div>
                </CardContent>
              </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{t("dashboard.add_service_custom")}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>{t("dashboard.select_subservice")}</Label>
                        <Select onValueChange={setSelectedSubServiceId} value={selectedSubServiceId}>
                          <SelectTrigger>
                            <SelectValue placeholder={t("dashboard.choose_subservice")} />
                          </SelectTrigger>
                          <SelectContent>
                            {subServices?.map(sub => (
                              <SelectItem key={sub.id} value={sub.id}>{sub.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>{t("dashboard.your_price")}</Label>
                        <Input 
                          type="number" 
                          value={servicePrice} 
                          onChange={(e) => setServicePrice(e.target.value)}
                          placeholder={t("dashboard.enter_fee")}
                        />
                      </div>
                      <Button 
                        onClick={handleAddService} 
                        disabled={!selectedSubServiceId || !servicePrice || addServiceMutation.isPending}
                        className="w-full"
                      >
                        {addServiceMutation.isPending ? t("dashboard.adding") : t("dashboard.add_service_btn")}
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{t("dashboard.quick_actions")}</CardTitle>
                    </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link href="/provider/availability">
                      <Clock className="h-4 w-4 mr-2" />
                      {t("dashboard.manage_availability")}
                    </Link>
                  </Button>
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link href="/provider/services">
                      <Settings className="h-4 w-4 mr-2" />
                      {t("dashboard.edit_services")}
                    </Link>
                  </Button>
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link href="/provider/profile">
                      <Users className="h-4 w-4 mr-2" />
                      Edit Profile
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ImageIcon className="h-5 w-5 text-primary" />
                    Gallery
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {providerData?.gallery?.map((img, idx) => (
                      <div key={idx} className="relative group aspect-square rounded-md overflow-hidden border">
                        <img src={img} alt={`Gallery ${idx}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => removeGalleryImage(idx)}
                          className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <label className="flex flex-col items-center justify-center aspect-square rounded-md border-2 border-dashed cursor-pointer hover:bg-muted/50 transition-colors">
                      <Plus className="h-6 w-6 text-muted-foreground" />
                      <span className="text-[10px] mt-1 text-muted-foreground">Add Photo</span>
                      <input type="file" className="hidden" accept="image/*" multiple onChange={handleGalleryUpload} />
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground italic">
                    Upload pictures of your clinic, workspace, or equipment.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Medical Records
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Manage patient medical records and issue new prescriptions during consultations.
                  </p>
                  <Button variant="outline" className="w-full" asChild>
                    <Link href="/provider/patients">View Patients</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <Dialog 
          open={!!selectedAppointmentForPrescription} 
          onOpenChange={(open) => !open && setSelectedAppointmentForPrescription(null)}
        >
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Issue Prescription</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              prescriptionMutation.mutate({
                appointmentId: selectedAppointmentForPrescription?.id,
                patientId: selectedAppointmentForPrescription?.patientId,
                providerId: providerData?.id,
                medicationName: formData.get("medicationName"),
                dosage: formData.get("dosage"),
                frequency: formData.get("frequency"),
                duration: formData.get("duration"),
                instructions: formData.get("instructions"),
              });
            }} className="space-y-4">
              <div className="space-y-2">
                <Label>Medication Name</Label>
                <Input name="medicationName" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Dosage</Label>
                  <Input name="dosage" placeholder="e.g. 500mg" required />
                </div>
                <div className="space-y-2">
                  <Label>Frequency</Label>
                  <Input name="frequency" placeholder="e.g. Twice a day" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <Input name="duration" placeholder="e.g. 7 days" required />
              </div>
              <div className="space-y-2">
                <Label>Instructions</Label>
                <Textarea name="instructions" />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setSelectedAppointmentForPrescription(null)}>Cancel</Button>
                <Button type="submit" disabled={prescriptionMutation.isPending}>Issue Prescription</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </main>

      <Footer />
    </div>
  );
}
