import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Calendar, Clock, User, MapPin, Video, Building, Star, MessageSquare, RefreshCw } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { showErrorModal } from "@/components/error-modal";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Appointment {
  id: string;
  appointmentNumber?: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  visitType: string;
  notes?: string;
  providerId: string;
  provider: {
    id: string;
    type: string;
    user: {
      firstName: string;
      lastName: string;
    };
  };
  service: {
    id: string;
    name: string;
    price: string;
  } | null;
  hasReview?: boolean;
}

function RatingDialog({ appointment }: { appointment: Appointment }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/reviews", {
        appointmentId: appointment.id,
        providerId: appointment.providerId,
        rating,
        comment,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Review submitted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/patient"] });
      setIsOpen(false);
    },
    onError: (error: Error) => {
      showErrorModal({
        title: "Failed to submit review",
        description: error.message,
        context: "appointments.submitReview",
      });
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`button-rate-${appointment.id}`}>{t("appointments.rate_service")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("appointments.rate_dialog_title")}</DialogTitle>
          <DialogDescription>
            {t("appointments.rate_dialog_desc", { firstName: appointment.provider.user.firstName, lastName: appointment.provider.user.lastName })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                onClick={() => setRating(s)}
                className="focus:outline-none"
                data-testid={`star-${s}`}
              >
                <Star
                  className={`h-8 w-8 ${s <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted"}`}
                />
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("appointments.comments")}</label>
            <Textarea
              placeholder={t("appointments.comments_placeholder")}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              data-testid="input-review-comment"
            />
          </div>
          <Button
            className="w-full"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            data-testid="button-submit-review"
          >
            {mutation.isPending ? "Submitting..." : "Submit Review"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Appointments() {
  const { isAuthenticated, user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login");
    } else if (!authLoading && user?.role === "provider") {
      navigate("/provider/dashboard");
    } else if (!authLoading && user?.role === "admin") {
      navigate("/admin");
    }
  }, [isAuthenticated, authLoading, user?.role, navigate]);

  const { data: appointments, isLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments/patient"],
    enabled: isAuthenticated && user?.role === "patient",
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-48 mb-8" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      confirmed: "default",
      completed: "outline",
      cancelled: "destructive",
      rescheduled: "secondary",
    };
    return <Badge variant={variants[status] || "secondary"}>{status}</Badge>;
  };

  const getVisitTypeIcon = (visitType: string) => {
    if (visitType === "online") {
      return <Video className="h-4 w-4" />;
    }
    if (visitType === "clinic") {
      return <Building className="h-4 w-4" />;
    }
    return <MapPin className="h-4 w-4" />;
  };

  const getVisitTypeLabel = (visitType: string) => {
    switch (visitType) {
      case "online": return "Online";
      case "clinic": return "Clinic Visit";
      case "home": return "Home Visit";
      default: return "In-person";
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">{t("appointments.my_appointments", "My Appointments")}</h1>
          {user?.role === "patient" && (
            <Button asChild data-testid="button-book-new">
              <Link href="/providers">{t("dashboard.book_new")}</Link>
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : appointments && appointments.length > 0 ? (
          <div className="space-y-4">
            {appointments.map((appointment) => (
              <Card key={appointment.id} data-testid={`card-appointment-${appointment.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <CardTitle className="text-lg">
                          {appointment.service?.name || "Consultation"}
                        </CardTitle>
                        {appointment.appointmentNumber && (
                          <span
                            className="text-xs font-mono font-semibold text-primary/80 bg-primary/10 px-2 py-0.5 rounded"
                            data-testid={`text-appt-number-${appointment.id}`}
                          >
                            {appointment.appointmentNumber}
                          </span>
                        )}
                      </div>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <User className="h-4 w-4" />
                        Dr. {appointment.provider.user.firstName} {appointment.provider.user.lastName}
                      </CardDescription>
                    </div>
                    {getStatusBadge(appointment.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-end">
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {new Date(appointment.date).toLocaleDateString()}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {appointment.startTime} - {appointment.endTime}
                      </div>
                      <div className="flex items-center gap-1">
                        {getVisitTypeIcon(appointment.visitType)}
                        {getVisitTypeLabel(appointment.visitType)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {!["cancelled", "rejected", "completed"].includes(appointment.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          data-testid={`button-message-provider-${appointment.id}`}
                          onClick={async () => {
                            try {
                              const provider = await fetch(`/api/providers/${appointment.providerId}`, { credentials: "include" }).then(r => r.json());
                              const participantId = provider?.userId;
                              if (!participantId) throw new Error("Provider not available");
                              await fetch("/api/chat/start", {
                                method: "POST",
                                credentials: "include",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ participantId }),
                              });
                              window.dispatchEvent(new CustomEvent("open-chat"));
                              toast({ title: "Chat opened", description: "You can message your provider now." });
                            } catch (e: any) {
                              showErrorModal({
                                title: "Could not start chat",
                                description: e.message,
                                context: "appointments.startChat",
                              });
                            }
                          }}
                        >
                          <MessageSquare className="h-3 w-3" /> Message
                        </Button>
                      )}
                      {appointment.visitType === "online" &&
                        ["confirmed", "approved", "rescheduled"].includes(appointment.status) && (
                          <Button
                            size="sm"
                            variant="default"
                            className="gap-1"
                            data-testid={`button-join-call-${appointment.id}`}
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/video/room/${appointment.id}`, { credentials: "include" });
                                const j = await res.json();
                                if (j.url) window.open(j.url, "_blank", "noopener,noreferrer");
                                else throw new Error(j.message || "Could not open call");
                              } catch (e: any) {
                                showErrorModal({
                                  title: "Cannot join call",
                                  description: e.message,
                                  context: "appointments.joinCall",
                                });
                              }
                            }}
                          >
                            <Video className="h-3 w-3" /> Join call
                          </Button>
                        )}
                      {appointment.status === "completed" && !appointment.hasReview && (
                        <RatingDialog appointment={appointment} />
                      )}
                      {appointment.status === "completed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          asChild
                          data-testid={`button-rebook-${appointment.id}`}
                        >
                          <Link
                            href={`/book?providerId=${appointment.providerId}${appointment.service?.id ? `&serviceId=${appointment.service.id}` : ""}&visitType=${appointment.visitType}`}
                          >
                            <RefreshCw className="h-3 w-3" />
                            {t("appointments.book_again", "Book again")}
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t("appointments.none_yet", "No appointments yet")}</h3>
              {user?.role === "patient" && (
                <>
                  <p className="text-muted-foreground mb-4">
                    {t("appointments.book_first", "Book your first appointment with a healthcare provider.")}
                  </p>
                  <Button asChild data-testid="button-find-provider">
                    <Link href="/providers">{t("appointments.find_provider", "Find a Provider")}</Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </main>
      <Footer />
    </div>
  );
}
