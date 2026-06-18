import { formatDate } from "@/lib/datetime";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CalendarPlus, CalendarX, CheckCircle2, AlertTriangle, Info } from "lucide-react";

export interface ConflictSummaryItem {
  date: string;
  existingCount: number;
  newSlotsCount: number;
  hasConflict: boolean;
}

export interface ConflictPreviewResult {
  summary: ConflictSummaryItem[];
  totalConflicts: number;
  totalDates: number;
  totalNewSlots: number;
}

export type PublishMode = "replace" | "skip" | "clean_only";

interface Props {
  open: boolean;
  onClose: () => void;
  preview: ConflictPreviewResult;
  isPending: boolean;
  onConfirm: (mode: PublishMode) => void;
}

function fmtDate(iso: string): string {
  try {
    const [y, m, d] = iso.split("-").map(Number);
    return formatDate(new Date(y, m - 1, d), {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

export function SlotConflictPreviewDialog({
  open,
  onClose,
  preview,
  isPending,
  onConfirm,
}: Props) {
  const { summary, totalConflicts, totalDates, totalNewSlots } = preview;
  const cleanCount = totalDates - totalConflicts;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-slot-conflict-preview">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarPlus className="h-4 w-4 text-primary" />
            Review before publishing
          </DialogTitle>
          <DialogDescription className="text-sm">
            {totalConflicts === 0
              ? `All ${totalDates} date${totalDates !== 1 ? "s" : ""} are clear — no existing slots will be affected.`
              : `${totalConflicts} of ${totalDates} date${totalDates !== 1 ? "s" : ""} already have existing slots. Choose how to handle conflicts below.`}
          </DialogDescription>
        </DialogHeader>

        {/* Summary pills */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-emerald-700 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {cleanCount} clean date{cleanCount !== 1 ? "s" : ""}
          </span>
          {totalConflicts > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-amber-700 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              {totalConflicts} conflict{totalConflicts !== 1 ? "s" : ""}
            </span>
          )}
          <span className="flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1 text-blue-700 font-medium">
            <Info className="h-3.5 w-3.5" />
            {totalNewSlots} slot{totalNewSlots !== 1 ? "s" : ""} to create
          </span>
        </div>

        {/* Per-date list */}
        <div className="rounded-xl border border-border overflow-hidden max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/70 backdrop-blur-sm border-b border-border">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Existing</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">New</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr
                  key={row.date}
                  className={`border-b last:border-0 ${row.hasConflict ? "bg-amber-50/40 dark:bg-amber-900/10" : ""}`}
                  data-testid={`row-conflict-${row.date}`}
                >
                  <td className="px-3 py-2.5 font-medium text-foreground tabular-nums">
                    {fmtDate(row.date)}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums">
                    {row.existingCount > 0 ? (
                      <span className="text-amber-700 font-semibold">{row.existingCount}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-emerald-700 font-semibold">
                    +{row.newSlotsCount}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {row.hasConflict ? (
                      <Badge className="bg-amber-100 text-amber-800 border border-amber-200 text-[10px]">
                        Conflict
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px]">
                        Clear
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Conflict explanation */}
        {totalConflicts > 0 && (
          <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2.5 leading-relaxed">
            <strong className="text-foreground">Replace:</strong> deletes the existing slots first, then creates the new ones.{" "}
            <strong className="text-foreground">Skip:</strong> leaves conflicted dates untouched and only creates slots on clear dates.
          </p>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending} data-testid="btn-conflict-cancel">
            Cancel
          </Button>

          {totalConflicts > 0 && cleanCount > 0 && (
            <Button
              variant="outline"
              onClick={() => onConfirm("skip")}
              disabled={isPending}
              data-testid="btn-conflict-skip"
              className="gap-2"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarX className="h-4 w-4" />}
              Skip conflicts ({cleanCount} date{cleanCount !== 1 ? "s" : ""})
            </Button>
          )}

          {totalConflicts > 0 ? (
            <Button
              onClick={() => onConfirm("replace")}
              disabled={isPending}
              data-testid="btn-conflict-replace"
              className="gap-2"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              Replace &amp; publish all ({totalDates})
            </Button>
          ) : (
            <Button
              onClick={() => onConfirm("clean_only")}
              disabled={isPending}
              data-testid="btn-conflict-publish"
              className="gap-2"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              Publish {totalDates} date{totalDates !== 1 ? "s" : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
