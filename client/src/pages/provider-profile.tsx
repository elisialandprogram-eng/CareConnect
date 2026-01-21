import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, MapPin, Clock, CheckCircle, Video, Home, GraduationCap, Award, Languages, Calendar as CalendarIcon, ChevronRight, Building2, X } from "lucide-react";
import type { ProviderWithServices, Service, ReviewWithPatient } from "@shared/schema";
import { useAuth } from "@/lib/auth";

export default function ProviderProfile() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const { data: provider, isLoading: providerLoading } = useQuery<ProviderWithServices>({
    queryKey: ["/api/providers", id],
    enabled: !!id,
  });

  const { data: reviews } = useQuery<ReviewWithPatient[]>({
    queryKey: [`/api/providers/${id}/reviews`],
    enabled: !!id,
  });

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedSessions, setSelectedSessions] = useState<{ date: Date; time: string }[]>([]);
  const [visitType, setVisitType] = useState<"online" | "home" | "clinic">("online");

  const timeSlots = [
    "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
    "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00",
  ];

  const toggleSession = (time: string) => {
    if (!selectedDate) return;
    const dateStr = selectedDate.toISOString().split("T")[0];
    const existingIndex = selectedSessions.findIndex(s => s.date.toISOString().split("T")[0] === dateStr && s.time === time);
    
    if (existingIndex > -1) {
      setSelectedSessions(selectedSessions.filter((_, i) => i !== existingIndex));
    } else {
      setSelectedSessions([...selectedSessions, { date: selectedDate, time }]);
    }
  };

  const handleBooking = () => {
    if (!isAuthenticated) {
      navigate("/login?redirect=/provider/" + id);
      return;
    }
    
    if (selectedSessions.length === 0) return;
    
    const effectiveService = selectedService || (provider?.services && provider.services.length > 0 ? provider.services[0] : null);
    
    const params = new URLSearchParams({
      providerId: id!,
      visitType: visitType,
      sessions: JSON.stringify(selectedSessions.map(s => ({
        date: s.date.toISOString().split("T")[0],
        time: s.time
      })))
    });
    
    if (effectiveService) {
      params.append("serviceId", effectiveService.id);
    }
    
    navigate(`/booking?${params.toString()}`);
  };

  if (providerLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 py-8">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <Skeleton className="h-48 w-full rounded-lg" />
                <Skeleton className="h-64 w-full rounded-lg" />
              </div>
              <Skeleton className="h-96 w-full rounded-lg" />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-semibold mb-2">{t("profile.not_found")}</h1>
            <p className="text-muted-foreground mb-4">{t("profile.not_found_desc")}</p>
            <Button onClick={() => navigate("/providers")}>{t("profile.browse_providers")}</Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const getInitials = () => {
    return `${provider.user.firstName?.charAt(0) || ""}${provider.user.lastName?.charAt(0) || ""}`.toUpperCase();
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "physiotherapist": return t("common.physiotherapists");
      case "nurse": return t("common.nurses");
      case "doctor": return t("common.doctors");
      default: return type;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card data-testid="card-provider-header">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row gap-6">
                    <Avatar className="h-32 w-32 border-4 border-border">
                      <AvatarImage src={provider.user.avatarUrl || undefined} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-3xl font-medium">
                        {getInitials()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 space-y-3">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-semibold">
                              {provider.user.firstName} {provider.user.lastName}
                            </h1>
                            {provider.isVerified && (
                              <CheckCircle className="h-5 w-5 text-primary" />
                            )}
                          </div>
                          <p className="text-muted-foreground">{provider.specialization}</p>
                        </div>
                        <Badge variant="secondary" className="text-sm">
                          {getTypeLabel(provider.type)}
                        </Badge>
                      </div>

                      {/* Display Practitioners if available */}
                      {provider.practitionerData && (
                        <div className="mt-2 space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("profile.our_specialists")}</p>
                          <div className="flex flex-wrap gap-2">
                            {(() => {
                              try {
                                const practitioners = typeof provider.practitionerData === 'string' 
                                  ? JSON.parse(provider.practitionerData) 
                                  : provider.practitionerData;
                                return Array.isArray(practitioners) ? practitioners.map((p: any, i: number) => (
                                  <Badge key={i} variant="outline" className="bg-muted/30">
                                    {p.name} ({p.specialization})
                                  </Badge>
                                )) : null;
                              } catch (e) {
                                return null;
                              }
                            })()}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          <span className="font-medium">{Number(provider.rating).toFixed(1)}</span>
                          <span className="text-muted-foreground">{t("profile.reviews_count", { count: provider.totalReviews })}</span>
                        </div>
                        {provider.user.city && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            <span>{provider.user.city}</span>
                          </div>
                        )}
                        {provider.yearsExperience && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>{t("profile.years_experience", { count: provider.yearsExperience })}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="gap-1">
                          <Video className="h-3 w-3" />
                          {t("profile.online_consultation")}
                        </Badge>
                        {provider.homeVisitFee && (
                          <Badge variant="outline" className="gap-1">
                            <Home className="h-3 w-3" />
                            {t("profile.home_visit")}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Tabs defaultValue="about" className="w-full">
                <TabsList className="w-full grid grid-cols-3">
                  <TabsTrigger value="about" data-testid="tab-about">{t("profile.tabs.about")}</TabsTrigger>
                  <TabsTrigger value="services" data-testid="tab-services">{t("profile.tabs.services")}</TabsTrigger>
                  <TabsTrigger value="reviews" data-testid="tab-reviews">{t("profile.tabs.reviews")}</TabsTrigger>
                </TabsList>

                <TabsContent value="about" className="mt-6 space-y-6">
                  {provider.gallery && provider.gallery.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">{t("profile.gallery")}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                          {provider.gallery.map((img, idx) => (
                            <div key={idx} className="aspect-square rounded-lg overflow-hidden border hover-elevate cursor-pointer">
                              <img src={img} alt={`Gallery ${idx}`} className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{t("profile.tabs.about")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">
                        {provider.bio || t("profile.no_bio")}
                      </p>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {provider.education && (
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <GraduationCap className="h-5 w-5 text-primary mt-0.5" />
                            <div>
                              <h4 className="font-medium mb-1">{t("profile.education")}</h4>
                              <p className="text-sm text-muted-foreground">{provider.education}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {provider.certifications && provider.certifications.length > 0 && (
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <Award className="h-5 w-5 text-primary mt-0.5" />
                            <div>
                              <h4 className="font-medium mb-1">{t("profile.certifications")}</h4>
                              <ul className="text-sm text-muted-foreground space-y-1">
                                {provider.certifications.map((cert, i) => (
                                  <li key={i}>{cert}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {provider.languages && provider.languages.length > 0 && (
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <Languages className="h-5 w-5 text-primary mt-0.5" />
                            <div>
                              <h4 className="font-medium mb-1">{t("profile.languages")}</h4>
                              <p className="text-sm text-muted-foreground">
                                {provider.languages.join(", ")}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="services" className="mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{t("profile.services_pricing")}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {provider.services && provider.services.length > 0 ? (
                        provider.services.map((service) => (
                          <div
                            key={service.id}
                            className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                              selectedService?.id === service.id
                                ? "border-primary bg-primary/5"
                                : "hover:border-primary/50"
                            }`}
                            onClick={() => setSelectedService(service)}
                            data-testid={`service-${service.id}`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <h4 className="font-medium">{service.name}</h4>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {service.description}
                                </p>
                                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-4 w-4" />
                                    {service.duration} min
                                  </span>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-semibold">
                                  ${Number(service.adminPriceOverride || service.price).toFixed(0)}
                                </p>
                                {service.adminPriceOverride && (
                                  <Badge variant="secondary" className="text-[10px] uppercase">{t("profile.special_offer")}</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <p>{t("profile.no_services")}</p>
                          <div className="mt-4 p-4 bg-muted rounded-lg">
                            <p className="font-medium text-foreground">{t("profile.consultation_fee")}</p>
                            <p className="text-2xl font-semibold text-foreground mt-1">
                              ${Number(provider.consultationFee).toFixed(0)}
                            </p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="reviews" className="mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{t("profile.patient_reviews")}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {reviews && reviews.length > 0 ? (
                        reviews.map((review) => (
                          <div key={review.id} className="pb-6 border-b last:border-0 last:pb-0">
                            <div className="flex items-start gap-3">
                              <Avatar className="h-10 w-10">
                                <AvatarImage src={review.patient.avatarUrl || undefined} />
                                <AvatarFallback className="bg-muted text-sm">
                                  {review.patient.firstName?.charAt(0)}
                                  {review.patient.lastName?.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="font-medium">
                                    {review.patient.firstName} {review.patient.lastName}
                                  </p>
                                  <div className="flex gap-0.5">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                      <Star
                                        key={i}
                                        className={`h-4 w-4 ${
                                          i < review.rating
                                            ? "fill-yellow-400 text-yellow-400"
                                            : "fill-muted text-muted"
                                        }`}
                                      />
                                    ))}
                                  </div>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {review.comment}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Star className="h-12 w-12 mx-auto mb-3 text-muted" />
                          <p>{t("profile.no_reviews")}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>

            <div className="lg:col-span-1">
              <Card className="sticky top-24" data-testid="card-booking-widget">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CalendarIcon className="h-5 w-5" />
                    {t("profile.book_appointment")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">{t("common.service_type")}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant={visitType === "online" ? "default" : "outline"}
                        className="w-full"
                        onClick={() => setVisitType("online")}
                        data-testid="button-visit-online"
                      >
                        <Video className="h-4 w-4 mr-2" />
                        {t("profile.online_consultation")}
                      </Button>
                      <Button
                        variant={visitType === "clinic" ? "default" : "outline"}
                        className="w-full"
                        onClick={() => setVisitType("clinic")}
                        data-testid="button-visit-clinic"
                      >
                        <Building2 className="h-4 w-4 mr-2" />
                        {t("profile.visit_clinic")}
                      </Button>
                      {provider.homeVisitFee && (
                        <Button
                          variant={visitType === "home" ? "default" : "outline"}
                          className="w-full"
                          onClick={() => setVisitType("home")}
                          data-testid="button-visit-home"
                        >
                          <Home className="h-4 w-4 mr-2" />
                          {t("profile.home_visit")}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">{t("profile.select_date")}</p>
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      disabled={(date) => date < new Date()}
                      className="rounded-md border"
                      data-testid="calendar-date"
                    />
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">{t("profile.select_time")}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {timeSlots.map((time) => {
                        const isSelected = selectedSessions.some(s => s.date.toISOString().split("T")[0] === (selectedDate?.toISOString().split("T")[0]) && s.time === time);
                        return (
                          <Button
                            key={time}
                            variant={isSelected ? "default" : "outline"}
                            size="sm"
                            onClick={() => toggleSession(time)}
                            data-testid={`time-${time}`}
                          >
                            {time}
                          </Button>
                        );
                      })}
                    </div>
                    {selectedSessions.length > 0 && (
                      <div className="mt-4 p-3 bg-muted rounded-md text-xs space-y-1">
                        <p className="font-medium">{t("profile.selected_sessions")}</p>
                        {selectedSessions.map((s, i) => (
                          <div key={i} className="flex justify-between items-center">
                            <span>{s.date.toLocaleDateString()} at {s.time}</span>
                            <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => {
                              setSelectedSessions(selectedSessions.filter((_, idx) => idx !== i));
                            }}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-muted-foreground">{t("profile.consultation_fee")}</span>
                      <span className="font-semibold">
                        ${visitType === "home" && provider.homeVisitFee
                          ? Number(provider.homeVisitFee).toFixed(0)
                          : Number(provider.consultationFee).toFixed(0)}
                      </span>
                    </div>
                    {selectedSessions.length > 1 && (
                      <div className="flex items-center justify-between mb-4 text-primary font-bold">
                        <span>{t("profile.total_price")} ({selectedSessions.length} sessions)</span>
                        <span>
                          ${(selectedSessions.length * (visitType === "home" && provider.homeVisitFee
                            ? Number(provider.homeVisitFee)
                            : Number(provider.consultationFee))).toFixed(0)}
                        </span>
                      </div>
                    )}
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={handleBooking}
                      disabled={selectedSessions.length === 0}
                      data-testid="button-book-appointment"
                    >
                      {t("profile.book_now")}
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
