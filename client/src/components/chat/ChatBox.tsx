import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  MessageSquare, Send, X, Minimize2, Maximize2, ArrowLeft, Search,
  Paperclip, Mic, Square, BellOff, Bell, Pin, PinOff, Check, CheckCheck,
  FileText, Headphones, Shield, Stethoscope, User as UserIcon, Plus,
} from "lucide-react";
import { RealtimeMessage } from "@shared/schema";
import { clsx } from "clsx";
import { format, formatDistanceToNowStrict, isToday, isYesterday, isThisWeek } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { showErrorModal } from "@/components/error-modal";

type RichConv = {
  id: string;
  participant1Id: string;
  participant2Id: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  createdAt: string | null;
  mutedBy: string[] | null;
  pinnedBy: string[] | null;
  other: { id: string; name: string; role: string; avatar: string | null };
  unread: number;
  pinned: boolean;
  muted: boolean;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";
}

function formatListTime(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Yesterday";
  if (isThisWeek(d)) return format(d, "EEE");
  return format(d, "MMM d");
}

function roleIcon(role: string) {
  if (role === "admin") return <Shield className="h-3 w-3" />;
  if (role === "provider") return <Stethoscope className="h-3 w-3" />;
  return <UserIcon className="h-3 w-3" />;
}

function roleLabel(role: string) {
  if (role === "admin") return "GoldenLife Support";
  if (role === "provider") return "Provider";
  return "Patient";
}

export function ChatBox() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeConversation, setActiveConversation] = useState<RichConv | null>(null);
  const [message, setMessage] = useState("");
  const [showNewChatOptions, setShowNewChatOptions] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [typingFrom, setTypingFrom] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const recordChunks = useRef<Blob[]>([]);
  const recordStartTime = useRef<number>(0);
  const typingTimer = useRef<any>(null);

  useEffect(() => {
    const handler = () => { setIsOpen(true); setIsMinimized(false); };
    window.addEventListener("open-chat", handler);
    return () => window.removeEventListener("open-chat", handler);
  }, []);

  // Conversations: only fetch once the panel has been opened. Always-on
  // unread-counts is a tiny call so we keep that hot for the badge.
  const { data: conversations, isLoading: loadingConvs } = useQuery<RichConv[]>({
    queryKey: ["/api/chat/conversations-rich"],
    enabled: !!user && isOpen,
  });

  const { data: messages } = useQuery<RealtimeMessage[]>({
    queryKey: ["/api/chat/messages", activeConversation?.id],
    enabled: !!activeConversation,
  });

  const { data: unread } = useQuery<{ counts: Record<string, number>; total: number }>({
    queryKey: ["/api/chat/unread-counts"],
    enabled: !!user,
    refetchInterval: 30000,
  });

  const otherIds = useMemo(
    () => (conversations || []).map((c) => c.other.id).join(","),
    [conversations]
  );
  const { data: presence } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/chat/online-status", otherIds],
    queryFn: async () => {
      if (!otherIds) return {};
      const r = await fetch(`/api/chat/online-status?ids=${encodeURIComponent(otherIds)}`, { credentials: "include" });
      if (!r.ok) return {};
      return r.json();
    },
    enabled: !!user && isOpen && !!otherIds,
    refetchInterval: 25000,
  });

  const [isSocketReady, setIsSocketReady] = useState(false);
  const activeConvIdRef = useRef<string | null>(null);
  useEffect(() => { activeConvIdRef.current = activeConversation?.id ?? null; }, [activeConversation?.id]);

  // One persistent socket per logged-in user. Auth happens server-side via the
  // httpOnly accessToken cookie sent on the upgrade request.
  useEffect(() => {
    if (!user) return;
    let closedByUs = false;
    let reconnectTimer: any = null;
    let backoff = 1000;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);
      socketRef.current = socket;
      setIsSocketReady(false);

      socket.onopen = () => { backoff = 1000; setIsSocketReady(true); };
      socket.onmessage = (event) => {
        let data: any;
        try { data = JSON.parse(event.data); } catch { return; }
        switch (data.type) {
          case "auth_ok":
            setIsSocketReady(true);
            break;
          case "message":
            queryClient.invalidateQueries({ queryKey: ["/api/chat/messages", data.data.conversationId] });
            queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations-rich"] });
            queryClient.invalidateQueries({ queryKey: ["/api/chat/unread-counts"] });
            break;
          case "typing":
            if (activeConvIdRef.current && data.conversationId === activeConvIdRef.current && data.userId !== user.id) {
              setTypingFrom(data.userId);
              setTimeout(() => setTypingFrom(null), 4000);
            }
            break;
          case "read":
            queryClient.invalidateQueries({ queryKey: ["/api/chat/messages", data.conversationId] });
            break;
          case "auto_reply":
            queryClient.invalidateQueries({ queryKey: ["/api/chat/messages", data.conversationId] });
            break;
          case "error":
            showErrorModal({ title: "Chat error", description: data.message || "Something went wrong", context: "chat.socketError" });
            break;
        }
      };
      socket.onclose = () => {
        socketRef.current = null;
        setIsSocketReady(false);
        if (!closedByUs) {
          reconnectTimer = setTimeout(connect, backoff);
          backoff = Math.min(backoff * 2, 15000);
        }
      };
      socket.onerror = () => { try { socket.close(); } catch {} };
    };

    connect();
    return () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { socketRef.current?.close(); } catch {}
      socketRef.current = null;
    };
  }, [user?.id]);

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (!activeConversation || !messages || !socketRef.current || socketRef.current.readyState !== 1) return;
    const myUnread = messages.filter((m) => m.senderId !== user!.id && !m.isRead).map((m) => m.id);
    if (myUnread.length === 0) return;
    socketRef.current.send(JSON.stringify({
      type: "read", conversationId: activeConversation.id, messageIds: myUnread,
    }));
    queryClient.invalidateQueries({ queryKey: ["/api/chat/unread-counts"] });
  }, [activeConversation?.id, messages, user]);

  const sendTyping = () => {
    if (!activeConversation || !socketRef.current || socketRef.current.readyState !== 1) return;
    if (typingTimer.current) return;
    socketRef.current.send(JSON.stringify({ type: "typing", conversationId: activeConversation.id }));
    typingTimer.current = setTimeout(() => { typingTimer.current = null; }, 2000);
  };

  const sendMessage = (extra?: Partial<{
    attachmentUrl: string; attachmentType: string; attachmentName: string;
    voiceNoteUrl: string; voiceDurationSec: number;
  }>) => {
    if ((!message.trim() && !extra) || !activeConversation) return;
    const sock = socketRef.current;
    if (!sock || sock.readyState !== WebSocket.OPEN) {
      showErrorModal({ title: "Reconnecting…", description: "Chat is not connected yet. Please try again in a moment.", context: "chat.notConnected" });
      return;
    }
    try {
      sock.send(JSON.stringify({
        type: "message",
        conversationId: activeConversation.id,
        content: message || (extra?.attachmentName ? `📎 ${extra.attachmentName}` : extra?.voiceNoteUrl ? "🎤 Voice note" : ""),
        ...extra,
      }));
      setMessage("");
    } catch (e: any) {
      toast({ title: "Send failed", description: e?.message || "Try again", variant: "destructive" });
    }
  };

  const muteMutation = useMutation({
    mutationFn: ({ id, muted }: { id: string; muted: boolean }) =>
      apiRequest("POST", `/api/chat/conversations/${id}/mute`, { muted }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations-rich"] }),
  });
  const pinMutation = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      apiRequest("POST", `/api/chat/conversations/${id}/pin`, { pinned }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations-rich"] }),
  });

  const handleFileUpload = async (file: File) => {
    if (file.size > 12 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 12 MB.", variant: "destructive" });
      return;
    }
    try {
      const r = await fetch("/api/chat/upload", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-Filename": encodeURIComponent(file.name),
        },
        body: file,
      });
      if (!r.ok) throw new Error((await r.json()).message || "Upload failed");
      const j = await r.json();
      sendMessage({ attachmentUrl: j.url, attachmentType: j.mimetype, attachmentName: j.name });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recordChunks.current = [];
      recordStartTime.current = Date.now();
      mr.ondataavailable = (e) => recordChunks.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordChunks.current, { type: "audio/webm" });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
        const seconds = Math.round((Date.now() - recordStartTime.current) / 1000);
        try {
          const r = await fetch("/api/chat/upload", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": file.type, "X-Filename": encodeURIComponent(file.name) },
            body: file,
          });
          const j = await r.json();
          sendMessage({ voiceNoteUrl: j.url, voiceDurationSec: seconds });
        } catch (e: any) {
          toast({ title: "Voice upload failed", description: e.message, variant: "destructive" });
        }
        setIsRecording(false);
      };
      mediaRef.current = mr;
      mr.start();
      setIsRecording(true);
    } catch (e: any) {
      toast({ title: "Microphone unavailable", description: e.message, variant: "destructive" });
    }
  };
  const stopRecording = () => mediaRef.current?.stop();

  // All hooks must run on every render — keep these BEFORE any early return.
  const totalUnread = unread?.total || 0;

  const sortedConvs: RichConv[] = useMemo(() => {
    return (conversations || []).slice().sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const aT = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bT = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bT - aT;
    });
  }, [conversations]);

  const filteredConvs = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return sortedConvs;
    return sortedConvs.filter((c) =>
      c.other.name.toLowerCase().includes(q) ||
      (c.lastMessage || "").toLowerCase().includes(q)
    );
  }, [sortedConvs, searchQ]);

  const grouped = useMemo(() => {
    const out: Array<{ day: string; items: RealtimeMessage[] }> = [];
    (messages || []).forEach((m: any) => {
      const d = m.createdAt ? new Date(m.createdAt) : new Date();
      const day = isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "EEEE, MMM d, yyyy");
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(m);
      else out.push({ day, items: [m] });
    });
    return out;
  }, [messages]);

  if (!user) return null;

  const otherOnline = activeConversation ? presence?.[activeConversation.other.id] : false;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col items-start gap-2">
      {!isOpen ? (
        <div className="relative">
          <Button
            className="rounded-full h-14 w-14 shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center"
            onClick={() => setIsOpen(true)}
            data-testid="button-chat-open"
          >
            <MessageSquare className="h-6 w-6" />
          </Button>
          {totalUnread > 0 && (
            <span
              className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full text-[10px] min-w-[20px] h-5 px-1 flex items-center justify-center font-bold"
              data-testid="badge-unread-total"
            >
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </div>
      ) : (
        <Card className={clsx(
          "w-[360px] shadow-2xl transition-all border-primary/10 overflow-hidden",
          isMinimized ? "h-14" : "h-[560px]"
        )}>
          <CardHeader className="p-3 border-b flex flex-row items-center justify-between space-y-0 bg-gradient-to-r from-primary to-primary/85 text-primary-foreground">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 min-w-0">
              {activeConversation ? (
                <>
                  <Button
                    size="icon" variant="ghost"
                    className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20 -ml-1"
                    onClick={() => setActiveConversation(null)}
                    data-testid="button-chat-back"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="relative">
                    <Avatar className="h-8 w-8 ring-2 ring-primary-foreground/30">
                      {activeConversation.other.avatar
                        ? <AvatarImage src={activeConversation.other.avatar} />
                        : null}
                      <AvatarFallback className="text-xs bg-primary-foreground/20 text-primary-foreground">
                        {initials(activeConversation.other.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className={clsx(
                      "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-primary",
                      otherOnline ? "bg-green-400" : "bg-gray-400"
                    )} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="truncate font-semibold leading-tight" data-testid="text-chat-name">
                      {activeConversation.other.name}
                    </span>
                    <span className="text-[10px] opacity-90 flex items-center gap-1 leading-tight">
                      {roleIcon(activeConversation.other.role)}
                      {otherOnline ? "Online now" : (typingFrom ? "Typing…" : roleLabel(activeConversation.other.role))}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4" />
                  <span>Messages</span>
                  {totalUnread > 0 && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{totalUnread}</Badge>
                  )}
                </>
              )}
            </CardTitle>
            <div className="flex gap-1 shrink-0">
              {activeConversation && (
                <>
                  <Button
                    size="icon" variant="ghost"
                    className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20"
                    title={activeConversation.pinned ? "Unpin" : "Pin"}
                    onClick={() => {
                      const pinned = !activeConversation.pinned;
                      pinMutation.mutate({ id: activeConversation.id, pinned });
                      setActiveConversation({ ...activeConversation, pinned });
                    }}
                    data-testid="button-toggle-pin"
                  >
                    {activeConversation.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="icon" variant="ghost"
                    className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20"
                    title={activeConversation.muted ? "Unmute" : "Mute"}
                    onClick={() => {
                      const muted = !activeConversation.muted;
                      muteMutation.mutate({ id: activeConversation.id, muted });
                      setActiveConversation({ ...activeConversation, muted });
                    }}
                    data-testid="button-toggle-mute"
                  >
                    {activeConversation.muted ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                  </Button>
                </>
              )}
              <Button
                size="icon" variant="ghost"
                className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20"
                onClick={() => setIsMinimized(!isMinimized)}
                data-testid="button-chat-minimize"
              >
                {isMinimized ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
              </Button>
              <Button
                size="icon" variant="ghost"
                className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20"
                onClick={() => { setIsOpen(false); setShowNewChatOptions(false); }}
                data-testid="button-chat-close"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>

          {!isMinimized && (
            <CardContent className="p-0 flex flex-col h-[calc(560px-57px)]">
              {!activeConversation ? (
                <>
                  <div className="p-3 border-b bg-muted/30 flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search conversations…"
                        className="h-8 pl-8 text-xs"
                        value={searchQ}
                        onChange={(e) => setSearchQ(e.target.value)}
                        data-testid="input-chat-search"
                      />
                    </div>
                    <Button
                      size="sm" variant="default" className="h-8 px-2 text-xs"
                      onClick={() => setShowNewChatOptions(!showNewChatOptions)}
                      data-testid="button-chat-new"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      New
                    </Button>
                  </div>

                  {showNewChatOptions && (
                    <div className="p-3 border-b bg-primary/5">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-2">
                        Start New Chat
                      </p>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left h-auto py-2 px-3 text-xs hover-elevate"
                        data-testid="button-contact-support"
                        onClick={async () => {
                          try {
                            const res: any = await apiRequest("POST", "/api/support/contact", {});
                            const json = await res.json();
                            const conv = json?.conversation ?? json;
                            queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations-rich"] });
                            // Build a minimal RichConv so we can open it immediately
                            setActiveConversation({
                              id: conv.id,
                              participant1Id: conv.participant1Id,
                              participant2Id: conv.participant2Id,
                              lastMessage: conv.lastMessage ?? null,
                              lastMessageAt: conv.lastMessageAt ?? null,
                              createdAt: conv.createdAt ?? null,
                              mutedBy: conv.mutedBy ?? [],
                              pinnedBy: conv.pinnedBy ?? [],
                              other: { id: json.adminId || "", name: "GoldenLife Support", role: "admin", avatar: null },
                              unread: 0, pinned: false, muted: false,
                            });
                          } catch (e: any) {
                            toast({ title: "Could not reach support", description: e?.message ?? "Try again later", variant: "destructive" });
                          }
                          setShowNewChatOptions(false);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                            <Headphones className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <div>
                            <div className="font-semibold">GoldenLife Support</div>
                            <div className="text-[10px] text-muted-foreground">Get help from our team</div>
                          </div>
                        </div>
                      </Button>
                    </div>
                  )}

                  <ScrollArea className="flex-1">
                    {loadingConvs ? (
                      <div className="p-4 text-center text-xs text-muted-foreground">Loading…</div>
                    ) : filteredConvs.length === 0 ? (
                      <div className="text-center py-12 px-4 text-muted-foreground">
                        <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-20" />
                        <p className="text-sm font-medium">
                          {searchQ ? "No matches" : "No conversations yet"}
                        </p>
                        <p className="text-[11px] mt-1">
                          {searchQ ? "Try a different search" : "Start a new chat to get help"}
                        </p>
                      </div>
                    ) : (
                      <div>
                        {filteredConvs.map((conv) => {
                          const isOnline = !!presence?.[conv.other.id];
                          return (
                            <button
                              key={conv.id}
                              className="w-full px-3 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left border-b last:border-b-0"
                              onClick={() => setActiveConversation(conv)}
                              data-testid={`button-conversation-${conv.id}`}
                            >
                              <div className="relative shrink-0">
                                <Avatar className="h-10 w-10">
                                  {conv.other.avatar ? <AvatarImage src={conv.other.avatar} /> : null}
                                  <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                                    {initials(conv.other.name)}
                                  </AvatarFallback>
                                </Avatar>
                                {isOnline && (
                                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-background" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1 min-w-0">
                                    {conv.pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                                    <span
                                      className="font-semibold text-sm truncate"
                                      data-testid={`text-conversation-name-${conv.id}`}
                                    >
                                      {conv.other.name}
                                    </span>
                                    {conv.muted && <BellOff className="h-3 w-3 text-muted-foreground shrink-0" />}
                                  </div>
                                  <span className="text-[10px] text-muted-foreground shrink-0">
                                    {formatListTime(conv.lastMessageAt || conv.createdAt)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-2 mt-0.5">
                                  <p
                                    className={clsx(
                                      "text-xs truncate",
                                      conv.unread > 0 ? "text-foreground font-medium" : "text-muted-foreground"
                                    )}
                                    data-testid={`text-conversation-preview-${conv.id}`}
                                  >
                                    {conv.lastMessage || (
                                      <span className="italic opacity-70">No messages yet</span>
                                    )}
                                  </p>
                                  {conv.unread > 0 && (
                                    <Badge
                                      className="text-[10px] h-5 min-w-[20px] px-1.5 bg-red-500 hover:bg-red-500 shrink-0"
                                      data-testid={`badge-unread-${conv.id}`}
                                    >
                                      {conv.unread > 99 ? "99+" : conv.unread}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
                                  {roleIcon(conv.other.role)}
                                  <span>
                                    {roleLabel(conv.other.role)}
                                    {conv.createdAt && (
                                      <> · since {format(new Date(conv.createdAt), "MMM d, yyyy")}</>
                                    )}
                                  </span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </>
              ) : (
                <>
                  <ScrollArea className="flex-1 px-3 py-3 bg-muted/20">
                    <div className="space-y-3">
                      {grouped.length === 0 && (
                        <div className="text-center py-8">
                          <Avatar className="h-14 w-14 mx-auto mb-3">
                            {activeConversation.other.avatar
                              ? <AvatarImage src={activeConversation.other.avatar} />
                              : null}
                            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                              {initials(activeConversation.other.name)}
                            </AvatarFallback>
                          </Avatar>
                          <p className="text-sm font-semibold">{activeConversation.other.name}</p>
                          <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                            {roleIcon(activeConversation.other.role)}
                            {roleLabel(activeConversation.other.role)}
                          </p>
                          {activeConversation.createdAt && (
                            <p className="text-[10px] text-muted-foreground mt-2">
                              Conversation started {formatDistanceToNowStrict(new Date(activeConversation.createdAt), { addSuffix: true })}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-3 italic">No messages yet — say hello 👋</p>
                        </div>
                      )}

                      {grouped.map((group) => (
                        <div key={group.day} className="space-y-2">
                          <div className="flex items-center gap-2 my-2">
                            <Separator className="flex-1" />
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                              {group.day}
                            </span>
                            <Separator className="flex-1" />
                          </div>

                          {group.items.map((msg: any, idx) => {
                            const mine = msg.senderId === user.id;
                            const prev = idx > 0 ? group.items[idx - 1] as any : null;
                            const sameAuthorBefore = prev && prev.senderId === msg.senderId
                              && (new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000);
                            return (
                              <div key={msg.id} className={clsx("flex gap-2", mine ? "justify-end" : "justify-start")}>
                                {!mine && (
                                  <div className="w-7 shrink-0">
                                    {!sameAuthorBefore && (
                                      <Avatar className="h-7 w-7">
                                        {activeConversation.other.avatar
                                          ? <AvatarImage src={activeConversation.other.avatar} />
                                          : null}
                                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                          {initials(activeConversation.other.name)}
                                        </AvatarFallback>
                                      </Avatar>
                                    )}
                                  </div>
                                )}
                                <div className={clsx("flex flex-col max-w-[75%]", mine ? "items-end" : "items-start")}>
                                  <div className={clsx(
                                    "rounded-2xl px-3 py-2 text-xs shadow-sm break-words",
                                    mine
                                      ? "bg-primary text-primary-foreground rounded-br-sm"
                                      : "bg-background border rounded-bl-sm"
                                  )}>
                                    {msg.attachmentUrl && msg.attachmentType?.startsWith("image/") ? (
                                      <a href={msg.attachmentUrl} target="_blank" rel="noopener" className="block">
                                        <img
                                          src={msg.attachmentUrl}
                                          alt={msg.attachmentName || "image"}
                                          className="max-w-[220px] rounded-lg mb-1"
                                        />
                                      </a>
                                    ) : msg.attachmentUrl ? (
                                      <a
                                        href={msg.attachmentUrl}
                                        target="_blank"
                                        rel="noopener"
                                        className={clsx(
                                          "flex items-center gap-1.5 underline",
                                          mine ? "text-primary-foreground" : "text-primary"
                                        )}
                                      >
                                        <FileText className="h-3.5 w-3.5" /> {msg.attachmentName || "file"}
                                      </a>
                                    ) : null}
                                    {msg.voiceNoteUrl && (
                                      <audio controls src={msg.voiceNoteUrl} className="max-w-[220px] mt-1" />
                                    )}
                                    {msg.content && <div className="whitespace-pre-wrap">{msg.content}</div>}
                                  </div>
                                  <span className="text-[9px] text-muted-foreground mt-0.5 px-1 flex items-center gap-1">
                                    {msg.createdAt ? format(new Date(msg.createdAt), "HH:mm") : ""}
                                    {mine && (
                                      msg.readAt
                                        ? <CheckCheck className="h-3 w-3 text-blue-500" />
                                        : msg.isRead ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />
                                    )}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}

                      {typingFrom && (
                        <div className="flex items-center gap-2 ml-9">
                          <div className="bg-background border rounded-2xl rounded-bl-sm px-3 py-2 inline-flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                        </div>
                      )}
                      <div ref={scrollRef} />
                    </div>
                  </ScrollArea>

                  <div className="p-2 border-t flex gap-1 bg-background items-center">
                    <input
                      ref={fileRef}
                      type="file"
                      hidden
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ""; }}
                    />
                    <Button
                      size="icon" variant="ghost"
                      className="h-9 w-9 shrink-0"
                      onClick={() => fileRef.current?.click()}
                      data-testid="button-attach"
                      title="Attach file"
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon" variant="ghost"
                      className="h-9 w-9 shrink-0"
                      onClick={isRecording ? stopRecording : startRecording}
                      data-testid="button-voice"
                      title={isRecording ? "Stop recording" : "Record voice note"}
                    >
                      {isRecording ? <Square className="h-4 w-4 text-red-500" /> : <Mic className="h-4 w-4" />}
                    </Button>
                    <Input
                      className="h-9 text-xs flex-1"
                      placeholder={isSocketReady ? "Type a message…" : "Connecting…"}
                      value={message}
                      onChange={(e) => { setMessage(e.target.value); sendTyping(); }}
                      onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                      data-testid="input-chat-message"
                    />
                    <Button
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => sendMessage()}
                      disabled={!isSocketReady || !message.trim()}
                      data-testid="button-send"
                      title="Send"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
