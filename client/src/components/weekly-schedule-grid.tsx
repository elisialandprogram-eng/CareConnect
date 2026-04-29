import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Save, RefreshCw, Loader2, CalendarPlus, Zap } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayKey = (typeof DAY_KEYS)[number];

const DAY_LABELS: Record<DayKey, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu",
  fri: "Fri", sat: "Sat", sun: "Sun",
};

const DAY_FULL: Record<DayKey, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};

// Time blocks: 30-min slots from 06:00 to 22:00 → 32 blocks
const START_HOUR = 6;
const END_HOUR = 22;
const BLOCK_COUNT = (END_HOUR - START_HOUR) * 2; // 32

function blockToTime(blockIdx: number): string {
  const totalMins = START_HOUR * 60 + blockIdx * 30;
  const h = Math.floor(totalMins / 60).toString().padStart(2, "0");
  const m = (totalMins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function timeToBlock(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return Math.floor(((h * 60 + m) - START_HOUR * 60) / 30);
}

type GridState = Record<DayKey, boolean[]>;

function emptyGrid(): GridState {
  return DAY_KEYS.reduce((acc, d) => {
    acc[d] = Array(BLOCK_COUNT).fill(false);
    return acc;
  }, {} as GridState);
}

export interface WeeklyScheduleEntry {
  start: string;
  end: string;
  enabled: boolean;
}

export type WeeklySchedule = Record<DayKey, WeeklyScheduleEntry>;

function gridFromSchedule(schedule: Partial<WeeklySchedule>): GridState {
  const grid = emptyGrid();
  DAY_KEYS.forEach((d) => {
    const entry = schedule[d];
    if (!entry?.enabled) return;
    const startBlock = Math.max(0, timeToBlock(entry.start));
    const endBlock = Math.min(BLOCK_COUNT, timeToBlock(entry.end));
    for (let b = startBlock; b < endBlock; b++) {
      grid[d][b] = true;
    }
  });
  return grid;
}

function scheduleFromGrid(grid: GridState): WeeklySchedule {
  return DAY_KEYS.reduce((acc, d) => {
    const blocks = grid[d];
    const firstOn = blocks.indexOf(true);
    const lastOn = blocks.lastIndexOf(true);
    if (firstOn === -1) {
      acc[d] = { start: "09:00", end: "17:00", enabled: false };
    } else {
      acc[d] = {
        start: blockToTime(firstOn),
        end: blockToTime(lastOn + 1),
        enabled: true,
      };
    }
    return acc;
  }, {} as WeeklySchedule);
}

// Given a grid day, find contiguous ranges of true blocks
function getRanges(blocks: boolean[]): { start: string; end: string }[] {
  const ranges: { start: string; end: string }[] = [];
  let inRange = false;
  let rangeStart = 0;
  for (let i = 0; i <= blocks.length; i++) {
    const on = i < blocks.length && blocks[i];
    if (on && !inRange) { inRange = true; rangeStart = i; }
    if (!on && inRange) {
      ranges.push({ start: blockToTime(rangeStart), end: blockToTime(i) });
      inRange = false;
    }
  }
  return ranges;
}

// Quick-fill presets
const PRESETS = [
  { label: "Morning", start: "08:00", end: "13:00" },
  { label: "Afternoon", start: "13:00", end: "18:00" },
  { label: "Full day", start: "08:00", end: "18:00" },
  { label: "Business", start: "09:00", end: "17:00" },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  schedule?: Partial<WeeklySchedule>;
  onSave: (schedule: WeeklySchedule) => void;
  onPublish: (payload: {
    dates: string[];
    slots: { startTime: string; endTime: string }[];
    replaceExisting: boolean;
  }) => void;
  isPendingSave?: boolean;
  isPendingPublish?: boolean;
}

export function WeeklyScheduleGrid({
  schedule,
  onSave,
  onPublish,
  isPendingSave,
  isPendingPublish,
}: Props) {
  const [grid, setGrid] = useState<GridState>(() =>
    schedule ? gridFromSchedule(schedule) : emptyGrid()
  );
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Reload grid when schedule prop arrives from server
  useEffect(() => {
    if (schedule) {
      setGrid(gridFromSchedule(schedule));
      setIsDirty(false);
    }
  }, [JSON.stringify(schedule)]);

  // Drag state
  const dragging = useRef(false);
  const dragValue = useRef<boolean>(true); // paint true or false

  const toggleCell = useCallback((day: DayKey, block: number, paintAs: boolean) => {
    setGrid((prev) => {
      const dayBlocks = [...prev[day]];
      dayBlocks[block] = paintAs;
      return { ...prev, [day]: dayBlocks };
    });
    setIsDirty(true);
  }, []);

  const onMouseDown = useCallback(
    (day: DayKey, block: number) => {
      dragging.current = true;
      const current = grid[day][block];
      dragValue.current = !current;
      toggleCell(day, block, dragValue.current);
    },
    [grid, toggleCell]
  );

  const onMouseEnter = useCallback(
    (day: DayKey, block: number) => {
      if (dragging.current) toggleCell(day, block, dragValue.current);
    },
    [toggleCell]
  );

  useEffect(() => {
    const stop = () => { dragging.current = false; };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);

  // Fill a whole day from a preset
  const fillDay = (day: DayKey, startTime: string, endTime: string) => {
    const startBlock = Math.max(0, timeToBlock(startTime));
    const endBlock = Math.min(BLOCK_COUNT, timeToBlock(endTime));
    setGrid((prev) => {
      const dayBlocks = Array(BLOCK_COUNT).fill(false);
      for (let b = startBlock; b < endBlock; b++) dayBlocks[b] = true;
      return { ...prev, [day]: dayBlocks };
    });
    setIsDirty(true);
  };

  const clearDay = (day: DayKey) => {
    setGrid((prev) => ({ ...prev, [day]: Array(BLOCK_COUNT).fill(false) }));
    setIsDirty(true);
  };

  const fillAllDays = (startTime: string, endTime: string, excludeWeekend = false) => {
    const days: DayKey[] = excludeWeekend
      ? ["mon", "tue", "wed", "thu", "fri"]
      : DAY_KEYS.slice();
    days.forEach((d) => fillDay(d, startTime, endTime));
  };

  const clearAll = () => {
    setGrid(emptyGrid());
    setIsDirty(true);
  };

  // Count active hours per day
  const activeHours = (day: DayKey) => {
    const count = grid[day].filter(Boolean).length;
    return count ? `${(count * 0.5).toFixed(1)}h` : null;
  };

  // Publish: generate dates for the next 7 days starting from the coming Monday
  const handlePublish = () => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
    const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() + (dayOfWeek === 1 ? 0 : daysUntilMonday));

    const dates: string[] = [];
    const slots: { startTime: string; endTime: string }[] = [];

    DAY_KEYS.forEach((d, idx) => {
      const ranges = getRanges(grid[d]);
      if (!ranges.length) return;
      const date = new Date(monday);
      date.setDate(monday.getDate() + idx);
      const dateStr = date.toISOString().slice(0, 10);
      dates.push(dateStr);
      ranges.forEach((r) => slots.push({ startTime: r.start, endTime: r.end }));
    });

    if (!dates.length) return;
    onPublish({ dates, slots, replaceExisting });
  };

  // Row labels — show every full hour
  const rowLabels = Array.from({ length: BLOCK_COUNT }, (_, i) => {
    const time = blockToTime(i);
    return time.endsWith(":00") ? time : null;
  });

  return (
    <div className="space-y-4" data-testid="weekly-schedule-grid">
      {/* Quick fill toolbar */}
      <div className="flex items-center flex-wrap gap-2">
        <span className="text-xs font-medium text-muted-foreground mr-1">Quick fill:</span>
        {PRESETS.map((p) => (
          <Button
            key={p.label}
            size="sm"
            variant="outline"
            className="h-7 text-xs rounded-lg gap-1"
            onClick={() => fillAllDays(p.start, p.end, true)}
            data-testid={`button-preset-${p.label.toLowerCase().replace(" ", "-")}`}
          >
            <Zap className="h-3 w-3" />
            {p.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground rounded-lg"
          onClick={clearAll}
          data-testid="button-clear-all"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Clear all
        </Button>
      </div>

      {/* Grid */}
      <div
        className="overflow-auto rounded-xl border border-border bg-background select-none"
        style={{ maxHeight: 520 }}
      >
        <table className="w-full border-collapse table-fixed" style={{ minWidth: 560 }}>
          <thead className="sticky top-0 z-10 bg-background">
            <tr>
              {/* Time column header */}
              <th className="w-14 border-b border-border bg-muted/40 py-2" />
              {DAY_KEYS.map((d) => {
                const h = activeHours(d);
                return (
                  <th
                    key={d}
                    className="border-b border-l border-border bg-muted/40 py-2 px-1 text-center"
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-xs font-semibold text-foreground">
                        {DAY_LABELS[d]}
                      </span>
                      {h ? (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                          {h}
                        </Badge>
                      ) : (
                        <span className="text-[9px] text-muted-foreground/40">—</span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: BLOCK_COUNT }, (_, blockIdx) => {
              const label = rowLabels[blockIdx];
              const isHourStart = !!label;
              return (
                <tr key={blockIdx} className={isHourStart ? "border-t border-border/40" : ""}>
                  {/* Time label */}
                  <td className="w-14 text-right pr-2 text-[10px] text-muted-foreground font-mono leading-none py-0 bg-muted/20">
                    {label ?? ""}
                  </td>
                  {DAY_KEYS.map((d) => {
                    const on = grid[d][blockIdx];
                    return (
                      <td
                        key={d}
                        className={`border-l border-border/20 p-0 cursor-pointer transition-colors duration-75 ${
                          on
                            ? "bg-primary/70 hover:bg-primary/90"
                            : "hover:bg-primary/10"
                        } ${isHourStart ? "border-t border-border/30" : ""}`}
                        style={{ height: 16 }}
                        onMouseDown={() => onMouseDown(d, blockIdx)}
                        onMouseEnter={() => onMouseEnter(d, blockIdx)}
                        data-testid={`cell-${d}-${blockIdx}`}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Per-day quick actions */}
      <div className="grid grid-cols-7 gap-1">
        {DAY_KEYS.map((d) => (
          <div key={d} className="flex flex-col gap-1">
            <p className="text-[10px] font-medium text-center text-muted-foreground">
              {DAY_LABELS[d]}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] px-1 rounded-md"
              onClick={() => fillDay(d, "09:00", "17:00")}
              title={`Fill ${DAY_FULL[d]} 9am–5pm`}
              data-testid={`button-fill-day-${d}`}
            >
              9–17
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] px-1 rounded-md text-muted-foreground"
              onClick={() => clearDay(d)}
              title={`Clear ${DAY_FULL[d]}`}
              data-testid={`button-clear-day-${d}`}
            >
              Clear
            </Button>
          </div>
        ))}
      </div>

      <Separator />

      {/* Publish options */}
      <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-foreground">Publish to calendar</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Generate bookable time slots for the current week based on your schedule above.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="replace-existing"
            checked={replaceExisting}
            onCheckedChange={setReplaceExisting}
            data-testid="switch-replace-existing"
          />
          <Label htmlFor="replace-existing" className="text-xs cursor-pointer">
            Replace existing slots on selected days
          </Label>
        </div>
        <Button
          variant="outline"
          className="gap-2 rounded-xl"
          onClick={handlePublish}
          disabled={isPendingPublish}
          data-testid="button-publish-slots"
        >
          {isPendingPublish ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CalendarPlus className="h-4 w-4" />
          )}
          Publish this week's slots
        </Button>
      </div>

      {/* Save schedule */}
      <div className="flex items-center justify-between pt-1">
        {isDirty ? (
          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
            ● Unsaved changes
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Schedule up to date</p>
        )}
        <Button
          className="gap-2 rounded-xl"
          disabled={isPendingSave || !isDirty}
          onClick={() => {
            onSave(scheduleFromGrid(grid));
            setIsDirty(false);
          }}
          data-testid="button-save-schedule"
        >
          {isPendingSave ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save schedule
        </Button>
      </div>
    </div>
  );
}
