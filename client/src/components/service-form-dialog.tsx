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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Upload, X, Info, Check } from "lucide-react";
import type { Service, SubService } from "@shared/schema";

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
}

export function ServiceFormDialog({ open, onOpenChange, service, providerId, adminMode }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const isEdit = !!service;

  const { data: subServices = [] } = useQuery<SubService[]>({
    queryKey: ["/api/sub-services"],
    enabled: open,
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
  const [uploading, setUploading] = useState(false);

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
        toast({ title: "Upload failed", variant: "destructive" });
      };
      reader.readAsDataURL(file);
    } catch {
      setUploading(false);
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
      toast({ title: "Save failed", description: e?.message || "Please try again", variant: "destructive" });
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
          <TabsList className="w-full justify-start gap-2 bg-transparent border-b rounded-none h-auto p-0">
            <TabsTrigger value="details" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent" data-testid="tab-service-details">SERVICE DETAILS</TabsTrigger>
            <TabsTrigger value="settings" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent" data-testid="tab-service-settings">SETTINGS</TabsTrigger>
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
                  <Label className="text-sm font-medium">Service Image</Label>
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
                <Label className="text-sm font-medium">Set colors for calendar</Label>
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
                <Label className="text-sm">Service name <span className="text-destructive">*</span></Label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Well-Baby Checkup"
                  data-testid="input-service-name"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Category <span className="text-destructive">*</span></Label>
                <Select value={subServiceId} onValueChange={setSubServiceId}>
                  <SelectTrigger data-testid="select-service-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {subServices.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Price + Deposit */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Price ( $ ) <span className="text-destructive">*</span></Label>
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
                <Label className="text-sm m-0">Hide price in booking panel:</Label>
                <Switch checked={hidePrice} onCheckedChange={setHidePrice} data-testid="switch-hide-price" />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm m-0">Hide duration in booking panel:</Label>
                <Switch checked={hideDuration} onCheckedChange={setHideDuration} data-testid="switch-hide-duration" />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4 pt-6">
            <div className="flex items-center justify-between rounded-md border px-3 py-3">
              <div>
                <Label className="text-sm m-0">Service is active</Label>
                <p className="text-xs text-muted-foreground">Inactive services are hidden from bookings.</p>
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
