import { useTranslation } from "react-i18next";
import { useQueries } from "@tanstack/react-query";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, Clock, X } from "lucide-react";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import type { ProviderWithUser } from "@shared/schema";

export function RecentlyViewedProviders() {
  const { t } = useTranslation();
  const { ids, clear } = useRecentlyViewed();

  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["/api/providers", id] as const,
      enabled: !!id,
    })),
  });

  const providers = queries
    .map((q) => q.data as ProviderWithUser | undefined)
    .filter((p): p is ProviderWithUser => !!p);

  if (ids.length === 0 || providers.length === 0) return null;

  return (
    <section className="py-12 bg-background" data-testid="section-recently-viewed">
      <div className="container mx-auto px-4">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold" data-testid="heading-recently-viewed">
              {t("recently_viewed.title", "Recently viewed")}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("recently_viewed.subtitle", "Pick up where you left off")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clear}
            data-testid="button-clear-recently-viewed"
            className="text-muted-foreground hover-elevate"
          >
            <X className="h-4 w-4 mr-1" />
            {t("recently_viewed.clear", "Clear")}
          </Button>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory">
          {providers.map((provider) => {
            const fullName = `${provider.user.firstName} ${provider.user.lastName}`;
            const initials = `${provider.user.firstName?.[0] ?? ""}${provider.user.lastName?.[0] ?? ""}`.toUpperCase();
            const ratingNum = provider.rating ? Number(provider.rating) : 0;
            const rating = ratingNum > 0 ? ratingNum.toFixed(1) : null;
            return (
              <Link
                key={provider.id}
                href={`/provider/${provider.id}`}
                className="snap-start shrink-0"
                data-testid={`card-recent-provider-${provider.id}`}
              >
                <Card className="w-64 hover-elevate active-elevate-2 cursor-pointer h-full">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={provider.user.avatarUrl ?? undefined} alt={fullName} />
                        <AvatarFallback>{initials || "?"}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate" data-testid={`text-recent-name-${provider.id}`}>
                          {fullName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {provider.specialization}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      {rating ? (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                          <span className="font-medium text-foreground">{rating}</span>
                          <span>({provider.totalReviews ?? 0})</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">
                          {t("recently_viewed.new_provider", "New")}
                        </span>
                      )}
                      {provider.yearsExperience ? (
                        <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[10px]">
                          <Clock className="h-3 w-3" />
                          {provider.yearsExperience}+ {t("recently_viewed.years", "yrs")}
                        </Badge>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
