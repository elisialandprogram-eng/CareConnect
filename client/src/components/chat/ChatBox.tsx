import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare, Send, X, Minimize2, Maximize2, User as UserIcon,
  Paperclip, Mic, Square, BellOff, Bell, Pin, PinOff, Check, CheckCheck, Image as ImageIcon, FileText
} from "lucide-react";
import { RealtimeMessage, RealtimeConversation } from "@shared/schema";
import { clsx } from "clsx";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

type Conv = RealtimeConversation & { mutedBy?: string[] | null; pinnedBy?: string[] | null };

export function ChatBox() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    const handler = () => { setIsOpen(true); setIsMinimized(false); };
    window.addEventListener("open-chat", handler);
    return () => window.removeEventListener("open-chat", handler);
  }, []);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeConversation, setActiveConversation] = useState<Conv | null>(null);
  const [message, setMessage] = useState("");
  const [showNewChatOptions, setShowNewChatOptions] = useState(false);
  const [typingFrom, setTypingFrom] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const recordChunks = useRef<Blob[]>([]);
  const recordStartTime = useRef<number>(0);
  const typingTimer = useRef<any>(null);

  const { data: conversations } = useQuery<Conv[]>({
    queryKey: ["/api/chat/conversations"],
    enabled: !!user,
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

  // Connect once per user, keep socket open across UI minimise/close
  useEffect(() => {
    if (!user) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);
    socketRef.current = socket;

    socket.onopen = () => {
      const token = document.cookie.split("; ").find(r => r.startsWith("accessToken="))?.split("=")[1];
      socket.send(JSON.stringify({ type: "auth", token }));
    };

    socket.onmessage = (event) => {
      let data: any;
      try { data = JSON.parse(event.data); } catch { return; }
      switch (data.type) {
        case "message":
          queryClient.invalidateQueries({ queryKey: ["/api/chat/messages", data.data.conversationId] });
          queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
          queryClient.invalidateQueries({ queryKey: ["/api/chat/unread-counts"] });
          break;
        case "typing":
          if (activeConversation && data.conversationId === activeConversation.id && data.userId !== user.id) {
            setTypingFrom(data.userId);
            setTimeout(() => setTypingFrom(null), 4000);
          }
          break;
        case "read":
          queryClient.invalidateQueries({ queryKey: ["/api/chat/messages", data.conversationId] });
          break;
        case "auto_reply":
          // Provider out-of-office reply already comes through as a normal message
          queryClient.invalidateQueries({ queryKey: ["/api/chat/messages", data.conversationId] });
          break;
      }
    };

    socket.onclose = () => { socketRef.current = null; };
    return () => socket.close();
  }, [user, activeConversation?.id]);

  // Auto-scroll
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Mark messages read when conversation is open
  useEffect(() => {
    if (!activeConversation || !messages || !socketRef.current || socketRef.current.readyState !== 1) return;
    const myUnread = messages.filter(m => m.senderId !== user!.id && !m.isRead).map(m => m.id);
    if (myUnread.length === 0) return;
    socketRef.current.send(JSON.stringify({
      type: "read", conversationId: activeConversation.id, messageIds: myUnread,
    }));
    queryClient.invalidateQueries({ queryKey: ["/api/chat/unread-counts"] });
  }, [activeConversation?.id, messages, user]);

  const sendTyping = () => {
    if (!activeConversation || !socketRef.current || socketRef.current.readyState !== 1) return;
    if (typingTimer.current) return; // throttle
    socketRef.current.send(JSON.stringify({ type: "typing", conversationId: activeConversation.id }));
    typingTimer.current = setTimeout(() => { typingTimer.current = null; }, 2000);
  };

  const sendMessage = (extra?: Partial<{ attachmentUrl: string; attachmentType: string; attachmentName: string; voiceNoteUrl: string; voiceDurationSec: number }>) => {
    if ((!message.trim() && !extra) || !activeConversation || !socketRef.current) return;
    socketRef.current.send(JSON.stringify({
      type: "message",
      conversationId: activeConversation.id,
      content: message || (extra?.attachmentName ? `📎 ${extra.attachmentName}` : extra?.voiceNoteUrl ? "🎤 Voice note" : ""),
      ...extra,
    }));
    setMessage("");
  };

  const muteMutation = useMutation({
    mutationFn: ({ id, muted }: { id: string; muted: boolean }) =>
      apiRequest("POST", `/api/chat/conversations/${id}/mute`, { muted }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] }),
  });
  const pinMutation = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      apiRequest("POST", `/api/chat/conversations/${id}/pin`, { pinned }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] }),
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
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(recordChunks.current, { type: "audio/webm" });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
        const seconds = Math.round((Date.now() - recordStartTime.current) / 1000);
        try {
          const r = await fetch("/api/chat/upload", {
            method: "POST",
            credentials: "include",
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

  if (!user) return null;

  const totalUnread = unread?.total || 0;
  const sortedConvs = (conversations || []).slice().sort((a, b) => {
    const aPinned = a.pinnedBy?.includes(user.id) ? 1 : 0;
    const bPinned = b.pinnedBy?.includes(user.id) ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    const aT = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bT = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return bT - aT;
  });

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
            <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full text-[10px] min-w-[20px] h-5 px-1 flex items-center justify-center font-bold" data-testid="badge-unread-total">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </div>
      ) : (
        <Card className={clsx(
          "w-80 shadow-2xl transition-all border-primary/10",
          isMinimized ? "h-14" : "h-[500px]"
        )}>
          <CardHeader className="p-3 border-b flex flex-row items-center justify-between space-y-0 bg-primary text-primary-foreground rounded-t-lg">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              {activeConversation ? "Chat" : "Messages"}
              {totalUnread > 0 && !activeConversation && (
                <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{totalUnread}</Badge>
              )}
            </CardTitle>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20"
                onClick={() => setIsMinimized(!isMinimized)}>
                {isMinimized ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20"
                onClick={() => { setIsOpen(false); setShowNewChatOptions(false); }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          {!isMinimized && (
            <CardContent className="p-0 flex flex-col h-[calc(500px-57px)]">
              {!activeConversation ? (
                <ScrollArea className="flex-1 p-4">
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-xs text-muted-foreground">Recent Conversations</p>
                    <Button size="sm" variant="ghost" className="h-7 text-[10px]"
                      onClick={() => setShowNewChatOptions(!showNewChatOptions)}>
                      {showNewChatOptions ? "Cancel" : "New Chat"}
                    </Button>
                  </div>

                  {showNewChatOptions && (
                    <div className="space-y-2 mb-4 p-2 bg-muted/30 rounded-lg border border-primary/5">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground px-1">Start New Chat with:</p>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left h-auto py-2 px-3 text-xs hover-elevate"
                        data-testid="button-contact-support"
                        onClick={async () => {
                          try {
                            const res: any = await apiRequest("POST", "/api/support/contact", {});
                            const conv = (res?.conversation ?? res) as Conv;
                            setActiveConversation(conv);
                            queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
                          } catch (e: any) {
                            toast({ title: "Could not reach support", description: e?.message ?? "Try again later", variant: "destructive" });
                          }
                          setShowNewChatOptions(false);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                            <UserIcon className="h-3 w-3 text-primary" />
                          </div>
                          <span>GoldenLife Support</span>
                        </div>
                      </Button>
                    </div>
                  )}

                  <div className="space-y-2">
                    {sortedConvs.map((conv) => {
                      const count = unread?.counts[conv.id] || 0;
                      const isMuted = !!conv.mutedBy?.includes(user.id);
                      const isPinned = !!conv.pinnedBy?.includes(user.id);
                      return (
                        <div key={conv.id} className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            className="flex-1 justify-start text-left h-auto py-2 px-3 hover-elevate"
                            onClick={() => setActiveConversation(conv)}
                            data-testid={`button-conversation-${conv.id}`}
                          >
                            <div className="flex items-center gap-2 w-full">
                              {isPinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                              <div className="truncate flex-1">
                                <div className="font-medium text-xs flex items-center gap-1">
                                  Conversation
                                  {isMuted && <BellOff className="h-3 w-3 text-muted-foreground" />}
                                </div>
                                <div className="text-[10px] text-muted-foreground truncate">{conv.lastMessage || "No messages yet"}</div>
                              </div>
                              {count > 0 && (
                                <Badge className="text-[9px] h-4 px-1.5 bg-red-500" data-testid={`badge-unread-${conv.id}`}>
                                  {count}
                                </Badge>
                              )}
                            </div>
                          </Button>
                        </div>
                      );
                    })}
                    {sortedConvs.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-20" />
                        <p className="text-xs">No active conversations</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              ) : (
                <>
                  <div className="p-2 border-b bg-muted/50 flex items-center gap-2">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setActiveConversation(null)}>
                      <BackArrow className="h-3 w-3" />
                    </Button>
                    <span className="text-xs font-medium flex-1">Conversation</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6"
                      title={activeConversation.pinnedBy?.includes(user.id) ? "Unpin" : "Pin"}
                      onClick={() => {
                        const pinned = !activeConversation.pinnedBy?.includes(user.id);
                        pinMutation.mutate({ id: activeConversation.id, pinned });
                        setActiveConversation({
                          ...activeConversation,
                          pinnedBy: pinned ? [...(activeConversation.pinnedBy || []), user.id] : (activeConversation.pinnedBy || []).filter(x => x !== user.id),
                        });
                      }}
                      data-testid="button-toggle-pin"
                    >
                      {activeConversation.pinnedBy?.includes(user.id) ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6"
                      title={activeConversation.mutedBy?.includes(user.id) ? "Unmute" : "Mute"}
                      onClick={() => {
                        const muted = !activeConversation.mutedBy?.includes(user.id);
                        muteMutation.mutate({ id: activeConversation.id, muted });
                        setActiveConversation({
                          ...activeConversation,
                          mutedBy: muted ? [...(activeConversation.mutedBy || []), user.id] : (activeConversation.mutedBy || []).filter(x => x !== user.id),
                        });
                      }}
                      data-testid="button-toggle-mute"
                    >
                      {activeConversation.mutedBy?.includes(user.id) ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                    </Button>
                  </div>
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                      {messages?.map((msg: any) => {
                        const mine = msg.senderId === user.id;
                        return (
                          <div key={msg.id} className={clsx("flex flex-col max-w-[85%]", mine ? "ml-auto items-end" : "mr-auto items-start")}>
                            <div className={clsx(
                              "rounded-lg px-3 py-2 text-xs shadow-sm",
                              mine ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-muted rounded-tl-none"
                            )}>
                              {msg.attachmentUrl && msg.attachmentType?.startsWith("image/") ? (
                                <a href={msg.attachmentUrl} target="_blank" rel="noopener" className="block">
                                  <img src={msg.attachmentUrl} alt={msg.attachmentName || "image"} className="max-w-[200px] rounded mb-1" />
                                </a>
                              ) : msg.attachmentUrl ? (
                                <a href={msg.attachmentUrl} target="_blank" rel="noopener" className="flex items-center gap-1 underline">
                                  <FileText className="h-3 w-3" /> {msg.attachmentName || "file"}
                                </a>
                              ) : null}
                              {msg.voiceNoteUrl && (
                                <audio controls src={msg.voiceNoteUrl} className="max-w-[200px] mt-1" />
                              )}
                              {msg.content && <div>{msg.content}</div>}
                            </div>
                            <span className="text-[9px] text-muted-foreground mt-1 px-1 flex items-center gap-1">
                              {msg.createdAt ? format(new Date(msg.createdAt), "HH:mm") : ""}
                              {mine && (
                                msg.readAt
                                  ? <CheckCheck className="h-3 w-3 text-blue-500" />
                                  : msg.isRead ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />
                              )}
                            </span>
                          </div>
                        );
                      })}
                      {typingFrom && (
                        <div className="text-[10px] text-muted-foreground italic" data-testid="text-typing">typing…</div>
                      )}
                      <div ref={scrollRef} />
                    </div>
                  </ScrollArea>
                  <div className="p-2 border-t flex gap-1 bg-background items-center">
                    <input ref={fileRef} type="file" hidden
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ""; }}
                    />
                    <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => fileRef.current?.click()} data-testid="button-attach">
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0"
                      onClick={isRecording ? stopRecording : startRecording}
                      data-testid="button-voice"
                    >
                      {isRecording ? <Square className="h-4 w-4 text-red-500" /> : <Mic className="h-4 w-4" />}
                    </Button>
                    <Input
                      className="h-9 text-xs flex-1"
                      placeholder="Type a message..."
                      value={message}
                      onChange={(e) => { setMessage(e.target.value); sendTyping(); }}
                      onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                      data-testid="input-chat-message"
                    />
                    <Button size="icon" className="h-9 w-9 shrink-0" onClick={() => sendMessage()} data-testid="button-chat-send">
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

function BackArrow({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
  );
}
