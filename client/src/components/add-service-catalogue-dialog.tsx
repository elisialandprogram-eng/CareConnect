import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Check, Tag, Percent, Clock, Banknote, Loader2, Home, Building2, Video, AlertTriangle, Plus, Send } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrency, SupportedCurrency, formatInCurrency, convertBetweenCurrencies, getCurrencySymbol } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";
import { showErrorModal } from "@/components/error-modal";
import type { SubService } from "@shared/schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId?: string;
}

// 7 canonical category labels — must match categories.name in the database exactly
const CATEGORY_LABELS: Record<string, string> = {
  physician:            "Medical Doctors & Specialists",
  mental_health:        "Mental Health & Behavioral Professionals",
  nutrition:            "Nutrition, Dietetics & Metabolic Wellness",
  rehabilitation:       "Physical Therapy & Rehabilitation",
  dental:               "Dental Care Professionals",
  alternative_medicine: "Alternative, Holistic & Integrative Medicine",
  nursing:              "Maternal, Nursing & Allied Health Support",
};

const CATEGORY_COLORS: Record<string, string> = {
  physician:            "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  mental_health:        "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  nutrition:            "bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200",
  rehabilitation:       "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  dental:               "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  alternative_medicine: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  nursing:              "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
};

const LOCATION_MODE_LABELS: Record<string, string> = {
  both: "Clinic & Home Visit",
  clinic_only: "Clinic Visit Only",
  home_only: "Home Visit Only",
  online_only: "Online Consultation Only",
  clinic_online: "Clinic & Online",
  home_online: "Home & Online",
  all: "All modes (Clinic, Home & Online)",
};


/* ── Price guardrail helper ─────────────────────────────────────── */
type GuardrailResult = "ok" | "below_suggested" | "above_suggested" | "below_min" | "above_max";

function checkGuardrail(priceUSD: number, s: SubService & { minPrice?: any; maxPrice?: any; suggestedMinPrice?: any; suggestedMaxPrice?: any }): GuardrailResult {
  const min = s.minPrice ? Number(s.minPrice) : null;
  const max = s.maxPrice ? Number(s.maxPrice) : null;
  const sMin = s.suggestedMinPrice ? Number(s.suggestedMinPrice) : null;
  const sMax = s.suggestedMaxPrice ? Number(s.suggestedMaxPrice) : null;
  if (!priceUSD || priceUSD <= 0) return "ok";
  if (min !== null && priceUSD < min) return "below_min";
  if (max !== null && priceUSD > max) return "above_max";
  if (sMin !== null && priceUSD < sMin) return "below_suggested";
  if (sMax !== null && priceUSD > sMax) return "above_suggested";
  return "ok";
}

/* ── Propose-service inline form ───────────────────────────────── */
const PROPOSE_EMPTY = { category: "", serviceName: "", description: "", suggestedPrice: "", locationMode: "both" };

function ProposeServiceForm({ category, onClose }: { category?: string; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ ...PROPOSE_EMPTY, category: category ?? "" });

  const propose = useMutation({
    mutationFn: async () => {
      if (!form.category || !form.serviceName.trim()) throw new Error("Category and service name are required");
      const res = await apiRequest("POST", "/api/service-requests", {
        category: form.category,
        serviceName: form.serviceName.trim(),
        description: form.description.trim() || undefined,
        suggestedPrice: form.suggestedPrice ? Number(form.suggestedPrice) : undefined,
        locationMode: form.locationMode,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Proposal submitted", description: "An admin will review your request and get back to you." });
      onClose();
    },
    onError: (e: any) => toast({ title: "Failed to submit", description: e?.message || "Please try again", variant: "destructive" }),
  });

  return (
    <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 space-y-3" data-testid="form-propose-service">
      <div className="flex items-center gap-2">
        <Send className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Propose a new service</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Can't find your service in the catalogue? Submit a proposal and an admin will review it and add it for you.
      </p>

      <div className="grid grid-cols-1 gap-3">
        <div>
          <Label className="text-xs">Category <span className="text-destructive">*</span></Label>
          <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
            <SelectTrigger className="mt-1 rounded-lg h-9 text-sm" data-testid="select-propose-category">
              <SelectValue placeholder="Select category…" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Service name <span className="text-destructive">*</span></Label>
          <Input
            value={form.serviceName}
            onChange={e => setForm(f => ({ ...f, serviceName: e.target.value }))}
            placeholder="e.g. Kinesio Taping"
            className="mt-1 rounded-lg h-9 text-sm"
            data-testid="input-propose-name"
          />
        </div>

        <div>
          <Label className="text-xs">Description (optional)</Label>
          <Textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Brief description of the service…"
            rows={2}
            className="mt-1 rounded-lg text-sm resize-none"
            data-testid="textarea-propose-description"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Suggested price (USD, optional)</Label>
            <div className="relative mt-1">
              <span className="absolute start-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.suggestedPrice}
                onChange={e => setForm(f => ({ ...f, suggestedPrice: e.target.value }))}
                placeholder="0.00"
                className="pl-7 rounded-lg h-9 text-sm"
                data-testid="input-propose-price"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Delivery mode</Label>
            <Select value={form.locationMode} onValueChange={v => setForm(f => ({ ...f, locationMode: v }))}>
              <SelectTrigger className="mt-1 rounded-lg h-9 text-sm" data-testid="select-propose-location">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="both">Clinic &amp; Home</SelectItem>
                <SelectItem value="clinic_only">Clinic Only</SelectItem>
                <SelectItem value="home_only">Home Only</SelectItem>
                <SelectItem value="online_only">Online Only</SelectItem>
                <SelectItem value="all">All modes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={onClose} data-testid="button-propose-cancel">Cancel</Button>
        <Button
          size="sm"
          onClick={() => propose.mutate()}
          disabled={propose.isPending || !form.category || !form.serviceName.trim()}
          data-testid="button-propose-submit"
        >
          {propose.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
          Submit Proposal
        </Button>
      </div>
    </div>
  );
}

/* ── Main dialog ────────────────────────────────────────────────── */
export function AddServiceCatalogueDialog({ open, onOpenChange, providerId }: Props) {
  const { toast } = useToast();
  const { code: preferredCode, format: fmtPrice } = useCurrency();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SubService | null>(null);
  const [price, setPrice] = useState("");
  const [homeVisitFee, setHomeVisitFee] = useState("");
  const [clinicFee, setClinicFee] = useState("");
  const [telemedicineFee, setTelemedicineFee] = useState("");
  const [locationMode, setLocationMode] = useState("both");
  const [duration, setDuration] = useState("30");
  const [bufferBefore, setBufferBefore] = useState("0");
  const [bufferAfter, setBufferAfter] = useState("0");
  const [step, setStep] = useState<"pick" | "configure">("pick");
  const [showAllTypes, setShowAllTypes] = useState(false);
  const [showPropose, setShowPropose] = useState(false);
  const [priceCurrency, setPriceCurrency] = useState<SupportedCurrency>(preferredCode as SupportedCurrency);

  const isWholeNumber = priceCurrency === "HUF" || priceCurrency === "IRR";
  const inputStep = isWholeNumber ? "1" : "0.01";
  const inputPlaceholder = isWholeNumber ? "0" : "0.00";
  const inputSymbol = getCurrencySymbol(priceCurrency);

  const fmtInput = (val: string | number) => formatInCurrency(Number(val) || 0, priceCurrency);
  // PRICE-DRIFT-FIX: No USD conversion on save — prices stored in native currency.
  // toUSDForGuardrail is kept for the guardrail price comparison only (sub_services store limits in USD).
  const toUSDForGuardrail = (val: string) => {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) return n;
    if (priceCurrency === "USD") return n;
    return convertBetweenCurrencies(n, priceCurrency, "USD");
  };
  // Providers must never see USD equivalents — prices are always shown in native currency.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const usdHint = (_val: string): string | null => null;

  const prevCurrencyRef = useRef<SupportedCurrency>(priceCurrency);
  useEffect(() => {
    const prev = prevCurrencyRef.current;
    if (prev === priceCurrency) return;
    const reconv = (val: string) => {
      const n = Number(val);
      if (!n || !val) return val;
      const c = convertBetweenCurrencies(n, prev, priceCurrency);
      const wn = priceCurrency === "HUF" || priceCurrency === "IRR";
      return wn ? String(Math.round(c)) : String(Number(c.toFixed(2)));
    };
    setPrice(v => v ? reconv(v) : v);
    setHomeVisitFee(v => v ? reconv(v) : v);
    setClinicFee(v => v ? reconv(v) : v);
    setTelemedicineFee(v => v ? reconv(v) : v);
    prevCurrencyRef.current = priceCurrency;
  }, [priceCurrency]);

  // Resolve provider category FIRST — sub-services query depends on it.
  const { data: myCategoriesData } = useQuery<{ categories: Array<{ id: string; name: string; slug: string | null }>; hasAdminOverride: boolean }>({
    queryKey: ["/api/provider/my-categories", providerId],
    queryFn: () => fetch("/api/provider/my-categories", { credentials: "include" }).then(r => r.json()),
    enabled: open && !!providerId,
    staleTime: 0,
  });

  const allowedCategories = myCategoriesData?.categories ?? [];
  const hasAdminOverride = myCategoriesData?.hasAdminOverride ?? false;

  // The server is the sole source of truth — returns exactly 1 category per provider
  const myCategory = useMemo((): string | null => {
    return allowedCategories[0]?.slug ?? null;
  }, [allowedCategories]);

  // Fetch sub-services filtered by provider category when known (server-side filter).
  // queryKey includes myCategory so React Query refetches automatically when category resolves.
  const { data: allSubServices = [], isLoading } = useQuery<SubService[]>({
    queryKey: ["/api/sub-services", myCategory ?? "all"],
    queryFn: () => {
      const url = myCategory
        ? `/api/sub-services?providerCategory=${encodeURIComponent(myCategory)}`
        : "/api/sub-services";
      return fetch(url, { credentials: "include" }).then(r => r.json());
    },
    enabled: open,
    staleTime: 0,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return allSubServices.filter(s => {
      // Handle both camelCase (Drizzle) and snake_case (raw SQL) field names
      const active = s.isActive ?? (s as any).is_active ?? true;
      const deleted = s.deletedAt ?? (s as any).deleted_at ?? null;
      if (!active || deleted) return false;

      // Only show services for this provider's category unless "Show all" is on.
      if (!showAllTypes && myCategory) {
        if (s.category !== myCategory) return false;
      }

      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.description || "").toLowerCase().includes(q) ||
        (CATEGORY_LABELS[s.category] || s.category).toLowerCase().includes(q)
      );
    });
  }, [allSubServices, search, myCategory, showAllTypes]);

  const grouped = useMemo(() => {
    const map: Record<string, SubService[]> = {};
    filtered.forEach(s => {
      if (!map[s.category]) map[s.category] = [];
      map[s.category].push(s);
    });
    return map;
  }, [filtered]);

  /* ── Guardrail check for configure step ── */
  const priceUSD = useMemo(() => {
    if (!price || !Number(price)) return 0;
    return toUSDForGuardrail(price);
  }, [price, priceCurrency]);

  const guardrailStatus: GuardrailResult = useMemo(() => {
    if (!selected || !priceUSD) return "ok";
    return checkGuardrail(priceUSD, selected as any);
  }, [selected, priceUSD]);

  const guardrailBanner = () => {
    const s = selected as any;
    if (!s) return null;
    if (guardrailStatus === "below_min") {
      return (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-destructive">Price below minimum</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              The minimum allowed price for this service is {formatInCurrency(Number(s.minPrice), "USD")} (platform minimum). Please increase your price.
            </p>
          </div>
        </div>
      );
    }
    if (guardrailStatus === "above_max") {
      return (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-destructive">Price above maximum</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              The maximum allowed price for this service is {formatInCurrency(Number(s.maxPrice), "USD")} (platform maximum). Please reduce your price.
            </p>
          </div>
        </div>
      );
    }
    if (guardrailStatus === "below_suggested") {
      return (
        <div className="flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-300">Below suggested range</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Suggested minimum is {formatInCurrency(Number(s.suggestedMinPrice), "USD")}. You can proceed, but this may require admin review.
            </p>
          </div>
        </div>
      );
    }
    if (guardrailStatus === "above_suggested") {
      return (
        <div className="flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-300">Above suggested range</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Suggested maximum is {formatInCurrency(Number(s.suggestedMaxPrice), "USD")}. You can proceed, but this may require admin review.
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  const isHardBlocked = guardrailStatus === "below_min" || guardrailStatus === "above_max";

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No service selected");
      const rawPrice = price || String(selected.basePrice || "0");
      // PRICE-DRIFT-FIX: send native currency prices — no USD conversion.
      const payload: Record<string, any> = {
        subServiceId: selected.id,
        name: selected.name,
        description: selected.description || "",
        duration: Number(duration) || selected.durationMinutes || 30,
        price: rawPrice,
        locationMode,
        bufferBefore: Math.min(240, Math.max(0, Number(bufferBefore) || 0)),
        bufferAfter: Math.min(240, Math.max(0, Number(bufferAfter) || 0)),
      };
      if (homeVisitFee && Number(homeVisitFee) > 0) payload.homeVisitFee = homeVisitFee;
      if (clinicFee && Number(clinicFee) > 0) payload.clinicFee = clinicFee;
      if (telemedicineFee && Number(telemedicineFee) > 0) payload.telemedicineFee = telemedicineFee;
      const r = await apiRequest("POST", "/api/services", payload);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers", providerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/me"] });
      toast({
        title: "Service submitted for approval",
        description: "An admin will review it before it becomes visible to clients.",
      });
      handleClose();
    },
    onError: (e: any) => {
      showErrorModal({
        title: "Could not add service",
        description: e?.message || "Please try again",
        context: "add-service-catalogue.save",
      });
    },
  });

  const handleClose = () => {
    setSearch("");
    setSelected(null);
    setPrice("");
    setHomeVisitFee("");
    setClinicFee("");
    setTelemedicineFee("");
    setLocationMode("both");
    setDuration("30");
    setBufferBefore("0");
    setBufferAfter("0");
    setStep("pick");
    setShowPropose(false);
    onOpenChange(false);
  };

  const handleSelect = (s: SubService) => {
    setSelected(s);
    if (s.basePrice && Number(s.basePrice) > 0) {
      const usdVal = Number(s.basePrice);
      const converted = priceCurrency === "USD"
        ? usdVal
        : convertBetweenCurrencies(usdVal, "USD", priceCurrency);
      const wn = priceCurrency === "HUF" || priceCurrency === "IRR";
      setPrice(wn ? String(Math.round(converted)) : String(Number(converted.toFixed(2))));
    } else {
      setPrice("");
    }
    setDuration(String(s.durationMinutes || 30));
    setBufferBefore(String(s.bufferBefore ?? 0));
    setBufferAfter(String(s.bufferAfter ?? 0));
    setStep("configure");
  };

  const handleBack = () => {
    setStep("pick");
    setSelected(null);
    setPrice("");
    setHomeVisitFee("");
    setClinicFee("");
    setTelemedicineFee("");
    setLocationMode("both");
    setDuration("30");
    setBufferBefore("0");
    setBufferAfter("0");
  };

  const categories = Object.keys(grouped).sort();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden" data-testid="dialog-add-service-catalogue">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="h-7 w-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center shrink-0">
              <Tag className="h-4 w-4" />
            </span>
            {step === "pick" ? "Add Service from Catalogue" : "Configure Service"}
          </DialogTitle>
          {step === "pick" && (
            <div className="mt-2 space-y-1.5">
              <p className="text-sm text-muted-foreground">
                Choose a service from the admin catalogue to add to your profile.
              </p>
              {myCategory && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground font-medium">Your category:</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${CATEGORY_COLORS[myCategory] ?? "bg-muted text-muted-foreground"}`}>
                    {CATEGORY_LABELS[myCategory] ?? myCategory}
                  </span>
                  {hasAdminOverride && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">(admin override)</span>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogHeader>

        {step === "pick" ? (
          <>
            <div className="px-6 py-3 border-b shrink-0 space-y-2">
              <div className="relative">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search services…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 rounded-xl"
                  autoFocus
                  data-testid="input-catalogue-search"
                />
              </div>
              {myCategory && (
                <div className="flex items-center gap-2 flex-wrap">
                  {hasAdminOverride && (
                    <Badge variant="secondary" className="text-xs">Admin override</Badge>
                  )}
                  <Badge variant="default" className="text-xs">
                    {CATEGORY_LABELS[myCategory] ?? myCategory}
                  </Badge>
                  {allowedCategories.length > 1 && allowedCategories.slice(1, 5).map(cat => (
                    <Badge key={cat.id} variant="outline" className="text-xs">{cat.name}</Badge>
                  ))}
                  <button
                    onClick={() => setShowAllTypes(v => !v)}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
                    data-testid="button-toggle-all-types"
                  >
                    {showAllTypes ? "Show my category only" : "Show all categories"}
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
              {isLoading ? (
                <div className="flex flex-col gap-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-5">
                  {categories.length === 0 && !showPropose ? (
                    <div className="text-center py-12 text-muted-foreground text-sm">
                      <Tag className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      {search ? "No services match your search." : "No services available in the catalogue yet."}
                    </div>
                  ) : (
                    categories.map(cat => (
                      <div key={cat}>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          {CATEGORY_LABELS[cat] || cat}
                        </p>
                        <div className="space-y-2">
                          {grouped[cat].map(s => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => handleSelect(s)}
                              className="w-full text-left flex items-start gap-3 px-4 py-3 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all group"
                              data-testid={`button-select-service-${s.id}`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{s.name}</span>
                                  <Badge
                                    variant="secondary"
                                    className={`text-[10px] px-1.5 h-4 shrink-0 ${CATEGORY_COLORS[s.category] || ""}`}
                                  >
                                    {CATEGORY_LABELS[s.category] || s.category}
                                  </Badge>
                                  {((s as any).minPrice || (s as any).maxPrice) && (
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                      <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />
                                      ${(s as any).minPrice ?? "0"}–{(s as any).maxPrice ? `$${(s as any).maxPrice}` : "∞"}
                                    </span>
                                  )}
                                </div>
                                {s.description && (
                                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{s.description}</p>
                                )}
                                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                                  {s.basePrice && Number(s.basePrice) > 0 && (
                                    <span className="flex items-center gap-1">
                                      <Banknote className="h-3 w-3" />
                                      Base: {fmtPrice(Number(s.basePrice))}
                                    </span>
                                  )}
                                  {s.durationMinutes && s.durationMinutes > 0 && (
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {s.durationMinutes}min
                                    </span>
                                  )}
                                  {s.taxPercentage && Number(s.taxPercentage) > 0 && (
                                    <span className="flex items-center gap-1">
                                      <Percent className="h-3 w-3" />
                                      Tax: {Number(s.taxPercentage)}%
                                    </span>
                                  )}
                                </div>
                              </div>
                              <Check className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 shrink-0 mt-0.5 transition-opacity" />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}

                  {/* Propose new service section */}
                  {!showPropose ? (
                    <div className="border-t pt-4 mt-2">
                      <button
                        type="button"
                        onClick={() => setShowPropose(true)}
                        className="w-full flex items-center justify-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors py-2 rounded-lg hover:bg-primary/5"
                        data-testid="button-show-propose"
                      >
                        <Plus className="h-4 w-4" />
                        Can't find your service? Propose a new one
                      </button>
                    </div>
                  ) : (
                    <ProposeServiceForm
                      category={myCategory ?? undefined}
                      onClose={() => setShowPropose(false)}
                    />
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="px-6 py-4 border-t shrink-0">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
              {selected && (
                <>
                  {/* Service summary */}
                  <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Tag className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{selected.name}</p>
                        {selected.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{selected.description}</p>
                        )}
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-1.5 h-4 mt-1.5 ${CATEGORY_COLORS[selected.category] || ""}`}
                        >
                          {CATEGORY_LABELS[selected.category] || selected.category}
                        </Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border/50">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Duration</p>
                        <p className="text-sm font-semibold">{selected.durationMinutes || 30} min</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Catalogue Price</p>
                        <p className="text-sm font-semibold">
                          {Number(selected.basePrice || 0) > 0 ? fmtPrice(Number(selected.basePrice)) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Tax (admin)</p>
                        <p className="text-sm font-semibold">
                          {Number(selected.taxPercentage || 0) > 0 ? `${Number(selected.taxPercentage)}%` : "None"}
                        </p>
                      </div>
                    </div>
                    {/* Guardrail range display */}
                    {((selected as any).minPrice || (selected as any).maxPrice || (selected as any).suggestedMinPrice || (selected as any).suggestedMaxPrice) && (
                      <div className="pt-2 border-t border-border/50">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Price Guardrails</p>
                        <div className="flex flex-wrap gap-3 text-xs">
                          {(selected as any).minPrice && (
                            <span className="text-muted-foreground">Hard min: <strong className="text-foreground">${Number((selected as any).minPrice).toFixed(2)}</strong></span>
                          )}
                          {(selected as any).maxPrice && (
                            <span className="text-muted-foreground">Hard max: <strong className="text-foreground">${Number((selected as any).maxPrice).toFixed(2)}</strong></span>
                          )}
                          {(selected as any).suggestedMinPrice && (
                            <span className="text-muted-foreground">Suggested min: <strong className="text-foreground">${Number((selected as any).suggestedMinPrice).toFixed(2)}</strong></span>
                          )}
                          {(selected as any).suggestedMaxPrice && (
                            <span className="text-muted-foreground">Suggested max: <strong className="text-foreground">${Number((selected as any).suggestedMaxPrice).toFixed(2)}</strong></span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Currency selector */}
                  <div className="rounded-xl border bg-muted/30 p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium">Price Currency</p>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Enter prices in your local currency — they'll be saved as USD.
                      </p>
                    </div>
                    <Select
                      value={priceCurrency}
                      onValueChange={v => setPriceCurrency(v as SupportedCurrency)}
                    >
                      <SelectTrigger className="w-28 h-8 text-xs rounded-lg shrink-0" data-testid="select-price-currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">$ USD</SelectItem>
                        <SelectItem value="HUF">Ft HUF</SelectItem>
                        <SelectItem value="IRR">﷼ IRR</SelectItem>
                        <SelectItem value="GBP">£ GBP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Duration */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">
                      Appointment Duration <span className="text-destructive">*</span>
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      How long each session lasts. Pre-filled from the catalogue default.
                    </p>
                    <Select value={duration} onValueChange={setDuration}>
                      <SelectTrigger className="rounded-xl" data-testid="select-service-duration">
                        <SelectValue placeholder="Select duration" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 min</SelectItem>
                        <SelectItem value="20">20 min</SelectItem>
                        <SelectItem value="30">30 min</SelectItem>
                        <SelectItem value="45">45 min</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="75">1 hour 15 min</SelectItem>
                        <SelectItem value="90">1 hour 30 min</SelectItem>
                        <SelectItem value="120">2 hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Your base price */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">
                      Your Base Price <span className="text-destructive">*</span>
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      The base fee you charge for this service (before visit-type fees).
                    </p>
                    <div className="relative">
                      <span className="absolute start-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground leading-none select-none">{inputSymbol}</span>
                      <Input
                        type="number"
                        step={inputStep}
                        min="0"
                        placeholder={inputPlaceholder}
                        value={price}
                        onChange={e => setPrice(e.target.value)}
                        className="pl-9 rounded-xl"
                        autoFocus
                        data-testid="input-service-price"
                      />
                    </div>
                    {usdHint(price) && (
                      <p className="text-[11px] text-muted-foreground">{usdHint(price)}</p>
                    )}
                  </div>

                  {/* Guardrail warning banner */}
                  {price && Number(price) > 0 && guardrailBanner()}

                  {/* Service delivery mode */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">
                      Service Delivery Mode <span className="text-destructive">*</span>
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      How clients can book this service.
                    </p>
                    <Select value={locationMode} onValueChange={setLocationMode}>
                      <SelectTrigger className="rounded-xl" data-testid="select-location-mode">
                        <SelectValue placeholder="Select mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="both">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            Clinic &amp; Home Visit (both)
                          </div>
                        </SelectItem>
                        <SelectItem value="clinic_only">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            Clinic Visit Only
                          </div>
                        </SelectItem>
                        <SelectItem value="home_only">
                          <div className="flex items-center gap-2">
                            <Home className="h-4 w-4" />
                            Home Visit Only
                          </div>
                        </SelectItem>
                        <SelectItem value="online_only">
                          <div className="flex items-center gap-2">
                            <Video className="h-4 w-4" />
                            Online Consultation Only
                          </div>
                        </SelectItem>
                        <SelectItem value="clinic_online">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            Clinic &amp; Online
                          </div>
                        </SelectItem>
                        <SelectItem value="home_online">
                          <div className="flex items-center gap-2">
                            <Home className="h-4 w-4" />
                            Home &amp; Online
                          </div>
                        </SelectItem>
                        <SelectItem value="all">
                          <div className="flex items-center gap-2">
                            <Check className="h-4 w-4" />
                            All modes (Clinic, Home &amp; Online)
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Visit-type fees */}
                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm font-medium">Visit Type Fees (Optional)</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Set additional fees per visit mode. Leave blank if you don't charge extra.
                        Online/telemedicine will only be available if you set a telemedicine fee.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {["home_only", "home_online", "both", "all"].includes(locationMode) && (
                        <div className="space-y-1">
                          <Label className="text-xs flex items-center gap-1.5 text-muted-foreground">
                            <Home className="h-3.5 w-3.5" /> Home Visit Fee
                          </Label>
                          <div className="relative">
                            <span className="absolute start-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground leading-none select-none">{inputSymbol}</span>
                            <Input
                              type="number"
                              step={inputStep}
                              min="0"
                              placeholder={inputPlaceholder}
                              value={homeVisitFee}
                              onChange={e => setHomeVisitFee(e.target.value)}
                              className="pl-8 rounded-xl text-sm h-9"
                              data-testid="input-home-visit-fee"
                            />
                          </div>
                          {usdHint(homeVisitFee) && (
                            <p className="text-[11px] text-muted-foreground">{usdHint(homeVisitFee)}</p>
                          )}
                        </div>
                      )}

                      {["clinic_only", "clinic_online", "both", "all"].includes(locationMode) && (
                        <div className="space-y-1">
                          <Label className="text-xs flex items-center gap-1.5 text-muted-foreground">
                            <Building2 className="h-3.5 w-3.5" /> Clinic Fee
                          </Label>
                          <div className="relative">
                            <span className="absolute start-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground leading-none select-none">{inputSymbol}</span>
                            <Input
                              type="number"
                              step={inputStep}
                              min="0"
                              placeholder={inputPlaceholder}
                              value={clinicFee}
                              onChange={e => setClinicFee(e.target.value)}
                              className="pl-8 rounded-xl text-sm h-9"
                              data-testid="input-clinic-fee"
                            />
                          </div>
                          {usdHint(clinicFee) && (
                            <p className="text-[11px] text-muted-foreground">{usdHint(clinicFee)}</p>
                          )}
                        </div>
                      )}

                      <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1.5 text-muted-foreground">
                          <Video className="h-3.5 w-3.5" /> Online / Telemedicine Fee
                          <span className="text-[10px] text-primary">(set to enable online booking)</span>
                        </Label>
                        <div className="relative">
                          <span className="absolute start-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground leading-none select-none">{inputSymbol}</span>
                          <Input
                            type="number"
                            step={inputStep}
                            min="0"
                            placeholder={inputPlaceholder}
                            value={telemedicineFee}
                            onChange={e => setTelemedicineFee(e.target.value)}
                            className="pl-8 rounded-xl text-sm h-9"
                            data-testid="input-telemedicine-fee"
                          />
                        </div>
                        {usdHint(telemedicineFee) && (
                          <p className="text-[11px] text-muted-foreground">{usdHint(telemedicineFee)}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Buffer time */}
                  <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
                    <div>
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Buffer Time
                        <span className="text-xs font-normal text-muted-foreground ml-1">(optional)</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Extra time blocked before/after the appointment — not billed to the patient.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">Before (min)</Label>
                        <p className="text-[11px] text-muted-foreground">e.g. travel time, setup</p>
                        <Select value={bufferBefore} onValueChange={setBufferBefore}>
                          <SelectTrigger className="rounded-lg h-9 text-sm" data-testid="select-buffer-before">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[0, 5, 10, 15, 20, 30, 45, 60].map(n => (
                              <SelectItem key={n} value={String(n)}>{n === 0 ? "None" : `${n} min`}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">After (min)</Label>
                        <p className="text-[11px] text-muted-foreground">e.g. notes, travel</p>
                        <Select value={bufferAfter} onValueChange={setBufferAfter}>
                          <SelectTrigger className="rounded-lg h-9 text-sm" data-testid="select-buffer-after">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[0, 5, 10, 15, 20, 30, 45, 60].map(n => (
                              <SelectItem key={n} value={String(n)}>{n === 0 ? "None" : `${n} min`}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {(Number(bufferBefore) > 0 || Number(bufferAfter) > 0) && (
                      <div className="flex items-center gap-1.5 flex-wrap text-xs bg-background rounded-md border px-3 py-2">
                        {Number(bufferBefore) > 0 && (
                          <span className="rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 font-medium">
                            Buffer {bufferBefore} min
                          </span>
                        )}
                        {Number(bufferBefore) > 0 && <span className="text-muted-foreground">+</span>}
                        <span className="rounded bg-primary/10 text-primary px-1.5 py-0.5 font-medium">
                          Duration {duration} min
                        </span>
                        {Number(bufferAfter) > 0 && <span className="text-muted-foreground">+</span>}
                        {Number(bufferAfter) > 0 && (
                          <span className="rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 font-medium">
                            Buffer {bufferAfter} min
                          </span>
                        )}
                        <span className="text-muted-foreground">=</span>
                        <span className="font-semibold">{Number(bufferBefore) + Number(duration) + Number(bufferAfter)} min slot</span>
                      </div>
                    )}
                  </div>

                  {/* Price summary */}
                  {price && Number(price) > 0 && (
                    <div className="rounded-xl border bg-primary/5 p-3 space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Price summary</p>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Base price</span>
                        <span className="font-medium">{fmtInput(price)}</span>
                      </div>
                      {["home_only", "home_online", "both", "all"].includes(locationMode) && homeVisitFee && Number(homeVisitFee) > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-1"><Home className="h-3 w-3" />Home visit fee</span>
                          <span className="font-medium">+{fmtInput(homeVisitFee)}</span>
                        </div>
                      )}
                      {["clinic_only", "clinic_online", "both", "all"].includes(locationMode) && clinicFee && Number(clinicFee) > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" />Clinic fee</span>
                          <span className="font-medium">+{fmtInput(clinicFee)}</span>
                        </div>
                      )}
                      {telemedicineFee && Number(telemedicineFee) > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-1"><Video className="h-3 w-3" />Online fee</span>
                          <span className="font-medium">+{fmtInput(telemedicineFee)}</span>
                        </div>
                      )}
                      {selected.taxPercentage && Number(selected.taxPercentage) > 0 && (
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>+ Tax ({Number(selected.taxPercentage)}%)</span>
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                        Delivery mode: <strong>{LOCATION_MODE_LABELS[locationMode]}</strong>
                        {locationMode !== "online_only" && telemedicineFee && Number(telemedicineFee) > 0 ? " + Online available" : ""}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            <DialogFooter className="px-6 py-4 border-t shrink-0 flex gap-2">
              <Button variant="outline" onClick={handleBack} disabled={addMutation.isPending}>
                ← Back
              </Button>
              <Button
                className="flex-1"
                disabled={!price || addMutation.isPending || isHardBlocked}
                onClick={() => addMutation.mutate()}
                data-testid="button-confirm-add-service"
              >
                {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isHardBlocked ? "Fix price to continue" : "Add Service"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
