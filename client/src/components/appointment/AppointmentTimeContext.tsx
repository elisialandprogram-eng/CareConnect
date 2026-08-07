import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  date: string;
  startTime: string;
  /** Authoritative UTC ISO string (start_at column). Used when present for exact countdown. */
  startAtUtc?: string | null;
  status: string;
  className?: string;
  showIcon?: boolean;
}

const TERMINAL = ["completed", "cancelled", "cancelled_by_patient", "cancelled_by_provider", "rejected", "no_show", "expired"];

function resolveApptMs(date: string, startTime: string, startAtUtc?: string | null): number {
  if (startAtUtc) {
    const utc = new Date(startAtUtc);
    if (!isNaN(utc.getTime())) return utc.getTime();
  }
  // Fallback: parse wall-clock time in browser-local (legacy rows without start_at)
  const [h, m] = (startTime || "00:00").split(":").map(Number);
  const d = new Date(`${date.slice(0, 10)}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function getRelativeLabel(date: string, startTime: string, status: string, startAtUtc?: string | null): string {
  try {
    const apptMs = resolveApptMs(date, startTime, startAtUtc);
    const now = new Date();
    const diffMs  = apptMs - now.getTime();
    const absDiff = Math.abs(diffMs);
    const mins    = Math.floor(absDiff / 60_000);
    const hrs     = Math.floor(mins / 60);
    const days    = Math.floor(hrs / 24);

    if (status === "in_progress") {
      if (mins < 60) return `Started ${mins}m ago`;
      return `Started ${hrs}h ${mins % 60}m ago`;
    }

    if (TERMINAL.includes(status)) {
      if (days === 0) return "Today";
      if (days === 1) return "Yesterday";
      return `${days} days ago`;
    }

    // Past but status not yet terminal (e.g. confirmed but overdue)
    if (diffMs <= 0) {
      if (mins < 5)  return "Starting now";
      if (mins < 60) return `${mins}m overdue`;
      if (hrs < 24)  return `${hrs}h overdue`;
      return `${days}d overdue`;
    }

    // Future — use "Starts in" phrasing for imminent appointments (<60 min)
    if (mins < 60)  return `Starts in ${mins}m`;
    if (hrs < 2)    return `In ${hrs}h ${mins % 60}m`;
    if (hrs < 24)   return `In ${hrs}h`;
    if (days === 1) return "Tomorrow";
    return `In ${days} days`;
  } catch {
    return "";
  }
}

function getUrgencyClass(date: string, startTime: string, status: string, startAtUtc?: string | null): string {
  if (TERMINAL.includes(status) || status === "in_progress") return "";
  try {
    const diffMs = resolveApptMs(date, startTime, startAtUtc) - Date.now();
    // Overdue (non-terminal)
    if (diffMs <= 0) return "text-orange-600 dark:text-orange-400";
    const mins = diffMs / 60_000;
    if (mins <= 10)  return "text-red-600 dark:text-red-400 font-semibold";
    if (mins <= 30)  return "text-amber-600 dark:text-amber-400";
    return "";
  } catch { return ""; }
}

export function AppointmentTimeContext({ date, startTime, startAtUtc, status, className = "", showIcon = true }: Props) {
  const [label, setLabel] = useState(() => getRelativeLabel(date, startTime, status, startAtUtc));

  useEffect(() => {
    setLabel(getRelativeLabel(date, startTime, status, startAtUtc));
    if (TERMINAL.includes(status)) return;
    const id = setInterval(() => setLabel(getRelativeLabel(date, startTime, status, startAtUtc)), 30_000);
    return () => clearInterval(id);
  }, [date, startTime, startAtUtc, status]);

  if (!label) return null;

  const urgencyClass = getUrgencyClass(date, startTime, status, startAtUtc);

  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs font-medium", urgencyClass, className)}
      data-testid="time-context-label"
    >
      {showIcon && <Clock className="h-3 w-3 shrink-0" />}
      {label}
    </span>
  );
}

export { getRelativeLabel };
