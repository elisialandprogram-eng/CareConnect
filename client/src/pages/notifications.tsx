import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { UserNotification } from "@shared/schema";
import { Bell, Check, CheckCheck, Calendar, DollarSign, Info } from "lucide-react";
import { format } from "date-fns";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { useToast } from "@/hooks/use-toast";
import { showErrorModal } from "@/components/error-modal";
import { useTranslation } from "react-i18next";

export default function Notifications() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: notifications, isLoading } = useQuery<UserNotification[]>({
    queryKey: ["/api/notifications"],
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/notifications/mark-all-read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      toast({
        title: t("notifications.all_marked_title", "All notifications marked as read"),
      });
    },
    onError: (e: any) => {
      showErrorModal({
        title: t("notifications.all_marked_failed", "Couldn't mark all as read"),
        description: e?.message || "Please try again.",
        context: "notifications.markAllRead",
      });
    },
  });

  const unreadCount = (notifications ?? []).filter((n) => !n.isRead).length;

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
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-6 w-6" />
                {t("common.notifications", "Notifications")}
                {unreadCount > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium px-2 py-0.5" data-testid="badge-unread-count">
                    {unreadCount}
                  </span>
                )}
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending || unreadCount === 0}
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-4 w-4 mr-1.5" />
                {t("notifications.mark_all_read", "Mark all as read")}
              </Button>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[calc(100vh-16rem)]">
                <div className="flex flex-col gap-3">
                  {isLoading ? (
                    <div className="text-center py-8" data-testid="text-loading-notifications">
                      {t("notifications.loading", "Loading notifications...")}
                    </div>
                  ) : notifications?.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground" data-testid="text-no-notifications">
                      <Bell className="h-12 w-12 mx-auto mb-4 opacity-20" />
                      <p>{t("notifications.empty", "No notifications yet")}</p>
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
                          {getIcon(notif.type ?? "")}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-semibold" data-testid={`text-notification-title-${notif.id}`}>{notif.title}</h4>
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
                              data-testid={`button-mark-read-${notif.id}`}
                            >
                              <Check className="h-3 w-3 mr-1" />
                              {t("notifications.mark_read", "Mark as read")}
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
