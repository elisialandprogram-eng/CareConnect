import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { QK } from "@/lib/query-keys";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "@/hooks/use-page-title";
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
import { Badge } from "@/components/ui/badge";
import { SlidersHorizontal, X, Star, MapPin, Search, ChevronLeft, ChevronRight, Sparkles, List, Map } from "lucide-react";
import type { ProviderWithUser, Category } from "@shared/schema";
import { useCurrency } from "@/lib/currency";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { useRecommendedProviders } from "@/hooks/use-recommended-providers";
import { ProviderMapView } from "@/components/location/ProviderMapView";

const PAGE_SIZE = 12;

interface ProvidersPage {
  providers: ProviderWithUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function Providers() {
  const { t } = useTranslation();
  usePageTitle(t("providers.meta_title", "Find a Provider"));
  const { symbol: currencySymbol } = useCurrency();

  // searchParams is reactive — wouter re-renders this component whenever the URL changes
  const searchParams = useSearch();
  const urlParams = new URLSearchParams(searchParams);
  const typeParam = urlParams.get("type") || "";
  const locationParam = urlParams.get("location") || "";
  const qParam = urlParams.get("q") || "";

  // Recommended providers (patients only)
  const noActiveSearch = !qParam && !locationParam;
  const { data: recData, isLoading: recLoading } = useRecommendedProviders({
    desiredCategory: typeParam || undefined,
    limit: 4,
    enabled: noActiveSearch,
  });

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

  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");

  // URL is the single source of truth for type / q / location.
  // When the user navigates via the navbar or browser back button,
  // searchParams changes → sync filters and debouncedQuery immediately
  // so the React Query key updates without waiting for the 300 ms debounce.
  useEffect(() => {
    const p = new URLSearchParams(searchParams);
    const newType = p.get("type") || "";
    const newQ = p.get("q") || "";
    const newLocation = p.get("location") || "";
    setFilters((f) => ({ ...f, type: newType, q: newQ, location: newLocation }));
    setDebouncedQuery((d) => ({ ...d, type: newType, q: newQ, location: newLocation }));
    setPage(1);
  }, [searchParams]);

  const [debouncedQuery, setDebouncedQuery] = useState({
    q: qParam,
    type: typeParam,
    location: locationParam,
    verifiedOnly: false,
  });
  const [sortBy, setSortBy] = useState("rating");

  // Debounce only for free-text typing in the filter panel — also reset to page 1
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedQuery((d) => ({
        ...d,
        q: filters.q,
        location: filters.location,
        verifiedOnly: filters.verifiedOnly,
      }));
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [filters.q, filters.location, filters.verifiedOnly]);

  // type changes from the filter dropdown should apply immediately (no debounce)
  useEffect(() => {
    setDebouncedQuery((d) => ({ ...d, type: filters.type }));
    setPage(1);
  }, [filters.type]);

  const queryString = (() => {
    const sp = new URLSearchParams();
    if (debouncedQuery.q.trim()) sp.set("q", debouncedQuery.q.trim());
    if (debouncedQuery.type && debouncedQuery.type !== "all") sp.set("type", debouncedQuery.type);
    if (debouncedQuery.location.trim()) sp.set("city", debouncedQuery.location.trim());
    if (debouncedQuery.verifiedOnly) sp.set("verifiedOnly", "true");
    sp.set("page", String(page));
    sp.set("limit", String(PAGE_SIZE));
    const s = sp.toString();
    return s ? `?${s}` : "";
  })();

  const { data: result, isLoading } = useQuery<ProvidersPage>({
    queryKey: QK.providerSearch(debouncedQuery.type, debouncedQuery.q, debouncedQuery.location, debouncedQuery.verifiedOnly, page),
    queryFn: async () => {
      const res = await fetch(`/api/providers${queryString}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load providers");
      return res.json();
    },
  });

  const allProviders = result?.providers ?? [];
  const totalPages = result?.totalPages ?? 1;
  const totalCount = result?.total ?? 0;

  const { data: categories } = useQuery<Category[]>({
    queryKey: QK.categories(),
  });

  const getPageTitle = () => {
    switch (typeParam) {
      case "physician":
        return t("common.physicians", "Medical Doctors & Specialists");
      case "mental_health":
        return t("common.mental_health_pros", "Mental Health & Behavioral Professionals");
      case "nutrition":
        return t("common.nutrition_pros", "Nutrition, Dietetics & Metabolic Wellness");
      case "rehabilitation":
        return t("common.rehabilitation_pros", "Physical Therapy & Rehabilitation");
      case "dental":
        return t("common.dental_pros", "Dental Care Professionals");
      case "alternative_medicine":
        return t("common.alternative_medicine_pros", "Alternative, Holistic & Integrative Medicine");
      case "nursing":
        return t("common.nursing_pros", "Maternal, Nursing & Allied Health Support");
      default: {
        const cat = (categories ?? []).find((c) => c.slug === typeParam);
        if (cat) return cat.name;
        return t("providers.healthcare_providers", "Healthcare Providers");
      }
    }
  };

  const getPageDescription = () => {
    switch (typeParam) {
      case "physician":
        return t("providers.physician_desc", "Find qualified doctors, specialists and surgeons");
      case "mental_health":
        return t("providers.mental_health_desc", "Connect with psychiatrists, psychologists and therapists");
      case "nutrition":
        return t("providers.nutrition_desc", "Book clinical dietitians and nutrition coaches");
      case "rehabilitation":
        return t("providers.rehabilitation_desc", "Find certified physiotherapists and occupational therapists");
      case "dental":
        return t("providers.dental_desc", "Connect with dentists and oral health specialists");
      case "alternative_medicine":
        return t("providers.alternative_medicine_desc", "Explore acupuncture, naturopathy and holistic care");
      case "nursing":
        return t("providers.nursing_desc", "Book professional nurses and home care specialists");
      default:
        return t("providers.generic_desc", "Find trusted healthcare professionals in your area");
    }
  };

  const filteredProviders = allProviders.filter((p) => {
    if (filters.minRating && Number(p.rating) < filters.minRating) return false;
    if (filters.priceRange) {
      const fee = Number((p as any).minServicePrice ?? 0);
      if (fee < filters.priceRange[0] || fee > filters.priceRange[1]) return false;
    }
    if (filters.homeVisit && !(p as any).serviceModes?.includes("home_visit")) return false;
    return true;
  });

  const sortedProviders = [...filteredProviders].sort((a, b) => {
    switch (sortBy) {
      case "rating":
        return Number(b.rating) - Number(a.rating);
      case "price-low":
        return Number((a as any).minServicePrice ?? 0) - Number((b as any).minServicePrice ?? 0);
      case "price-high":
        return Number((b as any).minServicePrice ?? 0) - Number((a as any).minServicePrice ?? 0);
      case "experience":
        return (b.yearsExperience || 0) - (a.yearsExperience || 0);
      default:
        return 0;
    }
  });

  const clearFilters = () =>
    setFilters({
      q: "",
      type: "",
      location: "",
      minRating: 0,
      priceRange: [0, 500],
      homeVisit: false,
      online: false,
      verifiedOnly: false,
    });

  const FilterContent = () => (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label className="text-sm font-medium">{t("common.search")}</Label>
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
          onValueChange={(value) => setFilters({ ...filters, type: value === "all" ? "" : value })}
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
          <MapPin className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
        onClick={clearFilters}
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
        <div className="container mx-auto px-4">
          <PageBreadcrumbs
            items={[{ label: "Home", href: "/" }, { label: getPageTitle() }]}
            fallback="/"
          />
        </div>
        <section className="py-8 md:py-12 bg-gradient-to-b from-muted/50 to-background">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center space-y-4">
              <h1 className="text-3xl md:text-4xl font-semibold">{getPageTitle()}</h1>
              <p className="text-muted-foreground">{getPageDescription()}</p>
              <SearchBar variant="compact" className="max-w-2xl mx-auto" />
            </div>
          </div>
        </section>

        {/* ── Recommended for you (patients, no active search) ────────────── */}
        {noActiveSearch && (recLoading || (recData?.providers ?? []).length > 0) && (
          <section className="py-6 border-b">
            <div className="container mx-auto px-4">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Recommended for you</h2>
                {recData?.fallbackUsed && (
                  <Badge variant="secondary" className="text-xs">Top rated</Badge>
                )}
              </div>
              {recLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => <ProviderCardSkeleton key={i} />)}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {(recData?.providers ?? []).map((p) => (
                    <div key={p.id} className="relative">
                      <ProviderCard provider={p as ProviderWithUser} nextAvailable="Today" />
                      {p.matchReasons.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1 px-1">
                          {p.matchReasons.slice(0, 2).map((r, i) => (
                            <Badge key={i} variant="outline" className="text-xs py-0 px-1.5 text-muted-foreground">
                              {r}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

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
                {(() => {
                  const chips: { label: string; key: string; onRemove: () => void }[] = [];
                  if (filters.q) chips.push({ label: `"${filters.q}"`, key: "q", onRemove: () => setFilters((f) => ({ ...f, q: "" })) });
                  if (filters.type) chips.push({ label: filters.type, key: "type", onRemove: () => setFilters((f) => ({ ...f, type: "" })) });
                  if (filters.location) chips.push({ label: filters.location, key: "location", onRemove: () => setFilters((f) => ({ ...f, location: "" })) });
                  if (filters.minRating > 0) chips.push({ label: `${filters.minRating}★+`, key: "rating", onRemove: () => setFilters((f) => ({ ...f, minRating: 0 })) });
                  if (filters.homeVisit) chips.push({ label: t("providers.home_visit_available", "Home visit"), key: "homeVisit", onRemove: () => setFilters((f) => ({ ...f, homeVisit: false })) });
                  if (filters.online) chips.push({ label: t("providers.online_consultation", "Online"), key: "online", onRemove: () => setFilters((f) => ({ ...f, online: false })) });
                  if (filters.verifiedOnly) chips.push({ label: t("providers.verified_only", "Verified only"), key: "verified", onRemove: () => setFilters((f) => ({ ...f, verifiedOnly: false })) });
                  if (filters.priceRange[0] > 0 || filters.priceRange[1] < 500) chips.push({ label: `${currencySymbol}${filters.priceRange[0]}–${currencySymbol}${filters.priceRange[1]}`, key: "price", onRemove: () => setFilters((f) => ({ ...f, priceRange: [0, 500] })) });
                  if (chips.length === 0) return null;
                  return (
                    <div className="flex flex-wrap items-center gap-2 mb-4" data-testid="active-filter-chips">
                      <span className="text-xs text-muted-foreground font-medium">{t("providers.active_filters", "Active filters:")} </span>
                      {chips.map((chip) => (
                        <Badge
                          key={chip.key}
                          variant="secondary"
                          className="gap-1 pl-2.5 pr-1.5 py-1 text-xs cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors"
                          data-testid={`chip-filter-${chip.key}`}
                          onClick={chip.onRemove}
                        >
                          {chip.label}
                          <X className="h-3 w-3" />
                        </Badge>
                      ))}
                      <button
                        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                        onClick={clearFilters}
                        data-testid="button-clear-all-chips"
                      >
                        {t("providers.clear_all", "Clear all")}
                      </button>
                    </div>
                  );
                })()}

                <div className="flex items-center justify-between gap-4 mb-6">
                  <p className="text-muted-foreground" data-testid="text-results-count">
                    {isLoading
                      ? t("providers.loading")
                      : t("providers.results_found", { count: totalCount })}
                  </p>

                  <div className="flex items-center gap-2">
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button variant="outline" size="sm" className="lg:hidden relative" data-testid="button-mobile-filters">
                          <SlidersHorizontal className="h-4 w-4 mr-2" />
                          {t("providers.filters")}
                          {(() => {
                            const count = [filters.q, filters.type, filters.location, filters.minRating > 0, filters.homeVisit, filters.online, filters.verifiedOnly, filters.priceRange[0] > 0 || filters.priceRange[1] < 500].filter(Boolean).length;
                            return count > 0 ? (
                              <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center" data-testid="badge-filter-count">{count}</span>
                            ) : null;
                          })()}
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

                    <div className="flex items-center gap-1 rounded-md border p-0.5 bg-muted/40" data-testid="view-mode-toggle">
                      <Button
                        variant={viewMode === "list" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 px-2.5"
                        onClick={() => setViewMode("list")}
                        data-testid="button-view-list"
                        title={t("providers.list_view", "List view")}
                      >
                        <List className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={viewMode === "map" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 px-2.5"
                        onClick={() => setViewMode("map")}
                        data-testid="button-view-map"
                        title={t("providers.map_view", "Map view")}
                      >
                        <Map className="h-4 w-4" />
                      </Button>
                    </div>

                    {viewMode === "list" && (
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
                    )}
                  </div>
                </div>

                {viewMode === "map" ? (
                  <ProviderMapView providers={sortedProviders} isLoading={isLoading} />
                ) : isLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                    {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                      <ProviderCardSkeleton key={i} />
                    ))}
                  </div>
                ) : sortedProviders.length > 0 ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                      {sortedProviders.map((provider) => (
                        <ProviderCard
                          key={provider.id}
                          provider={provider}
                          nextAvailable="Today, 3:00 PM"
                        />
                      ))}
                    </div>

                    {totalPages > 1 && (
                      <div className="flex items-center justify-center gap-2 mt-8" data-testid="pagination-controls">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                          disabled={page <= 1}
                          data-testid="button-prev-page"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          {t("common.previous", "Previous")}
                        </Button>

                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                            let pageNum: number;
                            if (totalPages <= 7) {
                              pageNum = i + 1;
                            } else if (page <= 4) {
                              pageNum = i + 1;
                            } else if (page >= totalPages - 3) {
                              pageNum = totalPages - 6 + i;
                            } else {
                              pageNum = page - 3 + i;
                            }
                            return (
                              <Button
                                key={pageNum}
                                variant={pageNum === page ? "default" : "outline"}
                                size="sm"
                                className="w-9 h-9 p-0"
                                onClick={() => { setPage(pageNum); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                                data-testid={`button-page-${pageNum}`}
                              >
                                {pageNum}
                              </Button>
                            );
                          })}
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                          disabled={page >= totalPages}
                          data-testid="button-next-page"
                        >
                          {t("common.next", "Next")}
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </>
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
                      onClick={clearFilters}
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
