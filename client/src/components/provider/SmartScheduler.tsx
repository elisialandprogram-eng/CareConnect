/**
 * SmartScheduler — unified provider scheduling experience.
 *
 * Tabs:
 *   Schedule  — modality selector, quick templates, bulk apply, per-day weekly grid
 *   Time Off  — date-range blocks with reason categories + single-day exceptions
 *   Settings  — slot duration / buffers / max-per-day / cancellation policy / workload
 *   Insights  — weekly utilisation stats and day breakdown
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calendar, Clock, Settings, TrendingUp, Wand2, Plus, Trash2, Save,
  Briefcase, Sun, Moon, Coffee, Stethoscope, Home, Video, Globe,
  ChevronDown, ChevronUp, AlertCircle, Loader2, BarChart3, Zap,
} from "lucide-react";
import {
  AvailabilityExceptionsCard,
  CancellationPolicyCard,
  WorkloadControlsCard,
} from "@/components/provider/dashboard/ProviderAvailabilityComponents";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TimeWindow {
  start: string;
  end: string;
  slotDurationMins: number;
  bufferBeforeMins: number;
  bufferAfterMins: number;
}

interface DayConfig {
  enabled: boolean;
  windows: TimeWindow[];
}

type WeekMatrix = Record<number, DayConfig>;
type Modality = "none" | "clinic" | "home_visit" | "video";

// ── Constants ──────────────────────────────────────────────────────────────────

const DOW_SHORT  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const ORDERED_DAYS = [1,2,3,4,5,6,0]; // Mon–Sun display order

const QUICK_TEMPLATES = [
  { id:"mf9to5",  label:"Mon–Fri 9–5",  desc:"Standard business week", icon:Briefcase, days:[1,2,3,4,5], start:"09:00", end:"17:00",
    cls:"bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300" },
  { id:"ms9to5",  label:"Mon–Sat 9–5",  desc:"Extended working week",   icon:Calendar,  days:[1,2,3,4,5,6], start:"09:00", end:"17:00",
    cls:"bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100 dark:bg-violet-950 dark:border-violet-800 dark:text-violet-300" },
  { id:"mf8to4",  label:"Mon–Fri 8–4",  desc:"Early shift",             icon:Coffee,    days:[1,2,3,4,5], start:"08:00", end:"16:00",
    cls:"bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300" },
  { id:"weekends",label:"Weekends",      desc:"Sat & Sun only",          icon:Sun,       days:[0,6], start:"09:00", end:"17:00",
    cls:"bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300" },
  { id:"evenings",label:"Evenings",      desc:"Weekday evenings",        icon:Moon,      days:[1,2,3,4,5], start:"17:00", end:"21:00",
    cls:"bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:border-indigo-800 dark:text-indigo-300" },
] as const;

const MODALITY_OPTS: Array<{ value: Modality; label: string; icon: React.ElementType }> = [
  { value:"none",       label:"All Appointments",  icon:Globe },
  { value:"clinic",     label:"Clinic Visits",     icon:Stethoscope },
  { value:"home_visit", label:"Home Visits",        icon:Home },
  { value:"video",      label:"Video Consults",    icon:Video },
];

const TIME_OFF_REASONS: Array<{ value: string; label: string }> = [
  { value:"vacation",       label:"Vacation" },
  { value:"training",       label:"Training / Course" },
  { value:"conference",     label:"Conference" },
  { value:"public_holiday", label:"Public Holiday" },
  { value:"sick_leave",     label:"Sick Leave" },
  { value:"emergency",      label:"Emergency" },
  { value:"personal",       label:"Personal" },
  { value:"other",          label:"Other" },
];

const DURATION_OPTS = [
  { value:15, label:"15 min" },
  { value:20, label:"20 min" },
  { value:30, label:"30 min" },
  { value:45, label:"45 min" },
  { value:60, label:"60 min" },
];

const BUFFER_OPTS = [
  { value:0,  label:"None" },
  { value:5,  label:"5 min" },
  { value:10, label:"10 min" },
  { value:15, label:"15 min" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeDefaultWindow(dur = 30, before = 0, after = 5): TimeWindow {
  return { start:"09:00", end:"17:00", slotDurationMins:dur, bufferBeforeMins:before, bufferAfterMins:after };
}

function calcSlotCount(start: string, end: string, dur: number, bufBefore: number, bufAfter: number): number {
  const toM = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const startM = toM(start);
  const endM = toM(end);
  const step = Math.max(1, dur + bufBefore + bufAfter);
  if (endM <= startM || dur <= 0) return 0;
  let count = 0;
  for (let t = startM; t + dur <= endM; t += step) count++;
  return count;
}

function rawToMatrix(rows: any[], dur = 30, before = 0, after = 5): WeekMatrix {
  const m: WeekMatrix = {};
  for (let d = 0; d < 7; d++) {
    const dayRows = rows.filter(r => (r.day_of_week ?? r.dayOfWeek) === d);
    m[d] = {
      enabled: dayRows.length > 0,
      windows: dayRows.length > 0
        ? dayRows.map((r: any) => ({
            start: r.start_time ?? r.startTime,
            end:   r.end_time   ?? r.endTime,
            slotDurationMins: r.slot_duration_mins ?? r.slotDurationMins ?? dur,
            bufferBeforeMins: r.buffer_before_mins ?? r.bufferBeforeMins ?? before,
            bufferAfterMins:  r.buffer_after_mins  ?? r.bufferAfterMins  ?? after,
          }))
        : [makeDefaultWindow(dur, before, after)],
    };
  }
  return m;
}

function calcWeeklyHours(matrix: WeekMatrix): number {
  let mins = 0;
  for (let d = 0; d < 7; d++) {
    const day = matrix[d];
    if (!day?.enabled) continue;
    for (const w of day.windows) {
      const [sh, sm] = w.start.split(":").map(Number);
      const [eh, em] = w.end.split(":").map(Number);
      mins += Math.max(0, eh * 60 + em - sh * 60 - sm);
    }
  }
  return Math.round(mins / 6) / 10;
}

function formatHm(totalMins: number) {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ── Time-off Manager ───────────────────────────────────────────────────────────

function TimeOffManagerPanel() {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate]     = useState("");
  const [reason, setReason]       = useState("vacation");

  const { data: blocks = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/provider/time-off"],
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/provider/time-off", {
        startDate, endDate, reason,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Time off added" });
      setStartDate("");
      setEndDate("");
      queryClient.invalidateQueries({ queryKey: ["/api/provider/time-off"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/provider/time-off/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Time off removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/time-off"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const canAdd = startDate && endDate && endDate >= startDate;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" /> Add Time Off / Block
        </CardTitle>
        <CardDescription className="text-xs">
          Block out a date range. Patients won't be able to book during blocked periods.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add form */}
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="h-8 text-sm w-36" data-testid="input-timeoff-start" />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              min={startDate} className="h-8 text-sm w-36" data-testid="input-timeoff-end" />
          </div>
          <div className="min-w-[160px]">
            <Label className="text-xs">Category</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-8 text-sm" data-testid="select-timeoff-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_OFF_REASONS.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={() => addMut.mutate()} disabled={!canAdd || addMut.isPending}
            data-testid="btn-add-timeoff">
            {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
            Add Block
          </Button>
        </div>

        <Separator />

        {/* List */}
        {isLoading ? (
          <div className="space-y-2">
            {[0,1].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : blocks.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No upcoming time-off blocks.</p>
        ) : (
          <div className="space-y-2">
            {blocks.map((b: any) => {
              const label = TIME_OFF_REASONS.find(r => r.value === b.reason)?.label ?? b.reason ?? "Block";
              const sameDay = b.startDate === b.endDate;
              return (
                <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="secondary" className="text-[10px] shrink-0">{label}</Badge>
                    <span className="text-xs text-muted-foreground truncate">
                      {sameDay ? b.startDate : `${b.startDate} → ${b.endDate}`}
                    </span>
                  </div>
                  <button
                    onClick={() => delMut.mutate(b.id)}
                    disabled={delMut.isPending}
                    data-testid={`btn-del-timeoff-${b.id}`}
                    className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Slot Settings Panel ────────────────────────────────────────────────────────

interface SlotSettingsPanelProps {
  slotDuration: number; setSlotDuration: (v: number) => void;
  bufferBefore:  number; setBufferBefore:  (v: number) => void;
  bufferAfter:   number; setBufferAfter:   (v: number) => void;
}

function SlotSettingsPanel({ slotDuration, setSlotDuration, bufferBefore, setBufferBefore, bufferAfter, setBufferAfter }: SlotSettingsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Settings className="h-4 w-4 text-primary" /> Appointment Slot Settings
        </CardTitle>
        <CardDescription className="text-xs">
          These defaults are applied when you save or update your schedule.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Slot Duration</Label>
            <Select value={String(slotDuration)} onValueChange={v => setSlotDuration(Number(v))}>
              <SelectTrigger className="h-8 text-sm" data-testid="select-slot-duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">Length of each appointment slot</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Buffer Before</Label>
            <Select value={String(bufferBefore)} onValueChange={v => setBufferBefore(Number(v))}>
              <SelectTrigger className="h-8 text-sm" data-testid="select-buffer-before">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUFFER_OPTS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">Preparation time before each slot</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Buffer After</Label>
            <Select value={String(bufferAfter)} onValueChange={v => setBufferAfter(Number(v))}>
              <SelectTrigger className="h-8 text-sm" data-testid="select-buffer-after">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUFFER_OPTS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">Wrap-up time after each slot</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Insights Panel ─────────────────────────────────────────────────────────────

interface InsightsPanelProps {
  weekMatrix: WeekMatrix;
  weekSummary: any;
  totalHours: number;
  enabledDays: number;
}

function InsightsPanel({ weekMatrix, weekSummary, totalHours, enabledDays }: InsightsPanelProps) {
  const totalSlots   = weekSummary?.totalSlots   ?? 0;
  const bookedSlots  = weekSummary?.bookedSlots  ?? 0;
  const availSlots   = weekSummary?.availableSlots ?? (totalSlots - bookedSlots);
  const utilPct      = totalSlots > 0 ? Math.round((bookedSlots / totalSlots) * 100) : 0;
  const hasData      = weekSummary != null;

  const dayBreakdown: Array<{ dow: number; total: number; booked: number }> =
    weekSummary?.days ?? [];

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-primary">{enabledDays}</p>
            <p className="text-xs text-muted-foreground mt-1">Active days / wk</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-primary">{totalHours}h</p>
            <p className="text-xs text-muted-foreground mt-1">Scheduled / wk</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className={`text-2xl font-bold ${hasData ? "text-primary" : "text-muted-foreground"}`}>
              {hasData ? `${utilPct}%` : "–"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Utilisation this wk</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className={`text-2xl font-bold ${hasData ? "text-primary" : "text-muted-foreground"}`}>
              {hasData ? availSlots : "–"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Slots available</p>
          </CardContent>
        </Card>
      </div>

      {/* Day breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" /> This Week — Slot Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasData ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              No data yet. Book some appointments to see insights here.
            </p>
          ) : dayBreakdown.length > 0 ? (
            <div className="space-y-2">
              {dayBreakdown.map((d: any) => {
                const pct = d.total > 0 ? Math.round((d.booked / d.total) * 100) : 0;
                return (
                  <div key={d.dow} className="flex items-center gap-3">
                    <span className="text-xs w-8 text-muted-foreground shrink-0">{DOW_SHORT[d.dow]}</span>
                    <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-16 text-right">
                      {d.booked}/{d.total} ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {ORDERED_DAYS.map(dow => {
                const day = weekMatrix[dow];
                const isActive = day?.enabled;
                const hrs = isActive
                  ? day.windows.reduce((sum, w) => {
                      const [sh, sm] = w.start.split(":").map(Number);
                      const [eh, em] = w.end.split(":").map(Number);
                      return sum + Math.max(0, eh * 60 + em - sh * 60 - sm);
                    }, 0) : 0;
                return (
                  <div key={dow} className="flex items-center gap-3">
                    <span className="text-xs w-8 text-muted-foreground shrink-0">{DOW_SHORT[dow]}</span>
                    <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                      {isActive && hrs > 0 && (
                        <div
                          className="h-full bg-primary/40 rounded-full"
                          style={{ width: `${Math.min(100, (hrs / 480) * 100)}%` }}
                        />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground w-16 text-right">
                      {isActive ? formatHm(hrs) : "Day off"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function SmartScheduler({ provider }: { provider?: any }) {
  const { toast } = useToast();

  // ── State ──────────────────────────────────────────────────────────────────
  const [modality, setModality]         = useState<Modality>("none");
  const [matrix, setMatrix]             = useState<WeekMatrix>({});
  const [dirtyDays, setDirtyDays]       = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving]         = useState(false);
  const [slotDuration, setSlotDuration] = useState(30);
  const [bufferBefore, setBufferBefore] = useState(0);
  const [bufferAfter, setBufferAfter]   = useState(5);
  const [bulkDays, setBulkDays]         = useState<number[]>([]);
  const [bulkStart, setBulkStart]       = useState("09:00");
  const [bulkEnd, setBulkEnd]           = useState("17:00");
  const [bulkOpen, setBulkOpen]         = useState(false);

  // ── Data ───────────────────────────────────────────────────────────────────
  const modalityParam = modality === "none" ? "none" : modality;
  const templatesQK   = `/api/provider/schedule-templates?modality=${modalityParam}`;

  const { data: rawTemplates = [], isLoading: templatesLoading, refetch: refetchTpl } = useQuery<any[]>({
    queryKey: [templatesQK],
  });

  const today      = new Date();
  const wStart     = new Date(today);
  wStart.setDate(today.getDate() - today.getDay());
  const weekStartStr = wStart.toISOString().split("T")[0];

  const { data: weekSummary } = useQuery<any>({
    queryKey: [`/api/provider/week-slots-summary?weekStart=${weekStartStr}`],
  });

  // Sync matrix when templates or modality change
  useEffect(() => {
    setMatrix(rawToMatrix(rawTemplates, slotDuration, bufferBefore, bufferAfter));
    setDirtyDays(new Set());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawTemplates, modality]);

  // ── Matrix mutations ───────────────────────────────────────────────────────
  const markDirty = useCallback((dow: number) => {
    setDirtyDays(s => new Set([...s, dow]));
  }, []);

  const toggleDay = useCallback((dow: number) => {
    setMatrix(m => ({ ...m, [dow]: { ...m[dow], enabled: !m[dow]?.enabled } }));
    markDirty(dow);
  }, [markDirty]);

  const updateWindow = useCallback((dow: number, idx: number, field: keyof TimeWindow, value: string | number) => {
    setMatrix(m => {
      const windows = [...m[dow].windows];
      windows[idx] = { ...windows[idx], [field]: value };
      return { ...m, [dow]: { ...m[dow], windows } };
    });
    markDirty(dow);
  }, [markDirty]);

  const addWindow = useCallback((dow: number) => {
    setMatrix(m => {
      const day = m[dow];
      const last = day.windows[day.windows.length - 1];
      const [eh, em] = (last?.end ?? "17:00").split(":").map(Number);
      const newStart = last?.end ?? "14:00";
      const newEndH  = Math.min(eh + 2, 22);
      const newEnd   = `${String(newEndH).padStart(2,"0")}:${String(em).padStart(2,"0")}`;
      return {
        ...m,
        [dow]: {
          ...day,
          windows: [
            ...day.windows,
            { start: newStart, end: newEnd, slotDurationMins: slotDuration, bufferBeforeMins: bufferBefore, bufferAfterMins: bufferAfter },
          ],
        },
      };
    });
    markDirty(dow);
  }, [slotDuration, bufferBefore, bufferAfter, markDirty]);

  const removeWindow = useCallback((dow: number, idx: number) => {
    setMatrix(m => {
      const windows = m[dow].windows.filter((_, i) => i !== idx);
      return {
        ...m,
        [dow]: {
          ...m[dow],
          windows: windows.length ? windows : [makeDefaultWindow(slotDuration, bufferBefore, bufferAfter)],
        },
      };
    });
    markDirty(dow);
  }, [slotDuration, bufferBefore, bufferAfter, markDirty]);

  // ── Quick template apply ───────────────────────────────────────────────────
  const applyQuickTemplate = useCallback((tpl: typeof QUICK_TEMPLATES[number]) => {
    const newMatrix: WeekMatrix = {};
    for (let d = 0; d < 7; d++) {
      if ((tpl.days as unknown as number[]).includes(d)) {
        newMatrix[d] = {
          enabled: true,
          windows: [{ start: tpl.start, end: tpl.end, slotDurationMins: slotDuration, bufferBeforeMins: bufferBefore, bufferAfterMins: bufferAfter }],
        };
      } else {
        newMatrix[d] = { ...(matrix[d] ?? { enabled: false, windows: [makeDefaultWindow()] }), enabled: false };
      }
    }
    setMatrix(newMatrix);
    setDirtyDays(new Set([0,1,2,3,4,5,6]));
    toast({ title: `Template applied: ${tpl.label}`, description: "Review the schedule below, then click Save." });
  }, [matrix, slotDuration, bufferBefore, bufferAfter, toast]);

  // ── Bulk apply ─────────────────────────────────────────────────────────────
  const applyBulk = useCallback(() => {
    if (!bulkDays.length) return;
    const patch: WeekMatrix = { ...matrix };
    for (const d of bulkDays) {
      patch[d] = {
        enabled: true,
        windows: [{ start: bulkStart, end: bulkEnd, slotDurationMins: slotDuration, bufferBeforeMins: bufferBefore, bufferAfterMins: bufferAfter }],
      };
    }
    setMatrix(patch);
    setDirtyDays(s => new Set([...s, ...bulkDays]));
    setBulkDays([]);
    setBulkOpen(false);
    toast({ title: `Hours applied to ${bulkDays.length} day(s)` });
  }, [bulkDays, bulkStart, bulkEnd, slotDuration, bufferBefore, bufferAfter, matrix, toast]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const saveSchedule = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    const days = dirtyDays.size > 0 ? Array.from(dirtyDays) : ORDERED_DAYS;
    const modalityVal: string | null = modality === "none" ? null : modality;
    try {
      for (const dow of days) {
        const day = matrix[dow];
        if (!day?.enabled) {
          const mParam = modalityVal ?? "none";
          await apiRequest("DELETE", `/api/provider/schedule-templates/day/${dow}?modality=${mParam}`);
        } else {
          const windows = day.windows.map(w => ({
            startTime: w.start,
            endTime:   w.end,
            slotDurationMins:  w.slotDurationMins,
            bufferBeforeMins:  w.bufferBeforeMins,
            bufferAfterMins:   w.bufferAfterMins,
          }));
          await apiRequest("POST", "/api/provider/schedule-templates/batch", {
            dayOfWeek: dow, modality: modalityVal, windows,
          });
        }
      }
      setDirtyDays(new Set());
      refetchTpl();
      queryClient.invalidateQueries({ queryKey: ["/api/provider/schedule-templates"], exact: false });
      toast({ title: "Schedule saved ✓", description: "Slots will be regenerated within a minute." });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, dirtyDays, matrix, modality, toast, refetchTpl]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const totalHours  = useMemo(() => calcWeeklyHours(matrix), [matrix]);
  const enabledDays = useMemo(() => Object.values(matrix).filter(d => d?.enabled).length, [matrix]);
  const hasChanges  = dirtyDays.size > 0;

  const insightUtilPct = weekSummary?.totalSlots > 0
    ? Math.round((weekSummary.bookedSlots / weekSummary.totalSlots) * 100) : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  if (templatesLoading) {
    return (
      <Card>
        <CardContent className="py-8 space-y-3">
          <Skeleton className="h-8 w-48" />
          {[0,1,2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overview bar */}
      <Card>
        <CardContent className="py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm leading-none">Smart Scheduler</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {enabledDays} day{enabledDays !== 1 ? "s" : ""} active · {totalHours}h/wk
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {hasChanges && (
                <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 text-xs">
                  <AlertCircle className="h-3 w-3 mr-1" /> Unsaved changes
                </Badge>
              )}
              {insightUtilPct !== null && (
                <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50 text-xs">
                  <TrendingUp className="h-3 w-3 mr-1" /> {insightUtilPct}% utilised this week
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="schedule" className="space-y-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="schedule" data-testid="tab-scheduler-schedule" className="gap-1.5">
            <Calendar className="h-3.5 w-3.5" /> Schedule
          </TabsTrigger>
          <TabsTrigger value="timeoff" data-testid="tab-scheduler-timeoff" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Time Off
          </TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-scheduler-settings" className="gap-1.5">
            <Settings className="h-3.5 w-3.5" /> Settings
          </TabsTrigger>
          <TabsTrigger value="insights" data-testid="tab-scheduler-insights" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Insights
          </TabsTrigger>
        </TabsList>

        {/* ── SCHEDULE TAB ───────────────────────────────────────────────── */}
        <TabsContent value="schedule" className="space-y-4">

          {/* Modality selector */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Appointment Type Schedule
              </p>
              <div className="flex flex-wrap gap-2">
                {MODALITY_OPTS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setModality(value)}
                    data-testid={`btn-modality-${value}`}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      modality === value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border hover:bg-accent text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
              {modality !== "none" && (
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  Editing schedule for <strong>{MODALITY_OPTS.find(m => m.value === modality)?.label}</strong> only.
                  The general schedule (All Appointments) applies when no modality-specific schedule is set.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Quick templates */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">Quick Templates</CardTitle>
              </div>
              <CardDescription className="text-xs">
                One-click presets — click to populate the schedule, then review and save.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {QUICK_TEMPLATES.map((tpl) => {
                  const Icon = tpl.icon;
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => applyQuickTemplate(tpl)}
                      data-testid={`btn-tpl-${tpl.id}`}
                      className={`flex-shrink-0 flex flex-col items-start gap-1 border rounded-lg px-3 py-2.5 text-left transition-colors ${tpl.cls}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5" />
                        <span className="font-semibold text-xs">{tpl.label}</span>
                      </div>
                      <span className="text-[10px] opacity-70">{tpl.desc}</span>
                      <span className="text-[10px] font-medium opacity-90">{tpl.start}–{tpl.end}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Bulk apply */}
          <Card>
            <button
              className="w-full text-left"
              onClick={() => setBulkOpen(o => !o)}
              data-testid="btn-bulk-toggle"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-500" />
                    <CardTitle className="text-sm">Bulk Apply Hours</CardTitle>
                  </div>
                  {bulkOpen
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
                {!bulkOpen && (
                  <p className="text-xs text-muted-foreground">Apply the same hours to multiple days at once</p>
                )}
              </CardHeader>
            </button>
            {bulkOpen && (
              <CardContent className="pt-0 space-y-3">
                <p className="text-xs text-muted-foreground">Select days:</p>
                <div className="flex flex-wrap gap-2">
                  {ORDERED_DAYS.map(dow => (
                    <button
                      key={dow}
                      onClick={() => setBulkDays(d => d.includes(dow) ? d.filter(x => x !== dow) : [...d, dow])}
                      data-testid={`btn-bulk-day-${dow}`}
                      className={`w-10 h-10 rounded-full text-xs font-semibold border transition-colors ${
                        bulkDays.includes(dow)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-accent"
                      }`}
                    >
                      {DOW_SHORT[dow]}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Start time</Label>
                    <Input type="time" value={bulkStart} onChange={e => setBulkStart(e.target.value)}
                      className="w-32 h-8 text-sm" data-testid="input-bulk-start" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">End time</Label>
                    <Input type="time" value={bulkEnd} onChange={e => setBulkEnd(e.target.value)}
                      className="w-32 h-8 text-sm" data-testid="input-bulk-end" />
                  </div>
                  <Button
                    size="sm"
                    onClick={applyBulk}
                    disabled={!bulkDays.length}
                    data-testid="btn-bulk-apply"
                  >
                    Apply to {bulkDays.length || 0} day{bulkDays.length !== 1 ? "s" : ""}
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Weekly schedule grid */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Weekly Schedule</CardTitle>
              <CardDescription className="text-xs">
                Enable days and set hours. Add multiple windows per day to create breaks.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 p-3 sm:p-6">
              {ORDERED_DAYS.map(dow => {
                const day = matrix[dow] ?? { enabled: false, windows: [makeDefaultWindow(slotDuration, bufferBefore, bufferAfter)] };
                return (
                  <div
                    key={dow}
                    className={`rounded-lg border transition-colors ${day.enabled ? "bg-background" : "bg-muted/20 border-dashed"}`}
                  >
                    <div className="flex items-start gap-2 px-3 py-2.5">
                      {/* Day toggle */}
                      <div className="flex items-center gap-2 pt-0.5">
                        <Switch
                          checked={!!day.enabled}
                          onCheckedChange={() => toggleDay(dow)}
                          data-testid={`switch-day-${dow}`}
                        />
                        <span className={`text-xs font-semibold w-8 ${day.enabled ? "text-foreground" : "text-muted-foreground"}`}>
                          {DOW_SHORT[dow]}
                        </span>
                      </div>

                      {/* Content */}
                      {!day.enabled ? (
                        <span className="text-xs text-muted-foreground italic pt-0.5">Day off</span>
                      ) : (
                        <div className="flex-1 min-w-0 space-y-1.5">
                          {day.windows.map((w, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 flex-wrap">
                              <Input
                                type="time"
                                value={w.start}
                                onChange={e => updateWindow(dow, idx, "start", e.target.value)}
                                className="w-28 h-7 text-sm px-2"
                                data-testid={`input-start-${dow}-${idx}`}
                              />
                              <span className="text-xs text-muted-foreground shrink-0">→</span>
                              <Input
                                type="time"
                                value={w.end}
                                onChange={e => updateWindow(dow, idx, "end", e.target.value)}
                                className="w-28 h-7 text-sm px-2"
                                data-testid={`input-end-${dow}-${idx}`}
                              />
                              <span className="text-muted-foreground/40 text-xs shrink-0 hidden sm:inline">|</span>
                              {/* Slot duration per window */}
                              <Select
                                value={String(w.slotDurationMins)}
                                onValueChange={v => updateWindow(dow, idx, "slotDurationMins", Number(v))}
                              >
                                <SelectTrigger className="w-[72px] h-7 text-xs" title="Slot duration" data-testid={`select-dur-${dow}-${idx}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {[10,15,20,30,45,60,90,120].map(d => (
                                    <SelectItem key={d} value={String(d)}>{d} min</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {/* Buffer before */}
                              <Select
                                value={String(w.bufferBeforeMins)}
                                onValueChange={v => updateWindow(dow, idx, "bufferBeforeMins", Number(v))}
                              >
                                <SelectTrigger className="w-[58px] h-7 text-xs" title="Buffer before slot" data-testid={`select-buf-before-${dow}-${idx}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {[0,5,10,15,20,30].map(b => (
                                    <SelectItem key={b} value={String(b)}>{b === 0 ? "0↑" : `${b}↑`}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {/* Buffer after */}
                              <Select
                                value={String(w.bufferAfterMins)}
                                onValueChange={v => updateWindow(dow, idx, "bufferAfterMins", Number(v))}
                              >
                                <SelectTrigger className="w-[58px] h-7 text-xs" title="Buffer after slot" data-testid={`select-buf-after-${dow}-${idx}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {[0,5,10,15,20,30].map(b => (
                                    <SelectItem key={b} value={String(b)}>{b === 0 ? "0↓" : `${b}↓`}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {/* Live slot count preview */}
                              <Badge
                                variant="outline"
                                className="text-xs shrink-0 text-emerald-600 border-emerald-200 dark:border-emerald-800 dark:text-emerald-400"
                                title="Estimated slots generated for this window"
                              >
                                ~{calcSlotCount(w.start, w.end, w.slotDurationMins, w.bufferBeforeMins, w.bufferAfterMins)} slots
                              </Badge>
                              {day.windows.length > 1 && (
                                <button
                                  onClick={() => removeWindow(dow, idx)}
                                  data-testid={`btn-rm-win-${dow}-${idx}`}
                                  className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            onClick={() => addWindow(dow)}
                            data-testid={`btn-add-break-${dow}`}
                            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors px-2 py-0.5 rounded border border-dashed border-border hover:border-primary"
                          >
                            <Plus className="h-3 w-3" /> Add break
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Save bar */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {hasChanges
                ? `${dirtyDays.size} day${dirtyDays.size !== 1 ? "s" : ""} modified`
                : "No pending changes"}
            </p>
            <Button
              onClick={saveSchedule}
              disabled={isSaving}
              data-testid="btn-save-schedule"
              className="min-w-[130px]"
            >
              {isSaving
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…</>
                : <><Save className="h-4 w-4 mr-2" /> Save Schedule</>}
            </Button>
          </div>
        </TabsContent>

        {/* ── TIME OFF TAB ──────────────────────────────────────────────── */}
        <TabsContent value="timeoff" className="space-y-4">
          <TimeOffManagerPanel />
          <AvailabilityExceptionsCard />
        </TabsContent>

        {/* ── SETTINGS TAB ─────────────────────────────────────────────── */}
        <TabsContent value="settings" className="space-y-4">
          <SlotSettingsPanel
            slotDuration={slotDuration} setSlotDuration={setSlotDuration}
            bufferBefore={bufferBefore}  setBufferBefore={setBufferBefore}
            bufferAfter={bufferAfter}    setBufferAfter={setBufferAfter}
          />
          <CancellationPolicyCard />
          <WorkloadControlsCard provider={provider} />
        </TabsContent>

        {/* ── INSIGHTS TAB ─────────────────────────────────────────────── */}
        <TabsContent value="insights" className="space-y-4">
          <InsightsPanel
            weekMatrix={matrix}
            weekSummary={weekSummary}
            totalHours={totalHours}
            enabledDays={enabledDays}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
