import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star, MapPin, Clock, CheckCircle, Video, Home, Heart, MessageSquare, Zap } from "lucide-react";
import { motion } from "framer-motion";
import type { ProviderWithUser, ReviewWithPatient } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/lib/currency";

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
  const { format: fmtMoney } = useCurrency();

  // Lightweight extras only fetched when the card is on screen
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

  const { data: responseTime } = useQuery<{ minutes: number | null }>({
    queryKey: [`/api/providers/${provider.id}/response-time`],
  });

  const { data: reviewList } = useQuery<ReviewWithPatient[]>({
    queryKey: [`/api/providers/${provider.id}/reviews`],
    enabled: Number(provider.totalReviews) > 0,
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
      toast({ title: t("common.error", "Error"), description: t("provider_card.save_failed", "Could not update saved providers"), variant: "destructive" });
    },
  });

  const formatResponseTime = (minutes: number) => {
    if (minutes < 60) return t("provider_card.responds_in_minutes", "{{minutes}} min", { minutes });
    const hours = Math.round(minutes / 60);
    if (hours < 24) return t("provider_card.responds_in_hours", "{{hours}}h", { hours });
    const days = Math.round(hours / 24);
    return t("provider_card.responds_in_days", "{{days}}d", { days });
  };
  const getTypeLabel = (type: string) => {
    return t(`common_service_type.${type}`);
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "physiotherapist":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-200 dark:border-blue-800";
      case "nurse":
        return "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200 border-pink-200 dark:border-pink-800";
      case "doctor":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 dark:border-green-800";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getInitials = () => {
    return `${provider.user.firstName?.charAt(0) || ""}${provider.user.lastName?.charAt(0) || ""}`.toUpperCase();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -4 }}
    >
      <Card 
        className="overflow-hidden card-interactive border-2 border-transparent hover:border-primary/20" 
        data-testid={`card-provider-${provider.id}`}
      >
        <CardContent className="p-0">
          <div className="p-5 space-y-4">
            <div className="flex items-start gap-4">
              <motion.div whileHover={{ scale: 1.05 }} transition={{ type: "spring", stiffness: 300 }}>
                <Avatar className="h-18 w-18 border-3 border-primary/20 shadow-lg">
                  <AvatarImage src={provider.user.avatarUrl || undefined} alt={provider.user.firstName} />
                  <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground text-xl font-semibold">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
              </motion.div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-lg truncate">
                    {provider.user.firstName} {provider.user.lastName}
                  </h3>
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
                <p className="text-sm text-muted-foreground font-medium">{provider.specialization}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary" className={`text-xs font-medium border ${getTypeColor(provider.providerType)}`}>
                    {getTypeLabel(provider.providerType)}
                  </Badge>
                  {provider.yearsExperience && provider.yearsExperience > 0 && (
                    <span className="text-xs text-muted-foreground font-medium">
                      {provider.yearsExperience}+ years exp.
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

            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/5 text-primary">
                <Video className="h-4 w-4" />
                <span className="font-medium">Online</span>
              </div>
              {provider.homeVisitFee && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/5 text-primary">
                  <Home className="h-4 w-4" />
                  <span className="font-medium">Home Visit</span>
                </div>
              )}
              {responseTime?.minutes !== null && responseTime?.minutes !== undefined && (
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                  data-testid={`response-time-${provider.id}`}
                  title={t("provider_card.avg_response_time", "Average response time")}
                >
                  <Zap className="h-4 w-4" />
                  <span className="font-medium">{formatResponseTime(responseTime.minutes)}</span>
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

            <div className="flex items-center justify-between pt-4 border-t">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Starting from</p>
                <p className="text-2xl font-bold text-primary">{fmtMoney(provider.consultationFee)}</p>
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
          <div className="h-18 w-18 rounded-full bg-muted animate-pulse" />
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
