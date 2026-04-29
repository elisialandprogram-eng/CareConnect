import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, AlertTriangle, RefreshCw, X, UserX } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export type AppointmentAction = "cancel" | "reschedule" | "no_show";

interface QuoteResponse {
  canPerform: boolean;
  reason?: string;
  toStatus?: string;
  hoursBeforeStart: number | null;
  refund: {
    amount: number;
    policy: string;
    reason: string;
    hoursBeforeStart: number | null;
  };
  reasonCodes: string[];
}

interface Props {
  appointmentId: string | null;
  action: AppointmentAction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Query keys to invalidate on success. */
  invalidateKeys?: (string | (string | number)[])[];
  /** Called after a successful action with the server response. */
  onSuccess?: (data: any) => void;
}

const REASON_LABELS: Record<string, string> = {
  schedule_conflict: "Schedule conflict",
  feeling_better: "Feeling better, no longer need it",
  found_alternative: "Found alternative care",
  financial: "Financial reason",
  personal: "Personal reason",
  transport_issue: "Transport / location issue",
  patient_did_not_arrive: "Patient did not arrive",
  patient_unreachable: "Patient was unreachable",
  other: "Other",
};

const ACTION_META: Record<AppointmentAction, { titleKey: string; title: string; icon: any; confirmLabel: string; tone: "destructive" | "default" }> = {
  cancel: {
    titleKey: "appt_action.cancel_title",
    title: "Cancel appointment",
    icon: X,
    confirmLabel: "Confirm cancellation",
    tone: "destructive",
  },
  reschedule: {
    titleKey: "appt_action.reschedule_title",
    title: "Reschedule appointment",
    icon: RefreshCw,
    confirmLabel: "Confirm reschedule",
    tone: "default",
  },
  no_show: {
    titleKey: "appt_action.no_show_title",
    title: "Mark as no-show",
    icon: UserX,
    confirmLabel: "Mark no-show",
    tone: "destructive",
  },
};

export function AppointmentActionDialog({
  appointmentId,
  action,
  open,
  onOpenChange,
  invalidateKeys = [],
  onSuccess,
}: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const meta = ACTION_META[action];
  const Icon = meta.icon;

  const [reasonCode, setReasonCode] = useState<string>("");
  const [reason, setReason] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newStartTime, setNewStartTime] = useState("");
  const [newEndTime, setNewEndTime] = useState("");

  // Reset form when dialog opens for a different appointment/action
  useEffect(() => {
    if (open) {
      setReasonCode("");
      setReason("");
      setNewDate("");
      setNewStartTime("");
      setNewEndTime("");
    }
  }, [open, appointmentId, action]);

  const { data: quote, isLoading: quoteLoading } = useQuery<QuoteResponse>({
    queryKey: ["/api/appointments", appointmentId, "action-quote", action],
    queryFn: async () => {
      const res = await fetch(
        `/api/appointments/${appointmentId}/action-quote?action=${action}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load quote");
      return res.json();
    },
    enabled: open && !!appointmentId,
    staleTime: 0,
  });

  const reasonCodes = quote?.reasonCodes ?? [];

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = { action };
      if (reason) body.reason = reason;
      if (reasonCode) body.reasonCode = reasonCode;
      if (action === "reschedule") {
        body.newDate = newDate;
        body.newStartTime = newStartTime;
        body.newEndTime = newEndTime;
      }
      const res = await apiRequest("POST", `/api/appointments/${appointmentId}/action`, body);
      return res.json();
    },
    onSuccess: (data) => {
      const titleByAction: Record<AppointmentAction, string> = {
        cancel: t("appt_action.cancelled_toast", "Appointment cancelled"),
        reschedule: t("appt_action.rescheduled_toast", "Appointment rescheduled"),
        no_show: t("appt_action.no_show_toast", "Marked as no-show"),
      };
      const refundAmount = data?.refund?.amount ?? 0;
      toast({
        title: titleByAction[action],
        description: action === "cancel" && refundAmount > 0
          ? `Refund of ${refundAmount} HUF issued to wallet.`
          : undefined,
      });
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: Array.isArray(key) ? key : [key] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/appointments", appointmentId, "events"] });
      onSuccess?.(data);
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        title: t("appt_action.failed_toast", "Action failed"),
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const canSubmit = (() => {
    if (mutation.isPending) return false;
    if (!quote?.canPerform) return false;
    if (action === "reschedule") {
      return !!newDate && !!newStartTime && !!newEndTime;
    }
    return true;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid={`dialog-appt-action-${action}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {t(meta.titleKey, meta.title)}
          </DialogTitle>
          <DialogDescription>
            {action === "cancel" && t("appt_action.cancel_desc", "Tell us why and review the refund before confirming.")}
            {action === "reschedule" && t("appt_action.reschedule_desc", "Pick a new time for this appointment.")}
            {action === "no_show" && t("appt_action.no_show_desc", "Record that the patient did not attend.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {quoteLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("appt_action.checking_rules", "Checking rules…")}
            </div>
          )}

          {quote && !quote.canPerform && (
            <Alert variant="destructive" data-testid="alert-cannot-perform">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{t("appt_action.not_allowed", "Not allowed")}</AlertTitle>
              <AlertDescription>{quote.reason}</AlertDescription>
            </Alert>
          )}

          {quote?.canPerform && action === "cancel" && (
            <Alert data-testid="alert-refund-preview">
              <AlertTitle>{t("appt_action.refund_preview", "Refund preview")}</AlertTitle>
              <AlertDescription>
                <div className="text-sm">{quote.refund.reason}</div>
                <div className="mt-1 font-semibold">
                  {t("appt_action.refund_amount", "Refund amount")}: {quote.refund.amount} HUF
                </div>
              </AlertDescription>
            </Alert>
          )}

          {quote?.canPerform && reasonCodes.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="reason-code">{t("appt_action.reason_label", "Reason")}</Label>
              <Select value={reasonCode} onValueChange={setReasonCode}>
                <SelectTrigger data-testid="select-reason-code">
                  <SelectValue placeholder={t("appt_action.select_reason", "Select a reason")} />
                </SelectTrigger>
                <SelectContent>
                  {reasonCodes.map((code) => (
                    <SelectItem key={code} value={code} data-testid={`option-reason-${code}`}>
                      {REASON_LABELS[code] ?? code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {quote?.canPerform && (
            <div className="space-y-2">
              <Label htmlFor="reason-text">{t("appt_action.notes_label", "Notes (optional)")}</Label>
              <Textarea
                id="reason-text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("appt_action.notes_placeholder", "Add any details that may help the other party...")}
                data-testid="input-reason-text"
                maxLength={2000}
                rows={3}
              />
            </div>
          )}

          {quote?.canPerform && action === "reschedule" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="new-date">{t("appt_action.new_date", "New date")}</Label>
                <Input
                  id="new-date"
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  data-testid="input-new-date"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="new-start-time">{t("appt_action.start_time", "Start time")}</Label>
                  <Input
                    id="new-start-time"
                    type="time"
                    value={newStartTime}
                    onChange={(e) => setNewStartTime(e.target.value)}
                    data-testid="input-new-start-time"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-end-time">{t("appt_action.end_time", "End time")}</Label>
                  <Input
                    id="new-end-time"
                    type="time"
                    value={newEndTime}
                    onChange={(e) => setNewEndTime(e.target.value)}
                    data-testid="input-new-end-time"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
            data-testid="button-action-back"
          >
            {t("common.back", "Back")}
          </Button>
          <Button
            variant={meta.tone === "destructive" ? "destructive" : "default"}
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
            data-testid="button-action-confirm"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {meta.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
