import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/header";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import {
  Send, MessageCircle, Headphones, Loader2, Search, Paperclip,
  Video, Lock, Calendar, Clock, CheckCheck, Check,
  User as UserIcon, Stethoscope, Shield, Home, Building2,
  FileText, BellOff, Pin, Pencil, X as XIcon,
} from "lucide-react";
import { usePageTitle } from "@/hooks/use-page-title";
import { QK } from "@/lib/query-keys";
import { clsx } from "clsx";
import { isToday, isYesterday } from "date-fns";
import { formatDate, formatTime } from "@/lib/datetime";

interface AppointmentContext {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  status: string;
  visitType: string;
  serviceName: string | null;
}

interface RichConversation {
  id: string;
  participant1Id: string;
  participant2Id: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  createdAt: string | null;
  contextType: string;
  appointmentId: string | null;
  lockedAt: string | null;
  unread: number;
  pinned: boolean;
  muted: boolean;
  other: { id: string; name: string; role: string; avatar: string | null };
  appointment: AppointmentContext | null;
}

interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  isRead: boolean | null;
  readAt: string | null;
  attachmentUrl: string | null;
  attachmentType: string | null;
  attachmentName: string | null;
  voiceNoteUrl: string | null;
  voiceDurationSec: number | null;
  isEdited: boolean | null;
  editedAt: string | null;
  createdAt: string | null;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("") || "?";
}

function formatListTime(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isToday(d)) return formatTime(d, { hour: "2-digit", minute: "2-digit", hour12: false });
  if (isYesterday(d)) return "Yesterday";
  return formatDate(d, { month: "short", day: "numeric" });
}

function statusColor(s: string) {
  if (s === "completed") return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
  if (s === "in_progress") return "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300";
  if (["approved", "confirmed"].includes(s)) return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
  if (s.startsWith("cancelled") || s === "rejected") return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
  if (["no_show", "expired"].includes(s)) return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
  return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
}

function VisitIcon({ vt }: { vt: string }) {
  if (vt === "online") return <Video className="h-3 w-3" />;
  if (vt === "home") return <Home className="h-3 w-3" />;
  return <Building2 className="h-3 w-3" />;
}

function RoleIcon({ role }: { role: string }) {
  if (role === "admin") return <Shield className="h-3 w-3" />;
  if (role === "provider") return <Stethoscope className="h-3 w-3" />;
  return <UserIcon className="h-3 w-3" />;
}

function roleLabel(role: string) {
  if (role === "admin") return "Support";
  if (role === "provider") return "Provider";
  return "Patient";
}

function convIsLocked(conv: RichConversation): boolean {
  if (!conv.lockedAt) return false;
  return new Date(conv.lockedAt).getTime() <= Date.now();
}

function canJoinVideo(appt: AppointmentContext | null): boolean {
  if (!appt || appt.visitType !== "online") return false;
  return ["approved", "confirmed", "in_progress"].includes(appt.status);
}

export default function Messages() {
  usePageTitle("Messages");
  const { user } = useAuth();
  const { toast } = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [isSocketReady, setIsSocketReady] = useState(false);
  const [typingActive, setTypingActive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const socketRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeConvRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { activeConvRef.current = selectedId; }, [selectedId]);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: conversations = [], isLoading: loadingConvs } = useQuery<RichConversation[]>({
    queryKey: QK.conversations(),
    staleTime: 60_000,
  });

  const { data: messages = [], isLoading: loadingMsgs } = useQuery<ChatMessage[]>({
    queryKey: QK.chatMessages(selectedId),
    enabled: !!selectedId,
    staleTime: 30_000,
  });

  const { data: presence = {} } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/chat/online-status", conversations.map(c => c.other.id).sort().join(",")],
    queryFn: async () => {
      const ids = conversations.map(c => c.other.id).join(",");
      if (!ids) return {};
      const r = await fetch(`/api/chat/online-status?ids=${encodeURIComponent(ids)}`, { credentials: "include" });
      return r.ok ? r.json() : {};
    },
    enabled: !!user && conversations.length > 0,
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  // ── WebSocket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    let closed = false;
    let reconnect: ReturnType<typeof setTimeout> | null = null;
    let backoff = 1000;

    const connect = () => {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const sock = new WebSocket(`${proto}//${window.location.host}/ws/chat`);
      socketRef.current = sock;

      sock.onopen = () => { backoff = 1000; setIsSocketReady(true); };

      sock.onmessage = (event) => {
        let data: any;
        try { data = JSON.parse(event.data); } catch { return; }
        switch (data.type) {
          case "auth_ok":
            setIsSocketReady(true);
            break;
          case "message": {
            const convId = data.data?.conversationId;
            queryClient.invalidateQueries({ queryKey: QK.chatMessages(convId) });
            queryClient.invalidateQueries({ queryKey: QK.conversations() });
            queryClient.invalidateQueries({ queryKey: ["/api/chat/unread-counts"] });
            break;
          }
          case "typing":
            if (activeConvRef.current === data.conversationId && data.userId !== user.id) {
              setTypingActive(true);
              setTimeout(() => setTypingActive(false), 4000);
            }
            break;
          case "read":
            queryClient.invalidateQueries({ queryKey: QK.chatMessages(data.conversationId) });
            break;
          case "message_edited": {
            const editedConvId = data.data?.conversationId;
            queryClient.invalidateQueries({ queryKey: QK.chatMessages(editedConvId) });
            queryClient.invalidateQueries({ queryKey: QK.conversations() });
            break;
          }
          case "error":
            if (data.code === "CONVERSATION_LOCKED") {
              toast({ title: "Conversation closed", description: data.message, variant: "destructive" });
              queryClient.invalidateQueries({ queryKey: QK.conversations() });
            }
            break;
        }
      };

      sock.onclose = () => {
        socketRef.current = null;
        setIsSocketReady(false);
        if (!closed) {
          reconnect = setTimeout(connect, backoff);
          backoff = Math.min(backoff * 2, 16_000);
        }
      };

      sock.onerror = () => { try { sock.close(); } catch {} };
    };

    connect();
    return () => {
      closed = true;
      if (reconnect) clearTimeout(reconnect);
      try { socketRef.current?.close(); } catch {}
      socketRef.current = null;
    };
  }, [user?.id]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (selectedId && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, selectedId]);

  // Mark as read
  useEffect(() => {
    if (!selectedId || !messages.length) return;
    const sock = socketRef.current;
    if (!sock || sock.readyState !== WebSocket.OPEN) return;
    if (!messages.some(m => m.senderId !== user?.id && !m.isRead)) return;
    sock.send(JSON.stringify({ type: "read", conversationId: selectedId }));
    queryClient.invalidateQueries({ queryKey: ["/api/chat/unread-counts"] });
  }, [selectedId, messages]);

  const sendTyping = useCallback(() => {
    if (!selectedId || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    if (typingTimer.current) return;
    socketRef.current.send(JSON.stringify({ type: "typing", conversationId: selectedId, isTyping: true }));
    typingTimer.current = setTimeout(() => { typingTimer.current = null; }, 2000);
  }, [selectedId]);

  // ── Send via WebSocket ─────────────────────────────────────────────────────
  const sendMessage = useCallback((extra?: {
    attachmentUrl?: string; attachmentType?: string; attachmentName?: string; voiceNoteUrl?: string;
  }) => {
    if ((!message.trim() && !extra) || !selectedId) return;
    const sock = socketRef.current;
    if (!sock || sock.readyState !== WebSocket.OPEN) {
      toast({ title: "Reconnecting…", description: "Try again in a moment.", variant: "destructive" });
      return;
    }
    sock.send(JSON.stringify({
      type: "message",
      conversationId: selectedId,
      content: message.trim() || (extra?.attachmentName ? `📎 ${extra.attachmentName}` : ""),
      ...extra,
    }));
    setMessage("");
  }, [message, selectedId, toast]);

  const handleFile = async (file: File) => {
    if (file.size > 12 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 12 MB.", variant: "destructive" });
      return;
    }
    try {
      const r = await fetch("/api/chat/upload", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": file.type || "application/octet-stream", "X-Filename": encodeURIComponent(file.name) },
        body: file,
      });
      if (!r.ok) throw new Error((await r.json()).message || "Upload failed");
      const j = await r.json();
      sendMessage({ attachmentUrl: j.url, attachmentType: j.mimetype, attachmentName: j.name });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
  };

  const editMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      apiRequest("PATCH", `/api/chat/messages/${id}`, { content }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.chatMessages(selectedId) });
      setEditingId(null);
    },
    onError: () => toast({ title: "Edit failed", description: "Please try again.", variant: "destructive" }),
  });

  const contactSupport = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/support/contact", {});
      return res.json();
    },
    onSuccess: (data: any) => {
      const convId = data?.conversation?.id ?? data?.id;
      queryClient.invalidateQueries({ queryKey: QK.conversations() });
      if (convId) setSelectedId(convId);
    },
    onError: () => toast({ title: "Could not reach support", description: "Please try again.", variant: "destructive" }),
  });

  // ── Derived data ───────────────────────────────────────────────────────────
  const filteredConvs = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return [...conversations]
      .filter(c =>
        !q ||
        c.other.name.toLowerCase().includes(q) ||
        (c.lastMessage ?? "").toLowerCase().includes(q) ||
        (c.appointment?.serviceName ?? "").toLowerCase().includes(q)
      )
      .sort((a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime()
      );
  }, [conversations, searchQ]);

  const selected = conversations.find(c => c.id === selectedId) ?? null;
  const locked = selected ? convIsLocked(selected) : false;
  const otherOnline = selected ? (presence[selected.other.id] ?? false) : false;

  const grouped = useMemo(() => {
    const out: Array<{ day: string; items: ChatMessage[] }> = [];
    messages.forEach(m => {
      const d = m.createdAt ? new Date(m.createdAt) : new Date();
      const day = isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : formatDate(d, { weekday: "long", month: "short", day: "numeric", year: "numeric" });
      const last = out[out.length - 1];
      if (last?.day === day) last.items.push(m);
      else out.push({ day, items: [m] });
    });
    return out;
  }, [messages]);

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-4 max-w-7xl">
        <PageBreadcrumbs items={[{ label: "Home", href: "/" }, { label: "Messages" }]} fallback="/" />

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-3 h-[calc(100vh-10rem)]">

          {/* ── LEFT PANEL: Conversation list ── */}
          <Card className="flex flex-col overflow-hidden">
            <CardHeader className="pb-2 pt-3 px-3 border-b shrink-0 space-y-0">
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5 font-semibold text-sm">
                  <MessageCircle className="h-4 w-4 text-primary" />
                  Messages
                </span>
                <Button
                  size="sm" variant="outline" className="h-7 text-xs gap-1 px-2"
                  onClick={() => contactSupport.mutate()}
                  disabled={contactSupport.isPending}
                  data-testid="button-contact-support"
                >
                  {contactSupport.isPending
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Headphones className="h-3 w-3" />}
                  Support
                </Button>
              </div>
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search conversations…"
                  className="h-8 pl-8 text-xs"
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  data-testid="input-search-conversations"
                />
              </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-hidden p-0">
              <ScrollArea className="h-full">
                {loadingConvs ? (
                  <div className="flex items-center justify-center py-10 text-muted-foreground gap-2 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </div>
                ) : filteredConvs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center text-muted-foreground">
                    <MessageCircle className="h-8 w-8 opacity-15 mb-2" />
                    <p className="text-sm font-medium">No conversations yet</p>
                    <p className="text-xs mt-1">Tap "Support" to start a chat</p>
                  </div>
                ) : filteredConvs.map(conv => {
                  const isActive = selectedId === conv.id;
                  const lk = convIsLocked(conv);
                  const online = presence[conv.other.id] ?? false;
                  return (
                    <button
                      key={conv.id}
                      onClick={() => setSelectedId(conv.id)}
                      className={clsx(
                        "w-full text-left px-3 py-2.5 border-b transition-colors hover:bg-muted/40",
                        isActive ? "bg-primary/5 border-l-2 border-l-primary" : "border-l-2 border-l-transparent"
                      )}
                      data-testid={`button-conversation-${conv.id}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="relative shrink-0 mt-0.5">
                          <Avatar className="h-9 w-9">
                            {conv.other.avatar && <AvatarImage src={conv.other.avatar} />}
                            <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                              {initials(conv.other.name)}
                            </AvatarFallback>
                          </Avatar>
                          {online && (
                            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-background" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <div className="flex items-center gap-1 min-w-0">
                              {conv.pinned && <Pin className="h-2.5 w-2.5 text-primary shrink-0" />}
                              {conv.muted && <BellOff className="h-2.5 w-2.5 text-muted-foreground/60 shrink-0" />}
                              <span className="font-semibold text-sm truncate" data-testid={`text-name-${conv.id}`}>
                                {conv.other.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {conv.unread > 0 && (
                                <Badge className="h-4 min-w-[16px] px-1 text-[10px] rounded-full bg-primary" data-testid={`badge-unread-${conv.id}`}>
                                  {conv.unread > 99 ? "99+" : conv.unread}
                                </Badge>
                              )}
                              <span className="text-[10px] text-muted-foreground">{formatListTime(conv.lastMessageAt)}</span>
                            </div>
                          </div>

                          {conv.appointment && (
                            <div className="flex items-center gap-1 mb-1 flex-wrap">
                              <span className={clsx(
                                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none",
                                statusColor(conv.appointment.status)
                              )}>
                                <VisitIcon vt={conv.appointment.visitType} />
                                {conv.appointment.status.replace(/_/g, " ")}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {formatDate(conv.appointment.date + "T12:00:00", { month: "short", day: "numeric" })}
                              </span>
                              {conv.appointment.serviceName && (
                                <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                                  · {conv.appointment.serviceName}
                                </span>
                              )}
                            </div>
                          )}

                          <p className={clsx("text-xs truncate", conv.unread > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
                            {lk
                              ? <span className="flex items-center gap-1 opacity-70"><Lock className="h-2.5 w-2.5 shrink-0" />Closed</span>
                              : conv.lastMessage
                                ? conv.lastMessage
                                : <span className="italic opacity-60">No messages yet</span>
                            }
                          </p>

                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                            <RoleIcon role={conv.other.role} />
                            {roleLabel(conv.other.role)}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* ── RIGHT PANEL: Chat window ── */}
          <Card className="flex flex-col overflow-hidden">
            {!selected ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground text-center p-8">
                <MessageCircle className="h-14 w-14 opacity-10" />
                <div>
                  <p className="font-semibold text-base">Select a conversation</p>
                  <p className="text-sm mt-1">Choose one from the list to open a chat</p>
                </div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="border-b px-4 py-2.5 shrink-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <Avatar className="h-9 w-9">
                          {selected.other.avatar && <AvatarImage src={selected.other.avatar} />}
                          <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                            {initials(selected.other.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className={clsx(
                          "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background",
                          otherOnline ? "bg-green-500" : "bg-muted-foreground/25"
                        )} />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm truncate" data-testid="text-active-conv-name">
                            {selected.other.name}
                          </p>
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                            <RoleIcon role={selected.other.role} />
                            {roleLabel(selected.other.role)}
                          </span>
                        </div>

                        {selected.appointment ? (
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className={clsx(
                              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none",
                              statusColor(selected.appointment.status)
                            )}>
                              <VisitIcon vt={selected.appointment.visitType} />
                              {selected.appointment.status.replace(/_/g, " ")}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Calendar className="h-2.5 w-2.5" />
                              {formatDate(selected.appointment.date + "T12:00:00", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Clock className="h-2.5 w-2.5" />
                              {selected.appointment.startTime}
                            </span>
                            {selected.appointment.serviceName && (
                              <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                                · {selected.appointment.serviceName}
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {otherOnline ? "Online now" : "Offline"}
                          </p>
                        )}
                      </div>
                    </div>

                    {selected.appointment && canJoinVideo(selected.appointment) && (
                      <Button
                        size="sm"
                        className="shrink-0 gap-1.5 h-8 text-xs"
                        onClick={() => window.open(`/appointments/${selected.appointment!.id}`, "_blank")}
                        data-testid="button-join-video-call"
                      >
                        <Video className="h-3.5 w-3.5" />
                        Join Call
                      </Button>
                    )}
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 bg-muted/10" ref={scrollRef}>
                  {loadingMsgs ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : grouped.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-8 text-center text-muted-foreground">
                      <Avatar className="h-14 w-14 mb-3">
                        {selected.other.avatar && <AvatarImage src={selected.other.avatar} />}
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                          {initials(selected.other.name)}
                        </AvatarFallback>
                      </Avatar>
                      <p className="font-semibold text-sm text-foreground">{selected.other.name}</p>
                      <p className="text-xs mt-1 flex items-center gap-1">
                        <RoleIcon role={selected.other.role} />{roleLabel(selected.other.role)}
                      </p>

                      {selected.appointment && (
                        <div className="mt-4 p-3 bg-background rounded-xl border text-left max-w-xs w-full">
                          <p className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-primary" />
                            Care Appointment
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(selected.appointment.date + "T12:00:00", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {selected.appointment.startTime}
                            {selected.appointment.endTime ? ` – ${selected.appointment.endTime}` : ""}
                          </p>
                          {selected.appointment.serviceName && (
                            <p className="text-xs text-muted-foreground mt-0.5">{selected.appointment.serviceName}</p>
                          )}
                          <span className={clsx(
                            "inline-flex items-center gap-1 mt-2 px-1.5 py-0.5 rounded text-[10px] font-medium",
                            statusColor(selected.appointment.status)
                          )}>
                            <VisitIcon vt={selected.appointment.visitType} />
                            {selected.appointment.status.replace(/_/g, " ")}
                          </span>
                        </div>
                      )}
                      <p className="text-xs mt-4 italic opacity-60">No messages yet — start the conversation</p>
                    </div>
                  ) : (
                    grouped.map(group => (
                      <div key={group.day} className="space-y-1">
                        <div className="flex items-center gap-2 my-4">
                          <Separator className="flex-1" />
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold whitespace-nowrap">
                            {group.day}
                          </span>
                          <Separator className="flex-1" />
                        </div>

                        {group.items.map((msg, idx) => {
                          const mine = msg.senderId === user.id;
                          const prev = idx > 0 ? group.items[idx - 1] : null;
                          const sameAuthor = !!(
                            prev &&
                            prev.senderId === msg.senderId &&
                            msg.createdAt && prev.createdAt &&
                            new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000
                          );

                          return (
                            <div
                              key={msg.id}
                              className={clsx("flex gap-2 items-end", mine ? "justify-end" : "justify-start")}
                              data-testid={`message-item-${msg.id}`}
                            >
                              {!mine && (
                                <div className="w-7 shrink-0">
                                  {!sameAuthor && (
                                    <Avatar className="h-7 w-7">
                                      {selected.other.avatar && <AvatarImage src={selected.other.avatar} />}
                                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                        {initials(selected.other.name)}
                                      </AvatarFallback>
                                    </Avatar>
                                  )}
                                </div>
                              )}

                              <div className={clsx("flex flex-col max-w-[68%] group/msg", mine ? "items-end" : "items-start")}>
                                {editingId === msg.id ? (
                                  <div className="flex gap-1 w-full max-w-xs">
                                    <Input
                                      autoFocus
                                      className="h-8 text-sm flex-1"
                                      value={editContent}
                                      onChange={e => setEditContent(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (editContent.trim()) editMutation.mutate({ id: msg.id, content: editContent }); }
                                        if (e.key === "Escape") setEditingId(null);
                                      }}
                                      data-testid={`input-edit-message-${msg.id}`}
                                    />
                                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => { if (editContent.trim()) editMutation.mutate({ id: msg.id, content: editContent }); }} disabled={editMutation.isPending} data-testid={`button-save-edit-${msg.id}`}><Send className="h-3.5 w-3.5" /></Button>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setEditingId(null)} data-testid={`button-cancel-edit-${msg.id}`}><XIcon className="h-3.5 w-3.5" /></Button>
                                  </div>
                                ) : (
                                  <div className="relative">
                                    {mine && !locked && !msg.attachmentUrl && !msg.voiceNoteUrl && (
                                      <Button
                                        size="icon" variant="ghost"
                                        className="absolute -left-9 top-1 h-7 w-7 opacity-0 group-hover/msg:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                        onClick={() => { setEditingId(msg.id); setEditContent(msg.content || ""); }}
                                        data-testid={`button-edit-message-${msg.id}`}
                                        title="Edit message"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                    <div className={clsx(
                                      "rounded-2xl px-3 py-2 text-sm shadow-sm break-words",
                                      mine
                                        ? "bg-primary text-primary-foreground rounded-br-sm"
                                        : "bg-background border rounded-bl-sm"
                                    )}>
                                      {msg.attachmentUrl && msg.attachmentType?.startsWith("image/") && (
                                        <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className="block mb-1">
                                          <img src={msg.attachmentUrl} alt={msg.attachmentName || "image"} loading="lazy" className="max-w-[220px] rounded-lg" />
                                        </a>
                                      )}
                                      {msg.attachmentUrl && !msg.attachmentType?.startsWith("image/") && (
                                        <a
                                          href={msg.attachmentUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className={clsx("flex items-center gap-1.5 underline underline-offset-2 mb-1 text-xs",
                                            mine ? "text-primary-foreground/80" : "text-primary")}
                                        >
                                          <FileText className="h-3.5 w-3.5 shrink-0" />
                                          {msg.attachmentName || "File"}
                                        </a>
                                      )}
                                      {msg.voiceNoteUrl && (
                                        <audio controls src={msg.voiceNoteUrl} className="max-w-[220px] h-8" />
                                      )}
                                      {msg.content && (
                                        <span className="whitespace-pre-wrap leading-relaxed">{msg.content}</span>
                                      )}
                                    </div>
                                  </div>
                                )}
                                <span className="text-[9px] text-muted-foreground mt-0.5 px-1 flex items-center gap-1">
                                  {msg.createdAt ? formatTime(msg.createdAt, { hour: "2-digit", minute: "2-digit", hour12: false }) : ""}
                                  {msg.isEdited && <><Pencil className="h-2.5 w-2.5" /><span>edited</span></>}
                                  {mine && (
                                    msg.readAt
                                      ? <CheckCheck className="h-3 w-3 text-blue-500" />
                                      : msg.isRead
                                        ? <CheckCheck className="h-3 w-3" />
                                        : <Check className="h-3 w-3 opacity-50" />
                                  )}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}

                  {/* Typing indicator */}
                  {typingActive && (
                    <div className="flex items-center gap-2 mt-2 ml-9">
                      <div className="bg-background border rounded-2xl rounded-bl-sm px-3 py-2 inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Input / Locked banner */}
                {locked ? (
                  <div className="border-t px-4 py-3 flex items-start gap-2 bg-muted/20 shrink-0">
                    <Lock className="h-4 w-4 shrink-0 text-muted-foreground/60 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Conversation closed</p>
                      <p className="text-[11px] text-muted-foreground">The care episode has ended. No further messages can be sent.</p>
                    </div>
                  </div>
                ) : (
                  <div className="border-t px-2 py-2 flex items-center gap-1 bg-background shrink-0">
                    <input
                      ref={fileRef}
                      type="file"
                      hidden
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) handleFile(f);
                        e.target.value = "";
                      }}
                    />
                    <Button
                      size="icon" variant="ghost"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => fileRef.current?.click()}
                      title="Attach file"
                      data-testid="button-attach-file"
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Input
                      className="h-9 text-sm flex-1"
                      placeholder={isSocketReady ? "Type a message…" : "Connecting…"}
                      value={message}
                      onChange={e => { setMessage(e.target.value); sendTyping(); }}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      data-testid="input-message-text"
                    />
                    <Button
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => sendMessage()}
                      disabled={!isSocketReady || !message.trim()}
                      data-testid="button-send-message"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
