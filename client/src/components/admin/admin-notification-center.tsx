import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bell, BellRing, Check, CheckCheck, AlertCircle, Info, AlertTriangle, X, ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface AdminNotification {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  provider_id: string | null;
  provider_name: string | null;
  country_code: string | null;
  action_type: string | null;
  is_read: boolean;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  provider_type: string | null;
}

const SEV_CFG = {
  info:     { icon: Info,          dot: "bg-blue-400",   ring: "bg-blue-50 dark:bg-blue-950/20",   txt: "text-blue-600"  },
  warning:  { icon: AlertTriangle, dot: "bg-amber-400",  ring: "bg-amber-50 dark:bg-amber-950/20", txt: "text-amber-600" },
  critical: { icon: AlertCircle,   dot: "bg-red-500",    ring: "bg-red-50 dark:bg-red-950/20",     txt: "text-red-600"   },
} as const;

// Human-readable labels for each tab destination shown in the notification hint.
const TAB_LABELS: Record<string, string> = {
  "service-requests":   "Service Requests",
  "doc-queue":          "Docs Approval",
  "doc-expiry":         "Expiry Monitor",
  "verification-queue": "Provider Review",
  "wallets":            "Wallets",
  "payouts":            "Payouts",
  "refunds":            "Refunds",
  "support":            "Support",
  "providers":          "Providers",
  "title-requests":     "Title Requests",
  "type-requests":      "Type Requests",
  "financial":          "Financial",
};

// Maps notification type → the admin tab that should be activated on click.
// useProvider=true means also open the provider console sidebar for that provider.
const NOTIF_TAB_MAP: Record<string, { tab: string; useProvider?: boolean }> = {
  // Services
  service_added:           { tab: "service-requests" },
  service_request:         { tab: "service-requests" },
  // Documents / KYC
  document_uploaded:       { tab: "doc-queue" },
  document_expiring_soon:  { tab: "doc-expiry", useProvider: true },
  kyc_submitted:           { tab: "verification-queue", useProvider: true },
  kyc_resubmitted:         { tab: "verification-queue", useProvider: true },
  provider_registered:     { tab: "verification-queue", useProvider: true },
  provider_signup:         { tab: "verification-queue", useProvider: true },
  // Finance
  referral_qualified:      { tab: "wallets" },
  payout_requested:        { tab: "payouts" },
  payout_overdue:          { tab: "payouts" },
  refund_requested:        { tab: "refunds" },
  // Support
  support_ticket:          { tab: "support" },
  bug_report:              { tab: "support" },
  // Providers
  provider_suspended:      { tab: "providers", useProvider: true },
  provider_deactivated:    { tab: "providers", useProvider: true },
  title_request:           { tab: "title-requests" },
  type_change_request:     { tab: "type-requests" },
};

export function AdminNotificationCenter({
  onSelectProvider,
  onOpenDocQueue,
  onNavigate,
}: {
  onSelectProvider?: (id: string) => void;
  onOpenDocQueue?: () => void;
  onNavigate?: (tab: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data } = useQuery<{
    notifications: AdminNotification[];
    unreadCount: number;
    total: number;
  }>({
    queryKey: ["/api/admin/notifications"],
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const unreadCount = data?.unreadCount ?? 0;
  const notifications = data?.notifications ?? [];

  const markOneMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/admin/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] }),
  });

  const markAllMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/admin/notifications/mark-all-read"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
      toast({ title: "All notifications marked as read" });
    },
  });

  const handleClick = (n: AdminNotification) => {
    if (!n.is_read) markOneMutation.mutate(n.id);
    setOpen(false);

    const mapping = NOTIF_TAB_MAP[n.type] ?? NOTIF_TAB_MAP[n.action_type ?? ""];
    if (mapping && onNavigate) {
      onNavigate(mapping.tab);
      if (mapping.useProvider && n.provider_id && onSelectProvider) {
        onSelectProvider(n.provider_id);
      }
    } else if (n.provider_id && onSelectProvider) {
      // fallback: open the provider console for unmapped types
      onSelectProvider(n.provider_id);
    }
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        data-testid="button-admin-notifications"
        className="relative gap-1.5"
      >
        {unreadCount > 0 ? (
          <BellRing className="h-4 w-4 text-amber-500" />
        ) : (
          <Bell className="h-4 w-4" />
        )}
        <span className="hidden sm:inline text-sm">Notifications</span>
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-2 -right-2 h-5 min-w-[20px] px-1 text-[10px] rounded-full pointer-events-none"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        )}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-96 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 shadow-2xl flex flex-col max-h-[540px]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Notifications</span>
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="text-[11px] px-1.5">{unreadCount} new</Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-2 text-slate-500 hover:text-slate-700"
                    onClick={() => markAllMutation.mutate()}
                    disabled={markAllMutation.isPending}
                    data-testid="button-mark-all-read"
                  >
                    <CheckCheck className="h-3.5 w-3.5 mr-1" />
                    All read
                  </Button>
                )}
                {onOpenDocQueue && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-2 text-blue-500 hover:text-blue-700"
                    onClick={() => { setOpen(false); onOpenDocQueue(); }}
                  >
                    Doc Queue
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400" onClick={() => setOpen(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* List */}
            <ScrollArea className="flex-1">
              {notifications.length === 0 ? (
                <div className="py-14 text-center">
                  <Bell className="h-8 w-8 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">No notifications yet</p>
                  <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">
                    Activity will appear here as providers make changes
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {notifications.map((n) => {
                    const cfg = SEV_CFG[n.severity] ?? SEV_CFG.info;
                    const SevIcon = cfg.icon;
                    const name = n.first_name
                      ? `${n.first_name} ${n.last_name ?? ""}`.trim()
                      : (n.provider_name ?? null);
                    return (
                      <div
                        key={n.id}
                        className={cn(
                          "flex gap-3 px-4 py-3 cursor-pointer transition-colors group",
                          n.is_read
                            ? "hover:bg-slate-50 dark:hover:bg-slate-900/40"
                            : "bg-blue-50/50 dark:bg-blue-950/10 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                        )}
                        onClick={() => handleClick(n)}
                        data-testid={`notification-item-${n.id}`}
                      >
                        {/* Icon */}
                        <div className="flex-shrink-0 pt-0.5">
                          {n.avatar_url ? (
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={n.avatar_url} />
                              <AvatarFallback className="text-xs">{n.first_name?.[0] ?? "P"}</AvatarFallback>
                            </Avatar>
                          ) : (
                            <div className={cn("h-8 w-8 rounded-full flex items-center justify-center", cfg.ring)}>
                              <SevIcon className={cn("h-4 w-4", cfg.txt)} />
                            </div>
                          )}
                        </div>

                        {/* Body */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1">
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 leading-snug">
                              {n.title}
                            </p>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {!n.is_read && <span className={cn("h-2 w-2 rounded-full flex-shrink-0 mt-1", cfg.dot)} />}
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                            {n.message}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {name && (
                              <span className="text-[11px] text-slate-400 flex items-center gap-0.5">
                                <ExternalLink className="h-2.5 w-2.5" />
                                {name}
                              </span>
                            )}
                            {n.country_code && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-3.5">{n.country_code}</Badge>
                            )}
                            {(() => {
                              const m = NOTIF_TAB_MAP[n.type] ?? NOTIF_TAB_MAP[n.action_type ?? ""];
                              const label = m ? TAB_LABELS[m.tab] : null;
                              return label ? (
                                <span className="text-[11px] text-blue-500 flex items-center gap-0.5 font-medium">
                                  → {label}
                                </span>
                              ) : null;
                            })()}
                            <span className="text-[10px] text-slate-400 ml-auto tabular-nums">
                              {n.created_at && formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                            </span>
                          </div>
                        </div>

                        {/* Mark-read button */}
                        {!n.is_read && (
                          <button
                            className="flex-shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700"
                            onClick={(e) => { e.stopPropagation(); markOneMutation.mutate(n.id); }}
                            title="Mark as read"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 flex-shrink-0">
                <p className="text-[11px] text-slate-400 text-center">{data?.total ?? 0} total</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
