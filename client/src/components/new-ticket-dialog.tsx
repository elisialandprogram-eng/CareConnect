import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { showErrorModal } from "@/components/error-modal";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, LifeBuoy } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (ticketId: string) => void;
}

export function NewTicketDialog({ open, onOpenChange, onCreated }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");

  useEffect(() => {
    if (open) {
      setSubject("");
      setDescription("");
      setPriority("medium");
    }
  }, [open]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/support/tickets", {
        subject: subject.trim(),
        description: description.trim(),
        priority,
      });
      return r.json();
    },
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      toast({ title: t("support.created_toast", "Ticket created") });
      onOpenChange(false);
      if (created?.id && onCreated) onCreated(created.id);
    },
    onError: (e: any) => {
      showErrorModal({
        title: t("support.create_failed", "Could not create ticket"),
        description: e?.message || t("common.try_again", "Please try again."),
        context: "new-ticket-dialog.create",
      });
    },
  });

  const canSubmit = subject.trim().length > 0 && description.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-new-ticket" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-primary" />
            {t("support.new_ticket", "New ticket")}
          </DialogTitle>
          <DialogDescription>
            {t("support.new_ticket_desc", "Describe what you need help with and our team will get back to you.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="ticket-subject">{t("support.subject", "Subject")}</Label>
            <Input
              id="ticket-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("support.subject_placeholder", "Brief summary of your issue")}
              data-testid="input-ticket-subject"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ticket-priority">{t("support.priority", "Priority")}</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
              <SelectTrigger id="ticket-priority" data-testid="select-ticket-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">{t("support.priority_low", "Low")}</SelectItem>
                <SelectItem value="medium">{t("support.priority_medium", "Medium")}</SelectItem>
                <SelectItem value="high">{t("support.priority_high", "High")}</SelectItem>
                <SelectItem value="urgent">{t("support.priority_urgent", "Urgent")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ticket-description">{t("support.description", "Description")}</Label>
            <Textarea
              id="ticket-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("support.description_placeholder", "Provide as much detail as you can…")}
              rows={6}
              className="resize-none"
              data-testid="textarea-ticket-description"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-new-ticket"
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit || createMutation.isPending}
            data-testid="button-submit-new-ticket"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("support.submit_ticket", "Submit ticket")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
