import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { showErrorModal } from "@/components/error-modal";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/header";
import { Send, MessageCircle, Headphones, Loader2 } from "lucide-react";

interface RichConversation {
  id: string;
  participant1Id: string;
  participant2Id: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  createdAt: string | null;
  unread: number;
  pinned: boolean;
  muted: boolean;
  other: {
    id: string;
    name: string;
    role: string;
    avatar: string | null;
  } | null;
}

interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  readAt?: string | null;
}

export default function Messages() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [], isLoading: loadingConvs } = useQuery<RichConversation[]>({
    queryKey: ["/api/chat/conversations-rich"],
    refetchInterval: 5000,
  });

  const { data: messages = [], isLoading: loadingMsgs } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat/messages", selectedId],
    enabled: !!selectedId,
    refetchInterval: selectedId ? 3000 : false,
  });

  useEffect(() => {
    if (selectedId && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, selectedId]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId || !text.trim()) return;
      const res = await apiRequest("POST", "/api/chat/messages", {
        conversationId: selectedId,
        content: text.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: ["/api/chat/messages", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations-rich"] });
    },
    onError: (e: any) => {
      showErrorModal({
        title: "Could not send message",
        description: e?.message || "Please try again.",
        context: "messages.send",
      });
    },
  });

  const contactSupportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/support/contact", {});
      return res.json();
    },
    onSuccess: (data: any) => {
      const convId = data?.conversation?.id;
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations-rich"] });
      if (convId) setSelectedId(convId);
    },
    onError: (e: any) => {
      showErrorModal({
        title: "Could not reach support",
        description: e?.message || "Please try again later.",
        context: "messages.contactSupport",
      });
    },
  });

  const sortedConvs = useMemo(() => {
    return [...conversations].sort((a, b) => {
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bt - at;
    });
  }, [conversations]);

  const selected = sortedConvs.find(c => c.id === selectedId);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-9rem)]">
          <Card className="flex flex-col overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  Conversations
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => contactSupportMutation.mutate()}
                  disabled={contactSupportMutation.isPending}
                  data-testid="button-contact-support"
                >
                  {contactSupportMutation.isPending ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Headphones className="h-3 w-3 mr-1" />
                  )}
                  Support
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              <ScrollArea className="h-full">
                {loadingConvs ? (
                  <div className="p-4 flex items-center justify-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading...
                  </div>
                ) : sortedConvs.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No conversations yet. Tap "Support" to chat with us.
                  </div>
                ) : (
                  sortedConvs.map(conv => {
                    const isActive = selectedId === conv.id;
                    const name = conv.other?.name || "Conversation";
                    return (
                      <button
                        key={conv.id}
                        onClick={() => setSelectedId(conv.id)}
                        className={`w-full text-left px-4 py-3 border-b hover:bg-accent transition-colors ${isActive ? "bg-accent" : ""}`}
                        data-testid={`button-conversation-${conv.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={conv.other?.avatar || undefined} />
                            <AvatarFallback>{name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium truncate" data-testid={`text-conv-name-${conv.id}`}>{name}</p>
                              {conv.unread > 0 && (
                                <Badge variant="default" className="h-5 px-2">{conv.unread}</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {conv.lastMessage || "No messages yet"}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="flex flex-col overflow-hidden">
            {selected ? (
              <>
                <CardHeader className="border-b py-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={selected.other?.avatar || undefined} />
                      <AvatarFallback>{(selected.other?.name || "?").charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-base" data-testid="text-active-name">{selected.other?.name || "Chat"}</CardTitle>
                      <p className="text-xs text-muted-foreground capitalize">{selected.other?.role}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden p-0">
                  <div ref={scrollRef} className="h-full overflow-y-auto p-4 space-y-3">
                    {loadingMsgs ? (
                      <div className="text-center text-muted-foreground py-12">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center text-muted-foreground py-12">
                        Send the first message to start the conversation.
                      </div>
                    ) : (
                      messages.map(msg => {
                        const mine = msg.senderId === user?.id;
                        return (
                          <div key={msg.id} className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={`message-${msg.id}`}>
                            <div className={`max-w-[70%] px-3 py-2 rounded-lg ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                              <p className={`text-[10px] mt-1 opacity-70 ${mine ? "text-primary-foreground" : "text-muted-foreground"}`}>
                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
                <div className="p-3 border-t flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMutation.mutate();
                      }
                    }}
                    data-testid="input-message"
                  />
                  <Button
                    onClick={() => sendMutation.mutate()}
                    disabled={sendMutation.isPending || !text.trim()}
                    data-testid="button-send-message"
                  >
                    {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                Select a conversation to start chatting
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
