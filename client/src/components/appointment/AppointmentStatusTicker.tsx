import { Link } from "wouter";
import { X, CheckCircle, Activity, XCircle, Clock } from "lucide-react";
import type { StatusUpdate } from "@/hooks/use-appointment-status-ws";
import { useTranslation } from "react-i18next";

interface StatusCfg {
  icon: React.ReactNode;
  labelKey: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const STATUS_CONFIG: Record<string, StatusCfg> = {
  approved: {
    icon: <CheckCircle className="h-4 w-4" />,
    labelKey: "approved",
    label: "Approved",
    color: "text-blue-700 dark:text-blue-300",
    bgColor: "bg-blue-50 dark:bg-blue-950/50",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
  confirmed: {
    icon: <CheckCircle className="h-4 w-4" />,
    labelKey: "confirmed",
    label: "Confirmed",
    color: "text-emerald-700 dark:text-emerald-300",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/50",
    borderColor: "border-emerald-200 dark:border-emerald-800",
  },
  in_progress: {
    icon: <Activity className="h-4 w-4" />,
    labelKey: "in_progress",
    label: "In Progress",
    color: "text-violet-700 dark:text-violet-300",
    bgColor: "bg-violet-50 dark:bg-violet-950/50",
    borderColor: "border-violet-200 dark:border-violet-800",
  },
  completed: {
    icon: <CheckCircle className="h-4 w-4" />,
    labelKey: "completed",
    label: "Completed",
    color: "text-teal-700 dark:text-teal-300",
    bgColor: "bg-teal-50 dark:bg-teal-950/50",
    borderColor: "border-teal-200 dark:border-teal-800",
  },
  rejected: {
    icon: <XCircle className="h-4 w-4" />,
    labelKey: "rejected",
    label: "Declined",
    color: "text-red-700 dark:text-red-300",
    bgColor: "bg-red-50 dark:bg-red-950/50",
    borderColor: "border-red-200 dark:border-red-800",
  },
  cancelled_by_provider: {
    icon: <XCircle className="h-4 w-4" />,
    labelKey: "cancelled",
    label: "Cancelled",
    color: "text-orange-700 dark:text-orange-300",
    bgColor: "bg-orange-50 dark:bg-orange-950/50",
    borderColor: "border-orange-200 dark:border-orange-800",
  },
};

function domainLabel(
  t: (key: string, fallback: string) => string,
  status: string,
  fallback: string,
): string {
  return t(`member_status.appointment.${status}`, fallback);
}

function buildMessage(u: StatusUpdate, t: (key: string, fallback: string, options?: Record<string, unknown>) => string): string {
  const ref = u.appointmentNumber ? ` #${u.appointmentNumber}` : "";
  const when = u.date && u.startTime
    ? t("provider_sweep.on_at", " on {{date}} at {{time}}", { date: u.date, time: u.startTime })
    : "";
  switch (u.status) {
    case "approved":
      return t("member_ticker.approved", "{{provider}} approved your appointment{{reference}}{{when}}.", { provider: u.providerName, reference: ref, when });
    case "confirmed":
      return t("member_ticker.confirmed", "Your appointment{{reference}} with {{provider}}{{when}} is confirmed!", { reference: ref, provider: u.providerName, when });
    case "in_progress":
      return t("member_ticker.in_progress", "Your session{{reference}} with {{provider}} has started. Share your sign-off code when it ends.", { reference: ref, provider: u.providerName });
    case "completed":
      return t("member_ticker.completed", "Your session{{reference}} is complete. Please leave a review!", { reference: ref });
    case "rejected":
      return t("member_ticker.rejected", "Your appointment request{{reference}} was declined by {{provider}}.", { reference: ref, provider: u.providerName });
    case "cancelled_by_provider":
      return t("member_ticker.cancelled", "Your appointment{{reference}}{{when}} was cancelled by {{provider}}.", { reference: ref, when, provider: u.providerName });
    default:
      return t("member_ticker.status_changed", "Your appointment{{reference}} status changed to {{status}}.", {
        reference: ref,
        status: t(`provider_sweep.status.${u.status}`, u.status.replace(/_/g, " ")),
      });
  }
}

interface Props {
  updates: StatusUpdate[];
  onDismiss: (id: string) => void;
}

export function AppointmentStatusTicker({ updates, onDismiss }: Props) {
  const { t } = useTranslation();
  if (!updates.length) return null;

  return (
    <div
      className="fixed bottom-6 end-4 z-50 flex flex-col gap-2 w-[340px] max-w-[calc(100vw-2rem)] pointer-events-none"
      aria-live="polite"
       aria-label={t("member_ticker.updates", "Appointment updates")}
      data-testid="ticker-appointment-status"
    >
      {updates.map((update) => {
        const cfg: StatusCfg = STATUS_CONFIG[update.status] ?? {
          icon: <Clock className="h-4 w-4" />,
            labelKey: "pending",
            label: t("member_ticker.update", "Update"),
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
                {t("member_ticker.appointment", "Appointment")} {t(`provider_sweep.status.${cfg.labelKey}`, cfg.label)}
              </p>
              <p className="text-sm text-foreground leading-snug">
                {buildMessage(update, (key, fallback, options) => String(t(key, fallback, options)))}
              </p>
              <Link
                href={`/appointments/${update.appointmentId}`}
                className={`mt-1.5 inline-block text-xs font-medium underline-offset-2 hover:underline ${cfg.color}`}
                data-testid={`ticker-link-${update.appointmentId}`}
              >
                {t("member_ticker.view", "View appointment →")}
              </Link>
            </div>

            <button
              type="button"
              onClick={() => onDismiss(update.id)}
              className="shrink-0 mt-0.5 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
               aria-label={t("member_ticker.dismiss", "Dismiss notification")}
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
