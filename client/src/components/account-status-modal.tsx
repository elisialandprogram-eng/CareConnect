import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertTriangle,
  Clock,
  XCircle,
  Ban,
  Mail,
  Phone,
  MessageSquare,
  Loader2,
  ExternalLink,
} from "lucide-react";

export type AccountStatusKind =
  | "PROVIDER_PENDING_APPROVAL"
  | "PROVIDER_SUSPENDED"
  | "PROVIDER_REJECTED"
  | "ACCOUNT_SUSPENDED";

interface AccountStatusModalProps {
  open: boolean;
  onClose: () => void;
  kind: AccountStatusKind;
  reason?: string | null;
  email?: string;
}

const SUPPORT_EMAIL = "Admin@GoldenLife.Health";
const SUPPORT_PHONE = "+36702370103";

export function AccountStatusModal({
  open,
  onClose,
  kind,
  reason,
  email,
}: AccountStatusModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [view, setView] = useState<"info" | "ticket">("info");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState(email || "");

  const config = {
    PROVIDER_PENDING_APPROVAL: {
      title: t("account_status.pending_title", "Awaiting admin approval"),
      description: t(
        "account_status.pending_desc",
        "Your provider application is currently under review. You'll be notified by email once it's approved.",
      ),
      icon: Clock,
      gradient: "from-amber-500 to-orange-600",
      badgeText: t("account_status.pending_badge", "Pending review"),
      badgeClass: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300",
      defaultSubject: t("account_status.pending_subject", "Question about my pending application"),
    },
    PROVIDER_SUSPENDED: {
      title: t("account_status.suspended_title", "Provider account suspended"),
      description: t(
        "account_status.suspended_desc",
        "Access to your provider account has been temporarily suspended. Please contact support to resolve this matter.",
      ),
      icon: Ban,
      gradient: "from-rose-500 to-red-600",
      badgeText: t("account_status.suspended_badge", "Suspended"),
      badgeClass: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300",
      defaultSubject: t("account_status.suspended_subject", "Appeal: provider account suspension"),
    },
    PROVIDER_REJECTED: {
      title: t("account_status.rejected_title", "Application not approved"),
      description: t(
        "account_status.rejected_desc",
        "Your provider application was not approved. If you believe this is a mistake, you can appeal by contacting our support team.",
      ),
      icon: XCircle,
      gradient: "from-rose-500 to-pink-600",
      badgeText: t("account_status.rejected_badge", "Rejected"),
      badgeClass: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300",
      defaultSubject: t("account_status.rejected_subject", "Appeal: provider application decision"),
    },
    ACCOUNT_SUSPENDED: {
      title: t("account_status.account_suspended_title", "Account suspended"),
      description: t(
        "account_status.account_suspended_desc",
        "Your account has been suspended. Please contact our support team for further assistance.",
      ),
      icon: AlertTriangle,
      gradient: "from-rose-500 to-red-600",
      badgeText: t("account_status.suspended_badge", "Suspended"),
      badgeClass: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300",
      defaultSubject: t("account_status.account_suspended_subject", "Help: account suspension"),
    },
  }[kind];

  const Icon = config.icon;

  const ticketMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      subject: string;
      description: string;
      category: string;
      priority: string;
    }) => {
      return apiRequest("POST", "/api/support/tickets", payload);
    },
    onSuccess: () => {
      toast({
        title: t("account_status.ticket_sent", "Ticket submitted"),
        description: t(
          "account_status.ticket_sent_desc",
          "Our support team will get back to you shortly.",
        ),
      });
      setSubject("");
      setMessage("");
      setView("info");
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: t("account_status.ticket_failed", "Could not submit ticket"),
        description: err?.message || t("common.something_went_wrong", "Something went wrong"),
        variant: "destructive",
      });
    },
  });

  const handleOpen = () => {
    setSubject(config.defaultSubject);
    setView("ticket");
  };

  const categoryMap: Record<AccountStatusKind, string> = {
    PROVIDER_PENDING_APPROVAL: "account_status",
    PROVIDER_SUSPENDED: "account_appeal",
    PROVIDER_REJECTED: "account_appeal",
    ACCOUNT_SUSPENDED: "account_appeal",
  };

  const submitTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactEmail.trim() || !message.trim()) return;
    const fullDescription = `Email: ${contactEmail.trim()}\n\n${message.trim()}`;
    ticketMutation.mutate({
      name: contactEmail.split("@")[0] || "Visitor",
      subject: subject.trim() || config.defaultSubject,
      description: fullDescription,
      category: categoryMap[kind],
      priority: kind === "PROVIDER_PENDING_APPROVAL" ? "low" : "high",
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setView("info");
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden" data-testid="dialog-account-status">
        <div className={`relative p-6 text-white bg-gradient-to-br ${config.gradient}`}>
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-start gap-4">
            <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
              <Icon className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <Badge variant="outline" className={`mb-2 border-white/30 bg-white/20 text-white`}>
                {config.badgeText}
              </Badge>
              <DialogHeader className="text-left space-y-1">
                <DialogTitle className="text-white text-xl font-bold">
                  {config.title}
                </DialogTitle>
                <DialogDescription className="text-white/85 text-sm">
                  {config.description}
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {reason && (
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("account_status.reason_label", "Reason provided")}
              </p>
              <p className="text-sm mt-1" data-testid="text-status-reason">{reason}</p>
            </div>
          )}

          {view === "info" ? (
            <>
              <div className="grid gap-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("account_status.contact_options", "Contact options")}
                </p>
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(config.defaultSubject)}`}
                  className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/40 transition-colors"
                  data-testid="link-support-email"
                >
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {t("account_status.email_support", "Email support")}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{SUPPORT_EMAIL}</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </a>
                <a
                  href={`tel:${SUPPORT_PHONE}`}
                  className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/40 transition-colors"
                  data-testid="link-support-phone"
                >
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <Phone className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {t("account_status.call_support", "Call support")}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{SUPPORT_PHONE}</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </a>
                <button
                  type="button"
                  onClick={handleOpen}
                  className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/40 transition-colors text-left"
                  data-testid="button-raise-ticket"
                >
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {t("account_status.raise_ticket", "Raise a support ticket")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("account_status.raise_ticket_desc", "Send us a message right here")}
                    </p>
                  </div>
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={submitTicket} className="space-y-3" data-testid="form-support-ticket">
              <div>
                <Label htmlFor="ticket-email" className="text-xs">
                  {t("common.email", "Email")}
                </Label>
                <Input
                  id="ticket-email"
                  type="email"
                  required
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="you@example.com"
                  data-testid="input-ticket-email"
                />
              </div>
              <div>
                <Label htmlFor="ticket-subject" className="text-xs">
                  {t("account_status.subject", "Subject")}
                </Label>
                <Input
                  id="ticket-subject"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  data-testid="input-ticket-subject"
                />
              </div>
              <div>
                <Label htmlFor="ticket-message" className="text-xs">
                  {t("account_status.message", "Message")}
                </Label>
                <Textarea
                  id="ticket-message"
                  required
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t(
                    "account_status.message_placeholder",
                    "Describe your situation and we'll get back to you...",
                  )}
                  data-testid="input-ticket-message"
                />
              </div>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setView("info")}
                  data-testid="button-ticket-back"
                >
                  {t("common.back", "Back")}
                </Button>
                <Button
                  type="submit"
                  disabled={ticketMutation.isPending}
                  data-testid="button-ticket-submit"
                >
                  {ticketMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t("account_status.submit_ticket", "Submit ticket")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
