import { useQuery } from "@tanstack/react-query";
import { QK } from "@/lib/query-keys";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/datetime";
import {
  CheckCircle2, XCircle, Clock, CalendarClock, PlayCircle, RefreshCw,
  ThumbsUp, ThumbsDown, UserX, AlertCircle, RotateCcw, CreditCard,
  FileText, MessageSquare, Bell,
} from "lucide-react";

interface EventRow {
  id: string;
  eventType: string;
  createdAt: string;
  actorRole?: string | null;
  actorName?: string | null;
  metadata?: string | null;
}

const EVENT_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  book:                  { label: "Appointment Created",      icon: <CalendarClock className="h-4 w-4" />,  color: "bg-blue-500"    },
  confirm:               { label: "Confirmed",                icon: <ThumbsUp className="h-4 w-4" />,       color: "bg-emerald-500" },
  approve:               { label: "Approved",                 icon: <ThumbsUp className="h-4 w-4" />,       color: "bg-emerald-500" },
  start:                 { label: "Session Started",          icon: <PlayCircle className="h-4 w-4" />,     color: "bg-indigo-500"  },
  complete:              { label: "Session Completed",        icon: <CheckCircle2 className="h-4 w-4" />,   color: "bg-emerald-600" },
  cancel:                { label: "Cancelled",                icon: <XCircle className="h-4 w-4" />,        color: "bg-rose-500"    },
  reject:                { label: "Rejected",                 icon: <ThumbsDown className="h-4 w-4" />,     color: "bg-rose-500"    },
  reschedule:            { label: "Reschedule Requested",     icon: <RefreshCw className="h-4 w-4" />,      color: "bg-amber-500"   },
  propose:               { label: "New Time Proposed",        icon: <CalendarClock className="h-4 w-4" />,  color: "bg-amber-500"   },
  reschedule_accept:     { label: "Reschedule Accepted",      icon: <CheckCircle2 className="h-4 w-4" />,   color: "bg-emerald-500" },
  reschedule_reject:     { label: "Reschedule Declined",      icon: <XCircle className="h-4 w-4" />,        color: "bg-rose-400"    },
  no_show:               { label: "No Show",                  icon: <UserX className="h-4 w-4" />,          color: "bg-rose-400"    },
  refund:                { label: "Refund Issued",            icon: <RotateCcw className="h-4 w-4" />,      color: "bg-teal-500"    },
  payment:               { label: "Payment Completed",        icon: <CreditCard className="h-4 w-4" />,     color: "bg-teal-500"    },
  invoice:               { label: "Invoice Generated",       icon: <FileText className="h-4 w-4" />,        color: "bg-slate-500"   },
  reminder:              { label: "Reminder Sent",            icon: <Bell className="h-4 w-4" />,           color: "bg-slate-400"   },
  followup_scheduled:    { label: "Follow-up Scheduled",     icon: <MessageSquare className="h-4 w-4" />,  color: "bg-violet-500"  },
  status_change:         { label: "Status Updated",           icon: <Clock className="h-4 w-4" />,          color: "bg-slate-400"   },
};

function formatEventTime(iso: string): string {
  return formatDateTime(iso, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) || iso;
}

function resolveConfig(eventType: string | undefined | null) {
  if (!eventType) return {
    label: "Event",
    icon: <AlertCircle className="h-4 w-4" />,
    color: "bg-slate-400",
  };
  if (EVENT_CONFIG[eventType]) return EVENT_CONFIG[eventType];
  for (const [key, cfg] of Object.entries(EVENT_CONFIG)) {
    if (eventType.includes(key)) return cfg;
  }
  return {
    label: eventType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    icon: <AlertCircle className="h-4 w-4" />,
    color: "bg-slate-400",
  };
}

export function AppointmentTimeline({ appointmentId, events: propEvents }: { appointmentId?: string | null; events?: EventRow[] }) {
  const { data: fetchedEvents, isLoading } = useQuery<EventRow[]>({
    queryKey: QK.appointmentEvents(appointmentId ?? ""),
    enabled: !!appointmentId && !propEvents,
  });

  const events = propEvents ?? fetchedEvents ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="timeline-loading">
        {[0, 1, 2].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
      </div>
    );
  }

  if (!events.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4" data-testid="timeline-empty">
        No timeline events yet.
      </p>
    );
  }

  return (
    <div className="relative" data-testid="appointment-timeline">
      <div className="absolute left-4 top-2 bottom-2 w-px bg-border" />
      <div className="space-y-4">
        {events.map((ev, idx) => {
          const cfg = resolveConfig(ev.eventType);
          const isLast = idx === events.length - 1;
          let meta: Record<string, unknown> = {};
          try { meta = typeof ev.metadata === "string" ? JSON.parse(ev.metadata) : (ev.metadata as any) ?? {}; } catch {}
          return (
            <div key={ev.id} className="relative flex gap-3 pl-8" data-testid={`timeline-event-${ev.eventType}`}>
              <div className={`absolute left-1.5 top-1 h-5 w-5 rounded-full ${cfg.color} flex items-center justify-center text-white shrink-0 shadow-sm ring-2 ring-background`}>
                {cfg.icon}
              </div>
              <div className={`flex-1 min-w-0 rounded-lg border bg-card px-3 py-2 shadow-sm ${isLast ? "border-primary/30 bg-primary/5" : ""}`}>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <p className="text-sm font-medium">{cfg.label}</p>
                  <span className="text-[11px] text-muted-foreground shrink-0">{formatEventTime(ev.createdAt)}</span>
                </div>
                {(ev.actorName || ev.actorRole) && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ev.actorName ? `By ${ev.actorName}` : `By ${ev.actorRole}`}
                  </p>
                )}
                {!!meta.reason && (
                  <p className="text-xs text-muted-foreground mt-0.5 italic">Reason: {String(meta.reason)}</p>
                )}
                {!!meta.proposedDate && !!meta.proposedTime && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Proposed: {String(meta.proposedDate)} at {String(meta.proposedTime)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
