import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Users, Pill, Target, CalendarDays, AlertCircle, Search,
  Stethoscope, MessageSquare, FileText, Loader2, ChevronRight,
  Clock,
} from "lucide-react";
import { formatDate } from "@/lib/datetime";
import { usePageTitle } from "@/hooks/use-page-title";

interface ClinicalDashboardData {
  stats: {
    activePatients: number;
    pendingFollowUps: number;
    activePrescriptions: number;
    activeTreatmentPlans: number;
  };
  recentDiagnoses: Array<{
    id: string;
    title: string;
    category: string;
    status: string;
    diagnosed_at: string;
    patient_name: string;
  }>;
  recentNotes: Array<{
    id: string;
    content: string;
    created_at: string;
    patient_name: string;
  }>;
  upcomingAppointments: Array<{
    id: string;
    start_at: string;
    status: string;
    patient_name: string;
    service_name?: string;
  }>;
}

interface SearchResult {
  id: string;
  result_type: string;
  title: string;
  subtitle?: string;
  date?: string;
}

export default function ProviderClinicalDashboard() {
  const { t } = useTranslation();
  const [searchQ, setSearchQ] = useState("");
  const [searchType, setSearchType] = useState("all");

  usePageTitle(t("clinical_dashboard.title", "Clinical Dashboard"));

  const { data, isLoading } = useQuery<ClinicalDashboardData>({
    queryKey: ["/api/provider/clinical-dashboard"],
    queryFn: () => apiRequest("GET", "/api/provider/clinical-dashboard").then((r) => r.json()),
    staleTime: 60_000,
  });

  const { data: searchResults, isLoading: searching } = useQuery<{ results: SearchResult[] }>({
    queryKey: ["/api/provider/clinical-search", searchQ, searchType],
    queryFn: () => apiRequest("GET", `/api/provider/clinical-search?q=${encodeURIComponent(searchQ)}&type=${searchType}`).then((r) => r.json()),
    enabled: searchQ.length >= 2,
    staleTime: 30_000,
  });

  const STAT_TYPE_ICON: Record<string, JSX.Element> = {
    patient:        <Users className="h-4 w-4 text-blue-500" />,
    prescription:   <Pill className="h-4 w-4 text-green-500" />,
    diagnosis:      <Stethoscope className="h-4 w-4 text-red-500" />,
    note:           <MessageSquare className="h-4 w-4 text-amber-500" />,
    treatment_plan: <Target className="h-4 w-4 text-purple-500" />,
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
    <div className="container mx-auto px-4 py-6 max-w-5xl space-y-6" data-testid="page-clinical-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-primary" />
            {t("clinical_dashboard.heading", "Clinical Dashboard")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("clinical_dashboard.subtitle", "Your active patients, pending follow-ups, and recent clinical activity.")}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/provider/dashboard">{t("common.back", "← Back to Dashboard")}</Link>
        </Button>
      </div>

      {/* Stats row */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: t("clinical_dashboard.active_patients", "Active Patients"), value: data?.stats.activePatients ?? 0, icon: <Users className="h-5 w-5 text-blue-500" />, sub: t("clinical_dashboard.last_90d", "last 90 days") },
            { label: t("clinical_dashboard.pending_followups", "Pending Follow-ups"), value: data?.stats.pendingFollowUps ?? 0, icon: <CalendarDays className="h-5 w-5 text-orange-500" />, sub: t("clinical_dashboard.needs_booking", "needs booking") },
            { label: t("clinical_dashboard.active_prescriptions", "Active Prescriptions"), value: data?.stats.activePrescriptions ?? 0, icon: <Pill className="h-5 w-5 text-green-500" />, sub: t("clinical_dashboard.currently_active", "currently active") },
            { label: t("clinical_dashboard.active_plans", "Treatment Plans"), value: data?.stats.activeTreatmentPlans ?? 0, icon: <Target className="h-5 w-5 text-purple-500" />, sub: t("clinical_dashboard.in_progress", "in progress") },
          ].map((s) => (
            <Card key={s.label} data-testid={`stat-card-${s.label}`}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-2xl font-bold">{s.value}</p>
                    <p className="text-xs font-medium">{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.sub}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/50">{s.icon}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Clinical Search */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            {t("clinical_dashboard.search_title", "Clinical Search")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute start-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder={t("clinical_dashboard.search_placeholder", "Search patients, prescriptions, diagnoses, notes...")}
                className="pl-8"
                data-testid="input-clinical-search"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {["all", "patients", "prescriptions", "diagnoses", "notes"].map((type) => (
                <Button
                  key={type}
                  size="sm"
                  variant={searchType === type ? "default" : "outline"}
                  className="h-9 text-xs capitalize"
                  onClick={() => setSearchType(type)}
                  data-testid={`button-search-type-${type}`}
                >
                  {type}
                </Button>
              ))}
            </div>
          </div>

          {searchQ.length >= 2 && (
            <div className="border rounded-lg">
              {searching ? (
                <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("clinical_dashboard.searching", "Searching...")}
                </div>
              ) : !searchResults?.results.length ? (
                <div className="p-4 text-sm text-muted-foreground text-center" data-testid="text-no-search-results">
                  {t("clinical_dashboard.no_results", "No results found for")} &quot;{searchQ}&quot;
                </div>
              ) : (
                <div className="divide-y">
                  {searchResults.results.map((result) => (
                    <div key={`${result.result_type}-${result.id}`} className="flex items-center gap-3 p-3 hover:bg-muted/50" data-testid={`search-result-${result.id}`}>
                      <span className="shrink-0">{STAT_TYPE_ICON[result.result_type] ?? <FileText className="h-4 w-4 text-muted-foreground" />}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{result.title}</p>
                        {result.subtitle && <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {result.date && <span className="text-xs text-muted-foreground">{formatDate(result.date)}</span>}
                        <Badge variant="outline" className="text-[10px] capitalize py-0">{result.result_type.replace("_", " ")}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Appointments */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              {t("clinical_dashboard.upcoming_appts", "Upcoming Appointments (7 days)")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-24 rounded" />
            ) : !data?.upcomingAppointments.length ? (
              <p className="text-sm text-muted-foreground text-center py-3" data-testid="text-no-upcoming">
                {t("clinical_dashboard.no_upcoming", "No upcoming appointments.")}
              </p>
            ) : (
              <div className="space-y-2">
                {data.upcomingAppointments.map((appt) => (
                  <div key={appt.id} className="flex items-center gap-2 p-2 rounded-lg border" data-testid={`upcoming-appt-${appt.id}`}>
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{appt.patient_name}</p>
                      <p className="text-xs text-muted-foreground">{appt.service_name ?? "—"} · {formatDate(appt.start_at)}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] capitalize">{appt.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Diagnoses */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-primary" />
              {t("clinical_dashboard.recent_diagnoses", "Recent Diagnoses (30 days)")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-24 rounded" />
            ) : !data?.recentDiagnoses.length ? (
              <p className="text-sm text-muted-foreground text-center py-3" data-testid="text-no-diagnoses">
                {t("clinical_dashboard.no_diagnoses", "No recent diagnoses.")}
              </p>
            ) : (
              <div className="space-y-2">
                {data.recentDiagnoses.map((d) => (
                  <div key={d.id} className="p-2 rounded-lg border" data-testid={`recent-diagnosis-${d.id}`}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium flex-1">{d.title}</p>
                      <Badge variant="outline" className="text-[10px] capitalize py-0">{d.category}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{d.patient_name} · {formatDate(d.diagnosed_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Notes */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              {t("clinical_dashboard.recent_notes", "Recent Clinical Notes (7 days)")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-24 rounded" />
            ) : !data?.recentNotes.length ? (
              <p className="text-sm text-muted-foreground text-center py-3" data-testid="text-no-notes">
                {t("clinical_dashboard.no_notes", "No notes in the last 7 days.")}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {data.recentNotes.map((note) => (
                  <div key={note.id} className="p-3 rounded-lg border bg-muted/20" data-testid={`recent-note-${note.id}`}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-primary">{note.patient_name}</p>
                      <span className="text-xs text-muted-foreground">{formatDate(note.created_at)}</span>
                    </div>
                    <p className="text-sm line-clamp-2 text-muted-foreground">{note.content}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
      </main>
      <Footer />
    </div>
  );
}
