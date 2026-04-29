import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { ProviderCard, ProviderCardSkeleton } from "@/components/provider-card";
import { SearchBar } from "@/components/search-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SlidersHorizontal, X, Star, MapPin, Search } from "lucide-react";
import type { ProviderWithUser, Category } from "@shared/schema";
import { useCurrency } from "@/lib/currency";

export default function Providers() {
  const { t } = useTranslation();
  const { symbol: currencySymbol } = useCurrency();
  const searchParams = useSearch();
  const params = new URLSearchParams(searchParams);
  const typeParam = params.get("type") || "";
  const locationParam = params.get("location") || "";
  const qParam = params.get("q") || "";

  const [filters, setFilters] = useState({
    q: qParam,
    type: typeParam,
    location: locationParam,
    minRating: 0,
    priceRange: [0, 500] as [number, number],
    homeVisit: false,
    online: false,
    verifiedOnly: false,
  });
  const [debouncedQuery, setDebouncedQuery] = useState({
    q: qParam,
    type: typeParam,
    location: locationParam,
    verifiedOnly: false,
  });
  const [sortBy, setSortBy] = useState("rating");

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedQuery({
        q: filters.q,
        type: filters.type,
        location: filters.location,
        verifiedOnly: filters.verifiedOnly,
      });
    }, 300);
    return () => clearTimeout(id);
  }, [filters.q, filters.type, filters.location, filters.verifiedOnly]);

  const queryString = (() => {
    const sp = new URLSearchParams();
    if (debouncedQuery.q.trim()) sp.set("q", debouncedQuery.q.trim());
    if (debouncedQuery.type && debouncedQuery.type !== "all") sp.set("type", debouncedQuery.type);
    if (debouncedQuery.location.trim()) sp.set("city", debouncedQuery.location.trim());
    if (debouncedQuery.verifiedOnly) sp.set("verifiedOnly", "true");
    const s = sp.toString();
    return s ? `?${s}` : "";
  })();

  const { data: providers, isLoading } = useQuery<ProviderWithUser[]>({
    queryKey: ["/api/providers", queryString],
    queryFn: async () => {
      const res = await fetch(`/api/providers${queryString}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load providers");
      return res.json();
    },
  });

  const { data: categories } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const getPageTitle = () => {
    switch (typeParam) {
      case "physiotherapist":
        return t("providers.physiotherapists", "Physiotherapists");
      case "nurse":
        return t("providers.nurses", "Home Nurses");
      case "doctor":
        return t("providers.doctors", "Doctors");
      default: {
        const cat = (categories ?? []).find((c) => c.slug === typeParam);
        if (cat) return cat.name;
        return t("providers.healthcare_providers", "Healthcare Providers");
      }
    }
  };

  const getServiceLabel = (type: string) => {
    return t(`common_service_type.${type}`, type);
  };

  const getPageDescription = () => {
    switch (typeParam) {
      case "physiotherapist":
        return t("providers.physio_desc", "Find certified physiotherapists");
      case "nurse":
        return t("providers.nurse_desc", "Book professional home nurses");
      case "doctor":
        return t("providers.doctor_desc", "Connect with qualified doctors");
      default:
        return t("providers.generic_desc", "Find trusted healthcare professionals in your area");
    }
  };

  const filteredProviders = providers?.filter((p) => {
    if (filters.minRating && Number(p.rating) < filters.minRating) return false;
    if (filters.priceRange) {
      const fee = Number(p.consultationFee);
      if (fee < filters.priceRange[0] || fee > filters.priceRange[1]) return false;
    }
    if (filters.homeVisit && !p.homeVisitFee) return false;
    return true;
  });

  const sortedProviders = filteredProviders?.sort((a, b) => {
    switch (sortBy) {
      case "rating":
        return Number(b.rating) - Number(a.rating);
      case "price-low":
        return Number(a.consultationFee) - Number(b.consultationFee);
      case "price-high":
        return Number(b.consultationFee) - Number(a.consultationFee);
      case "experience":
        return (b.yearsExperience || 0) - (a.yearsExperience || 0);
      default:
        return 0;
    }
  });

  const FilterContent = () => (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label className="text-sm font-medium">{t("common.search")}</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("providers.search_placeholder", "Name, specialty, language…")}
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            className="pl-9"
            data-testid="filter-search-q"
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium">{t("providers.service_type")}</Label>
        <Select
          value={filters.type || "all"}
          onValueChange={(value) => setFilters({ ...filters, type: value })}
        >
          <SelectTrigger data-testid="filter-service-type">
            <SelectValue placeholder={t("providers.all_types")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("providers.all_services")}</SelectItem>
            {(categories ?? []).map((c) => (
              <SelectItem key={c.id} value={c.slug} data-testid={`filter-type-option-${c.slug}`}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium">{t("providers.location")}</Label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("providers.enter_city")}
            value={filters.location}
            onChange={(e) => setFilters({ ...filters, location: e.target.value })}
            className="pl-9"
            data-testid="filter-location"
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium">{t("providers.min_rating")}</Label>
        <div className="flex flex-wrap items-center gap-2">
          {[0, 3, 4, 4.5].map((rating) => (
            <Button
              key={rating}
              variant={filters.minRating === rating ? "default" : "outline"}
              size="sm"
              onClick={() => setFilters({ ...filters, minRating: rating })}
              className="flex items-center gap-1 px-2.5"
              data-testid={`filter-rating-${rating}`}
            >
              {rating === 0 ? t("providers.any_rating") : (
                <>
                  <Star className="h-3 w-3 fill-current shrink-0" />
                  <span>{rating}+</span>
                </>
              )}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium">
          {t("providers.price_range")}: {currencySymbol}{filters.priceRange[0]} - {currencySymbol}{filters.priceRange[1]}
        </Label>
        <Slider
          value={filters.priceRange}
          onValueChange={(value) => setFilters({ ...filters, priceRange: value as [number, number] })}
          min={0}
          max={500}
          step={10}
          className="w-full"
          data-testid="filter-price-range"
        />
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium">{t("providers.visit_type")}</Label>
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="homeVisit"
              checked={filters.homeVisit}
              onCheckedChange={(checked) => setFilters({ ...filters, homeVisit: !!checked })}
              data-testid="filter-home-visit"
            />
            <label htmlFor="homeVisit" className="text-sm cursor-pointer">
              {t("providers.home_visit_available")}
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="online"
              checked={filters.online}
              onCheckedChange={(checked) => setFilters({ ...filters, online: !!checked })}
              data-testid="filter-online"
            />
            <label htmlFor="online" className="text-sm cursor-pointer">
              {t("providers.online_consultation")}
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="verifiedOnly"
              checked={filters.verifiedOnly}
              onCheckedChange={(checked) => setFilters({ ...filters, verifiedOnly: !!checked })}
              data-testid="filter-verified-only"
            />
            <label htmlFor="verifiedOnly" className="text-sm cursor-pointer">
              {t("providers.verified_only", "Verified providers only")}
            </label>
          </div>
        </div>
      </div>

      <Button
        variant="outline"
        className="w-full"
        onClick={() => setFilters({
          q: "",
          type: "",
          location: "",
          minRating: 0,
          priceRange: [0, 500],
          homeVisit: false,
          online: false,
          verifiedOnly: false,
        })}
        data-testid="button-clear-filters"
      >
        <X className="h-4 w-4 mr-2" />
        {t("providers.clear_filters")}
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        <section className="py-8 md:py-12 bg-gradient-to-b from-muted/50 to-background">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center space-y-4">
              <h1 className="text-3xl md:text-4xl font-semibold">{getPageTitle()}</h1>
              <p className="text-muted-foreground">{getPageDescription()}</p>
              <SearchBar variant="compact" className="max-w-2xl mx-auto" />
            </div>
          </div>
        </section>

        <section className="py-8">
          <div className="container mx-auto px-4">
            <div className="flex flex-col lg:flex-row gap-8">
              <aside className="hidden lg:block w-64 flex-shrink-0">
                <div className="sticky top-24 bg-card rounded-lg border p-6">
                  <h2 className="font-semibold mb-4">{t("providers.filters")}</h2>
                  <FilterContent />
                </div>
              </aside>

              <div className="flex-1">
                <div className="flex items-center justify-between gap-4 mb-6">
                  <p className="text-muted-foreground" data-testid="text-results-count">
                    {isLoading ? t("providers.loading") : t("providers.results_found", { count: sortedProviders?.length || 0 })}
                  </p>
                  
                  <div className="flex items-center gap-2">
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button variant="outline" size="sm" className="lg:hidden" data-testid="button-mobile-filters">
                          <SlidersHorizontal className="h-4 w-4 mr-2" />
                          {t("providers.filters")}
                        </Button>
                      </SheetTrigger>
                      <SheetContent side="left" className="w-80">
                        <SheetHeader>
                          <SheetTitle>{t("providers.filters")}</SheetTitle>
                        </SheetHeader>
                        <div className="mt-6">
                          <FilterContent />
                        </div>
                      </SheetContent>
                    </Sheet>

                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger className="w-[160px]" data-testid="select-sort">
                        <SelectValue placeholder={t("providers.sort_by")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rating">{t("providers.top_rated")}</SelectItem>
                        <SelectItem value="price-low">{t("providers.price_low_high")}</SelectItem>
                        <SelectItem value="price-high">{t("providers.price_high_low")}</SelectItem>
                        <SelectItem value="experience">{t("providers.most_experienced")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {isLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <ProviderCardSkeleton key={i} />
                    ))}
                  </div>
                ) : sortedProviders && sortedProviders.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {sortedProviders.map((provider) => (
                      <ProviderCard
                        key={provider.id}
                        provider={provider}
                        nextAvailable="Today, 3:00 PM"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
                      <SlidersHorizontal className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t("providers.no_providers")}</h3>
                    <p className="text-muted-foreground mb-4">
                      {t("providers.adjust_filters")}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setFilters({
                        type: "",
                        location: "",
                        minRating: 0,
                        priceRange: [0, 500],
                        homeVisit: false,
                        online: false,
                        verifiedOnly: false,
                      })}
                      data-testid="button-reset-filters"
                    >
                      {t("providers.reset_filters")}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
