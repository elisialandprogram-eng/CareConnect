import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertCircle,
  Mail,
  Phone,
  MessageSquare,
  Loader2,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

const SUPPORT_EMAIL = "Admin@GoldenLife.Health";
const SUPPORT_PHONE = "+36702370103";

export interface ShowErrorPayload {
  title?: string;
  description?: string;
  retry?: () => void;
  context?: string;
}

interface ErrorModalContextType {
  showError: (payload: ShowErrorPayload) => void;
}

const ErrorModalContext = createContext<ErrorModalContextType | null>(null);

let externalShowError: ((p: ShowErrorPayload) => void) | null = null;

export function cleanErrorDescription(input?: string): string | undefined {
  if (!input) return input;
  let text = String(input).trim();

  // Strip leading "<status>:" prefix from `${res.status}: ${text}` style errors.
  const statusPrefix = text.match(/^\d{3}\s*:\s*/);
  if (statusPrefix) {
    text = text.slice(statusPrefix[0].length).trim();
  }

  // If the remainder looks like JSON, try to extract a friendly message.
  if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") {
        const candidate =
          (parsed as any).message ||
          (parsed as any).reason ||
          (parsed as any).error ||
          (parsed as any).detail ||
          (parsed as any).description;
        if (candidate && typeof candidate === "string") return candidate;
        // Fallback: format key/value pairs on separate lines instead of raw JSON.
        const entries = Object.entries(parsed)
          .filter(([, v]) => v != null && typeof v !== "object")
          .map(([k, v]) => `${k}: ${String(v)}`);
        if (entries.length > 0) return entries.join("\n");
      }
    } catch {
      // not valid JSON, leave as-is
    }
  }

  return text;
}

export function showErrorModal(payload: ShowErrorPayload) {
  const cleaned: ShowErrorPayload = {
    ...payload,
    description: cleanErrorDescription(payload.description),
  };
  if (externalShowError) externalShowError(cleaned);
  else if (typeof console !== "undefined") {
    console.warn("[error-modal] not mounted yet:", cleaned);
  }
}

export function useErrorModal(): ErrorModalContextType {
  const ctx = useContext(ErrorModalContext);
  if (!ctx) {
    return {
      showError: (p) => showErrorModal(p),
    };
  }
  return ctx;
}

export function ErrorModalProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<ShowErrorPayload>({});
  const [view, setView] = useState<"info" | "ticket">("info");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const showError = useCallback((p: ShowErrorPayload) => {
    setPayload(p);
    setView("info");
    setSubject(p.title || t("error_modal.default_subject", "Help with an error"));
    setMessage(p.description || "");
    setOpen(true);
  }, [t]);

  useEffect(() => {
    externalShowError = showError;
    return () => {
      if (externalShowError === showError) externalShowError = null;
    };
  }, [showError]);

  const ticketMutation = useMutation({
    mutationFn: async () => {
      const errBody = [
        message ? `${t("error_modal.ticket_msg_label", "Message")}: ${message}` : "",
        payload.context ? `${t("error_modal.ticket_context_label", "Context")}: ${payload.context}` : "",
        contactEmail ? `${t("error_modal.ticket_email_label", "Reply to")}: ${contactEmail}` : "",
      ].filter(Boolean).join("\n\n");
      const res = await apiRequest("POST", "/api/support/tickets", {
        subject: subject.trim() || t("error_modal.default_subject", "Help with an error"),
        description: errBody || subject || "Need help",
        category: "technical_issue",
        priority: "high",
        name: contactEmail ? contactEmail.split("@")[0] : undefined,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.message || `HTTP ${res.status}`);
      }
      return res.json().catch(() => ({}));
    },
    onSuccess: () => {
      toast({
        title: t("error_modal.ticket_sent_title", "Support ticket sent"),
        description: t("error_modal.ticket_sent_desc", "Our team will get back to you shortly."),
      });
      setOpen(false);
      setView("info");
      setSubject("");
      setMessage("");
      setContactEmail("");
    },
    onError: (err: any) => {
      toast({
        title: t("error_modal.ticket_failed_title", "Could not send ticket"),
        description: err?.message || t("error_modal.ticket_failed_desc", "Please try again or email us directly."),
        variant: "destructive",
      });
    },
  });

  const mailHref = useMemo(() => {
    const subj = encodeURIComponent(payload.title || "Support request");
    const body = encodeURIComponent(
      [
        payload.description ? `${t("error_modal.ticket_msg_label", "Message")}: ${payload.description}` : "",
        payload.context ? `${t("error_modal.ticket_context_label", "Context")}: ${payload.context}` : "",
      ].filter(Boolean).join("\n\n"),
    );
    return `mailto:${SUPPORT_EMAIL}?subject=${subj}&body=${body}`;
  }, [payload, t]);

  const handleRetry = () => {
    const fn = payload.retry;
    setOpen(false);
    if (fn) setTimeout(fn, 50);
  };

  const value = useMemo(() => ({ showError }), [showError]);

  return (
    <ErrorModalContext.Provider value={value}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            setOpen(false);
            setView("info");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden" data-testid="dialog-error-modal">
          <div className="bg-gradient-to-br from-rose-500 via-red-500 to-orange-500 p-6 text-white">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center ring-2 ring-white/30">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogHeader className="space-y-1 text-left">
                  <DialogTitle className="text-xl font-bold text-white" data-testid="text-error-title">
                    {payload.title || t("error_modal.default_title", "Something went wrong")}
                  </DialogTitle>
                  {payload.description ? (
                    <DialogDescription className="text-white/90 text-sm leading-relaxed" data-testid="text-error-description">
                      {payload.description}
                    </DialogDescription>
                  ) : (
                    <DialogDescription className="text-white/90 text-sm leading-relaxed">
                      {t("error_modal.default_description", "We hit an unexpected problem. You can try again or contact our support team.")}
                    </DialogDescription>
                  )}
                </DialogHeader>
              </div>
            </div>
          </div>

          {view === "info" ? (
            <div className="p-6 space-y-4">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  {t("error_modal.contact_options", "Need help? Contact our support team")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <a
                    href={mailHref}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover-elevate active-elevate-2 transition-colors"
                    data-testid="link-error-email"
                  >
                    <Mail className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    <span className="truncate">{t("error_modal.email_support", "Email support")}</span>
                    <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
                  </a>
                  <a
                    href={`tel:${SUPPORT_PHONE}`}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover-elevate active-elevate-2 transition-colors"
                    data-testid="link-error-phone"
                  >
                    <Phone className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="truncate">{SUPPORT_PHONE}</span>
                  </a>
                </div>
                <Button
                  variant="outline"
                  className="w-full mt-3"
                  onClick={() => setView("ticket")}
                  data-testid="button-open-ticket"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  {t("error_modal.raise_ticket", "Raise a support ticket")}
                </Button>
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  data-testid="button-close-error"
                >
                  {t("error_modal.close", "Close")}
                </Button>
                {payload.retry ? (
                  <Button
                    onClick={handleRetry}
                    className="bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white"
                    data-testid="button-retry-error"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {t("error_modal.try_again", "Try again")}
                  </Button>
                ) : null}
              </DialogFooter>
            </div>
          ) : (
            <form
              className="p-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                ticketMutation.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="err-subject">{t("error_modal.subject", "Subject")}</Label>
                <Input
                  id="err-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t("error_modal.subject_placeholder", "Briefly describe the issue")}
                  required
                  data-testid="input-error-subject"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="err-message">{t("error_modal.message", "Message")}</Label>
                <Textarea
                  id="err-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("error_modal.message_placeholder", "What were you trying to do when this happened?")}
                  rows={4}
                  data-testid="input-error-message"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="err-email">{t("error_modal.your_email", "Your email (optional)")}</Label>
                <Input
                  id="err-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="you@example.com"
                  data-testid="input-error-email"
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setView("info")}
                  data-testid="button-back-error"
                >
                  {t("error_modal.back", "Back")}
                </Button>
                <Button
                  type="submit"
                  disabled={ticketMutation.isPending}
                  className="bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white"
                  data-testid="button-submit-ticket"
                >
                  {ticketMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <MessageSquare className="h-4 w-4 mr-2" />
                  )}
                  {t("error_modal.send_ticket", "Send ticket")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </ErrorModalContext.Provider>
  );
}
