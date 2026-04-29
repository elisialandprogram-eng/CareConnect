import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import { Bell, Calendar, Clock, X } from "lucide-react";
import { Link } from "wouter";

type WaitlistRow = {
  id: string;
  providerId: string;
  preferredDate: string | null;
  preferredStartTime: string | null;
  preferredEndTime: string | null;
  status: "active" | "notified" | "fulfilled" | "cancelled" | "expired";
  notes: string | null;
  notifiedAt: string | null;
  createdAt: string;
  provider: { id: string; businessName: string } | null;
};

const statusBadge: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Waiting", variant: "secondary" },
  notified: { label: "Slot available!", variant: "default" },
  fulfilled: { label: "Booked", variant: "outline" },
  cancelled: { label: "Cancelled", variant: "outline" },
  expired: { label: "Expired", variant: "outline" },
};

export default function WaitlistPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<WaitlistRow[]>({
    queryKey: ["/api/waitlist/me"],
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/waitlist/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/waitlist/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/waitlist/me"] });
      toast({ title: "Removed from waitlist" });
    },
    onError: () => toast({ title: "Couldn't leave waitlist", variant: "destructive" }),
  });

  const active = (data || []).filter((r) => r.status === "active" || r.status === "notified");
  const history = (data || []).filter((r) => r.status !== "active" && r.status !== "notified");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="heading-waitlist">
            <Bell className="h-7 w-7 text-primary" />
            My waitlist
          </h1>
          <p className="text-muted-foreground">
            We'll notify you the moment a slot opens up with a provider you're waiting for.
          </p>
        </div>

        {/* Active */}
        <Card>
          <CardHeader>
            <CardTitle>Active</CardTitle>
            <CardDescription>You'll get an in-app and email notification when a slot frees up.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : active.length === 0 ? (
              <p className="text-muted-foreground text-sm py-6 text-center" data-testid="text-no-active-waitlist">
                You're not waitlisted for anyone right now. Visit a provider's page and click "Join waitlist".
              </p>
            ) : (
              <div className="divide-y">
                {active.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-start justify-between gap-3 py-3"
                    data-testid={`row-waitlist-${r.id}`}
                  >
                    <div className="space-y-1 min-w-0">
                      <Link href={r.provider ? `/provider/${r.provider.id}` : "#"}>
                        <a className="font-semibold hover-elevate inline-block">
                          {r.provider?.businessName || "Provider"}
                        </a>
                      </Link>
                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                        {r.preferredDate && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {r.preferredDate}
                          </span>
                        )}
                        {(r.preferredStartTime || r.preferredEndTime) && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {r.preferredStartTime || "—"} – {r.preferredEndTime || "—"}
                          </span>
                        )}
                        <span>Joined {new Date(r.createdAt).toLocaleDateString()}</span>
                      </div>
                      {r.notes && <p className="text-xs italic text-muted-foreground">"{r.notes}"</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={statusBadge[r.status]?.variant || "secondary"}>
                        {statusBadge[r.status]?.label || r.status}
                      </Badge>
                      {r.status === "notified" && r.provider && (
                        <Link href={`/provider/${r.provider.id}`}>
                          <Button size="sm" data-testid={`button-book-now-${r.id}`}>Book now</Button>
                        </Link>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancelMutation.mutate(r.id)}
                        disabled={cancelMutation.isPending}
                        data-testid={`button-leave-waitlist-${r.id}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* History */}
        {history.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {history.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <span className="font-medium">{r.provider?.businessName || "Provider"}</span>
                      <span className="text-muted-foreground ml-2">
                        {r.preferredDate || "any date"}
                      </span>
                    </div>
                    <Badge variant={statusBadge[r.status]?.variant || "outline"}>
                      {statusBadge[r.status]?.label || r.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
      <Footer />
    </div>
  );
}
