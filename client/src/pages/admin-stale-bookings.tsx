import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { ArrowLeft, ClockAlert, Loader2, RefreshCw, ShieldAlert } from "lucide-react";

interface StaleBookingItem {
  id: string;
  appointmentNumber: string | null;
  status: string;
  date: string;
  startTime: string;
  updatedAt: string | null;
  createdAt: string | null;
  totalAmount: string;
  patientName: string;
  patientEmail: string | null;
  providerName: string;
  reason: string;
}

interface StaleBookingsResponse {
  days: number;
  items: StaleBookingItem[];
}

const STATUS_TONE: Record<string, string> = {
  expired: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  cancelled_by_patient: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  cancelled_by_provider: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  no_show: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  rejected: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AdminStaleBookings() {
  const { user, isLoading: authLoading } = useAuth();
  const [days, setDays] = useState<string>("7");

  const { data, isLoading, isFetching, refetch, error } = useQuery<StaleBookingsResponse>({
    queryKey: ["/api/admin/stale-bookings", { days }],
    queryFn: async () => {
      const res = await fetch(`/api/admin/stale-bookings?days=${days}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load stale bookings");
      return res.json();
    },
    enabled: !!user && user.role === "admin",
  });

  const grouped = useMemo(() => {
    const items = data?.items ?? [];
    const expired = items.filter((i) => i.status === "expired");
    const autoCancelled = items.filter((i) => i.status !== "expired");
    return { expired, autoCancelled, total: items.length };
  }, [data]);

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-16">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-destructive" />
                Admin access required
              </CardTitle>
              <CardDescription>
                You need to be signed in as an administrator to view this page.
              </CardDescription>
            </CardHeader>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/admin">
            <Button variant="ghost" size="sm" data-testid="link-back-admin">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to admin
            </Button>
          </Link>
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-stale-title">
              <ClockAlert className="h-7 w-7 text-amber-500" />
              Stale Bookings
            </h1>
            <p className="text-muted-foreground">
              Appointments the system auto-expired or auto-cancelled. Useful for spotting providers
              who never respond or visits that never get marked completed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[140px]" data-testid="select-days">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 24 hours</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh"
              aria-label="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total auto actions</CardDescription>
              <CardTitle className="text-3xl" data-testid="stat-total">{grouped.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Auto-expired (no provider response)</CardDescription>
              <CardTitle className="text-3xl text-amber-600 dark:text-amber-400" data-testid="stat-expired">
                {grouped.expired.length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Auto-cancelled (visit lapsed)</CardDescription>
              <CardTitle className="text-3xl text-red-600 dark:text-red-400" data-testid="stat-cancelled">
                {grouped.autoCancelled.length}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>
              Showing up to 500 entries from the last {data?.days ?? days} day(s), most recent first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading…
              </div>
            ) : error ? (
              <p className="text-destructive text-sm" data-testid="text-error">
                Couldn't load stale bookings. Please try again.
              </p>
            ) : !data?.items.length ? (
              <p className="text-muted-foreground text-sm" data-testid="text-empty">
                Nothing to report — no automated cleanups in this window.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">When</th>
                      <th className="py-2 pr-3 font-medium">Booking</th>
                      <th className="py-2 pr-3 font-medium">Visit date</th>
                      <th className="py-2 pr-3 font-medium">Patient</th>
                      <th className="py-2 pr-3 font-medium">Provider</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b hover:bg-muted/40 transition-colors"
                        data-testid={`row-stale-${item.id}`}
                      >
                        <td className="py-2 pr-3 whitespace-nowrap" data-testid={`text-when-${item.id}`}>
                          {formatDateTime(item.updatedAt)}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap font-mono text-xs text-muted-foreground">
                          {item.appointmentNumber || item.id.slice(0, 8)}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {item.date} · {item.startTime}
                        </td>
                        <td className="py-2 pr-3" data-testid={`text-patient-${item.id}`}>
                          <div>{item.patientName}</div>
                          {item.patientEmail && (
                            <div className="text-xs text-muted-foreground">{item.patientEmail}</div>
                          )}
                        </td>
                        <td className="py-2 pr-3" data-testid={`text-provider-${item.id}`}>
                          {item.providerName}
                        </td>
                        <td className="py-2 pr-3">
                          <Badge
                            variant="outline"
                            className={STATUS_TONE[item.status] || ""}
                            data-testid={`badge-status-${item.id}`}
                          >
                            {item.status}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground" data-testid={`text-reason-${item.id}`}>
                          {item.reason || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
