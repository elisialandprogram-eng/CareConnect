import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AvatarMD } from "@/components/ui/provider-image";
import { Star, MapPin, Clock, CheckCircle, Video, Home, Heart, MessageSquare, Zap, LayoutGrid } from "lucide-react";
import { motion } from "framer-motion";
import type { ProviderWithUser, ReviewWithPatient } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { showErrorModal } from "@/components/error-modal";
import { getProviderCardPrice, type ProviderPriceDisplay } from "@/lib/currency";

interface ProviderCardProps {
  provider: ProviderWithUser;
  nextAvailable?: string;
}

export function ProviderCard({ provider, nextAvailable }: ProviderCardProps) {
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const canBook = !user || user.role === "patient";
  const { toast } = useToast();
  const isPatient = isAuthenticated && user?.role === "patient";

  // Prices are shown in the provider's own country currency so a patient
  // browsing in any language always sees the provider's local denomination.
  const providerCountry = (provider as any).countryCode as string | undefined;

  // Price label — strictly derived from minServicePrice (lowest active service
  // price, batch-computed server-side). consultationFee is NOT used here so the
  // card always reflects what patients will actually pay for a listed service.
  // null minServicePrice → provider has no active services → "Contact for prices".
  const minServicePrice = (provider as any).minServicePrice;
  const serviceCount: number = (provider as any).serviceCount ?? 0;
  const priceLabel = useMemo<ProviderPriceDisplay>(
    () => getProviderCardPrice(minServicePrice, providerCountry),
    [minServicePrice, providerCountry],
  );

  // avgResponseMinutes comes from the providers list batch aggregate; no extra
  // per-card fetch needed when browsing the listing.
  const avgResponseMinutes: number | null =
    (provider as any).avgResponseMinutes ?? null;

  // savedRes is user-specific — must remain a per-card query
  const { data: savedRes } = useQuery<{ saved: boolean }>({
    queryKey: ["/api/saved-providers", provider.id, "status"],
    queryFn: async () => {
      const r = await fetch(`/api/saved-providers/${provider.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
      });
      if (!r.ok) return { saved: false };
      return r.json();
    },
    enabled: isPatient,
  });
  const isSaved = savedRes?.saved === true;

  // Top review — only fetched when the provider has reviews; uses staleTime to
  // prevent repeated trips while scrolling a long list.
  const { data: reviewList } = useQuery<ReviewWithPatient[]>({
    queryKey: [`/api/providers/${provider.id}/reviews`],
    enabled: Number(provider.totalReviews) > 0,
    staleTime: 300_000,
  });
  const topReview = reviewList && reviewList.length > 0 ? reviewList[0] : null;

  const toggleSavedMutation = useMutation({
    mutationFn: async () => {
      const method = isSaved ? "DELETE" : "POST";
      const res = await apiRequest(method, `/api/saved-providers/${provider.id}`);
      if (!res.ok && res.status !== 204) {
        throw new Error("Failed to update saved status");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-providers", provider.id, "status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/saved-providers"] });
      toast({
        title: isSaved
          ? t("provider_card.removed_from_saved", "Removed from saved")
          : t("provider_card.added_to_saved", "Added to your saved providers"),
      });
    },
    onError: () => {
      showErrorModal({ title: t("common.error", "Error"), description: t("provider_card.save_failed", "Could not update saved providers"), context: "provider-card.save" });
    },
  });

  const formatResponseTime = (minutes: number) => {
    if (minutes < 60) return t("provider_card.responds_in_minutes", "{{minutes}} min", { minutes });
    const hours = Math.round(minutes / 60);
    if (hours < 24) return t("provider_card.responds_in_hours", "{{hours}}h", { hours });
    const days = Math.round(hours / 24);
    return t("provider_card.responds_in_days", "{{days}}d", { days });
  };
  const getCategoryColor = (category: string | undefined): string => {
    if (!category) return "bg-muted text-muted-foreground border-border";
    if (category.includes("Medical Doctors")) return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200 border-green-200 dark:border-green-800";
    if (category.includes("Mental Health")) return "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200 border-violet-200 dark:border-violet-800";
    if (category.includes("Nutrition")) return "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-200 border-lime-200 dark:border-lime-800";
    if (category.includes("Physical Therapy")) return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 border-blue-200 dark:border-blue-800";
    if (category.includes("Dental")) return "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200 border-sky-200 dark:border-sky-800";
    if (category.includes("Alternative")) return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border-amber-200 dark:border-amber-800";
    if (category.includes("Nursing")) return "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200 border-pink-200 dark:border-pink-800";
    return "bg-muted text-muted-foreground border-border";
  };

  const isClinic = (provider as any).accountType === "clinic";
  const clinicName = (provider as any).clinicName as string | undefined;
  const cardDisplayTitle = (provider as any).displayTitle as string | undefined;
  const providerSubcategory = (provider as any).providerSubcategory as string | undefined;
  const providerCategory = (provider as any).providerCategory as string | undefined;
  // Prepend short academic titles (e.g. "Dr.") to the name for a polished look
  const baseFullName = `${provider.user.firstName ?? ""} ${provider.user.lastName ?? ""}`.trim();
  const prefixedName = cardDisplayTitle && cardDisplayTitle.length <= 8 && cardDisplayTitle.endsWith(".")
    ? `${cardDisplayTitle} ${baseFullName}`
    : baseFullName;
  const displayName = isClinic && clinicName ? clinicName : prefixedName;

  const getInitials = () => {
    if (isClinic && clinicName) {
      const parts = clinicName.trim().split(/\s+/);
      return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "CL";
    }
    return `${provider.user.firstName?.charAt(0) || ""}${provider.user.lastName?.charAt(0) || ""}`.toUpperCase();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -2 }}
      className="h-full"
    >
      <Card 
        className="overflow-hidden card-interactive border-2 border-transparent hover:border-primary/20 h-full flex flex-col" 
        data-testid={`card-provider-${provider.id}`}
      >
        <CardContent className="p-0 flex-1 flex flex-col">
          <div className="p-5 flex flex-col flex-1 gap-4">
            <div className="flex items-start gap-4">
              <motion.div whileHover={{ scale: 1.05 }} transition={{ type: "spring", stiffness: 300 }}>
                <AvatarMD
                  src={provider.user.avatarUrl}
                  name={displayName}
                  className="border-2 border-primary/20 shadow-lg"
                />
              </motion.div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-lg truncate" data-testid={`text-provider-name-${provider.id}`}>
                    {displayName}
                  </h3>
                  {isClinic && (
                    <Badge variant="outline" className="text-[10px] gap-1 border-primary/40 text-primary">
                      Clinic
                    </Badge>
                  )}
                  {provider.isVerified && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.2, type: "spring" }}
                      data-testid={`badge-verified-${provider.id}`}
                    >
                      <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 flex items-center gap-1 px-2 py-0.5">
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span className="text-xs font-semibold">Verified</span>
                      </Badge>
                    </motion.div>
                  )}
                  {isPatient && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-8 w-8 -mr-1 -mt-1"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleSavedMutation.mutate();
                      }}
                      disabled={toggleSavedMutation.isPending}
                      aria-label={isSaved
                        ? t("provider_card.unsave", "Remove from saved")
                        : t("provider_card.save", "Save provider")}
                      data-testid={`button-save-${provider.id}`}
                    >
                      <Heart
                        className={`h-5 w-5 transition-colors ${isSaved ? "fill-red-500 text-red-500" : "text-muted-foreground"}`}
                      />
                    </Button>
                  )}
                </div>
                {/* Sub-Category — exactly what the provider selected */}
                {providerSubcategory && (
                  <p className="text-xs text-muted-foreground font-medium mt-0.5" data-testid={`text-subcategory-${provider.id}`}>
                    {providerSubcategory}
                  </p>
                )}
                {/* Display Title badge — exactly what the provider selected */}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {cardDisplayTitle && (
                    <Badge variant="secondary" className={`text-xs font-medium border ${getCategoryColor(providerCategory)}`} data-testid={`badge-displaytitle-${provider.id}`}>
                      {cardDisplayTitle}
                    </Badge>
                  )}
                  {provider.yearsExperience && provider.yearsExperience > 0 && (
                    <span className="text-xs text-muted-foreground font-medium">
                      {provider.yearsExperience}+ yrs exp.
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star 
                      key={i} 
                      className={`h-4 w-4 ${i < Math.round(Number(provider.rating)) ? 'fill-yellow-400 text-yellow-400' : 'fill-muted text-muted'}`} 
                    />
                  ))}
                </div>
                <span className="font-semibold">{Number(provider.rating).toFixed(1)}</span>
                <span className="text-muted-foreground">({provider.totalReviews})</span>
              </div>
              {provider.user.city && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span className="truncate max-w-[120px]">{provider.user.city}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap text-sm">
              {(() => {
                const modes: string[] = (provider as any).serviceModes ?? [];
                const modeConfigs = [
                  { key: "online", icon: Video, label: "Online" },
                  { key: "home_visit", icon: Home, label: "Home Visit" },
                  { key: "clinic_visit", icon: MapPin, label: "Clinic" },
                ];
                const homeRadiusKm: number | null = (provider as any).maxTravelDistanceKm ?? null;
                const toShow = modeConfigs.filter((m) => modes.includes(m.key));
                return toShow.map(({ key, icon: Icon, label }) => (
                  <div key={key} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/5 text-primary">
                    <Icon className="h-4 w-4" />
                    <span className="font-medium">
                      {label}
                      {key === "home_visit" && homeRadiusKm && homeRadiusKm > 0 && (
                        <span className="text-muted-foreground font-normal ml-1 text-xs">({homeRadiusKm}km)</span>
                      )}
                    </span>
                  </div>
                ));
              })()}
              {avgResponseMinutes !== null && avgResponseMinutes !== undefined && (
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                  data-testid={`response-time-${provider.id}`}
                  title={t("provider_card.avg_response_time", "Average response time")}
                >
                  <Zap className="h-4 w-4" />
                  <span className="font-medium">{formatResponseTime(avgResponseMinutes)}</span>
                </div>
              )}
            </div>

            {topReview && topReview.comment && (
              <div
                className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs space-y-1"
                data-testid={`review-preview-${provider.id}`}
              >
                <div className="flex items-center gap-1 text-amber-500">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`h-3 w-3 ${i < topReview.rating ? "fill-amber-400 text-amber-400" : "fill-muted text-muted"}`}
                    />
                  ))}
                </div>
                <p className="text-muted-foreground line-clamp-2 italic">
                  "{topReview.comment}"
                </p>
                <p className="text-[11px] text-muted-foreground">
                  — {topReview.patient?.firstName ?? t("common.patient", "Patient")}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t mt-auto">
              <div data-testid={`price-${provider.id}`}>
                {priceLabel.kind === "from" && (
                  <>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      {t("provider_card.from_label", "Starting at")}
                    </p>
                    <p className="text-2xl font-bold text-primary" data-testid={`text-price-${provider.id}`}>
                      {priceLabel.text}
                    </p>
                  </>
                )}
                {priceLabel.kind === "free" && (
                  <p className="text-2xl font-bold text-emerald-600" data-testid={`text-price-${provider.id}`}>
                    {t("provider_card.free", "Free")}
                  </p>
                )}
                {priceLabel.kind === "contact" && (
                  <p className="text-sm font-semibold text-muted-foreground leading-tight" data-testid={`text-price-${provider.id}`}>
                    {t("provider_card.contact_for_pricing", "Contact provider for prices and services")}
                  </p>
                )}
                {serviceCount > 0 && (
                  <div
                    className="flex items-center gap-1 mt-1"
                    data-testid={`service-count-${provider.id}`}
                  >
                    <LayoutGrid className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {serviceCount === 1
                        ? t("provider_card.service_count_one", "1 service available")
                        : t("provider_card.service_count_many", "{{count}} services available", { count: serviceCount })}
                    </span>
                  </div>
                )}
              </div>
              <div className="text-right">
                {nextAvailable && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                    <Clock className="h-3 w-3" />
                    <span>Next: {nextAvailable}</span>
                  </div>
                )}
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
                  <Button asChild className="rounded-xl shadow-md glow" data-testid={`button-book-${provider.id}`}>
                    <Link href={`/provider/${provider.id}`}>{canBook ? t("profile.book_now") : t("common.view_profile")}</Link>
                  </Button>
                </motion.div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function ProviderCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 rounded-full bg-muted animate-pulse shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-3/4 bg-muted rounded animate-pulse" />
            <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
            <div className="h-6 w-28 bg-muted rounded-full animate-pulse" />
          </div>
        </div>
        <div className="flex justify-between">
          <div className="h-4 w-32 bg-muted rounded animate-pulse" />
          <div className="h-4 w-24 bg-muted rounded animate-pulse" />
        </div>
        <div className="flex gap-3">
          <div className="h-8 w-20 bg-muted rounded-full animate-pulse" />
          <div className="h-8 w-24 bg-muted rounded-full animate-pulse" />
        </div>
        <div className="flex justify-between items-center pt-4 border-t">
          <div className="h-8 w-16 bg-muted rounded animate-pulse" />
          <div className="h-10 w-24 bg-muted rounded-xl animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
}
