import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { showErrorModal } from "@/components/error-modal";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Upload, X, Info, Check, Pencil, Trash2 } from "lucide-react";
import type { Service, SubService } from "@shared/schema";

const PROVIDER_TYPE_OPTIONS = [
  { value: "physiotherapist", label: "Physiotherapist" },
  { value: "doctor", label: "Doctor" },
  { value: "nurse", label: "Nurse" },
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: Service | null;
  providerId?: string;
  adminMode?: boolean;
  providerType?: string;
}

export function ServiceFormDialog({ open, onOpenChange, service, providerId, adminMode, providerType }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const isEdit = !!service;

  const subServicesQueryKey = providerType && !adminMode
    ? [`/api/sub-services?category=${providerType}`]
    : ["/api/sub-services"];

  const { data: allSubServices = [] } = useQuery<SubService[]>({
    queryKey: subServicesQueryKey,
    queryFn: () => fetch(subServicesQueryKey[0], { credentials: "include" }).then(r => r.json()),
    enabled: open,
    staleTime: 0,
  });

  const subServices = allSubServices;

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
  const [uploading, setUploading] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryType, setNewCategoryType] = useState<string>("physiotherapist");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingCategoryType, setEditingCategoryType] = useState<string>("physiotherapist");

  useEffect(() => {
    if (open) {
      if (service) {
        setImageUrl(service.imageUrl || "");
        setColor(service.calendarColor || CALENDAR_COLORS[0]);
        setName(service.name || "");
        setSubServiceId(service.subServiceId || "");
        setPrice(String(service.price || ""));
        setEnableDeposit(!!service.enableDeposit);
        setDepositAmount(String(service.depositAmount || ""));
        setDuration(String(service.duration || 30));
        setSlotLength(String(service.timeSlotLength ?? 0));
        setBufferBefore(String(service.bufferBefore ?? 0));
        setBufferAfter(String(service.bufferAfter ?? 0));
        setCustomDuration(!!service.customDuration);
        setHidePrice(!!service.hidePrice);
        setHideDuration(!!service.hideDuration);
        setIsActive(service.isActive ?? true);
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
      const reader = new FileReader();
      reader.onload = () => {
        setImageUrl(String(reader.result));
        setUploading(false);
      };
      reader.onerror = () => {
        setUploading(false);
        showErrorModal({ title: "Upload failed", context: "service-form.upload" });
      };
      reader.readAsDataURL(file);
    } catch {
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-service-form">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
              <Plus className="h-4 w-4" />
            </span>
            {isEdit ? "Edit Service" : "Add Service"}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details" className="mt-2">
          <TabsList className="w-full justify-start gap-4 bg-transparent border-b rounded-none h-auto p-0 overflow-x-auto">
            <TabsTrigger value="details" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs tracking-wider" data-testid="tab-service-details">SERVICE DETAILS</TabsTrigger>
            <TabsTrigger value="staff" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs tracking-wider text-muted-foreground" data-testid="tab-service-staff">STAFF</TabsTrigger>
            <TabsTrigger value="timesheet" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs tracking-wider text-muted-foreground" data-testid="tab-service-timesheet">TIME SHEET</TabsTrigger>
            <TabsTrigger value="extras" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs tracking-wider text-muted-foreground" data-testid="tab-service-extras">EXTRAS</TabsTrigger>
            <TabsTrigger value="settings" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs tracking-wider" data-testid="tab-service-settings">SETTINGS</TabsTrigger>
            <TabsTrigger value="limiter" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs tracking-wider text-muted-foreground" data-testid="tab-service-limiter">BOOKING LIMITER</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-6 pt-6">
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
                <Label className="text-sm">{t("service_form.service_name_label")} <span className="text-destructive">*</span></Label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t("service_form.service_name_placeholder")}
                  data-testid="input-service-name"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">{t("service_form.category_label")} <span className="text-destructive">*</span></Label>
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

                {editingCategoryId && (
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

                {showNewCategory && (
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
                <Label className="text-sm">{t("service_form.price_label")} <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-service-price"
                />
              </div>
              <div className="flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <Label className="text-sm flex items-center gap-2 m-0">
                    <Info className="h-3 w-3 text-muted-foreground" /> Enable Deposit
                  </Label>
                  <Switch checked={enableDeposit} onCheckedChange={setEnableDeposit} data-testid="switch-enable-deposit" />
                </div>
                {enableDeposit && (
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Deposit amount"
                    value={depositAmount}
                    onChange={e => setDepositAmount(e.target.value)}
                    data-testid="input-deposit-amount"
                  />
                )}
              </div>
            </div>

            {/* Duration grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
              <div className="space-y-2">
                <Label className="text-sm flex items-center gap-1">
                  <Info className="h-3 w-3 text-muted-foreground" /> Buffer Time Before
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={bufferBefore}
                  onChange={e => setBufferBefore(e.target.value)}
                  data-testid="input-buffer-before"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm flex items-center gap-1">
                  <Info className="h-3 w-3 text-muted-foreground" /> Buffer Time After
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={bufferAfter}
                  onChange={e => setBufferAfter(e.target.value)}
                  data-testid="input-buffer-after"
                />
              </div>
            </div>

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
          </TabsContent>

          <TabsContent value="settings" className="space-y-4 pt-6">
            <div className="flex items-center justify-between rounded-md border px-3 py-3">
              <div>
                <Label className="text-sm m-0">{t("service_form.is_active_label")}</Label>
                <p className="text-xs text-muted-foreground">{t("service_form.is_active_desc")}</p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="switch-service-active" />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
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
