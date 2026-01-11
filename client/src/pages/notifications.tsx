import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { UserNotification } from "@shared/schema";
import { Bell, Check, Calendar, DollarSign, Info } from "lucide-react";
import { format } from "date-fns";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

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

  const getIcon = (type: string) => {
    switch (type) {
      case "appointment": return <Calendar className="h-5 w-5 text-primary" />;
      case "payment": return <DollarSign className="h-5 w-5 text-green-500" />;
      default: return <Bell className="h-5 w-5 text-blue-500" />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto p-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-6 w-6" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[calc(100vh-16rem)]">
                <div className="flex flex-col gap-3">
                  {isLoading ? (
                    <div className="text-center py-8">Loading notifications...</div>
                  ) : notifications?.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Bell className="h-12 w-12 mx-auto mb-4 opacity-20" />
                      <p>No notifications yet</p>
                    </div>
                  ) : (
                    notifications?.map((notif) => (
                      <div
                        key={notif.id}
                        className={`p-4 rounded-lg border flex items-start gap-4 transition-all hover:shadow-sm ${
                          notif.isRead ? "bg-background opacity-70" : "bg-primary/5 border-primary/20"
                        }`}
                        data-testid={`card-notification-${notif.id}`}
                      >
                        <div className="mt-1">
                          {getIcon(notif.type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-semibold">{notif.title}</h4>
                            <span className="text-xs text-muted-foreground">
                              {notif.createdAt && format(new Date(notif.createdAt), "MMM d, h:mm a")}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed">{notif.message}</p>
                          {!notif.isRead && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-3 h-8 text-xs hover-elevate"
                              onClick={() => markReadMutation.mutate(notif.id)}
                              disabled={markReadMutation.isPending}
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Mark as read
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
