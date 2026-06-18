import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/use-page-title";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { UserNotification } from "@shared/schema";
import { Bell, Check, CheckCheck, Calendar, DollarSign, Settings, Info, ChevronRight, Trash2, CheckSquare, Square } from "lucide-react";
import { formatDateTime } from "@/lib/datetime";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { useToast } from "@/hooks/use-toast";
import { showErrorModal } from "@/components/error-modal";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { QK } from "@/lib/query-keys";

type NotifFilter = "all" | "appointment" | "payment" | "system" | "package" | "membership" | "referral";

const FILTER_TABS: { key: NotifFilter; label: string; icon: typeof Bell }[] = [
  { key: "all",         label: "All",          icon: Bell },
  { key: "appointment", label: "Appointments",  icon: Calendar },
  { key: "payment",     label: "Payments",      icon: DollarSign },
  { key: "package",     label: "Packages",      icon: Settings },
  { key: "membership",  label: "Membership",    icon: Info },
  { key: "referral",    label: "Referrals",     icon: ChevronRight },
  { key: "system",      label: "System",        icon: Settings },
];

function getIcon(type: string | null | undefined) {
  switch (type) {
    case "appointment":
      return <div className="flex items-center justify-center h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 shrink-0"><Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" /></div>;
    case "payment":
      return <div className="flex items-center justify-center h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 shrink-0"><DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" /></div>;
    case "package":
      return <div className="flex items-center justify-center h-10 w-10 rounded-full bg-violet-100 dark:bg-violet-900/30 shrink-0"><Settings className="h-5 w-5 text-violet-600 dark:text-violet-400" /></div>;
    case "membership":
      return <div className="flex items-center justify-center h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 shrink-0"><Info className="h-5 w-5 text-indigo-600 dark:text-indigo-400" /></div>;
    case "referral":
      return <div className="flex items-center justify-center h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/30 shrink-0"><ChevronRight className="h-5 w-5 text-orange-600 dark:text-orange-400" /></div>;
    case "system":
      return <div className="flex items-center justify-center h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 shrink-0"><Settings className="h-5 w-5 text-amber-600 dark:text-amber-400" /></div>;
    default:
      return <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 shrink-0"><Info className="h-5 w-5 text-primary" /></div>;
  }
}

function getDeepLink(notif: UserNotification): string | null {
  try {
    if (notif.data) {
      const parsed = JSON.parse(notif.data);
      if (parsed?.appointmentId)       return `/appointments/${parsed.appointmentId}`;
      if (parsed?.actionUrl)           return parsed.actionUrl;
      if (parsed?.supportTicketId)     return `/support/tickets/${parsed.supportTicketId}`;
      if (parsed?.bugId)               return `/support/tickets`;
      if (parsed?.payoutId)            return `/provider/earnings`;
      if (parsed?.chatConversationId)  return `/messages`;
      if (parsed?.conversationId)      return `/messages`;
      if (parsed?.packageId)           return `/packages`;
      if (parsed?.waitlistId)          return `/patient/dashboard`;
      if (parsed?.reviewId)            return `/my-reviews`;
      if (parsed?.invoiceId)           return `/appointments`;
      if (parsed?.providerId)          return `/providers/${parsed.providerId}`;
    }
  } catch {}
  if (notif.type === "appointment") return "/appointments";
  if (notif.type === "payment")     return "/wallet";
  if (notif.type === "referral")    return "/referrals";
  if (notif.type === "package")     return "/packages";
  if (notif.type === "membership")  return "/packages";
  return null;
}

function classifyType(type: string | null | undefined): NotifFilter {
  if (type === "appointment") return "appointment";
  if (type === "payment")     return "payment";
  if (type === "package")     return "package";
  if (type === "membership")  return "membership";
  if (type === "referral")    return "referral";
  if (type === "system")      return "system";
  return "system"; // unknown → system bucket
}

export default function Notifications() {
  const { t } = useTranslation();
  usePageTitle(t("notifications.meta_title", "Notifications"));
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [activeFilter, setActiveFilter] = useState<NotifFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);

  const { data: notifications, isLoading } = useQuery<UserNotification[]>({
    queryKey: QK.notifications(),
  });

  const deleteNotifMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/notifications/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: QK.notifications() });
      const prev = queryClient.getQueryData<UserNotification[]>(QK.notifications());
      queryClient.setQueryData<UserNotification[]>(QK.notifications(), old => old?.filter(n => n.id !== id) ?? []);
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QK.notifications(), ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QK.notifications() });
      queryClient.invalidateQueries({ queryKey: QK.notificationsUnreadCount() });
    },
  });

  const bulkActionMutation = useMutation({
    mutationFn: async ({ action, ids }: { action: "mark_read" | "delete"; ids: string[] }) =>
      apiRequest("POST", "/api/notifications/bulk-action", { action, ids }),
    onSuccess: (_data, { action }) => {
      setSelectedIds(new Set());
      setBulkMode(false);
      queryClient.invalidateQueries({ queryKey: QK.notifications() });
      queryClient.invalidateQueries({ queryKey: QK.notificationsUnreadCount() });
      toast({ title: action === "delete" ? "Notifications deleted" : "Marked as read" });
    },
    onError: (e: any) => {
      showErrorModal({ title: "Action failed", description: e?.message || "Please try again.", context: "notifications.bulk" });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: QK.notifications() });
      const prev = queryClient.getQueryData<UserNotification[]>(["/api/notifications"]);
      queryClient.setQueryData<UserNotification[]>(["/api/notifications"], (old) =>
        old?.map((n) => (n.id === id ? { ...n, isRead: true } : n)) ?? []
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/notifications"], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QK.notifications() });
      queryClient.invalidateQueries({ queryKey: QK.notificationsUnreadCount() });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/notifications/mark-all-read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.notifications() });
      queryClient.invalidateQueries({ queryKey: QK.notificationsUnreadCount() });
      toast({ title: t("notifications.all_marked_title", "All notifications marked as read") });
    },
    onError: (e: any) => {
      showErrorModal({
        title: t("notifications.all_marked_failed", "Couldn't mark all as read"),
        description: e?.message || "Please try again.",
        context: "notifications.markAllRead",
      });
    },
  });

  const all = notifications ?? [];
  const unreadCount = all.filter((n) => !n.isRead).length;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(n => n.id)));
    }
  };

  const filtered = activeFilter === "all"
    ? all
    : all.filter((n) => classifyType(n.type) === activeFilter);

  const emptyMessages: Record<NotifFilter, { title: string; desc: string }> = {
    all:         { title: "No notifications yet",          desc: "You'll be notified here about appointments, payments, and updates." },
    appointment: { title: "No appointment notifications",  desc: "Booking confirmations and reminders will appear here." },
    payment:     { title: "No payment notifications",      desc: "Payment receipts and wallet credits will appear here." },
    system:      { title: "No system notifications",       desc: "Important account and platform alerts will appear here." },
    package:     { title: "No package notifications",      desc: "Membership and package updates will appear here." },
    membership:  { title: "No membership notifications",   desc: "Membership plan updates will appear here." },
    referral:    { title: "No referral notifications",     desc: "Referral rewards and status updates will appear here." },
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto p-4 py-8">
        <div className="max-w-4xl mx-auto">
          <PageBreadcrumbs
            items={[{ label: "Home", href: "/" }, { label: t("common.notifications", "Notifications") }]}
            fallback="/"
          />
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3 flex-wrap">
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-6 w-6" />
                {t("common.notifications", "Notifications")}
                {unreadCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium px-2 py-0.5" data-testid="badge-unread-count">
                    {unreadCount}
                  </span>
                )}
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                {bulkMode && selectedIds.size > 0 && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => bulkActionMutation.mutate({ action: "mark_read", ids: Array.from(selectedIds) })}
                      disabled={bulkActionMutation.isPending}
                      data-testid="button-bulk-mark-read"
                    >
                      <Check className="h-4 w-4 mr-1.5" />
                      Mark read ({selectedIds.size})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive/40 hover:bg-destructive/10"
                      onClick={() => bulkActionMutation.mutate({ action: "delete", ids: Array.from(selectedIds) })}
                      disabled={bulkActionMutation.isPending}
                      data-testid="button-bulk-delete"
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" />
                      Delete ({selectedIds.size})
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant={bulkMode ? "default" : "outline"}
                  onClick={() => { setBulkMode(v => !v); setSelectedIds(new Set()); }}
                  data-testid="button-toggle-bulk"
                >
                  {bulkMode ? <CheckSquare className="h-4 w-4 mr-1.5" /> : <Square className="h-4 w-4 mr-1.5" />}
                  {bulkMode ? "Cancel" : "Select"}
                </Button>
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
              </div>
            </CardHeader>

            {/* Filter chips */}
            <div className="px-6 pb-3 flex flex-wrap gap-2 border-b" data-testid="notification-filters">
              {FILTER_TABS.map(({ key, label, icon: Icon }) => {
                const count = key === "all" ? all.length : all.filter(n => classifyType(n.type) === key).length;
                const unread = key === "all" ? unreadCount : all.filter(n => classifyType(n.type) === key && !n.isRead).length;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveFilter(key)}
                    data-testid={`filter-${key}`}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors
                      ${activeFilter === key
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                    {count > 0 && (
                      <span className={`rounded-full px-1.5 py-0.5 text-xs leading-none
                        ${activeFilter === key ? "bg-white/25 text-white" : unread > 0 ? "bg-primary/15 text-primary" : "bg-muted-foreground/15 text-muted-foreground"}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <CardContent className="pt-4">
              <ScrollArea className="h-[calc(100vh-20rem)]">
                <div className="flex flex-col gap-2">
                  {isLoading ? (
                    <div className="space-y-3" data-testid="skeleton-notifications">
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="p-4 rounded-lg border flex items-start gap-4">
                          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center justify-between gap-4">
                              <Skeleton className="h-4 w-36" />
                              <Skeleton className="h-3 w-16 shrink-0" />
                            </div>
                            <Skeleton className="h-3 w-full" />
                            <Skeleton className="h-3 w-3/4" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center py-16 text-center" data-testid="text-no-notifications">
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                        <Bell className="h-8 w-8 text-muted-foreground opacity-40" />
                      </div>
                      <h3 className="font-semibold text-base mb-1">{emptyMessages[activeFilter].title}</h3>
                      <p className="text-sm text-muted-foreground max-w-xs">{emptyMessages[activeFilter].desc}</p>
                    </div>
                  ) : (
                    filtered.map((notif) => {
                      const link = getDeepLink(notif);
                      const isSelected = selectedIds.has(notif.id);
                      return (
                        <div
                          key={notif.id}
                          className={`group p-4 rounded-lg border flex items-start gap-3 transition-all
                            ${notif.isRead ? "bg-background opacity-80" : "bg-primary/5 border-primary/20"}
                            ${link && !bulkMode ? "cursor-pointer hover:shadow-sm hover:border-primary/30" : ""}
                            ${isSelected ? "ring-2 ring-primary/40 bg-primary/8" : ""}`}
                          data-testid={`card-notification-${notif.id}`}
                          onClick={() => {
                            if (bulkMode) { toggleSelect(notif.id); return; }
                            if (!notif.isRead) markReadMutation.mutate(notif.id);
                            if (link) navigate(link);
                          }}
                        >
                          {/* Checkbox in bulk mode */}
                          {bulkMode && (
                            <button
                              type="button"
                              className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
                              data-testid={`checkbox-notif-${notif.id}`}
                              aria-label={isSelected ? "Deselect" : "Select"}
                              onClick={(e) => { e.stopPropagation(); toggleSelect(notif.id); }}
                            >
                              {isSelected
                                ? <CheckSquare className="h-5 w-5 text-primary" />
                                : <Square className="h-5 w-5" />}
                            </button>
                          )}
                          {getIcon(notif.type)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between mb-1 gap-2">
                              <h4 className="font-semibold leading-tight" data-testid={`text-notification-title-${notif.id}`}>{notif.title}</h4>
                              <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                                {notif.createdAt && formatDateTime(notif.createdAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">{notif.message}</p>
                            <div className="flex items-center gap-2 mt-2">
                              {!notif.isRead && !bulkMode && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={(e) => { e.stopPropagation(); markReadMutation.mutate(notif.id); }}
                                  disabled={markReadMutation.isPending}
                                  data-testid={`button-mark-read-${notif.id}`}
                                >
                                  <Check className="h-3 w-3 mr-1" />
                                  {t("notifications.mark_read", "Mark as read")}
                                </Button>
                              )}
                              {link && !bulkMode && (
                                <span className="ml-auto text-xs text-primary flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  View <ChevronRight className="h-3 w-3" />
                                </span>
                              )}
                            </div>
                          </div>
                          {!bulkMode && (
                            <button
                              type="button"
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1 rounded shrink-0 mt-0.5"
                              data-testid={`button-delete-notif-${notif.id}`}
                              aria-label="Delete notification"
                              onClick={(e) => { e.stopPropagation(); deleteNotifMutation.mutate(notif.id); }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })
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
