import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Users, Calendar, Trash2, Eye, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type GroupSession = {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  maxParticipants: number;
  pricePerUser: string;
  status: "scheduled" | "live" | "completed" | "cancelled";
  meetingLink: string | null;
  participantCount: number;
};

type Participant = {
  id: string;
  userId: string;
  paymentStatus: string;
  attendanceStatus: "registered" | "joined" | "no_show";
  amountPaid: string;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
};

const statusBadge: Record<string, { label: string; cls: string }> = {
  scheduled: { label: "Scheduled", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200" },
  live: { label: "Live", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" },
  completed: { label: "Completed", cls: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200" },
  cancelled: { label: "Cancelled", cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
};

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function GroupSessionsPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const list = useQuery<GroupSession[]>({ queryKey: ["/api/provider/group-sessions"] });

  // Default the create-form times to start in 1 hour, last 1 hour.
  const startDefault = new Date(Date.now() + 60 * 60 * 1000);
  const endDefault = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const [form, setForm] = useState({
    title: "",
    description: "",
    startTime: toLocalInput(startDefault),
    endTime: toLocalInput(endDefault),
    maxParticipants: 10,
    pricePerUser: "0",
    meetingLink: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        description: form.description || undefined,
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
        maxParticipants: Number(form.maxParticipants),
        pricePerUser: String(form.pricePerUser),
        meetingLink: form.meetingLink || undefined,
      };
      return apiRequest("POST", "/api/provider/group-sessions", payload);
    },
    onSuccess: () => {
      toast({ title: t("group.created", "Session created") });
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/provider/group-sessions"] });
    },
    onError: (e: any) => toast({ title: t("group.create_failed", "Could not create"), description: e?.message, variant: "destructive" }),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/provider/group-sessions/${id}/cancel`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: t("group.cancelled", "Session cancelled"),
        description: t("group.refunded", "{{n}} participant(s) refunded", { n: data?.refundedCount ?? 0 }),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/group-sessions"] });
      if (detailId) queryClient.invalidateQueries({ queryKey: ["/api/provider/group-sessions", detailId] });
    },
    onError: (e: any) => toast({ title: t("group.cancel_failed", "Could not cancel"), description: e?.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {t("group.title", "Group Sessions")}
          </CardTitle>
          <CardDescription>
            {t("group.desc", "Run group therapy or workshops. Patients book a seat and pay from their wallet; cancelling a session refunds everyone automatically.")}
          </CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-group-session">
              <Plus className="h-4 w-4 mr-1" /> {t("group.new", "New session")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("group.new", "New session")}</DialogTitle>
              <DialogDescription>{t("group.new_desc", "Schedule a group session for your patients.")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="space-y-1">
                <Label htmlFor="gs-title">{t("group.f_title", "Title")}</Label>
                <Input id="gs-title" data-testid="input-group-title"
                  value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="gs-desc">{t("group.f_desc", "Description")}</Label>
                <Textarea id="gs-desc" rows={3} data-testid="input-group-description"
                  value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="gs-start">{t("group.f_start", "Start")}</Label>
                  <Input id="gs-start" type="datetime-local" data-testid="input-group-start"
                    value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="gs-end">{t("group.f_end", "End")}</Label>
                  <Input id="gs-end" type="datetime-local" data-testid="input-group-end"
                    value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="gs-cap">{t("group.f_cap", "Max participants")}</Label>
                  <Input id="gs-cap" type="number" min={1} data-testid="input-group-capacity"
                    value={form.maxParticipants}
                    onChange={(e) => setForm({ ...form, maxParticipants: Number(e.target.value || 0) })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="gs-price">{t("group.f_price", "Price per seat")}</Label>
                  <Input id="gs-price" type="number" min={0} step="0.01" data-testid="input-group-price"
                    value={form.pricePerUser}
                    onChange={(e) => setForm({ ...form, pricePerUser: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="gs-link">{t("group.f_link", "Meeting link (optional)")}</Label>
                <Input id="gs-link" data-testid="input-group-link" placeholder="https://…"
                  value={form.meetingLink} onChange={(e) => setForm({ ...form, meetingLink: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel", "Cancel")}</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending || !form.title}
                data-testid="button-save-group-session">
                {create.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {t("common.create", "Create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {list.isLoading ? (
          <div className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</div>
        ) : !list.data || list.data.length === 0 ? (
          <div className="text-sm text-muted-foreground" data-testid="text-no-group-sessions">
            {t("group.empty", "No group sessions yet.")}
          </div>
        ) : (
          <div className="space-y-3">
            {list.data.map((s) => {
              const sb = statusBadge[s.status];
              return (
                <div key={s.id}
                  className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 border rounded-xl"
                  data-testid={`row-group-session-${s.id}`}>
                  <div className="min-w-0">
                    <div className="font-medium flex items-center gap-2">
                      {s.title}
                      <Badge className={sb.cls}>{sb.label}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(s.startTime).toLocaleString()}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {s.participantCount}/{s.maxParticipants}
                      </span>
                      <span>{Number(s.pricePerUser).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" data-testid={`button-view-group-${s.id}`}
                      onClick={() => setDetailId(s.id)}>
                      <Eye className="h-4 w-4 mr-1" /> {t("group.view", "View")}
                    </Button>
                    {s.status !== "cancelled" && s.status !== "completed" && (
                      <Button variant="destructive" size="sm" data-testid={`button-cancel-group-${s.id}`}
                        disabled={cancel.isPending}
                        onClick={() => {
                          if (window.confirm(t("group.confirm_cancel", "Cancel this session and refund every paid participant?"))) {
                            cancel.mutate(s.id);
                          }
                        }}>
                        <Trash2 className="h-4 w-4 mr-1" /> {t("group.cancel", "Cancel & refund")}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <GroupSessionDetailDialog
        sessionId={detailId}
        onClose={() => setDetailId(null)}
      />
    </Card>
  );
}

function GroupSessionDetailDialog({ sessionId, onClose }: { sessionId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const enabled = !!sessionId;
  const detail = useQuery<{ session: GroupSession; participants: Participant[] }>({
    queryKey: ["/api/provider/group-sessions", sessionId],
    enabled,
  });
  const setAttendance = useMutation({
    mutationFn: async (args: { participantId: string; attendanceStatus: string }) => {
      return apiRequest("PATCH", `/api/provider/group-sessions/${sessionId}/participants/${args.participantId}`, {
        attendanceStatus: args.attendanceStatus,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/group-sessions", sessionId] });
    },
    onError: (e: any) => toast({ title: t("group.attendance_failed", "Could not save"), description: e?.message, variant: "destructive" }),
  });
  return (
    <Dialog open={enabled} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{detail.data?.session.title || t("group.detail", "Session")}</DialogTitle>
          <DialogDescription>
            {detail.data?.session && (
              <>
                {new Date(detail.data.session.startTime).toLocaleString()} —{" "}
                {new Date(detail.data.session.endTime).toLocaleString()}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {!detail.data ? (
          <div className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</div>
        ) : detail.data.participants.length === 0 ? (
          <div className="text-sm text-muted-foreground" data-testid="text-no-group-participants">
            {t("group.no_participants", "No one has booked yet.")}
          </div>
        ) : (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {detail.data.participants.map((p) => (
              <div key={p.id}
                className="flex items-center justify-between gap-3 p-2 border rounded-lg"
                data-testid={`row-group-participant-${p.id}`}>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {p.userFirstName || p.userLastName ? `${p.userFirstName ?? ""} ${p.userLastName ?? ""}`.trim() : p.userEmail}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.userEmail} · {p.paymentStatus} · {Number(p.amountPaid).toFixed(2)}
                  </div>
                </div>
                <Select
                  value={p.attendanceStatus}
                  onValueChange={(v) => setAttendance.mutate({ participantId: p.id, attendanceStatus: v })}
                  disabled={p.paymentStatus === "refunded"}
                >
                  <SelectTrigger className="w-36" data-testid={`select-attendance-${p.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="registered">{t("group.att_registered", "Registered")}</SelectItem>
                    <SelectItem value="joined">{t("group.att_joined", "Joined")}</SelectItem>
                    <SelectItem value="no_show">{t("group.att_no_show", "No-show")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
