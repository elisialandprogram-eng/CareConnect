import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { formatInCurrency } from "@/lib/currency";
import { Loader2, AlertTriangle, RefreshCw, X, UserX, Wallet, Clock, CheckCircle2, CalendarDays } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";

export type AppointmentAction = "cancel" | "reschedule" | "no_show" | "propose";

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
  /** ISO-4217 currency that refund.amount is denominated in (e.g. "HUF", "IRR", "USD"). */
  displayCurrency?: string;
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
  // Patient cancel reasons
  schedule_conflict: "Schedule conflict",
  feeling_better: "Feeling better, no longer need it",
  found_alternative: "Found alternative care",
  financial: "Financial reason",
  personal: "Personal reason",
  transport_issue: "Transport / location issue",
  // Provider cancel reasons
  provider_sick: "Provider unavailable (illness)",
  emergency: "Emergency or urgent situation",
  overbooked: "Scheduling error / overbooked",
  patient_unresponsive: "Unable to reach patient",
  // Provider no-show reasons
  patient_did_not_arrive: "Client did not arrive",
  patient_unreachable: "Client was unreachable",
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
  propose: {
    titleKey: "appt_action.propose_title",
    title: "Propose new time",
    icon: CalendarDays,
    confirmLabel: "Send proposal",
    tone: "default",
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

  // Reset form when dialog opens — date defaults to today, times default to 09:00/10:00
  useEffect(() => {
    if (open) {
      setReasonCode("");
      setReason("");
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      setNewDate(`${yyyy}-${mm}-${dd}`);
      setNewStartTime("09:00");
      setNewEndTime("10:00");
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
      if (action === "reschedule" || action === "propose") {
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
        propose: t("appt_action.proposed_toast", "New time proposed — waiting for patient response"),
      };
      const refundAmount = data?.refund?.amount ?? quote?.refund?.amount ?? 0;
      toast({
        title: titleByAction[action],
        description: action === "cancel" && refundAmount > 0
          ? `${formatInCurrency(refundAmount, quote?.displayCurrency ?? "USD")} has been credited to the patient's wallet.`
          : action === "cancel"
          ? "No refund applies based on the cancellation policy."
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
            {action === "no_show" && t("appt_action.no_show_desc", "Record that the client did not attend.")}
            {action === "propose" && t("appt_action.propose_desc", "Suggest a new date and time. The patient will need to accept or reject your proposal.")}
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
            <div className="rounded-xl border bg-muted/30 p-4 space-y-3" data-testid="alert-refund-preview">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary shrink-0" />
                <span className="font-semibold text-sm">{t("appt_action.refund_preview", "Refund preview")}</span>
                <Badge
                  variant={quote.refund.amount > 0 ? "default" : "secondary"}
                  className="ml-auto text-[10px] h-5"
                  data-testid="badge-refund-policy"
                >
                  {quote.refund.policy === "full" || quote.refund.policy === "provider_full"
                    ? "Full refund"
                    : quote.refund.policy === "partial"
                    ? "50% refund"
                    : "No refund"}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Refund amount</p>
                  <p className="font-bold text-base" data-testid="text-refund-amount">
                    {quote.refund.amount > 0 ? formatInCurrency(quote.refund.amount, quote.displayCurrency ?? "USD") : "—"}
                  </p>
                </div>
                {quote.hoursBeforeStart !== null && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Time to appointment</p>
                    <p className="font-medium flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      {quote.hoursBeforeStart >= 24
                        ? `${Math.round(quote.hoursBeforeStart / 24)}d ${Math.round(quote.hoursBeforeStart % 24)}h`
                        : `${Math.round(quote.hoursBeforeStart)}h`}
                    </p>
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground border-t pt-2">{quote.refund.reason}</p>

              {quote.refund.amount > 0 && (
                <div className="flex items-start gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-3 py-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>Refund will be credited to the client's wallet immediately after cancellation.</span>
                </div>
              )}
            </div>
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

          {quote?.canPerform && (action === "reschedule" || action === "propose") && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="new-date">{t("appt_action.new_date", "New date")}</Label>
                <Input
                  id="new-date"
                  type="date"
                  value={newDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setNewDate(e.target.value)}
                  data-testid="input-new-date"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="new-start-time">{t("appt_action.start_time", "Start time")} <span className="text-xs text-muted-foreground">(HH:MM)</span></Label>
                  <Input
                    id="new-start-time"
                    type="text"
                    inputMode="numeric"
                    placeholder="09:00"
                    pattern="[0-2][0-9]:[0-5][0-9]"
                    maxLength={5}
                    value={newStartTime}
                    onChange={(e) => {
                      let v = e.target.value.replace(/[^0-9:]/g, "");
                      if (v.length === 2 && !v.includes(":") && newStartTime.length === 1) v = v + ":";
                      setNewStartTime(v);
                    }}
                    data-testid="input-new-start-time"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-end-time">{t("appt_action.end_time", "End time")} <span className="text-xs text-muted-foreground">(HH:MM)</span></Label>
                  <Input
                    id="new-end-time"
                    type="text"
                    inputMode="numeric"
                    placeholder="10:00"
                    pattern="[0-2][0-9]:[0-5][0-9]"
                    maxLength={5}
                    value={newEndTime}
                    onChange={(e) => {
                      let v = e.target.value.replace(/[^0-9:]/g, "");
                      if (v.length === 2 && !v.includes(":") && newEndTime.length === 1) v = v + ":";
                      setNewEndTime(v);
                    }}
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
