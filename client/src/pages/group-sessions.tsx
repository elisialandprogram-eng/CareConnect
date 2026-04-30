import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Users, Loader2, Video } from "lucide-react";
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

type MyBooking = {
  id: string;
  paymentStatus: string;
  attendanceStatus: string;
  amountPaid: string;
  session: GroupSession;
};

const statusBadge: Record<string, { label: string; cls: string }> = {
  scheduled: { label: "Scheduled", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200" },
  live: { label: "Live now", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" },
  completed: { label: "Completed", cls: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200" },
  cancelled: { label: "Cancelled", cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
};

export default function GroupSessionsPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container max-w-5xl py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            {t("group_page.title", "Group Sessions")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("group_page.desc", "Join group therapy and workshops led by providers in your country. Pay from your wallet — full refund if the session is cancelled.")}
          </p>
        </div>
        <Tabs defaultValue="browse">
          <TabsList>
            <TabsTrigger value="browse" data-testid="tab-browse-groups">
              {t("group_page.browse", "Browse")}
            </TabsTrigger>
            <TabsTrigger value="mine" data-testid="tab-my-groups">
              {t("group_page.mine", "My bookings")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="browse" className="mt-4">
            <BrowseList />
          </TabsContent>
          <TabsContent value="mine" className="mt-4">
            <MyBookingsList />
          </TabsContent>
        </Tabs>
      </main>
      <Footer />
    </div>
  );
}

function BrowseList() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const list = useQuery<GroupSession[]>({ queryKey: ["/api/group-sessions"] });
  const book = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("POST", `/api/group-sessions/${id}/book`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: t("group_page.booked", "Booked!") });
      queryClient.invalidateQueries({ queryKey: ["/api/group-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/group-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
    },
    onError: (e: any) => toast({ title: t("group_page.book_failed", "Could not book"), description: e?.message, variant: "destructive" }),
  });
  if (list.isLoading) {
    return <div className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</div>;
  }
  if (!list.data || list.data.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground" data-testid="text-no-sessions">
          {t("group_page.empty", "No sessions available right now.")}
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {list.data.map((s) => {
        const sb = statusBadge[s.status];
        const seatsLeft = Math.max(0, s.maxParticipants - s.participantCount);
        const full = seatsLeft <= 0;
        return (
          <Card key={s.id} data-testid={`card-group-session-${s.id}`}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg">{s.title}</CardTitle>
                <Badge className={sb.cls}>{sb.label}</Badge>
              </div>
              {s.description && (
                <CardDescription className="line-clamp-3">{s.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground space-y-1">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {new Date(s.startTime).toLocaleString()}
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {seatsLeft} {t("group_page.seats_left", "seats left")} · {s.maxParticipants} {t("group_page.total", "total")}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">{Number(s.pricePerUser).toFixed(2)}</div>
                <Button
                  data-testid={`button-book-group-${s.id}`}
                  disabled={full || book.isPending}
                  onClick={() => book.mutate(s.id)}
                >
                  {book.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  {full ? t("group_page.full", "Full") : t("group_page.book", "Book seat")}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function MyBookingsList() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const list = useQuery<MyBooking[]>({ queryKey: ["/api/me/group-sessions"] });
  const join = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("POST", `/api/group-sessions/${id}/join`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/group-sessions"] });
    },
    onError: (e: any) => toast({ title: t("group_page.join_failed", "Could not join"), description: e?.message, variant: "destructive" }),
  });
  if (list.isLoading) {
    return <div className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</div>;
  }
  if (!list.data || list.data.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground" data-testid="text-no-my-sessions">
          {t("group_page.no_mine", "You haven't booked any group sessions yet.")}
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {list.data.map((b) => {
        const sb = statusBadge[b.session.status];
        const canJoin = (b.session.status === "scheduled" || b.session.status === "live")
          && b.paymentStatus === "completed"
          && Date.now() >= new Date(b.session.startTime).getTime() - 15 * 60 * 1000
          && Date.now() <= new Date(b.session.endTime).getTime() + 30 * 60 * 1000;
        return (
          <Card key={b.id} data-testid={`row-my-group-${b.id}`}>
            <CardContent className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-2">
                  {b.session.title}
                  <Badge className={sb.cls}>{sb.label}</Badge>
                  {b.paymentStatus === "refunded" && (
                    <Badge variant="secondary">{t("group_page.refunded", "Refunded")}</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 space-x-3">
                  <span>{new Date(b.session.startTime).toLocaleString()}</span>
                  <span>· {Number(b.amountPaid).toFixed(2)}</span>
                  <span>· {t("group_page.attendance", "Attendance")}: {b.attendanceStatus}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {b.session.meetingLink && canJoin && (
                  <Button asChild variant="outline" data-testid={`button-open-meeting-${b.id}`}>
                    <a href={b.session.meetingLink} target="_blank" rel="noreferrer"
                       onClick={() => join.mutate(b.session.id)}>
                      <Video className="h-4 w-4 mr-1" /> {t("group_page.open_meeting", "Open meeting")}
                    </a>
                  </Button>
                )}
                {!b.session.meetingLink && canJoin && (
                  <Button data-testid={`button-mark-joined-${b.id}`}
                    disabled={join.isPending}
                    onClick={() => join.mutate(b.session.id)}>
                    {t("group_page.mark_joined", "Mark joined")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
