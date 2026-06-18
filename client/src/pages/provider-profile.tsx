import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useQuery } from "@tanstack/react-query";
import { QK } from "@/lib/query-keys";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProfileHeroImage, GalleryThumbnail, AvatarSM } from "@/components/ui/provider-image";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, MapPin, Clock, CheckCircle, Video, Home, GraduationCap, Award, Languages, Calendar as CalendarIcon, ChevronRight, Building2, ShieldCheck, Briefcase, Landmark, Share2, Image as ImageIcon } from "lucide-react";
import { WaitlistJoinButton } from "@/components/waitlist-join-button";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { useToast } from "@/hooks/use-toast";
import type { ProviderWithServices, Service, ReviewWithPatient, ServicePackageWithServices } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { getProviderDisplayPrice, formatInCurrency } from "@/lib/currency";

interface GalleryImage {
  id: string;
  imageUrl: string;
  caption: string | null;
  sortOrder: number;
}

function ProviderGallerySection({ providerId }: { providerId: string }) {
  const { t } = useTranslation();
  const { data: images = [] } = useQuery<GalleryImage[]>({
    queryKey: QK.providerGalleryById(providerId),
    enabled: !!providerId,
  });

  if (images.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-primary" />
          {t("profile.gallery", "Gallery")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((img, idx) => (
            <div key={img.id} className="flex flex-col gap-1">
              <GalleryThumbnail
                src={img.imageUrl}
                alt={img.caption ?? `Gallery photo ${idx + 1}`}
                caption={null}
                data-testid={`img-gallery-${img.id}`}
              />
              {img.caption && (
                <p className="text-xs text-muted-foreground truncate" data-testid={`text-gallery-caption-${img.id}`}>
                  {img.caption}
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function VerifiedCredentialsSection({ providerId }: { providerId: string }) {
  const { data: credentials = [], isLoading } = useQuery<any[]>({
    queryKey: QK.providerPublicCredentials(providerId!),
    queryFn: () => fetch(`/api/providers/${providerId}/credentials`).then(r => r.ok ? r.json() : []),
  });

  if (isLoading) return null;
  if (!credentials || credentials.length === 0) return null;

  const CRED_LABELS: Record<string, string> = {
    // canonical snake_case keys returned by the API
    medical_license:           "Medical / Professional License",
    academic_degree:           "Academic Degree / Diploma",
    specialization_certificate:"Specialization Certificate",
    professional_membership:   "Professional Membership",
    extra_certification:       "Additional Certification",
    // legacy / alternate keys
    license:                   "Professional License",
    degree:                    "Academic Degree / Diploma",
    certification:             "Certification",
    other:                     "Credential",
  };

  return (
    <Card data-testid="card-verified-credentials">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Award className="h-5 w-5 text-primary" />
          Verified Credentials
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {credentials.map((cred: any) => (
            <div key={cred.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40" data-testid={`cred-${cred.id}`}>
              <GraduationCap className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{cred.title}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {CRED_LABELS[cred.credentialType] ?? cred.credentialType?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                  </Badge>
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs gap-1">
                    <CheckCircle className="h-3 w-3" />Verified
                  </Badge>
                </div>
                {(cred.licenseNumber || cred.issuingBody) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {cred.issuingBody && <span>{cred.issuingBody}</span>}
                    {cred.licenseNumber && cred.issuingBody && " · "}
                    {cred.licenseNumber && <span>#{cred.licenseNumber}</span>}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProviderProfile() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const canBook = !user || user.role === "patient";

  const { data: provider, isLoading: providerLoading } = useQuery<ProviderWithServices>({
    queryKey: QK.provider(id!),
    enabled: !!id,
  });

  const { add: trackRecentlyViewed } = useRecentlyViewed();
  useEffect(() => {
    if (provider?.id) trackRecentlyViewed(provider.id);
  }, [provider?.id, trackRecentlyViewed]);

  const { data: reviews } = useQuery<ReviewWithPatient[]>({
    queryKey: QK.providerReviewsById(id!),
    enabled: !!id,
  });

  const { data: providerPackages = [] } = useQuery<ServicePackageWithServices[]>({
    queryKey: QK.providerPackagesById(id!),
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

  const providerNativeCur = (provider as any).countryCode === "HU" ? "HUF"
    : (provider as any).countryCode === "IR" ? "IRR"
    : "USD";

  const isClinic = (provider as any).accountType === "clinic";
  const clinicName = (provider as any).clinicName as string | undefined;
  const displayName = isClinic && clinicName
    ? clinicName
    : `${provider.user.firstName ?? ""} ${provider.user.lastName ?? ""}`.trim();

  const getInitials = () => {
    if (isClinic && clinicName) {
      const parts = clinicName.trim().split(/\s+/);
      return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "CL";
    }
    return `${provider.user.firstName?.charAt(0) || ""}${provider.user.lastName?.charAt(0) || ""}`.toUpperCase();
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "physician":        return t("common.physicians", "Medical Doctors & Specialists");
      case "mental_health":    return t("common.mental_health_pros", "Mental Health & Behavioral Professionals");
      case "nutrition":        return t("common.nutrition_pros", "Nutrition, Dietetics & Metabolic Wellness");
      case "rehabilitation":   return t("common.rehabilitation_pros", "Physical Therapy & Rehabilitation");
      case "dental":           return t("common.dental_pros", "Dental Care Professionals");
      case "alternative_medicine": return t("common.alternative_medicine_pros", "Alternative, Holistic & Integrative Medicine");
      case "nursing":          return t("common.nursing_pros", "Maternal, Nursing & Allied Health Support");
      default: return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  };

  // Derive which visit modes this provider offers.
  // serviceModes[] is the canonical source — no legacy locationMode fallbacks.
  const providerServiceModes: string[] = Array.isArray((provider as any).serviceModes)
    ? (provider as any).serviceModes
    : [];
  const offersOnline = providerServiceModes.includes("telemedicine");
  const offersHome = providerServiceModes.includes("home_visit");
  const offersClinic = providerServiceModes.includes("clinic_visit");

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <PageBreadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: t("common.providers", "Providers"), href: "/providers" },
              { label: displayName },
            ]}
            fallback="/providers"
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card data-testid="card-provider-header">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row gap-6">
                    <ProfileHeroImage
                      src={provider.user.avatarUrl}
                      name={`${provider.user.firstName ?? ""} ${provider.user.lastName ?? ""}`.trim()}
                    />

                    <div className="flex-1 space-y-3">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-semibold" data-testid="text-provider-display-name">
                              {displayName}
                            </h1>
                            {isClinic && (
                              <Badge variant="outline" className="text-xs border-primary/40 text-primary">
                                Clinic
                              </Badge>
                            )}
                            {provider.isVerified && (
                              <CheckCircle className="h-5 w-5 text-primary" />
                            )}
                          </div>
                          {/* Sub-Category — exactly what the provider selected */}
                          {(provider.providerSubcategory || provider.specialization) && (
                            <p className="text-muted-foreground" data-testid="text-provider-subcategory">
                              {provider.providerSubcategory || provider.specialization}
                            </p>
                          )}
                          {/* Display Title badge — exactly what the provider selected */}
                          {(provider as any).displayTitle && (
                            <div className="mt-1">
                              <Badge variant="secondary" className="text-sm" data-testid="badge-provider-displaytitle">
                                {(provider as any).displayTitle}
                              </Badge>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-sm border-muted-foreground/30 text-muted-foreground">
                            {getTypeLabel(provider.providerType)}
                          </Badge>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              const url = window.location.href;
                              const title = `${displayName} – ${provider.specialization || ""}`.trim();
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

                      {/* Practitioners block — data now lives in the practitioners table,
                          fetched separately via /api/providers/:id/practitioners */}
                      {Array.isArray((provider as any).practitioners) && (provider as any).practitioners.length > 0 && (
                        <div className="mt-2 space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("profile.our_specialists")}</p>
                          <div className="flex flex-wrap gap-2">
                            {(provider as any).practitioners.map((p: any, i: number) => (
                              <Badge key={p.id ?? i} variant="outline" className="bg-muted/30">
                                {p.name}{p.specialization ? ` (${p.specialization})` : ""}
                              </Badge>
                            ))}
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
                        {offersOnline && (
                          <Badge variant="outline" className="gap-1">
                            <Video className="h-3 w-3" />
                            {t("profile.online_consultation")}
                          </Badge>
                        )}
                        {offersClinic && (
                          <Badge variant="outline" className="gap-1">
                            <Building2 className="h-3 w-3" />
                            {t("profile.visit_clinic")}
                          </Badge>
                        )}
                        {offersHome && (
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
                  <ProviderGallerySection providerId={provider.id} />

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

                    {(provider.primaryServiceLocation || (provider as any).maxTravelDistanceKm) && (
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <MapPin className="h-5 w-5 text-primary mt-0.5" />
                            <div className="space-y-1.5">
                              <h4 className="font-medium">{t("profile.service_area", "Service Area")}</h4>
                              {provider.primaryServiceLocation && (
                                <p className="text-sm text-muted-foreground">{provider.primaryServiceLocation}</p>
                              )}
                              {(provider as any).maxTravelDistanceKm && Number((provider as any).maxTravelDistanceKm) > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <Home className="h-3.5 w-3.5 text-primary" />
                                  <span className="text-sm text-muted-foreground">
                                    {t("profile.home_visit_radius", "Home visits up to")} <strong>{(provider as any).maxTravelDistanceKm} km</strong>
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                  </div>

                  <VerifiedCredentialsSection providerId={provider.id} />

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
                                        {t("profile.save", "Save")} {formatInCurrency(savings, providerNativeCur)}
                                      </Badge>
                                    )}
                                  </h4>
                                  {pkg.description && (
                                    <p className="text-sm text-muted-foreground mt-1">{pkg.description}</p>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-xl font-bold text-primary" data-testid={`text-profile-package-price-${pkg.id}`}>
                                    {formatInCurrency(Number(pkg.price), providerNativeCur)}
                                  </p>
                                  {savings > 0 && (
                                    <p className="text-xs text-muted-foreground line-through">
                                      {formatInCurrency(fullPrice, providerNativeCur)}
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
                                  {formatInCurrency(Number(service.adminPriceOverride ?? service.price), service.currency ?? providerNativeCur)}
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
                          {(() => {
                            const dp = getProviderDisplayPrice(
                              (provider as any).minServicePrice,
                              null,
                              (provider as any).countryCode,
                            );
                            if (dp.kind === "contact") return (
                              <div className="mt-4 p-4 bg-muted rounded-lg">
                                <p className="font-medium text-foreground">{t("profile.contact_for_pricing", "Contact for pricing")}</p>
                              </div>
                            );
                            return (
                              <div className="mt-4 p-4 bg-muted rounded-lg">
                                <p className="font-medium text-foreground">{t("profile.starting_price", "Starting price")}</p>
                                <p className="text-2xl font-semibold text-foreground mt-1">
                                  {dp.kind === "free" ? t("profile.free", "Free") : dp.text}
                                </p>
                              </div>
                            );
                          })()}
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
                              <AvatarSM
                                src={review.patient.avatarUrl}
                                name={`${review.patient.firstName ?? ""} ${review.patient.lastName ?? ""}`.trim()}
                              />
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
                    {(() => {
                      const dp = getProviderDisplayPrice(
                        (provider as any).minServicePrice,
                        provider.services as any,
                        (provider as any).countryCode,
                      );
                      return (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            {t("profile.from_price", "Starting at")}
                          </span>
                          <span className="text-xl font-bold text-primary">
                            {dp.kind === "from"
                              ? dp.text
                              : dp.kind === "free"
                              ? t("profile.free", "Free")
                              : t("profile.contact_for_pricing", "Contact for pricing")}
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("profile.available_visits", "Available visit types")}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {offersOnline && (
                        <Badge variant="secondary" className="gap-1 font-normal">
                          <Video className="h-3 w-3" />
                          {t("profile.online_consultation")}
                        </Badge>
                      )}
                      {offersClinic && (
                        <Badge variant="secondary" className="gap-1 font-normal">
                          <Building2 className="h-3 w-3" />
                          {t("profile.visit_clinic")}
                        </Badge>
                      )}
                      {offersHome && (
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
                    providerName={displayName}
                    serviceId={selectedService?.id}
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
