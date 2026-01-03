import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { UserNotification } from "@shared/schema";
import { Bell, Check } from "lucide-react";
import { format } from "date-fns";

export default function Notifications() {
  const { data: notifications, isLoading } = useQuery<UserNotification[]>({
    queryKey: ["/api/notifications"],
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  return (
    <div className="max-w-4xl mx-auto p-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-12rem)]">
            <div className="flex flex-col gap-2">
              {notifications?.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No notifications yet
                </div>
              )}
              {notifications?.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-4 rounded-lg border flex items-start gap-4 transition-colors ${
                    notif.isRead ? "bg-background opacity-60" : "bg-muted/30"
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-semibold">{notif.title}</h4>
                      <span className="text-xs text-muted-foreground">
                        {notif.createdAt && format(new Date(notif.createdAt), "MMM d, h:mm a")}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{notif.message}</p>
                  </div>
                  {!notif.isRead && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => markReadMutation.mutate(notif.id)}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Mark read
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
