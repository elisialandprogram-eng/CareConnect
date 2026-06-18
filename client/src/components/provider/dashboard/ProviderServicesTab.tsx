import { formatDate } from "@/lib/datetime";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, invalidateProviderProfile } from "@/lib/queryClient";
import { useCurrency, getCurrencySymbol, convertBetweenCurrencies, formatInCurrency, type SupportedCurrency } from "@/lib/currency";
import { ServiceFormDialog } from "@/components/service-form-dialog";
import { AddServiceCatalogueDialog } from "@/components/add-service-catalogue-dialog";
import { PractitionerManagementCard } from "@/components/practitioner-management";
import { ServiceThumbnail } from "@/components/ui/provider-image";
import type { ServicePackageWithServices } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tag, Plus, Trash2, RotateCcw, Edit, Pencil, Clock, Users, Home, Building2,
  Video, DollarSign, CheckCircle, FileText, Loader2,
} from "lucide-react";

interface ProviderServicesTabProps {
  providerData: any;
  providerWithServices: any;
  setActiveTab: (tab: string) => void;
}

function RequestServiceEditDialog({
  service,
  subServices,
  onClose,
}: {
  service: any | null;
  subServices: any[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { code } = useCurrency();
  const editCurrency: SupportedCurrency = (code as SupportedCurrency) || "USD";
  const editIsWholeNumber = editCurrency === "HUF" || editCurrency === "IRR";
  const editStep = editIsWholeNumber ? "1" : "0.01";
  const editSymbol = getCurrencySymbol(editCurrency);

  // P-FINAL Rule 1: service prices are stored in provider's native currency (editCurrency).
  // No USD conversion needed — values displayed and saved as-is.
  const toDisplay = (v: string | number): string => {
    const n = Number(v) || 0;
    return editIsWholeNumber ? String(Math.round(n)) : String(Number(n.toFixed(2)));
  };

  const [draft, setDraft] = useState<any>(() => service ? {
    subServiceId: service.subServiceId ?? "",
    duration: service.duration ?? 30,
    description: service.description ?? "",
    price: toDisplay(service.price ?? 0),
    homeVisitFee: toDisplay(service.homeVisitFee ?? 0),
    clinicFee: toDisplay(service.clinicFee ?? 0),
    telemedicineFee: toDisplay(service.telemedicineFee ?? 0),
  } : {});
  const [reason, setReason] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      const payload: any = {
        subServiceId: draft.subServiceId || null,
        name: service.name,
        description: draft.description || null,
        duration: Number(draft.duration) || 0,
        price: String(draft.price ?? "0"),
        homeVisitFee: String(draft.homeVisitFee ?? "0"),
        clinicFee: String(draft.clinicFee ?? "0"),
        telemedicineFee: String(draft.telemedicineFee ?? "0"),
        reason: reason || null,
      };
      const res = await apiRequest("POST", `/api/provider/services/${service.id}/submit-changes`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Changes submitted", description: "Your edits are pending admin approval." });
      void invalidateProviderProfile();
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Submission failed", description: err?.message || "Try again.", variant: "destructive" });
    },
  });

  if (!service) return null;

  return (
    <Dialog open={!!service} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-request-service-edit">
        <DialogHeader>
          <DialogTitle>Request edit · {service.name}</DialogTitle>
          <DialogDescription>
            Edits to admin-managed services need approval. The service will be unavailable for booking until approved.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Category</Label>
            <Select
              value={draft.subServiceId || ""}
              onValueChange={(v) => setDraft((prev: any) => ({ ...prev, subServiceId: v }))}
            >
              <SelectTrigger data-testid="select-edit-sub-service">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {(subServices || []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Service name</Label>
            <Input
              value={service.name || ""}
              disabled
              className="bg-muted text-muted-foreground cursor-not-allowed"
              data-testid="input-edit-name"
            />
            <p className="text-xs text-muted-foreground mt-1">Service name cannot be changed via edit request.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Duration (min)</Label>
              <Input type="number" min={1} value={draft.duration ?? 0}
                onChange={(e) => setDraft((prev: any) => ({ ...prev, duration: e.target.value }))}
                data-testid="input-edit-duration" />
            </div>
            <div>
              <Label>Base price ({editSymbol})</Label>
              <Input type="number" step={editStep} min={0} value={draft.price ?? "0"}
                onChange={(e) => setDraft((prev: any) => ({ ...prev, price: e.target.value }))}
                data-testid="input-edit-price" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Home fee ({editSymbol})</Label>
              <Input type="number" step={editStep} min={0} value={draft.homeVisitFee ?? "0"}
                onChange={(e) => setDraft((prev: any) => ({ ...prev, homeVisitFee: e.target.value }))}
                data-testid="input-edit-home-fee" /></div>
            <div><Label>Clinic fee ({editSymbol})</Label>
              <Input type="number" step={editStep} min={0} value={draft.clinicFee ?? "0"}
                onChange={(e) => setDraft((prev: any) => ({ ...prev, clinicFee: e.target.value }))}
                data-testid="input-edit-clinic-fee" /></div>
            <div><Label>Online fee ({editSymbol})</Label>
              <Input type="number" step={editStep} min={0} value={draft.telemedicineFee ?? "0"}
                onChange={(e) => setDraft((prev: any) => ({ ...prev, telemedicineFee: e.target.value }))}
                data-testid="input-edit-telemedicine-fee" /></div>
          </div>
          <div>
            <Label>Reason for change (optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you requesting this change?"
              data-testid="textarea-edit-reason"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={submit.isPending}
            onClick={() => submit.mutate()}
            data-testid="button-submit-edit-request"
          >
            {submit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProviderServicesTab({ providerData, providerWithServices, setActiveTab }: ProviderServicesTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { format: fmtMoney, code } = useCurrency();
  const pkgPriceCurrency: SupportedCurrency = (code as SupportedCurrency) || "USD";
  const pkgIsWholeNumber = pkgPriceCurrency === "HUF" || pkgPriceCurrency === "IRR";
  const pkgInputStep = pkgIsWholeNumber ? "1" : "0.01";
  const pkgInputSymbol = getCurrencySymbol(pkgPriceCurrency);
  const pkgToUSD = (v: string): string => {
    if (pkgPriceCurrency === "USD") return v;
    const n = Number(v);
    if (!Number.isFinite(n) || n === 0) return v;
    return String(Number(convertBetweenCurrencies(n, pkgPriceCurrency, "USD").toFixed(6)));
  };
  const pkgFromUSD = (v: string | number): string => {
    if (pkgPriceCurrency === "USD") return String(Number(v) || 0);
    const n = Number(v) || 0;
    const c = convertBetweenCurrencies(n, "USD", pkgPriceCurrency);
    return pkgIsWholeNumber ? String(Math.round(c)) : String(Number(c.toFixed(2)));
  };
  const pkgUsdHint = (v: string): string | null => {
    if (pkgPriceCurrency === "USD" || !v || Number(v) === 0) return null;
    return `≈ ${formatInCurrency(convertBetweenCurrencies(Number(v), pkgPriceCurrency, "USD"), "USD")}`;
  };

  // Use providerType (canonical enum) as the single source of truth for filtering sub-services.
  // ?category= maps to sub_services.category (enum column) — never use providerCategory (display name).
  const subServicesUrl = providerData?.providerType
    ? `/api/sub-services?category=${encodeURIComponent(providerData.providerType)}`
    : "/api/sub-services";
  const { data: subServices } = useQuery<any[]>({
    queryKey: ["/api/sub-services", providerData?.providerType],
    queryFn: () => fetch(subServicesUrl, { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000,
  });

  const { data: packages } = useQuery<ServicePackageWithServices[]>({
    queryKey: ["/api/provider/packages"],
  });

  const { data: serviceProposals, isLoading: proposalsLoading } = useQuery<any[]>({
    queryKey: ["/api/service-requests"],
  });

  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [serviceFormOpen, setServiceFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<any>(null);
  const [editRequestService, setEditRequestService] = useState<any | null>(null);
  const [pricingService, setPricingService] = useState<any | null>(null);
  const [pricingDraft, setPricingDraft] = useState<any>({});

  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<ServicePackageWithServices | null>(null);
  const [pkgName, setPkgName] = useState("");
  const [pkgDescription, setPkgDescription] = useState("");
  const [pkgPrice, setPkgPrice] = useState("");
  const [pkgDuration, setPkgDuration] = useState("");
  const [pkgServiceIds, setPkgServiceIds] = useState<string[]>([]);

  const openCreatePackage = () => {
    setEditingPackage(null); setPkgName(""); setPkgDescription("");
    setPkgPrice(""); setPkgDuration(""); setPkgServiceIds([]);
    setPackageDialogOpen(true);
  };
  const openEditPackage = (pkg: ServicePackageWithServices) => {
    setEditingPackage(pkg); setPkgName(pkg.name); setPkgDescription(pkg.description || "");
    setPkgPrice(pkgFromUSD(pkg.price)); setPkgDuration(pkg.duration ? String(pkg.duration) : "");
    setPkgServiceIds((pkg.services ?? []).map(s => s.id));
    setPackageDialogOpen(true);
  };

  // pkgServicesTotal must be in USD (same unit as pkg.price which is stored in USD).
  // Service prices are stored in native currency (HUF/IRR/USD), so convert each to USD first.
  const pkgServicesTotal = pkgServiceIds.reduce((sum, id) => {
    const s = providerWithServices?.services?.find((x: any) => x.id === id);
    if (!s) return sum;
    const n = Number(s.price ?? 0);
    const sc = (s as any).currency ?? pkgPriceCurrency;
    return sum + (sc === "USD" ? n : convertBetweenCurrencies(n, sc, "USD"));
  }, 0);
  const pkgSavings = pkgPrice ? Math.max(0, pkgServicesTotal - Number(pkgToUSD(pkgPrice))) : 0;

  const toggleServiceMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/services/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers", providerData?.id] });
    },
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/services/${id}`);
      try { return await r.json(); } catch { return { ok: true, archived: false }; }
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers", providerData?.id] });
      void invalidateProviderProfile();
      if (data?.archived) {
        toast({ title: t("provider_dashboard.toast_service_archived", "Service archived"), description: data.message });
      } else {
        toast({ title: t("provider_dashboard.toast_service_deleted", "Service deleted") });
      }
    },
    onError: (e: any) => {
      toast({ title: t("provider_dashboard.toast_failed_delete", "Failed to delete service"), description: e?.message, variant: "destructive" });
    },
  });

  const restoreServiceMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("POST", `/api/services/${id}/restore`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers", providerData?.id] });
      void invalidateProviderProfile();
      toast({ title: t("provider_dashboard.toast_service_restored", "Service restored") });
    },
  });

  const savePackageMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: pkgName.trim(),
        description: pkgDescription.trim() || null,
        price: pkgToUSD(pkgPrice),
        duration: pkgDuration ? Number(pkgDuration) : null,
        serviceIds: pkgServiceIds,
      };
      if (editingPackage) {
        return await apiRequest("PATCH", `/api/provider/packages/${editingPackage.id}`, payload);
      }
      return await apiRequest("POST", "/api/provider/packages", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/packages"] });
      setPackageDialogOpen(false);
      toast({ title: editingPackage ? t("provider_dashboard.package_updated", "Package updated") : t("provider_dashboard.package_created", "Package created") });
    },
    onError: (err: any) => {
      toast({ title: t("common.error", "Error"), description: err?.message || "Failed to save package", variant: "destructive" });
    },
  });

  const togglePackageMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      await apiRequest("PATCH", `/api/provider/packages/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/provider/packages"] }),
  });

  const deletePackageMutation = useMutation({
    mutationFn: async (id: string) => await apiRequest("DELETE", `/api/provider/packages/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/packages"] });
      toast({ title: t("provider_dashboard.package_deleted", "Package deleted") });
    },
  });

  const activeServices = providerWithServices?.services?.filter((s: any) => s.isActive) ?? [];

  return (
    <div className="space-y-6">
      {/* Clinic address warning */}
      {(() => {
        const hasClinicAddress = !!providerData?.primaryServiceLocation?.trim?.();
        const hasClinicService = !!(providerWithServices?.services ?? []).some(
          (s: any) => s.isActive && (s.locationMode ?? "both") !== "home_only"
        );
        if (hasClinicAddress || !hasClinicService) return null;
        return (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700/50 p-4 flex items-start gap-3" data-testid="banner-no-clinic-address">
            <Building2 className="h-5 w-5 text-amber-700 dark:text-amber-300 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-amber-900 dark:text-amber-100">Add your clinic address</div>
              <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
                Clients can't book in-clinic visits until you set your clinic location. Open the Profile tab and fill in "Primary location".
              </p>
              <Button size="sm" variant="outline" className="mt-2 border-amber-300 dark:border-amber-700"
                onClick={() => setActiveTab("profile")} data-testid="button-set-clinic-address">
                Go to Profile
              </Button>
            </div>
          </div>
        );
      })()}

      {/* Services list */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>{t("provider_dashboard.services", "Services")}</CardTitle>
              <CardDescription className="mt-1">
                {t("provider_dashboard.services_desc", "Add your own services or manage ones assigned by an admin.")}
              </CardDescription>
            </div>
            <Button size="sm" className="shrink-0" onClick={() => setCatalogueOpen(true)} data-testid="button-add-service">
              <Plus className="h-4 w-4 mr-1" />
              {t("provider_dashboard.add_service", "Add service")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {!providerWithServices?.services?.filter((s: any) => s.pendingChangeStatus !== "rejected").length && (
              <div className="text-center py-10 text-sm text-muted-foreground border-2 border-dashed rounded-lg" data-testid="empty-services">
                <Tag className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
                {t("provider_dashboard.empty_services_title", "No services yet.")}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {providerWithServices?.services?.filter((s: any) => s.pendingChangeStatus !== "rejected").map((s: any) => {
                const sa: any = s;
                const visitFees = [
                  { icon: Home, label: t("provider_dashboard.fee_home", "Home"), val: Number(sa.homeVisitFee || 0) },
                  { icon: Building2, label: t("provider_dashboard.fee_clinic", "Clinic"), val: Number(sa.clinicFee || 0) },
                  { icon: Video, label: t("provider_dashboard.fee_online", "Online"), val: Number(sa.telemedicineFee || 0) },
                ].filter(v => v.val > 0);
                const isArchived = !!sa.deletedAt;
                return (
                  <div
                    key={s.id}
                    className={`group relative border rounded-xl bg-card p-4 transition-all hover-elevate ${!s.isActive ? "opacity-60" : ""} ${isArchived ? "border-dashed border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/10" : ""}`}
                    data-testid={`row-service-${s.id}`}
                  >
                    <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r" style={{ backgroundColor: sa.calendarColor || "#10b981" }} aria-hidden />
                    <div className="pl-2">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {sa.imageUrl !== undefined ? (
                            <ServiceThumbnail src={sa.imageUrl} name={sa.name} />
                          ) : (
                            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Tag className="h-4 w-4 text-primary" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold truncate" data-testid={`text-service-name-${s.id}`}>{s.name}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Clock className="h-3 w-3" /> {s.duration}{t("provider_dashboard.min_short", "m")}
                              {sa.maxPatientsPerDay ? <> · <Users className="h-3 w-3" /> {sa.maxPatientsPerDay}/{t("provider_dashboard.day_short", "d")}</> : null}
                            </p>
                          </div>
                        </div>
                        {!isArchived && sa.pendingChangeStatus !== "pending" && (
                          <Switch
                            checked={!!s.isActive}
                            onCheckedChange={(v) => toggleServiceMutation.mutate({ id: s.id, isActive: v })}
                            data-testid={`switch-service-active-${s.id}`}
                          />
                        )}
                      </div>
                      <div className="flex items-baseline justify-between mt-1">
                        <span className="text-lg font-bold text-primary" data-testid={`text-service-price-${s.id}`}>
                          {formatInCurrency(Number(s.price), (sa as any).currency ?? code)}
                        </span>
                        <Badge
                          variant={isArchived ? "outline" : sa.pendingChangeStatus === "pending" ? "outline" : sa.pendingChangeStatus === "rejected" ? "outline" : s.isActive ? "default" : "secondary"}
                          className={`text-[10px] ${isArchived ? "border-amber-500/60 text-amber-700 dark:text-amber-400" : sa.pendingChangeStatus === "pending" ? "border-amber-500/60 text-amber-700 dark:text-amber-400" : sa.pendingChangeStatus === "rejected" ? "border-destructive/60 text-destructive" : ""}`}
                          data-testid={`badge-service-status-${s.id}`}
                        >
                          {isArchived ? "Archived" : sa.pendingChangeStatus === "pending" ? "Pending Approval" : sa.pendingChangeStatus === "rejected" ? "Rejected" : s.isActive ? t("provider_dashboard.active", "Active") : t("provider_dashboard.paused", "Paused")}
                        </Badge>
                      </div>
                      {visitFees.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {visitFees.map((vf, i) => {
                            const Ic = vf.icon;
                            return (
                              <span key={i} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-muted text-foreground/80" data-testid={`chip-fee-${vf.label.toLowerCase()}-${s.id}`}>
                                <Ic className="h-3 w-3" /> {vf.label}: +{formatInCurrency(vf.val, (sa as any).currency ?? code)}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex justify-end gap-1 mt-3 pt-2 border-t border-dashed">
                        {isArchived ? (
                          <Button size="sm" variant="outline" className="h-8"
                            onClick={() => restoreServiceMutation.mutate(s.id)}
                            data-testid={`button-restore-service-${s.id}`}>
                            <RotateCcw className="h-3.5 w-3.5 mr-1" /> {t("provider_dashboard.restore", "Restore")}
                          </Button>
                        ) : (s as any).subServiceId ? (
                          <div className="flex items-center justify-between w-full gap-2 flex-wrap">
                            <span className="text-[11px] text-muted-foreground italic" data-testid={`text-assigned-service-${s.id}`}>Managed by Admin</span>
                            <div className="flex items-center gap-2">
                              {sa.pendingChangeStatus === "pending" ? (
                                <Badge variant="outline" className="text-[10px] border-amber-500/60 text-amber-700 dark:text-amber-400">Pending approval</Badge>
                              ) : null}
                              <Button size="sm" variant="ghost" className="h-8"
                                disabled={sa.pendingChangeStatus === "pending"}
                                onClick={() => setEditRequestService(s)}
                                data-testid={`button-request-edit-service-${s.id}`}>
                                <Pencil className="h-3.5 w-3.5 mr-1" /> Request edit
                              </Button>
                            </div>
                          </div>
                        ) : sa.pendingChangeStatus === "pending" ? (
                          <div className="flex items-center justify-between w-full">
                            <span className="text-[11px] text-amber-600 dark:text-amber-400 italic">Awaiting admin approval</span>
                          </div>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" className="h-8"
                              onClick={() => { setEditingService(s); setServiceFormOpen(true); }}
                              data-testid={`button-edit-service-${s.id}`}>
                              <Edit className="h-3.5 w-3.5 mr-1" /> {t("provider_dashboard.edit", "Edit")}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8"
                              onClick={() => { setPricingService(s); setPricingDraft({ price: s.price, homeVisitFee: s.homeVisitFee, clinicFee: s.clinicFee, telemedicineFee: s.telemedicineFee, duration: s.duration, maxPatientsPerDay: s.maxPatientsPerDay }); }}
                              data-testid={`button-pricing-service-${s.id}`}>
                              <DollarSign className="h-3.5 w-3.5 mr-1" /> Pricing
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                              onClick={() => {
                                const msg = t("provider_dashboard.confirm_delete_service_warning", "Delete this service?\n\nIf it has been used in past bookings, it will be archived instead of deleted.");
                                if (confirm(msg)) deleteServiceMutation.mutate(s.id);
                              }}
                              data-testid={`button-delete-service-${s.id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {providerData?.id && (
        <PractitionerManagementCard
          providerId={providerData.id}
          services={activeServices as any}
        />
      )}

      {/* Service Packages */}
      <Card data-testid="card-service-packages">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              {t("provider_dashboard.service_packages", "Service packages")}
            </CardTitle>
            <CardDescription>
              {t("provider_dashboard.service_packages_desc", "Bundle multiple services together at a special package price.")}
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreatePackage}
            disabled={activeServices.length < 2}
            data-testid="button-add-package">
            <Plus className="h-4 w-4 mr-1" />
            {t("provider_dashboard.new_package", "New package")}
          </Button>
        </CardHeader>
        <CardContent>
          {activeServices.length < 2 && (
            <div className="text-center py-8 text-sm text-muted-foreground" data-testid="empty-packages-need-services">
              {t("provider_dashboard.packages_need_services", "Add at least 2 active services before you can create a package.")}
            </div>
          )}
          {activeServices.length >= 2 && !packages?.length && (
            <div className="text-center py-8 text-sm text-muted-foreground" data-testid="empty-packages">
              {t("provider_dashboard.no_packages", "No packages yet.")}
            </div>
          )}
          {packages && packages.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {packages.map(pkg => {
                const pkgServices = pkg.services ?? [];
                // Both pkg.price (USD stored) and fullPrice must be in USD for comparison.
                const fullPrice = pkgServices.reduce((sum: number, s: any) => {
                  const n = Number(s.price ?? 0);
                  const sc = (s as any).currency ?? code;
                  return sum + (sc === "USD" ? n : convertBetweenCurrencies(n, sc, "USD"));
                }, 0);
                const savings = Math.max(0, fullPrice - Number(pkg.price));
                return (
                  <div key={pkg.id} className="border rounded-lg p-4 bg-card hover-elevate" data-testid={`row-package-${pkg.id}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold truncate" data-testid={`text-package-name-${pkg.id}`}>{pkg.name}</p>
                          {!pkg.isActive && <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{t("provider_dashboard.paused", "Paused")}</span>}
                        </div>
                        {pkg.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{pkg.description}</p>}
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <p className="font-bold text-primary text-lg" data-testid={`text-package-price-${pkg.id}`}>{fmtMoney(Number(pkg.price))}</p>
                        {savings > 0 && <p className="text-[11px] text-green-600 dark:text-green-400 line-through opacity-80">{fmtMoney(fullPrice)}</p>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 my-3">
                      {(pkg.services ?? []).map(s => (
                        <span key={s.id} className="text-[11px] px-2 py-1 rounded-md bg-muted text-foreground" data-testid={`chip-package-service-${pkg.id}-${s.id}`}>{s.name}</span>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => openEditPackage(pkg)} data-testid={`button-edit-package-${pkg.id}`}>
                        <Edit className="h-3.5 w-3.5 mr-1" /> {t("provider_dashboard.edit", "Edit")}
                      </Button>
                      <Button size="sm" variant={pkg.isActive ? "default" : "outline"}
                        onClick={() => togglePackageMutation.mutate({ id: pkg.id, isActive: !pkg.isActive })}
                        data-testid={`button-toggle-package-${pkg.id}`}>
                        {pkg.isActive ? t("provider_dashboard.active", "Active") : t("provider_dashboard.paused", "Paused")}
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive"
                        onClick={() => { if (confirm(t("provider_dashboard.confirm_delete_package", "Delete this package?"))) deletePackageMutation.mutate(pkg.id); }}
                        data-testid={`button-delete-package-${pkg.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Service Proposals */}
      <Card data-testid="card-service-proposals">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                {t("provider_dashboard.my_proposals", "My Service Proposals")}
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {t("provider_dashboard.my_proposals_desc", "Services you've proposed for inclusion in the platform catalogue")}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {proposalsLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : !serviceProposals || serviceProposals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t("provider_dashboard.no_proposals", "No proposals yet.")}</p>
            </div>
          ) : (
            (() => {
              const activeProposals = serviceProposals.filter((p: any) => p.status !== "rejected");
              if (activeProposals.length === 0) {
                return (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">{t("provider_dashboard.no_proposals", "No proposals yet.")}</p>
                  </div>
                );
              }
              return (
                <div className="space-y-2">
                  {activeProposals.map((proposal: any) => {
                    const statusColors: Record<string, string> = {
                      pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
                      pending_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
                      approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
                      under_review: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
                    };
                    const colorClass = statusColors[proposal.status] ?? "bg-muted text-muted-foreground";
                    const dateStr = proposal.createdAt ? formatDate(proposal.createdAt, { day: "numeric", month: "short", year: "numeric" }) : "";
                    return (
                      <div key={proposal.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 gap-3" data-testid={`row-proposal-${proposal.id}`}>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{proposal.serviceName || proposal.title || "Untitled proposal"}</p>
                          {proposal.category && <p className="text-xs text-muted-foreground">{proposal.category}</p>}
                          {proposal.adminNotes && <p className="text-xs text-muted-foreground mt-1 italic">Admin: {proposal.adminNotes}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {dateStr && <span className="text-xs text-muted-foreground hidden sm:block">{dateStr}</span>}
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${colorClass}`}>
                            {(proposal.status ?? "pending").replace(/_/g, " ")}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </CardContent>
      </Card>

      {/* Package Create/Edit Dialog */}
      <Dialog open={packageDialogOpen} onOpenChange={setPackageDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-package-form">
          <DialogHeader>
            <DialogTitle>
              {editingPackage ? t("provider_dashboard.edit_package", "Edit package") : t("provider_dashboard.create_package", "Create package")}
            </DialogTitle>
            <DialogDescription>
              {t("provider_dashboard.package_form_desc", "Bundle multiple services into a single offer at a special price.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="pkg-name">{t("provider_dashboard.package_name", "Package name")}</Label>
              <Input id="pkg-name" value={pkgName} onChange={e => setPkgName(e.target.value)} data-testid="input-package-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkg-desc">{t("provider_dashboard.package_description", "Description")} <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea id="pkg-desc" value={pkgDescription} onChange={e => setPkgDescription(e.target.value)} rows={2} data-testid="input-package-description" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pkg-price">{t("provider_dashboard.package_price", "Price")} ({pkgInputSymbol})</Label>
                <Input id="pkg-price" type="number" step={pkgInputStep} value={pkgPrice} onChange={e => setPkgPrice(e.target.value)} data-testid="input-package-price" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pkg-dur">{t("provider_dashboard.package_duration", "Duration (min)")} <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="pkg-dur" type="number" min={1} value={pkgDuration} onChange={e => setPkgDuration(e.target.value)} data-testid="input-package-duration" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("provider_dashboard.package_services", "Select services to include")}</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                {activeServices.map((s: any) => {
                  const checked = pkgServiceIds.includes(s.id);
                  return (
                    <div key={s.id} className="flex items-center gap-2" data-testid={`checkbox-pkg-service-${s.id}`}>
                      <Checkbox id={`pkg-s-${s.id}`} checked={checked}
                        onCheckedChange={(v) => setPkgServiceIds(ids => v ? [...ids, s.id] : ids.filter(x => x !== s.id))} />
                      <label htmlFor={`pkg-s-${s.id}`} className="text-sm cursor-pointer">
                        {s.name} <span className="text-muted-foreground">{formatInCurrency(Number(s.price), (s as any).currency ?? code)}</span>
                      </label>
                    </div>
                  );
                })}
              </div>
              {pkgServiceIds.length >= 2 && pkgSavings > 0 && (
                <p className="text-xs text-green-600 dark:text-green-400">Saves {fmtMoney(pkgSavings)} vs buying separately</p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPackageDialogOpen(false)}>{t("provider_dashboard.cancel", "Cancel")}</Button>
            <Button
              disabled={!pkgName.trim() || pkgServiceIds.length < 2 || !pkgPrice || savePackageMutation.isPending}
              onClick={() => savePackageMutation.mutate()}
              data-testid="button-save-package"
            >
              {savePackageMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingPackage ? t("provider_dashboard.save", "Save") : t("provider_dashboard.create_package", "Create package")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pricing sheet */}
      <Sheet open={!!pricingService} onOpenChange={(o) => { if (!o) setPricingService(null); }}>
        <SheetContent className="sm:max-w-md overflow-y-auto" data-testid="sheet-pricing">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              {t("provider_dashboard.edit_pricing", "Edit pricing")}
            </SheetTitle>
            <SheetDescription>{pricingService?.name}</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-6">
            <div className="space-y-1.5">
              <Label htmlFor="ps-price">{t("provider_dashboard.base_price", "Base price")}</Label>
              <Input id="ps-price" type="number" step="0.01"
                value={pricingDraft.price ?? ""}
                onChange={(e) => setPricingDraft({ ...pricingDraft, price: e.target.value })}
                data-testid="input-pricing-base" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ps-home" className="flex items-center gap-1 text-xs"><Home className="h-3 w-3" /> {t("provider_dashboard.fee_home", "Home")}</Label>
                <Input id="ps-home" type="number" step="0.01" value={pricingDraft.homeVisitFee ?? ""}
                  onChange={(e) => setPricingDraft({ ...pricingDraft, homeVisitFee: e.target.value })}
                  data-testid="input-pricing-home" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ps-clinic" className="flex items-center gap-1 text-xs"><Building2 className="h-3 w-3" /> {t("provider_dashboard.fee_clinic", "Clinic")}</Label>
                <Input id="ps-clinic" type="number" step="0.01" value={pricingDraft.clinicFee ?? ""}
                  onChange={(e) => setPricingDraft({ ...pricingDraft, clinicFee: e.target.value })}
                  data-testid="input-pricing-clinic" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ps-online" className="flex items-center gap-1 text-xs"><Video className="h-3 w-3" /> {t("provider_dashboard.fee_online", "Online")}</Label>
                <Input id="ps-online" type="number" step="0.01" value={pricingDraft.telemedicineFee ?? ""}
                  onChange={(e) => setPricingDraft({ ...pricingDraft, telemedicineFee: e.target.value })}
                  data-testid="input-pricing-online" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ps-dur" className="flex items-center gap-1 text-xs"><Clock className="h-3 w-3" /> {t("provider_dashboard.duration", "Duration (min)")}</Label>
                <Input id="ps-dur" type="number" value={pricingDraft.duration ?? ""}
                  onChange={(e) => setPricingDraft({ ...pricingDraft, duration: parseInt(e.target.value) || 0 })}
                  data-testid="input-pricing-duration" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ps-cap" className="flex items-center gap-1 text-xs"><Users className="h-3 w-3" /> {t("provider_dashboard.max_per_day", "Max per day")}</Label>
                <Input id="ps-cap" type="number" value={pricingDraft.maxPatientsPerDay ?? ""}
                  onChange={(e) => setPricingDraft({ ...pricingDraft, maxPatientsPerDay: e.target.value ? parseInt(e.target.value) : null })}
                  data-testid="input-pricing-cap" />
              </div>
            </div>
          </div>
          <SheetFooter className="flex-row justify-end gap-2 sm:space-x-0">
            <Button variant="outline" onClick={() => setPricingService(null)} data-testid="button-pricing-cancel">
              {t("provider_dashboard.cancel", "Cancel")}
            </Button>
            <Button
              onClick={async () => {
                if (!pricingService) return;
                try {
                  await apiRequest("PATCH", `/api/services/${pricingService.id}`, {
                    price: pricingDraft.price,
                    homeVisitFee: pricingDraft.homeVisitFee,
                    clinicFee: pricingDraft.clinicFee,
                    telemedicineFee: pricingDraft.telemedicineFee,
                    duration: pricingDraft.duration,
                    maxPatientsPerDay: pricingDraft.maxPatientsPerDay,
                  });
                  toast({ title: t("provider_dashboard.pricing_saved", "Pricing saved") });
                  queryClient.invalidateQueries({ queryKey: ["/api/providers", providerData?.id] });
                  void invalidateProviderProfile();
                  setPricingService(null);
                } catch (e: any) {
                  toast({ title: t("provider_dashboard.pricing_error", "Failed to save pricing"), description: e.message, variant: "destructive" });
                }
              }}
              data-testid="button-pricing-save"
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              {t("provider_dashboard.save", "Save")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AddServiceCatalogueDialog
        open={catalogueOpen}
        onOpenChange={setCatalogueOpen}
        providerId={providerData?.id}
      />

      <ServiceFormDialog
        open={serviceFormOpen}
        onOpenChange={(o) => { setServiceFormOpen(o); if (!o) setEditingService(null); }}
        service={editingService}
        providerId={providerData?.id}
        providerType={providerData?.providerType}
        lockCategory
      />

      <RequestServiceEditDialog
        service={editRequestService}
        subServices={subServices ?? []}
        onClose={() => setEditRequestService(null)}
      />
    </div>
  );
}
