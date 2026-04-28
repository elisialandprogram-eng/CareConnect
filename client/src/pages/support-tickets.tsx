import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { showErrorModal } from "@/components/error-modal";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { NewTicketDialog } from "@/components/new-ticket-dialog";
import {
  LifeBuoy, ChevronRight, Send, ArrowLeft, MessageSquare,
  CheckCircle, Clock, AlertTriangle, Ban, Search, Plus, Loader2,
} from "lucide-react";

type TicketListItem = {
  id: string;
  subject: string;
  description: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  createdAt: string;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  replyCount: number;
  hasAdminReply: boolean;
};

type TicketMessage = {
  id: string;
  ticketId: string;
  userId: string;
  message: string;
  isInternal: boolean;
  createdAt: string;
  sender: { id: string; firstName: string; lastName: string; role: string } | null;
};

type TicketDetail = {
  ticket: TicketListItem;
  messages: TicketMessage[];
};

const statusStyles: Record<string, { label: string; className: string; icon: any }> = {
  open: { label: "Open", className: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300", icon: AlertTriangle },
  in_progress: { label: "In progress", className: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300", icon: Clock },
  resolved: { label: "Resolved", className: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300", icon: CheckCircle },
  closed: { label: "Closed", className: "bg-muted text-muted-foreground border-border", icon: Ban },
};

const priorityStyles: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

function timeAgo(iso: string, t: any) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("support.just_now", "just now");
  if (m < 60) return t("support.min_ago", "{{count}}m ago", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("support.hour_ago", "{{count}}h ago", { count: h });
  const d = Math.floor(h / 24);
  if (d < 7) return t("support.day_ago", "{{count}}d ago", { count: d });
  return new Date(iso).toLocaleDateString();
}

export default function SupportTicketsPage() {
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/login");
  }, [authLoading, isAuthenticated, navigate]);

  const { data: tickets, isLoading: ticketsLoading } = useQuery<TicketListItem[]>({
    queryKey: ["/api/support/tickets"],
    enabled: !!user,
  });

  const { data: detail, isLoading: detailLoading } = useQuery<TicketDetail>({
    queryKey: ["/api/support/tickets", selectedId],
    enabled: !!selectedId,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (detail?.messages?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [detail?.messages?.length]);

  const replyMutation = useMutation({
    mutationFn: async ({ id, message }: { id: string; message: string }) => {
      const res = await apiRequest("POST", `/api/support/tickets/${id}/messages`, { message });
      return res.json();
    },
    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
    },
    onError: (e: Error) => {
      showErrorModal({
        title: t("support.send_failed", "Couldn't send"),
        description: e.message,
        context: "support-tickets.reply",
      });
    },
  });

  const filtered = (tickets ?? []).filter(t => {
    if (!search) return true;
    const s = search.toLowerCase();
    return t.subject.toLowerCase().includes(s) || t.description.toLowerCase().includes(s);
  });

  const counts = (tickets ?? []).reduce(
    (acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; },
    {} as Record<string, number>,
  );

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !reply.trim()) return;
    replyMutation.mutate({ id: selectedId, message: reply.trim() });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <LifeBuoy className="h-7 w-7 text-primary" />
              {t("support.my_tickets", "My support tickets")}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {t("support.subtitle", "Track requests you've sent to our support team and reply to messages.")}
            </p>
          </div>
          <Button onClick={() => setNewTicketOpen(true)} data-testid="button-new-ticket">
            <Plus className="h-4 w-4 mr-2" />
            {t("support.new_ticket", "New ticket")}
          </Button>
        </div>

        <NewTicketDialog
          open={newTicketOpen}
          onOpenChange={setNewTicketOpen}
          onCreated={(id) => setSelectedId(id)}
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {(["open", "in_progress", "resolved", "closed"] as const).map(s => {
            const cfg = statusStyles[s];
            const Icon = cfg.icon;
            return (
              <Card key={s} data-testid={`stat-${s}`}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{t(`support.status_${s}`, cfg.label)}</p>
                    <p className="text-2xl font-bold">{counts[s] || 0}</p>
                  </div>
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center ${cfg.className}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
          <Card className="h-fit">
            <CardHeader className="pb-3">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  placeholder={t("support.search_placeholder", "Search your tickets...")}
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-search-tickets"
                />
              </div>
            </CardHeader>
            <CardContent className="p-2">
              {ticketsLoading ? (
                <div className="space-y-2 p-2">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center space-y-3">
                  <LifeBuoy className="h-10 w-10 mx-auto text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    {tickets?.length === 0
                      ? t("support.empty_first", "You haven't opened any tickets yet.")
                      : t("support.empty_filter", "No tickets match your search.")}
                  </p>
                  {tickets?.length === 0 && (
                    <Button asChild variant="outline" size="sm">
                      <Link href="/about#contact">{t("support.new_ticket", "New ticket")}</Link>
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-1 max-h-[600px] overflow-y-auto">
                  {filtered.map(ticket => {
                    const cfg = statusStyles[ticket.status];
                    const isActive = selectedId === ticket.id;
                    const unreadHint = ticket.hasAdminReply && new Date(ticket.lastMessageAt).getTime() > new Date(ticket.createdAt).getTime();
                    return (
                      <button
                        key={ticket.id}
                        onClick={() => setSelectedId(ticket.id)}
                        className={`w-full text-left p-3 rounded-lg transition-colors ${
                          isActive ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/60 border border-transparent"
                        }`}
                        data-testid={`ticket-row-${ticket.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-sm truncate flex-1">{ticket.subject}</p>
                          {unreadHint && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" data-testid={`dot-new-${ticket.id}`} />}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {ticket.lastMessagePreview || ticket.description}
                        </p>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <Badge variant="outline" className={`${cfg.className} text-[10px] px-1.5 py-0 h-5`}>
                            {t(`support.status_${ticket.status}`, cfg.label)}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">·</span>
                          <span className="text-[10px] text-muted-foreground">{timeAgo(ticket.lastMessageAt, t)}</span>
                          {ticket.replyCount > 0 && (
                            <>
                              <span className="text-[10px] text-muted-foreground">·</span>
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <MessageSquare className="h-2.5 w-2.5" />{ticket.replyCount}
                              </span>
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            {!selectedId ? (
              <CardContent className="flex flex-col items-center justify-center text-center py-16 space-y-3 min-h-[400px]">
                <MessageSquare className="h-12 w-12 text-muted-foreground/40" />
                <p className="text-muted-foreground">
                  {t("support.select_ticket", "Select a ticket to view the conversation.")}
                </p>
              </CardContent>
            ) : detailLoading || !detail ? (
              <CardContent className="p-6 space-y-3">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </CardContent>
            ) : (
              <>
                <CardHeader className="border-b">
                  <Button variant="ghost" size="sm" className="lg:hidden self-start mb-2" onClick={() => setSelectedId(null)} data-testid="button-back-list">
                    <ArrowLeft className="h-4 w-4 mr-2" />{t("common.back", "Back")}
                  </Button>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <CardTitle className="text-lg" data-testid="text-ticket-subject">{detail.ticket.subject}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("support.opened", "Opened")} {timeAgo(detail.ticket.createdAt, t)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={statusStyles[detail.ticket.status].className} data-testid="badge-detail-status">
                        {t(`support.status_${detail.ticket.status}`, statusStyles[detail.ticket.status].label)}
                      </Badge>
                      <Badge variant="outline" className={priorityStyles[detail.ticket.priority]}>
                        {t(`support.priority_${detail.ticket.priority}`, detail.ticket.priority)}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="p-5 bg-muted/30 border-b">
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">{t("support.original_request", "Original request")}</p>
                    <p className="text-sm whitespace-pre-wrap">{detail.ticket.description}</p>
                  </div>

                  <div className="max-h-[400px] overflow-y-auto p-5 space-y-4">
                    {detail.messages.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        {t("support.no_replies", "No replies yet. We'll notify you when our team responds.")}
                      </p>
                    ) : (
                      detail.messages.map(msg => {
                        const fromMe = msg.userId === user?.id;
                        return (
                          <div key={msg.id} className={`flex ${fromMe ? "justify-end" : "justify-start"}`} data-testid={`msg-${msg.id}`}>
                            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                              fromMe
                                ? "bg-primary text-primary-foreground rounded-br-sm"
                                : "bg-muted rounded-bl-sm"
                            }`}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold">
                                  {fromMe
                                    ? t("support.you", "You")
                                    : msg.sender
                                      ? `${msg.sender.firstName} ${msg.sender.lastName}${msg.sender.role === "admin" ? " · " + t("support.support_team", "Support") : ""}`
                                      : t("support.support_team", "Support")}
                                </span>
                                <span className={`text-[10px] ${fromMe ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                                  {timeAgo(msg.createdAt, t)}
                                </span>
                              </div>
                              <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {detail.ticket.status !== "closed" ? (
                    <form onSubmit={handleSend} className="border-t p-4 space-y-2">
                      <Textarea
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        placeholder={t("support.reply_placeholder", "Type your reply...")}
                        rows={3}
                        className="resize-none"
                        data-testid="textarea-reply"
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                            handleSend(e as any);
                          }
                        }}
                      />
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">{t("support.send_hint", "Press ⌘/Ctrl + Enter to send")}</p>
                        <Button type="submit" disabled={!reply.trim() || replyMutation.isPending} data-testid="button-send-reply">
                          {replyMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <><Send className="h-4 w-4 mr-2" />{t("support.send", "Send")}</>
                          )}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="border-t p-4 text-center text-sm text-muted-foreground bg-muted/20">
                      {t("support.closed_notice", "This ticket is closed. Open a new one if you need further help.")}
                    </div>
                  )}
                </CardContent>
              </>
            )}
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
