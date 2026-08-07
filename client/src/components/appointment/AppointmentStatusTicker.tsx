import { Link } from "wouter";
import { X, CheckCircle, Activity, XCircle, Clock } from "lucide-react";
import type { StatusUpdate } from "@/hooks/use-appointment-status-ws";

interface StatusCfg {
  icon: React.ReactNode;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const STATUS_CONFIG: Record<string, StatusCfg> = {
  approved: {
    icon: <CheckCircle className="h-4 w-4" />,
    label: "Approved",
    color: "text-blue-700 dark:text-blue-300",
    bgColor: "bg-blue-50 dark:bg-blue-950/50",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
  confirmed: {
    icon: <CheckCircle className="h-4 w-4" />,
    label: "Confirmed",
    color: "text-emerald-700 dark:text-emerald-300",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/50",
    borderColor: "border-emerald-200 dark:border-emerald-800",
  },
  in_progress: {
    icon: <Activity className="h-4 w-4" />,
    label: "In Progress",
    color: "text-violet-700 dark:text-violet-300",
    bgColor: "bg-violet-50 dark:bg-violet-950/50",
    borderColor: "border-violet-200 dark:border-violet-800",
  },
  completed: {
    icon: <CheckCircle className="h-4 w-4" />,
    label: "Completed",
    color: "text-teal-700 dark:text-teal-300",
    bgColor: "bg-teal-50 dark:bg-teal-950/50",
    borderColor: "border-teal-200 dark:border-teal-800",
  },
  rejected: {
    icon: <XCircle className="h-4 w-4" />,
    label: "Declined",
    color: "text-red-700 dark:text-red-300",
    bgColor: "bg-red-50 dark:bg-red-950/50",
    borderColor: "border-red-200 dark:border-red-800",
  },
  cancelled_by_provider: {
    icon: <XCircle className="h-4 w-4" />,
    label: "Cancelled",
    color: "text-orange-700 dark:text-orange-300",
    bgColor: "bg-orange-50 dark:bg-orange-950/50",
    borderColor: "border-orange-200 dark:border-orange-800",
  },
};

function buildMessage(u: StatusUpdate): string {
  const ref = u.appointmentNumber ? ` #${u.appointmentNumber}` : "";
  const when = u.date && u.startTime ? ` on ${u.date} at ${u.startTime}` : "";
  switch (u.status) {
    case "approved":
      return `${u.providerName} approved your appointment${ref}${when}.`;
    case "confirmed":
      return `Your appointment${ref} with ${u.providerName}${when} is confirmed!`;
    case "in_progress":
      return `Your session${ref} with ${u.providerName} has started. Share your sign-off code when it ends.`;
    case "completed":
      return `Your session${ref} is complete. Please leave a review!`;
    case "rejected":
      return `Your appointment request${ref} was declined by ${u.providerName}.`;
    case "cancelled_by_provider":
      return `Your appointment${ref}${when} was cancelled by ${u.providerName}.`;
    default:
      return `Your appointment${ref} status changed to ${u.status.replace(/_/g, " ")}.`;
  }
}

interface Props {
  updates: StatusUpdate[];
  onDismiss: (id: string) => void;
}

export function AppointmentStatusTicker({ updates, onDismiss }: Props) {
  if (!updates.length) return null;

  return (
    <div
      className="fixed bottom-6 end-4 z-50 flex flex-col gap-2 w-[340px] max-w-[calc(100vw-2rem)] pointer-events-none"
      aria-live="polite"
      aria-label="Appointment updates"
      data-testid="ticker-appointment-status"
    >
      {updates.map((update) => {
        const cfg: StatusCfg = STATUS_CONFIG[update.status] ?? {
          icon: <Clock className="h-4 w-4" />,
          label: "Update",
          color: "text-muted-foreground",
          bgColor: "bg-card",
          borderColor: "border-border",
        };

        return (
          <div
            key={update.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg animate-in slide-in-from-bottom-4 duration-300 ${cfg.bgColor} ${cfg.borderColor}`}
            data-testid={`ticker-item-${update.appointmentId}`}
          >
            <span className={`mt-0.5 shrink-0 ${cfg.color}`}>{cfg.icon}</span>

            <div className="flex-1 min-w-0">
              <p className={`text-[11px] font-semibold uppercase tracking-wider mb-0.5 ${cfg.color}`}>
                Appointment {cfg.label}
              </p>
              <p className="text-sm text-foreground leading-snug">
                {buildMessage(update)}
              </p>
              <Link
                href={`/appointments/${update.appointmentId}`}
                className={`mt-1.5 inline-block text-xs font-medium underline-offset-2 hover:underline ${cfg.color}`}
                data-testid={`ticker-link-${update.appointmentId}`}
              >
                View appointment →
              </Link>
            </div>

            <button
              type="button"
              onClick={() => onDismiss(update.id)}
              className="shrink-0 mt-0.5 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss notification"
              data-testid={`ticker-dismiss-${update.id}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
