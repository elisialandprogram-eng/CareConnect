import { StatusBadge } from "@/components/ui/status-badge";
import { AppointmentTimeContext } from "./AppointmentTimeContext";

interface Props {
  status: string;
  date: string;
  startTime: string;
  className?: string;
  compact?: boolean;
}

const TIME_RELEVANT_STATUSES = new Set([
  "pending", "approved", "confirmed", "rescheduled",
  "reschedule_proposed", "in_progress",
  "completed", "cancelled", "cancelled_by_patient",
  "cancelled_by_provider", "rejected", "no_show", "expired",
]);

const TIME_CONTEXT_COLORS: Record<string, string> = {
  pending:              "text-amber-600 dark:text-amber-400",
  approved:             "text-blue-600 dark:text-blue-400",
  confirmed:            "text-emerald-600 dark:text-emerald-400",
  rescheduled:          "text-amber-600 dark:text-amber-400",
  reschedule_proposed:  "text-amber-600 dark:text-amber-400",
  in_progress:          "text-indigo-600 dark:text-indigo-400",
  completed:            "text-slate-500 dark:text-slate-400",
  cancelled:            "text-rose-500 dark:text-rose-400",
  cancelled_by_patient: "text-rose-500 dark:text-rose-400",
  cancelled_by_provider:"text-rose-500 dark:text-rose-400",
  rejected:             "text-rose-500 dark:text-rose-400",
  no_show:              "text-rose-500 dark:text-rose-400",
  expired:              "text-slate-400",
};

export function SmartStatus({ status, date, startTime, className = "", compact = false }: Props) {
  const showTime = TIME_RELEVANT_STATUSES.has(status) && date && startTime;
  const timeColor = TIME_CONTEXT_COLORS[status] ?? "text-muted-foreground";

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`} data-testid="smart-status">
      <StatusBadge status={status} />
      {showTime && !compact && (
        <AppointmentTimeContext
          date={date}
          startTime={startTime}
          status={status}
          className={timeColor}
          showIcon={false}
        />
      )}
    </div>
  );
}
