import { useState, useEffect, useRef } from "react";
import { formatDateTime } from "@/lib/datetime";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { showErrorModal } from "@/components/error-modal";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Upload, X, Info, Check, Pencil, Trash2, History, User, Clock, TrendingUp, TrendingDown, Minus, ChevronDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Service, SubService } from "@shared/schema";
import { useCurrency, SupportedCurrency, formatInCurrency, convertBetweenCurrencies, getCurrencySymbol } from "@/lib/currency";

const PROVIDER_TYPE_OPTIONS = [
  { value: "physician",            label: "Medical Doctors & Specialists" },
  { value: "mental_health",        label: "Mental Health & Behavioral Professionals" },
  { value: "nutrition",            label: "Nutrition, Dietetics & Metabolic Wellness" },
  { value: "rehabilitation",       label: "Physical Therapy & Rehabilitation" },
  { value: "dental",               label: "Dental Care Professionals" },
  { value: "alternative_medicine", label: "Alternative, Holistic & Integrative Medicine" },
  { value: "nursing",              label: "Maternal, Nursing & Allied Health Support" },
];

const CALENDAR_COLORS = [
  "#10b981",
  "#06b6d4",
  "#f59e0b",
  "#ec4899",
  "#3b82f6",
  "#000000",
];

const DURATION_OPTIONS = [
  { value: "15", label: "15m" },
  { value: "30", label: "30m" },
  { value: "45", label: "45m" },
  { value: "60", label: "1h" },
  { value: "90", label: "1h 30m" },
  { value: "120", label: "2h" },
];

const SLOT_OPTIONS = [
  { value: "0", label: "Default" },
  { value: "15", label: "15m" },
  { value: "30", label: "30m" },
  { value: "60", label: "1h" },
];

const BUFFER_CHIPS = [0, 5, 10, 15, 20, 30, 45, 60];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: Service | null;
  providerId?: string;
  adminMode?: boolean;
  providerType?: string;
  /**
   * When true, the catalog/sub-service category is read-only (display-only) and
   * the inline "add new" / "edit" / "delete" controls for catalog rows are
   * hidden. Use for the provider dashboard, where providers can override
   * pricing on assigned services but must NOT be able to mutate the global
   * catalog.
   */
  lockCategory?: boolean;
}

function fmt(val: string | number | null | undefined): string {
  const n = Number(val);
  if (val == null || val === "" || !Number.isFinite(n)) return "—";
  return formatInCurrency(n, "USD");
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return formatDateTime(d, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) || String(d);
}

function PriceDelta({ prev, curr }: { prev: string | null | undefined; curr: string | null | undefined }) {
  const p = Number(prev ?? 0);
  const c = Number(curr ?? 0);
  if (!Number.isFinite(p) || !Number.isFinite(c) || p === c) return null;
  const diff = c - p;
  const up = diff > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${up ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}{formatInCurrency(Math.abs(diff), "USD")}
    </span>
  );
}

interface PriceHistoryPanelProps {
  history: any[];
  isLoading: boolean;
  currentPrice: string;
}

function PriceHistoryPanel({ history, isLoading, currentPrice }: PriceHistoryPanelProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 py-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border p-4 animate-pulse bg-muted/30 h-24" />
        ))}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3" data-testid="empty-price-history">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <History className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">No price changes recorded yet</p>
        <p className="text-xs text-muted-foreground/70">Every time a price is saved, an entry will appear here.</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-1 mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {history.length} change{history.length !== 1 ? "s" : ""} — most recent first
        </p>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400"><TrendingDown className="h-3 w-3" /> = decrease</span>
          <span className="mx-1">·</span>
          <span className="inline-flex items-center gap-0.5 text-destructive"><TrendingUp className="h-3 w-3" /> = increase</span>
        </div>
      </div>
      <ScrollArea className="h-[340px] pr-2">
        <div className="space-y-3" data-testid="list-price-history">
          {history.map((entry: any, idx: number) => {
            const prev = history[idx + 1];
            const authorName = entry.changedByFirstName
              ? `${entry.changedByFirstName} ${entry.changedByLastName}`.trim()
              : entry.changedByEmail ?? "System";
            const role: string = entry.changedByRole ?? "";
            const roleLabel = role === "admin" ? "Admin" : role === "provider" ? "Provider" : role || "—";
            const isLatest = idx === 0;
            return (
              <div
                key={entry.id}
                className={`rounded-lg border p-4 space-y-3 ${isLatest ? "border-primary/40 bg-primary/5" : "bg-muted/20"}`}
                data-testid={`entry-price-history-${entry.id}`}
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-7 w-7 rounded-full bg-muted border flex items-center justify-center shrink-0">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm font-medium truncate cursor-default" data-testid={`text-changed-by-${entry.id}`}>
                            {authorName}
                          </span>
                        </TooltipTrigger>
                        {entry.changedByEmail && (
                          <TooltipContent side="top">
                            <p>{entry.changedByEmail}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 ml-1">{roleLabel}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                    <Clock className="h-3 w-3" />
                    <span data-testid={`text-changed-at-${entry.id}`}>{fmtDate(entry.changedAt)}</span>
                    {isLatest && <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-1">Latest</Badge>}
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                  <div data-testid={`text-ph-base-${entry.id}`}>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Base price</p>
                    <p className="text-sm font-semibold flex items-center gap-1">
                      {fmt(entry.price)}
                      {prev && <PriceDelta prev={prev.price} curr={entry.price} />}
                    </p>
                  </div>
                  <div data-testid={`text-ph-home-${entry.id}`}>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Home visit fee</p>
                    <p className="text-sm font-semibold flex items-center gap-1">
                      {fmt(entry.homeVisitFee)}
                      {prev && <PriceDelta prev={prev.homeVisitFee} curr={entry.homeVisitFee} />}
                    </p>
                  </div>
                  <div data-testid={`text-ph-clinic-${entry.id}`}>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Clinic fee</p>
                    <p className="text-sm font-semibold flex items-center gap-1">
                      {fmt(entry.clinicFee)}
                      {prev && <PriceDelta prev={prev.clinicFee} curr={entry.clinicFee} />}
                    </p>
                  </div>
                  <div data-testid={`text-ph-tele-${entry.id}`}>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Telemedicine fee</p>
                    <p className="text-sm font-semibold flex items-center gap-1">
                      {fmt(entry.telemedicineFee)}
                      {prev && <PriceDelta prev={prev.telemedicineFee} curr={entry.telemedicineFee} />}
                    </p>
                  </div>
                  <div data-testid={`text-ph-emergency-${entry.id}`}>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Emergency fee</p>
                    <p className="text-sm font-semibold flex items-center gap-1">
                      {fmt(entry.emergencyFee)}
                      {prev && <PriceDelta prev={prev.emergencyFee} curr={entry.emergencyFee} />}
                    </p>
                  </div>
                  {entry.platformFeeOverride != null && (
                    <div data-testid={`text-ph-platform-${entry.id}`}>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Platform fee override</p>
                      <p className="text-sm font-semibold">{fmt(entry.platformFeeOverride)}</p>
                    </div>
                  )}
                </div>

                {entry.reason && (
                  <div className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1.5 flex items-start gap-1.5" data-testid={`text-ph-reason-${entry.id}`}>
                    <Minus className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{entry.reason}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </TooltipProvider>
  );
}

export function ServiceFormDialog({ open, onOpenChange, service, providerId, adminMode, providerType, lockCategory }: Props) {
  const { code } = useCurrency();
  const { t } = useTranslation();

  const priceCurrency: SupportedCurrency = adminMode ? "USD" : ((code as SupportedCurrency) || "USD");
  const isWholeNumber = priceCurrency === "HUF" || priceCurrency === "IRR";
  const inputStep = isWholeNumber ? "1" : "0.01";
  const inputPlaceholder = isWholeNumber ? "0" : "0.00";
  const inputSymbol = getCurrencySymbol(priceCurrency);

  // Providers must never see USD equivalents — prices are always shown in native currency.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const usdHint = (_v: string): string | null => null;
  const { toast } = useToast();
  const isEdit = !!service;

  const subServicesQueryKey = providerType && !adminMode
    ? [`/api/sub-services?category=${providerType}`]
    : ["/api/sub-services"];

  const { data: allSubServices = [] } = useQuery<SubService[]>({
    queryKey: subServicesQueryKey,
    queryFn: () => fetch(subServicesQueryKey[0], { credentials: "include" }).then(r => r.json()),
    enabled: open,
    staleTime: 60_000,
  });

  const subServices = allSubServices;

  const { data: priceHistory = [], isLoading: historyLoading } = useQuery<any[]>({
    queryKey: ["/api/services", service?.id, "price-history"],
    queryFn: () =>
      fetch(`/api/services/${service!.id}/price-history`, { credentials: "include" }).then((r) => r.json()),
    enabled: open && isEdit && !!service?.id,
    staleTime: 60_000,
  });

  const [imageUrl, setImageUrl] = useState("");
  const [color, setColor] = useState(CALENDAR_COLORS[0]);
  const [name, setName] = useState("");
  const [subServiceId, setSubServiceId] = useState("");
  const [price, setPrice] = useState("");
  const [enableDeposit, setEnableDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [duration, setDuration] = useState("30");
  const [slotLength, setSlotLength] = useState("0");
  const [bufferBefore, setBufferBefore] = useState("0");
  const [bufferAfter, setBufferAfter] = useState("0");
  const [customDuration, setCustomDuration] = useState(false);
  const [hidePrice, setHidePrice] = useState(false);
  const [hideDuration, setHideDuration] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [homeVisitFee, setHomeVisitFee] = useState("0");
  const [clinicFee, setClinicFee] = useState("0");
  const [telemedicineFee, setTelemedicineFee] = useState("0");
  const [emergencyFee, setEmergencyFee] = useState("0");
  const [locationMode, setLocationMode] = useState("both");
  const [maxPatientsPerDay, setMaxPatientsPerDay] = useState("");
  const [uploading, setUploading] = useState(false);

  // Per-service availability hours: { clinic?, home?, online? } each with {start, end} or null
  type SvcHours = { start: string; end: string } | null;
  const [availabilityHours, setAvailabilityHours] = useState<{
    clinic: SvcHours; home: SvcHours; online: SvcHours;
  }>({ clinic: null, home: null, online: null });

  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryType, setNewCategoryType] = useState<string>("physician");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingCategoryType, setEditingCategoryType] = useState<string>("physician");
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (open) {
      if (service) {
        setImageUrl(service.imageUrl || "");
        setColor(service.calendarColor || CALENDAR_COLORS[0]);
        setName(service.name || "");
        setSubServiceId(service.subServiceId || "");
        // Prices are now stored in native currency — load them directly (no fromUSD conversion).
        const toStr = (v: string | number | null | undefined) => {
          const n = Number(v ?? 0);
          return n > 0 ? (isWholeNumber ? String(Math.round(n)) : String(Number(n.toFixed(2)))) : "";
        };
        setPrice(toStr(service.price));
        setEnableDeposit(!!service.enableDeposit);
        setDepositAmount(toStr(service.depositAmount));
        setDuration(String(service.duration || 30));
        setSlotLength(String(service.timeSlotLength ?? 0));
        setBufferBefore(String(service.bufferBefore ?? 0));
        setBufferAfter(String(service.bufferAfter ?? 0));
        setCustomDuration(!!service.customDuration);
        setHidePrice(!!service.hidePrice);
        setHideDuration(!!service.hideDuration);
        setIsActive(service.isActive ?? true);
        setHomeVisitFee(toStr(service.homeVisitFee ?? 0));
        setClinicFee(toStr(service.clinicFee ?? 0));
        setTelemedicineFee(toStr(service.telemedicineFee ?? 0));
        setEmergencyFee(toStr(service.emergencyFee ?? 0));
        setLocationMode((service as any).locationMode ?? "both");
        setMaxPatientsPerDay(service.maxPatientsPerDay != null ? String(service.maxPatientsPerDay) : "");
        const ah = (service as any).availabilityHours as any;
        setAvailabilityHours({
          clinic: ah?.clinic ?? null,
          home: ah?.home ?? null,
          online: ah?.online ?? null,
        });
      } else {
        setImageUrl("");
        setColor(CALENDAR_COLORS[0]);
        setName("");
        setSubServiceId("");
        setPrice("");
        setEnableDeposit(false);
        setDepositAmount("");
        setDuration("30");
        setSlotLength("0");
        setBufferBefore("0");
        setBufferAfter("0");
        setCustomDuration(false);
        setHidePrice(false);
        setHideDuration(false);
        setIsActive(true);
        setHomeVisitFee("0");
        setClinicFee("0");
        setTelemedicineFee("0");
        setEmergencyFee("0");
        setLocationMode("both");
        setMaxPatientsPerDay("");
        setAvailabilityHours({ clinic: null, home: null, online: null });
      }
    }
  }, [open, service]);

  // When sub-service is selected on create, auto-fill name
  useEffect(() => {
    if (!isEdit && subServiceId && subServices.length) {
      const s = subServices.find(x => x.id === subServiceId);
      if (s && !name) setName(s.name);
    }
  }, [subServiceId, subServices, isEdit, name]);

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData, credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed");
      setImageUrl(data.url);
    } catch (err: any) {
      showErrorModal({ title: "Upload failed", description: err?.message, context: "service-form.upload" });
    } finally {
      setUploading(false);
    }
  };

  const createCategoryMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/sub-services", {
        name: newCategoryName.trim(),
        category: newCategoryType,
        isActive: true,
      });
      return r.json();
    },
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sub-services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sub-services"] });
      if (providerType) queryClient.invalidateQueries({ queryKey: [`/api/sub-services?category=${providerType}`] });
      if (created?.id) {
        setSubServiceId(created.id);
        if (!name) setName(created.name);
      }
      setShowNewCategory(false);
      setNewCategoryName("");
      toast({ title: "Category added" });
    },
    onError: (e: any) => {
      showErrorModal({ title: "Could not add category", description: e?.message || "Please try again", context: "service-form.create-category" });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async () => {
      if (!editingCategoryId) throw new Error("No category selected");
      const r = await apiRequest("PATCH", `/api/sub-services/${editingCategoryId}`, {
        name: editingCategoryName.trim(),
        category: editingCategoryType,
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sub-services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sub-services"] });
      if (providerType) queryClient.invalidateQueries({ queryKey: [`/api/sub-services?category=${providerType}`] });
      setEditingCategoryId(null);
      setEditingCategoryName("");
      toast({ title: "Category updated" });
    },
    onError: (e: any) => {
      showErrorModal({ title: "Could not update category", description: e?.message || "Please try again", context: "service-form.update-category" });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/sub-services/${id}`);
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sub-services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sub-services"] });
      if (providerType) queryClient.invalidateQueries({ queryKey: [`/api/sub-services?category=${providerType}`] });
      if (subServiceId === id) setSubServiceId("");
      toast({ title: "Category deleted" });
    },
    onError: (e: any) => {
      showErrorModal({ title: "Could not delete category", description: e?.message || "Please try again", context: "service-form.delete-category" });
    },
  });

  const startEditCategory = (s: SubService) => {
    setEditingCategoryId(s.id);
    setEditingCategoryName(s.name);
    setEditingCategoryType(s.category);
    setShowNewCategory(false);
  };

  const requestDeleteCategory = (s: SubService) => {
    if (window.confirm(`Delete category "${s.name}"? This cannot be undone.`)) {
      deleteCategoryMutation.mutate(s.id);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name,
        subServiceId: subServiceId || null,
        // PRICE-DRIFT-FIX: store native values directly — no USD conversion.
        price: price || "0",
        duration: Number(duration) || 30,
        imageUrl: imageUrl || null,
        calendarColor: color,
        enableDeposit,
        depositAmount: enableDeposit ? (depositAmount || "0") : "0",
        timeSlotLength: Number(slotLength) || null,
        bufferBefore: Number(bufferBefore) || 0,
        bufferAfter: Number(bufferAfter) || 0,
        customDuration,
        hidePrice,
        hideDuration,
        isActive,
        homeVisitFee: homeVisitFee || "0",
        clinicFee: clinicFee || "0",
        telemedicineFee: telemedicineFee || "0",
        emergencyFee: emergencyFee || "0",
        locationMode,
        maxPatientsPerDay: maxPatientsPerDay ? Number(maxPatientsPerDay) : null,
        availabilityHours: (availabilityHours.clinic || availabilityHours.home || availabilityHours.online)
          ? {
              ...(availabilityHours.clinic ? { clinic: availabilityHours.clinic } : {}),
              ...(availabilityHours.home ? { home: availabilityHours.home } : {}),
              ...(availabilityHours.online ? { online: availabilityHours.online } : {}),
            }
          : null,
      };
      if (isEdit && service) {
        const url = adminMode
          ? `/api/admin/services/${service.id}`
          : `/api/services/${service.id}`;
        const r = await apiRequest("PATCH", url, payload);
        return r.json();
      } else {
        const sub = subServices.find(x => x.id === subServiceId);
        payload.description = sub?.description || "";
        const url = adminMode && providerId
          ? `/api/admin/providers/${providerId}/services`
          : "/api/services";
        const r = await apiRequest("POST", url, payload);
        return r.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers", providerId] });
      if (adminMode && providerId) {
        queryClient.invalidateQueries({ queryKey: [`/api/admin/providers/${providerId}/services`] });
      }
      toast({ title: isEdit ? "Service updated" : "Service added" });
      onOpenChange(false);
    },
    onError: (e: any) => {
      showErrorModal({ title: "Save failed", description: e?.message || "Please try again", context: "service-form.save" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0" data-testid="dialog-service-form">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
              <Plus className="h-4 w-4" />
            </span>
            {isEdit ? "Edit Service" : "Add Service"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6" data-testid="scroll-service-form">

          <div className="space-y-6 pt-6">
            {/* Image + colors */}
            <div className="flex items-start justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-muted overflow-hidden flex items-center justify-center border">
                  {imageUrl ? (
                    <img src={imageUrl} alt="service" className="h-full w-full object-cover" />
                  ) : (
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <Label className="text-sm font-medium">{t("service_form.image_label")}</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImageUpload(f);
                        }}
                        data-testid="input-service-image"
                      />
                      <Button type="button" size="sm" variant="default" disabled={uploading} asChild>
                        <span>{uploading ? "Uploading..." : "Upload Image"}</span>
                      </Button>
                    </label>
                    {imageUrl && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setImageUrl("")}
                        data-testid="button-remove-image"
                      >
                        remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">{t("service_form.calendar_colors_label")}</Label>
                <div className="flex items-center gap-2 mt-2">
                  {CALENDAR_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className="h-8 w-8 rounded-full flex items-center justify-center border-2"
                      style={{ backgroundColor: c, borderColor: color === c ? c : "transparent" }}
                      data-testid={`button-color-${c}`}
                    >
                      {color === c && <Check className="h-4 w-4 text-white" />}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="h-8 w-8 rounded-full border-2 border-dashed flex items-center justify-center text-muted-foreground hover:bg-accent"
                    onClick={() => {
                      const c = window.prompt("Enter hex color (e.g. #ff5500)", color);
                      if (c) setColor(c);
                    }}
                    data-testid="button-color-custom"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Name + Category */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">{t("service_form.service_name_label")} {!lockCategory || !isEdit ? <span className="text-destructive">*</span> : null}</Label>
                {lockCategory && isEdit ? (
                  <div
                    className="flex h-10 w-full items-center rounded-md border border-input bg-muted/40 px-3 text-sm"
                    data-testid="display-service-name-locked"
                  >
                    {name || <span className="text-muted-foreground">—</span>}
                  </div>
                ) : (
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={t("service_form.service_name_placeholder")}
                    data-testid="input-service-name"
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-sm">{t("service_form.category_label")} <span className="text-destructive">*</span></Label>
                {lockCategory && isEdit ? (
                  <div
                    className="flex h-10 w-full items-center rounded-md border border-input bg-muted/40 px-3 text-sm"
                    data-testid="display-service-category-locked"
                  >
                    {subServices.find((s) => s.id === subServiceId)?.name ?? <span className="text-muted-foreground">—</span>}
                  </div>
                ) : (
                <Select
                  value={subServiceId}
                  onValueChange={(v) => {
                    if (v === "__add_new__") {
                      setShowNewCategory(true);
                      setEditingCategoryId(null);
                      return;
                    }
                    setSubServiceId(v);
                  }}
                >
                  <SelectTrigger data-testid="select-service-category">
                    <SelectValue placeholder={t("service_form.select_category_placeholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {subServices.map(s => (
                      <SelectItem key={s.id} value={s.id} className="pr-2">
                        <div className="flex items-center justify-between gap-2 w-full">
                          <span className="truncate">{s.name}</span>
                          <span className="flex items-center gap-1 shrink-0 ml-2">
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label={`Edit ${s.name}`}
                              data-testid={`button-edit-category-${s.id}`}
                              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                startEditCategory(s);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  startEditCategory(s);
                                }
                              }}
                              className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </span>
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label={`Delete ${s.name}`}
                              data-testid={`button-delete-category-${s.id}`}
                              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                requestDeleteCategory(s);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  requestDeleteCategory(s);
                                }
                              }}
                              className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </span>
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                    <SelectItem value="__add_new__" className="text-primary font-medium" data-testid="select-add-new-category">
                      + Add new category
                    </SelectItem>
                  </SelectContent>
                </Select>
                )}

                {!lockCategory && editingCategoryId && (
                  <div className="rounded-md border bg-muted/30 p-3 space-y-2" data-testid="form-edit-category">
                    <Label className="text-xs text-muted-foreground">Edit category</Label>
                    <Input
                      placeholder="Category name"
                      value={editingCategoryName}
                      onChange={(e) => setEditingCategoryName(e.target.value)}
                      data-testid="input-edit-category-name"
                    />
                    <Select value={editingCategoryType} onValueChange={setEditingCategoryType}>
                      <SelectTrigger data-testid="select-edit-category-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROVIDER_TYPE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2 justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => { setEditingCategoryId(null); setEditingCategoryName(""); }}
                        data-testid="button-cancel-edit-category"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => updateCategoryMutation.mutate()}
                        disabled={updateCategoryMutation.isPending || !editingCategoryName.trim()}
                        data-testid="button-save-edit-category"
                      >
                        {updateCategoryMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>
                )}

                {!lockCategory && showNewCategory && (
                  <div className="rounded-md border bg-muted/30 p-3 space-y-2" data-testid="form-new-category">
                    <Label className="text-xs text-muted-foreground">New category</Label>
                    <Input
                      placeholder="e.g. Sports massage"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      data-testid="input-new-category-name"
                    />
                    <Select value={newCategoryType} onValueChange={setNewCategoryType}>
                      <SelectTrigger data-testid="select-new-category-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROVIDER_TYPE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2 justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => { setShowNewCategory(false); setNewCategoryName(""); }}
                        data-testid="button-cancel-new-category"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => createCategoryMutation.mutate()}
                        disabled={createCategoryMutation.isPending || !newCategoryName.trim()}
                        data-testid="button-save-new-category"
                      >
                        {createCategoryMutation.isPending ? "Adding..." : "Add"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Price + Deposit */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">
                  {t("service_form.price_label")} ({inputSymbol}) <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  step={inputStep}
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder={inputPlaceholder}
                  data-testid="input-service-price"
                />
                {usdHint(price) && (
                  <p className="text-[11px] text-muted-foreground">{usdHint(price)}</p>
                )}
              </div>
              <div className="flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <Label className="text-sm flex items-center gap-2 m-0">
                    <Info className="h-3 w-3 text-muted-foreground" /> Enable Deposit
                  </Label>
                  <Switch checked={enableDeposit} onCheckedChange={setEnableDeposit} data-testid="switch-enable-deposit" />
                </div>
                {enableDeposit && (
                  <div className="space-y-1">
                    <Input
                      type="number"
                      step={inputStep}
                      placeholder={`Deposit amount (${inputSymbol})`}
                      value={depositAmount}
                      onChange={e => setDepositAmount(e.target.value)}
                      data-testid="input-deposit-amount"
                    />
                    {usdHint(depositAmount) && (
                      <p className="text-[11px] text-muted-foreground">{usdHint(depositAmount)}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Duration + Slot Length */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm flex items-center gap-1">
                  <Info className="h-3 w-3 text-muted-foreground" /> Duration <span className="text-destructive">*</span>
                </Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger data-testid="select-duration"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm flex items-center gap-1">
                  <Info className="h-3 w-3 text-muted-foreground" /> Time slot length <span className="text-destructive">*</span>
                </Label>
                <Select value={slotLength} onValueChange={setSlotLength}>
                  <SelectTrigger data-testid="select-slot-length"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SLOT_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Buffer controls */}
            {(() => {
              const bufBeforeNum = Math.min(240, Math.max(0, Number(bufferBefore) || 0));
              const bufAfterNum  = Math.min(240, Math.max(0, Number(bufferAfter) || 0));
              const durNum       = Number(duration) || 30;
              const occupied     = bufBeforeNum + durNum + bufAfterNum;
              const warnBefore   = bufBeforeNum > 0 && bufBeforeNum >= durNum;
              const warnAfter    = bufAfterNum  > 0 && bufAfterNum  >= durNum;
              const errBefore    = Number(bufferBefore) > 240;
              const errAfter     = Number(bufferAfter)  > 240;

              const ChipRow = ({ value, setValue, testId }: { value: string; setValue: (v: string) => void; testId: string }) => (
                <div className="flex flex-wrap gap-1.5">
                  {BUFFER_CHIPS.map(chip => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setValue(String(chip))}
                      data-testid={`${testId}-chip-${chip}`}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        Number(value) === chip
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-muted"
                      }`}
                    >
                      {chip === 0 ? "Off" : `${chip} min`}
                    </button>
                  ))}
                  <Input
                    type="number"
                    min="0"
                    max="240"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    className="w-20 h-7 text-xs px-2"
                    data-testid={testId}
                  />
                </div>
              );

              return (
                <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> Buffer Time
                  </p>

                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      Buffer Before
                      <span className="text-muted-foreground font-normal ml-1">— extra time blocked <em>before</em> appointment (not billed)</span>
                    </Label>
                    <ChipRow value={bufferBefore} setValue={v => setBufferBefore(String(Math.min(240, Math.max(0, Number(v) || 0))))} testId="input-buffer-before" />
                    {errBefore && <p className="text-xs text-destructive mt-1">Maximum buffer is 240 minutes.</p>}
                    {!errBefore && warnBefore && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">⚠ Buffer before ({bufBeforeNum} min) is as long as or longer than the service duration ({durNum} min).</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      Buffer After
                      <span className="text-muted-foreground font-normal ml-1">— extra time blocked <em>after</em> appointment (not billed)</span>
                    </Label>
                    <ChipRow value={bufferAfter} setValue={v => setBufferAfter(String(Math.min(240, Math.max(0, Number(v) || 0))))} testId="input-buffer-after" />
                    {errAfter && <p className="text-xs text-destructive mt-1">Maximum buffer is 240 minutes.</p>}
                    {!errAfter && warnAfter && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">⚠ Buffer after ({bufAfterNum} min) is as long as or longer than the service duration ({durNum} min).</p>
                    )}
                  </div>

                  {/* Occupied slot summary */}
                  <div className="rounded-md bg-background border px-3 py-2 text-xs flex flex-wrap items-center gap-1.5" data-testid="text-occupied-slot">
                    {bufBeforeNum > 0 && (
                      <>
                        <span className="rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 font-medium">
                          Buffer {bufBeforeNum} min
                        </span>
                        <span className="text-muted-foreground">+</span>
                      </>
                    )}
                    <span className="rounded bg-primary/10 text-primary px-1.5 py-0.5 font-medium">
                      Duration {durNum} min
                    </span>
                    {bufAfterNum > 0 && (
                      <>
                        <span className="text-muted-foreground">+</span>
                        <span className="rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 font-medium">
                          Buffer {bufAfterNum} min
                        </span>
                      </>
                    )}
                    <span className="text-muted-foreground">=</span>
                    <span className="font-semibold">{occupied} min occupied slot</span>
                  </div>
                </div>
              );
            })()}

            {/* Custom duration */}
            <div className="flex items-center justify-between rounded-md border px-3 py-2 max-w-xs">
              <Label className="text-sm flex items-center gap-2 m-0">
                <Info className="h-3 w-3 text-muted-foreground" /> Custom Duration
              </Label>
              <Switch checked={customDuration} onCheckedChange={setCustomDuration} data-testid="switch-custom-duration" />
            </div>

            {/* Hide toggles */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-sm m-0">{t("service_form.hide_price_label")}</Label>
                <Switch checked={hidePrice} onCheckedChange={setHidePrice} data-testid="switch-hide-price" />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm m-0">{t("service_form.hide_duration_label")}</Label>
                <Switch checked={hideDuration} onCheckedChange={setHideDuration} data-testid="switch-hide-duration" />
              </div>
            </div>

            <Separator className="my-2" />

            {/* Settings section */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Settings</h3>
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-3">
              <div>
                <Label className="text-sm m-0">{t("service_form.is_active_label")}</Label>
                <p className="text-xs text-muted-foreground">{t("service_form.is_active_desc")}</p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="switch-service-active" />
            </div>

            {/* Service delivery mode */}
            <div className="space-y-2 rounded-md border p-4">
              <div>
                <Label className="text-sm font-medium">Service Delivery Mode</Label>
                <p className="text-xs text-muted-foreground">Which visit types are available for this specific service.</p>
              </div>
              <Select value={locationMode} onValueChange={setLocationMode}>
                <SelectTrigger data-testid="select-service-location-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Clinic &amp; Home</SelectItem>
                  <SelectItem value="clinic_only">Clinic Only</SelectItem>
                  <SelectItem value="home_only">Home Visit Only</SelectItem>
                  <SelectItem value="online_only">Online Only</SelectItem>
                  <SelectItem value="clinic_online">Clinic &amp; Online</SelectItem>
                  <SelectItem value="home_online">Home &amp; Online</SelectItem>
                  <SelectItem value="all">All modes (Clinic · Home · Online)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <div>
                <Label className="text-sm font-medium">Visit-type fees</Label>
                <p className="text-xs text-muted-foreground">Extra fee added on top of the base price for each visit type. Leave at 0 if not applicable.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Home visit ({inputSymbol})</Label>
                  <Input type="number" step={inputStep} value={homeVisitFee} onChange={(e) => setHomeVisitFee(e.target.value)} data-testid="input-home-visit-fee" />
                  {usdHint(homeVisitFee) && <p className="text-[10px] text-muted-foreground mt-0.5">{usdHint(homeVisitFee)}</p>}
                </div>
                <div>
                  <Label className="text-xs">Clinic ({inputSymbol})</Label>
                  <Input type="number" step={inputStep} value={clinicFee} onChange={(e) => setClinicFee(e.target.value)} data-testid="input-clinic-fee" />
                  {usdHint(clinicFee) && <p className="text-[10px] text-muted-foreground mt-0.5">{usdHint(clinicFee)}</p>}
                </div>
                <div>
                  <Label className="text-xs">Telemedicine ({inputSymbol})</Label>
                  <Input type="number" step={inputStep} value={telemedicineFee} onChange={(e) => setTelemedicineFee(e.target.value)} data-testid="input-telemedicine-fee" />
                  {usdHint(telemedicineFee) && <p className="text-[10px] text-muted-foreground mt-0.5">{usdHint(telemedicineFee)}</p>}
                </div>
                <div>
                  <Label className="text-xs">Emergency ({inputSymbol})</Label>
                  <Input type="number" step={inputStep} value={emergencyFee} onChange={(e) => setEmergencyFee(e.target.value)} data-testid="input-emergency-fee" />
                  {usdHint(emergencyFee) && <p className="text-[10px] text-muted-foreground mt-0.5">{usdHint(emergencyFee)}</p>}
                </div>
              </div>
              {!adminMode && priceCurrency !== "USD" && (
                <p className="text-[11px] text-muted-foreground">Values in {priceCurrency} — stored internally in USD.</p>
              )}
            </div>

            <div className="rounded-md border p-4 space-y-2">
              <Label className="text-sm font-medium">Daily capacity</Label>
              <p className="text-xs text-muted-foreground">Max clients per day for this service. Leave empty for no limit.</p>
              <Input
                type="number"
                min="0"
                value={maxPatientsPerDay}
                onChange={(e) => setMaxPatientsPerDay(e.target.value)}
                placeholder="No limit"
                className="max-w-xs"
                data-testid="input-max-patients-per-day"
              />
            </div>

            {/* Availability hours: per-visit-type window override */}
            <div className="rounded-md border p-4 space-y-3">
              <div>
                <Label className="text-sm font-medium">Availability hours</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Limit when this service can be booked for each visit type. Leave empty to use your regular schedule.
                </p>
              </div>
              {(["clinic", "home", "online"] as const).map((vt) => {
                const current = availabilityHours[vt];
                return (
                  <div key={vt} className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex items-center gap-2 w-32 shrink-0">
                      <Switch
                        checked={!!current}
                        onCheckedChange={(on) =>
                          setAvailabilityHours((prev) => ({
                            ...prev,
                            [vt]: on ? { start: "09:00", end: "17:00" } : null,
                          }))
                        }
                        data-testid={`switch-avail-${vt}`}
                      />
                      <Label className="text-sm capitalize m-0">{vt}</Label>
                    </div>
                    {current && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={current.start}
                          onChange={(e) =>
                            setAvailabilityHours((prev) => ({
                              ...prev,
                              [vt]: { ...prev[vt]!, start: e.target.value },
                            }))
                          }
                          className="w-32"
                          data-testid={`input-avail-start-${vt}`}
                        />
                        <span className="text-muted-foreground text-sm">–</span>
                        <Input
                          type="time"
                          value={current.end}
                          onChange={(e) =>
                            setAvailabilityHours((prev) => ({
                              ...prev,
                              [vt]: { ...prev[vt]!, end: e.target.value },
                            }))
                          }
                          className="w-32"
                          data-testid={`input-avail-end-${vt}`}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {isEdit && (
              <div className="rounded-md border" data-testid="section-price-history">
                <button
                  type="button"
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/40 rounded-md"
                  onClick={() => setShowHistory((v) => !v)}
                  data-testid="button-toggle-price-history"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <History className="h-4 w-4 text-muted-foreground" />
                    Price history
                    {priceHistory.length > 0 && (
                      <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">{priceHistory.length}</Badge>
                    )}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showHistory ? "rotate-180" : ""}`} />
                </button>
                {showHistory && (
                  <div className="px-4 pb-4 pt-1 border-t">
                    <PriceHistoryPanel history={priceHistory} isLoading={historyLoading} currentPrice={price} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 px-6 py-4 border-t shrink-0">
          {isEdit && (
            <Button
              variant="outline"
              onClick={() => setIsActive(false)}
              data-testid="button-hide-service"
            >
              HIDE SERVICE
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="button-close-service">
            CLOSE
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !name || !price}
            data-testid="button-save-service"
          >
            {saveMutation.isPending ? "Saving..." : "SAVE"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
