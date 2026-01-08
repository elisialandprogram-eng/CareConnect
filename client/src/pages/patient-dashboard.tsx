import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
import type { AppointmentWithDetails, Prescription, MedicalHistory } from "@shared/schema";

const PrescriptionList = ({ patientId }: { patientId?: string }) => {
  const { data: prescriptions, isLoading } = useQuery<Prescription[]>({
    queryKey: [`/api/prescriptions/patient/${patientId}`],
    enabled: !!patientId,
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!prescriptions?.length) return <p className="text-muted-foreground text-center py-4">No prescriptions found.</p>;

  return (
    <div className="space-y-4">
      {prescriptions.map((p) => (
        <div key={p.id} className="border-b pb-2 last:border-0">
          <p className="font-medium">{p.medicationName} - {p.dosage}</p>
          <p className="text-sm text-muted-foreground">{p.frequency} for {p.duration}</p>
          {p.instructions && <p className="text-xs mt-1 italic">{p.instructions}</p>}
        </div>
      ))}
    </div>
  );
};

const HistoryList = ({ patientId }: { patientId?: string }) => {
  const { data: history, isLoading } = useQuery<MedicalHistory[]>({
    queryKey: [`/api/medical-history/patient/${patientId}`],
    enabled: !!patientId,
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!history?.length) return <p className="text-muted-foreground text-center py-4">No medical history found.</p>;

  return (
    <div className="space-y-4">
      {history.map((h) => (
        <div key={h.id} className="border-b pb-2 last:border-0">
          <p className="font-medium">{h.title} ({h.type})</p>
          <p className="text-sm text-muted-foreground">{h.description}</p>
          <p className="text-xs text-muted-foreground mt-1">{new Date(h.date).toLocaleDateString()}</p>
        </div>
      ))}
    </div>
  );
};

export default function PatientDashboard() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: appointments, isLoading } = useQuery<AppointmentWithDetails[]>({
    queryKey: ["/api/appointments/patient"],
    // Automatically trigger cleanup when dashboard loads
    queryFn: async () => {
      await apiRequest("POST", "/api/appointments/cleanup", {});
      const res = await fetch("/api/appointments/patient", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch appointments");
      return res.json();
    }
  });

  const cancelMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const response = await apiRequest("PATCH", `/api/appointments/${appointmentId}/cancel`, {});
      if (!response.ok) {
        throw new Error("Failed to cancel appointment");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/patient"] });
      toast({
        title: "Appointment cancelled",
        description: "Your appointment has been cancelled successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to cancel appointment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const upcomingAppointments = appointments?.filter(
    (a) => a.status === "pending" || a.status === "confirmed"
  ) || [];

  const pastAppointments = appointments?.filter(
    (a) => a.status === "completed" || a.status === "cancelled"
  ) || [];

  const nextAppointment = upcomingAppointments[0];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "pending":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "completed":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "cancelled":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default:
        return "bg-muted text-muted-foreground";
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
                <h4 className="font-semibold">
                  {appointment.provider?.user?.firstName} {appointment.provider?.user?.lastName}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {appointment.provider?.specialization}
                </p>
              </div>
              <Badge className={getStatusColor(appointment.status)}>
                {appointment.status}
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
                <span>{appointment.visitType === "online" ? "Online" : "Home Visit"}</span>
              </div>
            </div>

            {(appointment.status === "pending" || appointment.status === "confirmed") && (
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/provider/${appointment.providerId}`}>
                    View Provider
                  </Link>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="text-destructive">
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel Appointment?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to cancel this appointment? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep Appointment</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => cancelMutation.mutate(appointment.id)}
                        className="bg-destructive text-destructive-foreground"
                      >
                        Cancel Appointment
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}

            {appointment.status === "completed" && (
              <div className="mt-4">
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/review/${appointment.id}`}>
                    <Star className="h-4 w-4 mr-1" />
                    Leave Review
                  </Link>
                </Button>
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
              <h1 className="text-3xl font-semibold">Welcome, {user?.firstName}!</h1>
              <p className="text-muted-foreground">Manage your healthcare appointments</p>
            </div>
            <Button asChild data-testid="button-new-appointment">
              <Link href="/providers">
                <Plus className="h-4 w-4 mr-2" />
                Book New Appointment
              </Link>
            </Button>
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
                      <p className="text-sm text-muted-foreground">Your Next Appointment</p>
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
                      <p className="text-sm text-muted-foreground">Date & Time</p>
                      <p className="font-medium">{formatDate(nextAppointment.date)} at {nextAppointment.startTime}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Visit Type</p>
                      <p className="font-medium flex items-center gap-1">
                        {nextAppointment.visitType === "online" ? (
                          <>
                            <Video className="h-4 w-4" />
                            Online Consultation
                          </>
                        ) : (
                          <>
                            <Home className="h-4 w-4" />
                            Home Visit
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <Button asChild>
                    <Link href={`/provider/${nextAppointment.providerId}`}>
                      View Details
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card data-testid="stat-upcoming">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Calendar className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{upcomingAppointments.length}</p>
                    <p className="text-sm text-muted-foreground">Upcoming</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="stat-completed">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                    <Star className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {pastAppointments.filter(a => a.status === "completed").length}
                    </p>
                    <p className="text-sm text-muted-foreground">Completed</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="stat-messages">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                    <MessageSquare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{upcomingAppointments.filter(a => a.status === 'confirmed').length}</p>
                    <p className="text-sm text-muted-foreground">Active</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="upcoming" className="w-full">
            <TabsList>
              <TabsTrigger value="upcoming" data-testid="tab-upcoming">
                Upcoming ({upcomingAppointments.length})
              </TabsTrigger>
              <TabsTrigger value="past" data-testid="tab-past">
                Past ({pastAppointments.length})
              </TabsTrigger>
              <TabsTrigger value="medical" data-testid="tab-medical">
                Medical Records
              </TabsTrigger>
              <TabsTrigger value="invoices" data-testid="tab-invoices">
                Invoices
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="mt-6">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-32 w-full rounded-lg" />
                  ))}
                </div>
              ) : upcomingAppointments.length > 0 ? (
                <div className="space-y-4">
                  {upcomingAppointments.map((appointment) => (
                    <AppointmentCard key={appointment.id} appointment={appointment} />
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="font-semibold text-lg mb-2">No upcoming appointments</h3>
                    <p className="text-muted-foreground mb-4">
                      Book an appointment with a healthcare provider
                    </p>
                    <Button asChild>
                      <Link href="/providers">Find Providers</Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="past" className="mt-6">
              {pastAppointments.length > 0 ? (
                <div className="space-y-4">
                  {pastAppointments.map((appointment) => (
                    <AppointmentCard key={appointment.id} appointment={appointment} />
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-12 text-center">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="font-semibold text-lg mb-2">No past appointments</h3>
                    <p className="text-muted-foreground">
                      Your completed appointments will appear here
                    </p>
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
                      Prescriptions
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
                      Medical History
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <HistoryList patientId={user?.id} />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="invoices" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Payment History</CardTitle>
                  <CardDescription>View your past payment transactions</CardDescription>
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
                                <p className="font-medium">Payment #{String(payment.id).slice(0, 8)}</p>
                                <p className="text-sm text-muted-foreground">
                                  {new Date(payment.createdAt).toLocaleDateString()} • {
                                    (payment as any).paymentMethod === 'crypto' ? 'Cryptocurrency' : 
                                    (payment as any).paymentMethod === 'card' ? 'Credit Card' :
                                    (payment as any).paymentMethod === 'bank_transfer' ? 'Bank Transfer' :
                                    'Cash'
                                  }
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">${Number(payment.amount).toFixed(2)}</p>
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
                      <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="font-semibold text-lg mb-2">No invoices yet</h3>
                      <p className="text-muted-foreground">
                        Your payment invoices will appear here after completed appointments
                      </p>
                    </div>
                  )}
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
