import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Send, X, Minimize2, Maximize2, ArrowLeft, User as UserIcon } from "lucide-react";
import { RealtimeMessage, RealtimeConversation } from "@shared/schema";
import { clsx } from "clsx";
import { format } from "date-fns";

export function ChatBox() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeConversation, setActiveConversation] = useState<RealtimeConversation | null>(null);
  const [message, setMessage] = useState("");
  const [showNewChatOptions, setShowNewChatOptions] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: conversations } = useQuery<RealtimeConversation[]>({
    queryKey: ["/api/chat/conversations"],
    enabled: !!user,
  });

  const { data: messages } = useQuery<RealtimeMessage[]>({
    queryKey: ["/api/chat/messages", activeConversation?.id],
    enabled: !!activeConversation,
  });

  useEffect(() => {
    if (!user) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);
    socketRef.current = socket;

    socket.onopen = () => {
      // Use the helper to get cookie value
      const token = document.cookie
        .split('; ')
        .find(row => row.startsWith('accessToken='))
        ?.split('=')[1];
      
      socket.send(JSON.stringify({ type: "auth", token }));
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "message") {
        queryClient.invalidateQueries({ queryKey: ["/api/chat/messages", data.data.conversationId] });
      }
    };

    return () => socket.close();
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const sendMessage = () => {
    if (!message.trim() || !activeConversation || !socketRef.current) return;

    socketRef.current.send(JSON.stringify({
      type: "message",
      conversationId: activeConversation.id,
      content: message,
    }));
    setMessage("");
  };

  if (!user) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col items-start gap-2">
      {!isOpen ? (
        <Button
          className="rounded-full h-14 w-14 shadow-lg"
          onClick={() => setIsOpen(true)}
          data-testid="button-chat-open"
        >
          <MessageSquare className="h-6 w-6" />
        </Button>
      ) : (
        <Card className={clsx(
          "w-80 shadow-2xl transition-all border-primary/10",
          isMinimized ? "h-14" : "h-[500px]"
        )}>
          <CardHeader className="p-3 border-b flex flex-row items-center justify-between space-y-0 bg-primary text-primary-foreground rounded-t-lg">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Support Chat
            </CardTitle>
            <div className="flex gap-1">
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20" 
                onClick={() => setIsMinimized(!isMinimized)}
              >
                {isMinimized ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
              </Button>
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20" 
                onClick={() => {
                  setIsOpen(false);
                  setShowNewChatOptions(false);
                }}
              >
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
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-7 text-[10px]"
                      onClick={() => setShowNewChatOptions(!showNewChatOptions)}
                    >
                      {showNewChatOptions ? "Cancel" : "New Chat"}
                    </Button>
                  </div>

                  {showNewChatOptions ? (
                    <div className="space-y-2 mb-4 p-2 bg-muted/30 rounded-lg border border-primary/5">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground px-1">Start New Chat with:</p>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left h-auto py-2 px-3 text-xs hover-elevate"
                        onClick={() => {
                          // Handle support chat creation logic here
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
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left h-auto py-2 px-3 text-xs hover-elevate"
                        onClick={async () => {
                          try {
                            // Find the first booked provider
                            const response = await fetch('/api/appointments');
                            if (response.ok) {
                              const appointments = await response.json();
                              const bookedProvider = appointments.find((a: any) => a.status === 'confirmed' || a.status === 'pending');
                              if (bookedProvider) {
                                const convResponse = await apiRequest("POST", "/api/chat/conversations", {
                                  providerId: bookedProvider.providerId
                                });
                                setActiveConversation(convResponse as any);
                              }
                            }
                          } catch (error) {
                            console.error("Failed to start provider chat", error);
                          }
                          setShowNewChatOptions(false);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                            <UserIcon className="h-3 w-3 text-primary" />
                          </div>
                          <span>Booked Provider</span>
                        </div>
                      </Button>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    {conversations?.map((conv) => (
                      <Button
                        key={conv.id}
                        variant="outline"
                        className="w-full justify-start text-left h-auto py-2 px-3 hover-elevate"
                        onClick={() => setActiveConversation(conv)}
                      >
                        <div className="truncate">
                          <div className="font-medium text-xs">Healthcare Support</div>
                          <div className="text-[10px] text-muted-foreground truncate">{conv.lastMessage || "No messages yet"}</div>
                        </div>
                      </Button>
                    ))}
                    {(!conversations || conversations.length === 0) && (
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
                    <span className="text-xs font-medium">Healthcare Support</span>
                  </div>
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                      {messages?.map((msg) => (
                        <div
                          key={msg.id}
                          className={clsx(
                            "flex flex-col max-w-[85%]",
                            msg.senderId === user.id ? "ml-auto items-end" : "mr-auto items-start"
                          )}
                        >
                          <div className={clsx(
                            "rounded-lg px-3 py-2 text-xs shadow-sm",
                            msg.senderId === user.id 
                              ? "bg-primary text-primary-foreground rounded-tr-none" 
                              : "bg-muted rounded-tl-none"
                          )}>
                            {msg.content}
                          </div>
                          <span className="text-[9px] text-muted-foreground mt-1 px-1">
                            {msg.createdAt ? format(new Date(msg.createdAt), "HH:mm") : ""}
                          </span>
                        </div>
                      ))}
                      <div ref={scrollRef} />
                    </div>
                  </ScrollArea>
                  <div className="p-3 border-t flex gap-2 bg-background">
                    <Input
                      className="h-9 text-xs"
                      placeholder="Type a message..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                      data-testid="input-chat-message"
                    />
                    <Button size="icon" className="h-9 w-9 shrink-0" onClick={sendMessage} data-testid="button-chat-send">
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
