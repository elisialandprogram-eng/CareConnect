/**
 * ProviderTimeEngine — Part 5: Provider Time & Revenue Command Center
 *
 * Three unified navigation paths:
 *  [Weekly Base Template]  — per-day split-shift controls + tiered pricing
 *  [Leaves & Exceptions]   — vacation/blackout date-range calendar
 *  [Surge Pricing Matrix]  — macro tier price rules
 */
import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatInCurrency } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Trash2, Plus, Copy, AlertTriangle, CalendarOff, Zap, Clock } from "lucide-react";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type PricingTier = "standard" | "peak" | "off_peak";

interface DaySlot {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDurationMins: number;
  bufferBeforeMins: number;
  bufferAfterMins: number;
  pricingTier: PricingTier;
  isActive?: boolean;
}

interface Leave {
  id: string;
  providerId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function toMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function detectOverlaps(slots: DaySlot[]): Set<number> {
  const bad = new Set<number>();
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const aS = toMins(slots[i].startTime);
      const aE = toMins(slots[i].endTime);
      const bS = toMins(slots[j].startTime);
      const bE = toMins(slots[j].endTime);
      if (aS < aE && bS < bE && aS < bE && bS < aE) {
        bad.add(i);
        bad.add(j);
      }
    }
  }
  return bad;
}

function slotsForDay(templates: DaySlot[], dow: number): DaySlot[] {
  return templates.filter((t) => t.dayOfWeek === dow);
}

function emptySlot(dow: number): DaySlot {
  return {
    dayOfWeek: dow,
    startTime: "09:00",
    endTime: "17:00",
    slotDurationMins: 30,
    bufferBeforeMins: 0,
    bufferAfterMins: 5,
    pricingTier: "standard",
  };
}

// ── sub-component: single day row editor ─────────────────────────────────────
function DaySlotRow({
  slot,
  index,
  isOverlapping,
  onChange,
  onRemove,
}: {
  slot: DaySlot;
  index: number;
  isOverlapping: boolean;
  onChange: (updated: DaySlot) => void;
  onRemove: () => void;
}) {
  const set = (k: keyof DaySlot, v: any) => onChange({ ...slot, [k]: v });

  return (
    <div
      className={`grid grid-cols-[1fr_1fr_80px_80px_80px_140px_36px] gap-2 items-end p-3 rounded-lg border text-sm min-w-[560px] ${
        isOverlapping ? "border-red-500 bg-red-50 dark:bg-red-950/30" : "border-border bg-card"
      }`}
      data-testid={`row-day-slot-${slot.dayOfWeek}-${index}`}
    >
      {/* Start time */}
      <div>
        <Label className="text-xs mb-1 block">Start</Label>
        <Input
          type="time"
          value={slot.startTime}
          onChange={(e) => set("startTime", e.target.value)}
          className={`h-8 text-sm ${isOverlapping ? "border-red-500 focus:border-red-500" : ""}`}
          data-testid={`input-start-time-${slot.dayOfWeek}-${index}`}
        />
      </div>
      {/* End time */}
      <div>
        <Label className="text-xs mb-1 block">End</Label>
        <Input
          type="time"
          value={slot.endTime}
          onChange={(e) => set("endTime", e.target.value)}
          className={`h-8 text-sm ${isOverlapping ? "border-red-500 focus:border-red-500" : ""}`}
          data-testid={`input-end-time-${slot.dayOfWeek}-${index}`}
        />
      </div>
      {/* Duration */}
      <div>
        <Label className="text-xs mb-1 block">Slot (min)</Label>
        <Input
          type="number"
          min={5}
          max={480}
          value={slot.slotDurationMins}
          onChange={(e) => set("slotDurationMins", Number(e.target.value))}
          className="h-8 text-sm"
          data-testid={`input-duration-${slot.dayOfWeek}-${index}`}
        />
      </div>
      {/* Buffer before */}
      <div>
        <Label className="text-xs mb-1 block">Buf ↑</Label>
        <Input
          type="number"
          min={0}
          max={120}
          value={slot.bufferBeforeMins}
          onChange={(e) => set("bufferBeforeMins", Number(e.target.value))}
          className="h-8 text-sm"
          data-testid={`input-buf-before-${slot.dayOfWeek}-${index}`}
        />
      </div>
      {/* Buffer after */}
      <div>
        <Label className="text-xs mb-1 block">Buf ↓</Label>
        <Input
          type="number"
          min={0}
          max={120}
          value={slot.bufferAfterMins}
          onChange={(e) => set("bufferAfterMins", Number(e.target.value))}
          className="h-8 text-sm"
          data-testid={`input-buf-after-${slot.dayOfWeek}-${index}`}
        />
      </div>
      {/* Pricing tier */}
      <div>
        <Label className="text-xs mb-1 block">Pricing tier</Label>
        <Select value={slot.pricingTier} onValueChange={(v) => set("pricingTier", v as PricingTier)}>
          <SelectTrigger className="h-8 text-xs" data-testid={`select-pricing-${slot.dayOfWeek}-${index}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="peak">Peak (+20%)</SelectItem>
            <SelectItem value="off_peak">Off-Peak (−15%)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {/* Remove */}
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-destructive hover:bg-destructive/10"
        onClick={onRemove}
        data-testid={`button-remove-slot-${slot.dayOfWeek}-${index}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ── Part 1: Weekly Base Template tab ─────────────────────────────────────────
function WeeklyTemplateTab() {
  const { toast } = useToast();

  const { data: rawTemplates = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/provider/schedule-templates"],
  });

  const [localSlots, setLocalSlots] = useState<DaySlot[] | null>(null);

  // Initialise local state from server once (lazy sync)
  const slots: DaySlot[] = localSlots ?? (rawTemplates as DaySlot[]).map((r: any) => ({
    id: r.id,
    dayOfWeek: r.day_of_week ?? r.dayOfWeek,
    startTime: r.start_time ?? r.startTime,
    endTime: r.end_time ?? r.endTime,
    slotDurationMins: r.slot_duration_mins ?? r.slotDurationMins ?? 30,
    bufferBeforeMins: r.buffer_before_mins ?? r.bufferBeforeMins ?? 0,
    bufferAfterMins: r.buffer_after_mins ?? r.bufferAfterMins ?? 5,
    pricingTier: r.pricing_tier ?? r.pricingTier ?? "standard",
    isActive: r.is_active ?? true,
  }));

  const syncLocal = useCallback((updated: DaySlot[]) => {
    setLocalSlots(updated);
  }, []);

  const saveMut = useMutation({
    mutationFn: async (daySlots: { dow: number; slots: DaySlot[] }) => {
      for (const slot of daySlots.slots) {
        await apiRequest("POST", "/api/provider/schedule-templates", {
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          slotDurationMins: slot.slotDurationMins,
          bufferBeforeMins: slot.bufferBeforeMins,
          bufferAfterMins: slot.bufferAfterMins,
        });
      }
      if (daySlots.slots.length === 0) {
        await apiRequest("DELETE", `/api/provider/schedule-templates/day/${daySlots.dow}`);
      }
    },
    onSuccess: () => {
      toast({ title: "Schedule saved", description: "Rolling cron will generate slots automatically." });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/schedule-templates"] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  const updateSlot = (idx: number, updated: DaySlot) => {
    const next = [...slots];
    next[idx] = updated;
    syncLocal(next);
  };

  const removeSlot = (idx: number) => {
    syncLocal(slots.filter((_, i) => i !== idx));
  };

  const addSlot = (dow: number) => {
    syncLocal([...slots, emptySlot(dow)]);
  };

  const applyMondayToWeekdays = () => {
    const mondaySlots = slotsForDay(slots, 1); // dow 1 = Monday
    if (mondaySlots.length === 0) {
      toast({ title: "No Monday template", description: "Set a Monday schedule first.", variant: "destructive" });
      return;
    }
    const withoutWeekdays = slots.filter((s) => s.dayOfWeek < 1 || s.dayOfWeek > 5);
    const copies: DaySlot[] = [];
    for (let dow = 2; dow <= 5; dow++) {
      mondaySlots.forEach((ms) => copies.push({ ...ms, id: undefined, dayOfWeek: dow }));
    }
    syncLocal([...withoutWeekdays, ...copies]);
    toast({ title: "Applied", description: "Monday's template was copied to Tue–Fri." });
  };

  const saveDay = (dow: number) => {
    const daySlots = slotsForDay(slots, dow);
    const overlapIdx = detectOverlaps(daySlots);
    if (overlapIdx.size > 0) {
      toast({ title: "Overlap detected", description: "Fix overlapping time windows before saving.", variant: "destructive" });
      return;
    }
    saveMut.mutate({ dow, slots: daySlots });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  // Global overlap detection across all days
  const allOverlapsPerDay = new Map<number, Set<number>>();
  for (let dow = 0; dow <= 6; dow++) {
    const daySlots = slotsForDay(slots, dow);
    allOverlapsPerDay.set(dow, detectOverlaps(daySlots));
  }

  const hasAnyOverlap = [...allOverlapsPerDay.values()].some((s) => s.size > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold">Weekly Base Template</h3>
          <p className="text-sm text-muted-foreground">
            Configure recurring daily windows. The rolling cron generates bookable slots 30 days ahead automatically.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={applyMondayToWeekdays}
          data-testid="button-apply-monday-to-weekdays"
          className="gap-1.5"
        >
          <Copy className="h-3.5 w-3.5" />
          Apply Monday → Tue–Fri
        </Button>
      </div>

      {hasAnyOverlap && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Overlapping time windows detected. Highlighted rows must be fixed before saving.
          </AlertDescription>
        </Alert>
      )}

      {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
        const daySlots = slotsForDay(slots, dow);
        const overlaps = allOverlapsPerDay.get(dow) ?? new Set<number>();
        const hasOverlap = overlaps.size > 0;

        return (
          <Card key={dow} className={hasOverlap ? "border-red-400" : undefined}>
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{DAY_NAMES[dow]}</span>
                  {daySlots.length > 0 ? (
                    <Badge variant="secondary" className="text-xs">{daySlots.length} window{daySlots.length !== 1 ? "s" : ""}</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">Off</Badge>
                  )}
                  {hasOverlap && (
                    <Badge variant="destructive" className="text-xs">Overlap!</Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addSlot(dow)}
                    className="h-7 text-xs gap-1"
                    data-testid={`button-add-slot-${dow}`}
                  >
                    <Plus className="h-3 w-3" /> Add window
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => saveDay(dow)}
                    disabled={saveMut.isPending || hasOverlap}
                    className="h-7 text-xs"
                    data-testid={`button-save-day-${dow}`}
                  >
                    {saveMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              {daySlots.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No windows — not available this day</p>
              ) : (
                <div className="space-y-2">
                  <div className="overflow-x-auto">
                  {/* Column headers */}
                  <div className="grid grid-cols-[1fr_1fr_80px_80px_80px_140px_36px] gap-2 px-3 text-xs text-muted-foreground font-medium min-w-[560px]">
                    <span>Start</span><span>End</span><span>Slot min</span><span>Buf ↑</span><span>Buf ↓</span><span>Tier</span><span />
                  </div>
                  {daySlots.map((slot, relIdx) => {
                    const absIdx = slots.indexOf(slot);
                    return (
                      <DaySlotRow
                        key={absIdx}
                        slot={slot}
                        index={relIdx}
                        isOverlapping={overlaps.has(relIdx)}
                        onChange={(updated) => updateSlot(absIdx, updated)}
                        onRemove={() => removeSlot(absIdx)}
                      />
                    );
                  })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Part 2: Leaves & Exceptions tab ──────────────────────────────────────────
function LeavesTab() {
  const { toast } = useToast();
  const [form, setForm] = useState({ startDate: "", endDate: "", reason: "" });

  const { data: leaves = [], isLoading } = useQuery<Leave[]>({
    queryKey: ["/api/provider/time-off"],
  });

  const addMut = useMutation({
    mutationFn: async () => {
      if (!form.startDate || !form.endDate) throw new Error("Start and end date required");
      if (form.endDate < form.startDate) throw new Error("End date must be after start date");
      const res = await apiRequest("POST", "/api/provider/time-off", {
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason || null,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Leave logged", description: "Slots will not be generated for this range." });
      setForm({ startDate: "", endDate: "", reason: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/time-off"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/provider/time-off/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Leave removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/time-off"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log a vacation / blackout</CardTitle>
          <CardDescription>
            Dates in this range will be skipped by the rolling schedule cron — no slots will be generated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <Label className="mb-1 block text-sm">From</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                data-testid="input-leave-start"
              />
            </div>
            <div>
              <Label className="mb-1 block text-sm">To</Label>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                data-testid="input-leave-end"
              />
            </div>
            <div>
              <Label className="mb-1 block text-sm">Reason (optional)</Label>
              <Input
                placeholder="Holiday, personal leave…"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                data-testid="input-leave-reason"
              />
            </div>
          </div>
          <Button
            onClick={() => addMut.mutate()}
            disabled={addMut.isPending || !form.startDate || !form.endDate}
            data-testid="button-add-leave"
            className="gap-1.5"
          >
            {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarOff className="h-4 w-4" />}
            Log leave
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Logged leaves</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (leaves as any[]).length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No leave periods logged.</p>
          ) : (
            <div className="space-y-2">
              {(leaves as any[]).map((leave: any) => (
                <div
                  key={leave.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card"
                  data-testid={`row-leave-${leave.id}`}
                >
                  <div className="flex items-center gap-3">
                    <CalendarOff className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">
                        {leave.start_date ?? leave.startDate} → {leave.end_date ?? leave.endDate}
                      </p>
                      {(leave.reason) && (
                        <p className="text-xs text-muted-foreground">{leave.reason}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10 flex-shrink-0"
                    onClick={() => deleteMut.mutate(leave.id)}
                    disabled={deleteMut.isPending}
                    data-testid={`button-delete-leave-${leave.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Part 3: Surge Pricing Matrix tab ─────────────────────────────────────────
function SurgePricingTab() {
  const { toast } = useToast();

  const { data: prefs, isLoading } = useQuery<any>({
    queryKey: ["/api/provider/profile"],
  });

  const [baseConsultation, setBaseConsultation] = useState<string>("");
  const [baseHomeVisit, setBaseHomeVisit] = useState<string>("");
  const [baseTelemedicine, setBaseTelemedicine] = useState<string>("");

  // Initialise from prefs once
  const consultFee = baseConsultation !== "" ? Number(baseConsultation) : Number(prefs?.clinicFee ?? prefs?.consultationFee ?? 0);
  const homeFee = baseHomeVisit !== "" ? Number(baseHomeVisit) : Number(prefs?.homeVisitFee ?? 0);
  const teleFee = baseTelemedicine !== "" ? Number(baseTelemedicine) : Number(prefs?.telemedicineFee ?? 0);

  const derived = (base: number, tier: PricingTier): number => {
    if (tier === "peak") return Math.round(base * 1.2 * 100) / 100;
    if (tier === "off_peak") return Math.round(base * 0.85 * 100) / 100;
    return Math.round(base * 100) / 100;
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/provider/profile", {
        consultationFee: consultFee,
        homeVisitFee: homeFee,
        telemedicineFee: teleFee,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Base fees saved", description: "Tier prices update automatically." });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/profile"] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  const PriceRow = ({
    label, base, onChange, testPrefix,
  }: { label: string; base: number; onChange: (v: string) => void; testPrefix: string }) => (
    <tr className="border-b last:border-0">
      <td className="py-3 pr-4 font-medium text-sm w-40">{label}</td>
      <td className="py-3 pr-4">
        <Input
          type="number"
          min={0}
          step={0.01}
          className="w-28 h-8 text-sm"
          value={base}
          onChange={(e) => onChange(e.target.value)}
          data-testid={`input-base-${testPrefix}`}
        />
      </td>
      <td className="py-3 pr-4">
        <span className="text-sm text-blue-600 font-mono" data-testid={`text-standard-${testPrefix}`}>{formatInCurrency(derived(base, "standard"), "USD")}</span>
      </td>
      <td className="py-3 pr-4">
        <span className="text-sm text-amber-600 font-mono" data-testid={`text-peak-${testPrefix}`}>{formatInCurrency(derived(base, "peak"), "USD")}</span>
        <span className="text-xs text-muted-foreground ml-1">(+20%)</span>
      </td>
      <td className="py-3">
        <span className="text-sm text-emerald-600 font-mono" data-testid={`text-offpeak-${testPrefix}`}>{formatInCurrency(derived(base, "off_peak"), "USD")}</span>
        <span className="text-xs text-muted-foreground ml-1">(−15%)</span>
      </td>
    </tr>
  );

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold">Surge Pricing Matrix</h3>
        <p className="text-sm text-muted-foreground">
          Set your base fees. Peak and Off-Peak rates are computed automatically. Assign tiers to time windows in the Weekly Template tab.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left py-2 pr-4">Service type</th>
                  <th className="text-left py-2 pr-4">Base (USD)</th>
                  <th className="text-left py-2 pr-4 text-blue-600">Standard</th>
                  <th className="text-left py-2 pr-4 text-amber-600">Peak (+20%)</th>
                  <th className="text-left py-2 text-emerald-600">Off-Peak (−15%)</th>
                </tr>
              </thead>
              <tbody>
                <PriceRow
                  label="Clinic / Consultation"
                  base={consultFee}
                  onChange={setBaseConsultation}
                  testPrefix="consult"
                />
                <PriceRow
                  label="Home Visit"
                  base={homeFee}
                  onChange={setBaseHomeVisit}
                  testPrefix="home"
                />
                <PriceRow
                  label="Telemedicine"
                  base={teleFee}
                  onChange={setBaseTelemedicine}
                  testPrefix="tele"
                />
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex justify-end">
            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              data-testid="button-save-surge-pricing"
              className="gap-1.5"
            >
              {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Save base fees
            </Button>
          </div>
        </CardContent>
      </Card>

      <Alert>
        <Clock className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>How tiers work:</strong> Assign a pricing tier to each time window in the Weekly Template tab. When a client books a slot in a Peak window, the system automatically applies the +20% surcharge to the slot price. Off-Peak windows receive a −15% discount to fill slower hours.
        </AlertDescription>
      </Alert>
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────
export function ProviderTimeEngine() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Time & Revenue Command Center</h2>
        <p className="text-sm text-muted-foreground">
          Manage recurring availability windows, vacation blocks, and dynamic pricing tiers.
        </p>
      </div>

      <Tabs defaultValue="template">
        <TabsList className="mb-4">
          <TabsTrigger value="template" data-testid="tab-time-engine-template">Weekly Template</TabsTrigger>
          <TabsTrigger value="leaves" data-testid="tab-time-engine-leaves">Leaves & Exceptions</TabsTrigger>
          <TabsTrigger value="surge" data-testid="tab-time-engine-surge">Surge Pricing</TabsTrigger>
        </TabsList>

        <TabsContent value="template">
          <WeeklyTemplateTab />
        </TabsContent>
        <TabsContent value="leaves">
          <LeavesTab />
        </TabsContent>
        <TabsContent value="surge">
          <SurgePricingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
