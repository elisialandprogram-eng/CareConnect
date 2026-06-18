import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { QK } from "@/lib/query-keys";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { formatDate } from "@/lib/datetime";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/hooks/use-page-title";
import {
  Star, MessageSquare, Clock, CheckCircle2, AlertCircle, ChevronRight, PlusCircle,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────── */
interface MyReview {
  id: string;
  appointment_id: string;
  provider_id: string;
  rating: number;
  comment: string | null;
  reply: string | null;
  created_at: string;
  scheduled_at: string;
  visit_type: string;
  provider_first_name: string;
  provider_last_name: string;
  clinic_name: string | null;
  provider_type: string;
}

interface PendingReview {
  id: string;
  scheduledAt?: string;
  scheduled_at?: string;
  visitType?: string;
  visit_type?: string;
  provider?: { firstName?: string; lastName?: string };
  providerFirstName?: string;
  providerLastName?: string;
  provider_first_name?: string;
  provider_last_name?: string;
  hasReview?: boolean;
}

/* ── Star renderer ──────────────────────────────────────────────────── */
function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-4 w-4 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

/* ── Main ───────────────────────────────────────────────────────────── */
export default function MyReviewsPage() {
  usePageTitle("My Reviews | Golden Life");
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"submitted" | "pending">("submitted");

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [authLoading, user, navigate]);

  const { data: submitted = [], isLoading: reviewsLoading } = useQuery<MyReview[]>({
    queryKey: ["/api/reviews/mine"],
    enabled: !!user,
  });

  const { data: appointments = [], isLoading: apptLoading } = useQuery<PendingReview[]>({
    queryKey: QK.patientAppointments(),
    enabled: !!user,
  });

  /* Completed appointments without a review */
  const pending = useMemo<PendingReview[]>(() => {
    const reviewedIds = new Set(submitted.map((r) => r.appointment_id));
    return (appointments as any[])
      .filter((a: any) => a.status === "completed" && !reviewedIds.has(a.id));
  }, [appointments, submitted]);

  const isLoading = authLoading || reviewsLoading || apptLoading;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        <PageBreadcrumbs
          items={[
            { label: "Dashboard", href: "/patient/dashboard" },
            { label: "My Reviews" },
          ]}
        />

        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-md">
            <Star className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">My Reviews</h1>
            <p className="text-sm text-muted-foreground">Track your submitted and pending feedback</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2 mb-6">
          {[
            { key: "submitted" as const, label: "Submitted", count: submitted.length },
            { key: "pending" as const, label: "Pending", count: pending.length },
          ].map(({ key, label, count }) => (
            <Button
              key={key}
              variant={tab === key ? "default" : "outline"}
              size="sm"
              onClick={() => setTab(key)}
              data-testid={`tab-reviews-${key}`}
              className="gap-2"
            >
              {label}
              {count > 0 && (
                <Badge
                  variant={tab === key ? "secondary" : "outline"}
                  className="h-5 min-w-[20px] px-1 text-xs"
                >
                  {count}
                </Badge>
              )}
            </Button>
          ))}
        </div>

        {/* ── Submitted reviews ─────────────────────────────────────── */}
        {tab === "submitted" && (
          <>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
              </div>
            ) : submitted.length === 0 ? (
              <Card className="p-12 text-center">
                <Star className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium text-muted-foreground">No reviews submitted yet</p>
                {pending.length > 0 && (
                  <Button variant="outline" className="mt-4" onClick={() => setTab("pending")}>
                    View {pending.length} pending review{pending.length > 1 ? "s" : ""}
                  </Button>
                )}
              </Card>
            ) : (
              <div className="space-y-4">
                {submitted.map((r) => (
                  <Card key={r.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <StarRow rating={r.rating} />
                            <span className="text-sm font-bold text-amber-600">{r.rating}/5</span>
                          </div>
                          <p className="font-semibold text-sm">
                            {r.provider_first_name} {r.provider_last_name}
                            {r.clinic_name && <span className="text-muted-foreground font-normal"> · {r.clinic_name}</span>}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize mt-0.5">
                            {r.visit_type?.replace("_", " ")} visit · {formatDate(r.scheduled_at)}
                          </p>
                          {r.comment && (
                            <p className="text-sm text-muted-foreground mt-2 leading-relaxed line-clamp-3">
                              "{r.comment}"
                            </p>
                          )}
                          {r.reply && (
                            <div className="mt-3 pl-3 border-l-2 border-primary/30">
                              <p className="text-xs font-medium text-primary mb-0.5">Provider's reply</p>
                              <p className="text-xs text-muted-foreground leading-relaxed">{r.reply}</p>
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xs text-muted-foreground">{formatDate(r.created_at)}</p>
                          {r.reply ? (
                            <Badge variant="outline" className="mt-2 text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Replied
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="mt-2 text-[10px] text-muted-foreground">
                              <Clock className="h-3 w-3 mr-1" />
                              Awaiting reply
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Pending reviews ──────────────────────────────────────── */}
        {tab === "pending" && (
          <>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
              </div>
            ) : pending.length === 0 ? (
              <Card className="p-12 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                <p className="font-medium">All caught up!</p>
                <p className="text-sm text-muted-foreground mt-1">You have no pending reviews.</p>
              </Card>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground mb-2">
                  Your feedback helps other patients choose the right care.
                </p>
                {pending.map((a: any) => {
                  const providerName = a.provider
                    ? `${a.provider.firstName ?? ""} ${a.provider.lastName ?? ""}`.trim()
                    : [a.providerFirstName, a.providerLastName, a.provider_first_name, a.provider_last_name]
                        .filter(Boolean).join(" ") || "Provider";
                  const apptDate = a.scheduledAt ?? a.scheduled_at ?? "";
                  return (
                    <Card key={a.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm">{providerName}</p>
                          <p className="text-xs text-muted-foreground capitalize mt-0.5">
                            {(a.visitType ?? a.visit_type ?? "").replace("_", " ")} visit
                            {apptDate ? ` · ${formatDate(apptDate)}` : ""}
                          </p>
                          <div className="flex gap-0.5 mt-2">
                            {[1,2,3,4,5].map(n => (
                              <Star key={n} className="h-4 w-4 text-muted-foreground/30" />
                            ))}
                          </div>
                        </div>
                        <Link href={`/review/${a.id}`}>
                          <Button size="sm" className="gap-1.5 shrink-0" data-testid={`btn-write-review-${a.id}`}>
                            <PlusCircle className="h-4 w-4" />
                            Write Review
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
