import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star, MapPin, Clock, CheckCircle, Video, Home } from "lucide-react";
import { motion } from "framer-motion";
import type { ProviderWithUser } from "@shared/schema";

interface ProviderCardProps {
  provider: ProviderWithUser;
  nextAvailable?: string;
}

export function ProviderCard({ provider, nextAvailable }: ProviderCardProps) {
  const { t } = useTranslation();
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
                    >
                      <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                    </motion.div>
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
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Starting from</p>
                <p className="text-2xl font-bold text-primary">${Number(provider.consultationFee).toFixed(0)}</p>
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
                    <Link href={`/provider/${provider.id}`}>Book Now</Link>
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
