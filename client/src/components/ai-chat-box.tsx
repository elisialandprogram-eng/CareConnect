import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Send, X, Bot, User as UserIcon, Sparkles,
  Headphones, Minimize2, RefreshCcw, ArrowRight,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type Msg = {
  id: string;
  role: "assistant" | "user";
  content: string;
  escalate?: boolean;
  streaming?: boolean;
};

const REDIRECT_TOKEN = "[REDIRECT_SUPPORT]";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function AIChatBox() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isRtl = i18n.language === "fa";

  const quickPrompts: { key: string; text: string }[] = [
    { key: "qp_book", text: t("ai_chat.qp_book") },
    { key: "qp_find", text: t("ai_chat.qp_find") },
    { key: "qp_pricing", text: t("ai_chat.qp_pricing") },
    { key: "qp_cancel", text: t("ai_chat.qp_cancel") },
  ];

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [isOpen, isMinimized]);

  // Listen for global "open-ai-chat" so other components can open it
  useEffect(() => {
    const handler = () => { setIsOpen(true); setIsMinimized(false); };
    window.addEventListener("open-ai-chat", handler);
    return () => window.removeEventListener("open-ai-chat", handler);
  }, []);

  async function ensureConversation(): Promise<number> {
    if (conversationId) return conversationId;
    const res = await apiRequest("POST", "/api/conversations", { title: "AI Chat" });
    const data: any = await res.json();
    setConversationId(data.id);
    return data.id;
  }

  function resetChat() {
    setMessages([]);
    setConversationId(null);
    setInput("");
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");

    const userMsg: Msg = { id: uid(), role: "user", content: trimmed };
    const placeholder: Msg = { id: uid(), role: "assistant", content: "", streaming: true };
    setMessages((m) => [...m, userMsg, placeholder]);
    setBusy(true);

    try {
      const convId = await ensureConversation();
      const resp = await fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: trimmed }),
      });

      if (!resp.ok || !resp.body) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let escalate = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const json = line.slice(5).trim();
          if (!json) continue;
          try {
            const evt = JSON.parse(json);
            if (evt.content) {
              acc += evt.content;
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === placeholder.id ? { ...msg, content: acc } : msg
                )
              );
            }
            if (evt.escalate) escalate = true;
            if (evt.error) throw new Error(evt.error);
          } catch {
            /* ignore malformed chunk */
          }
        }
      }

      // Detect escalation token in the final text as well
      if (acc.startsWith(REDIRECT_TOKEN)) {
        escalate = true;
        acc = acc.slice(REDIRECT_TOKEN.length).trim() || t("ai_chat.escalate_default");
      }

      setMessages((m) =>
        m.map((msg) =>
          msg.id === placeholder.id
            ? { ...msg, content: acc || t("ai_chat.empty_reply"), streaming: false, escalate }
            : msg
        )
      );
    } catch (e: any) {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === placeholder.id
            ? {
                ...msg,
                content: t("ai_chat.error_message"),
                streaming: false,
                escalate: true,
              }
            : msg
        )
      );
    } finally {
      setBusy(false);
    }
  }

  async function connectToSupport() {
    if (!user) {
      toast({
        title: t("ai_chat.login_required_title"),
        description: t("ai_chat.login_required_desc"),
      });
      setIsOpen(false);
      navigate("/login");
      return;
    }
    setEscalating(true);
    try {
      await apiRequest("POST", "/api/support/contact", {});
      // Open the user-to-user ChatBox so they land on the live support thread.
      window.dispatchEvent(new Event("open-chat"));
      setIsOpen(false);
      toast({
        title: t("ai_chat.connected_title"),
        description: t("ai_chat.connected_desc"),
      });
    } catch (e: any) {
      toast({
        title: t("ai_chat.connect_failed"),
        description: e?.message || "",
        variant: "destructive",
      });
    } finally {
      setEscalating(false);
    }
  }

  const lastAssistantEscalated =
    messages.length > 0 &&
    messages[messages.length - 1].role === "assistant" &&
    !!messages[messages.length - 1].escalate;

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className={`fixed bottom-6 z-50 ${isRtl ? "left-6" : "right-6"}`}
      data-testid="ai-chat-root"
    >
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="ai-chat-panel"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
            className={`mb-4 w-[22rem] sm:w-[26rem] ${
              isMinimized ? "h-14" : "h-[34rem]"
            } flex flex-col overflow-hidden rounded-3xl border border-white/30 dark:border-white/10 shadow-2xl bg-card/95 backdrop-blur-xl`}
            data-testid="ai-chat-panel"
          >
            {/* Header */}
            <div className="relative shrink-0">
              <div className="absolute inset-0 bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700" />
              <div className="absolute inset-0 opacity-30 mix-blend-overlay [background:radial-gradient(circle_at_20%_20%,rgba(255,255,255,.5),transparent_60%)]" />
              <div className="relative flex items-center justify-between px-4 py-3 text-white">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="h-10 w-10 rounded-2xl bg-white/20 backdrop-blur grid place-items-center ring-1 ring-white/30">
                      <Bot className="h-5 w-5" />
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-white animate-pulse" />
                  </div>
                  <div className={isRtl ? "text-right" : ""}>
                    <div className="flex items-center gap-1.5 font-semibold leading-tight">
                      {t("ai_chat.title")}
                      <Sparkles className="h-3.5 w-3.5 opacity-90" />
                    </div>
                    <div className="text-[11px] opacity-90 leading-tight">
                      {t("ai_chat.subtitle")}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {messages.length > 0 && !isMinimized && (
                    <button
                      onClick={resetChat}
                      title={t("ai_chat.new_chat")}
                      className="h-8 w-8 grid place-items-center rounded-lg hover:bg-white/15 transition"
                      data-testid="button-ai-reset"
                    >
                      <RefreshCcw className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setIsMinimized((v) => !v)}
                    title={t("ai_chat.minimize")}
                    className="h-8 w-8 grid place-items-center rounded-lg hover:bg-white/15 transition"
                    data-testid="button-ai-minimize"
                  >
                    <Minimize2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    title={t("ai_chat.close")}
                    className="h-8 w-8 grid place-items-center rounded-lg hover:bg-white/15 transition"
                    data-testid="button-ai-close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {!isMinimized && (
              <>
                {/* Messages */}
                <ScrollArea className="flex-1 px-4 py-4">
                  <div ref={scrollRef} className="flex flex-col gap-4">
                    {/* Welcome bubble */}
                    {messages.length === 0 && (
                      <>
                        <BubbleAssistant text={t("ai_chat.welcome")} />
                        <div className="flex flex-wrap gap-2 pt-1">
                          {quickPrompts.map((qp) => (
                            <button
                              key={qp.key}
                              onClick={() => send(qp.text)}
                              className="text-xs px-3 py-2 rounded-full border border-border bg-muted/40 hover:bg-primary hover:text-primary-foreground hover:border-primary transition active:scale-95"
                              data-testid={`button-ai-quick-${qp.key}`}
                            >
                              {qp.text}
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {messages.map((m) => (
                      <div key={m.id}>
                        {m.role === "user" ? (
                          <BubbleUser text={m.content} isRtl={isRtl} />
                        ) : (
                          <BubbleAssistant
                            text={
                              m.content.startsWith(REDIRECT_TOKEN)
                                ? m.content.slice(REDIRECT_TOKEN.length).trim()
                                : m.content
                            }
                            streaming={m.streaming}
                          />
                        )}
                      </div>
                    ))}

                    {/* Escalation CTA */}
                    {lastAssistantEscalated && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="ml-10 -mt-1"
                      >
                        <Button
                          onClick={connectToSupport}
                          disabled={escalating}
                          className="w-full justify-between bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 text-white shadow-md hover:shadow-lg hover:opacity-95"
                          data-testid="button-ai-escalate"
                        >
                          <span className="flex items-center gap-2">
                            <Headphones className="h-4 w-4" />
                            {escalating
                              ? t("ai_chat.connecting")
                              : t("ai_chat.connect_support")}
                          </span>
                          <ArrowRight className={`h-4 w-4 ${isRtl ? "rotate-180" : ""}`} />
                        </Button>
                      </motion.div>
                    )}
                  </div>
                </ScrollArea>

                {/* Input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    send(input);
                  }}
                  className="shrink-0 border-t border-border bg-background/60 backdrop-blur p-3"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={t("ai_chat.placeholder")}
                      disabled={busy}
                      className={`flex-1 rounded-full bg-muted/50 border-transparent focus-visible:ring-1 focus-visible:ring-primary ${
                        isRtl ? "text-right" : ""
                      }`}
                      data-testid="input-ai-message"
                    />
                    <Button
                      type="submit"
                      size="icon"
                      disabled={busy || !input.trim()}
                      className="rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow hover:shadow-md hover:opacity-95"
                      data-testid="button-ai-send"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-2 text-center text-[10px] text-muted-foreground">
                    {t("ai_chat.footer_note")}
                  </div>
                </form>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating launcher */}
      <motion.button
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => {
          setIsOpen((v) => !v);
          setIsMinimized(false);
        }}
        className="relative h-14 w-14 rounded-full grid place-items-center text-white shadow-2xl bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700 ring-2 ring-white/40 dark:ring-white/10"
        data-testid="button-ai-chat"
        aria-label={t("ai_chat.title")}
      >
        <span className="absolute inset-0 rounded-full animate-ping bg-sky-500/40" />
        <span className="relative">
          {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        </span>
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-white" />
      </motion.button>
    </div>
  );
}

function BubbleAssistant({ text, streaming }: { text: string; streaming?: boolean }) {
  return (
    <div className="flex items-end gap-2">
      <div className="h-8 w-8 shrink-0 rounded-full grid place-items-center bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow ring-1 ring-white/30">
        <Bot className="h-4 w-4" />
      </div>
      <div className="max-w-[78%] rounded-2xl rounded-bl-md bg-muted text-foreground px-3.5 py-2.5 text-sm leading-relaxed shadow-sm">
        {streaming && !text ? <TypingDots /> : (
          <>
            {text}
            {streaming && text && (
              <span className="inline-block w-1.5 h-3 align-middle ml-0.5 bg-foreground/70 animate-pulse" />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function BubbleUser({ text, isRtl }: { text: string; isRtl: boolean }) {
  return (
    <div className={`flex items-end gap-2 ${isRtl ? "flex-row" : "flex-row-reverse"}`}>
      <div className="h-8 w-8 shrink-0 rounded-full grid place-items-center bg-foreground/10 text-foreground">
        <UserIcon className="h-4 w-4" />
      </div>
      <div className="max-w-[78%] rounded-2xl rounded-br-md bg-gradient-to-br from-sky-500 to-indigo-600 text-white px-3.5 py-2.5 text-sm leading-relaxed shadow-sm">
        {text}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="h-2 w-2 rounded-full bg-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="h-2 w-2 rounded-full bg-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
      <span className="h-2 w-2 rounded-full bg-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
    </div>
  );
}
