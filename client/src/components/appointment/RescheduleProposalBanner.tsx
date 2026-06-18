import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, X, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ProposedTime {
  date: string;
  startTime: string;
  endTime: string;
}

interface Props {
  appointmentId: string;
  appointmentNumber?: string;
  /** Keys to invalidate after accept/reject */
  invalidateKeys?: (string | string[])[];
  onSettled?: () => void;
}

function parseProposedTime(events: any[]): ProposedTime | null {
  if (!events?.length) return null;
  const proposeEvent = [...events].reverse().find((e: any) => e.action === "propose");
  if (!proposeEvent?.metadata) return null;
  try {
    const meta = JSON.parse(proposeEvent.metadata);
    if (meta.proposed?.date) return meta.proposed;
  } catch { /* ignore */ }
  return null;
}

export function RescheduleProposalBanner({ appointmentId, appointmentNumber, invalidateKeys = [], onSettled }: Props) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [showReason, setShowReason] = useState(false);

  const { data: events, isLoading: eventsLoading } = useQuery<any[]>({
    queryKey: ["/api/appointments", appointmentId, "events"],
    queryFn: async () => {
      const res = await fetch(`/api/appointments/${appointmentId}/events`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load events");
      return res.json();
    },
    staleTime: 0,
  });

  const proposedTime = events ? parseProposedTime(events) : null;

  const mutation = useMutation({
    mutationFn: async (accept: boolean) => {
      const res = await apiRequest("POST", `/api/appointments/${appointmentId}/reschedule-response`, {
        accept,
        reason: reason || undefined,
      });
      return res.json();
    },
    onSuccess: (data, accept) => {
      toast({
        title: accept ? "Reschedule accepted" : "Appointment cancelled",
        description: accept
          ? `Your appointment has been rescheduled to ${proposedTime?.date} at ${proposedTime?.startTime}.`
          : "You declined the reschedule. The appointment has been cancelled and a full refund issued to your wallet.",
      });
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: Array.isArray(key) ? key : [key] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/appointments", appointmentId, "events"] });
      onSettled?.();
    },
    onError: (err: any) => {
      toast({
        title: "Action failed",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (eventsLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        Loading reschedule proposal…
      </div>
    );
  }

  const apptRef = appointmentNumber ? ` (${appointmentNumber})` : "";

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-4 space-y-3"
      data-testid="banner-reschedule-proposal">
      <div className="flex items-start gap-3">
        <CalendarDays className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-amber-900 dark:text-amber-200">
            Your provider proposed a new appointment time{apptRef}
          </p>
          {proposedTime ? (
            <div className="mt-1 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>{proposedTime.date}</strong> · {proposedTime.startTime}
                {proposedTime.endTime ? ` – ${proposedTime.endTime}` : ""}
              </span>
            </div>
          ) : (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              Check your appointment details for the proposed time.
            </p>
          )}
          <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
            Accept to move to the new time, or decline to cancel the appointment with a full refund.
          </p>
        </div>
      </div>

      {showReason && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-amber-800 dark:text-amber-300">
            Reason for declining (optional)
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Let your provider know why you can't make the new time…"
            rows={2}
            maxLength={500}
            className="text-sm"
            data-testid="input-decline-reason"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => mutation.mutate(true)}
          disabled={mutation.isPending}
          data-testid="button-accept-reschedule"
        >
          {mutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
          )}
          Accept new time
        </Button>
        {!showReason ? (
          <Button
            size="sm"
            variant="outline"
            className="border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-600 dark:hover:bg-amber-900/30"
            onClick={() => setShowReason(true)}
            disabled={mutation.isPending}
            data-testid="button-decline-reschedule"
          >
            <X className="h-3.5 w-3.5 mr-1.5" />
            Decline
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="border-red-400 text-red-700 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-950/30"
            onClick={() => mutation.mutate(false)}
            disabled={mutation.isPending}
            data-testid="button-confirm-decline-reschedule"
          >
            {mutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5 mr-1.5" />
            )}
            Confirm decline
          </Button>
        )}
      </div>
    </div>
  );
}
