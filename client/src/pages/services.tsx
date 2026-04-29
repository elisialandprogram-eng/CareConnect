import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Search, Users, ArrowRight, Tag, Activity, Stethoscope, UserRound, Sparkles } from "lucide-react";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type SubItem = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number | null;
  providerCount: number;
  startingPrice: number | null;
  basePrice: number | null;
};

type CatItem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  subServiceCount: number;
  providerCount: number;
  subServices: SubItem[];
};

const CATEGORY_ICON: Record<string, any> = {
  physiotherapist: Activity,
  doctor: Stethoscope,
  nurse: UserRound,
};

const CATEGORY_COLOR: Record<string, string> = {
  physiotherapist: "from-emerald-500/10 to-emerald-500/0 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  doctor: "from-purple-500/10 to-purple-500/0 text-purple-700 dark:text-purple-300 border-purple-500/20",
  nurse: "from-rose-500/10 to-rose-500/0 text-rose-700 dark:text-rose-300 border-rose-500/20",
};

export default function Services() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const prevTitle = document.title;
    document.title = t("services_browse.meta_title", "Browse all healthcare services - Golden Life");
    let metaEl = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    const prevDesc = metaEl?.content;
    if (!metaEl) {
      metaEl = document.createElement("meta");
      metaEl.name = "description";
      document.head.appendChild(metaEl);
    }
    metaEl.content = t(
      "services_browse.meta_desc",
      "Explore every category and sub-service offered on Golden Life with provider counts and starting prices, then book your preferred professional."
    );
    return () => {
      document.title = prevTitle;
      if (metaEl && prevDesc != null) metaEl.content = prevDesc;
    };
  }, [t]);

  const { data, isLoading } = useQuery<CatItem[]>({
    queryKey: ["/api/browse/services"],
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !data) return data || [];
    return data
      .map((c) => ({
        ...c,
        subServices: c.subServices.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.description || "").toLowerCase().includes(q)
        ),
      }))
      .filter((c) => c.name.toLowerCase().includes(q) || c.subServices.length > 0);
  }, [data, query]);

  const totals = useMemo(() => {
    const cats = filtered?.length ?? 0;
    const subs = filtered?.reduce((n, c) => n + c.subServices.length, 0) ?? 0;
    const providers = filtered?.reduce((n, c) => Math.max(n, c.providerCount), 0) ?? 0;
    return { cats, subs, providers };
  }, [filtered]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <section className="relative bg-gradient-to-b from-primary/5 via-background to-background border-b">
          <div className="container mx-auto px-4 py-10 sm:py-14">
            <div className="max-w-3xl">
              <Badge variant="secondary" className="mb-3" data-testid="badge-services-hero">
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                {t("services_browse.eyebrow", "Service catalog")}
              </Badge>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight" data-testid="heading-services">
                {t("services_browse.title", "Find the right care")}
              </h1>
              <p className="text-muted-foreground mt-2 text-base sm:text-lg">
                {t(
                  "services_browse.subtitle",
                  "Browse every service available on Golden Life — see how many professionals offer it and the starting price before you choose a provider."
                )}
              </p>
              <div className="relative mt-5 max-w-xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("services_browse.search_placeholder", "Search services, e.g. ‘home physiotherapy’")}
                  className="pl-9 h-11"
                  data-testid="input-search-services"
                />
              </div>
              {!isLoading && (
                <div className="flex flex-wrap items-center gap-3 mt-4 text-xs text-muted-foreground">
                  <span data-testid="text-stat-categories">
                    {totals.cats} {t("services_browse.categories", "categories")}
                  </span>
                  <span>·</span>
                  <span data-testid="text-stat-subservices">
                    {totals.subs} {t("services_browse.services", "services")}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-8 sm:py-10">
          {isLoading ? (
            <div className="space-y-8">
              {[0, 1].map((i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="h-7 w-56" />
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[0, 1, 2].map((j) => (
                      <Skeleton key={j} className="h-40 w-full" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed rounded-xl" data-testid="empty-services">
              <Tag className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-lg font-medium">
                {t("services_browse.no_results", "No services match your search")}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {t("services_browse.no_results_hint", "Try a different keyword or clear the search.")}
              </p>
              <Button variant="outline" className="mt-4" onClick={() => setQuery("")} data-testid="button-clear-search">
                {t("services_browse.clear_search", "Clear search")}
              </Button>
            </div>
          ) : (
            <div className="space-y-10">
              {filtered.map((cat) => {
                const Icon = CATEGORY_ICON[cat.slug] || Tag;
                const color = CATEGORY_COLOR[cat.slug] || "from-primary/10 to-primary/0 text-primary border-primary/20";
                return (
                  <div key={cat.id} data-testid={`section-category-${cat.slug}`}>
                    <div className={`flex items-start justify-between gap-3 mb-4 p-4 rounded-xl border bg-gradient-to-r ${color}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-11 w-11 rounded-lg bg-background/80 backdrop-blur flex items-center justify-center shrink-0 border">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-xl font-bold truncate" data-testid={`heading-category-${cat.slug}`}>
                            {cat.name}
                          </h2>
                          {cat.description && (
                            <p className="text-sm text-muted-foreground line-clamp-1">{cat.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3 w-3" /> {cat.providerCount} {t("services_browse.providers_label", "providers")}
                            </span>
                            <span>·</span>
                            <span>{cat.subServiceCount} {t("services_browse.services", "services")}</span>
                          </div>
                        </div>
                      </div>
                      <Link href={`/providers?type=${cat.slug}`}>
                        <Button size="sm" variant="outline" className="shrink-0" data-testid={`button-view-providers-${cat.slug}`}>
                          {t("services_browse.see_providers", "View providers")}
                          <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                      </Link>
                    </div>

                    {cat.subServices.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic" data-testid={`empty-subs-${cat.slug}`}>
                        {t("services_browse.empty_subs", "No services available in this category yet.")}
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {cat.subServices.map((s) => (
                          <Card key={s.id} className="hover-elevate transition-all" data-testid={`card-service-${s.id}`}>
                            <CardHeader className="pb-2">
                              <div className="flex items-start justify-between gap-2">
                                <CardTitle className="text-base leading-tight" data-testid={`text-service-name-${s.id}`}>
                                  {s.name}
                                </CardTitle>
                                <Badge
                                  variant={s.providerCount > 0 ? "default" : "secondary"}
                                  className="text-[10px] shrink-0"
                                  data-testid={`badge-provider-count-${s.id}`}
                                >
                                  <Users className="h-3 w-3 mr-1" />
                                  {s.providerCount}
                                </Badge>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              {s.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2">{s.description}</p>
                              )}
                              <div className="flex items-baseline justify-between gap-2 pt-1">
                                <div>
                                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                    {t("services_browse.starting_from", "Starting from")}
                                  </p>
                                  <p
                                    className="text-xl font-bold text-primary"
                                    data-testid={`text-starting-price-${s.id}`}
                                  >
                                    {s.startingPrice != null
                                      ? `$${s.startingPrice.toFixed(2)}`
                                      : t("services_browse.price_on_request", "On request")}
                                  </p>
                                </div>
                                {s.durationMinutes ? (
                                  <span className="text-xs text-muted-foreground" data-testid={`text-duration-${s.id}`}>
                                    {s.durationMinutes} {t("services_browse.min", "min")}
                                  </span>
                                ) : null}
                              </div>
                              <Link href={`/providers?type=${cat.slug}&subService=${encodeURIComponent(s.id)}`}>
                                <Button
                                  size="sm"
                                  className="w-full"
                                  variant={s.providerCount > 0 ? "default" : "outline"}
                                  disabled={s.providerCount === 0}
                                  data-testid={`button-find-providers-${s.id}`}
                                >
                                  {s.providerCount > 0
                                    ? t("services_browse.find_providers", "Find providers")
                                    : t("services_browse.coming_soon", "Coming soon")}
                                  {s.providerCount > 0 && <ArrowRight className="h-4 w-4 ml-1" />}
                                </Button>
                              </Link>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
