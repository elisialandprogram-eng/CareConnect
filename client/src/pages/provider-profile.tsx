import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, MapPin, Clock, CheckCircle, Video, Home, GraduationCap, Award, Languages, Calendar as CalendarIcon, ChevronRight, Building2, ShieldCheck, Briefcase, FileText, Landmark, Share2 } from "lucide-react";
import { WaitlistJoinButton } from "@/components/waitlist-join-button";
import { useToast } from "@/hooks/use-toast";
import type { ProviderWithServices, Service, ReviewWithPatient, ServicePackageWithServices } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";

export default function ProviderProfile() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const canBook = !user || user.role === "patient";
  const { format: fmtMoney } = useCurrency();

  const { data: provider, isLoading: providerLoading } = useQuery<ProviderWithServices>({
    queryKey: ["/api/providers", id],
    enabled: !!id,
  });

  const { add: trackRecentlyViewed } = useRecentlyViewed();
  useEffect(() => {
    if (provider?.id) trackRecentlyViewed(provider.id);
  }, [provider?.id, trackRecentlyViewed]);

  const { data: reviews } = useQuery<ReviewWithPatient[]>({
    queryKey: [`/api/providers/${id}/reviews`],
    enabled: !!id,
  });

  const { data: providerPackages = [] } = useQuery<ServicePackageWithServices[]>({
    queryKey: [`/api/providers/${id}/packages`],
    enabled: !!id,
  });

  const [selectedService, setSelectedService] = useState<Service | null>(null);

  const handleBooking = () => {
    if (!isAuthenticated) {
      navigate("/login?redirect=/provider/" + id);
      return;
    }

    // Only forward a serviceId when the user explicitly picked one on this
    // page. Auto-defaulting to provider.services[0] caused the wizard to
    // silently skip the "Pick a service" step.
    const params = new URLSearchParams({ providerId: id! });
    if (selectedService) {
      params.append("serviceId", selectedService.id);
    }

    navigate(`/book?${params.toString()}`);
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
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-sm">
                            {getTypeLabel(provider.providerType)}
                          </Badge>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              const url = window.location.href;
                              const title = `${provider.user.firstName} ${provider.user.lastName} – ${provider.specialization || ""}`.trim();
                              try {
                                if (navigator.share) {
                                  await navigator.share({ title, url });
                                } else {
                                  await navigator.clipboard.writeText(url);
                                  toast({
                                    title: t("profile.link_copied", "Link copied"),
                                    description: t(
                                      "profile.link_copied_desc",
                                      "Provider link copied to your clipboard.",
                                    ),
                                  });
                                }
                              } catch {
                                /* user cancelled share dialog */
                              }
                            }}
                            data-testid="button-share-provider"
                          >
                            <Share2 className="h-4 w-4 mr-2" />
                            {t("profile.share", "Share")}
                          </Button>
                        </div>
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
                          <span className="text-muted-foreground">{t("profile.reviews_count", { count: provider.totalReviews || 0 })}</span>
                        </div>
                        {provider.user.city && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            <span>{provider.user.city}</span>
                          </div>
                        )}
                        {provider.yearsExperience !== null && (
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

                    {provider.licenseNumber && (
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <Landmark className="h-5 w-5 text-primary mt-0.5" />
                            <div>
                              <h4 className="font-medium mb-1">{t("profile.license_credentials", "License & Credentials")}</h4>
                              <p className="text-sm text-muted-foreground">
                                {t("profile.license", "License")}: {provider.licenseNumber}<br />
                                {t("profile.authority", "Authority")}: {provider.licensingAuthority}<br />
                                {provider.nationalProviderId && `${t("profile.npi", "NPI")}: ${provider.nationalProviderId}`}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {provider.secondarySpecialties && provider.secondarySpecialties.length > 0 && (
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <Briefcase className="h-5 w-5 text-primary mt-0.5" />
                            <div>
                              <h4 className="font-medium mb-1">{t("profile.secondary_specialties", "Secondary Specialties")}</h4>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {provider.secondarySpecialties.map((spec, i) => (
                                  <Badge key={i} variant="secondary" className="text-[10px]">
                                    {spec}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {provider.consultationFee && (
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <FileText className="h-5 w-5 text-primary mt-0.5" />
                            <div>
                              <h4 className="font-medium mb-1">{t("profile.fees_pricing", "Fees & Pricing")}</h4>
                              <div className="text-sm text-muted-foreground space-y-1">
                                <p>{t("profile.consultation", "Consultation")}: {fmtMoney(provider.consultationFee)}</p>
                                {provider.homeVisitFee && <p>{t("profile.home_visit", "Home Visit")}: {fmtMoney(provider.homeVisitFee)}</p>}
                                {provider.telemedicineFee && <p>{t("profile.telemedicine", "Telemedicine")}: {fmtMoney(provider.telemedicineFee)}</p>}
                                {provider.emergencyCareFee && <p>{t("profile.emergency", "Emergency")}: {fmtMoney(provider.emergencyCareFee)}</p>}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {(provider.backgroundCheckStatus === "completed" || provider.identityVerificationStatus === "completed" || provider.isVerified) && (
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <ShieldCheck className="h-5 w-5 text-primary mt-0.5" />
                            <div>
                              <h4 className="font-medium mb-1">{t("profile.verification_status", "Verification Status")}</h4>
                              <div className="flex flex-wrap gap-2 mt-1">
                                {provider.isVerified && <Badge variant="outline" className="text-primary border-primary">{t("profile.verified_provider", "Verified Provider")}</Badge>}
                                {provider.backgroundCheckStatus === "completed" && <Badge variant="outline" className="text-green-600 border-green-600">{t("profile.background_checked", "Background Checked")}</Badge>}
                                {provider.identityVerificationStatus === "completed" && <Badge variant="outline" className="text-blue-600 border-blue-600">{t("profile.identity_verified", "Identity Verified")}</Badge>}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {provider.primaryServiceLocation && (
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <MapPin className="h-5 w-5 text-primary mt-0.5" />
                            <div>
                              <h4 className="font-medium mb-1">{t("profile.service_area", "Service Area")}</h4>
                              <p className="text-sm text-muted-foreground">
                                {provider.primaryServiceLocation}<br />
                                {provider.serviceRadiusKm && `${t("profile.radius", "Radius")}: ${provider.serviceRadiusKm} km`}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                  </div>
                </TabsContent>

                <TabsContent value="services" className="mt-6 space-y-6">
                  {providerPackages.length > 0 && (
                    <Card data-testid="card-profile-packages">
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Award className="h-5 w-5 text-primary" />
                          {t("profile.packages", "Packages")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {providerPackages.map((pkg) => {
                          const fullPrice = pkg.services.reduce((sum, s) => sum + Number(s.price), 0);
                          const savings = Math.max(0, fullPrice - Number(pkg.price));
                          return (
                            <div
                              key={pkg.id}
                              className="p-4 rounded-lg border bg-gradient-to-br from-primary/5 to-transparent"
                              data-testid={`profile-package-${pkg.id}`}
                            >
                              <div className="flex items-start justify-between gap-4 mb-2">
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-semibold flex items-center gap-2" data-testid={`text-profile-package-name-${pkg.id}`}>
                                    {pkg.name}
                                    {savings > 0 && (
                                      <Badge className="bg-green-600 hover:bg-green-600 text-white text-[10px] uppercase">
                                        {t("profile.save", "Save")} {fmtMoney(savings)}
                                      </Badge>
                                    )}
                                  </h4>
                                  {pkg.description && (
                                    <p className="text-sm text-muted-foreground mt-1">{pkg.description}</p>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-xl font-bold text-primary" data-testid={`text-profile-package-price-${pkg.id}`}>
                                    {fmtMoney(Number(pkg.price))}
                                  </p>
                                  {savings > 0 && (
                                    <p className="text-xs text-muted-foreground line-through">
                                      {fmtMoney(fullPrice)}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-1.5 mt-3">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                  {t("profile.includes", "Includes")}
                                </p>
                                {pkg.services.map((s) => (
                                  <div
                                    key={s.id}
                                    className="flex items-center justify-between text-sm py-1"
                                    data-testid={`profile-package-service-${pkg.id}-${s.id}`}
                                  >
                                    <span className="flex items-center gap-2 min-w-0">
                                      <CheckCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />
                                      <span className="truncate">{s.name}</span>
                                    </span>
                                    <span className="text-muted-foreground text-xs shrink-0 ml-2">
                                      {s.duration} min
                                    </span>
                                  </div>
                                ))}
                              </div>

                              {pkg.duration && (
                                <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5" />
                                  {t("profile.total_duration", "Total duration:")} {pkg.duration} min
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  )}

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
                            } ${!service.isActive ? "opacity-50 grayscale pointer-events-none" : ""}`}
                            onClick={() => service.isActive && setSelectedService(service)}
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
                                  {fmtMoney(service.adminPriceOverride || service.price)}
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
                              {fmtMoney(provider.consultationFee)}
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
              {canBook ? (
              <Card className="sticky top-24 overflow-hidden border-border/60 shadow-sm" data-testid="card-booking-widget">
                <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-6 py-5 border-b">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center">
                      <CalendarIcon className="h-4 w-4 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold">{t("profile.book_appointment")}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground ml-10">
                    {t("profile.book_appointment_subtitle", "Pick a time on the next step")}
                  </p>
                </div>
                <CardContent className="space-y-5 pt-5">
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{t("profile.consultation_fee")}</span>
                      <span className="text-xl font-bold text-primary">
                        {fmtMoney(provider.consultationFee)}
                      </span>
                    </div>
                    {provider.homeVisitFee && (
                      <div className="flex items-center justify-between text-sm pt-3 border-t border-border/60">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Home className="h-3.5 w-3.5" />
                          {t("profile.home_visit", "Home visit")}
                        </span>
                        <span className="font-semibold">{fmtMoney(provider.homeVisitFee)}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("profile.available_visits", "Available visit types")}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="gap-1 font-normal">
                        <Video className="h-3 w-3" />
                        {t("profile.online_consultation")}
                      </Badge>
                      <Badge variant="secondary" className="gap-1 font-normal">
                        <Building2 className="h-3 w-3" />
                        {t("profile.visit_clinic")}
                      </Badge>
                      {provider.homeVisitFee && (
                        <Badge variant="secondary" className="gap-1 font-normal">
                          <Home className="h-3 w-3" />
                          {t("profile.home_visit")}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleBooking}
                    data-testid="button-book-appointment"
                  >
                    {t("profile.book_now")}
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                  <p className="text-center text-[11px] text-muted-foreground -mt-2">
                    {t("profile.next_step_hint", "You'll choose date, time and visit type next")}
                  </p>
                  <WaitlistJoinButton
                    providerId={provider.id}
                    providerName={provider.businessName}
                    serviceId={effectiveService?.id}
                    variant="ghost"
                    className="w-full text-xs"
                  />
                </CardContent>
              </Card>
              ) : (
                <Card className="sticky top-24" data-testid="card-booking-disabled">
                  <CardContent className="py-8 text-center text-muted-foreground space-y-2">
                    <CalendarIcon className="h-10 w-10 mx-auto text-muted" />
                    <p className="text-sm">{t("profile.booking_provider_only")}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
