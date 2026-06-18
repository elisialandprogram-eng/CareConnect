import { formatDate } from "@/lib/datetime";
import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, invalidateProviderProfile } from "@/lib/queryClient";
import { QK } from "@/lib/query-keys";
import { WeeklyScheduleGrid, type WeeklySchedule } from "@/components/weekly-schedule-grid";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, Save, CalendarPlus, Plus, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  AlertTriangle, CalendarDays, Trash2, Copy, ClipboardPaste, Calendar,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  SlotConflictPreviewDialog,
  type ConflictPreviewResult,
  type PublishMode,
} from "@/components/slot-conflict-preview-dialog";

// ─── Structured schedule editor helpers ──────────────────────────────────────
const SE_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type SEDayKey = (typeof SE_DAY_KEYS)[number];
const SE_DAY_LABEL: Record<SEDayKey, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};
const SE_DAY_SHORT: Record<SEDayKey, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

type SEWindow = { start: string; end: string };
type SEDayState = { enabled: boolean; windows: SEWindow[] };
type SEState = Record<SEDayKey, SEDayState>;

const SE_PRESETS = [
  { label: "Morning",   windows: [{ start: "08:00", end: "13:00" }] },
  { label: "Afternoon", windows: [{ start: "13:00", end: "18:00" }] },
  { label: "Full day",  windows: [{ start: "08:00", end: "18:00" }] },
  { label: "Business",  windows: [{ start: "09:00", end: "17:00" }] },
  { label: "Split",     windows: [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "18:00" }] },
] as const;

function seParseSchedule(raw: any): Partial<WeeklySchedule> {
  if (!raw) return {};
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return {}; } }
  return raw as Partial<WeeklySchedule>;
}

function seInitState(raw?: any): SEState {
  const schedule = seParseSchedule(raw);
  return SE_DAY_KEYS.reduce((acc, d) => {
    const entry = (schedule as any)[d];
    if (!entry?.enabled) {
      acc[d] = { enabled: false, windows: [{ start: "09:00", end: "17:00" }] };
    } else {
      const wins: SEWindow[] = Array.isArray(entry.windows) && entry.windows.length > 0
        ? entry.windows
        : [{ start: entry.start ?? "09:00", end: entry.end ?? "17:00" }];
      acc[d] = { enabled: true, windows: wins };
    }
    return acc;
  }, {} as SEState);
}

function seToWeeklySchedule(state: SEState): WeeklySchedule {
  return SE_DAY_KEYS.reduce((acc, d) => {
    const day = state[d];
    const valid = day.windows.filter(w => w.start && w.end && w.start < w.end);
    if (!day.enabled || valid.length === 0) {
      (acc as any)[d] = { start: "09:00", end: "17:00", enabled: false };
    } else {
      const sorted = [...valid].sort((a, b) => a.start.localeCompare(b.start));
      (acc as any)[d] = {
        start: sorted[0].start,
        end: sorted[sorted.length - 1].end,
        enabled: true,
        windows: sorted,
      };
    }
    return acc;
  }, {} as WeeklySchedule);
}

export function StructuredScheduleEditor({
  initialSchedule,
  onSave,
  isSaving,
  onPublish,
  isPendingPublish,
}: {
  initialSchedule: any;
  onSave: (s: WeeklySchedule) => void;
  isSaving?: boolean;
  onPublish: (payload: { dates: string[]; slots: { startTime: string; endTime: string }[]; replaceExisting: boolean }) => void;
  isPendingPublish?: boolean;
}) {
  const { toast } = useToast();
  const [state, setState] = useState<SEState>(() => seInitState(initialSchedule));
  const [isDirty, setIsDirty] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Slot-conflict preview state
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [conflictData, setConflictData] = useState<ConflictPreviewResult | null>(null);
  const [pendingPayload, setPendingPayload] = useState<{
    dates: string[];
    slots: { startTime: string; endTime: string }[];
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // ── Calendar toolbar state ────────────────────────────────────────────────
  const [clearWeekDialogOpen, setClearWeekDialogOpen] = useState(false);
  const [copiedWeekStart, setCopiedWeekStart] = useState<string | null>(null);
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [pasteTargetDate, setPasteTargetDate] = useState<string>("");
  const [publishWeekOffset, setPublishWeekOffset] = useState(0);

  // Track when publish completes so we can refresh the week summary badge
  const prevPendingPublish = useRef(false);
  useEffect(() => {
    if (prevPendingPublish.current && !isPendingPublish) {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/week-slots-summary"], exact: false });
    }
    prevPendingPublish.current = !!isPendingPublish;
  }, [isPendingPublish]);

  // Returns the Monday of the week that starts 'n' full weeks from today's Monday.
  // n=0 → this week, n=1 → next week, etc.
  const getWeekMonday = (offsetWeeks = 0): string => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const dow = d.getDay(); // 0=Sun
    const daysToMon = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + daysToMon + offsetWeeks * 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const thisWeekStart = getWeekMonday(0);

  const clearWeekMut = useMutation({
    mutationFn: async (weekStart: string) => {
      const res = await apiRequest(
        "DELETE",
        `/api/availability/range?startDate=${weekStart}&endDate=${getWeekEnd(weekStart)}`,
      );
      return res.json() as Promise<{ deletedCount: number; preservedCount: number }>;
    },
    onSuccess: (data) => {
      toast({
        title: "Week cleared",
        description: `Removed ${data?.deletedCount ?? 0} open slot(s). ${data?.preservedCount ?? 0} booked/held slot(s) kept.`,
      });
      queryClient.invalidateQueries({ queryKey: QK.providerAvailability() });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/week-slots-summary"], exact: false });
    },
    onError: () => toast({ title: "Failed to clear week", variant: "destructive" }),
  });

  const cloneWeekMut = useMutation({
    mutationFn: async (targetWeekStartDate: string) => {
      const res = await apiRequest("POST", "/api/availability/clone", {
        sourceWeekStartDate: copiedWeekStart,
        targetWeekStartDate,
      });
      return res.json() as Promise<{ clonedCount: number; skippedCount: number; clearedCount: number; preservedInTarget: number }>;
    },
    onSuccess: (data) => {
      toast({
        title: "Schedule pasted",
        description: `Cloned ${data?.clonedCount ?? 0} slot(s) to target week. ${data?.preservedInTarget ?? 0} protected slot(s) kept.`,
      });
      queryClient.invalidateQueries({ queryKey: QK.providerAvailability() });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/week-slots-summary"], exact: false });
      setPasteDialogOpen(false);
    },
    onError: () => toast({ title: "Failed to paste schedule", variant: "destructive" }),
  });

  // Add 6 days to a YYYY-MM-DD string to get Sunday of that week
  const getWeekEnd = (monday: string): string => {
    const d = new Date(monday);
    d.setDate(d.getDate() + 6);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const fmtWeekRange = (monday: string): string => {
    const start = new Date(monday);
    const end = new Date(monday);
    end.setDate(end.getDate() + 6);
    const fmtD = (d: Date) =>
      formatDate(d, { day: "numeric", month: "short", year: "numeric" });
    return `${fmtD(start)} – ${fmtD(end)}`;
  };

  const selectedWeekStart = getWeekMonday(publishWeekOffset);
  const selectedWeekEnd = getWeekEnd(selectedWeekStart);
  const isPastWeek = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(selectedWeekEnd + "T00:00:00") < today;
  })();

  // Per-day slot counts for the selected week (used by week navigator badges)
  type WeekSummary = {
    totalSlots: number; bookedSlots: number; availableSlots: number;
    weekStart: string; weekEnd: string;
    days: Array<{ date: string; dayKey: string; total: number; booked: number; available: number }>;
  };
  const { data: weekSummary, isLoading: summaryLoading } = useQuery<WeekSummary | null>({
    queryKey: ["/api/provider/week-slots-summary", selectedWeekStart],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/provider/week-slots-summary?weekStart=${selectedWeekStart}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30_000,
  });

  const currentSchedule = seToWeeklySchedule(state);

  const toggleDay = (d: SEDayKey) => {
    setState(s => ({ ...s, [d]: { ...s[d], enabled: !s[d].enabled } }));
    setIsDirty(true);
  };

  const updateWindow = (d: SEDayKey, wi: number, field: "start" | "end", val: string) => {
    setState(s => {
      const wins = s[d].windows.map((w, i) => i === wi ? { ...w, [field]: val } : w);
      return { ...s, [d]: { ...s[d], windows: wins } };
    });
    setIsDirty(true);
  };

  const addWindow = (d: SEDayKey) => {
    setState(s => {
      const last = s[d].windows[s[d].windows.length - 1];
      const newStart = last?.end || "09:00";
      const [h, m] = newStart.split(":").map(Number);
      const newEnd = `${String(Math.min((h ?? 0) + 1, 23)).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`;
      return { ...s, [d]: { ...s[d], windows: [...s[d].windows, { start: newStart, end: newEnd }] } };
    });
    setIsDirty(true);
  };

  const removeWindow = (d: SEDayKey, wi: number) => {
    setState(s => ({ ...s, [d]: { ...s[d], windows: s[d].windows.filter((_, i) => i !== wi) } }));
    setIsDirty(true);
  };

  const applyPreset = (d: SEDayKey, preset: { windows: readonly { start: string; end: string }[] }) => {
    setState(s => ({ ...s, [d]: { enabled: true, windows: preset.windows.map(w => ({ ...w })) } }));
    setIsDirty(true);
  };

  const copyFromPrev = (d: SEDayKey) => {
    const idx = SE_DAY_KEYS.indexOf(d);
    if (idx <= 0) return;
    const prev = SE_DAY_KEYS[idx - 1];
    setState(s => ({ ...s, [d]: { ...s[prev], windows: s[prev].windows.map(w => ({ ...w })) } }));
    setIsDirty(true);
  };

  const handlePublish = async () => {
    const weekStart = new Date(selectedWeekStart + "T00:00:00");
    const dates: string[] = [];
    const dayMap: Record<number, SEDayKey> = { 0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat" };
    const toLocalDateStr = (d: Date): string => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const key = dayMap[d.getDay()];
      if (key && currentSchedule[key]?.enabled) {
        dates.push(toLocalDateStr(d));
      }
    }
    const first = Object.values(currentSchedule).find((v: any) => v?.enabled);
    if (!first || dates.length === 0) {
      toast({ title: "No days enabled", description: "Enable at least one day in your schedule above.", variant: "destructive" });
      return;
    }
    const slots = (first as any).windows?.length
      ? (first as any).windows.map((w: any) => ({ startTime: w.start, endTime: w.end }))
      : [{ startTime: (first as any).start, endTime: (first as any).end }];

    // Fetch conflict preview before publishing
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/availability/bulk/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dates, slots }),
      });
      if (res.ok) {
        const data: ConflictPreviewResult = await res.json();
        setConflictData(data);
        setPendingPayload({ dates, slots });
        setConflictDialogOpen(true);
      } else {
        // Preview failed — fall back to direct publish
        onPublish({ dates, slots, replaceExisting });
      }
    } catch {
      // Network error fallback — proceed without preview
      onPublish({ dates, slots, replaceExisting });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConflictConfirm = (mode: PublishMode) => {
    if (!pendingPayload || !conflictData) return;
    let finalDates = pendingPayload.dates;
    let finalReplace = false;
    if (mode === "replace") {
      finalReplace = true;
    } else if (mode === "skip") {
      finalDates = finalDates.filter(
        (d) => !conflictData.summary.find((s) => s.date === d && s.hasConflict),
      );
    }
    onPublish({ dates: finalDates, slots: pendingPayload.slots, replaceExisting: finalReplace });
    setConflictDialogOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {SE_DAY_KEYS.map((d, idx) => {
          const day = state[d];
          return (
            <div key={d} className="rounded-xl border border-border p-3" data-testid={`day-row-${d}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <Switch checked={day.enabled} onCheckedChange={() => toggleDay(d)}
                  data-testid={`switch-day-${d}`} />
                <span className={`text-sm font-semibold min-w-[90px] ${day.enabled ? "text-foreground" : "text-muted-foreground"}`}>
                  {SE_DAY_LABEL[d]}
                </span>
                {!day.enabled && (
                  <span className="text-xs text-muted-foreground">Unavailable</span>
                )}
                {day.enabled && (
                  <div className="flex items-center gap-1 ml-auto flex-wrap">
                    {SE_PRESETS.map(p => (
                      <button key={p.label} type="button"
                        className="text-[10px] px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                        onClick={() => applyPreset(d, p)}
                        data-testid={`button-preset-day-${d}-${p.label.toLowerCase().replace(/\s+/g, "-")}`}>
                        {p.label}
                      </button>
                    ))}
                    {idx > 0 && (
                      <button type="button"
                        className="text-[10px] px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                        onClick={() => copyFromPrev(d)}
                        title={`Same as ${SE_DAY_SHORT[SE_DAY_KEYS[idx - 1]]}`}
                        data-testid={`button-copy-prev-${d}`}>
                        ↑ Copy {SE_DAY_SHORT[SE_DAY_KEYS[idx - 1]]}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {day.enabled && (
                <div className="mt-3 space-y-2 pl-9">
                  {day.windows.map((w, wi) => (
                    <div key={wi} className="flex items-center gap-2 flex-wrap" data-testid={`window-${d}-${wi}`}>
                      <Input type="time" value={w.start}
                        onChange={e => updateWindow(d, wi, "start", e.target.value)}
                        className="w-28 h-8 text-sm tabular-nums"
                        data-testid={`input-win-start-${d}-${wi}`} />
                      <span className="text-sm text-muted-foreground">–</span>
                      <Input type="time" value={w.end}
                        onChange={e => updateWindow(d, wi, "end", e.target.value)}
                        className="w-28 h-8 text-sm tabular-nums"
                        data-testid={`input-win-end-${d}-${wi}`} />
                      {day.windows.length > 1 && (
                        <Button size="sm" variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeWindow(d, wi)}
                          data-testid={`button-remove-window-${d}-${wi}`}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {wi === 0 ? "main hours" : "after break"}
                      </span>
                    </div>
                  ))}
                  <button type="button"
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors mt-1"
                    onClick={() => addWindow(d)}
                    data-testid={`button-add-window-${d}`}>
                    <Plus className="h-3 w-3" /> Add break / extra window
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        {isDirty
          ? <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">● Unsaved changes</p>
          : <p className="text-xs text-muted-foreground">Schedule up to date</p>}
        <Button className="gap-2 rounded-xl" disabled={isSaving || !isDirty}
          onClick={() => { onSave(currentSchedule); setIsDirty(false); }}
          data-testid="button-save-schedule">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save schedule
        </Button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <button type="button"
          className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
          onClick={() => setPreviewOpen(v => !v)}
          data-testid="button-toggle-preview">
          <span className="text-sm font-medium">Visual preview</span>
          {previewOpen
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {previewOpen && (
          <div className="px-4 pb-4 border-t border-border">
            <WeeklyScheduleGrid schedule={currentSchedule} onSave={() => {}} onPublish={() => {}} readOnly />
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
        <div>
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Publish to calendar
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Generate bookable slots for the selected week based on your schedule above.
          </p>
        </div>

        {/* ── Week navigator ───────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-background overflow-hidden">
          {/* Arrow + week label row */}
          <div className="flex items-center justify-between gap-2 px-3 py-2.5">
            <button
              type="button"
              className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors shrink-0"
              onClick={() => setPublishWeekOffset(o => o - 1)}
              data-testid="button-prev-week"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-center flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{fmtWeekRange(selectedWeekStart)}</p>
              <p className="text-[10px] text-muted-foreground">
                {publishWeekOffset === 0
                  ? "Current week"
                  : publishWeekOffset === 1
                  ? "Next week"
                  : publishWeekOffset < 0
                  ? `${Math.abs(publishWeekOffset)} week(s) ago`
                  : `${publishWeekOffset} weeks ahead`}
                {isPastWeek && " · past"}
              </p>
            </div>
            <button
              type="button"
              className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors shrink-0"
              onClick={() => setPublishWeekOffset(o => o + 1)}
              data-testid="button-next-week"
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Per-day slot count badges */}
          <div className="border-t border-border px-3 py-2 bg-muted/30">
            {summaryLoading ? (
              <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground py-0.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking slots…
              </div>
            ) : weekSummary && weekSummary.totalSlots > 0 ? (
              <div className="space-y-1.5">
                {/* Aggregate row */}
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Week totals</span>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">{weekSummary.availableSlots} free</span>
                    {weekSummary.bookedSlots > 0 && (
                      <span className="text-blue-600 dark:text-blue-400 font-medium">{weekSummary.bookedSlots} booked</span>
                    )}
                    <span className="text-muted-foreground">{weekSummary.totalSlots} total</span>
                  </div>
                </div>
                {/* Per-day mini strip */}
                <div className="flex gap-1">
                  {(["mon","tue","wed","thu","fri","sat","sun"] as const).map(dk => {
                    const dayData = weekSummary.days.find(d => d.dayKey === dk);
                    return (
                      <div
                        key={dk}
                        className={`flex-1 rounded text-center py-1 text-[9px] font-medium transition-colors ${
                          dayData
                            ? dayData.booked > 0
                              ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                              : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                            : "bg-muted/60 text-muted-foreground/50"
                        }`}
                        title={dayData ? `${dk}: ${dayData.available} free, ${dayData.booked} booked` : `${dk}: no slots`}
                      >
                        {SE_DAY_SHORT[dk].slice(0,1)}
                        {dayData ? (
                          <span className="block text-[8px]">{dayData.total}</span>
                        ) : (
                          <span className="block text-[8px]">—</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground text-center py-0.5">No slots published for this week</p>
            )}
          </div>
        </div>

        {/* Jump to current week shortcut */}
        {publishWeekOffset !== 0 && (
          <button
            type="button"
            className="text-[10px] text-primary hover:underline"
            onClick={() => setPublishWeekOffset(0)}
            data-testid="button-jump-current-week"
          >
            ↩ Jump to current week
          </button>
        )}
        {isPastWeek && (
          <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            This week is in the past — slots will be created as historical records.
          </div>
        )}

        {/* ── Calendar toolbar ──────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 rounded-lg text-destructive border-destructive/40 hover:bg-destructive/10"
            onClick={() => setClearWeekDialogOpen(true)}
            disabled={clearWeekMut.isPending}
            data-testid="button-clear-week"
          >
            {clearWeekMut.isPending
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Trash2 className="h-3 w-3" />}
            Clear Week
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 rounded-lg"
            onClick={() => {
              setCopiedWeekStart(selectedWeekStart);
              toast({ title: "Week copied", description: `Schedule for ${fmtWeekRange(selectedWeekStart)} captured.` });
            }}
            data-testid="button-copy-schedule"
          >
            <Copy className="h-3 w-3" />
            {copiedWeekStart === selectedWeekStart ? "Copied ✓" : "Copy Week"}
          </Button>
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs gap-1.5 rounded-lg"
            disabled={!copiedWeekStart || cloneWeekMut.isPending}
            onClick={() => {
              setPasteTargetDate(getWeekMonday(publishWeekOffset + 1));
              setPasteDialogOpen(true);
            }}
            data-testid="button-paste-schedule"
          >
            {cloneWeekMut.isPending
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <ClipboardPaste className="h-3 w-3" />}
            Paste to Week
          </Button>
        </div>

        {copiedWeekStart && (
          <p className="text-xs text-primary/80 font-medium bg-primary/5 border border-primary/20 rounded-lg px-3 py-1.5">
            📋 Clipboard: week of {fmtWeekRange(copiedWeekStart)}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Switch id="replace-existing-se" checked={replaceExisting} onCheckedChange={setReplaceExisting}
            data-testid="switch-replace-existing" />
          <Label htmlFor="replace-existing-se" className="text-xs cursor-pointer">
            Override open slots when publishing (safe — keeps booked slots)
          </Label>
        </div>

        <Button
          variant="default"
          className="gap-2 rounded-xl w-full"
          onClick={handlePublish}
          disabled={isPendingPublish || previewLoading}
          data-testid="button-publish-slots"
        >
          {(isPendingPublish || previewLoading)
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <CalendarPlus className="h-4 w-4" />}
          {previewLoading
            ? "Checking conflicts…"
            : publishWeekOffset === 0
            ? "Publish this week's slots"
            : publishWeekOffset === 1
            ? "Publish next week's slots"
            : `Publish slots for ${fmtWeekRange(selectedWeekStart)}`}
        </Button>
      </div>

      {/* ── Clear Week confirmation dialog ────────────────────────────── */}
      <Dialog open={clearWeekDialogOpen} onOpenChange={setClearWeekDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Clear this week's availability?
            </DialogTitle>
            <DialogDescription>
              All <strong>open</strong> time slots for <strong>{fmtWeekRange(selectedWeekStart)}</strong> will be permanently removed.
              Booked appointments and active holds are <strong>never</strong> touched.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setClearWeekDialogOpen(false)} data-testid="button-clear-week-cancel">
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={clearWeekMut.isPending}
              onClick={() => { clearWeekMut.mutate(selectedWeekStart); setClearWeekDialogOpen(false); }}
              data-testid="button-clear-week-confirm"
            >
              {clearWeekMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Yes, clear week
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Paste Schedule confirmation dialog ───────────────────────── */}
      <Dialog open={pasteDialogOpen} onOpenChange={setPasteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardPaste className="h-4 w-4" />
              Paste schedule to target week
            </DialogTitle>
            <DialogDescription>
              Open slots from <strong>{copiedWeekStart ? fmtWeekRange(copiedWeekStart) : "—"}</strong> will be cloned
              to the target week. Unbooked open slots in the target will be replaced; booked/held slots are preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs">Target week starting (Monday)</Label>
            <Input
              type="date"
              value={pasteTargetDate}
              onChange={e => setPasteTargetDate(e.target.value)}
              data-testid="input-paste-target-date"
            />
            {pasteTargetDate && (
              <p className="text-xs text-muted-foreground">{fmtWeekRange(pasteTargetDate)}</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPasteDialogOpen(false)} data-testid="button-paste-cancel">
              Cancel
            </Button>
            <Button
              disabled={!pasteTargetDate || cloneWeekMut.isPending}
              onClick={() => pasteTargetDate && cloneWeekMut.mutate(pasteTargetDate)}
              data-testid="button-paste-confirm"
            >
              {cloneWeekMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Paste schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {conflictDialogOpen && conflictData && (
        <SlotConflictPreviewDialog
          open={conflictDialogOpen}
          onClose={() => setConflictDialogOpen(false)}
          preview={conflictData}
          isPending={!!isPendingPublish}
          onConfirm={handleConflictConfirm}
        />
      )}
    </div>
  );
}

// ─── Provider Office Hours Card ───────────────────────────────────────────────
export function ProviderOfficeHoursCard({
  onPublish,
  isPendingPublish,
}: {
  onPublish: (payload: { dates: string[]; slots: { startTime: string; endTime: string }[]; replaceExisting: boolean }) => void;
  isPendingPublish?: boolean;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/provider/office-hours"] });
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [autoReplyMessage, setAutoReplyMessage] = useState("Thanks for your message — I'll respond during my office hours.");
  const [autoReplyDirty, setAutoReplyDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setAutoReplyEnabled(!!data.autoReplyEnabled);
      if (data.autoReplyMessage) setAutoReplyMessage(data.autoReplyMessage);
    }
  }, [data]);

  const saveSchedule = useMutation({
    mutationFn: (weeklySchedule: WeeklySchedule) =>
      apiRequest("PATCH", "/api/provider/office-hours", {
        weeklySchedule,
        autoReplyEnabled,
        autoReplyMessage,
      }),
    onSuccess: () => {
      toast({ title: t("provider_dashboard.schedule_saved", "Schedule saved") });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/office-hours"] });
    },
    onError: () => toast({ title: t("provider_dashboard.failed_save", "Failed to save"), variant: "destructive" }),
  });

  const saveAutoReply = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", "/api/provider/office-hours", {
        autoReplyEnabled,
        autoReplyMessage,
      }),
    onSuccess: () => {
      toast({ title: t("provider_dashboard.auto_reply_saved", "Auto-reply saved") });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/office-hours"] });
      setAutoReplyDirty(false);
    },
    onError: () => toast({ title: t("provider_dashboard.failed_save", "Failed to save"), variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("provider_dashboard.weekly_schedule_title", "Weekly Hours")}</CardTitle>
          <CardDescription>
            {t("provider_dashboard.weekly_schedule_desc", "Set your available hours for each day. Add multiple windows to include breaks — e.g. 9–12, then 14–18.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StructuredScheduleEditor
            initialSchedule={data?.weeklySchedule}
            onSave={(sched) => saveSchedule.mutate(sched)}
            isSaving={saveSchedule.isPending}
            onPublish={onPublish}
            isPendingPublish={isPendingPublish}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("provider_dashboard.auto_reply_title", "Auto-reply")}</CardTitle>
          <CardDescription>
            {t("provider_dashboard.auto_reply_desc", "Send an automatic response when a client messages you outside of office hours.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Switch
              id="autoReply"
              checked={autoReplyEnabled}
              onCheckedChange={(v) => { setAutoReplyEnabled(v); setAutoReplyDirty(true); }}
              data-testid="switch-auto-reply"
            />
            <Label htmlFor="autoReply" className="cursor-pointer">
              {t("provider_dashboard.auto_reply_toggle", "Enable auto-reply")}
            </Label>
          </div>
          <Textarea
            rows={3}
            placeholder={t("provider_dashboard.auto_reply_placeholder", "Type your auto-reply message...")}
            value={autoReplyMessage}
            onChange={(e) => { setAutoReplyMessage(e.target.value); setAutoReplyDirty(true); }}
            disabled={!autoReplyEnabled}
            data-testid="input-auto-reply-message"
          />
          <div className="flex items-center justify-between">
            {autoReplyDirty ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">● Unsaved changes</p>
            ) : (
              <span />
            )}
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl gap-2"
              onClick={() => saveAutoReply.mutate()}
              disabled={saveAutoReply.isPending || !autoReplyDirty}
              data-testid="button-save-auto-reply"
            >
              {saveAutoReply.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Availability Exceptions Card ─────────────────────────────────────────────
export function AvailabilityExceptionsCard() {
  const { toast } = useToast();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayStr);
  const [reason, setReason] = useState("");

  const { data: exceptions = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/provider/availability-exceptions"],
  });

  const addMut = useMutation({
    mutationFn: (payload: { date: string; reason?: string }) =>
      apiRequest("POST", "/api/provider/availability-exceptions", payload),
    onSuccess: () => {
      toast({ title: "Date blocked" });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/availability-exceptions"] });
      setReason("");
    },
    onError: (e: any) => toast({ title: e?.message || "Could not block date", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (d: string) => apiRequest("DELETE", `/api/provider/availability-exceptions/${d}`),
    onSuccess: () => {
      toast({ title: "Date unblocked" });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/availability-exceptions"] });
    },
  });

  return (
    <Card data-testid="card-availability-exceptions">
      <CardHeader>
        <CardTitle className="text-base">Block specific dates</CardTitle>
        <CardDescription>Block individual dates when you are unavailable (e.g. public holidays, personal days). Clients will not be able to book on these dates.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input
              type="date"
              value={date}
              min={todayStr}
              onChange={e => setDate(e.target.value)}
              className="w-40"
              data-testid="input-exception-date"
            />
          </div>
          <div className="space-y-1 flex-1">
            <Label className="text-xs">Reason (optional)</Label>
            <Input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Public holiday"
              data-testid="input-exception-reason"
            />
          </div>
          <Button
            onClick={() => addMut.mutate({ date, reason: reason || undefined })}
            disabled={!date || addMut.isPending}
            data-testid="button-add-exception"
          >
            {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Block date
          </Button>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (exceptions as any[]).length === 0 ? (
          <p className="text-sm text-muted-foreground">No dates blocked.</p>
        ) : (
          <div className="space-y-1">
            {(exceptions as any[]).map((ex: any) => (
              <div key={ex.id} className="flex items-center justify-between p-2 rounded-md border" data-testid={`row-exception-${ex.date}`}>
                <div>
                  <span className="text-sm font-medium">{ex.date}</span>
                  {ex.reason && <span className="text-xs text-muted-foreground ml-2">{ex.reason}</span>}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive h-7"
                  onClick={() => deleteMut.mutate(ex.date)}
                  disabled={deleteMut.isPending}
                  data-testid={`button-remove-exception-${ex.date}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Cancellation Policy ──────────────────────────────────────────────────────
export function CancellationPolicyCard() {
  const { toast } = useToast();
  const { data: provider } = useQuery<any>({ queryKey: QK.providerMe() });
  const [hours, setHours] = useState(24);
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    if (provider) {
      setHours(provider.cancellationPolicyHours ?? 24);
      setPercent(Number(provider.cancellationFeePercent ?? 0));
    }
  }, [provider]);

  const saveMut = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", "/api/provider/cancellation-policy", {
        cancellationPolicyHours: hours,
        cancellationFeePercent: percent,
      }),
    onSuccess: () => {
      toast({ title: "Cancellation policy saved" });
      void invalidateProviderProfile();
    },
    onError: () => toast({ title: "Failed to save policy", variant: "destructive" }),
  });

  return (
    <Card data-testid="card-cancellation-policy">
      <CardHeader>
        <CardTitle className="text-base">Cancellation policy</CardTitle>
        <CardDescription>Set how many hours before an appointment a client can cancel for free. Cancellations within this window may incur a fee.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Free cancellation up to (hours before)</Label>
            <Input
              type="number"
              min={0}
              max={168}
              value={hours}
              onChange={e => setHours(Number(e.target.value))}
              data-testid="input-cancellation-hours"
            />
            <p className="text-xs text-muted-foreground">0 = no free cancellation window</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Late cancellation fee (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={percent}
              onChange={e => setPercent(Number(e.target.value))}
              data-testid="input-cancellation-fee-percent"
            />
            <p className="text-xs text-muted-foreground">0 = no fee charged</p>
          </div>
        </div>
        {hours > 0 && percent > 0 && (
          <p className="text-sm text-muted-foreground p-2 rounded-md bg-muted/40">
            Clients who cancel within {hours} hours of their appointment will be charged {percent}% of the service fee.
          </p>
        )}
        <Button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          data-testid="button-save-cancellation-policy"
        >
          {saveMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Save policy
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Workload Controls ─────────────────────────────────────────────────────────
export function WorkloadControlsCard({ provider }: { provider: any }) {
  const { toast } = useToast();
  const [maxDaily, setMaxDaily] = useState<string>("");
  const [minGap, setMinGap] = useState<string>("0");
  const [minNotice, setMinNotice] = useState<string>("60");
  const [maxDays, setMaxDays] = useState<string>("90");
  const [waitlistEnabled, setWaitlistEnabled] = useState(false);
  const [waitlistMaxSize, setWaitlistMaxSize] = useState<string>("10");
  const [timezone, setTimezone] = useState("UTC");

  useEffect(() => {
    if (provider) {
      setMaxDaily(provider.maxPatientsPerDay ? String(provider.maxPatientsPerDay) : "");
      setMinGap(String(provider.minGapMinutes ?? 0));
      setMinNotice(String(provider.minimumNoticeMinutes ?? 60));
      setMaxDays(String(provider.maximumBookingDays ?? 90));
      setWaitlistEnabled(!!provider.waitlistEnabled);
      setWaitlistMaxSize(String(provider.waitlistMaxSize ?? 10));
      setTimezone(provider.timezone || "UTC");
    }
  }, [provider]);

  const saveMut = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", "/api/provider/office-hours", {
        maxPatientsPerDay: maxDaily === "" ? null : Number(maxDaily),
        minGapMinutes: Number(minGap),
        minimumNoticeMinutes: Number(minNotice),
        maximumBookingDays: Number(maxDays),
        waitlistEnabled,
        waitlistMaxSize: Number(waitlistMaxSize),
        timezone,
      }),
    onSuccess: () => {
      toast({ title: "Workload settings saved" });
      void invalidateProviderProfile();
    },
    onError: () => toast({ title: "Failed to save workload settings", variant: "destructive" }),
  });

  const commonTimezones = [
    "UTC", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Budapest",
    "Europe/Istanbul", "Asia/Tehran", "Asia/Dubai", "Asia/Kolkata", "Asia/Tokyo",
    "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  ];

  return (
    <Card data-testid="card-workload-controls">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-primary" />
          Workload &amp; Waitlist Settings
        </CardTitle>
        <CardDescription>
          Limit how many appointments you accept per day, require rest gaps between sessions, and control waitlist behaviour.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Max appointments per day</Label>
            <Input
              type="number"
              min={1}
              max={100}
              placeholder="No limit"
              value={maxDaily}
              onChange={e => setMaxDaily(e.target.value)}
              data-testid="input-max-daily-appointments"
            />
            <p className="text-xs text-muted-foreground">Leave blank to accept unlimited bookings per day.</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Minimum gap between appointments (minutes)</Label>
            <Input
              type="number"
              min={0}
              max={120}
              value={minGap}
              onChange={e => setMinGap(e.target.value)}
              data-testid="input-min-gap-minutes"
            />
            <p className="text-xs text-muted-foreground">0 = no gap required. Max 120 min.</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Minimum booking notice (minutes)</Label>
            <Input
              type="number"
              min={0}
              max={10080}
              placeholder="60"
              value={minNotice}
              onChange={e => setMinNotice(e.target.value)}
              data-testid="input-min-notice-minutes"
            />
            <p className="text-xs text-muted-foreground">How far in advance patients must book. 60 = 1 hour.</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Maximum booking horizon (days)</Label>
            <Input
              type="number"
              min={1}
              max={365}
              placeholder="90"
              value={maxDays}
              onChange={e => setMaxDays(e.target.value)}
              data-testid="input-max-booking-days"
            />
            <p className="text-xs text-muted-foreground">How far ahead patients can book. Default is 90 days.</p>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Your timezone</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="w-full" data-testid="select-provider-timezone">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent>
              {commonTimezones.map(tz => (
                <SelectItem key={tz} value={tz}>{tz}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Used to calculate available slots relative to your local time.</p>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enable Waitlist</p>
              <p className="text-xs text-muted-foreground">Clients can join a waitlist when all slots are full and get notified automatically when a spot opens.</p>
            </div>
            <Switch
              checked={waitlistEnabled}
              onCheckedChange={setWaitlistEnabled}
              data-testid="switch-waitlist-enabled"
            />
          </div>
          {waitlistEnabled && (
            <div className="space-y-1">
              <Label className="text-xs">Maximum waitlist size</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={waitlistMaxSize}
                onChange={e => setWaitlistMaxSize(e.target.value)}
                data-testid="input-waitlist-max-size"
              />
            </div>
          )}
        </div>

        <Button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          data-testid="button-save-workload-settings"
        >
          {saveMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save settings
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Provider Time Off (vacation mode) ────────────────────────────────────────
type TimeOffRow = {
  id: string;
  providerId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  createdAt: string | null;
};

export function ProviderTimeOffCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [reason, setReason] = useState("");

  const { data: items = [], isLoading } = useQuery<TimeOffRow[]>({
    queryKey: ["/api/provider/time-off"],
  });

  const addMut = useMutation({
    mutationFn: (payload: { startDate: string; endDate: string; reason?: string }) =>
      apiRequest("POST", "/api/provider/time-off", payload),
    onSuccess: () => {
      toast({ title: t("provider_dashboard.time_off_added", "Time off added") });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/time-off"] });
      setReason("");
    },
    onError: (err: any) => {
      toast({
        title: t("provider_dashboard.time_off_failed", "Could not add time off"),
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/provider/time-off/${id}`),
    onSuccess: () => {
      toast({ title: t("provider_dashboard.time_off_removed", "Time off removed") });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/time-off"] });
    },
    onError: (err: any) => {
      toast({
        title: t("provider_dashboard.time_off_remove_failed", "Could not remove time off"),
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const upcoming = items.filter((it) => it.endDate >= todayStr);
  const past = items.filter((it) => it.endDate < todayStr);
  const fmtRange = (s: string, e: string) => (s === e ? s : `${s} → ${e}`);

  return (
    <Card data-testid="card-time-off">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          {t("provider_dashboard.time_off_title", "Time off / vacation")}
        </CardTitle>
        <CardDescription>
          {t(
            "provider_dashboard.time_off_desc",
            "Block a date range so clients can't book new appointments while you're away. Existing appointments are not affected — cancel them manually if needed.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">{t("provider_dashboard.time_off_from", "From")}</Label>
            <Input
              type="date"
              value={startDate}
              min={todayStr}
              onChange={e => setStartDate(e.target.value)}
              data-testid="input-time-off-start"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("provider_dashboard.time_off_to", "To")}</Label>
            <Input
              type="date"
              value={endDate}
              min={startDate}
              onChange={e => setEndDate(e.target.value)}
              data-testid="input-time-off-end"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("provider_dashboard.time_off_reason", "Reason (optional)")}</Label>
            <Input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={t("provider_dashboard.time_off_reason_placeholder", "e.g. Vacation")}
              data-testid="input-time-off-reason"
            />
          </div>
        </div>
        <Button
          onClick={() => addMut.mutate({ startDate, endDate, reason: reason || undefined })}
          disabled={!startDate || !endDate || addMut.isPending}
          data-testid="button-add-time-off"
        >
          {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
          {t("provider_dashboard.time_off_add_btn", "Add time off")}
        </Button>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-2">
            {upcoming.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {t("provider_dashboard.time_off_upcoming", "Upcoming")}
                </p>
                {upcoming.map(it => (
                  <div key={it.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20" data-testid={`row-time-off-${it.id}`}>
                    <div>
                      <p className="text-sm font-medium">{fmtRange(it.startDate, it.endDate)}</p>
                      {it.reason && <p className="text-xs text-muted-foreground">{it.reason}</p>}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive h-7"
                      onClick={() => delMut.mutate(it.id)}
                      disabled={delMut.isPending}
                      data-testid={`button-remove-time-off-${it.id}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {past.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 mt-3">
                  {t("provider_dashboard.time_off_past", "Past")}
                </p>
                {past.slice(0, 5).map(it => (
                  <div key={it.id} className="flex items-center justify-between p-2.5 rounded-lg border opacity-50" data-testid={`row-time-off-past-${it.id}`}>
                    <div>
                      <p className="text-sm">{fmtRange(it.startDate, it.endDate)}</p>
                      {it.reason && <p className="text-xs text-muted-foreground">{it.reason}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {upcoming.length === 0 && past.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t("provider_dashboard.no_time_off", "No time off scheduled.")}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
