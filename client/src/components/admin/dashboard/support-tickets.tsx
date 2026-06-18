import { formatDateTime } from "@/lib/datetime";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Inbox,
  Activity,
  CheckCircle,
  XCircle,
  AlertCircle,
  UserCog,
  UserCheck,
  UserPlus,
  RefreshCw,
  Timer,
  Search,
  MessageSquare,
  CalendarDays,
  Hash,
  Tag,
  FileText,
  MapPin,
  Lock,
  Send,
  CheckCheck,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

function ticketAgeLabel(iso: string | null | undefined): {
  label: string;
  tone: "fresh" | "warm" | "hot";
} {
  if (!iso) return { label: "—", tone: "fresh" };
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return { label: `${m}m`, tone: "fresh" };
  const h = Math.floor(m / 60);
  if (h < 24) return { label: `${h}h`, tone: h >= 4 ? "warm" : "fresh" };
  const d = Math.floor(h / 24);
  return { label: `${d}d`, tone: d >= 3 ? "hot" : "warm" };
}

function ticketInitials(
  first?: string | null,
  last?: string | null,
  fallback?: string | null,
) {
  const a = (first || "").trim()[0] || "";
  const b = (last || "").trim()[0] || "";
  const initials = (a + b).toUpperCase();
  if (initials) return initials;
  if (fallback) return fallback.trim()[0]?.toUpperCase() || "?";
  return "?";
}

function ticketColorFor(seed: string): string {
  const palette = [
    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++)
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function TicketAvatar({
  name,
  seed,
  size = 32,
}: {
  name: string;
  seed: string;
  size?: number;
}) {
  const parts = name.trim().split(/\s+/);
  const initials = ticketInitials(parts[0], parts[1], name);
  const cls = ticketColorFor(seed || name);
  return (
    <div
      className={`rounded-full flex items-center justify-center font-semibold ${cls}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

export function SupportTickets() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [reply, setReply] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);

  const {
    data: tickets,
    refetch,
    isFetching,
  } = useQuery<any[]>({
    queryKey: ["/api/admin/support-tickets"],
    refetchInterval: 60000,
    staleTime: 30_000,
  });

  const { data: ticketMessages, refetch: refetchMessages } = useQuery<any[]>({
    queryKey: [
      "/api/admin/support-tickets",
      selectedTicket?.id,
      "messages",
    ],
    enabled: !!selectedTicket,
    refetchInterval: 30000,
    staleTime: 10_000,
  });

  const { data: rawUsers } = useQuery<any>({
    queryKey: ["/api/admin/users"],
  });
  const allUsersArr: any[] = Array.isArray(rawUsers) ? rawUsers : rawUsers?.users ?? [];
  const adminUsers = allUsersArr.filter((u) => isAdminRole(u.role));

  const updateTicketMutation = useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string;
      status?: string;
      priority?: string;
      assignedTo?: string | null;
    }) => {
      const response = await apiRequest(
        "PATCH",
        `/api/admin/support-tickets/${id}`,
        patch,
      );
      const resData = await response.json();
      if (!response.ok)
        throw new Error(
          resData.message ||
            t(
              "admin_dashboard.ticket_update_failed",
              "Failed to update ticket",
            ),
        );
      return resData;
    },
    onSuccess: () => {
      toast({ title: t("admin_dashboard.ticket_updated", "Ticket updated") });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: t("admin_dashboard.error", "Error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({
      ticketId,
      message,
      isInternal,
    }: {
      ticketId: string;
      message: string;
      isInternal: boolean;
    }) => {
      const response = await apiRequest(
        "POST",
        `/api/admin/support-tickets/${ticketId}/messages`,
        { message, isInternal },
      );
      const resData = await response.json();
      if (!response.ok)
        throw new Error(
          resData.message ||
            t(
              "admin_dashboard.message_send_failed",
              "Failed to send message",
            ),
        );
      return resData;
    },
    onSuccess: () => {
      toast({
        title: isInternalNote
          ? t("admin_dashboard.note_added", "Internal note added")
          : t("admin_dashboard.message_sent", "Reply sent"),
      });
      setReply("");
      setIsInternalNote(false);
      refetchMessages();
      qc.invalidateQueries({
        queryKey: ["/api/admin/support-tickets"],
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("admin_dashboard.error", "Error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const STATUS_CFG: Record<
    string,
    { label: string; cls: string; icon: any; pillCls: string }
  > = {
    open: {
      label: t("admin_dashboard.status_open", "Open"),
      icon: Inbox,
      cls: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300",
      pillCls: "bg-blue-500",
    },
    in_progress: {
      label: t("admin_dashboard.status_in_progress", "In progress"),
      icon: Activity,
      cls: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300",
      pillCls: "bg-amber-500",
    },
    resolved: {
      label: t("admin_dashboard.status_resolved", "Resolved"),
      icon: CheckCircle,
      cls: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300",
      pillCls: "bg-emerald-500",
    },
    closed: {
      label: t("admin_dashboard.status_closed", "Closed"),
      icon: XCircle,
      cls: "bg-muted text-muted-foreground border-border",
      pillCls: "bg-slate-400",
    },
  };

  const PRIORITY_CFG: Record<string, string> = {
    low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    medium:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  };

  const ageToneCls = (tone: "fresh" | "warm" | "hot") =>
    tone === "hot"
      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
      : tone === "warm"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";

  const ticketCreatorName = (tk: any): string =>
    tk?.creator
      ? `${tk.creator.firstName || ""} ${tk.creator.lastName || ""}`.trim() ||
        tk.creator.email ||
        t("admin_dashboard.guest", "Guest")
      : tk?.name || t("admin_dashboard.guest", "Guest");

  const filtered = (tickets ?? []).filter((tk: any) => {
    if (statusFilter !== "all" && tk.status !== statusFilter) return false;
    if (priorityFilter !== "all" && tk.priority !== priorityFilter)
      return false;
    if (assigneeFilter === "me" && tk.assignedTo !== currentUser?.id)
      return false;
    if (assigneeFilter === "unassigned" && tk.assignedTo) return false;
    if (
      assigneeFilter !== "all" &&
      assigneeFilter !== "me" &&
      assigneeFilter !== "unassigned" &&
      tk.assignedTo !== assigneeFilter
    )
      return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const creatorName =
      `${tk.creator?.firstName || ""} ${tk.creator?.lastName || ""} ${tk.creator?.email || tk.name || ""}`.toLowerCase();
    return (
      tk.subject?.toLowerCase().includes(q) ||
      tk.description?.toLowerCase().includes(q) ||
      tk.category?.toLowerCase().includes(q) ||
      creatorName.includes(q)
    );
  });

  const counts = (tickets ?? []).reduce(
    (acc: Record<string, number>, tk: any) => {
      acc[tk.status] = (acc[tk.status] || 0) + 1;
      return acc;
    },
    {},
  );
  const myCount = (tickets ?? []).filter(
    (tk: any) =>
      tk.assignedTo === currentUser?.id && tk.status !== "closed",
  ).length;
  const unassignedCount = (tickets ?? []).filter(
    (tk: any) => !tk.assignedTo && tk.status !== "closed",
  ).length;

  const sendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !reply.trim()) return;
    sendMessageMutation.mutate({
      ticketId: selectedTicket.id,
      message: reply.trim(),
      isInternal: isInternalNote,
    });
  };

  const applyAction = (patch: {
    status?: string;
    priority?: string;
    assignedTo?: string | null;
  }) => {
    if (!selectedTicket) return;
    updateTicketMutation.mutate({ id: selectedTicket.id, ...patch });
    setSelectedTicket({ ...selectedTicket, ...patch });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {t("admin_dashboard.support_inbox", "Support inbox")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              "admin_dashboard.support_inbox_sub",
              "Manage, assign, and reply to customer tickets.",
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-8 px-2.5 text-xs gap-1.5">
            <UserCog className="h-3.5 w-3.5" />
            {t("admin_dashboard.assigned_to_me", "Assigned to me")}:{" "}
            <span className="font-semibold">{myCount}</span>
          </Badge>
          <Badge variant="outline" className="h-8 px-2.5 text-xs gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            {t("admin_dashboard.unassigned", "Unassigned")}:{" "}
            <span className="font-semibold">{unassignedCount}</span>
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-tickets"
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
            <span className="ml-2 hidden sm:inline">
              {t("common.refresh", "Refresh")}
            </span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["open", "in_progress", "resolved", "closed"] as const).map((s) => {
          const Icon = STATUS_CFG[s].icon;
          const isActive = statusFilter === s;
          return (
            <Card
              key={s}
              className={`cursor-pointer hover-elevate transition-all ${isActive ? "ring-2 ring-primary border-primary" : ""}`}
              onClick={() => setStatusFilter(isActive ? "all" : s)}
              data-testid={`stat-${s}`}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div
                  className={`h-10 w-10 rounded-lg flex items-center justify-center ${STATUS_CFG[s].cls}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground truncate">
                    {STATUS_CFG[s].label}
                  </p>
                  <p className="text-2xl font-bold leading-tight">
                    {counts[s] || 0}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
        <Card className="overflow-hidden">
          <CardHeader className="pb-3 space-y-3 bg-muted/30 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {t("admin_dashboard.tickets", "Tickets")}
              </CardTitle>
              <Badge variant="secondary" className="rounded-full">
                {filtered.length}
              </Badge>
            </div>
            <div className="relative">
              <Search className="h-4 w-4 absolute start-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder={t(
                  "admin_dashboard.search_tickets",
                  "Search subject, user, email...",
                )}
                className="pl-8 h-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-tickets"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger
                  className="h-8 text-xs"
                  data-testid="select-filter-status"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("admin_dashboard.all_statuses", "All statuses")}
                  </SelectItem>
                  {(
                    ["open", "in_progress", "resolved", "closed"] as const
                  ).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_CFG[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={priorityFilter}
                onValueChange={setPriorityFilter}
              >
                <SelectTrigger
                  className="h-8 text-xs"
                  data-testid="select-filter-priority"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("admin_dashboard.all_priorities", "All priorities")}
                  </SelectItem>
                  <SelectItem value="low">
                    {t("admin_dashboard.priority_low", "Low")}
                  </SelectItem>
                  <SelectItem value="medium">
                    {t("admin_dashboard.priority_medium", "Medium")}
                  </SelectItem>
                  <SelectItem value="high">
                    {t("admin_dashboard.priority_high", "High")}
                  </SelectItem>
                  <SelectItem value="urgent">
                    {t("admin_dashboard.priority_urgent", "Urgent")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={assigneeFilter}
                onValueChange={setAssigneeFilter}
              >
                <SelectTrigger
                  className="h-8 text-xs"
                  data-testid="select-filter-assignee"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("admin_dashboard.all_assignees", "All assignees")}
                  </SelectItem>
                  <SelectItem value="me">
                    {t("admin_dashboard.me", "Me")}
                  </SelectItem>
                  <SelectItem value="unassigned">
                    {t("admin_dashboard.unassigned", "Unassigned")}
                  </SelectItem>
                  {adminUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.firstName} {u.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[560px]">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground space-y-2">
                  <Inbox className="h-12 w-12 text-muted-foreground/30" />
                  <p className="text-sm">
                    {t(
                      "admin_dashboard.no_tickets_match",
                      "No tickets match the current filters.",
                    )}
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {filtered.map((ticket: any) => {
                    const cfg =
                      STATUS_CFG[ticket.status] || STATUS_CFG.open;
                    const isActive = selectedTicket?.id === ticket.id;
                    const creator = ticketCreatorName(ticket);
                    const age = ticketAgeLabel(
                      ticket.updatedAt || ticket.createdAt,
                    );
                    const isUnassigned = !ticket.assignedTo;
                    const isAssignedToMe =
                      ticket.assignedTo === currentUser?.id;
                    return (
                      <div
                        key={ticket.id}
                        onClick={() => setSelectedTicket(ticket)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) =>
                          (e.key === "Enter" || e.key === " ") &&
                          setSelectedTicket(ticket)
                        }
                        className={`w-full text-left p-3 transition-colors flex gap-3 items-start cursor-pointer ${
                          isActive
                            ? "bg-primary/10 border-l-4 border-l-primary"
                            : "hover:bg-muted/60 border-l-4 border-l-transparent"
                        }`}
                        data-testid={`card-ticket-${ticket.id}`}
                      >
                        <TicketAvatar
                          name={creator}
                          seed={ticket.createdBy || ticket.id}
                          size={36}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-sm truncate flex-1">
                              {ticket.subject}
                            </p>
                            <span
                              className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${ageToneCls(age.tone)}`}
                            >
                              <Timer className="h-2.5 w-2.5" />
                              {age.label}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {creator}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                            {ticket.description}
                          </p>
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <Badge
                              variant="outline"
                              className={`${cfg.cls} text-[10px] px-1.5 py-0 h-5 gap-1`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${cfg.pillCls}`}
                              />
                              {cfg.label}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={`${PRIORITY_CFG[ticket.priority] || ""} text-[10px] px-1.5 py-0 h-5`}
                            >
                              {ticket.priority}
                            </Badge>
                            {ticket.category && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 h-5"
                              >
                                <Tag className="h-2.5 w-2.5 mr-0.5" />
                                {ticket.category}
                              </Badge>
                            )}
                            {ticket.assignee ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 h-5 ml-auto bg-primary/5"
                              >
                                <UserCheck className="h-2.5 w-2.5 mr-0.5" />
                                {ticket.assignee.firstName}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 h-5 ml-auto bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300"
                              >
                                {t(
                                  "admin_dashboard.unassigned",
                                  "Unassigned",
                                )}
                              </Badge>
                            )}
                          </div>
                          {currentUser?.id &&
                            isUnassigned &&
                            ticket.status !== "closed" &&
                            ticket.status !== "resolved" && (
                              <div
                                className="mt-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80 bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded px-2 py-0.5 transition-colors"
                                  data-testid={`button-quick-assign-${ticket.id}`}
                                  onClick={() =>
                                    updateTicketMutation.mutate({
                                      id: ticket.id,
                                      assignedTo: currentUser.id,
                                    })
                                  }
                                >
                                  <UserCheck className="h-2.5 w-2.5" />
                                  {t(
                                    "admin_dashboard.assign_to_me",
                                    "Assign to me",
                                  )}
                                </button>
                              </div>
                            )}
                          {currentUser?.id &&
                            isAssignedToMe &&
                            ticket.status !== "closed" &&
                            ticket.status !== "resolved" && (
                              <div className="mt-2">
                                <span className="inline-flex items-center gap-1 text-[10px] text-primary/70">
                                  <UserCheck className="h-2.5 w-2.5" />
                                  Assigned to you
                                </span>
                              </div>
                            )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          {!selectedTicket ? (
            <CardContent className="flex flex-col items-center justify-center min-h-[640px] text-center text-muted-foreground space-y-3">
              <MessageSquare className="h-14 w-14 text-muted-foreground/30" />
              <p className="text-sm">
                {t(
                  "admin_dashboard.select_ticket_details",
                  "Select a ticket to view details and reply.",
                )}
              </p>
            </CardContent>
          ) : (
            <>
              {(() => {
                const cfg =
                  STATUS_CFG[selectedTicket.status] || STATUS_CFG.open;
                const creator = ticketCreatorName(selectedTicket);
                const age = ticketAgeLabel(selectedTicket.createdAt);
                return (
                  <CardHeader className="border-b space-y-3 bg-gradient-to-br from-muted/40 to-transparent">
                    <div className="flex items-start gap-3">
                      <TicketAvatar
                        name={creator}
                        seed={
                          selectedTicket.createdBy || selectedTicket.id
                        }
                        size={44}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-lg">
                            {selectedTicket.subject}
                          </CardTitle>
                          <Badge
                            variant="outline"
                            className={`${cfg.cls} text-[10px] gap-1`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${cfg.pillCls}`}
                            />
                            {cfg.label}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`${PRIORITY_CFG[selectedTicket.priority] || ""} text-[10px]`}
                          >
                            {selectedTicket.priority}
                          </Badge>
                          {selectedTicket.category && (
                            <Badge
                              variant="outline"
                              className="text-[10px]"
                            >
                              <Tag className="h-2.5 w-2.5 mr-0.5" />
                              {selectedTicket.category}
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="mt-1 flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-foreground/80">
                            {creator}
                          </span>
                          {selectedTicket.creator?.email && (
                            <span>· {selectedTicket.creator.email}</span>
                          )}
                          {selectedTicket.mobileNumber && (
                            <span>· {selectedTicket.mobileNumber}</span>
                          )}
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {formatDateTime(selectedTicket.createdAt)}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${ageToneCls(age.tone)}`}
                          >
                            <Timer className="h-2.5 w-2.5" />
                            {age.label}{" "}
                            {t("admin_dashboard.old", "old")}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Hash className="h-2.5 w-2.5" />
                            {(selectedTicket.id || "").slice(0, 8)}
                          </span>
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {selectedTicket.status !== "resolved" &&
                        selectedTicket.status !== "closed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              applyAction({ status: "resolved" })
                            }
                            data-testid="button-action-resolve"
                          >
                            <CheckCheck className="h-4 w-4 mr-1.5" />
                            {t(
                              "admin_dashboard.mark_resolved",
                              "Resolve",
                            )}
                          </Button>
                        )}
                      {selectedTicket.status !== "closed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            applyAction({ status: "closed" })
                          }
                          data-testid="button-action-close"
                        >
                          <XCircle className="h-4 w-4 mr-1.5" />
                          {t("admin_dashboard.close_ticket", "Close")}
                        </Button>
                      )}
                      {(selectedTicket.status === "closed" ||
                        selectedTicket.status === "resolved") && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            applyAction({ status: "open" })
                          }
                          data-testid="button-action-reopen"
                        >
                          <RotateCcw className="h-4 w-4 mr-1.5" />
                          {t("admin_dashboard.reopen", "Reopen")}
                        </Button>
                      )}
                      {currentUser?.id &&
                        selectedTicket.assignedTo !== currentUser.id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              applyAction({ assignedTo: currentUser.id })
                            }
                            data-testid="button-action-assign-me"
                          >
                            <UserPlus className="h-4 w-4 mr-1.5" />
                            {t(
                              "admin_dashboard.assign_to_me",
                              "Assign to me",
                            )}
                          </Button>
                        )}

                      <div className="ml-auto flex items-center gap-2 flex-wrap">
                        <Select
                          value={
                            selectedTicket.assignedTo ?? "__unassigned"
                          }
                          onValueChange={(v) =>
                            applyAction({
                              assignedTo:
                                v === "__unassigned" ? null : v,
                            })
                          }
                        >
                          <SelectTrigger
                            className="w-44 h-8 text-xs"
                            data-testid="select-ticket-assignee"
                          >
                            <UserCog className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__unassigned">
                              {t(
                                "admin_dashboard.unassigned",
                                "Unassigned",
                              )}
                            </SelectItem>
                            {adminUsers.map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.firstName} {u.lastName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={selectedTicket.status}
                          onValueChange={(status) =>
                            applyAction({ status })
                          }
                        >
                          <SelectTrigger
                            className="w-36 h-8 text-xs"
                            data-testid="select-ticket-status"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(
                              [
                                "open",
                                "in_progress",
                                "resolved",
                                "closed",
                              ] as const
                            ).map((s) => (
                              <SelectItem key={s} value={s}>
                                {STATUS_CFG[s].label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={selectedTicket.priority}
                          onValueChange={(priority) =>
                            applyAction({ priority })
                          }
                        >
                          <SelectTrigger
                            className="w-28 h-8 text-xs"
                            data-testid="select-ticket-priority"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">
                              {t("admin_dashboard.priority_low", "Low")}
                            </SelectItem>
                            <SelectItem value="medium">
                              {t(
                                "admin_dashboard.priority_medium",
                                "Medium",
                              )}
                            </SelectItem>
                            <SelectItem value="high">
                              {t(
                                "admin_dashboard.priority_high",
                                "High",
                              )}
                            </SelectItem>
                            <SelectItem value="urgent">
                              {t(
                                "admin_dashboard.priority_urgent",
                                "Urgent",
                              )}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardHeader>
                );
              })()}

              <CardContent className="p-0">
                <div className="p-5 bg-muted/20 border-b">
                  <div className="flex items-center gap-2 mb-1.5">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t(
                        "admin_dashboard.original_request",
                        "Original request",
                      )}
                    </p>
                  </div>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {selectedTicket.description}
                  </p>
                  {selectedTicket.location && (
                    <p className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {selectedTicket.location}
                    </p>
                  )}
                </div>

                <ScrollArea className="h-[330px] p-5">
                  <div className="space-y-4">
                    {(ticketMessages ?? []).length === 0 ? (
                      <div className="text-center py-10 text-muted-foreground space-y-1">
                        <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/30" />
                        <p className="text-sm">
                          {t(
                            "admin_dashboard.no_messages",
                            "No replies yet.",
                          )}
                        </p>
                        <p className="text-xs">
                          {t(
                            "admin_dashboard.start_conversation",
                            "Send the first reply to start the conversation.",
                          )}
                        </p>
                      </div>
                    ) : (
                      (ticketMessages ?? []).map((msg: any) => {
                        const isStaff = msg.sender?.role === "admin";
                        const senderName = msg.sender
                          ? `${msg.sender.firstName || ""} ${msg.sender.lastName || ""}`.trim() ||
                            msg.sender.email ||
                            t("admin_dashboard.staff", "Staff")
                          : t("admin_dashboard.user", "User");
                        if (msg.isInternal) {
                          return (
                            <div
                              key={msg.id}
                              className="flex gap-2.5"
                              data-testid={`message-${msg.id}`}
                            >
                              <TicketAvatar
                                name={senderName}
                                seed={msg.senderId || msg.id}
                                size={28}
                              />
                              <div className="flex-1 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300"
                                  >
                                    <Lock className="h-2.5 w-2.5 mr-1" />
                                    {t(
                                      "admin_dashboard.internal_note",
                                      "Internal note",
                                    )}
                                  </Badge>
                                  <span className="text-xs font-semibold">
                                    {senderName}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground ml-auto">
                                    {formatDateTime(msg.createdAt)}
                                  </span>
                                </div>
                                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                                  {msg.message}
                                </p>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div
                            key={msg.id}
                            className={`flex gap-2.5 ${isStaff ? "flex-row-reverse" : ""}`}
                            data-testid={`message-${msg.id}`}
                          >
                            <TicketAvatar
                              name={senderName}
                              seed={msg.senderId || msg.id}
                              size={32}
                            />
                            <div
                              className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                                isStaff
                                  ? "bg-primary text-primary-foreground rounded-br-sm"
                                  : "bg-muted rounded-bl-sm"
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold">
                                  {senderName}
                                  {isStaff
                                    ? ` · ${t("admin_dashboard.staff", "Staff")}`
                                    : ""}
                                </span>
                                <span
                                  className={`text-[10px] ${isStaff ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                                >
                                  {formatDateTime(msg.createdAt)}
                                </span>
                              </div>
                              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                                {msg.message}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>

                {selectedTicket.status === "closed" ? (
                  <div className="border-t p-4 flex items-center justify-between gap-3 bg-muted/20">
                    <p className="text-sm text-muted-foreground">
                      {t(
                        "admin_dashboard.ticket_closed_notice",
                        "This ticket is closed. Reopen it to continue the conversation.",
                      )}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => applyAction({ status: "open" })}
                      data-testid="button-reopen-from-footer"
                    >
                      <RotateCcw className="h-4 w-4 mr-1.5" />
                      {t("admin_dashboard.reopen", "Reopen")}
                    </Button>
                  </div>
                ) : (
                  <form
                    onSubmit={sendReply}
                    className="border-t p-4 space-y-2 bg-background"
                  >
                    <Textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder={
                        isInternalNote
                          ? t(
                              "admin_dashboard.internal_placeholder",
                              "Add an internal note (only staff can see this)...",
                            )
                          : t(
                              "admin_dashboard.reply_placeholder",
                              "Reply to the user...",
                            )
                      }
                      rows={3}
                      className={`resize-none ${isInternalNote ? "border-amber-300 dark:border-amber-700 focus-visible:ring-amber-500/40" : ""}`}
                      data-testid="textarea-ticket-reply"
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === "Enter")
                          sendReply(e as any);
                      }}
                    />
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={isInternalNote}
                          onCheckedChange={(v) =>
                            setIsInternalNote(!!v)
                          }
                          data-testid="checkbox-internal-note"
                        />
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                        {t(
                          "admin_dashboard.mark_internal",
                          "Internal note (hidden from user)",
                        )}
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="hidden md:inline text-[11px] text-muted-foreground">
                          {t(
                            "admin_dashboard.send_hint",
                            "⌘/Ctrl + Enter to send",
                          )}
                        </span>
                        <Button
                          type="submit"
                          disabled={
                            !reply.trim() ||
                            sendMessageMutation.isPending
                          }
                          data-testid="button-send-reply"
                        >
                          {sendMessageMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Send className="h-4 w-4 mr-2" />
                              {isInternalNote
                                ? t(
                                    "admin_dashboard.add_note",
                                    "Add note",
                                  )
                                : t(
                                    "admin_dashboard.send_reply",
                                    "Send reply",
                                  )}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </form>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
