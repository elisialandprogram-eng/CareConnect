import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth";
import { QK } from "@/lib/query-keys";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { apiRequest } from "@/lib/queryClient";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/hooks/use-page-title";
import { useToast } from "@/hooks/use-toast";
import {
  Activity, Search, Filter, Calendar, Pill, FileText, Stethoscope,
  ChevronRight, AlertCircle, CheckCircle2, Clock, Video, Home, Building2,
  FlaskConical, Syringe, ShieldAlert, ClipboardList, HeartPulse, ExternalLink,
} from "lucide-react";
import { useEffect } from "react";

/* ── Types ─────────────────────────────────────────────────────────── */

type TimelineEventType = "appointment" | "prescription" | "medical_history" | "outcome";

interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  date: string;
  title: string;
  subtitle: string;
  status?: string;
  meta?: string;
  linkTo?: string;
  raw: Record<string, unknown>;
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function visitIcon(visitType: string) {
  if (visitType === "online") return <Video className="h-4 w-4 text-violet-500" />;
  if (visitType === "home")   return <Home  className="h-4 w-4 text-emerald-500" />;
  return <Building2 className="h-4 w-4 text-sky-500" />;
}

function historyTypeIcon(t: string) {
  switch (t) {
    case "allergy":    return <ShieldAlert  className="h-4 w-4 text-rose-500" />;
    case "diagnosis":  return <Stethoscope  className="h-4 w-4 text-sky-500" />;
    case "lab_result": return <FlaskConical className="h-4 w-4 text-violet-500" />;
    case "vaccination":return <Syringe      className="h-4 w-4 text-emerald-500" />;
    case "procedure":  return <ClipboardList className="h-4 w-4 text-amber-500" />;
    default:           return <FileText      className="h-4 w-4 text-muted-foreground" />;
  }
}

const TYPE_LABELS: Record<TimelineEventType, string> = {
  appointment: "Appointment",
  prescription: "Prescription",
  medical_history: "Medical History",
  outcome: "Clinical Outcome",
};

const TYPE_COLORS: Record<TimelineEventType, string> = {
  appointment:     "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  prescription:    "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  medical_history: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  outcome:         "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
};

/* ── Main component ─────────────────────────────────────────────────── */

export default function HealthRecordsPage() {
  usePageTitle("Health Records | Golden Life");
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const { toast } = useToast();

  const memberId = new URLSearchParams(searchStr).get("memberId") ?? null;

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | TimelineEventType>("all");

  /* Auth guard */
  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [authLoading, user, navigate]);

  /* ── Family member info (when viewing a member's records) ──── */
  const { data: familyMembers = [] } = useQuery<any[]>({
    queryKey: ["/api/family-members"],
    enabled: !!user && !!memberId,
  });
  const viewingMember = memberId
    ? (familyMembers as any[]).find((m) => m.id === memberId)
    : null;

  /* ── Data queries ─────────────────────────────────────────────── */

  const { data: ownAppointments = [], isLoading: ownApptLoading } = useQuery<any[]>({
    queryKey: QK.patientAppointments(),
    enabled: !!user && !memberId,
  });

  const { data: memberAppointments = [], isLoading: memberApptLoading } = useQuery<any[]>({
    queryKey: ["/api/family-members", memberId, "appointments"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/family-members/${memberId}/appointments`);
      return res.json();
    },
    enabled: !!user && !!memberId,
  });

  const appointments = memberId ? memberAppointments : ownAppointments;
  const apptLoading = memberId ? memberApptLoading : ownApptLoading;

  const { data: prescriptions = [], isLoading: rxLoading } = useQuery<any[]>({
    queryKey: QK.patientPrescriptions(user?.id),
    enabled: !!user?.id && !memberId,
  });

  const { data: medHistory = [], isLoading: mhLoading } = useQuery<any[]>({
    queryKey: QK.medicalHistory(user?.id ?? ""),
    enabled: !!user?.id && !memberId,
  });

  /* ── Analytics tracking ────────────────────────────────────────── */
  useEffect(() => {
    if (user) {
      apiRequest("POST", "/api/analytics/track", {
        event: "health_record_viewed",
        properties: { userId: user.id },
      }).catch(() => {});
    }
  }, [user?.id]);

  /* ── Build unified timeline ─────────────────────────────────────── */
  const timeline = useMemo<TimelineEvent[]>(() => {
    const events: TimelineEvent[] = [];

    for (const a of appointments) {
      const providerName = a.provider
        ? `${a.provider.firstName ?? ""} ${a.provider.lastName ?? ""}`.trim()
        : "Provider";

      events.push({
        id: `appt-${a.id}`,
        type: "appointment",
        date: a.scheduledAt ?? a.scheduled_at ?? "",
        title: `${a.visitType?.charAt(0).toUpperCase()}${a.visitType?.slice(1) ?? ""} Appointment`,
        subtitle: `with ${providerName}`,
        status: a.status,
        meta: a.visitType,
        linkTo: `/appointments/${a.id}`,
        raw: a,
      });

      /* Outcome as a separate event if present */
      if (a.outcomeNote || a.outcome_note) {
        events.push({
          id: `outcome-${a.id}`,
          type: "outcome",
          date: a.updatedAt ?? a.updated_at ?? a.scheduledAt ?? a.scheduled_at ?? "",
          title: "Clinical Outcome Note",
          subtitle: `${providerName} — ${a.outcomeNote ?? a.outcome_note}`,
          meta: a.followUpRecommended || a.follow_up_recommended ? "Follow-up recommended" : undefined,
          linkTo: `/appointments/${a.id}`,
          raw: a,
        });
      }
    }

    for (const rx of prescriptions) {
      events.push({
        id: `rx-${rx.id}`,
        type: "prescription",
        date: rx.createdAt ?? rx.created_at ?? "",
        title: rx.medicationName ?? rx.medication_name ?? "Medication",
        subtitle: `${rx.dosage ?? ""}${rx.frequency ? ` · ${rx.frequency}` : ""}${rx.duration ? ` · ${rx.duration}` : ""}`,
        status: rx.isActive === false || rx.is_active === false ? "inactive" : "active",
        raw: rx,
      });
    }

    for (const mh of medHistory) {
      events.push({
        id: `mh-${mh.id}`,
        type: "medical_history",
        date: mh.recordedAt ?? mh.recorded_at ?? mh.createdAt ?? mh.created_at ?? "",
        title: mh.title ?? mh.description ?? "Medical Record",
        subtitle: mh.type
          ? `${mh.type.charAt(0).toUpperCase()}${mh.type.slice(1).replace(/_/g, " ")}`
          : "Record",
        meta: mh.description,
        raw: mh,
      });
    }

    /* Sort newest first */
    return events.sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    });
  }, [appointments, prescriptions, medHistory]);

  /* ── Filtered timeline ──────────────────────────────────────────── */
  const filtered = useMemo(() => {
    return timeline.filter((ev) => {
      if (typeFilter !== "all" && ev.type !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          ev.title.toLowerCase().includes(q) ||
          ev.subtitle.toLowerCase().includes(q) ||
          (ev.meta ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [timeline, typeFilter, search]);

  const isLoading = authLoading || apptLoading || rxLoading || mhLoading;

  /* ── Summary counts ─────────────────────────────────────────────── */
  const counts = useMemo(() => ({
    appointments: appointments.length,
    prescriptions: prescriptions.length,
    medHistory: medHistory.length,
    followUps: appointments.filter((a: any) => a.followUpRecommended || a.follow_up_recommended).length,
  }), [appointments, prescriptions, medHistory]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <PageBreadcrumbs
          items={[
            { label: "Dashboard", href: "/patient/dashboard" },
            { label: "Health Records" },
          ]}
        />

        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 shadow-md">
            <HeartPulse className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Health Records</h1>
            {viewingMember ? (
              <p className="text-sm text-sky-600 dark:text-sky-400 font-medium flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" />
                Viewing records for <span className="font-bold">{viewingMember.firstName} {viewingMember.lastName}</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Your complete care history in one place</p>
            )}
          </div>
          {memberId && (
            <Link href="/health-records" className="ml-auto">
              <Button variant="outline" size="sm" data-testid="button-back-own-records">
                Back to my records
              </Button>
            </Link>
          )}
        </div>

        {/* ── Summary cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Appointments", value: counts.appointments, icon: Calendar, color: "text-sky-600" },
            { label: "Prescriptions", value: counts.prescriptions, icon: Pill, color: "text-violet-600" },
            { label: "Medical Records", value: counts.medHistory, icon: FileText, color: "text-rose-600" },
            { label: "Follow-ups", value: counts.followUps, icon: Activity, color: "text-emerald-600" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="p-3">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${color} shrink-0`} />
                <div>
                  <p className="text-2xl font-bold">{isLoading ? "—" : value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* ── Filters ───────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search records…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-health-search"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as "all" | TimelineEventType)}>
            <SelectTrigger className="sm:w-48" data-testid="select-health-type">
              <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Records</SelectItem>
              <SelectItem value="appointment">Appointments</SelectItem>
              <SelectItem value="prescription">Prescriptions</SelectItem>
              <SelectItem value="medical_history">Medical History</SelectItem>
              <SelectItem value="outcome">Clinical Outcomes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* ── Timeline ──────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-muted-foreground">No records found</p>
            {search && (
              <Button variant="ghost" className="mt-3" onClick={() => setSearch("")}>
                Clear search
              </Button>
            )}
          </Card>
        ) : (
          <div className="relative space-y-3">
            {/* Vertical timeline line */}
            <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

            {filtered.map((ev) => (
              <div key={ev.id} className="relative flex gap-4 pl-12">
                {/* Timeline dot */}
                <div className="absolute left-3.5 -translate-x-1/2 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background bg-primary/80 ring-2 ring-primary/20 shadow-sm mt-5" />

                <Card className="flex-1 hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Type icon */}
                        <div className="mt-0.5 shrink-0">
                          {ev.type === "appointment"    && visitIcon(ev.meta ?? "")}
                          {ev.type === "prescription"   && <Pill className="h-4 w-4 text-violet-500" />}
                          {ev.type === "medical_history" && historyTypeIcon((ev.raw as any).type ?? "")}
                          {ev.type === "outcome"         && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-0.5">
                            <Badge className={`text-[10px] px-1.5 py-0 ${TYPE_COLORS[ev.type]}`} variant="outline">
                              {TYPE_LABELS[ev.type]}
                            </Badge>
                            {ev.status === "active" && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Active</Badge>
                            )}
                            {ev.status === "inactive" && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-500">Inactive</Badge>
                            )}
                            {ev.status && !["active","inactive"].includes(ev.status) && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{ev.status}</Badge>
                            )}
                          </div>
                          <p className="font-semibold text-sm truncate">{ev.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{ev.subtitle}</p>
                          {ev.meta && ev.type !== "appointment" && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ev.meta}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <p className="text-xs text-muted-foreground whitespace-nowrap">
                          {ev.date ? formatDate(ev.date) : "—"}
                        </p>
                        {ev.linkTo && (
                          <Link href={ev.linkTo}>
                            <Button variant="ghost" size="icon" className="h-7 w-7" data-testid={`btn-health-open-${ev.id}`}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        )}

        {filtered.length > 0 && (
          <p className="text-center text-xs text-muted-foreground mt-6">
            Showing {filtered.length} of {timeline.length} records
          </p>
        )}
      </main>
      <Footer />
    </div>
  );
}
