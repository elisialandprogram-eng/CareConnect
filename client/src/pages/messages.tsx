import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ChatConversation, ChatMessage } from "@shared/schema";
import { Send, User } from "lucide-react";

export default function Messages() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const { toast } = useToast();

  const { data: conversations, isLoading: loadingConversations } = useQuery<any[]>({
    queryKey: ["/api/chat/conversations"],
  });

  const { data: messages, isLoading: loadingMessages } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat/messages", selectedConversation],
    enabled: !!selectedConversation,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConversation || !message.trim()) return;
      return apiRequest("POST", "/api/chat/messages", {
        conversationId: selectedConversation,
        content: message,
      });
    },
    onSuccess: () => {
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/chat/messages", selectedConversation] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send message", variant: "destructive" });
    },
  });

  return (
    <div className="flex h-[calc(100vh-4rem)] p-4 gap-4">
      <Card className="w-80 flex flex-col">
        <CardHeader>
          <CardTitle>Conversations</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full">
            {conversations?.map((conv) => (
              <button
                key={conv.chat_conversations.id}
                onClick={() => setSelectedConversation(conv.chat_conversations.id)}
                className={`w-full p-4 text-left hover:bg-accent transition-colors border-b ${
                  selectedConversation === conv.chat_conversations.id ? "bg-accent" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="font-medium truncate">
                      {conv.users?.fullName || conv.providers?.specialization || "Chat"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {conv.chat_conversations.lastMessage || "No messages yet"}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            <CardHeader className="border-b">
              <CardTitle>Chat</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-4">
              <ScrollArea className="h-full pr-4">
                <div className="flex flex-col gap-4">
                  {messages?.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.senderId === "self" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] p-3 rounded-lg ${
                          msg.senderId === "self"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
            <div className="p-4 border-t flex gap-2">
              <Input
                placeholder="Type a message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && sendMessageMutation.mutate()}
              />
              <Button onClick={() => sendMessageMutation.mutate()} disabled={sendMessageMutation.isPending}>
                <Send className="h-4 w-4" />
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
  );
}
