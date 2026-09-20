import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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

type TimeTranslator = (key: string, fallback: string, options?: Record<string, unknown>) => string;

function getRelativeLabel(
  date: string,
  startTime: string,
  status: string,
  startAtUtc?: string | null,
  translate?: TimeTranslator,
): string {
  const tr = translate ?? ((_key: string, fallback: string) => fallback);
  try {
    const apptMs = resolveApptMs(date, startTime, startAtUtc);
    const now = new Date();
    const diffMs  = apptMs - now.getTime();
    const absDiff = Math.abs(diffMs);
    const mins    = Math.floor(absDiff / 60_000);
    const hrs     = Math.floor(mins / 60);
    const days    = Math.floor(hrs / 24);

    if (status === "in_progress") {
      const elapsed = mins < 60 ? `${mins}m` : `${hrs}h ${mins % 60}m`;
      return tr("member_time.started_ago", "Started {{time}} ago", { time: elapsed });
    }

    if (TERMINAL.includes(status)) {
      if (days === 0) return tr("member_time.today", "Today");
      if (days === 1) return tr("member_time.yesterday", "Yesterday");
      return tr("member_time.days_ago", "{{count}} days ago", { count: days });
    }

    // Past but status not yet terminal (e.g. confirmed but overdue)
    if (diffMs <= 0) {
      if (mins < 5) return tr("member_time.starting_now", "Starting now");
      const overdue = mins < 60 ? `${mins}m` : hrs < 24 ? `${hrs}h` : `${days}d`;
      return tr("member_time.overdue", "{{time}} overdue", { time: overdue });
    }

    // Future — use "Starts in" phrasing for imminent appointments (<60 min)
    if (mins < 60) return tr("member_time.starts_in_short", "Starts in {{time}}", { time: `${mins}m` });
    if (hrs < 2) return tr("member_time.in_time", "In {{time}}", { time: `${hrs}h ${mins % 60}m` });
    if (hrs < 24) return tr("member_time.in_time", "In {{time}}", { time: `${hrs}h` });
    if (days === 1) return tr("member_time.tomorrow", "Tomorrow");
    return tr("member_time.in_days", "In {{count}} days", { count: days });
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
  const { t } = useTranslation();
  const translate: TimeTranslator = (key, fallback, options) => String(t(key, fallback, options));
  const [label, setLabel] = useState(() => getRelativeLabel(date, startTime, status, startAtUtc, translate));

  useEffect(() => {
    setLabel(getRelativeLabel(date, startTime, status, startAtUtc, translate));
    if (TERMINAL.includes(status)) return;
    const id = setInterval(() => setLabel(getRelativeLabel(date, startTime, status, startAtUtc, translate)), 30_000);
    return () => clearInterval(id);
  }, [date, startTime, startAtUtc, status, translate]);

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
